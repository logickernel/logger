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

- `message` — human-readable description of the event. Required.
- `payload` — measurements and event data. Optional. Becomes `jsonPayload` in GCP.
- `labels` — categorization dimensions. Optional. Strings only. GCP-only (ignored on console).

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

## Payload vs labels — the core rule

`@logickernel/logger` is a **telemetry tool**. Log entries are data points for Cloud Monitoring dashboards and log-based metrics, not just text records.

| | `payload` (2nd arg) | `labels` (3rd arg + scope) |
|---|---|---|
| Type | `Record<string, unknown>` | `Record<string, string>` — strings only |
| Purpose | Measurements and event data | Categorization and filtering |
| GCP storage | `jsonPayload` fields — indexed, queryable by field | Entry labels — used as metric dimensions |
| Cardinality | Can be high | **Must be low** — bounded, known sets of values |
| Metric use | Field values extracted as data points (e.g. latency, count) | Dimensions to group and filter metrics by |

### Put in payload
- Numeric measurements: `ms`, `bytes`, `count`, `retries`, `rows`
- High-cardinality identifiers: `userId`, `orderId`, `requestId`, `traceId`
- Variable strings: query text, URLs, error messages, stack traces
- Boolean flags: `hit`, `success`, `cached`

```ts
log.info("query executed", { ms: 42, rows: 120, cached: false, table: "orders" });
log.error("payment failed", { code: "insufficient_funds", amount: 99.95, orderId: "o-8821" });
```

### Put in labels (scope or 3rd arg)
- Bounded enumerations: `method` (GET/POST/…), `provider` (stripe/paypal/…), `currency`, `region`, `queue`, `status_class` (2xx/4xx/5xx)
- Component or subsystem name → use `scope` instead of a per-call label

```ts
const log = logger("billing"); // scope = "billing" on every entry

log.info("charge processed", { amount: 99.95, orderId: "o-8821" }, { provider: "stripe", currency: "usd" });
log.warning("retry scheduled", { attempt: 2, delayMs: 1000 }, { provider: "stripe", queue: "payments" });
```

### Never put in labels
- User IDs, order IDs, request IDs, trace IDs — unbounded cardinality will break Cloud Monitoring metrics
- Numeric values — labels are strings, put numbers in payload
- Error messages or stack traces — put in payload

---

## Label sources and merge order

Labels on a GCP entry come from three sources, merged in this order (later wins):

1. **Env labels** — set once at module load from `ENVIRONMENT`, `SERVICE_ID`, `VERSION`
2. **Scope** — set at `logger("scope")` call time
3. **Per-call labels** — 3rd argument on individual log calls

```ts
// Resulting labels: { environment: "production", service_id: "api", scope: "orders", method: "POST" }
log.info("order created", { total: 49.99 }, { method: "POST" });
```

---

## Environment variables

| Variable | Effect |
|---|---|
| `LOGGER_NAME` | Log name in Cloud Logging (primary grouping). Falls back to `K_SERVICE`, then `"local"` |
| `GCP_PROJECT` | Enables GCP backend when set |
| `LOGGER_TARGET` | Force backend: `"gcp"`, `"console"`, or `"gcp,console"` |
| `ENVIRONMENT` | Attached as `labels.environment` on every entry |
| `SERVICE_ID` | Attached as `labels.service_id` on every entry |
| `VERSION` | Attached as `labels.version` on every entry |
| `LOGGER_CONSOLE_FORMAT` | Set to `"pretty"` for emoji + timestamp output locally |

---

## Anti-patterns

```ts
// ✗ Instantiating inside a function — overhead on every call, unstable scope
export function handleRequest(req) {
  const log = logger("api"); // move this to module scope
  log.info("request", { method: req.method });
}

// ✗ High-cardinality values as labels
log.info("request handled", { ms: 42 }, { userId: "u-9182", requestId: "r-001" }); // userId/requestId → payload

// ✗ Numeric values as labels (labels are strings; numbers won't be extractable as metric values)
log.info("query done", {}, { ms: "42" }); // ms → payload as number

// ✗ Using payload for categorization you need to group by in dashboards
log.info("charge processed", { provider: "stripe", amount: 99 }); // provider → labels

// ✗ Logging without any structured data when measurements are available
log.info("request handled"); // missed opportunity — add { ms, status } to payload
```

---

## Correct patterns

```ts
import { logger } from "@logickernel/logger";

// Module-scope instantiation with a meaningful scope
const log = logger("orders");

export async function createOrder(data: OrderInput): Promise<Order> {
  const t = Date.now();
  const order = await db.insert(data);
  log.info("order created", { ms: Date.now() - t, total: order.total, items: order.items.length }, { currency: order.currency });
  return order;
}

export async function cancelOrder(id: string, reason: string): Promise<void> {
  await db.update(id, { status: "cancelled" });
  log.notice("order cancelled", { orderId: id, reason }, { initiator: "user" });
}

export async function retryPayment(orderId: string, attempt: number): Promise<void> {
  try {
    await payment.charge(orderId);
    log.info("payment succeeded", { attempt, orderId }, { provider: "stripe" });
  } catch (err: any) {
    log.warning("payment failed", { attempt, orderId, code: err.code }, { provider: "stripe" });
  }
}
```
