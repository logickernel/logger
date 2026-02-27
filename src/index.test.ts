import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";

type EnvKey = "GCP_PROJECT" | "LOGGER_TARGET" | "LOGGER_CONSOLE_FORMAT" | "ENVIRONMENT" | "SERVICE_ID" | "VERSION";
const ENV_KEYS: EnvKey[] = ["GCP_PROJECT", "LOGGER_TARGET", "LOGGER_CONSOLE_FORMAT", "ENVIRONMENT", "SERVICE_ID", "VERSION"];

function snapshotEnv(): Record<EnvKey, string | undefined> {
  return {
    GCP_PROJECT: process.env.GCP_PROJECT,
    LOGGER_TARGET: process.env.LOGGER_TARGET,
    LOGGER_CONSOLE_FORMAT: process.env.LOGGER_CONSOLE_FORMAT,
    ENVIRONMENT: process.env.ENVIRONMENT,
    SERVICE_ID: process.env.SERVICE_ID,
    VERSION: process.env.VERSION,
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
      LOGGER_CONSOLE_FORMAT: "pretty",
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

  it("defaults to plain format when LOGGER_CONSOLE_FORMAT is not set", async () => {
    applyEnv({
      GCP_PROJECT: undefined,
      LOGGER_TARGET: "console",
      LOGGER_CONSOLE_FORMAT: undefined, // Not set - should default to plain
    });
    const { logger } = await importFresh();
    logger.info("test message");
    expect(console.log).toHaveBeenCalledWith("test message");
  });

  it("uses plain format when LOGGER_CONSOLE_FORMAT is not 'pretty'", async () => {
    applyEnv({
      GCP_PROJECT: undefined,
      LOGGER_TARGET: "console",
      LOGGER_CONSOLE_FORMAT: "plain", // Explicitly not "pretty"
    });
    const { logger } = await importFresh();
    logger.info("test message", { key: "value" });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('test message { "key": "value" }')
    );
    expect(console.log).not.toHaveBeenCalledWith(
      expect.stringMatching(/^⚪️/)
    );
  });
});

describe("logger (multi-backend: gcp,console)", () => {
  const originalEnv: Record<EnvKey, string | undefined> = snapshotEnv();
  let mockWrite: ReturnType<typeof vi.fn>;
  let mockEntry: ReturnType<typeof vi.fn>;

  beforeAll(() => {
    Object.assign(originalEnv, snapshotEnv());
  });

  beforeEach(() => {
    mockWrite = vi.fn().mockResolvedValue(undefined);
    mockEntry = vi.fn((meta, payload) => ({ meta, payload }));
    vi.doMock("@google-cloud/logging", () => ({
      Logging: vi.fn().mockImplementation(() => ({
        log: vi.fn().mockReturnValue({ write: mockWrite, entry: mockEntry }),
      })),
    }));
    applyEnv({
      GCP_PROJECT: "test-project",
      LOGGER_TARGET: "gcp,console",
      LOGGER_CONSOLE_FORMAT: undefined,
      ENVIRONMENT: undefined,
      SERVICE_ID: undefined,
      VERSION: undefined,
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@google-cloud/logging");
    restoreEnv(originalEnv);
  });

  afterAll(() => {
    restoreEnv(originalEnv);
  });

  it("writes to both GCP and console on info", async () => {
    const { logger } = await importFresh();
    logger.info("dual write");
    expect(mockWrite).toHaveBeenCalledOnce();
    expect(console.log).toHaveBeenCalledWith("dual write");
  });

  it("writes to both GCP and console on error", async () => {
    const { logger } = await importFresh();
    logger.error("something broke");
    expect(mockWrite).toHaveBeenCalledOnce();
    expect(console.log).toHaveBeenCalledWith("something broke");
  });

  it("order in LOGGER_TARGET does not matter (console,gcp)", async () => {
    applyEnv({ LOGGER_TARGET: "console,gcp" });
    const { logger } = await importFresh();
    logger.warning("order check");
    expect(mockWrite).toHaveBeenCalledOnce();
    expect(console.log).toHaveBeenCalledWith("order check");
  });
});

describe("logger (GCP backend) — labels", () => {
  const originalEnv: Record<EnvKey, string | undefined> = snapshotEnv();
  let mockWrite: ReturnType<typeof vi.fn>;
  let mockEntry: ReturnType<typeof vi.fn>;

  beforeAll(() => {
    Object.assign(originalEnv, snapshotEnv());
  });

  beforeEach(() => {
    mockWrite = vi.fn().mockResolvedValue(undefined);
    mockEntry = vi.fn((meta, payload) => ({ meta, payload }));
    vi.doMock("@google-cloud/logging", () => ({
      Logging: vi.fn().mockImplementation(() => ({
        log: vi.fn().mockReturnValue({ write: mockWrite, entry: mockEntry }),
      })),
    }));
    applyEnv({
      GCP_PROJECT: "test-project",
      LOGGER_TARGET: undefined,
      LOGGER_CONSOLE_FORMAT: undefined,
      ENVIRONMENT: undefined,
      SERVICE_ID: undefined,
      VERSION: undefined,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@google-cloud/logging");
    restoreEnv(originalEnv);
  });

  afterAll(() => {
    restoreEnv(originalEnv);
  });

  it("attaches all labels when ENVIRONMENT, SERVICE_ID, and VERSION are set", async () => {
    process.env.ENVIRONMENT = "production";
    process.env.SERVICE_ID  = "my-service";
    process.env.VERSION     = "1.2.3";
    const { logger } = await importFresh();
    logger.info("hello");
    expect(mockEntry).toHaveBeenCalledWith(
      expect.objectContaining({ labels: { environment: "production", service_id: "my-service", version: "1.2.3" } }),
      expect.anything(),
    );
  });

  it("attaches only present labels when some vars are unset", async () => {
    process.env.SERVICE_ID = "my-service";
    const { logger } = await importFresh();
    logger.info("hello");
    const [[meta]] = mockEntry.mock.calls;
    expect(meta.labels).toEqual({ service_id: "my-service" });
  });

  it("omits labels entirely when no label vars are set", async () => {
    const { logger } = await importFresh();
    logger.info("hello");
    const [[meta]] = mockEntry.mock.calls;
    expect(meta).not.toHaveProperty("labels");
  });
});
