# Implementation Plan: buy-into-inventory

## Overview

Implement `buyIntoInventory` and `InvalidQuantityError` in `server/src/models/inventory.js` using a TDD workflow: write the test file first (it will fail with MODULE_NOT_FOUND), then implement the module, then confirm all tests pass. The existing `getPoolQuantity` and `getBulkUnitCostCents` functions in `server/src/models/product.js` and the DB schema in `server/src/db/schema.sql` are already in place and require no changes.

## Tasks

- [x] 1. Write the test file `server/test/inventory.test.js`
  - Create `server/test/inventory.test.js` with all unit tests and property-based tests described below. The file imports from `../src/models/inventory.js`, which does not exist yet, so running the tests at this stage must fail with `MODULE_NOT_FOUND`.
  - Import `{ test }` from `node:test`, `assert` from `node:assert/strict`, `fc` from `fast-check`, `{ getDb }` from `../src/db/index.js`, `{ seed }` from `../src/db/seed.js`, `{ getPoolQuantity, getBulkUnitCostCents }` from `../src/models/product.js`, and `{ buyIntoInventory, InvalidQuantityError }` from `../src/models/inventory.js`.
  - Each test creates its own `getDb(':memory:')` + `seed(db)` for isolation (pool starts at 30, tiers: 1500¢ below 50, 1000¢ at 50+).

  - [x] 1.1 Write unit tests (Tests 1–8)
    - **Test 1 — normal buy-in at base tier:** call `buyIntoInventory(db, 1, 'demo-user', 5)`; assert `quantity=5`, `unitCostCents=1500`, `totalCostCents=7500`; query DB by returned `id` and assert row exists with matching fields.
    - **Test 2 — exact tier boundary:** call `buyIntoInventory(db, 1, 'demo-user', 20)` (pool 30+20=50, inclusive boundary); assert `unitCostCents=1000`, `totalCostCents=20000`.
    - **Test 3 — sequential buys crossing boundary:** call with quantity=1 (pool→31, still base tier), then quantity=20 (pool→51, bulk tier); assert second call returns `unitCostCents=1000`.
    - **Test 4 — throw on quantity=0:** assert throws `InvalidQuantityError`.
    - **Test 5 — throw on quantity=-1:** assert throws `InvalidQuantityError`.
    - **Test 6 — throw on quantity=1.5 (float):** assert throws `InvalidQuantityError`.
    - **Test 7 — throw on quantity='5' (string):** assert throws `InvalidQuantityError`.
    - **Test 8 — pool growth:** call with quantity=10; assert `getPoolQuantity(db, 1)` returns 40.
    - _Requirements: 1.1, 1.4, 1.5, 1.6, 1.7, 2.1, 2.3, 3.1, 4.1, 5.1, 6.1_

  - [ ]* 1.2 Write property-based tests (Properties 1–5)
    - Use `fast-check` with `{ numRuns: 200 }` on each `fc.assert` call. Each property test creates its own fresh in-memory DB + seed so pool accumulation between runs does not occur.
    - **Property 1 — invalid quantity always throws:**
      `// Feature: buy-into-inventory, Property 1: invalid quantity always throws InvalidQuantityError`
      Generator: `fc.oneof(fc.constant(0), fc.integer({ max: -1 }), fc.double({ noNaN: true }).filter(x => !Number.isInteger(x) && isFinite(x)), fc.string())`.
      Assert: `buyIntoInventory` throws and caught error `.name === 'InvalidQuantityError'`.
      **Property 1: Invalid quantity always throws**
      **Validates: Requirements 1.1, 1.2, 1.4, 1.5, 1.6, 1.7**
    - **Property 2 — unitCostCents matches tier at poolBefore+quantity:**
      `// Feature: buy-into-inventory, Property 2: unitCostCents always equals the tier resolved at poolBefore + quantity`
      Generator: `fc.integer({ min: 1, max: 100 })`. Capture `poolBefore = getPoolQuantity(db, 1)` before each call. Assert `result.unitCostCents === getBulkUnitCostCents(db, 1, poolBefore + quantity)` and `Number.isInteger(result.unitCostCents)`.
      **Property 2: unitCostCents matches tier at poolBefore+quantity**
      **Validates: Requirements 2.1, 2.2, 3.1, 3.2**
    - **Property 3 — DB row matches returned holding:**
      `// Feature: buy-into-inventory, Property 3: inserted DB row matches all fields of the returned object`
      Generator: `fc.integer({ min: 1, max: 100 })`. After call, query `inventory_holdings` by `result.id`; assert `row.user_id === result.userId`, `row.product_id === result.productId`, `row.quantity === result.quantity`, `row.unit_cost_cents === result.unitCostCents`, `row.created_at === result.createdAt`.
      **Property 3: DB row matches returned holding**
      **Validates: Requirements 4.1, 4.2, 5.2, 5.3, 5.4, 5.5, 5.6**
    - **Property 4 — totalCostCents is unitCostCents × quantity, integer:**
      `// Feature: buy-into-inventory, Property 4: totalCostCents === unitCostCents * quantity, always an integer`
      Generator: `fc.integer({ min: 1, max: 100 })`. Assert `result.totalCostCents === result.unitCostCents * result.quantity` and `Number.isInteger(result.totalCostCents)`.
      **Property 4: totalCostCents is unitCostCents × quantity**
      **Validates: Requirements 5.1**
    - **Property 5 — pool grows by exactly quantity:**
      `// Feature: buy-into-inventory, Property 5: pool grows by exactly quantity after each successful call`
      Generator: `fc.integer({ min: 1, max: 100 })`. Capture `poolBefore` before call. After call, assert `getPoolQuantity(db, 1) === poolBefore + quantity`.
      **Property 5: Pool grows by exactly quantity**
      **Validates: Requirements 6.1**
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 3.1, 3.2, 4.1, 4.2, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1_

