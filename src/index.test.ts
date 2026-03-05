import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import type { Logger } from "./index.js";

type EnvKey = "GCP_PROJECT" | "LOGGER_TARGET" | "LOGGER_CONSOLE_FORMAT" | "ENVIRONMENT" | "SERVICE" | "VERSION";
const ENV_KEYS: EnvKey[] = ["GCP_PROJECT", "LOGGER_TARGET", "LOGGER_CONSOLE_FORMAT", "ENVIRONMENT", "SERVICE", "VERSION"];

function snapshotEnv(): Record<EnvKey, string | undefined> {
  return {
    GCP_PROJECT: process.env.GCP_PROJECT,
    LOGGER_TARGET: process.env.LOGGER_TARGET,
    LOGGER_CONSOLE_FORMAT: process.env.LOGGER_CONSOLE_FORMAT,
    ENVIRONMENT: process.env.ENVIRONMENT,
    SERVICE: process.env.SERVICE,
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

async function freshLogger(scope?: string): Promise<Logger> {
  vi.resetModules();
  const mod = await import("./index.js");
  return mod.logger(scope);
}

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
    const log = await freshLogger();
    for (const method of ["debug", "info", "notice", "warning", "error", "critical", "alert", "emergency"]) {
      expect(typeof log[method as keyof typeof log]).toBe("function");
    }
  });

  // Timestamp pattern: "YYYY-MM-DD HH:MM:SS.mmm"
  const ts = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}/;
  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const line = (emoji: string, msg: string, color?: "yellow" | "red") => {
    const colorCode = color === "yellow" ? "\\x1b\\[33m" : color === "red" ? "\\x1b\\[31m" : "";
    const reset = colorCode ? "\\x1b\\[0m" : "";
    const tsColor = colorCode || "\\x1b\\[90m";
    const tsReset = colorCode ? reset : "\\x1b\\[0m";
    return expect.stringMatching(new RegExp(`^${emoji} ${tsColor}${ts.source}${tsReset}  ${colorCode}${escapeRe(msg)}${reset}$`));
  };

  it("debug logs with 🐞 and timestamp", async () => {
    const log = await freshLogger();
    log.debug("verbose");
    expect(console.log).toHaveBeenCalledWith(line("🐞", "verbose"));
  });

  it("info logs with ⚪️ and timestamp", async () => {
    const log = await freshLogger();
    log.info("hello");
    expect(console.log).toHaveBeenCalledWith(line("⚪️", "hello"));
  });

  it("notice logs with 🔵 and timestamp", async () => {
    const log = await freshLogger();
    log.notice("normal but significant");
    expect(console.log).toHaveBeenCalledWith(line("🔵", "normal but significant"));
  });

  it("warning logs with 🟡 and timestamp (yellow message)", async () => {
    const log = await freshLogger();
    log.warning("disk nearing capacity");
    expect(console.log).toHaveBeenCalledWith(line("🟡", "disk nearing capacity", "yellow"));
  });

  it("error logs with 🔴 and timestamp (red message)", async () => {
    const log = await freshLogger();
    log.error("something broke");
    expect(console.log).toHaveBeenCalledWith(line("🔴", "something broke", "red"));
  });

  it("critical logs with ⛔️ and timestamp (red message)", async () => {
    const log = await freshLogger();
    log.critical("primary db down");
    expect(console.log).toHaveBeenCalledWith(line("⛔️", "primary db down", "red"));
  });

  it("alert logs with ❗️ and timestamp (red message)", async () => {
    const log = await freshLogger();
    log.alert("data loss imminent");
    expect(console.log).toHaveBeenCalledWith(line("❗️", "data loss imminent", "red"));
  });

  it("emergency logs with 🚨 and timestamp (red message)", async () => {
    const log = await freshLogger();
    log.emergency("system unusable");
    expect(console.log).toHaveBeenCalledWith(line("🚨", "system unusable", "red"));
  });

  it("debug shows payload on new indented line", async () => {
    const log = await freshLogger();
    log.debug("user authenticated", { userId: "123", action: "login" });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('user authenticated\n\x1b[38;5;66m    {\n      "userId": "123",\n      "action": "login"\n    }\x1b[0m')
    );
  });

  it("info shows payload on new indented line", async () => {
    const log = await freshLogger();
    log.info("HTTP request completed", { method: "GET", status: 200 });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('HTTP request completed\n\x1b[38;5;66m    {\n      "method": "GET",\n      "status": 200\n    }\x1b[0m')
    );
  });

  it("error shows payload on new indented line", async () => {
    const log = await freshLogger();
    log.error("upstream returned an error", { method: "POST", status: 500 });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('\x1b[31mupstream returned an error\x1b[0m\n\x1b[38;5;66m    {\n      "method": "POST",\n      "status": 500\n    }\x1b[0m')
    );
  });

  it("shows scope in pretty format", async () => {
    const log = await freshLogger("payments");
    log.info("payment accepted");
    expect(console.log).toHaveBeenCalledWith(line("⚪️", "(payments) payment accepted"));
  });

  it("defaults to pretty format when LOGGER_CONSOLE_FORMAT is not set", async () => {
    applyEnv({
      GCP_PROJECT: undefined,
      LOGGER_TARGET: "console",
      LOGGER_CONSOLE_FORMAT: undefined,
    });
    const log = await freshLogger();
    log.info("test message");
    expect(console.log).toHaveBeenCalledWith(line("⚪️", "test message"));
  });

  it("uses plain format when LOGGER_CONSOLE_FORMAT=plain", async () => {
    applyEnv({
      GCP_PROJECT: undefined,
      LOGGER_TARGET: "console",
      LOGGER_CONSOLE_FORMAT: "plain",
    });
    const log = await freshLogger();
    log.info("test message", { key: "value" });
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
      LOGGER_CONSOLE_FORMAT: "plain",
      ENVIRONMENT: undefined,
      SERVICE: undefined,
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
    const log = await freshLogger();
    log.info("dual write");
    expect(mockWrite).toHaveBeenCalledOnce();
    expect(console.log).toHaveBeenCalledWith("dual write");
  });

  it("writes to both GCP and console on error", async () => {
    const log = await freshLogger();
    log.error("something broke");
    expect(mockWrite).toHaveBeenCalledOnce();
    expect(console.log).toHaveBeenCalledWith("something broke");
  });

  it("order in LOGGER_TARGET does not matter (console,gcp)", async () => {
    applyEnv({ LOGGER_TARGET: "console,gcp" });
    const log = await freshLogger();
    log.warning("order check");
    expect(mockWrite).toHaveBeenCalledOnce();
    expect(console.log).toHaveBeenCalledWith("order check");
  });
});

