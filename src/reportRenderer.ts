import { AnalysisResult, ReportChunk, ReportCommit, ReportCommitFile, ReportMergeRequest } from "./types.js";
import { escapeHtml } from "./utils.js";

function renderChunkRows(chunk: ReportChunk): string {
  return chunk.rows
    .map((row) => {
      const commitCell = row.previousCommitSha
        ? (row.previousCommitWebUrl
          ? `<a href="${escapeHtml(row.previousCommitWebUrl)}" target="_blank" rel="noopener"><code>${escapeHtml(row.previousCommitSha.slice(0, 12))}</code></a>`
          : `<code>${escapeHtml(row.previousCommitSha.slice(0, 12))}</code>`)
        : (row.unresolvedReason ? `<span class="unresolved">${escapeHtml(row.unresolvedReason)}</span>` : "");

      const mrCell = row.previousMergeRequest
        ? `<a href="${escapeHtml(row.previousMergeRequest.webUrl ?? "")}" target="_blank" rel="noopener">!${row.previousMergeRequest.iid}</a>`
        : "";

      const issuesCell = (row.previousMergeRequestIssues && row.previousMergeRequestIssues.length > 0)
        ? row.previousMergeRequestIssues
          .map((issue) => `<a href="${escapeHtml(issue.webUrl)}" target="_blank" rel="noopener">${escapeHtml(issue.title)}</a>`)
          .join("<br />")
        : "";

      return `<tr class="row-${row.rowKind}"><td class="ln">${row.lineNumber ?? ""}</td><td><code>${escapeHtml(row.afterText)}</code></td><td><code>${escapeHtml(row.beforeText ?? "")}</code></td><td>${commitCell}</td><td>${mrCell}</td><td>${issuesCell}</td></tr>`;
    })
    .join("\n");
}

function renderChunk(chunk: ReportChunk, index: number): string {
  const rows = renderChunkRows(chunk);

  return `
    <details class="chunk" open>
      <summary class="chunk-title">Chunk ${index + 1} · -${chunk.oldStart},${chunk.oldCount} +${chunk.newStart},${chunk.newCount}</summary>
      <table class="code-table">
        <thead><tr><th class="ln">Line</th><th>Code after commit</th><th>Code before commit</th><th>Previous commit</th><th>Merge request</th><th>Related issues</th></tr></thead>
        <tbody>${rows || ""}</tbody>
      </table>
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

  const chunks = file.chunks
    .map((chunk, index) => renderChunk(chunk, index))
    .join("\n");

  return `
    <details class="file" open>
      <summary><h5>${escapeHtml(file.filePath)}</h5></summary>
      <div class="meta">Old path: ${escapeHtml(file.oldPath)}</div>
      ${chunks || '<div class="meta">No chunks for this file.</div>'}
    </details>
  `;
}

function renderCommit(commit: ReportCommit): string {
  const files = commit.files
    .map((file) => renderFile(file))
    .join("\n");

  return `
    <details class="commit" open>
      <summary><h4><a href="${escapeHtml(commit.webUrl)}" target="_blank" rel="noopener">${escapeHtml(commit.shortSha)}</a> - ${escapeHtml(commit.title)}</h4></summary>
      <div class="meta">Committed at ${escapeHtml(commit.committedAt)}</div>
      ${files || '<div class="meta">No files in this commit.</div>'}
    </details>
  `;
}

function renderMergeRequest(section: ReportMergeRequest): string {
  const commits = section.commits
    .map((commit) => renderCommit(commit))
    .join("\n");

  return `
    <details class="mr" open>
      <summary><h3><a href="${escapeHtml(section.mr.webUrl ?? "")}" target="_blank" rel="noopener">!${section.mr.iid}</a> ${escapeHtml(section.mr.title ?? "")}</h3></summary>
      <div class="meta">Merged at ${escapeHtml(section.mergedAt ?? "unknown")}</div>
      ${commits || '<div class="meta">No commits found for this MR.</div>'}
    </details>
  `;
}

export function renderHtmlReport(result: AnalysisResult): string {
  const mrSections = result.mergeRequests
    .map((section) => renderMergeRequest(section))
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
      h1, h2, h3, h4, h5 { margin: 0 0 8px 0; }
      .meta { color: var(--muted); font-size: 0.9rem; margin-bottom: 8px; }
      .mr, .commit, .file, .chunk { background: var(--card); border: 1px solid var(--line); border-radius: 10px; }
      .mr { padding: 14px; margin-top: 16px; }
      .commit { padding: 12px; margin-top: 10px; }
      .file { padding: 10px; margin-top: 10px; }
      .chunk { padding: 10px; margin-top: 10px; overflow-x: auto; }
      summary { cursor: pointer; list-style: none; }
      summary::-webkit-details-marker { display: none; }
      details > summary h3,
      details > summary h4,
      details > summary h5,
      details > summary .chunk-title { display: inline; margin: 0; }
      details > summary + * { margin-top: 8px; }
      .chunk-title { font-weight: 600; margin-bottom: 6px; }
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
      <div class="meta"><span class="label">Issue</span> <a href="${escapeHtml(result.inputIssue.web_url)}" target="_blank" rel="noopener">#${result.inputIssue.iid} - ${escapeHtml(result.inputIssue.title)}</a></div>
      <div class="meta"><span class="label">Project</span> <a href="${escapeHtml(result.project.web_url)}" target="_blank" rel="noopener">${escapeHtml(result.project.path_with_namespace)}</a></div>
      <div class="meta"><span class="label">Merged MRs analyzed</span> ${result.mergeRequests.length}</div>
      <div class="meta"><span class="label">Generated at</span> ${escapeHtml(result.generatedAt)}</div>
      ${mrSections || '<div class="mr"><div class="meta">No related merged MRs found.</div></div>'}
    </main>
  </body>
</html>`;
}
