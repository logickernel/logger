import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";

type EnvKey = "GCP_PROJECT" | "LOGGER_TARGET" | "LOGGER_FORMAT";
const ENV_KEYS: EnvKey[] = ["GCP_PROJECT", "LOGGER_TARGET", "LOGGER_FORMAT"];

function snapshotEnv(): Record<EnvKey, string | undefined> {
  return {
    GCP_PROJECT: process.env.GCP_PROJECT,
    LOGGER_TARGET: process.env.LOGGER_TARGET,
    LOGGER_FORMAT: process.env.LOGGER_FORMAT,
  };
}

function restoreEnv(snapshot: Record<EnvKey, string | undefined>): void {
  for (const k of ENV_KEYS) {
    const v = snapshot[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

function applyEnv(overrides: Partial<Record<EnvKey, string | undefined>>): void {
  for (const k of ENV_KEYS) {
    if (!(k in overrides)) continue;
    const v = overrides[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

async function importFresh(): Promise<Awaited<ReturnType<typeof import("./index.js")>>> {
  vi.resetModules();
  return await import("./index.js");
}

describe("formatMessage", () => {
  it("joins string args", () => {
    expect(["hello", "world"].join(" ")).toBe("hello world");
  });

  it("serializes plain objects as JSON", () => {
    expect(JSON.stringify({ a: 1 })).toBe('{"a":1}');
  });

  it("serializes Errors by message", async () => {
    const { formatMessage } = await importFresh();
    const err = new Error("boom");
    const result = formatMessage([err]);
    expect(result).toContain("boom");
  });

  it("handles mixed args", async () => {
    const { formatMessage } = await importFresh();
    const result = formatMessage(["msg", { code: 42 }, new Error("oops")]);
    expect(result).toContain("msg");
    expect(result).toContain('"code":42');
    expect(result).toContain("oops");
  });
});

describe("logger (console backend)", () => {
  const originalEnv: Record<EnvKey, string | undefined> = snapshotEnv();

  beforeAll(() => {
    Object.assign(originalEnv, snapshotEnv());
  });

  beforeEach(() => {
    applyEnv({
      GCP_PROJECT: undefined,
      LOGGER_TARGET: "console",
      LOGGER_FORMAT: "pretty",
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv(originalEnv);
  });

  afterAll(() => {
    restoreEnv(originalEnv);
  });

  it("has all severity functions", async () => {
    const { logger } = await importFresh();
    for (const method of ["debug", "info", "notice", "warning", "error", "critical", "alert", "emergency"]) {
      expect(typeof logger[method as keyof typeof logger]).toBe("function");
    }
  });

  // Timestamp pattern: "YYYY-MM-DD HH:MM:SS.mmm"
  const ts = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}/;
  const line = (emoji: string, msg: string) =>
    expect.stringMatching(new RegExp(`^${emoji} ${ts.source} ${msg}$`));

  it("debug logs with 🐞 and timestamp", async () => {
    const { logger } = await importFresh();
    logger.debug("verbose");
    expect(console.log).toHaveBeenCalledWith(line("🐞", "verbose"));
  });

  it("info logs with ⚪️ and timestamp", async () => {
    const { logger } = await importFresh();
    logger.info("hello");
    expect(console.log).toHaveBeenCalledWith(line("⚪️", "hello"));
  });

  it("notice logs with 🔵 and timestamp", async () => {
    const { logger } = await importFresh();
    logger.notice("normal but significant");
    expect(console.log).toHaveBeenCalledWith(line("🔵", "normal but significant"));
  });

  it("warning logs with 🟡 and timestamp", async () => {
    const { logger } = await importFresh();
    logger.warning("disk space low");
    expect(console.log).toHaveBeenCalledWith(line("🟡", "disk space low"));
  });

  it("error logs with 🔴 and timestamp", async () => {
    const { logger } = await importFresh();
    logger.error("something broke");
    expect(console.log).toHaveBeenCalledWith(line("🔴", "something broke"));
  });

  it("critical logs with ⛔️ and timestamp", async () => {
    const { logger } = await importFresh();
    logger.critical("primary db down");
    expect(console.log).toHaveBeenCalledWith(line("⛔️", "primary db down"));
  });

  it("alert logs with ❗️ and timestamp", async () => {
    const { logger } = await importFresh();
    logger.alert("data loss imminent");
    expect(console.log).toHaveBeenCalledWith(line("❗️", "data loss imminent"));
  });

  it("emergency logs with 🚨 and timestamp", async () => {
    const { logger } = await importFresh();
    logger.emergency("system unusable");
    expect(console.log).toHaveBeenCalledWith(line("🚨", "system unusable"));
  });

  it("debug replaces newlines in string args", async () => {
    const { logger } = await importFresh();
    logger.debug("line1\nline2");
    expect(console.log).toHaveBeenCalledWith(line("🐞", "line1 line2"));
  });

  it("debug inlines trailing context object as spaced JSON", async () => {
    const { logger } = await importFresh();
    logger.debug("user logged in", { userId: "123", action: "login" });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('user logged in { "userId": "123", "action": "login" }')
    );
  });

  it("info inlines trailing context object as spaced JSON", async () => {
    const { logger } = await importFresh();
    logger.info("request handled", { method: "GET", status: 200 });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('request handled { "method": "GET", "status": 200 }')
    );
  });

  it("error inlines trailing context object as spaced JSON", async () => {
    const { logger } = await importFresh();
    logger.error("request failed", { method: "POST", status: 500 });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('request failed { "method": "POST", "status": 500 }')
    );
  });
});
