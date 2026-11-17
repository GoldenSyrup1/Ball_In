# Implementation Plan: db-schema-seed

## Overview

Implement the database foundation for Ball-In: a `schema.sql` DDL file, a `getDb(path)` connection helper, a `seed(db)` function, and a test suite covering three unit tests and five property-based tests. The workflow follows TDD — the test file is written first, run to confirm failure, then the production code is added until all tests pass. All code is CommonJS (`require`/`module.exports`) throughout.

## Tasks

- [x] 1. Create `server/package.json`
  - Declare `better-sqlite3` under `"dependencies"`.
  - Declare `fast-check` under `"devDependencies"`.
  - Add a `"test"` script: `node --test test/**/*.test.js`.
  - Omit `"type"` (or set to `"commonjs"`) so the entire `server/` tree uses CommonJS.
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 2. Write failing tests in `server/test/db.test.js`
  - [x] 2.1 Write the three unit tests (schema + seed)
    - **Test 1 — Schema:** Call `getDb(':memory:')`, query `sqlite_master`, assert all 7 table names are present (`suppliers`, `products`, `bulk_tiers`, `inventory_holdings`, `listings`, `offers`, `sales`).
    - **Test 2 — Seed:** Call `seed(db)`, assert `products` count = 1, assert `bulk_tiers` count ≥ 2 for the seeded product's id.
    - **Test 3 — Idempotency:** Call `seed(db)` a second time, assert `products` count is still 1 and `bulk_tiers` count is unchanged.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ]* 2.2 Write Property Test 1 — Base Tier Coverage
    - **Property 1: for any product, a tier with min_qty <= 1 exists**
    - Use `fast-check` to generate additional tier inserts with varying `min_qty` values ≥ 2 for the seeded product, then assert at least one tier has `min_qty <= 1` after each scenario.
    - Tag: `// Feature: db-schema-seed, Property 1: for any product, a tier with min_qty <= 1 exists`
    - Run with `{ numRuns: 100 }`.
    - **Validates: Requirements 3.3, 4.1**

  - [ ]* 2.3 Write Property Test 2 — Monotone Pricing
    - **Property 2: for any two tiers of same product, higher min_qty => lower or equal cost**
    - After seeding, retrieve all tiers. Use `fast-check` to generate shuffled orderings of the tier array. For every pair `(t1, t2)` where `t1.min_qty < t2.min_qty`, assert `t1.unit_cost_cents >= t2.unit_cost_cents`.
    - Tag: `// Feature: db-schema-seed, Property 2: for any two tiers of same product, higher min_qty => lower or equal cost`
    - Run with `{ numRuns: 100 }`.
    - **Validates: Requirements 3.4, 4.5**

  - [ ]* 2.4 Write Property Test 3 — Integer Money Invariant
    - **Property 3: every unit_cost_cents value is a JavaScript safe integer**
    - Use `fast-check` to vary the number of times `seed` is called (1 to 5). After each call count on a fresh in-memory DB, assert `Number.isInteger(row.unit_cost_cents)` for every row in `bulk_tiers` and `inventory_holdings`.
    - Tag: `// Feature: db-schema-seed, Property 3: every unit_cost_cents value is a JavaScript safe integer`
    - Run with `{ numRuns: 100 }`.
    - **Validates: Requirements 1.9, 3.8, 4.2**

  - [ ]* 2.5 Write Property Test 4 — Distinct Tier Boundaries
    - **Property 4: no two tiers for the same product share min_qty**
    - After seeding, collect all `min_qty` values for each product into an array. Assert the array length equals `new Set(values).size` (no duplicates).
    - Tag: `// Feature: db-schema-seed, Property 4: no two tiers for the same product share min_qty`
    - Run with `{ numRuns: 100 }`.
    - **Validates: Requirements 4.4**

  - [ ]* 2.6 Write Property Test 5 — Seed Idempotency
    - **Property 5: seed(db) called N times produces the same row counts as called once**
    - Use `fast-check` to generate an integer N in [1, 10]. On a fresh in-memory DB, call `seed(db)` N times. Assert `products` count = 1, `suppliers` count = 2, `bulk_tiers` count = 2, `inventory_holdings` count = 3.
    - Tag: `// Feature: db-schema-seed, Property 5: seed(db) called N times produces the same row counts as called once`
    - Run with `{ numRuns: 100 }`.
    - **Validates: Requirements 3.6**

