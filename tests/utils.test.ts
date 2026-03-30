import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  chunkSortedNumbers,
  loadIssueUrlsFromFile,
  parseGitLabIssueUrl,
  parseIssueUrlsFromFileContent,
} from "../src/utils.js";

describe("parseGitLabIssueUrl", () => {
  it("parses a valid issue URL", () => {
    const parsed = parseGitLabIssueUrl("https://gitlab.example.com/group/subgroup/project/-/issues/42");

    expect(parsed.host).toBe("https://gitlab.example.com");
    expect(parsed.projectPath).toBe("group/subgroup/project");
    expect(parsed.issueIid).toBe(42);
  });

  it("parses a valid work item URL", () => {
    const parsed = parseGitLabIssueUrl("https://gitlab.example.com/group/subgroup/project/-/work_items/6244");

    expect(parsed.host).toBe("https://gitlab.example.com");
    expect(parsed.projectPath).toBe("group/subgroup/project");
    expect(parsed.issueIid).toBe(6244);
  });

  it("throws for invalid format", () => {
    expect(() => parseGitLabIssueUrl("https://gitlab.example.com/group/project/issues/1")).toThrow(
      "Issue URL must match",
    );
  });
});

describe("issue URL file helpers", () => {
  it("parses one URL per line and ignores blank lines", () => {
    const parsed = parseIssueUrlsFromFileContent(
      "  https://gitlab.example.com/group/project/-/issues/1  \n\nhttps://gitlab.example.com/group/project/-/issues/2\n",
    );

    expect(parsed).toEqual([
      "https://gitlab.example.com/group/project/-/issues/1",
      "https://gitlab.example.com/group/project/-/issues/2",
    ]);
  });

  it("loads issue URLs from file", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "regrizer-"));
    const filePath = join(tempDir, "issues.txt");
    writeFileSync(
      filePath,
      "https://gitlab.example.com/group/project/-/issues/10\nhttps://gitlab.example.com/group/project/-/issues/11\n",
      "utf-8",
    );

    expect(loadIssueUrlsFromFile(filePath)).toEqual([
      "https://gitlab.example.com/group/project/-/issues/10",
      "https://gitlab.example.com/group/project/-/issues/11",
    ]);
  });

  it("throws a readable error when file cannot be read", () => {
    expect(() => loadIssueUrlsFromFile("this-file-does-not-exist.txt")).toThrow(
      "Failed to read issue URL file this-file-does-not-exist.txt",
    );
  });
});

describe("chunkSortedNumbers", () => {
  it("merges overlapping windows", () => {
    const chunks = chunkSortedNumbers([10, 12, 30], 2);

    expect(chunks).toEqual([
      { start: 8, end: 14, changed: [10, 12] },
      { start: 28, end: 32, changed: [30] },
    ]);
  });
});
