import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Logging } from "@google-cloud/logging";

const PROJECT = "logickernel-logger";
const LOG_NAME = "app";

describe("GCP backend integration", () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeAll(() => {
    originalEnv.SYSTEM_LOGS = process.env.SYSTEM_LOGS;
    originalEnv.GCP_PROJECT = process.env.GCP_PROJECT;
    process.env.SYSTEM_LOGS = "gcp";
    process.env.GCP_PROJECT = PROJECT;
  });

  afterAll(() => {
    process.env.SYSTEM_LOGS = originalEnv.SYSTEM_LOGS;
    process.env.GCP_PROJECT = originalEnv.GCP_PROJECT;
  });

  it("writes INFO entry to Cloud Logging", async () => {
    vi.resetModules();
    const { logger } = await import("./index.js");

    const testId = `integration-${Date.now()}`;
    logger.info(`info test ${testId}`);

    const entry = await pollForEntry(testId, "INFO");
    expect(entry).toBeDefined();
  }, 30_000);

  it("writes ERROR entry to Cloud Logging", async () => {
    vi.resetModules();
    const { logger } = await import("./index.js");

    const testId = `integration-${Date.now()}`;
    logger.error(`error test ${testId}`);

    const entry = await pollForEntry(testId, "ERROR");
    expect(entry).toBeDefined();
  }, 30_000);

  it("writes DEBUG entry to Cloud Logging", async () => {
    vi.resetModules();
    const { logger } = await import("./index.js");

    const testId = `integration-${Date.now()}`;
    logger.debug(`debug test ${testId}`);

    const entry = await pollForEntry(testId, "DEBUG");
    expect(entry).toBeDefined();
  }, 30_000);

  it("writes NOTICE entry to Cloud Logging", async () => {
    vi.resetModules();
    const { logger } = await import("./index.js");

    const testId = `integration-${Date.now()}`;
    logger.notice(`notice test ${testId}`);

    const entry = await pollForEntry(testId, "NOTICE");
    expect(entry).toBeDefined();
  }, 30_000);

  it("writes WARNING entry to Cloud Logging", async () => {
    vi.resetModules();
    const { logger } = await import("./index.js");

    const testId = `integration-${Date.now()}`;
    logger.warning(`warning test ${testId}`);

    const entry = await pollForEntry(testId, "WARNING");
    expect(entry).toBeDefined();
  }, 30_000);

  it("writes CRITICAL entry to Cloud Logging", async () => {
    vi.resetModules();
    const { logger } = await import("./index.js");

    const testId = `integration-${Date.now()}`;
    logger.critical(`critical test ${testId}`);

    const entry = await pollForEntry(testId, "CRITICAL");
    expect(entry).toBeDefined();
  }, 30_000);

  it("writes ALERT entry to Cloud Logging", async () => {
    vi.resetModules();
    const { logger } = await import("./index.js");

    const testId = `integration-${Date.now()}`;
    logger.alert(`alert test ${testId}`);

    const entry = await pollForEntry(testId, "ALERT");
    expect(entry).toBeDefined();
  }, 30_000);

  it("writes EMERGENCY entry to Cloud Logging", async () => {
    vi.resetModules();
    const { logger } = await import("./index.js");

    const testId = `integration-${Date.now()}`;
    logger.emergency(`emergency test ${testId}`);

    const entry = await pollForEntry(testId, "EMERGENCY");
    expect(entry).toBeDefined();
  }, 30_000);
});

async function pollForEntry(
  testId: string,
  severity: string,
  { attempts = 10, intervalMs = 2000 }: { attempts?: number; intervalMs?: number } = {}
): Promise<object | undefined> {
  const logging = new Logging({ projectId: PROJECT });
  const filter = [
    `logName="projects/${PROJECT}/logs/${LOG_NAME}"`,
    `severity="${severity}"`,
    `textPayload:"${testId}"`,
  ].join(" AND ");

  for (let i = 0; i < attempts; i++) {
    await new Promise(r => setTimeout(r, intervalMs));
    const [entries] = await logging.getEntries({ filter, pageSize: 1 });
    if (entries.length > 0) return entries[0];
  }

  return undefined;
}
