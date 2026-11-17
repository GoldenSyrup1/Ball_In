# Implementation Plan: Bulk-Tier Pricing Lookup

## Overview

Implement `server/src/models/product.js` with `getPoolQuantity` and `getBulkUnitCostCents`, following a TDD sequence: write the test file first, confirm it fails, implement the module, confirm all tests pass, then commit.

## Tasks

- [x] 1. Write the test file (failing state)
  - [x] 1.1 Create `server/test/product.test.js` with all unit tests
    - Import `getDb` from `../src/db/index.js` and `seed` from `../src/db/seed.js`
    - Import `getPoolQuantity` and `getBulkUnitCostCents` from `../src/models/product.js` (does not exist yet — this causes the initial MODULE_NOT_FOUND failure)
    - Add `node:test` and `node:assert/strict` unit tests for all 7 cases: seeded pool total (30), unknown product (0), poolQtyAfter=49 → 1500, poolQtyAfter=50 → 1000, poolQtyAfter=100 → 1000, poolQtyAfter=1 → 1500, poolQtyAfter=0 throws matching `/invalid/i` or `/poolQty/i`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9_

  - [ ]* 1.2 Add `fast-check` property-based tests to `server/test/product.test.js`
    - Require `fast-check` at the top of the test file
    - **Property 1: Tier Applicability** — `fc.integer({ min: 1, max: 10000 })`, query DB directly for expected tier cost, assert equality and `Number.isInteger`; `{ numRuns: 200 }`
    - `// Feature: bulk-tier-pricing, Property 1: selected tier's min_qty is always <= poolQtyAfter`
    - **Property 2: Monotone Cost** — generate `(a, b)` where `a < b`, assert `cost(a) >= cost(b)`; `{ numRuns: 200 }`
    - `// Feature: bulk-tier-pricing, Property 2: increasing poolQtyAfter never increases unit cost`
    - _Requirements: 5.10_

- [x] 2. Implement `server/src/models/product.js`
  - [x] 2.1 Create `server/src/models/product.js` with `getPoolQuantity`
    - Add `'use strict'` at the top
    - Implement `getPoolQuantity(db, productId)` using `SELECT COALESCE(SUM(quantity), 0) AS total FROM inventory_holdings WHERE product_id = ?`
    - Return `row.total` directly (always an integer due to SQLite INTEGER affinity and COALESCE)
    - Export via `module.exports` at the end of the file
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 4.1, 4.2, 4.3_

  - [x] 2.2 Add `getBulkUnitCostCents` to `server/src/models/product.js`
    - Validate input: `if (!Number.isInteger(poolQtyAfter) || poolQtyAfter < 1) throw new Error('Invalid poolQtyAfter: ' + poolQtyAfter)`
    - Execute `SELECT unit_cost_cents FROM bulk_tiers WHERE product_id = ? AND min_qty <= ? ORDER BY min_qty DESC LIMIT 1`
    - If the query returns no row, throw `Error('No bulk tier found for product ' + productId + ' at pool qty ' + poolQtyAfter)`
    - Return `tier.unit_cost_cents`
    - Add `getBulkUnitCostCents` to `module.exports`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3_

- [x] 3. Checkpoint — run tests and confirm all pass
  - Run `node --test server/test/product.test.js` from the `server/` directory
  - Ensure all unit tests and property tests print `✓`, exit code 0
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Commit
  - [x] 4.1 Stage and commit the new files
    - Run `git add server/src/models/product.js server/test/product.test.js`
    - Run `git commit -m "feat: bulk-tier pricing lookup"`
    - _Requirements: 5.11_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP (the unit tests in 1.1 provide coverage of the core boundary cases)
- Task 1.1 must be written before 2.1/2.2 — the TDD sequence requires the test to fail first
- `fast-check` is already listed as a dependency in `server/package.json` from Task 1; no additional install step is needed
- Both functions read only; no transactions, no writes, no side-effects

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["2.2"] },
    { "id": 3, "tasks": ["4.1"] }
  ]
}
```
