# Implementation Plan: create-listing

## Overview

Implement `server/src/models/listing.js` with the three named error classes and `createListing` function, then write `server/test/listing.test.js` covering seven example-based tests and five property-based tests. Follow TDD order: write the test file first (it will fail with `MODULE_NOT_FOUND`), then implement the module, then confirm all tests pass.

## Tasks

- [x] 1. Write the failing test file
  - [x] 1.1 Create `server/test/listing.test.js` with all 7 unit tests and 5 property tests
    - Import `createListing` and the three error classes from `../src/models/listing.js` (does not exist yet — imports will fail with MODULE_NOT_FOUND until Task 2)
    - Import `getDb` from `../src/db/index.js`, `seed` from `../src/db/seed.js`, and `buyIntoInventory` from `../src/models/inventory.js`
    - Import `fc` from `fast-check`
    - **Unit Test 1:** call `createListing(db, holdingId, 'demo-user')`, assert return shape (`holdingId`, `status='open'`, `askingPriceCents=1500`, valid `id`, valid `createdAt`), and query the `listings` table to confirm the row exists with matching values
    - **Unit Test 2:** query holding quantity before (expect 10), call `createListing`, query after (expect 9)
    - **Unit Test 3:** call `createListing` 3 times, assert quantity went 10→7 and 3 rows exist in `listings`
    - **Unit Test 4:** call `createListing(db, 99999, 'demo-user')`, assert throws with `err.name === 'HoldingNotFoundError'`
    - **Unit Test 5:** call `createListing(db, 1, 'wrong-user')` on seed holding id=1 (owned by `'seed-user-1'`), assert throws with `err.name === 'HoldingOwnershipError'`
    - **Unit Test 6:** buy qty=1 holding, call `createListing` once (quantity→0), call again, assert second call throws with `err.name === 'HoldingExhaustedError'`
    - **Unit Test 7 (atomicity):** call `createListing` on the exhausted holding from Test 6, catch the error, query quantity — assert it is 0, not -1
    - Add `// Feature: create-listing, Property N: <title>` comment above each property test
    - **Property Test 1 (Property 1):** `fc.integer({ min: 10000, max: 999999 })` for holdingId, assert `HoldingNotFoundError` always thrown, `numRuns: 100`
    - **Property Test 2 (Property 2):** `fc.string()` filtered to exclude `'seed-user-1'`, call `createListing(db, 1, wrongUser)`, assert `HoldingOwnershipError`, `numRuns: 100`
    - **Property Test 3 (Property 3):** buy qty=1, call once to exhaust, call again, assert `HoldingExhaustedError` and quantity stays 0, `numRuns: 100` (re-seeds DB each run)
    - **Property Test 4 (Property 4):** `fc.integer({ min: 1, max: 50 })` for purchase qty, buy that qty, record quantity, call `createListing` once, assert quantity decreased by exactly 1, `numRuns: 100`
    - **Property Test 5 (Property 5):** `fc.integer({ min: 1, max: 50 })` for purchase qty, call `createListing`, verify return object fields match the DB row (`id`, `holdingId`, `askingPriceCents = unit_cost_cents` as integer, `status = 'open'`, `createdAt`), `numRuns: 100`
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 3.1, 3.2, 4.1, 4.2, 5.1, 5.2, 6.1, 6.2, 7.1, 7.2, 7.3_

- [x] 2. Checkpoint — confirm tests fail with MODULE_NOT_FOUND
  - Run `node --test test/listing.test.js` from `server/` directory; expect failure because `src/models/listing.js` does not exist yet
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Implement `server/src/models/listing.js`
  - [x] 3.1 Define and export the three named error classes
    - `HoldingNotFoundError`, `HoldingOwnershipError`, `HoldingExhaustedError` — each extends `Error`, sets `this.name` to the class name in the constructor
    - _Requirements: 1.2, 2.2, 3.2_

  - [x] 3.2 Implement `createListing(db, holdingId, sellerUserId)` inside `db.transaction(...)`
    - Fetch the `inventory_holdings` row: `db.prepare('SELECT * FROM inventory_holdings WHERE id = ?').get(holdingId)`
    - If no row → throw `HoldingNotFoundError`
    - If `holding.user_id !== sellerUserId` → throw `HoldingOwnershipError`
    - If `holding.quantity < 1` → throw `HoldingExhaustedError`
    - Decrement: `db.prepare('UPDATE inventory_holdings SET quantity = quantity - 1 WHERE id = ?').run(holdingId)`
    - Insert: `db.prepare('INSERT INTO listings (holding_id, asking_price_cents, status, created_at) VALUES (?, ?, \'open\', ?)').run(holdingId, holding.unit_cost_cents, createdAt)`
    - Return `{ id: result.lastInsertRowid, holdingId, askingPriceCents: holding.unit_cost_cents, status: 'open', createdAt }`
    - Wrap the entire body in `return db.transaction(() => { ... })()`
    - Use `'use strict';` at the top of the file
    - Export via `module.exports = { createListing, HoldingNotFoundError, HoldingOwnershipError, HoldingExhaustedError }`
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 5.2, 6.1, 6.2, 7.1, 7.2, 7.3_

  - [ ]* 3.3 Write property test for Property 1 — not-found guard
    - **Property 1: Not-found guard fires for any non-existent holdingId**
    - **Validates: Requirements 1.1**

  - [ ]* 3.4 Write property test for Property 2 — ownership guard
    - **Property 2: Ownership guard fires for any mismatched sellerUserId**
    - **Validates: Requirements 2.1**

  - [ ]* 3.5 Write property test for Property 3 — exhausted holding atomicity
    - **Property 3: Exhausted holding throws and leaves quantity unchanged**
    - **Validates: Requirements 3.1, 7.3**

  - [ ]* 3.6 Write property test for Property 4 — decrement by exactly 1
    - **Property 4: Successful call decrements quantity by exactly 1**
    - **Validates: Requirements 4.1, 4.2**

  - [ ]* 3.7 Write property test for Property 5 — row/return consistency
    - **Property 5: Inserted row content and return value are consistent**
    - **Validates: Requirements 5.1, 5.2, 6.1, 6.2**

- [x] 4. Checkpoint — run full test suite
  - Run `node --test test/**/*.test.js` from `server/` directory
  - All four test files (`db.test.js`, `inventory.test.js`, `product.test.js`, `listing.test.js`) must pass with exit code 0
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Commit
  - [x] 5.1 Stage and commit the two new files
    - `git add server/src/models/listing.js server/test/listing.test.js`
    - `git commit -m "feat: list one unit from a held product"`
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 3.1, 3.2, 4.1, 4.2, 5.1, 5.2, 6.1, 6.2, 7.1, 7.2, 7.3_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP (the property tests are already written in Task 1.1; these sub-tasks exist as named checkpoints for individual properties)
- Each task references specific requirements for traceability
- Use CommonJS (`require`/`module.exports`) throughout — no ESM
- `better-sqlite3` transactions roll back automatically on any thrown exception; no manual `ROLLBACK` needed
- `asking_price_cents` requires no arithmetic — it is copied directly from `holding.unit_cost_cents` (already an integer), satisfying the integer-cents business rule

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["3.1", "3.2"] },
    { "id": 2, "tasks": ["3.3", "3.4", "3.5", "3.6", "3.7"] },
    { "id": 3, "tasks": ["5.1"] }
  ]
}
```
