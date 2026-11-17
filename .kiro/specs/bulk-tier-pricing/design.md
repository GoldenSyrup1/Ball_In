# Design Document

## Overview

This document describes the design for the bulk-tier pricing lookup module (`server/src/models/product.js`) in Ball-In. It is the second task in the MVP build sequence and depends entirely on the schema and seed data established in Task 1 (`db-schema-seed`).

The module exposes two pure-query functions:

- `getPoolQuantity(db, productId)` — sums all existing inventory holdings for a product to determine current pool depth.
- `getBulkUnitCostCents(db, productId, poolQtyAfter)` — applies the tier-selection rule to return the integer cent cost per unit for the given post-purchase pool quantity.

No data is written by either function. Both functions are deterministic given a fixed database state, which makes them ideal candidates for property-based testing.

---

## Architecture

The module sits in the domain model layer. It queries two tables (`inventory_holdings` and `bulk_tiers`) that were created and seeded in Task 1. No other modules are imported; the `db` connection is passed in by the caller, keeping the module stateless and easy to test with an in-memory database.

```
server/
├── src/
│   └── models/
│       └── product.js          ← getPoolQuantity, getBulkUnitCostCents
└── test/
    └── product.test.js         ← node:test unit tests + fast-check property tests
```

**Data flow:**

```
Caller (Task 3: buyIntoInventory)
  │
  ├── getPoolQuantity(db, productId)
  │       └── SELECT COALESCE(SUM(quantity), 0) FROM inventory_holdings WHERE product_id = ?
  │
  └── getBulkUnitCostCents(db, productId, poolQtyAfter)
          └── SELECT unit_cost_cents FROM bulk_tiers
              WHERE product_id = ? AND min_qty <= ?
              ORDER BY min_qty DESC LIMIT 1
```

**Module system:** CommonJS (`require` / `module.exports`), consistent with the rest of `server/src/`.

---

## Components and Interfaces

### `getPoolQuantity(db, productId)`

```
getPoolQuantity(db: Database, productId: number) → number
```

- Executes one `SELECT` with `COALESCE(SUM(quantity), 0) AS total`.
- `COALESCE` ensures the return value is `0` when no holdings exist — SQLite's `SUM` of an empty set returns `NULL`, which better-sqlite3 surfaces as `null` in JavaScript.
- Returns `row.total` directly. Because SQLite sums integers and the column has `INTEGER` affinity, `row.total` is always a JavaScript number satisfying `Number.isInteger`.
- Never throws under normal operation.

### `getBulkUnitCostCents(db, productId, poolQtyAfter)`

```
getBulkUnitCostCents(db: Database, productId: number, poolQtyAfter: number) → number
```

**Validation (before any DB query):**
- If `!Number.isInteger(poolQtyAfter) || poolQtyAfter < 1`, throw `Error(`Invalid poolQtyAfter: ${poolQtyAfter}`)`.

**Tier selection SQL:**
```sql
SELECT unit_cost_cents
FROM bulk_tiers
WHERE product_id = ? AND min_qty <= ?
ORDER BY min_qty DESC
LIMIT 1
```

The `ORDER BY min_qty DESC LIMIT 1` pattern selects the row with the highest `min_qty` that satisfies the predicate, which is exactly the business-rule definition of `applicable_tier = max(t for t in tiers if t.min_qty <= poolQtyAfter)`.

**Post-query guard:**
- If `tier` is `undefined` (no matching row), throw `Error(`No bulk tier found for product ${productId} at pool qty ${poolQtyAfter}`)`.
- With the Base_Tier at `min_qty = 1` always present, this guard fires only for a product id that has no tiers at all (defensive only).

Returns `tier.unit_cost_cents` as an integer.

---

## Data Models

No new tables are introduced. The functions read from two existing tables:

### `inventory_holdings` (read by `getPoolQuantity`)

| Column | Type | Relevant constraint |
|---|---|---|
| `product_id` | INTEGER | FK to `products.id` |
| `quantity` | INTEGER | `CHECK(quantity >= 1)` |

### `bulk_tiers` (read by `getBulkUnitCostCents`)

| Column | Type | Relevant constraint |
|---|---|---|
| `product_id` | INTEGER | FK to `products.id` |
| `min_qty` | INTEGER | `CHECK(min_qty >= 0)` |
| `unit_cost_cents` | INTEGER | `CHECK(unit_cost_cents >= 1)` |

