## @logickernel/logger

Production-ready Node.js logger with intelligent backend routing and structured logging. Automatically detects GCP environments and routes logs to **Google Cloud Logging** with proper severities and queryable `jsonPayload`, or falls back to the **local console** for development. Features the full GCP severity ladder, scoped logging, structured event identifiers, and dual-backend support—enabling log-based metrics and dashboards without additional infrastructure.

```ts
import { logger } from "@logickernel/logger";

const log = logger("api"); // optional scope label on every entry

log.notice("server started");
log.info("user authenticated", "user_login", { userId: "123" });
log.warning("disk nearing capacity", "disk_space_low", { usedPct: 92, mount: "/data" });
```

> Your code never has to care whether it's running on Cloud Run / GCP or locally – the logger picks the right backend at startup.

---

## 1. Introduction

- **What it is**: A tiny logging helper with the full GCP severity ladder and a configurable backend:
  - In **GCP** (or when `LOGGER_TARGET=gcp`): writes to Google Cloud Logging with proper severities and structured `jsonPayload` when a payload object is provided.
  - On the **console**: writes with emoji prefixes, a local timestamp, and the payload inlined as compact JSON.
  - **Both at once**: set `LOGGER_TARGET=gcp,console` to fan out to both.
- **Why it exists**: To make it easy to produce structured, queryable telemetry from any Node.js service without wiring up a separate metrics stack. Log entries are first-class data points: their `jsonPayload` fields and labels feed directly into Cloud Monitoring log-based metrics and dashboards.

**Key features**

- **Zero config in GCP**: Uses `LOGGER_NAME` / `K_SERVICE` and `GCP_PROJECT` from the environment.
- **Auto backend selection**: GCP vs console decided once at module load; override with `LOGGER_TARGET`.
- **Multi-backend**: `LOGGER_TARGET` accepts a comma-separated list — `"gcp,console"` writes to both simultaneously.
- **Full severity ladder**: `debug`, `info`, `notice`, `warning`, `error`, `critical`, `alert`, `emergency`.
- **Structured context**: Pass a plain object as the third argument — it becomes a `jsonPayload` in GCP (queryable by field) and inline JSON in the console.
- **Scope**: `logger("name")` attaches a `scope` label to every entry, great for filtering by component.
- **Event**: Pass a string as the second argument to identify the event type as a low-cardinality GCP label.

---

## 2. Installation & Usage

### Install from npm

```bash
npm install @logickernel/logger
```

### Basic usage

The simplest form — just a message — is perfectly valid for most log lines:

```ts
import { logger } from "@logickernel/logger";

const log = logger();

log.notice("server started");
log.debug("cache miss");
log.warning("disk space low");
```

When you need structured data or GCP metrics, add `event` and `payload` as opt-in extensions:

```ts
// event identifies the type of occurrence (2nd arg)
// payload carries measurements and context (3rd arg)
log.info("user authenticated", "user_login", { userId: "123" });
log.warning("disk nearing capacity", "disk_space_low", { usedPct: 92, mount: "/data" });
log.error("upstream returned an error", "request_failed", { status: 503, ms: 1250 });

// Scoped logger — attaches scope: "payments" to every entry as a GCP label
const paymentsLog = logger("payments");
paymentsLog.info("payment accepted", "charge_processed", { amount: 99.95 });
paymentsLog.warning("card declined by issuing bank", "charge_failed", { code: "card_declined" });
```

`logger(scope?)` returns a `Logger` instance. Call it once per module or service boundary. The backend (GCP or console) is chosen once at module load:

- **GCP backend** is used when `GCP_PROJECT` is set.
- Otherwise, the **console backend** is used.

If GCP is selected but the Cloud Logging client fails to initialize (e.g. missing or invalid credentials), the logger falls back to the console backend so your app keeps logging.

### Method signature

All eight severity methods share the same signature:

```ts
log.info(message: string, event?: string, payload?: Record<string, unknown>, labels?: Record<string, string>): void
```

- **`message`** — required string. Human-readable description of what happened.
- **`event`** — optional snake_case identifier for the event type. Stored as `labels.event` in GCP; shown in brackets on the console.
- **`payload`** — optional plain object. Becomes `jsonPayload` in GCP (fields indexed and queryable); inlined as compact JSON on the console.
- **`labels`** — optional extra GCP labels merged on top of the instance labels. Per-call labels take precedence over env labels, scope, and event. Must be low-cardinality strings. Ignored by the console backend.

