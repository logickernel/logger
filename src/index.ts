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
const CONSOLE_PRETTY = process.env.LOGGER_CONSOLE_FORMAT?.toLowerCase() !== "plain";
const noop = (): void => {};

const envLabels: Record<string, string> = {};
if (process.env.ENVIRONMENT) envLabels.environment  = process.env.ENVIRONMENT;
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

// Formats a pretty console log line: "{emoji} {local timestamp} [(scope) ]{message}[\n  {payload}]"
// Optional color wraps timestamp and scope+message (used for warning=yellow, error+=red when pretty format is on).
function consoleLine(emoji: string, message: string, payload?: Record<string, unknown>, scope?: string, color?: string): string {
  const d = new Date();
  const ts = d.toLocaleString("sv-SE") + "." + String(d.getMilliseconds()).padStart(3, "0");
  const scopePart = scope ? `(${scope}) ` : "";
  const suffix = payload ? "\n\x1b[38;5;66m" + JSON.stringify(payload, null, 2).replace(/^/gm, "    ") + ANSI_RESET : "";
  const tsPart = color ? color + ts + ANSI_RESET : "\x1b[90m" + ts + ANSI_RESET;
  const body = scopePart + message;
  const coloredBody = color ? color + body + ANSI_RESET : body;
  return `${emoji} ${tsPart}  ${coloredBody}${suffix}`;
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

  function resolveLabels(extraLabels?: Record<string, string>): Record<string, string> | undefined {
    const merged = { ...instanceLabels, ...extraLabels };
    return Object.keys(merged).length ? merged : undefined;
  }

  function gcpMeta(severity: string, extraLabels?: Record<string, string>): Record<string, unknown> {
    const labels = resolveLabels(extraLabels);
    return labels ? { severity, labels } : { severity };
  }

  function gcpData(message: string, payload?: Record<string, unknown>): string | Record<string, unknown> {
    return payload ? { message, ...payload } : message;
  }

  const backends: Logger[] = [];

  if (gcpLog) {
    const g = gcpLog;
    const gw = (sev: string, msg: string, p?: Record<string, unknown>, l?: Record<string, string>): void => {
      g.write(g.entry(gcpMeta(sev, l), gcpData(msg, p))).catch(noop);
    };
    backends.push({
      debug:     (msg, p, l) => gw("DEBUG",     msg, p, l),
      info:      (msg, p, l) => gw("INFO",      msg, p, l),
      notice:    (msg, p, l) => gw("NOTICE",    msg, p, l),
      warning:   (msg, p, l) => gw("WARNING",   msg, p, l),
      error:     (msg, p, l) => gw("ERROR",     msg, p, l),
      critical:  (msg, p, l) => gw("CRITICAL",  msg, p, l),
      alert:     (msg, p, l) => gw("ALERT",     msg, p, l),
      emergency: (msg, p, l) => gw("EMERGENCY", msg, p, l),
    });
  }

  if (USE_CONSOLE || backends.length === 0) {
    if (CONSOLE_PRETTY) {
      const cw = (emoji: string, color: string | undefined, msg: string, p?: Record<string, unknown>): void => {
        console.log(consoleLine(emoji, msg, p, scope, color));
      };
      backends.push({
        debug:     (msg, p) => cw("🐞", undefined,   msg, p),
        info:      (msg, p) => cw("⚪️", undefined,   msg, p),
        notice:    (msg, p) => cw("🔵", undefined,   msg, p),
        warning:   (msg, p) => cw("🟡", ANSI_YELLOW, msg, p),
        error:     (msg, p) => cw("🔴", ANSI_RED,    msg, p),
        critical:  (msg, p) => cw("⛔️", ANSI_RED,    msg, p),
        alert:     (msg, p) => cw("❗️", ANSI_RED,    msg, p),
        emergency: (msg, p) => cw("🚨", ANSI_RED,    msg, p),
      });
    } else {
      const pw = (msg: string, p?: Record<string, unknown>): void => {
        console.log(consolePlain(msg, p, scope));
      };
      backends.push({
        debug: pw, info: pw, notice: pw, warning: pw,
        error: pw, critical: pw, alert: pw, emergency: pw,
      });
    }
  }

  return backends.length === 1
    ? backends[0]
    : {
        debug:     (msg, p, l): void => { backends.forEach(b => b.debug(msg, p, l));     },
        info:      (msg, p, l): void => { backends.forEach(b => b.info(msg, p, l));      },
        notice:    (msg, p, l): void => { backends.forEach(b => b.notice(msg, p, l));    },
        warning:   (msg, p, l): void => { backends.forEach(b => b.warning(msg, p, l));   },
        error:     (msg, p, l): void => { backends.forEach(b => b.error(msg, p, l));     },
        critical:  (msg, p, l): void => { backends.forEach(b => b.critical(msg, p, l));  },
        alert:     (msg, p, l): void => { backends.forEach(b => b.alert(msg, p, l));     },
        emergency: (msg, p, l): void => { backends.forEach(b => b.emergency(msg, p, l)); },
      };
}

export default logger;
