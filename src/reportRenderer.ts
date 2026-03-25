import { AnalysisResult, ReportChunk, ReportCommit, ReportCommitFile, ReportMergeRequest } from "./types.js";
import { escapeHtml } from "./utils.js";

function renderCodeRows(lines: Array<{ lineNumber: number | null; text: string }>, cssClass = ""): string {
  return lines
    .map((line) => {
      return `<tr class="${cssClass}"><td class="ln">${line.lineNumber ?? ""}</td><td><code>${escapeHtml(line.text)}</code></td></tr>`;
    })
    .join("\n");
}

function renderBeforeCommitRows(chunk: ReportChunk): string {
  return chunk.beforeLines
    .map((line) => {
      const commitCell = line.previousCommitSha
        ? (line.previousCommitWebUrl
          ? `<a href="${escapeHtml(line.previousCommitWebUrl)}" target="_blank" rel="noopener"><code>${escapeHtml(line.previousCommitSha.slice(0, 12))}</code></a>`
          : `<code>${escapeHtml(line.previousCommitSha.slice(0, 12))}</code>`)
        : `<span class="unresolved">${escapeHtml(line.unresolvedReason ?? "Unknown")}</span>`;

      const mrCell = line.previousMergeRequest
        ? `<a href="${escapeHtml(line.previousMergeRequest.webUrl ?? "")}" target="_blank" rel="noopener">!${line.previousMergeRequest.iid}</a>`
        : `<span class="unresolved">-</span>`;

      const issuesCell = (line.previousMergeRequestIssues && line.previousMergeRequestIssues.length > 0)
        ? line.previousMergeRequestIssues
          .map((issue) => `<a href="${escapeHtml(issue.webUrl)}" target="_blank" rel="noopener">${escapeHtml(issue.title)}</a>`)
          .join("<br />")
        : `<span class="unresolved">-</span>`;

      return `<tr><td class="ln">${line.lineNumber ?? ""}</td><td><code>${escapeHtml(line.text)}</code></td><td>${commitCell}</td><td>${mrCell}</td><td>${issuesCell}</td></tr>`;
    })
    .join("\n");
}

function renderChunk(chunk: ReportChunk, index: number): string {
  const contextBeforeRows = renderCodeRows(chunk.contextBefore, "context");
  const afterRows = renderCodeRows(chunk.afterLines, "after");
  const beforeRows = renderBeforeCommitRows(chunk);
  const contextAfterRows = renderCodeRows(chunk.contextAfter, "context");

  return `
    <section class="chunk">
      <div class="chunk-title">Chunk ${index + 1} · -${chunk.oldStart},${chunk.oldCount} +${chunk.newStart},${chunk.newCount}</div>
      <div class="block-title">Context before (7)</div>
      <table class="code-table"><tbody>${contextBeforeRows || ""}</tbody></table>

      <div class="block-title">After commit</div>
      <table class="code-table"><tbody>${afterRows || ""}</tbody></table>

      <div class="block-title">Before commit (with previous commit per line)</div>
      <table class="code-table">
        <thead><tr><th class="ln">Line</th><th>Code</th><th>Previous commit</th><th>Merge request</th><th>Related issues</th></tr></thead>
        <tbody>${beforeRows || ""}</tbody>
      </table>

      <div class="block-title">Context after (7)</div>
      <table class="code-table"><tbody>${contextAfterRows || ""}</tbody></table>
    </section>
  `;
}

function renderFile(file: ReportCommitFile): string {
  if (file.skippedReason) {
    return `
      <section class="file">
        <h5>${escapeHtml(file.filePath)}</h5>
        <div class="meta unresolved">${escapeHtml(file.skippedReason)}</div>
      </section>
    `;
  }

  const chunks = file.chunks
    .map((chunk, index) => renderChunk(chunk, index))
    .join("\n");

  return `
    <section class="file">
      <h5>${escapeHtml(file.filePath)}</h5>
      <div class="meta">Old path: ${escapeHtml(file.oldPath)}</div>
      ${chunks || '<div class="meta">No chunks for this file.</div>'}
    </section>
  `;
}

function renderCommit(commit: ReportCommit): string {
  const files = commit.files
    .map((file) => renderFile(file))
    .join("\n");

  return `
    <section class="commit">
      <h4><a href="${escapeHtml(commit.webUrl)}" target="_blank" rel="noopener">${escapeHtml(commit.shortSha)}</a> - ${escapeHtml(commit.title)}</h4>
      <div class="meta">Committed at ${escapeHtml(commit.committedAt)}</div>
      ${files || '<div class="meta">No files in this commit.</div>'}
    </section>
  `;
}

function renderMergeRequest(section: ReportMergeRequest): string {
  const commits = section.commits
    .map((commit) => renderCommit(commit))
    .join("\n");

  return `
    <section class="mr">
      <h3><a href="${escapeHtml(section.mr.webUrl ?? "")}" target="_blank" rel="noopener">!${section.mr.iid}</a> ${escapeHtml(section.mr.title ?? "")}</h3>
      <div class="meta">Merged at ${escapeHtml(section.mergedAt ?? "unknown")}</div>
      ${commits || '<div class="meta">No commits found for this MR.</div>'}
    </section>
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
        --context: #f5f7fb;
      }
      body { margin: 0; font-family: "Segoe UI", Tahoma, sans-serif; background: var(--bg); color: var(--fg); }
      main { max-width: 1200px; margin: 0 auto; padding: 20px; }
      h1, h2, h3, h4, h5 { margin: 0 0 8px 0; }
      .meta { color: var(--muted); font-size: 0.9rem; margin-bottom: 8px; }
      .mr, .commit, .file, .chunk { background: var(--card); border: 1px solid var(--line); border-radius: 10px; }
      .mr { padding: 14px; margin-top: 16px; }
      .commit { padding: 12px; margin-top: 10px; }
      .file { padding: 10px; margin-top: 10px; }
      .chunk { padding: 10px; margin-top: 10px; }
      .chunk-title { font-weight: 600; margin-bottom: 6px; }
      .block-title { font-weight: 600; margin: 10px 0 4px 0; }
      .code-table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
      .code-table td, .code-table th { border: 1px solid var(--line); padding: 4px 8px; vertical-align: top; }
      .ln { width: 70px; color: var(--muted); text-align: right; }
      tr.after td { background: var(--after); }
      tr.context td { background: var(--context); }
      code { white-space: pre-wrap; word-break: break-word; font-family: "Consolas", "Courier New", monospace; }
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
