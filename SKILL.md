# Skill: @logickernel/logger

Reference for agents writing code that uses [`@logickernel/logger`](https://www.npmjs.com/package/@logickernel/logger).

---

## Setup

```bash
npm install @logickernel/logger
```

```ts
import { logger } from "@logickernel/logger";
```

Create one logger instance per module or service boundary, at module scope (not inside functions):

```ts
const log = logger("payments"); // scope is a GCP label attached to every entry
```

`logger()` with no argument is valid for scripts or top-level utilities with no meaningful boundary.

---

## Signature

All eight methods share the same signature:

```ts
log.info(message: string, payload?: Record<string, unknown>, labels?: Record<string, string>): void
```

- `message` — human-readable description of what happened. Required.
- `payload` — measurements and event data. Optional. Becomes `jsonPayload` in GCP (fields indexed and queryable).
- `labels` — extra GCP labels merged per-call, taking precedence over all calculated labels (env, scope). Must be low-cardinality strings. Ignored by the console backend.

---

## Severity selection

| Method | Use when |
|---|---|
| `debug` | Trace or diagnostic detail for development |
| `info` | Normal operation — routine events and performance data |
| `notice` | Significant but expected events (startup, shutdown, config change) |
| `warning` | Something unexpected that may cause a problem but did not yet |
| `error` | A failure occurred that is likely to cause a problem |
| `critical` | A failure is causing degraded service or an outage |
| `alert` | Requires immediate human action |
| `emergency` | System is unusable |

---

## Message naming

Use a specific, past-tense phrase. The message must be readable in a log stream without opening the payload.

| Avoid | Use instead |
|---|---|
| `"error"` | `"payment charge failed"`, `"connection refused"` |
| `"db error"` | `"query timed out"`, `"connection pool exhausted"` |
| `"user action"` | `"user authenticated"`, `"password reset requested"` |
| `"job done"` | `"invoice batch processed"`, `"report generated"` |
| `"request"` | `"HTTP request completed"`, `"request not accepted"` |

---

## Telemetry model

`@logickernel/logger` is a **telemetry tool**. Log entries are data points for Cloud Monitoring dashboards and log-based metrics, not just text records.

When a payload is present, the logger writes it to GCP as `jsonPayload` with `message` merged in as `jsonPayload.message`. This makes the message text queryable in Cloud Logging just like any other payload field — no separate event label is needed. `labels.scope` provides the component dimension; `jsonPayload.message` and payload fields provide everything else.

| | `message` (1st arg) | `payload` (2nd arg) | `labels` (3rd arg) |
|---|---|---|---|
| Type | `string` | `Record<string, unknown>` | `Record<string, string>` |
| Purpose | Human description | Measurements and context | Per-call GCP label overrides |
| GCP storage | Entry message | `jsonPayload` fields — indexed, queryable by field | Merged into entry labels, wins over env/scope |
| Cardinality | N/A | Can be high | **Must be low** |
| Metric use | Human readability | Field values extracted as data points (e.g. latency, count) | Additional dimensions not known at instantiation time |

### Put in payload
- Numeric measurements: `ms`, `bytes`, `count`, `retries`, `rows`
- High-cardinality identifiers: `userId`, `orderId`, `requestId`, `traceId`
- Variable strings: query text, URLs, error messages, stack traces
- Boolean flags: `hit`, `success`, `cached`

```ts
log.info("database query returned", { ms: 42, rows: 120, cached: false });
log.warning("card declined by issuing bank", { amount: 99.95, orderId: "o-8821", code: "insufficient_funds" });
```

---

## Label sources

Labels on a GCP entry come from these sources, merged in this order (later wins):

1. **Env labels** — set once at module load from `ENVIRONMENT`, `SERVICE`, `VERSION`
2. **Scope** — set at `logger("scope")` call time
3. **Per-call labels** — 3rd argument on individual log calls

```ts
// Resulting labels: { environment: "production", service: "api", scope: "orders" }
log.info("new order placed", { total: 49.99, items: 3 });
```

---

## Environment variables

| Variable | Effect |
|---|---|
| `LOGGER_NAME` | Log name in Cloud Logging (primary grouping). Falls back to `K_SERVICE`, then `"local"` |
| `GCP_PROJECT` | Enables GCP backend when set |
| `LOGGER_TARGET` | Force backend: `"gcp"`, `"console"`, or `"gcp,console"` |
| `ENVIRONMENT` | Attached as `labels.environment` on every entry |
| `SERVICE` | Attached as `labels.service` on every entry |
| `VERSION` | Attached as `labels.version` on every entry |
| `LOGGER_CONSOLE_FORMAT` | Defaults to pretty (emoji + timestamp). Set to `"plain"` to disable formatting |

---

## Anti-patterns

```ts
// ✗ Instantiating inside a function — overhead on every call, unstable scope
export function handleRequest(req) {
  const log = logger("api"); // move this to module scope
  log.info("HTTP request completed", { method: req.method });
}

// ✗ Measurements as strings — cannot be extracted as metric values in Cloud Monitoring
log.warning("disk nearing capacity", { used: "92%", mount: "/data" }); // usedPct: 92 → payload as number

// ✗ 'message' as a payload key — silently overwrites the first argument in GCP jsonPayload
log.info("payment accepted", { message: "it worked", amount: 99.95 }); // message → 1st arg only

// ✗ Logging without structured data when measurements are available
log.info("HTTP request completed"); // missed opportunity — add { ms, status } to payload
```

---

## Correct patterns

```ts
import { logger } from "@logickernel/logger";

// Message-only is correct for debug traces — development breadcrumbs with no measurement intent
const log = logger("cache");
log.debug("cache miss, fetching from origin");
log.debug("lock acquired, waiting for release");
```

```ts
import { logger } from "@logickernel/logger";

// Module-scope instantiation with a meaningful scope
const log = logger("orders");

export async function createOrder(data: OrderInput): Promise<Order> {
  const t = Date.now();
  const order = await db.insert(data);
  log.info("new order placed", { ms: Date.now() - t, total: order.total, items: order.items.length });
  return order;
}

export async function cancelOrder(id: string, reason: string): Promise<void> {
  await db.update(id, { status: "cancelled" });
  log.notice("customer order cancelled", { orderId: id, reason });
}

export async function retryPayment(orderId: string, attempt: number): Promise<void> {
  try {
    await payment.charge(orderId);
    log.info("card charged successfully", { attempt, orderId, provider: "stripe" });
  } catch (err: any) {
    log.warning("provider rejected the charge", { attempt, orderId, provider: "stripe", code: err.code });
  }
}
```
