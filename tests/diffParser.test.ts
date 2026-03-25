import { describe, expect, it } from "vitest";
import { extractChangedNewLineNumbers, parseUnifiedDiffHunks } from "../src/diffParser.js";

describe("extractChangedNewLineNumbers", () => {
  it("extracts added and modified new-file lines", () => {
    const diff = [
      "@@ -1,4 +1,5 @@",
      " line1",
      "-line2",
      "+line2-new",
      " line3",
      "+line4",
      " line5",
    ].join("\n");

    expect(extractChangedNewLineNumbers(diff)).toEqual([2, 4]);
  });

  it("returns empty for no additions", () => {
    const diff = ["@@ -10,2 +10,2 @@", "-a", "-b"].join("\n");
    expect(extractChangedNewLineNumbers(diff)).toEqual([]);
  });
});

describe("parseUnifiedDiffHunks", () => {
  it("keeps unchanged boundary lines in hunk context, not in modified lines", () => {
    const diff = [
      "@@ -10,5 +10,6 @@",
      " context-before-change",
      "-old-line",
      "+new-line",
      " context-after-change",
      " context-after-change-2",
    ].join("\n");

    const hunks = parseUnifiedDiffHunks(diff);
    expect(hunks).toHaveLength(1);

    const [hunk] = hunks;
    expect(hunk.leadingContextNew.map((line) => line.text)).toEqual(["context-before-change"]);
    expect(hunk.trailingContextNew.map((line) => line.text)).toEqual(["context-after-change", "context-after-change-2"]);
    expect(hunk.beforeLines.map((line) => line.text)).toEqual(["old-line"]);
    expect(hunk.afterLines.map((line) => line.text)).toEqual(["new-line"]);
  });
});
