import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger, formatMessage } from "./index.js";

describe("formatMessage", () => {
  it("joins string args", () => {
    expect(formatMessage(["hello", "world"])).toBe("hello world");
  });

  it("serializes plain objects as JSON", () => {
    expect(formatMessage([{ a: 1 }])).toBe('{"a":1}');
  });

  it("serializes Errors by message", () => {
    const err = new Error("boom");
    const result = formatMessage([err]);
    expect(result).toContain("boom");
  });

  it("handles mixed args", () => {
    const result = formatMessage(["msg", { code: 42 }, new Error("oops")]);
    expect(result).toContain("msg");
    expect(result).toContain('"code":42');
    expect(result).toContain("oops");
  });
});

describe("logger (console backend)", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("has debug, info, error functions", () => {
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.error).toBe("function");
  });

  it("info writes [INFO] prefix", () => {
    logger.info("hello");
    expect(console.log).toHaveBeenCalledWith("[INFO]", "hello");
  });

  it("error writes [ERROR] prefix", () => {
    logger.error("something broke");
    expect(console.log).toHaveBeenCalledWith("[ERROR]", "something broke");
  });

  it("debug writes [DEBUG] prefix in dev", () => {
    logger.debug("verbose");
    expect(console.log).toHaveBeenCalledWith("[DEBUG]", "verbose");
  });

  it("debug replaces newlines in string args", () => {
    logger.debug("line1\nline2");
    expect(console.log).toHaveBeenCalledWith("[DEBUG]", "line1 line2");
  });
});
