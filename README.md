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
  - In **GCP** (or when `LOGGER_TARGET=gcp`): writes to Google Cloud Logging with proper severities and structured `jsonPayload` when a payload object is provided.
  - On the **console**: writes with emoji prefixes, a local timestamp, and the payload inlined as compact JSON.
  - **Both at once**: set `LOGGER_TARGET=gcp,console` to fan out to both.
- **Why it exists**: To avoid sprinkling environment-specific logging logic across your codebase. You import one factory and use it everywhere.

**Key features**

- **Zero config in GCP**: Uses `LOGGER_NAME` / `K_SERVICE` and `GCP_PROJECT` from the environment.
- **Auto backend selection**: GCP vs console decided once at module load; override with `LOGGER_TARGET`.
- **Multi-backend**: `LOGGER_TARGET` accepts a comma-separated list — `"gcp,console"` writes to both simultaneously.
- **Full severity ladder**: `debug`, `info`, `notice`, `warning`, `error`, `critical`, `alert`, `emergency`.
- **Structured context**: Pass a plain object as the second argument — it becomes a `jsonPayload` in GCP (queryable by field) and inline JSON in the console.
- **Scope**: `logger("name")` attaches a `scope` label to every entry, great for filtering by component.
- **Per-call labels**: Pass a third argument to attach GCP labels to a single entry (e.g. `traceId`, `userId`).

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

Pass a `Record<string, string>` as the third argument to attach labels to a single entry (GCP only). They are merged with env labels and scope, with per-call values taking precedence:

```ts
log.info("payment processed", { amount: 99 }, { traceId: "t-123", userId: "u-42" });
// GCP entry: labels = { ...envLabels, scope: "...", traceId: "t-123", userId: "u-42" }
```

### Console format

By default, console logs are plain: `[(scope) ]message[ {payload}]` without emoji or timestamp.

When `LOGGER_CONSOLE_FORMAT=pretty`, console logs look like:

```
⚪️ 2026-02-26 13:04:22.120 server started
🐞 2026-02-26 13:04:22.341 (api) cache miss { "key": "user:42", "ttl": 300 }
🟡 2026-02-26 13:04:22.512 disk space low { "used": "92%", "mount": "/data" }
```

Scope (if set) appears in parentheses before the message. Labels are GCP metadata and are not shown on the console.

### Environment variables

- `LOGGER_NAME`
  Log name in Google Cloud Logging. This is a very important attribute that is the primary group in reports — logs are usually grouped by system instance/environment so entries stay together. Falls back to `K_SERVICE`, then `"local"`.

- `GCP_PROJECT`
  Project ID for Google Cloud Logging. When set (and `LOGGER_TARGET` isn't forcing console), the GCP backend is used.

- `LOGGER_TARGET`
  Comma-separated list of backends to activate: `"gcp"`, `"console"`, or `"gcp,console"` for both simultaneously. When unset, GCP is used if `GCP_PROJECT` is set, otherwise console.

- `LOGGER_CONSOLE_FORMAT`
  Controls the console output format. When set to `"pretty"`, uses emoji + timestamp lines; otherwise (default) prints plain `message [payload]` without emoji or timestamp.

- `ENVIRONMENT`
  Attached as `labels.environment` on every GCP entry. Useful for filtering by `"production"`, `"staging"`, etc.

- `SERVICE_ID`
  Attached as `labels.service_id` on every GCP entry.

- `VERSION`
  Attached as `labels.version` on every GCP entry.

- `K_SERVICE`
  Fallback log name in Google Cloud Logging when `LOGGER_NAME` is not set. Usually set automatically by Google Cloud Run.

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
