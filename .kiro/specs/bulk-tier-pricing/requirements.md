# Requirements Document

## Introduction

This document covers the bulk-tier pricing lookup for Ball-In (Task 2 of the MVP). Two functions are exported from `server/src/models/product.js`:

- `getPoolQuantity(db, productId)` — returns the current sum of all `inventory_holdings.quantity` rows for a given product, used to determine how deep the buying pool is before a new purchase.
- `getBulkUnitCostCents(db, productId, poolQtyAfter)` — selects the applicable bulk-price tier given the pool quantity *after* the pending purchase is added, enforcing the business rule that the boundary is inclusive and that a larger pool quantity never results in a higher unit cost.

These functions are consumed by the inventory pre-buy module (Task 3) and are the authoritative implementation of the tier-selection rule defined in the Ball-In business rules.

## Glossary

- **Product_Model**: The module exported from `server/src/models/product.js` containing `getPoolQuantity` and `getBulkUnitCostCents`.
- **DB**: A better-sqlite3 database connection initialised via `getDb` (Task 1), with the schema applied and `PRAGMA foreign_keys = ON` set.
- **Pool_Quantity**: The sum of `inventory_holdings.quantity` for all rows matching a given `product_id`. When a buyer purchases units, the pool quantity *after* that purchase is `Pool_Quantity + purchase_qty`.
- **Bulk_Tier**: A row in the `bulk_tiers` table with two domain-relevant fields: `min_qty` (integer ≥ 0) and `unit_cost_cents` (integer ≥ 1).
- **Base_Tier**: The Bulk_Tier for a product with the lowest `min_qty` (equal to 1 in the seeded data), guaranteeing a tier is always found for any pool quantity ≥ 1.
- **Applicable_Tier**: The Bulk_Tier selected by the rule `max(t for t in tiers if t.min_qty <= poolQtyAfter)` — the tier with the highest `min_qty` that does not exceed `poolQtyAfter`.
- **poolQtyAfter**: The pool quantity after the current purchase is counted — the input to `getBulkUnitCostCents`. Must be an integer ≥ 1.
- **Seeded_Tiers**: The two bulk tiers inserted by `seed(db)` for product id=1: Base_Tier at `min_qty=1, unit_cost_cents=1500` and a bulk tier at `min_qty=50, unit_cost_cents=1000`.
- **Seeded_Pool**: The pool quantity present after `seed(db)` runs — exactly 30 units (three holdings of 10 units each from `seed-user-1`, `seed-user-2`, and `seed-user-3`).

---

## Requirements

### Requirement 1: Pool Quantity Lookup

**User Story:** As a developer, I want a function that returns the current pool quantity for a product, so that the pre-buy module can compute the post-purchase pool depth before looking up the applicable tier.

#### Acceptance Criteria

1. WHEN `getPoolQuantity(db, productId)` is called and one or more `inventory_holdings` rows exist for `productId`, THE Product_Model SHALL return the integer sum of all matching `quantity` values.
2. WHEN `getPoolQuantity(db, productId)` is called and no `inventory_holdings` rows exist for `productId`, THE Product_Model SHALL return exactly `0`.
3. THE Product_Model SHALL compute the pool quantity using a single SQL query with `COALESCE(SUM(quantity), 0)` so that the return value is always a number, never `null` or `undefined`.
4. THE Product_Model SHALL return the pool quantity as a JavaScript integer value satisfying `Number.isInteger(result)`.

---

### Requirement 2: Bulk-Tier Selection

**User Story:** As a developer, I want a function that returns the unit cost in integer cents for a given post-purchase pool quantity, so that every buyer in the pool pays the correct bulk-tier price at the moment of their purchase.

#### Acceptance Criteria

