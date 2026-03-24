import { describe, expect, it } from "vitest";
import { extractChangedNewLineNumbers } from "../src/diffParser.js";

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
