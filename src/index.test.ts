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

  it("has all severity functions", () => {
    for (const method of ["debug", "info", "notice", "warning", "error", "critical", "alert", "emergency"]) {
      expect(typeof logger[method as keyof typeof logger]).toBe("function");
    }
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

  it("debug passes trailing context object through", () => {
    logger.debug("user logged in", { userId: "123", action: "login" });
    expect(console.log).toHaveBeenCalledWith("[DEBUG]", "user logged in", { userId: "123", action: "login" });
  });

  it("info passes trailing context object through", () => {
    logger.info("request handled", { method: "GET", status: 200 });
    expect(console.log).toHaveBeenCalledWith("[INFO]", "request handled", { method: "GET", status: 200 });
  });

  it("error passes trailing context object through", () => {
    logger.error("request failed", { method: "POST", status: 500 });
    expect(console.log).toHaveBeenCalledWith("[ERROR]", "request failed", { method: "POST", status: 500 });
  });

  it("notice writes [NOTICE] prefix", () => {
    logger.notice("normal but significant");
    expect(console.log).toHaveBeenCalledWith("[NOTICE]", "normal but significant");
  });

  it("warning writes [WARNING] prefix", () => {
    logger.warning("disk space low");
    expect(console.log).toHaveBeenCalledWith("[WARNING]", "disk space low");
  });

  it("critical writes [CRITICAL] prefix", () => {
    logger.critical("primary db down");
    expect(console.log).toHaveBeenCalledWith("[CRITICAL]", "primary db down");
  });

  it("alert writes [ALERT] prefix", () => {
    logger.alert("data loss imminent");
    expect(console.log).toHaveBeenCalledWith("[ALERT]", "data loss imminent");
  });

  it("emergency writes [EMERGENCY] prefix", () => {
    logger.emergency("system unusable");
    expect(console.log).toHaveBeenCalledWith("[EMERGENCY]", "system unusable");
  });
});
