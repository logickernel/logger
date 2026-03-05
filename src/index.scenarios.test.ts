// Real-world scenario log generation for manual dashboard review.
// No assertions — run and inspect entries in Cloud Logging to build metrics and dashboards.
//
// All entries share: environment=production, service=api, version=1.0.0
// Each scenario covers a different scope with a realistic payload distribution.

import { describe, it, vi, beforeAll, afterAll } from "vitest";
import type { Logger } from "./index.js";

const PROJECT = "logickernel-logger";
const LOG_NAME = "app";

// ── helpers ──────────────────────────────────────────────────────────────────

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function repeat<T>(value: T, n: number): T[] {
  return Array(n).fill(value);
}

function shuffle<T>(arr: T[]): T[] {
  return arr.slice().sort(() => Math.random() - 0.5);
}

// ── suite ────────────────────────────────────────────────────────────────────

describe("scenarios — real-world log generation for dashboard review", () => {
  const savedEnv: Record<string, string | undefined> = {};
  let mod: typeof import("./index.js");

  beforeAll(async () => {
    for (const k of ["GCP_PROJECT", "LOGGER_NAME", "LOGGER_TARGET", "ENVIRONMENT", "SERVICE", "VERSION"])
      savedEnv[k] = process.env[k];
    process.env.GCP_PROJECT   = PROJECT;
    process.env.LOGGER_NAME   = LOG_NAME;
    process.env.LOGGER_TARGET = "gcp";
    process.env.ENVIRONMENT   = "production";
    process.env.SERVICE       = "api";
    process.env.VERSION       = "1.0.0";
    vi.resetModules();
    mod = await import("./index.js");
  });

  afterAll(async () => {
    // GCP writes are fire-and-forget — wait for the client to flush before exit.
    await new Promise(r => setTimeout(r, 6_000));
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  // ── scenario 1: HTTP API ───────────────────────────────────────────────────
  // Produces latency / status / error-rate data grouped by method and path.
  // Useful for: p99 latency by path, error rate over time, status code distribution.

  it("api: request handling — latency, status, and error rate", () => {
    const log: Logger = mod.logger("api");

    const methods = ["GET", "GET", "GET", "POST", "PUT", "DELETE"];
    const paths   = ["/orders", "/orders/:id", "/users/:id", "/products", "/cart", "/payments"];

    const outcomes = shuffle([
      ...repeat({ status: 200, severity: "info"    as const }, 28),
      ...repeat({ status: 201, severity: "info"    as const },  6),
      ...repeat({ status: 400, severity: "warning" as const },  5),
      ...repeat({ status: 422, severity: "warning" as const },  3),
      ...repeat({ status: 500, severity: "error"   as const },  3),
      ...repeat({ status: 503, severity: "error"   as const },  1),
    ]);

    for (const { status, severity } of outcomes) {
      const method = pick(methods);
      const path   = pick(paths);
      const ms     = status >= 500 ? rand(600, 3_000)
                   : status >= 400 ? rand(10, 150)
                   :                 rand(20, 480);
      if (severity === "info") {
        log.info("HTTP request completed", { ms, status, method, path });
      } else if (severity === "warning") {
        log.warning("request not accepted", { ms, status, method, path });
      } else {
        log.error("upstream returned an error", { ms, status, method, path });
      }
    }
  });

  // ── scenario 2: payment processing ────────────────────────────────────────
  // Produces charge volume, decline rate, and failure rate data.
  // Useful for: revenue by currency, decline rate by provider, failure breakdown by code.

  it("payments: charge outcomes — success, decline, and failure distribution", () => {
    const log: Logger = mod.logger("payments");

    const providers     = ["stripe", "stripe", "stripe", "paypal", "adyen"];
    const currencies    = ["usd", "usd", "usd", "eur", "gbp"];
    const amounts       = [9.99, 19.99, 49.99, 99.99, 149.99, 299.99];
    const declineCodes  = ["insufficient_funds", "card_expired", "do_not_honor", "lost_card"];
    const failureCodes  = ["network_error", "timeout", "provider_unavailable"];

    const outcomes = shuffle([
      ...repeat("success"  as const, 32),
      ...repeat("declined" as const,  8),
      ...repeat("failed"   as const,  2),
    ]);

    for (const outcome of outcomes) {
      const provider = pick(providers);
      const currency = pick(currencies);
      const amount   = pick(amounts);
      const ms       = outcome === "success" ? rand(100, 600)
                     : outcome === "declined" ? rand(200, 900)
                     :                          rand(1_000, 4_000);
      if (outcome === "success") {
        log.info("payment accepted", { ms, amount, currency, provider });
      } else if (outcome === "declined") {
        log.warning("card declined by issuing bank", { ms, amount, currency, provider, code: pick(declineCodes) });
      } else {
        log.error("provider rejected the charge", { ms, amount, currency, provider, code: pick(failureCodes) });
      }
    }
  });

  // ── scenario 3: cache ──────────────────────────────────────────────────────
  // Produces hit/miss ratio and latency data per store.
  // Useful for: cache hit rate by store, miss latency vs hit latency histograms.

  it("cache: hit/miss ratio with latency by store", () => {
    const log: Logger = mod.logger("cache");

    const stores = ["sessions", "products", "user_profiles", "feature_flags"];

    const outcomes = shuffle([
      ...repeat("hit"  as const, 35),
      ...repeat("miss" as const, 15),
    ]);

    for (const result of outcomes) {
      const store = pick(stores);
      // Hits are sub-millisecond work; misses go to origin (db/api)
      const ms = result === "hit" ? rand(1, 6) : rand(35, 180);
      if (result === "hit") {
        log.debug("served from cache", { ms, store });
      } else {
        log.info("cache miss, fetched from origin", { ms, store });
      }
    }
  });

  // ── scenario 4: database queries ──────────────────────────────────────────
  // Produces query latency, row counts, and slow/timeout rates per table.
  // Useful for: p95 query latency by table, slow query rate, rows scanned over time.

  it("db: query execution — latency, rows, slow queries, and timeouts", () => {
    const log: Logger = mod.logger("db");

    const tables     = ["orders", "users", "products", "payments", "sessions"];
    const operations = ["select", "select", "select", "insert", "update", "delete"];

    for (let i = 0; i < 36; i++) {
      const table     = pick(tables);
      const operation = pick(operations);
      const ms        = rand(2, 140);
      const rows      = operation === "select" ? rand(1, 500) : 1;

      if (ms > 100) {
        log.warning("database response took too long", { ms, rows, table, operation });
      } else {
        log.info("database query returned", { ms, rows, table, operation });
      }
    }

    // Inject a handful of timeouts
    for (let i = 0; i < 3; i++) {
      log.error("database connection timed out", { ms: rand(5_000, 30_000), table: pick(tables), operation: "select" });
    }
  });

  // ── scenario 5: background worker ─────────────────────────────────────────
  // Produces job processing time and failure rate data per queue.
  // Useful for: job throughput by queue, p95 processing time, failure rate over time.

  it("worker: job lifecycle — processing time and failure rate per queue", () => {
    const log: Logger = mod.logger("worker");

    const queues         = ["emails", "invoices", "exports", "notifications"];
    const failureReasons = ["timeout", "invalid_payload", "downstream_unavailable"];
    const retryOutcomes  = ["success", "success", "failed"] as const;

    log.notice("worker started");

    const jobs = shuffle([
      ...repeat("ok"   as const, 25),
      ...repeat("fail" as const,  5),
    ]);

    for (const outcome of jobs) {
      const queue = pick(queues);
      const jobId = `job-${rand(1_000, 9_999)}`;
      const ms    = outcome === "ok" ? rand(50, 2_000) : rand(3_000, 12_000);

      if (outcome === "ok") {
        log.info("background job finished", { ms, queue, jobId });
      } else {
        const reason = pick(failureReasons);
        log.error("background job could not complete", { ms, queue, jobId, reason });

        // Some failed jobs are retried
        if (Math.random() > 0.4) {
          const retryOutcome = pick(retryOutcomes);
          const retryMs      = rand(1_000, 6_000);
          if (retryOutcome === "success") {
            log.info("retry attempt succeeded", { ms: retryMs, queue, jobId });
          } else {
            log.error("retry attempt also failed", { ms: retryMs, queue, jobId, reason });
          }
        }
      }
    }

    log.notice("worker stopped");
  });
});
