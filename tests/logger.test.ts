import { afterEach, describe, expect, it, vi } from "vitest";
import { Logger } from "../src/logger.js";

describe("Logger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not write logs when verbose level is 0", () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const logger = new Logger(0);

    logger.log("progress");
    logger.logPayload("payload", { id: 1 });

    expect(writeSpy).not.toHaveBeenCalled();
  });

  it("writes progress logs at verbose level 1 but not payload logs", () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const logger = new Logger(1);

    logger.log("progress");
    logger.logPayload("payload", { id: 1 });

    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(String(writeSpy.mock.calls[0]?.[0])).toContain("progress");
  });

  it("writes payload logs at verbose level 2", () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const logger = new Logger(2);

    logger.logPayload("GraphQL request payload", { query: "query Test { id }", variables: { iid: 42 } });

    expect(writeSpy).toHaveBeenCalledTimes(1);
    const output = String(writeSpy.mock.calls[0]?.[0]);
    expect(output).toContain("GraphQL request payload");
    expect(output).toContain('"iid":42');
  });
});
