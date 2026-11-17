# Design Document: create-listing

## Overview

`createListing` is a single CommonJS function in `server/src/models/listing.js`. It validates a seller's claim on one unit of an inventory holding, atomically decrements the holding quantity by 1, inserts a new `listings` row priced at the holding's unit cost, and returns a structured listing object. Three named error classes (`HoldingNotFoundError`, `HoldingOwnershipError`, `HoldingExhaustedError`) are co-exported so callers can distinguish failure modes.

The design is intentionally thin: no HTTP layer, no service class, no caching — just a pure data-layer function matching the patterns established by `server/src/models/inventory.js`.

---

## Architecture

```
Caller
  │
  ▼
createListing(db, holdingId, sellerUserId)   ← server/src/models/listing.js
  │
  ├─ validate: SELECT from inventory_holdings
  ├─ guard: ownership check (in-process, no DB)
  ├─ guard: quantity check  (in-process, no DB)
  ├─ UPDATE inventory_holdings SET quantity = quantity - 1
  └─ INSERT INTO listings
       └─ return { id, holdingId, askingPriceCents, status, createdAt }

All four DB operations wrapped in db.transaction(...)
```

There is no separate service or repository layer — the function calls `better-sqlite3` prepared statements directly, following the same style as `buyIntoInventory` in `inventory.js`.

---

## Components and Interfaces

### Module: `server/src/models/listing.js`

**Exports:**

| Export | Kind | Description |
|---|---|---|
| `createListing` | function | Main entry point — see signature below |
| `HoldingNotFoundError` | class | Thrown when `holdingId` has no DB row |
| `HoldingOwnershipError` | class | Thrown when `holding.user_id !== sellerUserId` |
| `HoldingExhaustedError` | class | Thrown when `holding.quantity < 1` |

**Function signature:**

