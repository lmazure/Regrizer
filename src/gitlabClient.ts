import {
  GitLabCommitDetail,
  GitLabCommitDiff,
  GitLabCommitRef,
  GitLabIssue,
  GitLabMergeRequest,
  GitLabMergeRequestRef,
  GitLabMrChange,
  GitLabProject,
  RelatedIssueRef,
} from "./types.js";
import { Logger } from "./logger.js";

/**
 * Generic GraphQL response envelope.
 */
interface GraphQlResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

/**
 * GraphQL payload shape for issue reference and closed-by MR lookups.
 */
interface IssueMrGraphQlData {
  project: {
    issue: {
      closedByMergeRequests?: {
        nodes: Array<{
          iid: string;
          title: string;
          webUrl: string;
          project: { fullPath: string };
        }>;
      };
      reference?: string;
    } | null;
  } | null;
}

/**
 * GraphQL payload shape for merge request related issue lookups.
 */
interface MergeRequestIssuesGraphQlData {
  project: {
    mergeRequest: {
      closingIssuesReferences?: Array<{
        title: string;
        webUrl: string;
      }>;
    } | null;
  } | null;
}

/**
 * GitLab API client wrapping REST and GraphQL operations used by analysis.
 */
export class GitLabClient {
  private readonly apiBaseUrl: string;
  private readonly graphQlUrl: string;
  private readonly projectPathToId = new Map<string, number>();

  /**
   * Creates a GitLab client for a host and personal access token.
   * @param host GitLab host URL.
   * @param token Personal access token.
   * @param logger Logger instance.
   */
  constructor(private readonly host: string, private readonly token: string, private readonly logger: Logger) {
    this.apiBaseUrl = `${host.replace(/\/$/, "")}/api/v4`;
    this.graphQlUrl = `${host.replace(/\/$/, "")}/api/graphql`;
  }

  /**
   * Retrieves project metadata by full project path.
   * @param projectPath Full GitLab project path.
   * @returns Project metadata payload.
   */
  async getProjectByPath(projectPath: string): Promise<GitLabProject> {
    const encoded = encodeURIComponent(projectPath);
    const project = await this.requestJson<GitLabProject>(`/projects/${encoded}`);
    this.projectPathToId.set(project.path_with_namespace, project.id);
    return project;
  }

  /**
   * Retrieves project metadata by numeric project ID.
   * @param projectId GitLab project ID.
   * @returns Project metadata payload.
   */
  async getProjectById(projectId: number): Promise<GitLabProject> {
    const project = await this.requestJson<GitLabProject>(`/projects/${projectId}`);
    this.projectPathToId.set(project.path_with_namespace, project.id);
    return project;
  }

  /**
   * Retrieves a project issue by project ID and issue IID.
   * @param projectId GitLab project ID.
   * @param issueIid Issue IID in project.
   * @returns Issue metadata payload.
   */
  async getIssue(projectId: number, issueIid: number): Promise<GitLabIssue> {
    return this.requestJson<GitLabIssue>(`/projects/${projectId}/issues/${issueIid}`);
  }

  /**
   * Resolves the full issue reference using GraphQL.
   * @param projectPath Full GitLab project path.
   * @param issueIid Issue IID.
   * @returns Full issue reference string.
   */
  async getIssueReferenceFull(projectPath: string, issueIid: number): Promise<string> {
    const query = `
      query IssueReference($fullPath: ID!, $iid: String!) {
        project(fullPath: $fullPath) {
          issue(iid: $iid) {
            reference
          }
        }
      }
    `;

    const payload = await this.graphQlRequest<IssueMrGraphQlData>(query, {
      fullPath: projectPath,
      iid: String(issueIid),
    });

    return payload.project?.issue?.reference ?? `${projectPath}#${issueIid}`;
  }

  /**
   * Collects merge request references related to an issue.
   * @param project Project metadata.
   * @param issue Issue metadata.
   * @returns Unique related merge request references.
   */
  async getIssueRelatedMergeRequestRefs(
    project: GitLabProject,
    issue: GitLabIssue,
  ): Promise<GitLabMergeRequestRef[]> {
    this.logger.log(
      `Collecting related MRs for issue #${issue.iid} in ${project.path_with_namespace} using related_merge_requests + closed_by`,
    );
    const refs = new Map<string, GitLabMergeRequestRef>();

    const direct = await this.safeRequest(
      () => this.requestJson<Array<{ project_id: number; iid: number; title: string; web_url: string }>>(
        `/projects/${project.id}/issues/${issue.iid}/related_merge_requests`,
      ),
      [],
    );

    for (const mr of direct) {
      refs.set(`${mr.project_id}:${mr.iid}`, {
        projectId: mr.project_id,
        iid: mr.iid,
        title: mr.title,
        webUrl: mr.web_url,
      });
    }

    const closedBy = await this.safeRequest(
      () =>
        this.requestJson<Array<{ project_id: number; iid: number; title: string; web_url: string }>>(
          `/projects/${project.id}/issues/${issue.iid}/closed_by`,
        ),
      [],
    );
    for (const mr of closedBy) {
      refs.set(`${mr.project_id}:${mr.iid}`, {
        projectId: mr.project_id,
        iid: mr.iid,
        title: mr.title,
        webUrl: mr.web_url,
      });
    }

    const values = [...refs.values()];
    this.logger.log(`Related MR candidates collected: ${values.length}`);
    return values;
  }

