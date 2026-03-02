import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { Logging } from "@google-cloud/logging";
import type { Logger } from "./index.js";

const PROJECT = "logickernel-logger";
const LOG_NAME = "app";

type GcpEntry = { data: unknown; metadata: { severity?: string; labels?: Record<string, string> } };

// Polls until an entry containing `testId` appears in Cloud Logging.
// No startTime filter — testIds are unique per run (contain Date.now()), so old
// entries from previous runs can never accidentally match.
async function pollForEntry(
  testId: string,
  severity: string,
  { attempts = 10, intervalMs = 5_000 }: { attempts?: number; intervalMs?: number } = {},
): Promise<GcpEntry | undefined> {
  const logging = new Logging({ projectId: PROJECT });
  const filter = [
    `logName="projects/${PROJECT}/logs/${LOG_NAME}"`,
    `severity="${severity}"`,
  ].join(" AND ");

  for (let i = 0; i < attempts; i++) {
    await new Promise(r => setTimeout(r, intervalMs));
    const [entries] = await logging.getEntries({ filter, pageSize: 20, orderBy: "timestamp desc" });
    const match = entries.find((e: any) => {
      const data = e.data ?? {};
      if (typeof data === "string") return data.includes(testId);
      if (typeof data === "object" && data !== null) return JSON.stringify(data).includes(testId);
      return false;
    });
    if (match) return match as GcpEntry;
  }
  return undefined;
}

// ─── smoke: all 8 severity levels ────────────────────────────────────────────

describe("GCP backend integration", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const k of ["GCP_PROJECT", "LOGGER_NAME", "LOGGER_TARGET"]) savedEnv[k] = process.env[k];
    process.env.GCP_PROJECT   = PROJECT;
    process.env.LOGGER_NAME   = LOG_NAME;
    process.env.LOGGER_TARGET = "gcp";
  });

  afterAll(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  async function smokeTest(
    severity: string,
    logFn: (l: Logger) => (message: string) => void,
  ): Promise<void> {
    vi.resetModules();
    const mod = await import("./index.js");
    const l = mod.logger();
    const testId  = `it-${severity.toLowerCase()}-${Date.now()}`;
    const message = `smoke: ${severity.toLowerCase()} [${testId}]`;
    logFn(l)(message);
    const entry = await pollForEntry(testId, severity);
    expect(entry, `no ${severity} entry arrived within timeout`).toBeDefined();
    expect(entry!.data).toBe(message);
    expect(entry!.metadata.severity).toBe(severity);
  }

  it("writes DEBUG entry to Cloud Logging",     () => smokeTest("DEBUG",     l => l.debug),     60_000);
  it("writes INFO entry to Cloud Logging",      () => smokeTest("INFO",      l => l.info),      60_000);
  it("writes NOTICE entry to Cloud Logging",    () => smokeTest("NOTICE",    l => l.notice),    60_000);
  it("writes WARNING entry to Cloud Logging",   () => smokeTest("WARNING",   l => l.warning),   60_000);
  it("writes ERROR entry to Cloud Logging",     () => smokeTest("ERROR",     l => l.error),     60_000);
  it("writes CRITICAL entry to Cloud Logging",  () => smokeTest("CRITICAL",  l => l.critical),  60_000);
  it("writes ALERT entry to Cloud Logging",     () => smokeTest("ALERT",     l => l.alert),     60_000);
  it("writes EMERGENCY entry to Cloud Logging", () => smokeTest("EMERGENCY", l => l.emergency), 60_000);

  it("sends string + payload as jsonPayload with merged fields", async () => {
    vi.resetModules();
    const mod = await import("./index.js");
    const l = mod.logger();
    const testId = `it-json-${Date.now()}`;
    l.info(`json payload smoke [${testId}]`, undefined, { requestId: "req-001", userId: "usr-42" });
    const entry = await pollForEntry(testId, "INFO");
    expect(entry, "no INFO entry arrived within timeout").toBeDefined();
    expect(typeof entry!.data).toBe("object");
    const data = entry!.data as Record<string, unknown>;
    expect(data.message).toBe(`json payload smoke [${testId}]`);
    expect(data.requestId).toBe("req-001");
    expect(data.userId).toBe("usr-42");
  }, 60_000);
});

// ─── labels ───────────────────────────────────────────────────────────────────

describe("GCP backend integration — labels", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const k of ["GCP_PROJECT", "LOGGER_NAME", "LOGGER_TARGET", "ENVIRONMENT", "SERVICE", "VERSION"])
      savedEnv[k] = process.env[k];
    process.env.GCP_PROJECT   = PROJECT;
    process.env.LOGGER_NAME   = LOG_NAME;
    process.env.LOGGER_TARGET = "gcp";
  });

  afterAll(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  beforeEach(() => {
    delete process.env.ENVIRONMENT;
    delete process.env.SERVICE;
    delete process.env.VERSION;
  });

  async function labelTest(
    envOverrides: Record<string, string>,
    expectedLabels: Record<string, string>,
  ): Promise<void> {
    for (const [k, v] of Object.entries(envOverrides)) process.env[k] = v;
    vi.resetModules();
    const mod = await import("./index.js");
    const l = mod.logger();
    const testId = `it-label-${Object.keys(envOverrides).join("-")}-${Date.now()}`;
    l.info(`label smoke [${testId}]`);
    const entry = await pollForEntry(testId, "INFO");
    expect(entry, "no INFO entry arrived within timeout").toBeDefined();
    for (const [k, v] of Object.entries(expectedLabels))
      expect(entry!.metadata.labels?.[k], `label "${k}" missing or wrong`).toBe(v);
  }

  it("attaches environment label",
    () => labelTest({ ENVIRONMENT: "staging" }, { environment: "staging" }), 60_000);

  it("attaches service label",
    () => labelTest({ SERVICE: "my-service" }, { service: "my-service" }), 60_000);

  it("attaches version label",
    () => labelTest({ VERSION: "1.2.3" }, { version: "1.2.3" }), 60_000);

  it("attaches all three labels together", () => labelTest(
    { ENVIRONMENT: "production", SERVICE: "my-service", VERSION: "1.2.3" },
    { environment: "production", service: "my-service", version: "1.2.3" },
  ), 60_000);

  it("attaches scope label", async () => {
    vi.resetModules();
    const mod = await import("./index.js");
    const l = mod.logger("test-scope");
    const testId = `it-scope-${Date.now()}`;
    l.info(`scope smoke [${testId}]`);
    const entry = await pollForEntry(testId, "INFO");
    expect(entry, "no INFO entry arrived within timeout").toBeDefined();
    expect(entry!.metadata.labels?.scope, 'label "scope" missing or wrong').toBe("test-scope");
  }, 60_000);

  it("merges scope and event labels", async () => {
    vi.resetModules();
    const mod = await import("./index.js");
    const l = mod.logger("api");
    const testId = `it-scope-event-${Date.now()}`;
    l.info(`scope+event smoke [${testId}]`, "request_handled");
    const entry = await pollForEntry(testId, "INFO");
    expect(entry, "no INFO entry arrived within timeout").toBeDefined();
    expect(entry!.metadata.labels?.scope).toBe("api");
    expect(entry!.metadata.labels?.event).toBe("request_handled");
  }, 60_000);
});
