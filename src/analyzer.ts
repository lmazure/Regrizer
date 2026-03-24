import { extractChangedNewLineNumbers } from "./diffParser.js";
import { GitLabClient } from "./gitlabClient.js";
import { Logger } from "./logger.js";
import {
  AnalysisResult,
  FileAnalysis,
  GitLabMergeRequest,
  GitLabMergeRequestRef,
  LineProvenance,
  ParsedIssueUrl,
  RelatedIssueRef,
} from "./types.js";
import { chunkSortedNumbers } from "./utils.js";

export class IssueAnalyzer {
  private readonly mrByCommitCache = new Map<string, GitLabMergeRequestRef | null>();
  private readonly issuesByMrCache = new Map<string, RelatedIssueRef[]>();

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

    const files: FileAnalysis[] = [];
    for (const mr of mergedMrrs) {
      this.logger.log(`Analyzing MR !${mr.iid} (${mr.project_id})`);
      const fileAnalyses = await this.analyzeMergeRequest(mr);
      files.push(...fileAnalyses);
    }

    return {
      inputIssue: issue,
      project,
      analyzedMergeRequests: mergedMrrs.map((mr) => ({
        projectId: mr.project_id,
        iid: mr.iid,
        title: mr.title,
        webUrl: mr.web_url,
      })),
      files,
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
      return left - right;
    });

    return merged;
  }

  private async analyzeMergeRequest(mr: GitLabMergeRequest): Promise<FileAnalysis[]> {
    const changes = await this.client.getMergeRequestChanges(mr.project_id, mr.iid);
    this.logger.log(`MR !${mr.iid}: ${changes.length} changed file(s)`);
    const result: FileAnalysis[] = [];

    for (const change of changes) {
      const filePath = change.new_path;
      const mergeRequestRef: GitLabMergeRequestRef = {
        projectId: mr.project_id,
        iid: mr.iid,
        title: mr.title,
        webUrl: mr.web_url,
      };

      if (change.deleted_file) {
        result.push({
          filePath,
          mergeRequest: mergeRequestRef,
          contextWindows: [],
          skippedReason: "Deleted file",
        });
        continue;
      }

      if (!change.diff || change.diff.trim().length === 0) {
        result.push({
          filePath,
          mergeRequest: mergeRequestRef,
          contextWindows: [],
          skippedReason: "Binary or unavailable diff",
        });
        continue;
      }

      const changedLines = extractChangedNewLineNumbers(change.diff);
      if (changedLines.length === 0) {
        continue;
      }

      this.logger.log(`MR !${mr.iid}: ${filePath} has ${changedLines.length} changed line(s)`);

      const ref = mr.merge_commit_sha ?? mr.target_branch;
      const raw = await this.safeReadFile(mr.project_id, filePath, ref);
      if (raw === null) {
        result.push({
          filePath,
          mergeRequest: mergeRequestRef,
          contextWindows: [],
          skippedReason: `Could not read file at ref ${ref}`,
        });
        continue;
      }

      const allLines = raw.split(/\r?\n/);
      const chunks = chunkSortedNumbers(changedLines, 7);

      const windows = [] as FileAnalysis["contextWindows"];
      for (const chunk of chunks) {
        const end = Math.min(chunk.end, allLines.length);
        const lines = [] as Array<{ lineNumber: number; text: string; isChanged: boolean }>;
        for (let lineNumber = chunk.start; lineNumber <= end; lineNumber += 1) {
          lines.push({
            lineNumber,
            text: allLines[lineNumber - 1] ?? "",
            isChanged: chunk.changed.includes(lineNumber),
          });
        }

        const provenanceByChangedLine: LineProvenance[] = [];
        for (const changedLineNumber of chunk.changed) {
          const lineBeforeNumber = changedLineNumber - 1;
          const lineAfterNumber = changedLineNumber + 1;

          const lineBeforeText = lineBeforeNumber >= 1 ? allLines[lineBeforeNumber - 1] ?? null : null;
          const changedLineText = allLines[changedLineNumber - 1] ?? "";
          const lineAfterText = lineAfterNumber <= allLines.length ? allLines[lineAfterNumber - 1] ?? null : null;

          const provenance = await this.resolveLineBeforeProvenance(
            mr.project_id,
            filePath,
            ref,
            lineBeforeNumber,
            lineBeforeText,
          );

          provenanceByChangedLine.push({
            lineBeforeNumber: lineBeforeNumber >= 1 ? lineBeforeNumber : null,
            lineBeforeText,
            changedLineNumber,
            changedLineText,
            lineAfterNumber: lineAfterNumber <= allLines.length ? lineAfterNumber : null,
            lineAfterText,
            introducingCommitSha: provenance.introducingCommitSha,
            introducingMr: provenance.introducingMr,
            introducingIssues: provenance.introducingIssues,
            unresolvedReason: provenance.unresolvedReason,
          });
        }

        windows.push({
          startLine: chunk.start,
          endLine: end,
          changedLineNumbers: [...chunk.changed],
          lines,
          provenanceByChangedLine,
        });
      }

      result.push({
        filePath,
        mergeRequest: mergeRequestRef,
        contextWindows: windows,
      });
    }

    return result;
  }

  private async resolveLineBeforeProvenance(
    projectId: number,
    filePath: string,
    ref: string,
    lineBeforeNumber: number,
    lineBeforeText: string | null,
  ): Promise<{
    introducingCommitSha: string | null;
    introducingMr: GitLabMergeRequestRef | null;
    introducingIssues: RelatedIssueRef[];
    unresolvedReason?: string;
  }> {
    if (lineBeforeNumber < 1 || lineBeforeText === null) {
      return {
        introducingCommitSha: null,
        introducingMr: null,
        introducingIssues: [],
        unresolvedReason: "No line before available",
      };
    }

    const commitSha = await this.client.getBlameCommitShaForLine(projectId, filePath, ref, lineBeforeNumber);
    if (!commitSha) {
      return {
        introducingCommitSha: null,
        introducingMr: null,
        introducingIssues: [],
        unresolvedReason: "Blame did not return a commit",
      };
    }

    const introducingMr = await this.resolveMergeRequestForCommit(projectId, commitSha);
    if (!introducingMr) {
      return {
        introducingCommitSha: commitSha,
        introducingMr: null,
        introducingIssues: [],
        unresolvedReason: "No merged MR found for commit",
      };
    }

    const issues = await this.resolveIssuesForMergeRequest(introducingMr.projectId, introducingMr.iid);

    return {
      introducingCommitSha: commitSha,
      introducingMr,
      introducingIssues: issues,
    };
  }

  private async resolveMergeRequestForCommit(projectId: number, commitSha: string): Promise<GitLabMergeRequestRef | null> {
    const key = `${projectId}:${commitSha}`;
    if (this.mrByCommitCache.has(key)) {
      return this.mrByCommitCache.get(key)!;
    }

    const related = await this.client.getMergeRequestsForCommit(projectId, commitSha);
    const picked = related[0] ?? null;
    this.logger.log(
      picked
        ? `Commit ${commitSha.slice(0, 12)} mapped to MR !${picked.iid} (${picked.projectId})`
        : `Commit ${commitSha.slice(0, 12)} has no merged MR mapping`,
    );
    this.mrByCommitCache.set(key, picked);
    return picked;
  }

  private async resolveIssuesForMergeRequest(projectId: number, mrIid: number): Promise<RelatedIssueRef[]> {
    const key = `${projectId}:${mrIid}`;
    if (this.issuesByMrCache.has(key)) {
      return this.issuesByMrCache.get(key)!;
    }

    const issues = await this.client.getIssuesClosedByMergeRequest(projectId, mrIid);
    this.issuesByMrCache.set(key, issues);
    return issues;
  }

  private async safeReadFile(projectId: number, filePath: string, ref: string): Promise<string | null> {
    try {
      return await this.client.getFileRaw(projectId, filePath, ref);
    } catch {
      return null;
    }
  }
}