  /**
   * Retrieves a merge request by project ID and MR IID.
   * @param projectId GitLab project ID.
   * @param mrIid Merge request IID.
   * @returns Merge request details.
   */
  async getMergeRequest(projectId: number, mrIid: number): Promise<GitLabMergeRequest> {
    return this.requestJson<GitLabMergeRequest>(`/projects/${projectId}/merge_requests/${mrIid}`);
  }

  /**
   * Retrieves merge request file changes in unified diff form.
   * @param projectId GitLab project ID.
   * @param mrIid Merge request IID.
   * @returns Merge request file changes.
   */
  async getMergeRequestChanges(projectId: number, mrIid: number): Promise<GitLabMrChange[]> {
    const data = await this.requestJson<{ changes: GitLabMrChange[] }>(
      `/projects/${projectId}/merge_requests/${mrIid}/changes`,
      { unidiff: true },
    );
    return data.changes ?? [];
  }

  /**
   * Retrieves commit references associated with a merge request.
   * @param projectId GitLab project ID.
   * @param mrIid Merge request IID.
   * @returns Commit references for the merge request.
   */
  async getMergeRequestCommits(projectId: number, mrIid: number): Promise<GitLabCommitRef[]> {
    return this.requestJson<GitLabCommitRef[]>(`/projects/${projectId}/merge_requests/${mrIid}/commits`);
  }

  /**
   * Retrieves detailed commit metadata by SHA.
   * @param projectId GitLab project ID.
   * @param sha Commit SHA.
   * @returns Commit detail payload.
   */
  async getCommit(projectId: number, sha: string): Promise<GitLabCommitDetail> {
    return this.requestJson<GitLabCommitDetail>(`/projects/${projectId}/repository/commits/${sha}`);
  }

  /**
   * Retrieves file-level diffs for a commit.
   * @param projectId GitLab project ID.
   * @param sha Commit SHA.
   * @returns Commit diff entries.
   */
  async getCommitDiffs(projectId: number, sha: string): Promise<GitLabCommitDiff[]> {
    return this.requestJson<GitLabCommitDiff[]>(`/projects/${projectId}/repository/commits/${sha}/diff`);
  }

