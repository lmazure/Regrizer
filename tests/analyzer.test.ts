import { describe, expect, it } from "vitest";
import { computeContextBeforeLineOffset, computeContextAfterLineOffset } from "../src/analyzer.js";

describe("computeContextBeforeLineOffset", () => {
  it("returns 0 when old and new start at the same line (no prior net change)", () => {
    expect(computeContextBeforeLineOffset(10, 10)).toBe(0);
  });

  it("returns negative offset when prior hunks added lines", () => {
    // 3 lines added before this hunk: newStart is ahead of oldStart
    expect(computeContextBeforeLineOffset(10, 13)).toBe(-3);
  });

  it("returns positive offset when prior hunks removed lines", () => {
    // 2 lines removed before this hunk: oldStart is ahead of newStart
    expect(computeContextBeforeLineOffset(12, 10)).toBe(2);
  });
});

describe("computeContextAfterLineOffset", () => {
  it("returns 0 when the hunk has equal old and new counts and no prior net change", () => {
    // oldStart=10, oldCount=5, newStart=10, newCount=5 → net change = 0
    expect(computeContextAfterLineOffset(10, 5, 10, 5)).toBe(0);
  });

  it("returns negative offset when the hunk adds lines", () => {
    // hunk adds 2 lines (oldCount=3, newCount=5): after the hunk, new side is 2 ahead
    expect(computeContextAfterLineOffset(10, 3, 10, 5)).toBe(-2);
  });

  it("returns positive offset when the hunk removes lines", () => {
    // hunk removes 3 lines (oldCount=5, newCount=2): after the hunk, old side is 3 ahead
    expect(computeContextAfterLineOffset(10, 5, 10, 2)).toBe(3);
  });

  it("accumulates prior net change and current hunk net change", () => {
    // Prior hunks added 3 lines: oldStart=10, newStart=13
    // This hunk removes 1 line: oldCount=4, newCount=3
    // After hunk: (10+4) - (13+3) = 14 - 16 = -2
    expect(computeContextAfterLineOffset(10, 4, 13, 3)).toBe(-2);
  });
});
