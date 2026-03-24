import { ParsedIssueUrl } from "./types.js";

export function parseGitLabIssueUrl(issueUrl: string): ParsedIssueUrl {
  let parsed: URL;
  try {
    parsed = new URL(issueUrl);
  } catch {
    throw new Error(`Invalid issue URL: ${issueUrl}`);
  }

  const match = parsed.pathname.match(/^(?<projectPath>.+)\/-\/(issues|work_items)\/(?<iid>\d+)\/?$/);
  if (!match?.groups?.projectPath || !match.groups.iid) {
    throw new Error(
      "Issue URL must match https://<host>/<group>/<project>/-/(issues|work_items)/<iid>",
    );
  }

  return {
    host: `${parsed.protocol}//${parsed.host}`,
    projectPath: decodeURIComponent(match.groups.projectPath.replace(/^\//, "")),
    issueIid: Number(match.groups.iid),
  };
}

export function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

export function chunkSortedNumbers(values: number[], radius = 7): Array<{ start: number; end: number; changed: number[] }> {
  if (values.length === 0) {
    return [];
  }

  const sorted = uniqueNumbers(values);
  const chunks: Array<{ start: number; end: number; changed: number[] }> = [];

  let current = {
    start: Math.max(1, sorted[0] - radius),
    end: sorted[0] + radius,
    changed: [sorted[0]],
  };

  for (let index = 1; index < sorted.length; index += 1) {
    const line = sorted[index];
    const nextStart = Math.max(1, line - radius);
    const nextEnd = line + radius;

    if (nextStart <= current.end + 1) {
      current.end = Math.max(current.end, nextEnd);
      current.changed.push(line);
      continue;
    }

    chunks.push(current);
    current = {
      start: nextStart,
      end: nextEnd,
      changed: [line],
    };
  }

  chunks.push(current);
  return chunks;
}

export function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