### Severity methods

| Method | GCP severity | Console emoji | When to use |
|---|---|---|---|
| `debug` | `DEBUG` | 🐞 | Debug or trace information |
| `info` | `INFO` | ⚪️ | Routine information, such as ongoing status or performance |
| `notice` | `NOTICE` | 🔵 | Normal but significant events, such as start up, shut down, or a configuration change |
| `warning` | `WARNING` | 🟡 | Warning events that might cause problems |
| `error` | `ERROR` | 🔴 | Error events that are likely to cause problems |
| `critical` | `CRITICAL` | ⛔️ | Critical events that cause more severe problems or outages |
| `alert` | `ALERT` | ❗️ | A person must take an action immediately |
| `emergency` | `EMERGENCY` | 🚨 | One or more systems are unusable |

### Scope

`logger(scope)` attaches a `scope` label to every entry, letting you filter by component in Cloud Logging:

```ts
const db = logger("db");
db.warning("database response took too long", "query_slow", { ms: 412, rows: 5200 });
// GCP entry: labels = { scope: "db", event: "query_slow" }
```

### Structured context

Pass a plain object as the third argument to attach structured data to a log entry:

```ts
log.info("HTTP request completed", "request_complete", { status: 200, ms: 42 });
```

- **GCP backend**: written as `jsonPayload` — fields are indexed and queryable in Cloud Logging.
- **Console backend**: inlined as spaced JSON on the same line.

### Event

Pass a `string` as the second argument to tag the entry with a machine-readable event identifier. It is stored as `labels.event` in GCP — a low-cardinality dimension like `scope`, `environment`, and `service`:

```ts
log.info("payment accepted", "charge_processed", { amount: 99.95, orderId: "o-4421" });
// GCP entry: labels = { scope: "payments", event: "charge_processed", environment: "production" }
```

**Naming conventions:**

- Use `snake_case` with underscore-separated words.
- Use past tense for things that happened: `payment_charge_processed`, `user_login`, `query_timeout`.
- Use noun form for conditions: `disk_space_low`, `cache_miss`.
- Use scope for the component, event for the specific action within it — they're complementary:
  ```ts
  const log = logger("payments");
  log.info("payment accepted", "charge_processed", { amount: 99.95 });
  // labels: { scope: "payments", event: "charge_processed" }
  ```
- Keep events low-cardinality. Encode variable context (provider, region, method) in the event name or move it to payload:
  ```ts
  // Good — low-cardinality event, variable data in payload
  log.info("payment accepted", "charge_processed", { amount: 99.95, provider: "stripe" });

  // Also fine — provider encoded in event name
  log.info("payment accepted", "stripe_charge_processed", { amount: 99.95 });
  ```

### Console format

