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

  // Timestamp pattern: "YYYY-MM-DD HH:MM:SS.mmm"
  const ts = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}/;
  const line = (emoji: string, msg: string) =>
    expect.stringMatching(new RegExp(`^${emoji}\\s+${ts.source} ${msg}$`));

  it("debug logs with 🐞 and timestamp", () => {
    logger.debug("verbose");
    expect(console.log).toHaveBeenCalledWith(line("🐞", "verbose"));
  });

  it("info logs with ℹ️ and timestamp", () => {
    logger.info("hello");
    expect(console.log).toHaveBeenCalledWith(line("ℹ️", "hello"));
  });

  it("notice logs with *️⃣ and timestamp", () => {
    logger.notice("normal but significant");
    expect(console.log).toHaveBeenCalledWith(line("\\*️⃣", "normal but significant"));
  });

  it("warning logs with ⚠️ and timestamp", () => {
    logger.warning("disk space low");
    expect(console.log).toHaveBeenCalledWith(line("⚠️", "disk space low"));
  });

  it("error logs with ⛔️ and timestamp", () => {
    logger.error("something broke");
    expect(console.log).toHaveBeenCalledWith(line("⛔️", "something broke"));
  });

  it("critical logs with ❗️ and timestamp", () => {
    logger.critical("primary db down");
    expect(console.log).toHaveBeenCalledWith(line("❗️", "primary db down"));
  });

  it("alert logs with ‼️ and timestamp", () => {
    logger.alert("data loss imminent");
    expect(console.log).toHaveBeenCalledWith(line("‼️", "data loss imminent"));
  });

  it("emergency logs with 🚨 and timestamp", () => {
    logger.emergency("system unusable");
    expect(console.log).toHaveBeenCalledWith(line("🚨", "system unusable"));
  });

  it("debug replaces newlines in string args", () => {
    logger.debug("line1\nline2");
    expect(console.log).toHaveBeenCalledWith(line("🐞", "line1 line2"));
  });

  it("debug inlines trailing context object as spaced JSON", () => {
    logger.debug("user logged in", { userId: "123", action: "login" });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('user logged in { "userId": "123", "action": "login" }')
    );
  });

  it("info inlines trailing context object as spaced JSON", () => {
    logger.info("request handled", { method: "GET", status: 200 });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('request handled { "method": "GET", "status": 200 }')
    );
  });

  it("error inlines trailing context object as spaced JSON", () => {
    logger.error("request failed", { method: "POST", status: 500 });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('request failed { "method": "POST", "status": 500 }')
    );
  });
});
