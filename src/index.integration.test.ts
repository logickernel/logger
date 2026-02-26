import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Logging } from "@google-cloud/logging";

const PROJECT = "logickernel-logger";
const LOG_NAME = "app";

type GcpEntry = { data: unknown; metadata: { severity?: string; labels?: Record<string, string> } };

describe("GCP backend integration", () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeAll(() => {
    originalEnv.GCP_PROJECT = process.env.GCP_PROJECT;
    originalEnv.LOGGER_NAME = process.env.LOGGER_NAME;
    originalEnv.LOGGER_TARGET = process.env.LOGGER_TARGET;
    process.env.GCP_PROJECT = PROJECT;
    process.env.LOGGER_NAME = LOG_NAME;
    process.env.LOGGER_TARGET = "gcp";
  });

  afterAll(() => {
    process.env.GCP_PROJECT = originalEnv.GCP_PROJECT;
    process.env.LOGGER_NAME = originalEnv.LOGGER_NAME;
    process.env.LOGGER_TARGET = originalEnv.LOGGER_TARGET;
  });

  async function smokeTest(
    severity: string,
    logFn: (logger: Awaited<ReturnType<typeof import("./index.js")>>["logger"]) => (msg: string) => void,
  ): Promise<void> {
    vi.resetModules();
    const { logger } = await import("./index.js");

    const testId = `it-${Date.now()}`;
    const message = `smoke: ${severity.toLowerCase()} severity [${testId}]`;
    logFn(logger)(message);

    const entry = await pollForEntry(testId, severity);
    expect(entry, `no ${severity} entry arrived within timeout`).toBeDefined();
    expect(entry!.data).toBe(message);
    expect(entry!.metadata.severity).toBe(severity);
  }

  it("writes DEBUG entry to Cloud Logging",     () => smokeTest("DEBUG",     l => l.debug),     30_000);
  it("writes INFO entry to Cloud Logging",      () => smokeTest("INFO",      l => l.info),      30_000);
  it("writes NOTICE entry to Cloud Logging",    () => smokeTest("NOTICE",    l => l.notice),    30_000);
  it("writes WARNING entry to Cloud Logging",   () => smokeTest("WARNING",   l => l.warning),   30_000);
  it("writes ERROR entry to Cloud Logging",     () => smokeTest("ERROR",     l => l.error),     30_000);
  it("writes CRITICAL entry to Cloud Logging",  () => smokeTest("CRITICAL",  l => l.critical),  30_000);
  it("writes ALERT entry to Cloud Logging",     () => smokeTest("ALERT",     l => l.alert),     30_000);
  it("writes EMERGENCY entry to Cloud Logging", () => smokeTest("EMERGENCY", l => l.emergency), 30_000);
});

describe("GCP backend integration — ENVIRONMENT label", () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeAll(() => {
    originalEnv.GCP_PROJECT = process.env.GCP_PROJECT;
    originalEnv.LOGGER_NAME = process.env.LOGGER_NAME;
    originalEnv.LOGGER_TARGET = process.env.LOGGER_TARGET;
    originalEnv.ENVIRONMENT = process.env.ENVIRONMENT;
    process.env.GCP_PROJECT = PROJECT;
    process.env.LOGGER_NAME = LOG_NAME;
    process.env.LOGGER_TARGET = "gcp";
  });

  afterAll(() => {
    process.env.GCP_PROJECT = originalEnv.GCP_PROJECT;
    process.env.LOGGER_NAME = originalEnv.LOGGER_NAME;
    process.env.LOGGER_TARGET = originalEnv.LOGGER_TARGET;
    if (originalEnv.ENVIRONMENT === undefined) delete process.env.ENVIRONMENT;
    else process.env.ENVIRONMENT = originalEnv.ENVIRONMENT;
  });

  async function labelTest(environment: string): Promise<void> {
    process.env.ENVIRONMENT = environment;
    vi.resetModules();
    const { logger } = await import("./index.js");

    const testId = `it-env-${environment}-${Date.now()}`;
    logger.info(`label smoke: environment=${environment} [${testId}]`);

    const entry = await pollForEntry(testId, "INFO");
    expect(entry, `no INFO entry arrived within timeout for environment=${environment}`).toBeDefined();
    expect(entry!.metadata.labels?.environment).toBe(environment);
  }

  it("attaches environment=development label", () => labelTest("development"), 30_000);
  it("attaches environment=staging label",     () => labelTest("staging"),     30_000);
  it("attaches environment=production label",  () => labelTest("production"),  30_000);
});

async function pollForEntry(
  testId: string,
  severity: string,
  { attempts = 10, intervalMs = 2000 }: { attempts?: number; intervalMs?: number } = {}
): Promise<GcpEntry | undefined> {
  const logging = new Logging({ projectId: PROJECT });
  // Use a broader filter and filter by testId in code to handle both textPayload and jsonPayload
  const filter = [
    `logName="projects/${PROJECT}/logs/${LOG_NAME}"`,
    `severity="${severity}"`,
  ].join(" AND ");

  for (let i = 0; i < attempts; i++) {
    await new Promise(r => setTimeout(r, intervalMs));
    const [entries] = await logging.getEntries({ filter, pageSize: 20 });
    // Search through entries to find one containing the testId
    const matching = entries.find((e: any) => {
      const data = e.data || {};
      // Handle textPayload (string)
      if (typeof data === "string" && data.includes(testId)) {
        return true;
      }
      // Handle jsonPayload (object with message field)
      if (typeof data === "object" && data !== null) {
        const jsonStr = JSON.stringify(data);
        if (jsonStr.includes(testId)) {
          return true;
        }
      }
      return false;
    });
    if (matching) return matching as GcpEntry;
  }

  return undefined;
}