describe("logger (GCP backend)", () => {
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
      SERVICE: undefined,
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

  it("attaches all labels when ENVIRONMENT, SERVICE, and VERSION are set", async () => {
    process.env.ENVIRONMENT = "production";
    process.env.SERVICE  = "my-service";
    process.env.VERSION     = "1.2.3";
    const log = await freshLogger();
    log.info("hello");
    expect(mockEntry).toHaveBeenCalledWith(
      expect.objectContaining({ labels: { environment: "production", service: "my-service", version: "1.2.3" } }),
      expect.anything(),
    );
  });

  it("attaches only present labels when some vars are unset", async () => {
    process.env.SERVICE = "my-service";
    const log = await freshLogger();
    log.info("hello");
    const [[meta]] = mockEntry.mock.calls;
    expect(meta.labels).toEqual({ service: "my-service" });
  });

  it("omits labels entirely when no label vars are set", async () => {
    const log = await freshLogger();
    log.info("hello");
    const [[meta]] = mockEntry.mock.calls;
    expect(meta).not.toHaveProperty("labels");
  });

  it("attaches scope label from factory argument", async () => {
    const log = await freshLogger("my-scope");
    log.info("hello");
    expect(mockEntry).toHaveBeenCalledWith(
      expect.objectContaining({ labels: { scope: "my-scope" } }),
      expect.anything(),
    );
  });

  it("merges env labels and scope", async () => {
    process.env.ENVIRONMENT = "staging";
    const log = await freshLogger("worker");
    log.info("hello");
    expect(mockEntry).toHaveBeenCalledWith(
      expect.objectContaining({ labels: { environment: "staging", scope: "worker" } }),
      expect.anything(),
    );
  });

  it("per-call labels override instance labels", async () => {
    process.env.ENVIRONMENT = "production";
    const log = await freshLogger("api");
    log.info("hello", undefined, { environment: "canary", region: "us-east1" });
    expect(mockEntry).toHaveBeenCalledWith(
      expect.objectContaining({ labels: { scope: "api", environment: "canary", region: "us-east1" } }),
      expect.anything(),
    );
  });
});