- [x] 3. Run tests to confirm they fail
  - From `server/`: run `node --test test/db.test.js`.
  - Expected: all tests FAIL with "Cannot find module" or similar (production files don't exist yet).
  - _Requirements: 5.5_

- [x] 4. Implement `server/src/db/schema.sql`
  - [x] 4.1 Write the 7 `CREATE TABLE IF NOT EXISTS` statements in dependency order
    - Order: `suppliers` → `products` → `bulk_tiers` → `inventory_holdings` → `listings` → `offers` → `sales`.
    - `suppliers(id INTEGER PK, name TEXT NOT NULL)`
    - `products(id INTEGER PK, name TEXT NOT NULL, category TEXT NOT NULL)`
    - `bulk_tiers(id INTEGER PK, product_id INTEGER REFERENCES products, supplier_id INTEGER REFERENCES suppliers, min_qty INTEGER NOT NULL CHECK(min_qty >= 0), unit_cost_cents INTEGER NOT NULL CHECK(unit_cost_cents >= 1))`
    - `inventory_holdings(id INTEGER PK, user_id TEXT NOT NULL, product_id INTEGER REFERENCES products, quantity INTEGER NOT NULL CHECK(quantity >= 1), unit_cost_cents INTEGER NOT NULL CHECK(unit_cost_cents >= 1), created_at TEXT NOT NULL)`
    - `listings(id INTEGER PK, holding_id INTEGER REFERENCES inventory_holdings, asking_price_cents INTEGER NOT NULL CHECK(asking_price_cents >= 1), status TEXT NOT NULL CHECK(status IN ('open','sold','cancelled')), created_at TEXT NOT NULL)`
    - `offers(id INTEGER PK, listing_id INTEGER REFERENCES listings, buyer_id TEXT NOT NULL, offer_price_cents INTEGER NOT NULL CHECK(offer_price_cents >= 1), status TEXT NOT NULL CHECK(status IN ('pending','accepted','declined')), created_at TEXT NOT NULL)`
    - `sales(id INTEGER PK, offer_id INTEGER REFERENCES offers, sale_price_cents INTEGER NOT NULL CHECK(sale_price_cents >= 1), unit_cost_cents INTEGER NOT NULL CHECK(unit_cost_cents >= 1), profit_cents INTEGER NOT NULL, fee_cents INTEGER NOT NULL CHECK(fee_cents >= 0), net_to_seller_cents INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('fulfilled')), created_at TEXT NOT NULL)`
    - No REAL, FLOAT, or DOUBLE affinity on any column.
    - `profit_cents` has no lower-bound CHECK (losses are valid domain events).
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10_

- [x] 5. Implement `server/src/db/index.js`
  - [x] 5.1 Write `getDb(dbPath)` using CommonJS exports
    - Throw `Error('dbPath is required')` immediately if `dbPath` is falsy.
    - Open: `new Database(dbPath)` from `better-sqlite3`.
    - Pragma: `db.pragma('foreign_keys = ON')`.
    - Read schema: `fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')`.
    - Apply DDL: `db.exec(schemaSql)`.
    - Return `db`.
    - Export via `module.exports = { getDb }`.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [x] 6. Implement `server/src/db/seed.js`
  - [x] 6.1 Write `seed(db)` using CommonJS exports and INSERT OR IGNORE
    - Assert each monetary literal with `assert(Number.isInteger(value))` before any INSERT.
    - Insert in dependency order: `suppliers` → `products` → `bulk_tiers` → `inventory_holdings`.
    - Suppliers: `{id:1, name:'BulkCo Electronics'}`, `{id:2, name:'MegaSource Ltd'}` via `INSERT OR IGNORE`.
    - Product: `{id:1, name:'USB-C Hub 7-Port', category:'Electronics'}` via `INSERT OR IGNORE`.
    - Tiers: `{id:1, product_id:1, supplier_id:1, min_qty:1, unit_cost_cents:1500}`, `{id:2, product_id:1, supplier_id:1, min_qty:50, unit_cost_cents:1000}` via `INSERT OR IGNORE`.
    - Holdings: `{id:1, user_id:'seed-user-1', product_id:1, quantity:10, unit_cost_cents:1500, created_at:'2026-11-14T00:00:00.000Z'}`, same pattern for `seed-user-2` (id=2) and `seed-user-3` (id=3), all via `INSERT OR IGNORE`.
    - No Demo_User holdings inserted.
    - Export via `module.exports = { seed }`.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 7. Run tests to confirm they pass
  - From `server/`: run `node --test test/db.test.js`.
  - Expected: all unit tests (and any property tests added) pass, exit code 0.
  - _Requirements: 5.5_

- [x] 8. Checkpoint — Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP; the five property test sub-tasks (2.2–2.6) each cover one design correctness property (P1–P5).
- All code is CommonJS (`require`/`module.exports`). Do not add `"type": "module"` to `package.json`.
- `INSERT OR IGNORE` with explicit integer `id` values is the idempotency mechanism — no upsert logic or delete-then-insert.
- `profit_cents` intentionally has no `CHECK(profit_cents >= 0)` constraint; losing sales are valid and must be recordable.
- Property tests use `fast-check` with `{ numRuns: 100 }` and each file includes the tag comment `// Feature: db-schema-seed, Property N: <text>` as specified in the design.
- The seed pool quantity after all three holdings is exactly 30 units (3 × 10), placing the demo user one buy away from testing the tier boundary at 50.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "2.4", "2.5", "2.6"] },
    { "id": 2, "tasks": ["3"] },
    { "id": 3, "tasks": ["4.1"] },
    { "id": 4, "tasks": ["5.1"] },
    { "id": 5, "tasks": ["6.1"] },
    { "id": 6, "tasks": ["7"] }
  ]
}
```
