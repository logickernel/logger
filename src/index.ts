import { Logging } from "@google-cloud/logging";

export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export function formatMessage(args: unknown[]): string {
  return args.map(arg => {
    if (typeof arg === "string") return arg;
    if (arg instanceof Error) return arg.message + (arg.stack ? `\n${arg.stack}` : "");
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }).join(" ");
}

// Resolved once at module load — no per-call branching.
const USE_GCP = process.env.SYSTEM_LOGS === "gcp" || !!process.env.K_SERVICE;
const IS_PROD = process.env.NODE_ENV === "production";
const noop = (): void => {};

let gcpLog: ReturnType<Logging["log"]> | null = null;
if (USE_GCP) {
  try {
    const logName = process.env.K_SERVICE ?? "app";
    gcpLog = new Logging({ projectId: process.env.GCP_PROJECT }).log(logName);
  } catch {
    // GCP init failed; fall back to console
  }
}

export const logger: Logger = gcpLog
  ? (() => {
      const g = gcpLog!;
      return {
        debug: IS_PROD ? noop : (...args: unknown[]): void => {
          const msg = formatMessage(args.map(a => typeof a === "string" ? a.replace(/\n/g, " ") : a));
          g.write(g.entry({ severity: "DEBUG" }, msg)).catch(noop);
        },
        info: (...args: unknown[]): void => {
          g.write(g.entry({ severity: "INFO" }, formatMessage(args))).catch(noop);
        },
        error: (...args: unknown[]): void => {
          g.write(g.entry({ severity: "ERROR" }, formatMessage(args))).catch(noop);
        },
      };
    })()
  : {
      debug: IS_PROD ? noop : (...args: unknown[]): void => {
        console.log("[DEBUG]", ...args.map(a => typeof a === "string" ? a.replace(/\n/g, " ") : a));
      },
      info: (...args: unknown[]): void => {
        console.log("[INFO]", ...args);
      },
      error: (...args: unknown[]): void => {
        console.log("[ERROR]", ...args);
      },
    };

export default logger;
