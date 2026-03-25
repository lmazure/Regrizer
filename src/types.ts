export interface ParsedIssueUrl {
  host: string;
  projectPath: string;
  issueIid: number;
}

export interface GitLabCommitDiff extends GitLabMrChange {}

export interface GitLabProject {
  id: number;
  path_with_namespace: string;
  web_url: string;
}

export interface GitLabIssue {
  id: number;
  iid: number;
  title: string;
  web_url: string;
}

export interface GitLabMergeRequestRef {
  projectId: number;
  iid: number;
  title?: string;
  webUrl?: string;
}

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

export interface GitLabCommitDetail {
  id: string;
  short_id: string;
  title: string;
  message: string;
  authored_date: string;
  committed_date: string;
  parent_ids: string[];
  web_url: string;
}

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
}

export interface GitLabMrChange {
  old_path: string;
  new_path: string;
  diff: string;
  new_file: boolean;
  renamed_file: boolean;
  deleted_file: boolean;
}

export interface RelatedIssueRef {
  title: string;
  webUrl: string;
}

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

export interface ReportLine {
  lineNumber: number | null;
  text: string;
  previousCommitSha?: string | null;
  previousCommitWebUrl?: string | null;
  previousMergeRequest?: GitLabMergeRequestRef | null;
  previousMergeRequestIssues?: RelatedIssueRef[];
  unresolvedReason?: string;
}

export interface ReportChunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  contextBefore: ReportLine[];
  afterLines: ReportLine[];
  beforeLines: ReportLine[];
  contextAfter: ReportLine[];
}

export interface ReportCommitFile {
  filePath: string;
  oldPath: string;
  chunks: ReportChunk[];
  skippedReason?: string;
}

export interface ReportCommit {
  sha: string;
  shortSha: string;
  title: string;
  message: string;
  committedAt: string;
  webUrl: string;
  parentIds: string[];
  files: ReportCommitFile[];
}

export interface ReportMergeRequest {
  mr: GitLabMergeRequestRef;
  mergedAt: string | null;
  commits: ReportCommit[];
}

export interface AnalysisResult {
  inputIssue: GitLabIssue;
  project: GitLabProject;
  mergeRequests: ReportMergeRequest[];
  generatedAt: string;
}
