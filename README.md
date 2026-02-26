## @logickernel/logger

Lightweight Node.js logger that automatically routes logs to **Google Cloud Logging** (when available) or the **local console**. Designed for small services and tools where you want structured logs in GCP without wiring up a full logging stack.

```ts
import logger from "@logickernel/logger";

logger.info("server started");
logger.debug({ port: 3000, env: process.env.NODE_ENV });
logger.error(new Error("something went wrong"));
```

> Your code never has to care whether it’s running on Cloud Run / GCP or locally – the logger picks the right backend at startup.

---

## 1. Introduction

- **What it is**: A tiny logging helper with a fixed interface (`debug`, `info`, `error`) and a smart backend:
  - In **GCP** (or when `SYSTEM_LOGS=gcp`): writes to Google Cloud Logging with proper severities.
  - Otherwise: writes to `console.log` with simple prefixes.
- **Why it exists**: To avoid sprinkling environment-specific logging logic across your codebase. You import one `logger` and use it everywhere.

**Key features**

- **Zero config in GCP**: Uses `K_SERVICE` and `GCP_PROJECT` from the environment.
- **Auto backend selection**: GCP vs console decided once at module load.
- **Production-safe debug**: `debug` is a noop when `NODE_ENV=production`.
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

logger.info("hello from my service");
logger.debug({ userId: "123", action: "login" });
logger.error(new Error("oops"));
```

The default export is a **singleton** whose backend is chosen at module load:

- **GCP backend** is used when:
  - `SYSTEM_LOGS=gcp`, or
  - `K_SERVICE` is set (e.g. Cloud Run)
- Otherwise, the **console backend** is used.

### Environment variables

- `SYSTEM_LOGS=gcp`  
  Force GCP logging even if `K_SERVICE` is not set.

- `K_SERVICE`  
  Used as the log name in Google Cloud Logging. If not set, `"app"` is used.

- `GCP_PROJECT`  
  Project ID for Google Cloud Logging. Required when using the GCP backend.

- `NODE_ENV=production`  
  When set to `"production"`, `logger.debug` becomes a noop (no debug logs).

### Named exports

```ts
import logger, { Logger, formatMessage } from "@logickernel/logger";

const myLogger: Logger = logger;
const message = formatMessage(["hello", { id: 1 }]);
```

---

## 4. Additional Resources

- **Package**: `@logickernel/logger` on npm.
- **License**: MIT (see `LICENSE` in this repository).
- **Contributions**: Feel free to open issues or pull requests if you’d like improvements (extra transports, richer metadata, etc.).
