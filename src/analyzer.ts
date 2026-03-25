import { parseUnifiedDiffHunks } from "./diffParser.js";
import { GitLabClient } from "./gitlabClient.js";
import { Logger } from "./logger.js";
import {
  AnalysisResult,
  GitLabCommitDetail,
  GitLabCommitDiff,
  GitLabMergeRequest,
  GitLabMergeRequestRef,
  ParsedIssueUrl,
  RelatedIssueRef,
  ReportChunk,
  ReportCommit,
  ReportCommitFile,
  ReportLine,
  ReportMergeRequest,
} from "./types.js";

interface PreviousCommitContext {
  commitWebUrl: string | null;
  mergeRequest: GitLabMergeRequestRef | null;
  mergeRequestIssues: RelatedIssueRef[];
}

export class IssueAnalyzer {
  private readonly blameCache = new Map<string, string | null>();
  private readonly previousCommitContextCache = new Map<string, PreviousCommitContext | null>();

  constructor(private readonly client: GitLabClient, private readonly logger: Logger) {}

  async analyze(input: ParsedIssueUrl): Promise<AnalysisResult> {
    this.logger.log(`Resolving project ${input.projectPath}`);
    const project = await this.client.getProjectByPath(input.projectPath);
    this.logger.log(`Fetching issue #${input.issueIid}`);
    const issue = await this.client.getIssue(project.id, input.issueIid);

    this.logger.log("Discovering related merge requests");
    const relatedRefs = await this.client.getIssueRelatedMergeRequestRefs(project, issue);
    const mergedMrrs = await this.loadMergedMergeRequests(relatedRefs);
    this.logger.log(`Found ${mergedMrrs.length} merged related MR(s)`);

    const mergeRequests: ReportMergeRequest[] = [];
    for (const mr of mergedMrrs) {
      this.logger.log(`Analyzing MR !${mr.iid} (${mr.project_id})`);
      const commits = await this.analyzeMergeRequestCommits(mr);
      mergeRequests.push({
        mr: {
          projectId: mr.project_id,
          iid: mr.iid,
          title: mr.title,
          webUrl: mr.web_url,
        },
        mergedAt: mr.merged_at,
        commits,
      });
    }

    return {
      inputIssue: issue,
      project,
      mergeRequests,
      generatedAt: new Date().toISOString(),
    };
  }

  private async loadMergedMergeRequests(refs: GitLabMergeRequestRef[]): Promise<GitLabMergeRequest[]> {
    const merged: GitLabMergeRequest[] = [];

    for (const ref of refs) {
      try {
        const mr = await this.client.getMergeRequest(ref.projectId, ref.iid);
        if (mr.state !== "merged") {
          continue;
        }
        merged.push(mr);
      } catch {
        // Ignore MRs we cannot read.
      }
    }

    merged.sort((a, b) => {
      const left = a.merged_at ? new Date(a.merged_at).getTime() : 0;
      const right = b.merged_at ? new Date(b.merged_at).getTime() : 0;
      return right - left;
    });

    return merged;
  }

  private async analyzeMergeRequestCommits(mr: GitLabMergeRequest): Promise<ReportCommit[]> {
    const mergedCommitRef = this.resolveMergedTargetBranchCommit(mr);
    if (!mergedCommitRef) {
      this.logger.log(`MR !${mr.iid}: no merge target-branch commit SHA available`);
      return [];
    }

    this.logger.log(
      `MR !${mr.iid}: using target-branch merge commit ${mergedCommitRef.sha.slice(0, 12)} (${mergedCommitRef.source})`,
    );

    const detail = await this.safeGetCommitDetail(mr.project_id, mergedCommitRef.sha);
    if (!detail) {
      this.logger.log(`MR !${mr.iid}: failed to load commit ${mergedCommitRef.sha}`);
      return [];
    }

    const files = await this.analyzeCommitFiles(mr.project_id, detail);
    return [{
      sha: detail.id,
      shortSha: detail.short_id || detail.id.slice(0, 12),
      title: detail.title,
      message: detail.message,
      committedAt: detail.committed_date,
      webUrl: detail.web_url,
      parentIds: detail.parent_ids ?? [],
      files,
    }];
  }

  private resolveMergedTargetBranchCommit(mr: GitLabMergeRequest): { sha: string; source: string } | null {
    if (mr.merge_commit_sha) {
      return { sha: mr.merge_commit_sha, source: "merge_commit_sha" };
    }

    if (mr.squash_commit_sha) {
      return { sha: mr.squash_commit_sha, source: "squash_commit_sha" };
    }

    if (mr.sha) {
      return { sha: mr.sha, source: "sha (fast-forward fallback)" };
    }

    return null;
  }

  private async analyzeCommitFiles(projectId: number, commit: GitLabCommitDetail): Promise<ReportCommitFile[]> {
    const diffs = await this.client.getCommitDiffs(projectId, commit.id);
    const files: ReportCommitFile[] = [];

    for (const diff of diffs) {
      files.push(await this.analyzeCommitFile(projectId, commit, diff));
    }

    return files;
  }

