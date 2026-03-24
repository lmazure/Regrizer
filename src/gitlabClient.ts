import {
  GitLabCommitRef,
  GitLabIssue,
  GitLabMergeRequest,
  GitLabMergeRequestRef,
  GitLabMrChange,
  GitLabProject,
  RelatedIssueRef,
} from "./types.js";
import { Logger } from "./logger.js";

interface GraphQlResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

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

export class GitLabClient {
  private readonly apiBaseUrl: string;
  private readonly graphQlUrl: string;
  private readonly projectPathToId = new Map<string, number>();

  constructor(private readonly host: string, private readonly token: string, private readonly logger: Logger) {
    this.apiBaseUrl = `${host.replace(/\/$/, "")}/api/v4`;
    this.graphQlUrl = `${host.replace(/\/$/, "")}/api/graphql`;
  }

  async getProjectByPath(projectPath: string): Promise<GitLabProject> {
    const encoded = encodeURIComponent(projectPath);
    const project = await this.requestJson<GitLabProject>(`/projects/${encoded}`);
    this.projectPathToId.set(project.path_with_namespace, project.id);
    return project;
  }

  async getIssue(projectId: number, issueIid: number): Promise<GitLabIssue> {
    return this.requestJson<GitLabIssue>(`/projects/${projectId}/issues/${issueIid}`);
  }

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

  async getMergeRequest(projectId: number, mrIid: number): Promise<GitLabMergeRequest> {
    return this.requestJson<GitLabMergeRequest>(`/projects/${projectId}/merge_requests/${mrIid}`);
  }

  async getMergeRequestChanges(projectId: number, mrIid: number): Promise<GitLabMrChange[]> {
    const data = await this.requestJson<{ changes: GitLabMrChange[] }>(
      `/projects/${projectId}/merge_requests/${mrIid}/changes`,
      { unidiff: true },
    );
    return data.changes ?? [];
  }

  async getMergeRequestCommits(projectId: number, mrIid: number): Promise<GitLabCommitRef[]> {
    return this.requestJson<GitLabCommitRef[]>(`/projects/${projectId}/merge_requests/${mrIid}/commits`);
  }

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

  async getIssuesClosedByMergeRequest(projectId: number, mrIid: number): Promise<RelatedIssueRef[]> {
    const direct = await this.safeRequest(
      () => this.requestJson<Array<{ title: string; web_url: string }>>(`/projects/${projectId}/merge_requests/${mrIid}/closes_issues`),
      [],
    );

    if (direct.length > 0) {
      return direct.map((issue) => ({ title: issue.title, webUrl: issue.web_url }));
    }

    const graphql = await this.safeRequest(() => this.getIssuesClosedByMergeRequestGraphQl(projectId, mrIid), []);
    return graphql;
  }

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

  private async projectIdFromPath(projectPath: string): Promise<number> {
    if (this.projectPathToId.has(projectPath)) {
      return this.projectPathToId.get(projectPath)!;
    }

    const project = await this.getProjectByPath(projectPath);
    this.projectPathToId.set(project.path_with_namespace, project.id);
    return project.id;
  }

  private async requestJson<T>(path: string, params?: Record<string, string | number | boolean>): Promise<T> {
    const query = params ? `?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}` : "";
    this.logger.log(`REST ${path}${query}`);
    const response = await fetch(`${this.apiBaseUrl}${path}${query}`, { headers: this.headers });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitLab API request failed (${response.status} ${response.statusText}): ${path} ${body}`);
    }

    return response.json() as Promise<T>;
  }

  private async graphQlRequest<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    this.logger.log("GraphQL request");
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
    if (payload.errors && payload.errors.length > 0) {
      throw new Error(`GitLab GraphQL error: ${payload.errors.map((error) => error.message).join("; ")}`);
    }

    if (!payload.data) {
      throw new Error("GitLab GraphQL response did not contain data");
    }

    return payload.data;
  }

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

  private async safeRequest<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  }

  private get headers(): HeadersInit {
    return {
      "PRIVATE-TOKEN": this.token,
    };
  }
}
