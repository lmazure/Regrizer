import { AnalysisResult, ReportChunk, ReportCommit, ReportCommitFile, ReportMergeRequest } from "./types.js";
import { escapeHtml } from "./utils.js";

interface FailedIssueRenderItem {
  issueUrl: string;
  errorMessage: string;
}

interface ChunkBlock {
  filePath: string;
  startLine: number;
  endLine: number;
  rows: ReportChunk["rows"];
}

type CommitTableRow =
  | { kind: "data"; row: ReportChunk["rows"][number] }
  | { kind: "separator" };

function getChunkEffectiveRange(chunk: ReportChunk): { startLine: number; endLine: number } {
  const lineNumbers = chunk.rows
    .map((row) => row.lineNumber)
    .filter((lineNumber): lineNumber is number => typeof lineNumber === "number");

  if (lineNumbers.length > 0) {
    return {
      startLine: Math.min(...lineNumbers),
      endLine: Math.max(...lineNumbers),
    };
  }

  const startLine = chunk.newStart;
  const endLine = chunk.newCount > 0 ? chunk.newStart + chunk.newCount - 1 : chunk.newStart;
  return { startLine, endLine };
}

function rowSignature(row: ReportChunk["rows"][number]): string {
  return JSON.stringify([
    row.rowKind,
    row.lineNumber,
    row.afterText,
    row.beforeText ?? "",
    row.previousCommitSha ?? "",
    row.previousCommitWebUrl ?? "",
    row.previousMergeRequest?.iid ?? "",
    row.previousMergeRequest?.webUrl ?? "",
    (row.previousMergeRequestIssues ?? []).map((issue) => `${issue.webUrl}|${issue.title}`),
    row.unresolvedReason ?? "",
  ]);
}

function findBoundaryOverlapLength(leftRows: ReportChunk["rows"], rightRows: ReportChunk["rows"]): number {
  const maxOverlap = Math.min(leftRows.length, rightRows.length);

  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    let matches = true;
    for (let index = 0; index < overlap; index += 1) {
      const leftRow = leftRows[leftRows.length - overlap + index];
      const rightRow = rightRows[index];
      if (rowSignature(leftRow) !== rowSignature(rightRow)) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return overlap;
    }
  }

  return 0;
}

function mergeOverlappingBlocks(blocks: ChunkBlock[]): ChunkBlock[] {
  if (blocks.length <= 1) {
    return blocks;
  }

  const merged: ChunkBlock[] = [];

  for (const block of blocks) {
    const previous = merged[merged.length - 1];
    if (!previous || previous.filePath !== block.filePath || block.startLine > previous.endLine + 1) {
      merged.push({ ...block, rows: [...block.rows] });
      continue;
    }

    const overlapLength = findBoundaryOverlapLength(previous.rows, block.rows);
    previous.rows = [...previous.rows, ...block.rows.slice(overlapLength)];
    previous.endLine = Math.max(previous.endLine, block.endLine);
  }

  return merged;
}

function buildFileTableRows(file: ReportCommitFile): CommitTableRow[] {
  const blocks = file.chunks
    .map((chunk) => {
      const range = getChunkEffectiveRange(chunk);
      return {
        filePath: file.filePath,
        startLine: range.startLine,
        endLine: range.endLine,
        rows: chunk.rows,
      } satisfies ChunkBlock;
    })
    .sort((left, right) => {
      if (left.startLine !== right.startLine) {
        return left.startLine - right.startLine;
      }
      return left.endLine - right.endLine;
    });

  const mergedBlocks = mergeOverlappingBlocks(blocks);
  const rows: CommitTableRow[] = [];

  mergedBlocks.forEach((block, index) => {
    if (index > 0) {
      rows.push({ kind: "separator" });
    }
    rows.push(...block.rows.map((row) => ({ kind: "data", row } as const)));
  });

  const firstVisibleLine = rows.find((item): item is { kind: "data"; row: ReportChunk["rows"][number] } => (
    item.kind === "data" && item.row.lineNumber !== null
  ));
  if (file.fileLineCount && firstVisibleLine && firstVisibleLine.row.lineNumber !== 1) {
    rows.unshift({ kind: "separator" });
  }

  const lastVisibleLine = [...rows].reverse().find((item): item is { kind: "data"; row: ReportChunk["rows"][number] } => (
    item.kind === "data" && item.row.lineNumber !== null
  ));
  if (file.fileLineCount && lastVisibleLine && lastVisibleLine.row.lineNumber !== file.fileLineCount) {
    rows.push({ kind: "separator" });
  }

  return rows;
}

