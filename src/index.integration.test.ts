import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Logging } from "@google-cloud/logging";

const PROJECT = "logickernel-logger";
const LOG_NAME = "app";

type GcpEntry = { data: unknown; metadata: { severity?: string } };

describe("GCP backend integration", () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeAll(() => {
    originalEnv.GCP_PROJECT = process.env.GCP_PROJECT;
    process.env.GCP_PROJECT = PROJECT;
  });

  afterAll(() => {
    process.env.GCP_PROJECT = originalEnv.GCP_PROJECT;
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

async function pollForEntry(
  testId: string,
  severity: string,
  { attempts = 10, intervalMs = 2000 }: { attempts?: number; intervalMs?: number } = {}
): Promise<GcpEntry | undefined> {
  const logging = new Logging({ projectId: PROJECT });
  const filter = [
    `logName="projects/${PROJECT}/logs/${LOG_NAME}"`,
    `severity="${severity}"`,
    `textPayload:"${testId}"`,
  ].join(" AND ");

  for (let i = 0; i < attempts; i++) {
    await new Promise(r => setTimeout(r, intervalMs));
    const [entries] = await logging.getEntries({ filter, pageSize: 1 });
    if (entries.length > 0) return entries[0] as GcpEntry;
  }

  return undefined;
}
