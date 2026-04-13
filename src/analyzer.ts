import { ParsedHunkEntry, parseUnifiedDiffHunks } from "./diffParser.js";
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
  ReportChunkRow,
  ReportCommit,
  ReportCommitFile,
  ReportLine,
  ReportMergeRequest,
} from "./types.js";
import { splitTextLines } from "./utils.js";

/**
 * Resolved provenance context attached to a previously introduced commit.
 */
interface PreviousCommitContext {
  commitWebUrl: string | null;
  mergeRequest: GitLabMergeRequestRef | null;
  mergeRequestIssues: RelatedIssueRef[];
}

/**
 * Analyzes a GitLab issue and resolves code-origin provenance for changed lines.
 */
export class IssueAnalyzer {
  private readonly blameCache = new Map<string, string | null>();
  private readonly previousCommitContextCache = new Map<string, PreviousCommitContext | null>();

  /**
   * Creates an issue analyzer backed by the GitLab client.
   * @param client GitLab API client.
   * @param logger Logger instance.
   */
  constructor(private readonly client: GitLabClient, private readonly logger: Logger) {}

  /**
   * Runs full analysis for a parsed issue URL.
   * @param input Parsed issue URL input.
   * @returns Complete analysis result for the issue.
   */
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
          authorName: this.toDisplayName(mr.author),
          assignees: (mr.assignees ?? []).map((user) => this.toDisplayName(user)),
          reviewers: (mr.reviewers ?? []).map((user) => this.toDisplayName(user)),
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

  /**
   * Loads merge request details and keeps only merged entries.
   * @param refs Candidate merge request references.
   * @returns Sorted merged merge request details.
   */
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