function renderCommitTableRows(rows: CommitTableRow[]): string {
  const commitValues = rows.map((item) => {
    if (item.kind === "separator") {
      return null;
    }

    const row = item.row;
    return row.previousCommitSha
    ? (row.previousCommitWebUrl
      ? `<a href="${escapeHtml(row.previousCommitWebUrl)}" target="_blank" rel="noopener"><code>${escapeHtml(row.previousCommitSha.slice(0, 12))}</code></a>`
      : `<code>${escapeHtml(row.previousCommitSha.slice(0, 12))}</code>`)
    : (row.unresolvedReason ? `<span class="unresolved">${escapeHtml(row.unresolvedReason)}</span>` : "");
  });

  const mrValues = rows.map((item) => {
    if (item.kind === "separator") {
      return null;
    }

    const row = item.row;
    return row.previousMergeRequest
    ? `<a href="${escapeHtml(row.previousMergeRequest.webUrl ?? "")}" target="_blank" rel="noopener">!${row.previousMergeRequest.iid}</a>`
    : "";
  });

  const issuesValues = rows.map((item) => {
    if (item.kind === "separator") {
      return null;
    }

    const row = item.row;
    return (row.previousMergeRequestIssues && row.previousMergeRequestIssues.length > 0)
    ? row.previousMergeRequestIssues
      .map((issue) => `<a href="${escapeHtml(issue.webUrl)}" target="_blank" rel="noopener">${escapeHtml(issue.title)}</a>`)
      .join("<br />")
    : "";
  });

  const getRowSpan = (values: Array<string | null>, startIndex: number): number => {
    const current = values[startIndex];
    if (current === null) {
      return 1;
    }

    let span = 1;
    while (startIndex + span < values.length && values[startIndex + span] !== null && values[startIndex + span] === current) {
      span += 1;
    }
    return span;
  };

  return rows
    .map((item, index) => {
      if (item.kind === "separator") {
        return "<tr class=\"row-separator\"><td class=\"ln\">…</td><td>…</td><td>…</td><td class=\"provenance provenance-commit\">…</td><td class=\"provenance provenance-mr\">…</td><td class=\"provenance provenance-issues\">…</td></tr>";
      }

      const row = item.row;
      const commitCell = index === 0 || commitValues[index] === null || commitValues[index] !== commitValues[index - 1]
        ? `<td class="provenance provenance-commit" rowspan="${getRowSpan(commitValues, index)}">${commitValues[index]}</td>`
        : "";
      const mrCell = index === 0 || mrValues[index] === null || mrValues[index] !== mrValues[index - 1]
        ? `<td class="provenance provenance-mr" rowspan="${getRowSpan(mrValues, index)}">${mrValues[index]}</td>`
        : "";
      const issuesCell = index === 0 || issuesValues[index] === null || issuesValues[index] !== issuesValues[index - 1]
        ? `<td class="provenance provenance-issues" rowspan="${getRowSpan(issuesValues, index)}">${issuesValues[index]}</td>`
        : "";

      return `<tr class="row-${row.rowKind}"><td class="ln">${row.lineNumber ?? ""}</td><td><code>${escapeHtml(row.afterText)}</code></td><td><code>${escapeHtml(row.beforeText ?? "")}</code></td>${commitCell}${mrCell}${issuesCell}</tr>`;
    })
    .join("\n");
}

