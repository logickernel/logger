## @logickernel/logger

Lightweight Node.js logger that automatically routes logs to **Google Cloud Logging** (when available) or the **local console**. Designed for small services and tools where you want structured logs in GCP without wiring up a full logging stack.

```ts
import logger from "@logickernel/logger";

logger.info("server started", { port: 3000 });
logger.debug("user action", { userId: "123", action: "login" });
logger.error(new Error("something went wrong"));
logger.warning("disk space low", { used: "92%", mount: "/data" });
```

> Your code never has to care whether it’s running on Cloud Run / GCP or locally – the logger picks the right backend at startup.

---

## 1. Introduction

- **What it is**: A tiny logging helper with the full GCP severity ladder and a smart backend:
  - In **GCP** (or when `SYSTEM_LOGS=gcp`): writes to Google Cloud Logging with proper severities and structured `jsonPayload` when a context object is provided.
  - Otherwise: writes to the local console with emoji prefixes, a local timestamp, and the context object inlined as compact JSON.
- **Why it exists**: To avoid sprinkling environment-specific logging logic across your codebase. You import one `logger` and use it everywhere.

**Key features**

- **Zero config in GCP**: Uses `K_SERVICE` and `GCP_PROJECT` from the environment.
- **Auto backend selection**: GCP vs console decided once at module load.
- **Full severity ladder**: `debug`, `info`, `notice`, `warning`, `error`, `critical`, `alert`, `emergency`.
- **Structured context**: Pass a plain object as the last argument — it becomes a `jsonPayload` in GCP (queryable by field) and compact inline JSON in the console.
- **Tiny API**: One default export (`logger`) plus a `formatMessage` helper if you need it.

---

## 2. Local Setup (Development)

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

## 3. Installation & Usage (as a Library)

### Install from npm

```bash
npm install @logickernel/logger
```

### Basic usage

```ts
import logger from "@logickernel/logger";

logger.info("server started", { port: 3000 });
logger.debug("user action", { userId: "123", action: "login" });
logger.warning("disk space low", { used: "92%", mount: "/data" });
logger.error(new Error("oops"));
logger.critical("primary db unreachable", { host: "db-1" });
```

The default export is a **singleton** whose backend is chosen at module load:

- **GCP backend** is used when:
  - `SYSTEM_LOGS=gcp`, or
  - `K_SERVICE` is set (e.g. Cloud Run)
- Otherwise, the **console backend** is used.

### Severity methods

| Method | GCP severity | Console emoji |
|---|---|---|
| `debug` | `DEBUG` | 🐞 |
| `info` | `INFO` | ℹ️ |
| `notice` | `NOTICE` | *️⃣ |
| `warning` | `WARNING` | ⚠️ |
| `error` | `ERROR` | ⛔️ |
| `critical` | `CRITICAL` | ❗️ |
| `alert` | `ALERT` | ‼️ |
| `emergency` | `EMERGENCY` | 🚨 |

### Structured context

Pass a plain object as the last argument to attach structured data to a log entry:

```ts
logger.info("request complete", { method: "GET", path: "/api/users", status: 200, ms: 42 });
```

- **GCP backend**: written as `jsonPayload` — fields are indexed and queryable in Cloud Logging.
- **Console backend**: inlined as compact JSON on the same line.

### Console format

```
🐞 2026-02-26 13:04:22.341 user action {"userId":"123","action":"login"}
⚠️ 2026-02-26 13:04:22.512 disk space low {"used":"92%","mount":"/data"}
```

### Environment variables

- `SYSTEM_LOGS=gcp`
  Force GCP logging even if `K_SERVICE` is not set.

- `K_SERVICE`
  Used as the log name in Google Cloud Logging. If not set, `"app"` is used.

- `GCP_PROJECT`
  Project ID for Google Cloud Logging. Required when using the GCP backend.

### Named exports

```ts
import logger, { Logger, formatMessage } from "@logickernel/logger";

const myLogger: Logger = logger;
const message = formatMessage(["hello", { id: 1 }]); // "hello {"id":1}"
```

---

## 4. Additional Resources

- **Package**: `@logickernel/logger` on npm.
- **License**: MIT (see `LICENSE` in this repository).
- **Contributions**: Feel free to open issues or pull requests if you’d like improvements (extra transports, richer metadata, etc.).
