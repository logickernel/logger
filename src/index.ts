import { Logging } from "@google-cloud/logging";

type LogMethod = (message: string, event?: string, payload?: Record<string, unknown>, labels?: Record<string, string>) => void;

export interface Logger {
  debug: LogMethod;
  info: LogMethod;
  notice: LogMethod;
  warning: LogMethod;
  error: LogMethod;
  critical: LogMethod;
  alert: LogMethod;
  emergency: LogMethod;
}

// Resolved once at module load — no per-call branching.
// LOGGER_TARGET accepts a comma-separated list of backends: "gcp", "console", or "gcp,console".
const rawTargets = process.env.LOGGER_TARGET;
const targets = rawTargets
  ? new Set(rawTargets.toLowerCase().split(",").map(s => s.trim()).filter(Boolean))
  : null;

const USE_GCP     = targets ? targets.has("gcp")    : !!process.env.GCP_PROJECT;
const USE_CONSOLE = targets ? targets.has("console") : !process.env.GCP_PROJECT;
const CONSOLE_PRETTY = process.env.LOGGER_CONSOLE_FORMAT?.toLowerCase() !== "plain";
const noop = (): void => {};

const envLabels: Record<string, string> = {};
if (process.env.ENVIRONMENT) envLabels.environment = process.env.ENVIRONMENT;
if (process.env.SERVICE)     envLabels.service      = process.env.SERVICE;
if (process.env.VERSION)     envLabels.version      = process.env.VERSION;

// GCP Log singleton — shared across all logger() calls.
const gcpLog = USE_GCP ? (() => {
  try {
    const logName = process.env.LOGGER_NAME ?? process.env.K_SERVICE ?? "local";
    return new Logging({ projectId: process.env.GCP_PROJECT }).log(logName);
  } catch {
    return null;
  }
})() : null;

const ANSI_RED = "\x1b[31m";
const ANSI_YELLOW = "\x1b[33m";
const ANSI_RESET = "\x1b[0m";

// Formats a pretty console log line: "{emoji} {local timestamp} [(scope) ][[event] ]{message}[\n  {payload}]"
// Optional color wraps timestamp and scope+event+message (used for warning=yellow, error+=red when pretty format is on).
function consoleLine(emoji: string, message: string, payload?: Record<string, unknown>, scope?: string, event?: string, color?: string): string {
  const d = new Date();
  const ts = d.toLocaleString("sv-SE") + "." + String(d.getMilliseconds()).padStart(3, "0");
  const scopePart = scope ? `(${scope}) ` : "";
  const eventPart = event ? `[${event}] ` : "";
  const suffix = payload ? "\n\x1b[38;5;66m" + JSON.stringify(payload, null, 2).replace(/^/gm, "    ") + ANSI_RESET : "";
  const tsPart = color ? color + ts + ANSI_RESET : "\x1b[90m" + ts + ANSI_RESET;
  const body = scopePart + eventPart + message;
  const coloredBody = color ? color + body + ANSI_RESET : body;
  return `${emoji} ${tsPart}  ${coloredBody}${suffix}`;
}

// Plain console line: "[(scope) ][[event] ]{message}[ {payload}]"
function consolePlain(message: string, payload?: Record<string, unknown>, scope?: string, event?: string): string {
  const scopePart = scope ? `(${scope}) ` : "";
  const eventPart = event ? `[${event}] ` : "";
  const suffix = payload ? " " + JSON.stringify(payload, null, 2).replace(/\n\s*/g, " ") : "";
  return `${scopePart}${eventPart}${message}${suffix}`;
}