function renderFileTable(file: ReportCommitFile): string {
  const rows = renderCommitTableRows(buildFileTableRows(file));

  return `
    <table class="code-table">
      <thead><tr><th class="ln">Line</th><th>Code after commit</th><th>Code before commit</th><th>Previous commit</th><th>Merge request</th><th>Related issues</th></tr></thead>
      <tbody>${rows || ""}</tbody>
    </table>
  `;
}

function renderFailedIssueSection(item: FailedIssueRenderItem, index: number): string {
  return `
    <details class="issue-section issue failed-issue" open>
      <summary><h2>Issue ${index + 1} (failed)</h2></summary>
      <div class="meta"><span class="label">Issue URL</span> <a href="${escapeHtml(item.issueUrl)}" target="_blank" rel="noopener">${escapeHtml(item.issueUrl)}</a></div>
      <div class="meta unresolved"><span class="label">Error</span> ${escapeHtml(item.errorMessage)}</div>
    </details>
  `;
}

function renderFile(file: ReportCommitFile): string {
  if (file.skippedReason) {
    return `
      <details class="file" open>
        <summary><h5>${escapeHtml(file.filePath)}</h5></summary>
        <div class="meta unresolved">${escapeHtml(file.skippedReason)}</div>
      </details>
    `;
  }

  const table = renderFileTable(file);

  return `
    <details class="file" open>
      <summary><h5>${escapeHtml(file.filePath)}</h5></summary>
      <div class="meta">Old path: ${escapeHtml(file.oldPath)}</div>
      ${table}
    </details>
  `;
}

function renderCommit(commit: ReportCommit): string {
  const files = commit.files
    .map((file) => renderFile(file))
    .join("\n");
  const committerText = commit.committerName && commit.committerEmail
    ? `${commit.committerName} <${commit.committerEmail}>`
    : (commit.committerName ?? commit.committerEmail ?? "unknown");
  const commitMetaLine = `Committed ${commit.committedAt} · Committer: ${committerText}`;

  return `
    <details class="commit" open>
      <summary><h4><a href="${escapeHtml(commit.webUrl)}" target="_blank" rel="noopener">${escapeHtml(commit.shortSha)}</a> - ${escapeHtml(commit.title)}</h4></summary>
      <div class="meta">${escapeHtml(commitMetaLine)}</div>
      ${files || '<div class="meta">No files in this commit.</div>'}
    </details>
  `;
}

function renderMergeRequest(section: ReportMergeRequest): string {
  const commits = section.commits
    .map((commit) => renderCommit(commit))
    .join("\n");
  const mergedAt = section.mergedAt ?? "unknown";
  const author = section.mr.authorName ?? "unknown";
  const assignees = section.mr.assignees && section.mr.assignees.length > 0
    ? section.mr.assignees.join(", ")
    : "none";
  const reviewers = section.mr.reviewers && section.mr.reviewers.length > 0
    ? section.mr.reviewers.join(", ")
    : "none";
  const mrMetaLine = `Merged ${mergedAt} · Author: ${author} · Assignees: ${assignees} · Reviewers: ${reviewers}`;

  return `
    <details class="mr" open>
      <summary><h3><a href="${escapeHtml(section.mr.webUrl ?? "")}" target="_blank" rel="noopener">!${section.mr.iid}</a> ${escapeHtml(section.mr.title ?? "")}</h3></summary>
      <div class="meta">${escapeHtml(mrMetaLine)}</div>
      ${commits || '<div class="meta">No commits found for this MR.</div>'}
    </details>
  `;
}

function renderIssueSection(result: AnalysisResult, index: number): string {
  const mrSections = result.mergeRequests
    .map((section) => renderMergeRequest(section))
    .join("\n");

  return `
    <details class="issue-section issue" open>
      <summary><h2>Issue <a href="${escapeHtml(result.inputIssue.web_url)}" target="_blank" rel="noopener">#${result.inputIssue.iid}</a> - ${escapeHtml(result.inputIssue.title)}</h2></summary>
      <div class="meta"><span class="label">Project</span> <a href="${escapeHtml(result.project.web_url)}" target="_blank" rel="noopener">${escapeHtml(result.project.path_with_namespace)}</a></div>
      <div class="meta"><span class="label">Merged MRs analyzed</span> ${result.mergeRequests.length}</div>
      ${mrSections || '<div class="mr"><div class="meta">No related merged MRs found.</div></div>'}
    </details>
  `;
}