  /**
   * Resolves the effective merged commit for a merge request and analyzes its files.
   * @param mr Merge request to analyze.
   * @returns Report commit entries derived from the merged target-branch commit.
   */
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
      committerName: detail.committer_name ?? null,
      committerEmail: detail.committer_email ?? null,
      webUrl: detail.web_url,
      parentIds: detail.parent_ids ?? [],
      files,
    }];
  }

  /**
   * Chooses the best available commit SHA representing merged target-branch content.
   * @param mr Merge request metadata.
   * @returns Selected commit reference source or null when unavailable.
   */
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

  /**
   * Analyzes all file diffs for a commit.
   * @param projectId GitLab project ID.
   * @param commit Commit detail payload.
   * @returns Report file entries for all commit diffs.
   */
  private async analyzeCommitFiles(projectId: number, commit: GitLabCommitDetail): Promise<ReportCommitFile[]> {
    const diffs = await this.client.getCommitDiffs(projectId, commit.id);
    const files: ReportCommitFile[] = [];

    for (const diff of diffs) {
      files.push(await this.analyzeCommitFile(projectId, commit, diff));
    }

    return files;
  }

  /**
   * Builds a report file section from a single commit diff.
   * @param projectId GitLab project ID.
   * @param commit Commit detail payload.
   * @param diff Commit diff payload for one file.
   * @returns Report file section with rendered chunk rows.
   */
  private async analyzeCommitFile(projectId: number, commit: GitLabCommitDetail, diff: GitLabCommitDiff): Promise<ReportCommitFile> {
    const filePath = diff.new_path;
    const oldPath = diff.old_path;

    if (!diff.diff || diff.diff.trim().length === 0) {
      return { filePath, oldPath, chunks: [], isTestFile: false, skippedReason: "Binary or unavailable diff" };
    }

    const hunks = parseUnifiedDiffHunks(diff.diff);
    if (hunks.length === 0) {
      return { filePath, oldPath, chunks: [], isTestFile: false, skippedReason: "No parseable hunks" };
    }

    const postLines = await this.safeReadFileLines(projectId, filePath, commit.id);
    const fileLineCount = postLines ? postLines.length : null;
    const parentRef = (commit.parent_ids && commit.parent_ids.length > 0) ? commit.parent_ids[0] : null;
    const preLines = parentRef ? await this.safeReadFileLines(projectId, oldPath, parentRef) : null;

    const chunks: ReportChunk[] = [];
    for (const hunk of hunks) {
      const contextBefore = this.pickContextBefore(postLines, hunk.newStart, 3);
      const contextAfter = this.pickContextAfter(postLines, hunk.newStart + hunk.newCount - 1, 3);

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

      const rows = this.buildChunkRows(contextBefore, hunk.entries, afterLines, beforeLines, contextAfter);

      chunks.push({
        oldStart: hunk.oldStart,
        oldCount: hunk.oldCount,
        newStart: hunk.newStart,
        newCount: hunk.newCount,
        rows,
      });
    }

    return { filePath, oldPath, chunks, fileLineCount, isTestFile: false };
  }

  /**
   * Returns context lines before a changed range.
   * @param lines File lines after change.
   * @param startLine First changed line number.
   * @param radius Number of context lines.
   * @returns Context lines that precede the changed range.
   */
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

  /**
   * Builds table rows for a diff chunk, including paired added/removed lines.
   * @param contextBefore Context lines before changes.
   * @param entries Parsed hunk entries.
   * @param afterLines Added/after lines.
   * @param beforeLines Removed/before lines with provenance.
   * @param contextAfter Context lines after changes.
   * @returns Normalized chunk rows for report rendering.
   */
  private buildChunkRows(
    contextBefore: ReportLine[],
    entries: ParsedHunkEntry[],
    afterLines: ReportLine[],
    beforeLines: ReportLine[],
    contextAfter: ReportLine[],
  ): ReportChunkRow[] {
    const rows: ReportChunkRow[] = [];

    for (const line of contextBefore) {
      rows.push({
        lineNumber: line.lineNumber,
        afterText: line.text,
        rowKind: "context",
      });
    }

    let afterIndex = 0;
    let beforeIndex = 0;
    let pendingAfter: ReportLine[] = [];
    let pendingBefore: ReportLine[] = [];

    const flushPendingChanges = (): void => {
      const pairCount = Math.min(pendingAfter.length, pendingBefore.length);
      for (let i = 0; i < pairCount; i += 1) {
        const after = pendingAfter[i];
        const before = pendingBefore[i];
        rows.push({
          lineNumber: after.lineNumber,
          afterText: after.text,
          beforeText: before.text,
          previousCommitSha: before.previousCommitSha,
          previousCommitWebUrl: before.previousCommitWebUrl,
          previousMergeRequest: before.previousMergeRequest,
          previousMergeRequestIssues: before.previousMergeRequestIssues,
          unresolvedReason: before.unresolvedReason,
          rowKind: "paired",
        });
      }

      for (let i = pairCount; i < pendingAfter.length; i += 1) {
        const after = pendingAfter[i];
        rows.push({
          lineNumber: after.lineNumber,
          afterText: after.text,
          rowKind: "added",
        });
      }

      for (let i = pairCount; i < pendingBefore.length; i += 1) {
        const before = pendingBefore[i];
        rows.push({
          lineNumber: null,
          afterText: "",
          beforeText: before.text,
          previousCommitSha: before.previousCommitSha,
          previousCommitWebUrl: before.previousCommitWebUrl,
          previousMergeRequest: before.previousMergeRequest,
          previousMergeRequestIssues: before.previousMergeRequestIssues,
          unresolvedReason: before.unresolvedReason,
          rowKind: "removed",
        });
      }

      pendingAfter = [];
      pendingBefore = [];
    };

    for (const entry of entries) {
      if (entry.kind === "context") {
        flushPendingChanges();
        rows.push({
          lineNumber: entry.newLineNumber,
          afterText: entry.text,
          rowKind: "context",
        });
        continue;
      }

      if (entry.kind === "added") {
        pendingAfter.push(afterLines[afterIndex] ?? {
          lineNumber: entry.newLineNumber,
          text: entry.text,
        });
        afterIndex += 1;
        continue;
      }

      pendingBefore.push(beforeLines[beforeIndex] ?? {
        lineNumber: entry.oldLineNumber,
        text: entry.text,
      });
      beforeIndex += 1;
    }

    if (afterIndex < afterLines.length) {
      pendingAfter = [...pendingAfter, ...afterLines.slice(afterIndex)];
    }
    if (beforeIndex < beforeLines.length) {
      pendingBefore = [...pendingBefore, ...beforeLines.slice(beforeIndex)];
    }
    flushPendingChanges();

    for (const line of contextAfter) {
      rows.push({
        lineNumber: line.lineNumber,
        afterText: line.text,
        rowKind: "context",
      });
    }

    return rows;
  }

  /**
   * Returns context lines after a changed range.
   * @param lines File lines after change.
   * @param endLine Last changed line number.
   * @param radius Number of context lines.
   * @returns Context lines that follow the changed range.
   */
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

  /**
   * Resolves the introducing commit SHA for a line from the pre-change file state.
   * @param projectId GitLab project ID.
   * @param filePath File path in repository.
   * @param parentRef Parent commit SHA/ref.
   * @param lineNumber Target line number.
   * @returns Introducing commit SHA or null.
   */
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

  /**
   * Resolves and caches commit/MR/issue context for a previous commit SHA.
   * @param projectId GitLab project ID.
   * @param commitSha Commit SHA to resolve.
   * @returns Previous commit context or null when unavailable.
   */
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

  /**
   * Reads file contents and splits them into lines, returning null on failure.
   * @param projectId GitLab project ID.
   * @param filePath File path in repository.
   * @param ref Commit SHA/ref to read from.
   * @returns File lines or null when reading fails.
   */
  private async safeReadFileLines(projectId: number, filePath: string, ref: string): Promise<string[] | null> {
    try {
      const raw = await this.client.getFileRaw(projectId, filePath, ref);
      return splitTextLines(raw);
    } catch {
      return null;
    }
  }

  /**
   * Loads commit detail and returns null when the lookup fails.
   * @param projectId GitLab project ID.
   * @param sha Commit SHA.
   * @returns Commit details or null when unavailable.
   */
  private async safeGetCommitDetail(projectId: number, sha: string): Promise<GitLabCommitDetail | null> {
    try {
      return await this.client.getCommit(projectId, sha);
    } catch {
      return null;
    }
  }

  /**
   * Produces a user-facing display name from available user fields.
   * @param user GitLab user-like object.
   * @returns Preferred display name.
   */
  private toDisplayName(user: { name?: string; username?: string } | null | undefined): string {
    return user?.name ?? user?.username ?? "unknown";
  }
}