  /**
   * Reads raw file contents for a project file at a given ref.
   * @param projectId GitLab project ID.
   * @param filePath Repository file path.
   * @param ref Commit SHA/ref.
   * @returns Raw file content text.
   */
  async getFileRaw(projectId: number, filePath: string, ref: string): Promise<string> {
    const encodedPath = encodeURIComponent(filePath);
    const response = await fetch(`${this.apiBaseUrl}/projects/${projectId}/repository/files/${encodedPath}/raw?ref=${encodeURIComponent(ref)}`, {
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to read file content: ${response.status} ${response.statusText}`);
    }

    return response.text();
  }

  /**
   * Returns the commit SHA from blame for a single file line.
   * @param projectId GitLab project ID.
   * @param filePath Repository file path.
   * @param ref Commit SHA/ref.
   * @param lineNumber Target line number.
   * @returns Blame commit SHA or null.
   */
  async getBlameCommitShaForLine(projectId: number, filePath: string, ref: string, lineNumber: number): Promise<string | null> {
    if (lineNumber < 1) {
      return null;
    }

    const encodedPath = encodeURIComponent(filePath);
    const url = `${this.apiBaseUrl}/projects/${projectId}/repository/files/${encodedPath}/blame?ref=${encodeURIComponent(ref)}&range[start]=${lineNumber}&range[end]=${lineNumber}`;
    const response = await fetch(url, { headers: this.headers });

    if (!response.ok) {
      return null;
    }

    const rows = (await response.json()) as Array<{ commit?: { id?: string } }>;
    return rows[0]?.commit?.id ?? null;
  }

  /**
   * Retrieves merged merge requests associated with a commit.
   * @param projectId GitLab project ID.
   * @param sha Commit SHA.
   * @returns Merged merge request references.
   */
  async getMergeRequestsForCommit(projectId: number, sha: string): Promise<GitLabMergeRequestRef[]> {
    const mergedOnly = await this.safeRequest(
      () =>
        this.requestJson<Array<{ project_id: number; iid: number; title: string; web_url: string; state: string }>>(
          `/projects/${projectId}/repository/commits/${sha}/merge_requests`,
        ),
      [],
    );

    return mergedOnly
      .filter((mr) => mr.state === "merged")
      .map((mr) => ({
        projectId: mr.project_id,
        iid: mr.iid,
        title: mr.title,
        webUrl: mr.web_url,
      }));
  }

  /**
   * Retrieves issues that are closed or related to a merge request.
   * @param projectId GitLab project ID.
   * @param mrIid Merge request IID.
   * @returns Related issue references.
   */
  async getIssuesClosedByMergeRequest(projectId: number, mrIid: number): Promise<RelatedIssueRef[]> {
    const closesIssues = await this.safeRequest(
      () => this.requestJson<Array<{ title: string; web_url: string }>>(`/projects/${projectId}/merge_requests/${mrIid}/closes_issues`),
      [],
    );

    const relatedIssues = await this.safeRequest(
      () => this.requestJson<Array<{ title: string; web_url: string }>>(`/projects/${projectId}/merge_requests/${mrIid}/related_issues`),
      [],
    );

    const refs = new Map<string, RelatedIssueRef>();
    for (const issue of closesIssues) {
      refs.set(issue.web_url, { title: issue.title, webUrl: issue.web_url });
    }
    for (const issue of relatedIssues) {
      refs.set(issue.web_url, { title: issue.title, webUrl: issue.web_url });
    }

    if (refs.size > 0) {
      return [...refs.values()];
    }

    const graphql = await this.safeRequest(() => this.getIssuesClosedByMergeRequestGraphQl(projectId, mrIid), []);
    return graphql;
  }

  /**
   * Resolves MRs closing an issue using GraphQL fallback.
   * @param projectPath Full GitLab project path.
   * @param issueIid Issue IID.
   * @returns Merge request references that close the issue.
   */
  private async getIssueClosedByMergeRequestsGraphQl(projectPath: string, issueIid: number): Promise<GitLabMergeRequestRef[]> {
    const query = `
      query ClosedByMergeRequests($fullPath: ID!, $iid: String!) {
        project(fullPath: $fullPath) {
          issue(iid: $iid) {
            closedByMergeRequests {
              nodes {
                iid
                title
                webUrl
                project {
                  fullPath
                }
              }
            }
          }
        }
      }
    `;

    const payload = await this.graphQlRequest<IssueMrGraphQlData>(query, {
      fullPath: projectPath,
      iid: String(issueIid),
    });

    const refs: GitLabMergeRequestRef[] = [];
    const nodes = payload.project?.issue?.closedByMergeRequests?.nodes ?? [];
    for (const node of nodes) {
      const projectId = await this.projectIdFromPath(node.project.fullPath);
      refs.push({
        projectId,
        iid: Number(node.iid),
        title: node.title,
        webUrl: node.webUrl,
      });
    }

    return refs;
  }

  /**
   * Resolves MR closing issues using GraphQL fallback.
   * @param projectId GitLab project ID.
   * @param mrIid Merge request IID.
   * @returns Related issue references from GraphQL.
   */
  private async getIssuesClosedByMergeRequestGraphQl(projectId: number, mrIid: number): Promise<RelatedIssueRef[]> {
    const project = await this.requestJson<GitLabProject>(`/projects/${projectId}`);
    const query = `
      query MergeRequestClosingIssues($fullPath: ID!, $iid: String!) {
        project(fullPath: $fullPath) {
          mergeRequest(iid: $iid) {
            closingIssuesReferences {
              title
              webUrl
            }
          }
        }
      }
    `;

    const payload = await this.graphQlRequest<MergeRequestIssuesGraphQlData>(query, {
      fullPath: project.path_with_namespace,
      iid: String(mrIid),
    });

    return payload.project?.mergeRequest?.closingIssuesReferences?.map((issue) => ({
      title: issue.title,
      webUrl: issue.webUrl,
    })) ?? [];
  }

  /**
   * Searches merged merge requests by free-text query.
   * @param search Search query string.
   * @returns Matching merged merge request references.
   */
  private async searchMergeRequests(search: string): Promise<GitLabMergeRequestRef[]> {
    const result = await this.safeRequest(
      () =>
        this.requestJson<Array<{ project_id: number; iid: number; title: string; web_url: string; state: string }>>(
          "/search",
          { scope: "merge_requests", search },
        ),
      [],
    );

    return result
      .filter((mr) => mr.state === "merged")
      .map((mr) => ({
        projectId: mr.project_id,
        iid: mr.iid,
        title: mr.title,
        webUrl: mr.web_url,
      }));
  }

  /**
   * Extracts merge request references from arbitrary text.
   * @param text Text to inspect.
   * @param defaultProjectPath Default project path for shorthand references.
   * @returns Extracted merge request references.
   */
  private async extractMrRefsFromText(text: string, defaultProjectPath: string): Promise<GitLabMergeRequestRef[]> {
    const refs = new Map<string, GitLabMergeRequestRef>();

    const projectLocal = [...text.matchAll(/!(\d+)/g)];
    const defaultProjectId = await this.projectIdFromPath(defaultProjectPath);
    for (const match of projectLocal) {
      const iid = Number(match[1]);
      refs.set(`${defaultProjectId}:${iid}`, { projectId: defaultProjectId, iid });
    }

    const urlMatches = [...text.matchAll(/https?:\/\/[^\s]+\/-\/merge_requests\/(\d+)/g)];
    for (const match of urlMatches) {
      const mrUrl = match[0];
      const parsed = new URL(mrUrl);
      const mrMatch = parsed.pathname.match(/^(?<projectPath>.+)\/-\/merge_requests\/(?<iid>\d+)\/?$/);
      if (!mrMatch?.groups?.projectPath || !mrMatch.groups.iid) {
        continue;
      }

      const projectPath = decodeURIComponent(mrMatch.groups.projectPath.replace(/^\//, ""));
      const projectId = await this.projectIdFromPath(projectPath);
      const iid = Number(mrMatch.groups.iid);
      refs.set(`${projectId}:${iid}`, { projectId, iid, webUrl: mrUrl });
    }

    return [...refs.values()];
  }

  /**
   * Resolves and caches project ID from a project path.
   * @param projectPath Full GitLab project path.
   * @returns Numeric GitLab project ID.
   */
  private async projectIdFromPath(projectPath: string): Promise<number> {
    if (this.projectPathToId.has(projectPath)) {
      return this.projectPathToId.get(projectPath)!;
    }

    const project = await this.getProjectByPath(projectPath);
    this.projectPathToId.set(project.path_with_namespace, project.id);
    return project.id;
  }

  /**
   * Executes a REST request and parses JSON response payload.
   * @param path API path relative to base URL.
   * @param params Optional query parameters.
   * @returns Parsed JSON payload.
   */
  private async requestJson<T>(path: string, params?: Record<string, string | number | boolean>): Promise<T> {
    const query = params ? `?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}` : "";
    this.logger.log(`REST ${path}${query}`);
    this.logger.logPayload(`REST request payload ${path}`, params ?? null);
    const response = await fetch(`${this.apiBaseUrl}${path}${query}`, { headers: this.headers });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitLab API request failed (${response.status} ${response.statusText}): ${path} ${body}`);
    }