export function renderHtmlReport(result: AnalysisResult): string {
  return renderHtmlReports([result]);
}

export function renderHtmlReports(results: AnalysisResult[], failedIssues: FailedIssueRenderItem[] = []): string {
  const generatedAt = results.find((result) => result.generatedAt)?.generatedAt ?? null;
  const successSections = results
    .map((result, index) => renderIssueSection(result, index))
    .join("\n");

  const failedSections = failedIssues
    .map((item, index) => renderFailedIssueSection(item, results.length + index))
    .join("\n");

  const issueSections = [successSections, failedSections]
    .filter((section) => section.length > 0)
    .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Issue Code-Origin Report</title>
    <style>
      :root {
        --bg: #f8fafc;
        --fg: #0f172a;
        --muted: #64748b;
        --line: #e2e8f0;
        --card: #ffffff;
        --warn: #7c2d12;
        --after: #effcf4;
        --before: #fff1f2;
        --paired: #fff8e8;
        --context: #f5f7fb;
      }
      body { margin: 0; font-family: "Segoe UI", Tahoma, sans-serif; background: var(--bg); color: var(--fg); }
      main { width: 100%; max-width: none; margin: 0; padding: 12px; box-sizing: border-box; }
      .issue-section { margin-top: 20px; background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 12px; }
      .issue-section:first-of-type { margin-top: 0; }
      .issue { display: block; }
      .issue > summary { font-weight: 600; }
      h1, h2, h3, h4, h5 { margin: 0 0 8px 0; }
      .meta { color: var(--muted); font-size: 0.9rem; margin-bottom: 8px; }
      .mr, .commit, .file { background: var(--card); border: 1px solid var(--line); border-radius: 10px; }
      .mr { padding: 14px; margin-top: 16px; }
      .commit { padding: 12px; margin-top: 10px; }
      .file { padding: 10px; margin-top: 10px; overflow-x: auto; }
      summary { cursor: pointer; list-style: none; }
      summary::-webkit-details-marker { display: none; }
      details > summary h3,
      details > summary h4,
      details > summary h5,
      details > summary .chunk-title { display: inline; margin: 0; }
      details > summary + * { margin-top: 8px; }
      .code-table { width: max-content; min-width: 100%; border-collapse: collapse; margin-bottom: 6px; table-layout: auto; }
      .code-table td, .code-table th { border: 1px solid var(--line); padding: 4px 8px; vertical-align: top; white-space: nowrap; }
      .ln { width: 70px; color: var(--muted); text-align: right; }
      .code-table th:nth-child(2), .code-table td:nth-child(2) { min-width: 520px; }
      .code-table th:nth-child(3), .code-table td:nth-child(3) { min-width: 520px; }
      .code-table th:nth-child(4), .code-table td:nth-child(4) { min-width: 150px; }
      .code-table th:nth-child(5), .code-table td:nth-child(5) { min-width: 120px; }
      .code-table th:nth-child(6), .code-table td:nth-child(6) { min-width: 420px; }
      tr.row-added td { background: var(--after); }
      tr.row-removed td { background: var(--before); }
      tr.row-paired td { background: var(--paired); }
      tr.row-context td { background: var(--context); }
      tr.row-separator td { background: #eef2f7; text-align: center; font-weight: 600; color: var(--muted); }
      .code-table td.provenance { background: var(--card); }
      code { white-space: pre; word-break: normal; font-family: "Consolas", "Courier New", monospace; }
      .unresolved { color: var(--warn); }
      a { color: #0a58ca; text-decoration: none; }
      a:hover { text-decoration: underline; }
      @media (max-width: 720px) {
        main { padding: 12px; }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Issue Code-Origin Report</h1>
      ${generatedAt ? `<div class="meta">Generated at ${escapeHtml(generatedAt)}</div>` : ""}
      ${issueSections}
    </main>
  </body>
</html>`;
}
