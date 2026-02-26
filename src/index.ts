import { Logging } from "@google-cloud/logging";

export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  notice: (...args: unknown[]) => void;
  warning: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  critical: (...args: unknown[]) => void;
  alert: (...args: unknown[]) => void;
  emergency: (...args: unknown[]) => void;
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
const LOGGER_TARGET = process.env.LOGGER_TARGET?.toLowerCase();
const LOGGER_FORMAT = process.env.LOGGER_FORMAT?.toLowerCase();
const FORCE_GCP = LOGGER_TARGET === "gcp";
const FORCE_CONSOLE = LOGGER_TARGET === "console";
const USE_GCP = !FORCE_CONSOLE && (FORCE_GCP || !!process.env.GCP_PROJECT);
const CONSOLE_PRETTY = LOGGER_FORMAT === "pretty";
const noop = (): void => {};

// Formats a single console log line: "{emoji} {local timestamp} {message} [{payload}]"
function consoleLine(emoji: string, args: unknown[]): string {
  const d = new Date();
  const ts = d.toLocaleString("sv-SE") + "." + String(d.getMilliseconds()).padStart(3, "0");
  const last = args[args.length - 1];
  const hasPayload = args.length >= 2 && last !== null && typeof last === "object" && !Array.isArray(last) && !(last instanceof Error);
  const msg = formatMessage(hasPayload ? args.slice(0, -1) : args);
  const suffix = hasPayload ? " " + JSON.stringify(last, null, 2).replace(/\n\s*/g, " ") : "";
  return `${emoji} ${ts} ${msg}${suffix}`;
}

// Plain console line: "message [{payload}]"
function consolePlain(args: unknown[]): string {
  const last = args[args.length - 1];
  const hasPayload =
    args.length >= 2 &&
    last !== null &&
    typeof last === "object" &&
    !Array.isArray(last) &&
    !(last instanceof Error);
  const msg = formatMessage(hasPayload ? args.slice(0, -1) : args);
  const suffix = hasPayload ? " " + JSON.stringify(last, null, 2).replace(/\n\s*/g, " ") : "";
  return `${msg}${suffix}`;
}

// If the last arg is a plain object, return a jsonPayload so Cloud Logging
// indexes its fields. Otherwise return a plain string (textPayload).
function gcpPayload(args: unknown[]): string | Record<string, unknown> {
  const last = args[args.length - 1];
  if (
    args.length >= 2 &&
    last !== null &&
    typeof last === "object" &&
    !Array.isArray(last) &&
    !(last instanceof Error)
  ) {
    return { message: formatMessage(args.slice(0, -1)), ...(last as Record<string, unknown>) };
  }
  return formatMessage(args);
}

let gcpLog: ReturnType<Logging["log"]> | null = null;
if (USE_GCP) {
  try {
    const logName = process.env.LOGGER_NAME ?? process.env.K_SERVICE ?? "local";
    gcpLog = new Logging({ projectId: process.env.GCP_PROJECT }).log(logName);
  } catch {
    // GCP init failed; fall back to console
  }
}

export const logger: Logger = gcpLog
  ? (() => {
      const g = gcpLog!;
      return {
        debug: (...args: unknown[]): void => {
          const mapped = args.map(a => (typeof a === "string" ? a.replace(/\n/g, " ") : a));
          g.write(g.entry({ severity: "DEBUG" }, gcpPayload(mapped))).catch(noop);
        },
        info: (...args: unknown[]): void => {
          g.write(g.entry({ severity: "INFO" }, gcpPayload(args))).catch(noop);
        },
        notice: (...args: unknown[]): void => {
          g.write(g.entry({ severity: "NOTICE" }, gcpPayload(args))).catch(noop);
        },
        warning: (...args: unknown[]): void => {
          g.write(g.entry({ severity: "WARNING" }, gcpPayload(args))).catch(noop);
        },
        error: (...args: unknown[]): void => {
          g.write(g.entry({ severity: "ERROR" }, gcpPayload(args))).catch(noop);
        },
        critical: (...args: unknown[]): void => {
          g.write(g.entry({ severity: "CRITICAL" }, gcpPayload(args))).catch(noop);
        },
        alert: (...args: unknown[]): void => {
          g.write(g.entry({ severity: "ALERT" }, gcpPayload(args))).catch(noop);
        },
        emergency: (...args: unknown[]): void => {
          g.write(g.entry({ severity: "EMERGENCY" }, gcpPayload(args))).catch(noop);
        },
      };
    })()
  : CONSOLE_PRETTY
  ? {
      debug: (...args: unknown[]): void => {
        console.log(
          consoleLine(
            "🐞",
            args.map(a => (typeof a === "string" ? a.replace(/\n/g, " ") : a)),
          ),
        );
      },
      info:      (...args: unknown[]): void => { console.log(consoleLine("⚪️", args)); },
      notice:    (...args: unknown[]): void => { console.log(consoleLine("🔵", args)); },
      warning:   (...args: unknown[]): void => { console.log(consoleLine("🟡", args)); },
      error:     (...args: unknown[]): void => { console.log(consoleLine("🔴", args)); },
      critical:  (...args: unknown[]): void => { console.log(consoleLine("⛔️", args)); },
      alert:     (...args: unknown[]): void => { console.log(consoleLine("❗️", args)); },
      emergency: (...args: unknown[]): void => { console.log(consoleLine("🚨", args)); },
    }
  : {
      debug: (...args: unknown[]): void => {
        console.log(
          consolePlain(
            args.map(a => (typeof a === "string" ? a.replace(/\n/g, " ") : a)),
          ),
        );
      },
      info:      (...args: unknown[]): void => { console.log(consolePlain(args)); },
      notice:    (...args: unknown[]): void => { console.log(consolePlain(args)); },
      warning:   (...args: unknown[]): void => { console.log(consolePlain(args)); },
      error:     (...args: unknown[]): void => { console.log(consolePlain(args)); },
      critical:  (...args: unknown[]): void => { console.log(consolePlain(args)); },
      alert:     (...args: unknown[]): void => { console.log(consolePlain(args)); },
      emergency: (...args: unknown[]): void => { console.log(consolePlain(args)); },
    };

export default logger;
