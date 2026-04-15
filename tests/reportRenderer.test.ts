import { describe, expect, it } from "vitest";
import { renderHtmlReport, renderHtmlReports } from "../src/reportRenderer.js";
import { AnalysisResult, ReportChunk, ReportCommit, ReportCommitFile } from "../src/types.js";

function buildResult(files: ReportCommitFile[]): AnalysisResult {
  const commit: ReportCommit = {
    sha: "1234567890abcdef1234567890abcdef12345678",
    shortSha: "1234567890ab",
    title: "Test commit",
    message: "Test commit message",
    committedAt: "2026-03-30T00:00:00.000Z",
    committerName: "Ada Lovelace",
    committerEmail: "ada@example.com",
    webUrl: "https://gitlab.example.com/group/project/-/commit/1234567890abcdef",
    parentIds: ["parent-sha"],
    files,
  };

  return {
    inputIssue: {
      id: 1,
      iid: 10,
      title: "Issue title",
      web_url: "https://gitlab.example.com/group/project/-/issues/10",
    },
    project: {
      id: 1,
      path_with_namespace: "group/project",
      web_url: "https://gitlab.example.com/group/project",
    },
    mergeRequests: [
      {
        mr: {
          projectId: 1,
          projectPathWithNamespace: "group/project",
          projectWebUrl: "https://gitlab.example.com/group/project",
          iid: 99,
          title: "MR title",
          webUrl: "https://gitlab.example.com/group/project/-/merge_requests/99",
          authorName: "Grace Hopper",
          assignees: ["Linus Torvalds", "Margaret Hamilton"],
          reviewers: ["Barbara Liskov"],
        },
        mergedAt: "2026-03-30T00:00:00.000Z",
        commits: [commit],
      },
    ],
    generatedAt: "2026-03-30T00:00:00.000Z",
  };
}

