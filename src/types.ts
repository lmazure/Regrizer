/**
 * Parsed components of a GitLab issue URL.
 */
export interface ParsedIssueUrl {
  host: string;
  projectPath: string;
  issueIid: number;
}

/**
 * Commit-level diff entry returned by GitLab.
 */
export interface GitLabCommitDiff extends GitLabMrChange {}

/**
 * Minimal project payload used by the analyzer.
 */
export interface GitLabProject {
  id: number;
  path_with_namespace: string;
  web_url: string;
}

/**
 * Minimal issue payload used by the analyzer.
 */
export interface GitLabIssue {
  id: number;
  iid: number;
  title: string;
  web_url: string;
}

/**
 * Lightweight merge request reference used across reports.
 */
export interface GitLabMergeRequestRef {
  projectId: number;
  projectPathWithNamespace?: string;
  projectWebUrl?: string;
  iid: number;
  title?: string;
  webUrl?: string;
  authorName?: string;
  assignees?: string[];
  reviewers?: string[];
}

/**
 * Lightweight GitLab user representation.
 */
export interface GitLabUserRef {
  name?: string;
  username?: string;
}

/**
 * Lightweight commit representation returned in commit listings.
 */
export interface GitLabCommitRef {
  id: string;
  short_id?: string;
  title?: string;
  message?: string;
  authored_date?: string;
  committed_date?: string;
  parent_ids?: string[];
  web_url?: string;
}

/**
 * Detailed commit payload returned by commit detail endpoints.
 */
export interface GitLabCommitDetail {
  id: string;
  short_id: string;
  title: string;
  message: string;
  authored_date: string;
  committed_date: string;
  committer_name?: string;
  committer_email?: string;
  parent_ids: string[];
  web_url: string;
}

/**
 * Detailed merge request payload used during analysis.
 */
export interface GitLabMergeRequest {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  web_url: string;
  state: string;
  merged_at: string | null;
  merge_commit_sha: string | null;
  squash_commit_sha?: string | null;
  sha?: string;
  target_branch: string;
  source_branch: string;
  description: string | null;
  author?: GitLabUserRef | null;
  assignees?: GitLabUserRef[];
  reviewers?: GitLabUserRef[];
}

/**
 * File-level change entry in merge request and commit diff responses.
 */
export interface GitLabMrChange {
  old_path: string;
  new_path: string;
  diff: string;
  new_file: boolean;
  renamed_file: boolean;
  deleted_file: boolean;
}

/**
 * Lightweight issue reference related to a merge request.
 */
export interface RelatedIssueRef {
  title: string;
  webUrl: string;
}

/**
 * Provenance metadata resolved for a changed line.
 */
export interface LineProvenance {
  lineBeforeNumber: number | null;
  lineBeforeText: string | null;
  changedLineNumber: number;
  changedLineText: string;
  lineAfterNumber: number | null;
  lineAfterText: string | null;
  introducingCommitSha: string | null;
  introducingMr: GitLabMergeRequestRef | null;
  introducingIssues: RelatedIssueRef[];
  unresolvedReason?: string;
}

/**
 * A rendered line in a report, with optional provenance details.
 */
export interface ReportLine {
  lineNumber: number | null;
  text: string;
  previousCommitSha?: string | null;
  previousCommitWebUrl?: string | null;
  previousMergeRequest?: GitLabMergeRequestRef | null;
  previousMergeRequestIssues?: RelatedIssueRef[];
  unresolvedReason?: string;
}

/**
 * A row rendered in the report table for a diff chunk.
 */
export interface ReportChunkRow {
  lineNumber: number | null;
  afterText: string;
  beforeText?: string;
  previousCommitSha?: string | null;
  previousCommitWebUrl?: string | null;
  previousMergeRequest?: GitLabMergeRequestRef | null;
  previousMergeRequestIssues?: RelatedIssueRef[];
  unresolvedReason?: string;
  rowKind: "context" | "added" | "removed" | "paired";
}

/**
 * A diff chunk represented for report rendering.
 */
export interface ReportChunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  rows: ReportChunkRow[];
}

/**
 * A file section included in a report commit.
 */
export interface ReportCommitFile {
  filePath: string;
  oldPath: string;
  chunks: ReportChunk[];
  fileLineCount?: number | null;
  isTestFile: boolean;
  skippedReason?: string;
}

/**
 * A commit section included in a report merge request.
 */
export interface ReportCommit {
  sha: string;
  shortSha: string;
  title: string;
  message: string;
  committedAt: string;
  committerName?: string | null;
  committerEmail?: string | null;
  webUrl: string;
  parentIds: string[];
  files: ReportCommitFile[];
}

/**
 * A merge request section included in a full analysis report.
 */
export interface ReportMergeRequest {
  mr: GitLabMergeRequestRef;
  mergedAt: string | null;
  commits: ReportCommit[];
}

/**
 * Top-level analysis output for a single input issue.
 */
export interface AnalysisResult {
  inputIssue: GitLabIssue;
  project: GitLabProject;
  mergeRequests: ReportMergeRequest[];
  generatedAt: string;
}