1. WHEN `getBulkUnitCostCents(db, productId, poolQtyAfter)` is called with a `poolQtyAfter` that is an integer ≥ 1, THE Product_Model SHALL return the `unit_cost_cents` of the Applicable_Tier — the tier with the highest `min_qty` whose `min_qty` is ≤ `poolQtyAfter`.
2. WHEN `poolQtyAfter` equals exactly a tier's `min_qty`, THE Product_Model SHALL qualify that tier as the Applicable_Tier (the boundary is inclusive).
3. WHEN `poolQtyAfter` is less than 1 or is not an integer, THE Product_Model SHALL throw an `Error` with a message matching `/invalid/i` or `/poolQty/i` before querying the database.
4. WHEN no Bulk_Tier row exists for `productId` with `min_qty <= poolQtyAfter`, THE Product_Model SHALL throw an `Error` indicating that no tier was found for the given product and pool quantity.
5. THE Product_Model SHALL return `unit_cost_cents` as a JavaScript integer value satisfying `Number.isInteger(result)`.
6. WHEN `poolQtyAfter` increases from a value below a tier boundary to a value at or above that boundary, THE Product_Model SHALL return a `unit_cost_cents` value less than or equal to the value returned for the lower `poolQtyAfter`, never a higher value.

---

### Requirement 3: Tier Structural Invariants

**User Story:** As a developer, I want the tier-lookup function to rely on the structural guarantees established by the seed data, so that the function never fails in normal operation and I can reason about its behaviour.

#### Acceptance Criteria

1. THE Product_Model SHALL implement tier selection using an `ORDER BY min_qty DESC LIMIT 1` SQL query that naturally returns the Applicable_Tier without requiring application-level sorting.
2. WHEN the database contains the Base_Tier at `min_qty = 1`, THE Product_Model SHALL always find an Applicable_Tier for any `poolQtyAfter ≥ 1`, because `1 ≤ poolQtyAfter` is always true.
3. THE Product_Model SHALL NOT perform any floating-point arithmetic; all returned values SHALL be integer cents.

---

### Requirement 4: Module Interface

**User Story:** As a developer, I want `product.js` to export both functions as a CommonJS module, so that any other module in the server can require them without a build step.

#### Acceptance Criteria

1. THE Product_Model SHALL export `getPoolQuantity` and `getBulkUnitCostCents` via `module.exports` using CommonJS syntax.
2. THE Product_Model SHALL use `'use strict'` at the top of the file.
3. THE Product_Model SHALL NOT import or require any module other than the `db` parameter it receives, keeping it free of side-effects at load time.

---

### Requirement 5: Test Coverage

**User Story:** As a developer, I want an automated test suite for `getPoolQuantity` and `getBulkUnitCostCents`, so that regressions in the tier-selection logic are caught immediately.

#### Acceptance Criteria

1. THE `server/test/product.test.js` file SHALL use the `node:test` built-in runner and `node:assert/strict` for all assertions; no third-party test framework SHALL be used for unit tests.
2. WHEN the test suite runs, THE `product.test.js` SHALL call `getDb(':memory:')` and `seed(db)` before any assertion so that the Seeded_Tiers and Seeded_Pool are present.
3. WHEN the test suite runs, THE `product.test.js` SHALL assert that `getPoolQuantity(db, 1)` returns `30` (the Seeded_Pool total).
4. WHEN the test suite runs, THE `product.test.js` SHALL assert that `getPoolQuantity(db, 9999)` returns `0` for an unknown product.
5. WHEN the test suite runs, THE `product.test.js` SHALL assert that `getBulkUnitCostCents(db, 1, 49)` returns `1500` (base tier applies below the bulk boundary).
6. WHEN the test suite runs, THE `product.test.js` SHALL assert that `getBulkUnitCostCents(db, 1, 50)` returns `1000` (bulk tier applies at the boundary, inclusive).
7. WHEN the test suite runs, THE `product.test.js` SHALL assert that `getBulkUnitCostCents(db, 1, 100)` returns `1000` (bulk tier applies above the boundary).
8. WHEN the test suite runs, THE `product.test.js` SHALL assert that `getBulkUnitCostCents(db, 1, 1)` returns `1500` (base tier applies at pool quantity 1).
9. WHEN the test suite runs, THE `product.test.js` SHALL assert that `getBulkUnitCostCents(db, 1, 0)` throws an error with a message matching `/invalid/i` or `/poolQty/i`.
10. THE `product.test.js` SHALL include property-based tests using `fast-check` with `{ numRuns: 200 }` for the two correctness properties defined in the design document.
11. WHEN all assertions pass, THE `product.test.js` SHALL exit with code 0 when invoked as `node --test server/test/product.test.js` from the `server/` directory without any build step.