describe("renderHtmlReport", () => {
  it("renders one table per file and inserts ellipsis row between non-overlapping chunks within the file", () => {
    const result = buildResult([
      {
        filePath: "src/file.ts",
        oldPath: "src/file.ts",
        fileTypeName: "Files",
        fileTypeIcon: "📄",
        fileTypeDisplayOrder: 1,
        chunks: [
          {
            oldStart: 10,
            oldCount: 1,
            newStart: 10,
            newCount: 1,
            rows: [
              {
                lineNumber: 10,
                afterText: "first-row",
                beforeText: "first-row-old",
                previousCommitSha: "aaaaaaaaaaaa1111111111111111111111111111",
                previousCommitWebUrl: "https://gitlab.example.com/group/project/-/commit/aaaaaaaaaaaa1111111111111111111111111111",
                rowKind: "paired",
              },
            ],
          },
          {
            oldStart: 30,
            oldCount: 1,
            newStart: 30,
            newCount: 1,
            rows: [
              {
                lineNumber: 30,
                afterText: "second-row",
                beforeText: "second-row-old",
                previousCommitSha: "bbbbbbbbbbbb2222222222222222222222222222",
                previousCommitWebUrl: "https://gitlab.example.com/group/project/-/commit/bbbbbbbbbbbb2222222222222222222222222222",
                rowKind: "paired",
              },
            ],
          },
        ],
      },
      {
        filePath: "src/other.ts",
        oldPath: "src/other.ts",
        fileTypeName: "Files",
        fileTypeIcon: "📄",
        fileTypeDisplayOrder: 1,
        chunks: [
          {
            oldStart: 2,
            oldCount: 1,
            newStart: 2,
            newCount: 1,
            rows: [
              {
                lineNumber: 2,
                afterText: "other-file-row",
                beforeText: "other-file-row-old",
                previousCommitSha: "1111111111111111111111111111111111111111",
                previousCommitWebUrl: "https://gitlab.example.com/group/project/-/commit/1111111111111111111111111111111111111111",
                rowKind: "paired",
              },
            ],
          },
        ],
      },
    ]);

    const html = renderHtmlReport(result);

    expect((html.match(/<table class="code-table">/g) ?? []).length).toBe(2);
    expect((html.match(/<tr class="row-separator">/g) ?? []).length).toBe(1);
    expect((html.match(/>…</g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect(html).toContain('<div class="meta"><span class="label">Project</span> <a href="https://gitlab.example.com/group/project" target="_blank" rel="noopener">group/project</a></div>');
    expect(html).toContain("Committed 2026-03-30T00:00:00.000Z · Committer: Ada Lovelace &lt;ada@example.com&gt;");
    expect(html).toContain("Merged 2026-03-30T00:00:00.000Z · Author: Grace Hopper · Assignees: Linus Torvalds, Margaret Hamilton · Reviewers: Barbara Liskov");
  });

  it("merges overlapping chunks in the same file and does not render separator between them", () => {
    const result = buildResult([
      {
        filePath: "src/file.ts",
        oldPath: "src/file.ts",
        fileTypeName: "Files",
        fileTypeIcon: "📄",
        fileTypeDisplayOrder: 1,
        chunks: [
          {
            oldStart: 5,
            oldCount: 2,
            newStart: 5,
            newCount: 2,
            rows: [
              {
                lineNumber: 5,
                afterText: "shared-line",
                beforeText: "shared-line-old",
                previousCommitSha: "cccccccccccc3333333333333333333333333333",
                previousCommitWebUrl: "https://gitlab.example.com/group/project/-/commit/cccccccccccc3333333333333333333333333333",
                rowKind: "paired",
              },
              {
                lineNumber: 6,
                afterText: "tail-line",
                beforeText: "tail-line-old",
                previousCommitSha: "dddddddddddd4444444444444444444444444444",
                previousCommitWebUrl: "https://gitlab.example.com/group/project/-/commit/dddddddddddd4444444444444444444444444444",
                rowKind: "paired",
              },
            ],
          },
          {
            oldStart: 6,
            oldCount: 2,
            newStart: 6,
            newCount: 2,
            rows: [
              {
                lineNumber: 6,
                afterText: "tail-line",
                beforeText: "tail-line-old",
                previousCommitSha: "dddddddddddd4444444444444444444444444444",
                previousCommitWebUrl: "https://gitlab.example.com/group/project/-/commit/dddddddddddd4444444444444444444444444444",
                rowKind: "paired",
              },
              {
                lineNumber: 7,
                afterText: "new-overlap-row",
                beforeText: "new-overlap-row-old",
                previousCommitSha: "eeeeeeeeeeee5555555555555555555555555555",
                previousCommitWebUrl: "https://gitlab.example.com/group/project/-/commit/eeeeeeeeeeee5555555555555555555555555555",
                rowKind: "paired",
              },
            ],
          },
        ],
      },
    ]);

    const html = renderHtmlReport(result);

    expect(html).not.toContain("<tr class=\"row-separator\">");
    expect((html.match(/<code>tail-line<\/code>/g) ?? []).length).toBe(1);
    expect((html.match(/<table class=\"code-table\">/g) ?? []).length).toBe(1);
  });

  it("adds ellipsis rows at beginning and end when file boundaries are outside rendered rows", () => {
    const result = buildResult([
      {
        filePath: "src/file.ts",
        oldPath: "src/file.ts",
        fileLineCount: 100,
        fileTypeName: "Files",
        fileTypeIcon: "📄",
        fileTypeDisplayOrder: 1,
        chunks: [
          {
            oldStart: 40,
            oldCount: 1,
            newStart: 40,
            newCount: 1,
            rows: [
              {
                lineNumber: 40,
                afterText: "middle-line",
                beforeText: "middle-line-old",
                previousCommitSha: "ffffffffffff6666666666666666666666666666",
                previousCommitWebUrl: "https://gitlab.example.com/group/project/-/commit/ffffffffffff6666666666666666666666666666",
                rowKind: "paired",
              },
            ],
          },
        ],
      },
    ]);

    const html = renderHtmlReport(result);

    expect((html.match(/<tr class="row-separator">/g) ?? []).length).toBe(2);
    expect(html).toMatch(/<tbody>\s*<tr class="row-separator">/);
    expect(html).toMatch(/<tr class="row-separator">[\s\S]*<\/tr>\s*<\/tbody>/);
  });

  it("filters the currently analyzed issue from overview origin-issue cells", () => {
    const result = buildResult([
      {
        filePath: "src/origin.ts",
        oldPath: "src/origin.ts",
        fileTypeName: "Files",
        fileTypeIcon: "📄",
        fileTypeDisplayOrder: 1,
        chunks: [
          {
            oldStart: 1,
            oldCount: 1,
            newStart: 1,
            newCount: 1,
            rows: [
              {
                lineNumber: 1,
                afterText: "line-after",
                beforeText: "line-before",
                previousCommitSha: "abababababab1111111111111111111111111111",
                previousCommitWebUrl: "https://gitlab.example.com/group/project/-/commit/abababababab1111111111111111111111111111",
                previousMergeRequestIssues: [
                  {
                    title: "CURRENT_ORIGIN_SHOULD_HIDE",
                    webUrl: "https://gitlab.example.com/group/project/-/issues/10",
                  },
                  {
                    title: "OTHER_ORIGIN_SHOULD_REMAIN",
                    webUrl: "https://gitlab.example.com/group/project/-/issues/42",
                  },
                ],
                rowKind: "paired",
              },
            ],
          },
        ],
      },
    ]);

    const html = renderHtmlReport(result);
    const overviewSection = html.match(/<section class="overview">[\s\S]*?<\/section>/)?.[0] ?? "";

    expect(overviewSection).not.toContain("CURRENT_ORIGIN_SHOULD_HIDE");
    expect(overviewSection).toContain("OTHER_ORIGIN_SHOULD_REMAIN");
  });

  it("dims all provenance cells when current issue is among related issues", () => {
    const result = buildResult([
      {
        filePath: "src/provenance.ts",
        oldPath: "src/provenance.ts",
        fileTypeName: "Files",
        fileTypeIcon: "📄",
        fileTypeDisplayOrder: 1,
        chunks: [
          {
            oldStart: 1,
            oldCount: 1,
            newStart: 1,
            newCount: 1,
            rows: [
              {
                lineNumber: 1,
                afterText: "line-after",
                beforeText: "line-before",
                previousCommitSha: "cdcdcdcdcdcd2222222222222222222222222222",
                previousCommitWebUrl: "https://gitlab.example.com/group/project/-/commit/cdcdcdcdcdcd2222222222222222222222222222",
                previousMergeRequest: {
                  projectId: 1,
                  iid: 77,
                  webUrl: "https://gitlab.example.com/group/project/-/merge_requests/77",
                },
                previousMergeRequestIssues: [
                  {
                    title: "Current issue relation",
                    webUrl: "https://gitlab.example.com/group/project/-/issues/10",
                  },
                ],
                rowKind: "paired",
              },
            ],
          },
        ],
      },
    ]);

    const html = renderHtmlReport(result);

    expect(html).toContain('class="provenance provenance-commit provenance-dimmed"');
    expect(html).toContain('class="provenance provenance-mr provenance-dimmed"');
    expect(html).toContain('class="provenance provenance-issues provenance-dimmed"');
  });

  it("renders generated timestamp once at report level", () => {
    const first = buildResult([]);
    const second = buildResult([]);
    second.generatedAt = "2027-01-01T00:00:00.000Z";

    const html = renderHtmlReports([first, second]);

    expect((html.match(/Generated at /g) ?? []).length).toBe(1);
    expect(html).toContain(`Generated at ${first.generatedAt}`);
  });

  it("keeps empty code cells at consistent height via code-table CSS", () => {
    const result = buildResult([
      {
        filePath: "src/deleted.ts",
        oldPath: "src/deleted.ts",
        fileTypeName: "Files",
        fileTypeIcon: "📄",
        fileTypeDisplayOrder: 1,
        chunks: [
          {
            oldStart: 1,
            oldCount: 1,
            newStart: 0,
            newCount: 0,
            rows: [
              {
                lineNumber: null,
                afterText: "",
                beforeText: "removed-line",
                rowKind: "removed",
              },
            ],
          },
        ],
      },
    ]);

    const html = renderHtmlReport(result);

    expect(html).toContain(".code-table td > code { display: inline-block; min-height: 1em; }");
    expect(html).toContain('<tr class="row-removed">');
    expect(html).toContain("<td><code></code></td><td><code>removed-line</code></td>");
  });
});
