import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/cli.js";

const BASE_ARGS = ["node", "cli.js", "--issue-url", "https://gitlab.example.com/group/project/-/issues/1"];

describe("parseArgs --conf-file", () => {
  it("defaults confFile to regrizer.yaml when not provided", () => {
    const result = parseArgs(BASE_ARGS);

    expect(result.confFile).toBe("regrizer.yaml");
  });

  it("uses the provided --conf-file value", () => {
    const result = parseArgs([...BASE_ARGS, "--conf-file", "/custom/path/my-config.yaml"]);

    expect(result.confFile).toBe("/custom/path/my-config.yaml");
  });

  it("throws when --conf-file is given without a value", () => {
    expect(() => parseArgs([...BASE_ARGS, "--conf-file"])).toThrow("Missing value for --conf-file");
  });
});

describe("parseArgs --output", () => {
  it("defaults output to report.html", () => {
    const result = parseArgs(BASE_ARGS);

    expect(result.output).toBe("report.html");
  });

  it("uses the provided --output value", () => {
    const result = parseArgs([...BASE_ARGS, "--output", "custom.html"]);

    expect(result.output).toBe("custom.html");
  });
});

describe("parseArgs --verbose", () => {
  it("defaults verboseLevel to 0", () => {
    expect(parseArgs(BASE_ARGS).verboseLevel).toBe(0);
  });

  it("increments verboseLevel per --verbose flag", () => {
    expect(parseArgs([...BASE_ARGS, "--verbose"]).verboseLevel).toBe(1);
    expect(parseArgs([...BASE_ARGS, "--verbose", "--verbose"]).verboseLevel).toBe(2);
  });
});

describe("parseArgs --display", () => {
  it("defaults display to false", () => {
    expect(parseArgs(BASE_ARGS).display).toBe(false);
  });

  it("sets display to true when flag is present", () => {
    expect(parseArgs([...BASE_ARGS, "--display"]).display).toBe(true);
  });
});

describe("parseArgs issue URLs", () => {
  it("collects multiple --issue-url values", () => {
    const result = parseArgs([
      "node", "cli.js",
      "--issue-url", "https://gitlab.example.com/group/project/-/issues/1",
      "--issue-url", "https://gitlab.example.com/group/project/-/issues/2",
    ]);

    expect(result.issueUrls).toEqual([
      "https://gitlab.example.com/group/project/-/issues/1",
      "https://gitlab.example.com/group/project/-/issues/2",
    ]);
  });

  it("throws when no issue URL is provided", () => {
    expect(() => parseArgs(["node", "cli.js"])).toThrow("Missing required issue URL input");
  });

  it("throws for unknown flags", () => {
    expect(() => parseArgs([...BASE_ARGS, "--unknown-flag", "value"])).toThrow("Unknown flag: --unknown-flag");
  });
});
