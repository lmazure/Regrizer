import { describe, expect, it } from "vitest";
import { chunkSortedNumbers, parseGitLabIssueUrl } from "../src/utils.js";

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

describe("chunkSortedNumbers", () => {
  it("merges overlapping windows", () => {
    const chunks = chunkSortedNumbers([10, 12, 30], 2);

    expect(chunks).toEqual([
      { start: 8, end: 14, changed: [10, 12] },
      { start: 28, end: 32, changed: [30] },
    ]);
  });
});