### Seeded data for product id=1

| Tier | `min_qty` | `unit_cost_cents` |
|---|---|---|
| Base | 1 | 1500 |
| Bulk | 50 | 1000 |

Seeded pool quantity: 30 (three holdings of 10 units each).

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Tier Applicability

*For any* valid `poolQtyAfter` in [1, 10000], the `unit_cost_cents` returned by `getBulkUnitCostCents(db, productId, poolQtyAfter)` must equal the `unit_cost_cents` of a tier whose `min_qty` is ≤ `poolQtyAfter`, and no tier with a higher `min_qty` that is still ≤ `poolQtyAfter` may exist in the table. The return value must also satisfy `Number.isInteger`.

**Validates: Requirements 2.1, 2.5**

### Property 2: Monotone Cost

*For any* two values `a` and `b` where `1 ≤ a < b ≤ 10000`, `getBulkUnitCostCents(db, productId, a)` must return a value greater than or equal to `getBulkUnitCostCents(db, productId, b)`. Increasing the pool quantity never raises the unit cost.

**Validates: Requirements 2.6**

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| `poolQtyAfter < 1` or non-integer | Throw `Error('Invalid poolQtyAfter: <value>')` before any DB query. |
| No tier exists for `productId` with `min_qty <= poolQtyAfter` | Throw `Error('No bulk tier found for product <productId> at pool qty <poolQtyAfter>')`. |
| `productId` does not exist in `products` | `getBulkUnitCostCents` throws "no tier found"; `getPoolQuantity` returns `0` (the `SUM` of an empty set). |
| DB connection closed or corrupt | better-sqlite3 throws natively; propagate unchanged. |

---

## Testing Strategy

### Unit Tests (`server/test/product.test.js`, `node:test`)

Each test opens an in-memory DB via `getDb(':memory:')` and applies `seed(db)` once before assertions.

| Test | Assertion |
|---|---|
| `getPoolQuantity` — seeded pool | Returns `30` for product id=1 |
| `getPoolQuantity` — unknown product | Returns `0` for product id=9999 |
| Tier below 50 | `getBulkUnitCostCents(db, 1, 49)` returns `1500` |
| Tier at exactly 50 (inclusive) | `getBulkUnitCostCents(db, 1, 50)` returns `1000` |
| Tier above 50 | `getBulkUnitCostCents(db, 1, 100)` returns `1000` |
| Pool of 1 uses base tier | `getBulkUnitCostCents(db, 1, 1)` returns `1500` |
| Invalid input throws | `getBulkUnitCostCents(db, 1, 0)` throws matching `/invalid/i` or `/poolQty/i` |

### Property-Based Tests (`fast-check`, `{ numRuns: 200 }`)

**Property Test 1 — Tier Applicability** (`P1`)

Generate `poolQtyAfter` from `fc.integer({ min: 1, max: 10000 })`. Call `getBulkUnitCostCents(db, 1, poolQtyAfter)`. Query the DB directly for `SELECT MAX(min_qty) FROM bulk_tiers WHERE product_id = 1 AND min_qty <= poolQtyAfter` and fetch the `unit_cost_cents` for that tier. Assert the two cost values are equal and `Number.isInteger(cost)` holds.

```
// Feature: bulk-tier-pricing, Property 1: selected tier's min_qty is always <= poolQtyAfter
```

**Property Test 2 — Monotone Cost** (`P2`)

Generate a tuple `[a, b]` using `fc.integer({ min: 1, max: 9999 }).chain(a => fc.integer({ min: a + 1, max: 10000 }).map(b => [a, b]))`. Assert `getBulkUnitCostCents(db, 1, a) >= getBulkUnitCostCents(db, 1, b)`.

```
// Feature: bulk-tier-pricing, Property 2: increasing poolQtyAfter never increases unit cost
```

### Running Tests

From the `server/` directory:

```
node --test server/test/product.test.js
```

Or via `package.json`:

```
npm test
```

Expected: all tests print `✓`, exit code 0.

### TDD Sequence

1. Write `server/test/product.test.js` importing from the not-yet-existing `../src/models/product.js`.
2. Run tests — confirm `MODULE_NOT_FOUND` failures.
3. Implement `server/src/models/product.js`.
4. Run tests — confirm all pass, exit 0.
5. Commit: `git commit -m "feat: bulk-tier pricing lookup"`.