  private async analyzeCommitFile(projectId: number, commit: GitLabCommitDetail, diff: GitLabCommitDiff): Promise<ReportCommitFile> {
    const filePath = diff.new_path;
    const oldPath = diff.old_path;

    if (!diff.diff || diff.diff.trim().length === 0) {
      return { filePath, oldPath, chunks: [], skippedReason: "Binary or unavailable diff" };
    }

    const hunks = parseUnifiedDiffHunks(diff.diff);
    if (hunks.length === 0) {
      return { filePath, oldPath, chunks: [], skippedReason: "No parseable hunks" };
    }

    const postLines = await this.safeReadFileLines(projectId, filePath, commit.id);
    const parentRef = (commit.parent_ids && commit.parent_ids.length > 0) ? commit.parent_ids[0] : null;
    const preLines = parentRef ? await this.safeReadFileLines(projectId, oldPath, parentRef) : null;

    const chunks: ReportChunk[] = [];
    for (const hunk of hunks) {
      const contextBefore = this.pickContextBefore(postLines, hunk.newStart, 7);
      const contextAfter = this.pickContextAfter(postLines, hunk.newStart + hunk.newCount - 1, 7);

      const afterLines: ReportLine[] = hunk.afterLines.map((line) => ({
        lineNumber: line.lineNumber,
        text: line.lineNumber && postLines ? (postLines[line.lineNumber - 1] ?? line.text) : line.text,
      }));

      const beforeLines: ReportLine[] = [];
      for (const line of hunk.beforeLines) {
        if (!line.lineNumber || !parentRef) {
          beforeLines.push({
            lineNumber: line.lineNumber,
            text: line.text,
            previousCommitSha: null,
            unresolvedReason: "No parent commit",
          });
          continue;
        }

        const text = line.lineNumber && preLines ? (preLines[line.lineNumber - 1] ?? line.text) : line.text;
        const previousCommitSha = await this.resolvePreviousCommitForPreLine(projectId, oldPath, parentRef, line.lineNumber);
        const previousContext = previousCommitSha
          ? await this.resolvePreviousCommitContext(projectId, previousCommitSha)
          : null;

        beforeLines.push({
          lineNumber: line.lineNumber,
          text,
          previousCommitSha,
          previousCommitWebUrl: previousContext?.commitWebUrl ?? null,
          previousMergeRequest: previousContext?.mergeRequest ?? null,
          previousMergeRequestIssues: previousContext?.mergeRequestIssues ?? [],
          unresolvedReason: previousCommitSha ? undefined : "Blame did not return a commit",
        });
      }

      chunks.push({
        oldStart: hunk.oldStart,
        oldCount: hunk.oldCount,
        newStart: hunk.newStart,
        newCount: hunk.newCount,
        contextBefore,
        afterLines,
        beforeLines,
        contextAfter,
      });
    }

    return { filePath, oldPath, chunks };
  }

  private pickContextBefore(lines: string[] | null, startLine: number, radius: number): ReportLine[] {
    if (!lines) {
      return [];
    }

    const from = Math.max(1, startLine - radius);
    const to = Math.max(0, startLine - 1);
    const out: ReportLine[] = [];
    for (let lineNo = from; lineNo <= to; lineNo += 1) {
      out.push({ lineNumber: lineNo, text: lines[lineNo - 1] ?? "" });
    }
    return out;
  }

  private pickContextAfter(lines: string[] | null, endLine: number, radius: number): ReportLine[] {
    if (!lines) {
      return [];
    }

    const from = endLine + 1;
    const to = Math.min(lines.length, endLine + radius);
    const out: ReportLine[] = [];
    for (let lineNo = from; lineNo <= to; lineNo += 1) {
      out.push({ lineNumber: lineNo, text: lines[lineNo - 1] ?? "" });
    }
    return out;
  }

  private async resolvePreviousCommitForPreLine(
    projectId: number,
    filePath: string,
    parentRef: string,
    lineNumber: number,
  ): Promise<string | null> {
    const key = `${projectId}:${filePath}:${parentRef}:${lineNumber}`;
    if (this.blameCache.has(key)) {
      return this.blameCache.get(key)!;
    }

    const sha = await this.client.getBlameCommitShaForLine(projectId, filePath, parentRef, lineNumber);
    this.blameCache.set(key, sha);
    return sha;
  }

  private async resolvePreviousCommitContext(projectId: number, commitSha: string): Promise<PreviousCommitContext | null> {
    const key = `${projectId}:${commitSha}`;
    if (this.previousCommitContextCache.has(key)) {
      return this.previousCommitContextCache.get(key)!;
    }

    try {
      const commit = await this.client.getCommit(projectId, commitSha);
      const mergeRequests = await this.client.getMergeRequestsForCommit(projectId, commitSha);
      const mergeRequest = mergeRequests[0] ?? null;
      const mergeRequestIssues = mergeRequest
        ? await this.client.getIssuesClosedByMergeRequest(mergeRequest.projectId, mergeRequest.iid)
        : [];

      const context: PreviousCommitContext = {
        commitWebUrl: commit.web_url ?? null,
        mergeRequest,
        mergeRequestIssues,
      };
      this.previousCommitContextCache.set(key, context);
      return context;
    } catch {
      this.previousCommitContextCache.set(key, null);
      return null;
    }
  }

  private async safeReadFileLines(projectId: number, filePath: string, ref: string): Promise<string[] | null> {
    try {
      const raw = await this.client.getFileRaw(projectId, filePath, ref);
      return raw.split(/\r?\n/);
    } catch {
      return null;
    }
  }

  private async safeGetCommitDetail(projectId: number, sha: string): Promise<GitLabCommitDetail | null> {
    try {
      return await this.client.getCommit(projectId, sha);
    } catch {
      return null;
    }
  }
}
