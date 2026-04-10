import { describe, expect, it } from "vitest";
import { matchesAnyGlob } from "../src/globMatcher.js";

describe("matchesAnyGlob", () => {
  it("returns false when glob list is empty", () => {
    expect(matchesAnyGlob("src/foo.ts", [])).toBe(false);
  });

  it("matches '*' within a segment", () => {
    expect(matchesAnyGlob("src/foo.ts", ["src/*.ts"])).toBe(true);
    expect(matchesAnyGlob("src/nested/foo.ts", ["src/*.ts"])).toBe(false);
  });

  it("matches '**' across segments", () => {
    expect(matchesAnyGlob("src/foo.ts", ["src/**/*.ts"])).toBe(true);
    expect(matchesAnyGlob("src/nested/foo.ts", ["src/**/*.ts"])).toBe(true);
  });

  it("matches a directory prefix with '**/'", () => {
    expect(matchesAnyGlob("src/foo.ts", ["**/foo.ts"])).toBe(true);
    expect(matchesAnyGlob("foo.ts", ["**/foo.ts"])).toBe(true);
  });

  it("matches a directory suffix with '/**'", () => {
    expect(matchesAnyGlob("src", ["src/**"])).toBe(true);
    expect(matchesAnyGlob("src/", ["src/**"])).toBe(true);
    expect(matchesAnyGlob("src/foo/bar.ts", ["src/**"])).toBe(true);
  });

  it("normalizes Windows path separators", () => {
    expect(matchesAnyGlob("src\\foo.test.ts", ["src/**/*.test.ts"])).toBe(true);
  });
});
