import { Logging } from "@google-cloud/logging";

type LogMethod = (message: string, payload?: Record<string, unknown>, labels?: Record<string, string>) => void;

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
const CONSOLE_PRETTY = process.env.LOGGER_CONSOLE_FORMAT?.toLowerCase() === "pretty";
const noop = (): void => {};

const envLabels: Record<string, string> = {};
if (process.env.ENVIRONMENT) envLabels.environment = process.env.ENVIRONMENT;
if (process.env.SERVICE_ID)  envLabels.service_id  = process.env.SERVICE_ID;
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

// Formats a pretty console log line: "{emoji} {local timestamp} [(scope) ]{message}[\n  {payload}]"
function consoleLine(emoji: string, message: string, payload?: Record<string, unknown>, scope?: string): string {
  const d = new Date();
  const ts = d.toLocaleString("sv-SE") + "." + String(d.getMilliseconds()).padStart(3, "0");
  const scopePart = scope ? `(${scope}) ` : "";
  const suffix = payload ? "\n\x1b[2m" + JSON.stringify(payload, null, 2).replace(/^/gm, "    ") + "\x1b[0m" : "";
  return `${emoji} \x1b[90m${ts}\x1b[0m  ${scopePart}${message}${suffix}`;
}

// Plain console line: "[(scope) ]{message}[ {payload}]"
function consolePlain(message: string, payload?: Record<string, unknown>, scope?: string): string {
  const scopePart = scope ? `(${scope}) ` : "";
  const suffix = payload ? " " + JSON.stringify(payload, null, 2).replace(/\n\s*/g, " ") : "";
  return `${scopePart}${message}${suffix}`;
}

export function logger(scope?: string): Logger {
  const instanceLabels: Record<string, string> = {
    ...envLabels,
    ...(scope ? { scope } : {}),
  };

  function resolveLabels(callLabels?: Record<string, string>): Record<string, string> | undefined {
    const merged = { ...instanceLabels, ...callLabels };
    return Object.keys(merged).length ? merged : undefined;
  }

  function gcpMeta(severity: string, callLabels?: Record<string, string>): Record<string, unknown> {
    const labels = resolveLabels(callLabels);
    return labels ? { severity, labels } : { severity };
  }

  function gcpData(message: string, payload?: Record<string, unknown>): string | Record<string, unknown> {
    return payload ? { message, ...payload } : message;
  }

  const backends: Logger[] = [];

  if (gcpLog) {
    const g = gcpLog;
    backends.push({
      debug:     (message, payload, labels): void => { g.write(g.entry(gcpMeta("DEBUG",     labels), gcpData(message, payload))).catch(noop); },
      info:      (message, payload, labels): void => { g.write(g.entry(gcpMeta("INFO",      labels), gcpData(message, payload))).catch(noop); },
      notice:    (message, payload, labels): void => { g.write(g.entry(gcpMeta("NOTICE",    labels), gcpData(message, payload))).catch(noop); },
      warning:   (message, payload, labels): void => { g.write(g.entry(gcpMeta("WARNING",   labels), gcpData(message, payload))).catch(noop); },
      error:     (message, payload, labels): void => { g.write(g.entry(gcpMeta("ERROR",     labels), gcpData(message, payload))).catch(noop); },
      critical:  (message, payload, labels): void => { g.write(g.entry(gcpMeta("CRITICAL",  labels), gcpData(message, payload))).catch(noop); },
      alert:     (message, payload, labels): void => { g.write(g.entry(gcpMeta("ALERT",     labels), gcpData(message, payload))).catch(noop); },
      emergency: (message, payload, labels): void => { g.write(g.entry(gcpMeta("EMERGENCY", labels), gcpData(message, payload))).catch(noop); },
    });
  }

  if (USE_CONSOLE || backends.length === 0) {
    backends.push(CONSOLE_PRETTY
      ? {
          debug:     (message, payload): void => { console.log(consoleLine("🐞", message, payload, scope)); },
          info:      (message, payload): void => { console.log(consoleLine("⚪️", message, payload, scope)); },
          notice:    (message, payload): void => { console.log(consoleLine("🔵", message, payload, scope)); },
          warning:   (message, payload): void => { console.log(consoleLine("🟡", message, payload, scope)); },
          error:     (message, payload): void => { console.log(consoleLine("🔴", message, payload, scope)); },
          critical:  (message, payload): void => { console.log(consoleLine("⛔️", message, payload, scope)); },
          alert:     (message, payload): void => { console.log(consoleLine("❗️", message, payload, scope)); },
          emergency: (message, payload): void => { console.log(consoleLine("🚨", message, payload, scope)); },
        }
      : {
          debug:     (message, payload): void => { console.log(consolePlain(message, payload, scope)); },
          info:      (message, payload): void => { console.log(consolePlain(message, payload, scope)); },
          notice:    (message, payload): void => { console.log(consolePlain(message, payload, scope)); },
          warning:   (message, payload): void => { console.log(consolePlain(message, payload, scope)); },
          error:     (message, payload): void => { console.log(consolePlain(message, payload, scope)); },
          critical:  (message, payload): void => { console.log(consolePlain(message, payload, scope)); },
          alert:     (message, payload): void => { console.log(consolePlain(message, payload, scope)); },
          emergency: (message, payload): void => { console.log(consolePlain(message, payload, scope)); },
        });
  }

  return backends.length === 1
    ? backends[0]
    : {
        debug:     (message, payload, labels): void => { backends.forEach(b => b.debug(message, payload, labels));     },
        info:      (message, payload, labels): void => { backends.forEach(b => b.info(message, payload, labels));      },
        notice:    (message, payload, labels): void => { backends.forEach(b => b.notice(message, payload, labels));    },
        warning:   (message, payload, labels): void => { backends.forEach(b => b.warning(message, payload, labels));   },
        error:     (message, payload, labels): void => { backends.forEach(b => b.error(message, payload, labels));     },
        critical:  (message, payload, labels): void => { backends.forEach(b => b.critical(message, payload, labels));  },
        alert:     (message, payload, labels): void => { backends.forEach(b => b.alert(message, payload, labels));     },
        emergency: (message, payload, labels): void => { backends.forEach(b => b.emergency(message, payload, labels)); },
      };
}

export default logger;