```js
function createListing(db, holdingId, sellerUserId)
  → { id, holdingId, askingPriceCents, status: 'open', createdAt }
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `db` | `better-sqlite3` Database | Open DB instance with schema applied |
| `holdingId` | integer | PK of the `inventory_holdings` row to list from |
| `sellerUserId` | string | Must match `holding.user_id` |

**Return value:**

| Field | Type | Description |
|---|---|---|
| `id` | integer | `lastInsertRowid` from the listings INSERT |
| `holdingId` | integer | The `holdingId` argument echoed back |
| `askingPriceCents` | integer (cents) | Equals `holding.unit_cost_cents` |
| `status` | `'open'` | Always `'open'` on creation |
| `createdAt` | ISO-8601 string | Timestamp of the INSERT |

**Error classes:**

```js
class HoldingNotFoundError extends Error {
  constructor(msg) { super(msg); this.name = 'HoldingNotFoundError'; }
}
class HoldingOwnershipError extends Error {
  constructor(msg) { super(msg); this.name = 'HoldingOwnershipError'; }
}
class HoldingExhaustedError extends Error {
  constructor(msg) { super(msg); this.name = 'HoldingExhaustedError'; }
}
```

---

## Data Models

### `inventory_holdings` (read and updated)

| Column | Type | Constraint | Notes |
|---|---|---|---|
| `id` | INTEGER PK | | Matched by `holdingId` |
| `user_id` | TEXT | NOT NULL | Compared to `sellerUserId` |
| `product_id` | INTEGER | FK → products | Not used by createListing directly |
| `quantity` | INTEGER | CHECK ≥ 1 | Decremented by 1 on success |
| `unit_cost_cents` | INTEGER | CHECK ≥ 1 | Becomes `asking_price_cents` |
| `created_at` | TEXT | NOT NULL | Not modified |

> **Note on the CHECK constraint:** `quantity CHECK(quantity >= 1)` is enforced at INSERT time only by SQLite; an UPDATE that sets `quantity = 0` is permitted. The application guard (`quantity < 1` check before the UPDATE) prevents the quantity from ever reaching 0 via `createListing`.

### `listings` (inserted into)

| Column | Type | Constraint | Notes |
|---|---|---|---|
| `id` | INTEGER PK | | Auto-assigned |
| `holding_id` | INTEGER | FK → inventory_holdings | Set to `holdingId` |
| `asking_price_cents` | INTEGER | CHECK ≥ 1 | Set to `holding.unit_cost_cents` |
| `status` | TEXT | CHECK IN ('open','sold','cancelled') | Always `'open'` on insert |
| `created_at` | TEXT | NOT NULL | ISO-8601, set to `new Date().toISOString()` |

### Money invariant

`asking_price_cents` is copied from `holding.unit_cost_cents`, which is itself an integer populated by `buyIntoInventory` via `getBulkUnitCostCents`. No arithmetic is performed by `createListing`, so no rounding is needed and the integer invariant is preserved trivially.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Not-found guard fires for any non-existent holdingId

*For any* integer `holdingId` that has no corresponding row in `inventory_holdings`, calling `createListing` SHALL throw an error whose `name` is `'HoldingNotFoundError'`.

**Validates: Requirements 1.1**

---

### Property 2: Ownership guard fires for any mismatched sellerUserId

*For any* existing holding with a known `user_id`, calling `createListing` with a `sellerUserId` that is any string other than that `user_id` SHALL throw an error whose `name` is `'HoldingOwnershipError'`.

**Validates: Requirements 2.1**

---

### Property 3: Exhausted holding throws and leaves quantity unchanged

*For any* holding whose quantity has been reduced to 0 (by consuming all prior units), calling `createListing` SHALL throw `HoldingExhaustedError` and the holding's quantity in the database SHALL remain 0, never -1.

**Validates: Requirements 3.1, 7.3**

---

### Property 4: Successful call decrements quantity by exactly 1

*For any* holding with `quantity >= 1` and correct ownership, one call to `createListing` SHALL result in the holding's `quantity` in the database being exactly 1 less than it was before the call, regardless of the starting quantity or the number of prior successful calls.

**Validates: Requirements 4.1, 4.2**

---

### Property 5: Inserted row content and return value are consistent

*For any* valid `(holdingId, sellerUserId)` pair, the row inserted into `listings` and the object returned by `createListing` SHALL agree on all fields: `id`, `holdingId` (= `holding_id`), `askingPriceCents` (= `asking_price_cents` = `holding.unit_cost_cents`, an integer), `status = 'open'`, and `createdAt`.

**Validates: Requirements 5.1, 5.2, 6.1, 6.2**

---

## Error Handling

| Condition | Error class | When thrown | Side-effects |
|---|---|---|---|
| `holdingId` not in DB | `HoldingNotFoundError` | Before any write | None |
| `holding.user_id !== sellerUserId` | `HoldingOwnershipError` | Before any write | None |
| `holding.quantity < 1` | `HoldingExhaustedError` | Before the UPDATE | None |
| INSERT into `listings` fails (constraint) | Re-thrown by `db.transaction` | After UPDATE attempt | UPDATE rolled back by transaction |

All three named errors extend `Error` and set `this.name` explicitly so callers can distinguish them without an `instanceof` check across module boundaries.

The `db.transaction(...)` wrapper handles rollback automatically: `better-sqlite3` transactions roll back on any thrown exception, so the decrement UPDATE is reversed if the INSERT throws a constraint error.

---

## Testing Strategy

### Framework

Node.js built-in `node:test` + `assert/strict` (matching the existing test suite), with `fast-check` for property-based tests (already in `devDependencies`).

### Test file

`server/test/listing.test.js`

### Setup pattern (each test)

```js
const db = getDb(':memory:');
seed(db);
// Optional: const holding = buyIntoInventory(db, 1, 'demo-user', 10);
```

### Unit tests (example-based)

| Test | What it verifies |
|---|---|
| Normal listing creation | Return shape, DB row content, `askingPriceCents = 1500` |
| Quantity decrements by 1 | Before/after query |
| Three sequential listings | Quantity goes 10→7, 3 rows in `listings` |
| Non-existent holdingId | `HoldingNotFoundError` with correct `name` |
| Wrong sellerUserId | `HoldingOwnershipError` with correct `name` |
| Exhausted holding (0 quantity) | `HoldingExhaustedError` with correct `name` |
| Atomicity via exhausted holding | Quantity stays 0, not -1 after failed call |

### Property-based tests (fast-check, 100+ runs each)

| Property | Generator strategy |
|---|---|
| **Property 1** — not-found guard | `fc.integer({ min: 10000, max: 999999 })` for holdingId |
| **Property 2** — ownership guard | `fc.string()` filtered to exclude `'seed-user-1'` |
| **Property 3** — exhausted holding atomicity | Fixed setup: buy qty=1, call once, then call again |
| **Property 4** — decrement by exactly 1 | `fc.integer({ min: 1, max: 50 })` for purchase quantity, then one `createListing` call |
| **Property 5** — row/return consistency | `fc.integer({ min: 1, max: 50 })` for purchase quantity, verify full field agreement |

Property tests use `fc.assert(..., { numRuns: 100 })`.

Each property test references its design property with a comment:
`// Feature: create-listing, Property N: <property title>`

### Dual testing rationale

Unit tests catch concrete bugs with clear failure messages. Property tests cover the full input space for the core invariants (guard conditions, decrement correctness, money integrity). Together they give comprehensive coverage without redundant duplication.
