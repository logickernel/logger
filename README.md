## @logickernel/logger

Lightweight Node.js logger that automatically routes logs to **Google Cloud Logging** (when available) or the **local console**. Designed for small services and tools where you want structured logs in GCP without wiring up a full logging stack.

```ts
import { logger } from "@logickernel/logger";

const log = logger("api"); // optional scope label on every entry

log.info("server started", { port: 3000 });
log.debug("user action", { userId: "123", action: "login" });
log.warning("disk space low", { used: "92%", mount: "/data" });
```

> Your code never has to care whether it's running on Cloud Run / GCP or locally – the logger picks the right backend at startup.

---

## 1. Introduction

- **What it is**: A tiny logging helper with the full GCP severity ladder and a configurable backend:
  - In **GCP** (or when `LOGGER_TARGET=gcp`): writes to Google Cloud Logging with proper severities and structured `jsonPayload` when a context object is provided.
  - On the **console**: writes with emoji prefixes, a local timestamp, and the context object inlined as compact JSON.
  - **Both at once**: set `LOGGER_TARGET=gcp,console` to fan out to both.
- **Why it exists**: To avoid sprinkling environment-specific logging logic across your codebase. You import one `logger` and use it everywhere.

**Key features**

- **Zero config in GCP**: Uses `LOGGER_NAME` / `K_SERVICE` and `GCP_PROJECT` from the environment.
- **Auto backend selection**: GCP vs console decided once at module load; override with `LOGGER_TARGET`.
- **Multi-backend**: `LOGGER_TARGET` accepts a comma-separated list — `"gcp,console"` writes to both simultaneously.
- **Full severity ladder**: `debug`, `info`, `notice`, `warning`, `error`, `critical`, `alert`, `emergency`.
- **Structured context**: Pass a plain object as the last argument — it becomes a `jsonPayload` in GCP (queryable by field) and inline JSON in the console.
- **Tiny API**: `logger(scope?)` factory — call it once per module or service boundary.

---

## 2. Installation & Usage

### Install from npm

```bash
npm install @logickernel/logger
```

### Basic usage

```ts
import { logger } from "@logickernel/logger";

// Scopeless logger — fine for scripts and simple tools
const log = logger();

log.info("server started");
log.debug("cache miss");
log.warning("disk space low", { used: "92%", mount: "/data" });
log.error("request failed", { method: "POST", path: "/api/orders", status: 503 });
log.critical("primary db unreachable", { host: "db-1", retries: 3 });

// Scoped logger — attaches scope: "api" to every entry as a GCP label
const apiLog = logger("api");
apiLog.info("request handled", { method: "GET", status: 200 });

// Per-call labels — merged with scope and env labels for that entry only
apiLog.info("request handled", { method: "GET", status: 200 }, { traceId: "abc-123" });
```

`logger(scope?)` returns a `Logger` instance. Call it once per module or service boundary. The backend (GCP or console) is chosen once at module load:

- **GCP backend** is used when `GCP_PROJECT` is set.
- Otherwise, the **console backend** is used.

### Method signature

All eight severity methods share the same signature:

```ts
log.info(message: string, payload?: Record<string, unknown>, labels?: Record<string, string>): void
```

- **`message`** — required string.
- **`payload`** — optional plain object. Becomes `jsonPayload` in GCP (fields indexed and queryable); inlined as compact JSON on the console.
- **`labels`** — optional per-call labels merged with scope and env labels (GCP only; ignored on console).

### Severity methods

| Method | GCP severity | Console emoji |
|---|---|---|
| `debug` | `DEBUG` | 🐞 |
| `info` | `INFO` | ⚪️ |
| `notice` | `NOTICE` | 🔵 |
| `warning` | `WARNING` | 🟡 |
| `error` | `ERROR` | 🔴 |
| `critical` | `CRITICAL` | ⛔️ |
| `alert` | `ALERT` | ❗️ |
| `emergency` | `EMERGENCY` | 🚨 |

### Scope

`logger(scope)` attaches a `scope` label to every entry, letting you filter by component in Cloud Logging:

```ts
const db = logger("db");
db.warning("slow query", { ms: 412, query: "SELECT ..." });
// GCP entry: labels.scope = "db"
```

### Structured context

Pass a plain object as the second argument to attach structured data to a log entry:

```ts
log.info("request complete", { method: "GET", path: "/api/users", status: 200, ms: 42 });
```

- **GCP backend**: written as `jsonPayload` — fields are indexed and queryable in Cloud Logging.
- **Console backend**: inlined as spaced JSON on the same line.

### Per-call labels

Pass a `Record<string, string>` as the third argument to attach labels to a single entry (GCP only):

```ts
log.info("payment processed", { amount: 99 }, { traceId: "t-123", userId: "u-42" });
// GCP entry: labels = { traceId: "t-123", userId: "u-42", ...scope, ...envLabels }
```

### Console format

By default, console logs are plain: `message [payload]` without emoji or timestamp.

When `LOGGER_CONSOLE_FORMAT=pretty`, console logs look like:

```
⚪️ 2026-02-26 13:04:22.120 server started
🐞 2026-02-26 13:04:22.341 cache miss { "key": "user:42", "ttl": 300 }
🟡 2026-02-26 13:04:22.512 disk space low { "used": "92%", "mount": "/data" }
```

This "pretty" format (emoji + local timestamp + message + optional payload) is meant to roughly emulate what you see in the GCP Logging console when browsing entries by severity and time.

### Environment variables

- `GCP_PROJECT`  
  Project ID for Google Cloud Logging. When set (and `LOGGER_TARGET` isn’t forcing console), the GCP backend is used.

- `LOGGER_NAME`  
  Log name in Google Cloud Logging. Falls back to `K_SERVICE`, then `"local"`.

- `LOGGER_TARGET`
  Comma-separated list of backends to activate: `"gcp"`, `"console"`, or `"gcp,console"` for both simultaneously. When unset, GCP is used if `GCP_PROJECT` is set, otherwise console.

- `LOGGER_CONSOLE_FORMAT`
  Controls the console output format. When set to `"pretty"`, uses emoji + timestamp lines (mirroring the feel of GCP Logging's console UI); otherwise (default) prints plain `message [payload]` without emoji or timestamp.

- `K_SERVICE`
  Fallback log name in Google Cloud Logging when `LOGGER_NAME` is not set. Usually set up by Google Cloud Run. If neither is set, `"local"` is used.

### Named exports

```ts
import { logger } from "@logickernel/logger";
import type { Logger } from "@logickernel/logger";

const log: Logger = logger("my-scope");
```

`logger` is also the default export: `import logger from "@logickernel/logger"`.

---

## 3. Local Setup (Development)

### Prerequisites

- **Node.js**: v18+ recommended (any actively supported LTS should work).
- **npm** (or compatible package manager).

### Clone and install

```bash
git clone https://github.com/logickernel/logger.git
cd logger
npm install
```

### Useful scripts

```bash
# Run tests
npm test

# Type-check
npm run typecheck

# Build the library
npm run build
```

---

## 4. Additional Resources

- **Package**: `@logickernel/logger` on npm.
- **License**: MIT (see `LICENSE` in this repository).
- **Contributions**: Feel free to open issues or pull requests if you'd like improvements (extra transports, richer metadata, etc.).
