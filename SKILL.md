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
log.info(message: string, event?: string, payload?: Record<string, unknown>): void
```

- `message` — human-readable description of what happened. Required.
- `event` — machine-readable snake_case event identifier. Optional. Stored as `labels.event` in GCP; shown in `[brackets]` on the console.
- `payload` — measurements and event data. Optional. Becomes `jsonPayload` in GCP.

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
| `"user action"` | `"user login"`, `"password reset requested"` |
| `"job done"` | `"invoice batch processed"`, `"report generated"` |
| `"request"` | `"request handled"`, `"request rejected"` |

---

## Three-part telemetry model

`@logickernel/logger` is a **telemetry tool**. Log entries are data points for Cloud Monitoring dashboards and log-based metrics, not just text records.

| | `message` (1st arg) | `event` (2nd arg) | `payload` (3rd arg) |
|---|---|---|---|
| Type | `string` | `string` | `Record<string, unknown>` |
| Purpose | Human description | Machine-readable event type | Measurements and context |
| GCP storage | Entry message | `labels.event` — low-cardinality dimension | `jsonPayload` fields — indexed, queryable by field |
| Cardinality | N/A | **Must be low** — bounded enum of known event types | Can be high |
| Metric use | Human readability | Dimension to group and filter metrics by | Field values extracted as data points (e.g. latency, count) |

### Event naming conventions

- `snake_case`, underscore-separated
- Past tense for things that happened: `payment_charge_processed`, `user_login`, `query_timeout`
- Noun form for conditions: `disk_space_low`, `cache_miss`
- Use scope for the component, event for the specific action within it:

```ts
const log = logger("payments");
log.info("charge processed", "charge_processed", { amount: 99.95 });
// GCP labels: { scope: "payments", event: "charge_processed", environment: "production" }
```

### Put in payload
- Numeric measurements: `ms`, `bytes`, `count`, `retries`, `rows`
- High-cardinality identifiers: `userId`, `orderId`, `requestId`, `traceId`
- Variable strings: query text, URLs, error messages, stack traces
- Boolean flags: `hit`, `success`, `cached`

```ts
log.info("query executed", "query_executed", { ms: 42, rows: 120, cached: false });
log.warning("payment charge declined", "charge_declined", { amount: 99.95, orderId: "o-8821", code: "insufficient_funds" });
```

---

## Label sources

Labels on a GCP entry come from these sources, merged in this order (later wins):

1. **Env labels** — set once at module load from `ENVIRONMENT`, `SERVICE`, `VERSION`
2. **Scope** — set at `logger("scope")` call time
3. **Event** — 2nd argument on individual log calls → stored as `labels.event`

```ts
// Resulting labels: { environment: "production", service: "api", scope: "orders", event: "order_created" }
log.info("order created", "order_created", { total: 49.99, items: 3 });
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
| `LOGGER_CONSOLE_FORMAT` | Set to `"pretty"` for emoji + timestamp output locally |

---

## Anti-patterns

```ts
// ✗ Instantiating inside a function — overhead on every call, unstable scope
export function handleRequest(req) {
  const log = logger("api"); // move this to module scope
  log.info("request handled", "request_handled", { method: req.method });
}

// ✗ High-cardinality values as event — event must be a bounded enum
log.info("request handled", `user_${userId}_request`, { ms: 42 }); // userId in event → move to payload

// ✗ Numeric values as event (event is a label; numbers belong in payload)
log.info("query done", "42ms", { rows: 120 }); // latency → payload as number

// ✗ Measurements as strings — cannot be extracted as metric values in Cloud Monitoring
log.warning("disk space low", "disk_space_low", { used: "92%", mount: "/data" }); // usedPct: 92 → payload as number

// ✗ 'message' as a payload key — silently overwrites the first argument in GCP jsonPayload
log.info("charge processed", "charge_processed", { message: "it worked", amount: 99.95 }); // message → 1st arg only

// ✗ Logging without structured data when measurements are available
log.info("request handled"); // missed opportunity — add event + { ms, status } to payload
```

---

## Correct patterns

```ts
import { logger } from "@logickernel/logger";

// Message-only is correct for debug traces — development breadcrumbs
// with no measurement intent and no need for a machine-readable event
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
  log.info("order created", "order_created", { ms: Date.now() - t, total: order.total, items: order.items.length });
  return order;
}

export async function cancelOrder(id: string, reason: string): Promise<void> {
  await db.update(id, { status: "cancelled" });
  log.notice("order cancelled", "order_cancelled", { orderId: id, reason });
}

export async function retryPayment(orderId: string, attempt: number): Promise<void> {
  try {
    await payment.charge(orderId);
    log.info("payment succeeded", "payment_succeeded", { attempt, orderId, provider: "stripe" });
  } catch (err: any) {
    log.warning("payment failed", "payment_failed", { attempt, orderId, provider: "stripe", code: err.code });
  }
}
```
