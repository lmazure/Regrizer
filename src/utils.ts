import { readFileSync } from "node:fs";
import { ParsedIssueUrl } from "./types.js";

/**
 * Parses and validates a GitLab issue URL into structured components.
 * @param issueUrl Raw GitLab issue URL.
 * @returns Parsed issue URL fields.
 */
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

/**
 * Extracts non-empty issue URLs from newline-delimited file content.
 * @param content Raw file contents.
 * @returns Trimmed non-empty issue URLs.
 */
export function parseIssueUrlsFromFileContent(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Loads issue URLs from a text file.
 * @param filePath Input file path.
 * @returns Parsed issue URLs.
 */
export function loadIssueUrlsFromFile(filePath: string): string[] {
  try {
    const content = readFileSync(filePath, "utf-8");
    return parseIssueUrlsFromFileContent(content);
  } catch (error) {
    const reason = (error as Error).message;
    throw new Error(`Failed to read issue URL file ${filePath}: ${reason}`);
  }
}

/**
 * Returns unique numbers in ascending order.
 * @param values Input numeric values.
 * @returns Unique sorted numbers.
 */
export function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

/**
 * Groups sorted line numbers into radius-expanded contiguous chunks.
 * @param values Changed line numbers.
 * @param radius Context radius around each changed line.
 * @returns Merged contiguous line chunks.
 */
export function chunkSortedNumbers(values: number[], radius: number): Array<{ start: number; end: number; changed: number[] }> {
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

/**
 * Escapes HTML-sensitive characters for safe inline rendering.
 * @param input Raw text content.
 * @returns Escaped HTML-safe text.
 */
export function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
