import { AnalysisResult, FileAnalysis, LineProvenance } from "./types.js";
import { escapeHtml } from "./utils.js";

function renderProvenance(line: LineProvenance): string {
  if (line.unresolvedReason) {
    return `<div class="meta unresolved">${escapeHtml(line.unresolvedReason)}</div>`;
  }

  const commit = line.introducingCommitSha
    ? `<div class="meta"><span class="label">Commit</span> <code>${escapeHtml(line.introducingCommitSha.slice(0, 12))}</code></div>`
    : "";

  const mr = line.introducingMr
    ? `<div class="meta"><span class="label">MR</span> <a href="${escapeHtml(line.introducingMr.webUrl ?? "")}" target="_blank" rel="noopener">!${line.introducingMr.iid}${line.introducingMr.title ? ` - ${escapeHtml(line.introducingMr.title)}` : ""}</a></div>`
    : `<div class="meta unresolved">No MR found</div>`;

  const issues = line.introducingIssues.length
    ? `<div class="meta"><span class="label">Issue(s)</span> ${line.introducingIssues
        .map((issue) => `<a href="${escapeHtml(issue.webUrl)}" target="_blank" rel="noopener">${escapeHtml(issue.title)}</a>`)
        .join(", ")}</div>`
    : `<div class="meta unresolved">No linked issue found</div>`;

  return `${commit}${mr}${issues}`;
}

function renderWindow(file: FileAnalysis): string {
  return file.contextWindows
    .map((window) => {
      const rows = window.lines
        .map((line) => {
          const cls = line.isChanged ? "line changed" : "line";
          return `<tr class="${cls}"><td class="ln">${line.lineNumber}</td><td><code>${escapeHtml(line.text)}</code></td></tr>`;
        })
        .join("\n");

      const provenance = window.provenanceByChangedLine
        .map((item) => {
          return `
            <div class="provenance-card">
              <div class="meta"><span class="label">Changed line</span> ${item.changedLineNumber}</div>
              <div class="meta"><span class="label">Line before</span> ${item.lineBeforeNumber ?? "N/A"}: <code>${escapeHtml(item.lineBeforeText ?? "")}</code></div>
              <div class="meta"><span class="label">Line after</span> ${item.lineAfterNumber ?? "N/A"}: <code>${escapeHtml(item.lineAfterText ?? "")}</code></div>
              ${renderProvenance(item)}
            </div>
          `;
        })
        .join("\n");

      return `
        <section class="window">
          <div class="window-title">Lines ${window.startLine}-${window.endLine}</div>
          <table class="code-table">
            <tbody>
              ${rows}
            </tbody>
          </table>
          <div class="provenance-grid">
            ${provenance}
          </div>
        </section>
      `;
    })
    .join("\n");
}

export function renderHtmlReport(result: AnalysisResult): string {
  const fileSections = result.files
    .map((file) => {
      const title = `<h3>${escapeHtml(file.filePath)}</h3><div class="meta">From MR <a href="${escapeHtml(file.mergeRequest.webUrl ?? "")}" target="_blank" rel="noopener">!${file.mergeRequest.iid}</a></div>`;
      if (file.skippedReason) {
        return `<section class="file">${title}<div class="meta unresolved">${escapeHtml(file.skippedReason)}</div></section>`;
      }

      return `<section class="file">${title}${renderWindow(file)}</section>`;
    })
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
        --changed: #fff7cc;
        --card: #ffffff;
        --warn: #7c2d12;
      }
      body { margin: 0; font-family: "Segoe UI", Tahoma, sans-serif; background: var(--bg); color: var(--fg); }
      main { max-width: 1080px; margin: 0 auto; padding: 20px; }
      h1, h2, h3 { margin-bottom: 8px; }
      .meta { color: var(--muted); font-size: 0.9rem; margin-bottom: 6px; }
      .file, .window, .provenance-card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; }
      .file { padding: 16px; margin-top: 18px; }
      .window { margin-top: 14px; overflow: hidden; }
      .window-title { padding: 8px 12px; border-bottom: 1px solid var(--line); font-weight: 600; }
      .code-table { width: 100%; border-collapse: collapse; }
      .code-table td { border-bottom: 1px solid var(--line); padding: 4px 8px; vertical-align: top; }
      .ln { width: 56px; color: var(--muted); text-align: right; user-select: none; }
      tr.changed td { background: var(--changed); }
      code { white-space: pre-wrap; word-break: break-word; font-family: "Consolas", "Courier New", monospace; }
      .provenance-grid { display: grid; grid-template-columns: 1fr; gap: 10px; padding: 10px; }
      .provenance-card { padding: 10px; }
      .label { font-weight: 600; color: var(--fg); margin-right: 6px; }
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
      <div class="meta"><span class="label">Merged MRs analyzed</span> ${result.analyzedMergeRequests.length}</div>
      <div class="meta"><span class="label">Generated at</span> ${escapeHtml(result.generatedAt)}</div>
      ${fileSections || '<div class="file"><div class="meta">No changed files found from related merged MRs.</div></div>'}
    </main>
  </body>
</html>`;
}