By default, console logs are pretty — severity as an emoji, a local timestamp, and the payload expanded below the message — mimicking the [GCP Log Explorer](https://cloud.google.com/logging/docs/view/logs-explorer-interface) so local development feels close to what you see when browsing entries in production. Console logs look like:

```
🔵 2026-02-26 13:04:22.120  server started
🐞 2026-02-26 13:04:22.341  (api) cache miss
🟡 2026-02-26 13:04:22.512  (payments) [charge_failed] card declined by issuing bank
    {
      "code": "card_declined"
    }
⚪️ 2026-02-26 13:04:22.701  [user_login] user authenticated
    {
      "userId": "u-9182"
    }
```

Scope (if set) appears in parentheses before the event. Event (if set) appears in brackets before the message. Payload (if any) is printed on the next line with 4-space indentation. The timestamp is dimmed and `warning`/`error` and above are colored (yellow/red) for visibility. Set `LOGGER_CONSOLE_FORMAT=plain` to disable all formatting and get bare `[(scope) ][[event] ]message[ {payload}]` lines.

### Environment variables

- `LOGGER_NAME`
  Log name in Google Cloud Logging. This is a very important attribute that is the primary group in reports — logs are usually grouped by system instance/environment so entries stay together. Falls back to `K_SERVICE`, then `"local"`.

- `GCP_PROJECT`
  Project ID for Google Cloud Logging. When set (and `LOGGER_TARGET` isn't forcing console), the GCP backend is used.

- `LOGGER_TARGET`
  Comma-separated list of backends to activate: `"gcp"`, `"console"`, or `"gcp,console"` for both simultaneously. When unset, GCP is used if `GCP_PROJECT` is set, otherwise console.

- `LOGGER_CONSOLE_FORMAT`
  Controls the console output format. Defaults to pretty — emoji + timestamp lines that emulate GCP's log viewer. Set to `"plain"` to disable formatting and print bare `message [payload]` lines instead.

- `ENVIRONMENT`
  Attached as `labels.environment` on every GCP entry. Useful for filtering by `"production"`, `"staging"`, etc.

- `SERVICE`
  Attached as `labels.service` on every GCP entry.

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

## 3. Best Practices

### Purpose: structured telemetry, not just log lines

Every log entry written to Cloud Logging is a queryable data point. The goal is to make those entries useful beyond text search: payload fields become extractable metric values (latency, counts, sizes), and labels become the dimensions you filter and group by in Cloud Monitoring dashboards and alerting policies.

### Write specific, past-tense messages

The message is what you read when scanning a log stream — it should be self-explanatory without opening the payload. Use a specific past-tense phrase.

| Avoid | Prefer |
|---|---|
| `"error"` | `"payment charge failed"` |
| `"db error"` | `"query timed out"`, `"connection pool exhausted"` |
| `"user action"` | `"user login"`, `"password reset requested"` |
| `"job done"` | `"invoice batch processed"`, `"report generated"` |

Payload fields and event labels exist for querying and metrics — the message is for humans.

### Payload carries values; event carries the type

The three arguments serve distinct roles and should not be mixed:

| | `message` — 1st arg | `event` — 2nd arg | `payload` — 3rd arg |
|---|---|---|---|
| Type | `string` | `string` | `Record<string, unknown>` |
| Purpose | Human description | Machine-readable event type | Measurements and context |
| GCP storage | Entry message | `labels.event` | Indexed as `jsonPayload` fields |
| Metrics use | Human readability | Low-cardinality dimension | Field values extracted into metric data points |
| Cardinality | N/A | Must be low (bounded enum) | Can be high (IDs, URLs, counts) |

**Put measurements and context in payload — always as numbers, not strings:**

```ts
log.info("HTTP request completed",           "request_handled", { ms: 42, status: 200, bytes: 1024 });
log.info("served from cache",               "cache_hit",       { ttl: 300 });
log.warning("database response took too long", "query_slow",   { ms: 850, rowsScanned: 12000 });
log.info("batch run finished",              "batch_complete",  { processed: 142, failed: 3, durationMs: 5400 });
```

Measurements must be numbers — `usedPct: 92`, not `used: "92%"`. Strings cannot be extracted as metric values in Cloud Monitoring.

**Use event for the type; encode variable context in payload:**

```ts
const log = logger("payments");

log.info("payment accepted",            "charge_processed", { amount: 99.95, provider: "stripe" });
log.warning("card declined by issuing bank", "charge_failed", { code: "card_declined", provider: "stripe" });
```

### Instantiate once per module or service boundary

Create the logger at module scope, not inside request handlers or loops. The factory is lightweight, but calling it repeatedly is unnecessary and loses the benefit of a stable scope label.

```ts
// Good — created once, reused everywhere in this module
const log = logger("orders");

export async function createOrder(data: OrderData) {
  log.info("new order placed", "order_created", { orderId: data.id, total: data.total });
}

// Avoid — recreated on every call
export async function createOrder(data: OrderData) {
  logger("orders").info("order created", "order_created", { orderId: data.id, total: data.total });
}
```

### Building log-based metrics in Cloud Monitoring

Once entries flow into Cloud Logging you can create log-based metrics in a few steps:

1. Open **Cloud Logging → Log-based Metrics → Create metric**.
2. Set a filter to scope the metric, e.g.:
   ```
   logName="projects/MY_PROJECT/logs/MY_LOG"
   severity="INFO"
   jsonPayload.ms > 0
   ```
3. For a **distribution metric** (e.g. request latency), set the **field extractor** to `jsonPayload.ms`.
4. Add **label extractors** for the dimensions you want to slice by, e.g. `labels.scope`, `labels.event`.
5. Chart the metric in **Cloud Monitoring** or attach an alerting policy (e.g. p99 latency > 500 ms).

---

## 4. Local Setup (Development)

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

## 5. Additional Resources

- **Package**: `@logickernel/logger` on npm.
- **License**: MIT (see `LICENSE` in this repository).
- **Contributions**: Feel free to open issues or pull requests if you'd like improvements (extra transports, richer metadata, etc.).