    const payload = (await response.json()) as T;
    this.logger.logPayload(`REST response payload ${path}`, payload);
    return payload;
  }

  /**
   * Executes a GraphQL request and validates response structure.
   * @param query GraphQL query string.
   * @param variables Query variables object.
   * @returns Parsed GraphQL data payload.
   */
  private async graphQlRequest<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    this.logger.log("GraphQL request");
    this.logger.logPayload("GraphQL request payload", { query, variables });
    const response = await fetch(this.graphQlUrl, {
      method: "POST",
      headers: {
        ...this.headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`GitLab GraphQL request failed (${response.status} ${response.statusText})`);
    }

    const payload = (await response.json()) as GraphQlResponse<T>;
    this.logger.logPayload("GraphQL response payload", payload);
    if (payload.errors && payload.errors.length > 0) {
      throw new Error(`GitLab GraphQL error: ${payload.errors.map((error) => error.message).join("; ")}`);
    }

    if (!payload.data) {
      throw new Error("GitLab GraphQL response did not contain data");
    }

    return payload.data;
  }

  /**
   * Executes paginated REST retrieval and accumulates response pages.
   * @param path API path relative to base URL.
   * @param params Optional query parameters.
   * @returns Array of response pages.
   */
  private async paginatedGet<T extends unknown[]>(path: string, params?: Record<string, string>): Promise<T[]> {
    const out: T[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const response = await this.requestJson<T>(path, {
        ...params,
        page,
        per_page: perPage,
      });

      out.push(response);
      if (response.length < perPage) {
        break;
      }

      page += 1;
    }

    return out;
  }

  /**
   * Returns fallback value when request execution fails.
   * @param fn Request function to execute.
   * @param fallback Fallback value when execution fails.
   * @returns Successful result or fallback value.
   */
  private async safeRequest<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  }

  /**
   * Returns authenticated request headers for GitLab API calls.
   * @returns Headers containing API authentication.
   */
  private get headers(): HeadersInit {
    return {
      "PRIVATE-TOKEN": this.token,
    };
  }
}
