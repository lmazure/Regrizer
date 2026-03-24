export interface ParsedIssueUrl {
  host: string;
  projectPath: string;
  issueIid: number;
}

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
  web_url?: string;
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

export interface FileAnalysis {
  filePath: string;
  mergeRequest: GitLabMergeRequestRef;
  contextWindows: Array<{
    startLine: number;
    endLine: number;
    changedLineNumbers: number[];
    lines: Array<{ lineNumber: number; text: string; isChanged: boolean }>;
    provenanceByChangedLine: LineProvenance[];
  }>;
  skippedReason?: string;
}

export interface AnalysisResult {
  inputIssue: GitLabIssue;
  project: GitLabProject;
  analyzedMergeRequests: GitLabMergeRequestRef[];
  files: FileAnalysis[];
  generatedAt: string;
}
