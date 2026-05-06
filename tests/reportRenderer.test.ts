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
    expect(html).toContain('<th><a href="https://gitlab.example.com/group/project/-/blame/1234567890abcdef1234567890abcdef12345678/src/file.ts" target="_blank" rel="noopener">Code after commit</a></th>');
    expect(html).toContain('<th><a href="https://gitlab.example.com/group/project/-/blame/parent-sha/src/file.ts" target="_blank" rel="noopener">Code before commit</a></th>');
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

  it("filters the currently analyzed issue from overview rows", () => {
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

  it("renders overview table with -n/p counts per origin issue and file column", () => {
    const result = buildResult([
      {
        filePath: "src/feature.ts",
        oldPath: "src/feature.ts",
        fileTypeName: "Production",
        fileTypeIcon: "🏭",
        fileTypeDisplayOrder: 1,
        chunks: [
          {
            oldStart: 1,
            oldCount: 3,
            newStart: 1,
            newCount: 1,
            rows: [
              {
                lineNumber: 1,
                afterText: "modified-line",
                beforeText: "modified-line-old",
                previousCommitSha: "1111111111111111111111111111111111111111",
                previousMergeRequestIssues: [
                  { iid: 42, title: "Origin issue A", webUrl: "https://gitlab.example.com/group/project/-/issues/42" },
                ],
                rowKind: "paired",
              },
              {
                lineNumber: null,
                afterText: "",
                beforeText: "deleted-line-1",
                previousCommitSha: "2222222222222222222222222222222222222222",
                previousMergeRequestIssues: [
                  { iid: 42, title: "Origin issue A", webUrl: "https://gitlab.example.com/group/project/-/issues/42" },
                ],
                rowKind: "removed",
              },
              {
                lineNumber: null,
                afterText: "",
                beforeText: "deleted-line-2",
                previousCommitSha: "2222222222222222222222222222222222222222",
                previousMergeRequestIssues: [
                  { iid: 42, title: "Origin issue A", webUrl: "https://gitlab.example.com/group/project/-/issues/42" },
                ],
                rowKind: "removed",
              },
            ],
          },
        ],
      },
    ]);

    const html = renderHtmlReports([result], [], {
      fileTypes: [
        { typeName: "Production", icon: "🏭", displayOrder: 1, projectPathGlobs: [], filePathGlobs: ["src/**"] },
        { typeName: "Files", icon: "📄", displayOrder: 99, projectPathGlobs: [], filePathGlobs: [] },
      ],
    });
    const overviewSection = html.match(/<section class="overview">[\s\S]*?<\/section>/)?.[0] ?? "";

    expect(overviewSection).toContain('<table class="overview-table">');
    expect(overviewSection).toContain("🏭");
    expect(overviewSection).toContain('class="overview-filename-rotated">src/feature.ts</span>');
    expect(overviewSection).toContain("#42: Origin issue A");
    expect(overviewSection).toContain(">-2/1<");
  });

  it("sorts overview rows by most recent merged_at of the origin MR (desc)", () => {
    const result = buildResult([
      {
        filePath: "src/feature.ts",
        oldPath: "src/feature.ts",
        fileTypeName: "Files",
        fileTypeIcon: "📄",
        fileTypeDisplayOrder: 1,
        chunks: [
          {
            oldStart: 1,
            oldCount: 2,
            newStart: 1,
            newCount: 2,
            rows: [
              {
                lineNumber: 1,
                afterText: "a-after",
                beforeText: "a-before",
                previousMergeRequest: {
                  projectId: 1,
                  iid: 100,
                  title: "Older MR",
                  webUrl: "https://gitlab.example.com/group/project/-/merge_requests/100",
                  mergedAt: "2025-01-01T00:00:00.000Z",
                },
                previousMergeRequestIssues: [
                  { iid: 1, title: "Older origin", webUrl: "https://gitlab.example.com/group/project/-/issues/1" },
                ],
                rowKind: "paired",
              },
              {
                lineNumber: 2,
                afterText: "b-after",
                beforeText: "b-before",
                previousMergeRequest: {
                  projectId: 1,
                  iid: 200,
                  title: "Newer MR",
                  webUrl: "https://gitlab.example.com/group/project/-/merge_requests/200",
                  mergedAt: "2026-01-01T00:00:00.000Z",
                },
                previousMergeRequestIssues: [
                  { iid: 2, title: "Newer origin", webUrl: "https://gitlab.example.com/group/project/-/issues/2" },
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
    const newerIndex = overviewSection.indexOf("Newer origin");
    const olderIndex = overviewSection.indexOf("Older origin");

    expect(newerIndex).toBeGreaterThan(0);
    expect(olderIndex).toBeGreaterThan(0);
    expect(newerIndex).toBeLessThan(olderIndex);
  });

  it("sorts overview columns by file type displayOrder", () => {
    const result = buildResult([
      {
        filePath: "tests/feature.test.ts",
        oldPath: "tests/feature.test.ts",
        fileTypeName: "Tests",
        fileTypeIcon: "🧪",
        fileTypeDisplayOrder: 2,
        chunks: [
          {
            oldStart: 1,
            oldCount: 1,
            newStart: 1,
            newCount: 1,
            rows: [
              {
                lineNumber: 1,
                afterText: "t-after",
                beforeText: "t-before",
                previousMergeRequestIssues: [
                  { iid: 7, title: "Origin", webUrl: "https://gitlab.example.com/group/project/-/issues/7" },
                ],
                rowKind: "paired",
              },
            ],
          },
        ],
      },
      {
        filePath: "src/feature.ts",
        oldPath: "src/feature.ts",
        fileTypeName: "Production",
        fileTypeIcon: "🏭",
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
                afterText: "p-after",
                beforeText: "p-before",
                previousMergeRequestIssues: [
                  { iid: 7, title: "Origin", webUrl: "https://gitlab.example.com/group/project/-/issues/7" },
                ],
                rowKind: "paired",
              },
            ],
          },
        ],
      },
    ]);

    const html = renderHtmlReports([result], [], {
      fileTypes: [
        { typeName: "Production", icon: "🏭", displayOrder: 1, projectPathGlobs: [], filePathGlobs: ["src/**"] },
        { typeName: "Tests", icon: "🧪", displayOrder: 2, projectPathGlobs: [], filePathGlobs: ["tests/**"] },
        { typeName: "Files", icon: "📄", displayOrder: 99, projectPathGlobs: [], filePathGlobs: [] },
      ],
    });
    const overviewSection = html.match(/<section class="overview">[\s\S]*?<\/section>/)?.[0] ?? "";
    const productionIndex = overviewSection.indexOf("src/feature.ts");
    const testsIndex = overviewSection.indexOf("tests/feature.test.ts");

    expect(productionIndex).toBeGreaterThan(0);
    expect(testsIndex).toBeGreaterThan(0);
    expect(productionIndex).toBeLessThan(testsIndex);
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

  it("renders beforeLineNumber in the before-line column and beforeText in the before-code column", () => {
    const result = buildResult([
      {
        filePath: "src/file.ts",
        oldPath: "src/file.ts",
        fileTypeName: "Files",
        fileTypeIcon: "📄",
        fileTypeDisplayOrder: 1,
        chunks: [
          {
            oldStart: 8,
            oldCount: 3,
            newStart: 10,
            newCount: 3,
            rows: [
              {
                lineNumber: 10,
                beforeLineNumber: 8,
                afterText: "after-code",
                beforeText: "before-code",
                rowKind: "paired",
              },
            ],
          },
        ],
      },
    ]);

    const html = renderHtmlReport(result);

    expect(html).toContain('<td class="ln">10</td>');
    expect(html).toContain('<td class="ln">8</td>');
    expect(html).toContain("<code>after-code</code>");
    expect(html).toContain("<code>before-code</code>");
  });

  it("renders beforeText for context rows and no beforeLineNumber when absent", () => {
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
            oldCount: 1,
            newStart: 5,
            newCount: 1,
            rows: [
              {
                lineNumber: 5,
                afterText: "context-code",
                beforeText: "context-code",
                rowKind: "context",
              },
            ],
          },
        ],
      },
    ]);

    const html = renderHtmlReport(result);

    expect(html).toContain('<td class="ln">5</td>');
    expect(html).toContain('<td class="ln"></td>');
    expect((html.match(/<code>context-code<\/code>/g) ?? []).length).toBe(2);
  });

  it("renders the Line column header before Code before commit", () => {
    const result = buildResult([
      {
        filePath: "src/file.ts",
        oldPath: "src/file.ts",
        fileTypeName: "Files",
        fileTypeIcon: "📄",
        fileTypeDisplayOrder: 1,
        chunks: [
          {
            oldStart: 1,
            oldCount: 1,
            newStart: 1,
            newCount: 1,
            rows: [{ lineNumber: 1, afterText: "line", rowKind: "added" }],
          },
        ],
      },
    ]);
    const html = renderHtmlReport(result);
    const headerRow = html.match(/<thead>.*?<\/thead>/s)?.[0] ?? "";

    expect(headerRow).toContain("Code after commit");
    expect(headerRow).toContain("Code before commit");
    const afterIndex = headerRow.indexOf("Code after commit");
    const lineBeforeIndex = headerRow.lastIndexOf('<th class="ln">Line</th>');
    const codeBeforeIndex = headerRow.indexOf("Code before commit");
    expect(afterIndex).toBeLessThan(lineBeforeIndex);
    expect(lineBeforeIndex).toBeLessThan(codeBeforeIndex);
  });

  it("separator row contains seven ellipsis cells", () => {
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
            rows: [{ lineNumber: 10, afterText: "first", rowKind: "added" }],
          },
          {
            oldStart: 30,
            oldCount: 1,
            newStart: 30,
            newCount: 1,
            rows: [{ lineNumber: 30, afterText: "second", rowKind: "added" }],
          },
        ],
      },
    ]);

    const html = renderHtmlReport(result);
    const separatorRow = html.match(/<tr class="row-separator">.*?<\/tr>/s)?.[0] ?? "";

    expect((separatorRow.match(/>…</g) ?? []).length).toBe(7);
  });

  it("renders full commit tooltip with message and author/committer metadata", () => {
    const result = buildResult([
      {
        filePath: "src/file.ts",
        oldPath: "src/file.ts",
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
                afterText: "after",
                beforeText: "before",
                previousCommitSha: "abcdef123456abcdef123456abcdef1234567890",
                previousCommitWebUrl: "https://gitlab.example.com/group/project/-/commit/abcdef123456",
                previousCommitMessage: "Fix: resolve null pointer\n\nDetailed explanation.",
                previousCommitMeta: {
                  authorName: "Ada Lovelace",
                  authorEmail: "ada@example.com",
                  authoredAt: "2026-01-10T09:00:00.000Z",
                  committerName: "Grace Hopper",
                  committerEmail: "grace@example.com",
                  committedAt: "2026-01-10T10:00:00.000Z",
                },
                rowKind: "paired",
              },
            ],
          },
        ],
      },
    ]);

    const html = renderHtmlReport(result);

    expect(html).toContain("Fix: resolve null pointer");
    expect(html).toContain("Detailed explanation.");
    expect(html).toContain("Author: Ada Lovelace &lt;ada@example.com&gt;");
    expect(html).toContain("Authored: 2026-01-10T09:00:00.000Z");
    expect(html).toContain("Committer: Grace Hopper &lt;grace@example.com&gt;");
    expect(html).toContain("Committed: 2026-01-10T10:00:00.000Z");
    expect(html).toContain('href="https://gitlab.example.com/group/project/-/commit/abcdef123456"');
  });

  it("renders tooltip with only meta when message is absent", () => {
    const result = buildResult([
      {
        filePath: "src/file.ts",
        oldPath: "src/file.ts",
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
                afterText: "after",
                beforeText: "before",
                previousCommitSha: "abcdef123456abcdef123456abcdef1234567890",
                previousCommitWebUrl: "https://gitlab.example.com/group/project/-/commit/abcdef123456",
                previousCommitMeta: {
                  authorName: "Ada Lovelace",
                  authorEmail: null,
                  authoredAt: "2026-01-10T09:00:00.000Z",
                  committerName: null,
                  committerEmail: null,
                  committedAt: null,
                },
                rowKind: "paired",
              },
            ],
          },
        ],
      },
    ]);

    const html = renderHtmlReport(result);

    const tooltip = html.match(/title="([^"]*)"/)?.[1] ?? "";
    expect(tooltip).toContain("Author: Ada Lovelace");
    expect(tooltip).toContain("Authored: 2026-01-10T09:00:00.000Z");
    expect(tooltip).not.toContain("Committer:");
  });

  it("renders commit SHA without title attribute when neither message nor meta is present", () => {
    const result = buildResult([
      {
        filePath: "src/file.ts",
        oldPath: "src/file.ts",
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
                afterText: "after",
                beforeText: "before",
                previousCommitSha: "abcdef123456abcdef123456abcdef1234567890",
                previousCommitWebUrl: "https://gitlab.example.com/group/project/-/commit/abcdef123456",
                rowKind: "paired",
              },
            ],
          },
        ],
      },
    ]);

    const html = renderHtmlReport(result);

    expect(html).toContain('<a href="https://gitlab.example.com/group/project/-/commit/abcdef123456" target="_blank"');
    expect(html).not.toContain(" title=");
  });

  it("renders MR tooltip with title, author, assignees, reviewers, created and merged dates", () => {
    const result = buildResult([
      {
        filePath: "src/file.ts",
        oldPath: "src/file.ts",
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
                afterText: "after",
                beforeText: "before",
                previousMergeRequest: {
                  projectId: 1,
                  iid: 42,
                  title: "Implement feature X",
                  webUrl: "https://gitlab.example.com/group/project/-/merge_requests/42",
                  authorName: "Ada Lovelace",
                  assignees: ["Grace Hopper", "Alan Turing"],
                  reviewers: ["Barbara Liskov"],
                  createdAt: "2026-01-01T08:00:00.000Z",
                  mergedAt: "2026-01-05T12:00:00.000Z",
                },
                rowKind: "paired",
              },
            ],
          },
        ],
      },
    ]);

    const html = renderHtmlReport(result);
    const mrLink = html.match(/<a href="https:\/\/gitlab\.example\.com\/group\/project\/-\/merge_requests\/42"[^>]*>/)?.[0] ?? "";

    expect(mrLink).toContain("Implement feature X");
    expect(mrLink).toContain("Author: Ada Lovelace");
    expect(mrLink).toContain("Assignees: Grace Hopper, Alan Turing");
    expect(mrLink).toContain("Reviewers: Barbara Liskov");
    expect(mrLink).toContain("Created: 2026-01-01T08:00:00.000Z");
    expect(mrLink).toContain("Merged: 2026-01-05T12:00:00.000Z");
  });

  it("renders issue cell with #iid prefix and tooltip with author, assignees, dates", () => {
    const result = buildResult([
      {
        filePath: "src/file.ts",
        oldPath: "src/file.ts",
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
                afterText: "after",
                beforeText: "before",
                previousMergeRequestIssues: [
                  {
                    iid: 123,
                    title: "Fix null pointer bug",
                    webUrl: "https://gitlab.example.com/group/project/-/issues/123",
                    authorName: "Ada Lovelace",
                    assignees: ["Grace Hopper"],
                    createdAt: "2026-01-02T09:00:00.000Z",
                    closedAt: "2026-01-06T17:00:00.000Z",
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

    // The table cell link includes #iid: prefix and tooltip; the overview link uses plain title only.
    expect(html).toContain(">#123: Fix null pointer bug<");
    const issueTitleAttr = [...html.matchAll(/title="([^"]*)"/gs)]
      .map((m) => m[1])
      .find((t) => t.includes("Author: Ada Lovelace")) ?? "";
    expect(issueTitleAttr).toContain("Author: Ada Lovelace");
    expect(issueTitleAttr).toContain("Assignees: Grace Hopper");
    expect(issueTitleAttr).toContain("Created: 2026-01-02T09:00:00.000Z");
    expect(issueTitleAttr).toContain("Closed: 2026-01-06T17:00:00.000Z");
  });

  it("renders issue cell with title only when iid is absent", () => {
    const result = buildResult([
      {
        filePath: "src/file.ts",
        oldPath: "src/file.ts",
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
                afterText: "after",
                beforeText: "before",
                previousMergeRequestIssues: [
                  {
                    title: "Some issue without iid",
                    webUrl: "https://gitlab.example.com/group/project/-/issues/99",
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

    expect(html).toContain(">Some issue without iid<");
    expect(html).not.toContain("#undefined");
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
    expect(html).toContain("<td><code></code></td><td class=\"ln\"></td><td><code>removed-line</code></td>");
  });
});