export function logger(scope?: string): Logger {
  const instanceLabels: Record<string, string> = {
    ...envLabels,
    ...(scope ? { scope } : {}),
  };

  function resolveLabels(event?: string, extraLabels?: Record<string, string>): Record<string, string> | undefined {
    const merged = { ...instanceLabels, ...(event ? { event } : {}), ...extraLabels };
    return Object.keys(merged).length ? merged : undefined;
  }

  function gcpMeta(severity: string, event?: string, extraLabels?: Record<string, string>): Record<string, unknown> {
    const labels = resolveLabels(event, extraLabels);
    return labels ? { severity, labels } : { severity };
  }

  function gcpData(message: string, payload?: Record<string, unknown>): string | Record<string, unknown> {
    return payload ? { message, ...payload } : message;
  }

  const backends: Logger[] = [];

  if (gcpLog) {
    const g = gcpLog;
    backends.push({
      debug:     (message, event, payload, labels): void => { g.write(g.entry(gcpMeta("DEBUG",     event, labels), gcpData(message, payload))).catch(noop); },
      info:      (message, event, payload, labels): void => { g.write(g.entry(gcpMeta("INFO",      event, labels), gcpData(message, payload))).catch(noop); },
      notice:    (message, event, payload, labels): void => { g.write(g.entry(gcpMeta("NOTICE",    event, labels), gcpData(message, payload))).catch(noop); },
      warning:   (message, event, payload, labels): void => { g.write(g.entry(gcpMeta("WARNING",   event, labels), gcpData(message, payload))).catch(noop); },
      error:     (message, event, payload, labels): void => { g.write(g.entry(gcpMeta("ERROR",     event, labels), gcpData(message, payload))).catch(noop); },
      critical:  (message, event, payload, labels): void => { g.write(g.entry(gcpMeta("CRITICAL",  event, labels), gcpData(message, payload))).catch(noop); },
      alert:     (message, event, payload, labels): void => { g.write(g.entry(gcpMeta("ALERT",     event, labels), gcpData(message, payload))).catch(noop); },
      emergency: (message, event, payload, labels): void => { g.write(g.entry(gcpMeta("EMERGENCY", event, labels), gcpData(message, payload))).catch(noop); },
    });
  }

  if (USE_CONSOLE || backends.length === 0) {
    backends.push(CONSOLE_PRETTY
      ? {
          debug:     (message, event, payload): void => { console.log(consoleLine("🐞", message, payload, scope, event)); },
          info:      (message, event, payload): void => { console.log(consoleLine("⚪️", message, payload, scope, event)); },
          notice:    (message, event, payload): void => { console.log(consoleLine("🔵", message, payload, scope, event)); },
          warning:   (message, event, payload): void => { console.log(consoleLine("🟡", message, payload, scope, event, ANSI_YELLOW)); },
          error:     (message, event, payload): void => { console.log(consoleLine("🔴", message, payload, scope, event, ANSI_RED)); },
          critical:  (message, event, payload): void => { console.log(consoleLine("⛔️", message, payload, scope, event, ANSI_RED)); },
          alert:     (message, event, payload): void => { console.log(consoleLine("❗️", message, payload, scope, event, ANSI_RED)); },
          emergency: (message, event, payload): void => { console.log(consoleLine("🚨", message, payload, scope, event, ANSI_RED)); },
        }
      : {
          debug:     (message, event, payload): void => { console.log(consolePlain(message, payload, scope, event)); },
          info:      (message, event, payload): void => { console.log(consolePlain(message, payload, scope, event)); },
          notice:    (message, event, payload): void => { console.log(consolePlain(message, payload, scope, event)); },
          warning:   (message, event, payload): void => { console.log(consolePlain(message, payload, scope, event)); },
          error:     (message, event, payload): void => { console.log(consolePlain(message, payload, scope, event)); },
          critical:  (message, event, payload): void => { console.log(consolePlain(message, payload, scope, event)); },
          alert:     (message, event, payload): void => { console.log(consolePlain(message, payload, scope, event)); },
          emergency: (message, event, payload): void => { console.log(consolePlain(message, payload, scope, event)); },
        });
  }

  return backends.length === 1
    ? backends[0]
    : {
        debug:     (message, event, payload, labels): void => { backends.forEach(b => b.debug(message, event, payload, labels));     },
        info:      (message, event, payload, labels): void => { backends.forEach(b => b.info(message, event, payload, labels));      },
        notice:    (message, event, payload, labels): void => { backends.forEach(b => b.notice(message, event, payload, labels));    },
        warning:   (message, event, payload, labels): void => { backends.forEach(b => b.warning(message, event, payload, labels));   },
        error:     (message, event, payload, labels): void => { backends.forEach(b => b.error(message, event, payload, labels));     },
        critical:  (message, event, payload, labels): void => { backends.forEach(b => b.critical(message, event, payload, labels));  },
        alert:     (message, event, payload, labels): void => { backends.forEach(b => b.alert(message, event, payload, labels));     },
        emergency: (message, event, payload, labels): void => { backends.forEach(b => b.emergency(message, event, payload, labels)); },
      };
}

export default logger;