- [x] 2. Confirm tests fail before implementation
  - Run `node --test server/test/inventory.test.js` and verify the output shows `MODULE_NOT_FOUND` or equivalent import failure. This confirms the test file is wired correctly and gates the implementation step.
  - _Requirements: (all — this is the TDD gate)_

- [x] 3. Implement `server/src/models/inventory.js`
  - [x] 3.1 Implement `InvalidQuantityError` class
    - Define `class InvalidQuantityError extends Error` with `this.name = 'InvalidQuantityError'` set in the constructor after `super(message)`. Export it.
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 3.2 Implement `buyIntoInventory` function
    - Add `'use strict';` at top. Import `{ getPoolQuantity, getBulkUnitCostCents }` from `'./product.js'`.
    - **Guard:** `if (!Number.isInteger(quantity) || quantity < 1)` throw `new InvalidQuantityError(...)` with message including `JSON.stringify(quantity)`. This guard runs before any DB call.
    - **Pool computation:** `const poolBefore = getPoolQuantity(db, productId)` then `const poolQtyAfter = poolBefore + quantity`.
    - **Tier lookup:** `const unitCostCents = getBulkUnitCostCents(db, productId, poolQtyAfter)`.
    - **Insert:** `db.prepare('INSERT INTO inventory_holdings (user_id, product_id, quantity, unit_cost_cents, created_at) VALUES (?, ?, ?, ?, ?)').run(buyerUserId, productId, quantity, unitCostCents, createdAt)`.
    - **Return:** `{ id: result.lastInsertRowid, userId: buyerUserId, productId, quantity, unitCostCents, totalCostCents: unitCostCents * quantity, createdAt }`.
    - Export `{ buyIntoInventory, InvalidQuantityError }`.
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.1, 3.2, 4.1, 4.2, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1_

- [x] 4. Checkpoint — Ensure all tests pass
  - Run `node --test server/test/inventory.test.js` and confirm all tests pass with exit code 0. Also run `node --test server/test/product.test.js` and `node --test server/test/db.test.js` to confirm no regressions. Ask the user if any test is failing or the behaviour looks unexpected.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP, but property tests are strongly recommended given the integer-math and tier-boundary correctness requirements.
- Each test block uses its own in-memory DB for isolation; there is no shared state between tests.
- `fast-check` is already installed in `server/devDependencies`; no additional install is needed.
- The `better-sqlite3` `.run()` return value's `lastInsertRowid` is a BigInt on some platforms for large row IDs; for this demo scale (small seed data) it will be a regular number, but `Number(result.lastInsertRowid)` can be used defensively.
- Do not modify `server/src/models/product.js`, `server/src/db/schema.sql`, or `server/src/db/seed.js` — they are correct and stable.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["3.1"] },
    { "id": 3, "tasks": ["3.2"] }
  ]
}
```
