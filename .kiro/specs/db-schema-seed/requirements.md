# Requirements Document

## Introduction

This document covers the database schema, connection helper, and seed data for Ball-In's MVP (Task 1). Ball-In is a single-category bulk-buy marketplace demo built on Node.js, Express, and better-sqlite3/SQLite. The schema defined here is the foundation for every subsequent task: bulk-tier pricing lookup (Task 2), inventory pre-buy (Task 3), listings (Task 4), offers and fee settlement (Tasks 5–7), and the HTTP API (Task 8). All monetary columns are stored as integer cents; no floating-point values appear at any layer.

## Glossary

- **DB**: The better-sqlite3 SQLite database connection returned by `getDb`.
- **Schema_DDL**: The SQL `CREATE TABLE IF NOT EXISTS` statements in `schema.sql` that define all seven tables.
- **getDb**: The exported function in `server/src/db/index.js` that opens (or creates) a better-sqlite3 database, runs Schema_DDL, and returns the ready connection.
- **Seed**: The exported function in `server/src/db/seed.js` that populates the DB with the fixed set of suppliers, one product, bulk tiers, and pre-existing inventory holdings.
- **Pool_Quantity**: The sum of all `inventory_holdings.quantity` values for a given product across all users.
- **Bulk_Tier**: A row in `bulk_tiers` defining a price break: `min_qty` (integer) and `unit_cost_cents` (integer cents).
- **Base_Tier**: The Bulk_Tier whose `min_qty` is 1, guaranteeing a tier is always found regardless of Pool_Quantity.
- **Holding**: A row in `inventory_holdings` representing one user's pre-purchased units of a product at a locked-in `unit_cost_cents`.
- **Listing**: A row in `listings` representing a single unit offered for sale from a Holding.
- **Offer**: A row in `offers` representing a buyer's bid on a Listing.
- **Sale**: A row in `sales` representing a settled transaction with computed `profit_cents`, `fee_cents`, and `net_to_seller_cents`.
- **Idempotent_Seed**: A Seed execution that can be called multiple times on the same DB without duplicating rows.
- **Demo_User**: The user ID representing the primary actor in the demo walkthrough; not inserted by Seed so the demo user starts with no holdings.
- **Seeded_User**: A user ID inserted by Seed to populate pre-existing Holdings, giving the pool non-zero depth before the Demo_User buys in.

---

## Requirements

### Requirement 1: Schema DDL

**User Story:** As a developer, I want all seven database tables created from a single SQL file, so that any module can rely on a consistent schema without managing migrations manually.

#### Acceptance Criteria

1. THE Schema_DDL SHALL define a `suppliers` table with columns `id` (integer primary key) and `name` (text, not null).
2. THE Schema_DDL SHALL define a `products` table with columns `id` (integer primary key), `name` (text, not null), and `category` (text, not null).
3. THE Schema_DDL SHALL define a `bulk_tiers` table with columns `id` (integer primary key), `product_id` (integer, foreign key to `products.id`), `supplier_id` (integer, foreign key to `suppliers.id`), `min_qty` (integer, not null, minimum value 0), and `unit_cost_cents` (integer, not null, minimum value 1); exactly one row per product must have `min_qty` = 0 or 1 to serve as the base tier.
4. THE Schema_DDL SHALL define an `inventory_holdings` table with columns `id` (integer primary key), `user_id` (text, not null), `product_id` (integer, foreign key to `products.id`), `quantity` (integer, not null, minimum value 1), `unit_cost_cents` (integer, not null, minimum value 1), and `created_at` (text, not null, stored as ISO-8601 UTC timestamp).
5. THE Schema_DDL SHALL define a `listings` table with columns `id` (integer primary key), `holding_id` (integer, foreign key to `inventory_holdings.id`), `asking_price_cents` (integer, not null, minimum value 1), `status` (text, not null, constrained to values `open`, `sold`, or `cancelled`), and `created_at` (text, not null, stored as ISO-8601 UTC timestamp).
6. THE Schema_DDL SHALL define an `offers` table with columns `id` (integer primary key), `listing_id` (integer, foreign key to `listings.id`), `buyer_id` (text, not null), `offer_price_cents` (integer, not null, minimum value 1), `status` (text, not null, constrained to values `pending`, `accepted`, or `declined`), and `created_at` (text, not null, stored as ISO-8601 UTC timestamp).
7. THE Schema_DDL SHALL define a `sales` table with columns `id` (integer primary key), `offer_id` (integer, foreign key to `offers.id`), `sale_price_cents` (integer, not null, minimum value 1), `unit_cost_cents` (integer, not null, minimum value 1), `profit_cents` (integer, not null), `fee_cents` (integer, not null, minimum value 0), `net_to_seller_cents` (integer, not null), `status` (text, not null, constrained to value `fulfilled`), and `created_at` (text, not null, stored as ISO-8601 UTC timestamp).
8. THE Schema_DDL SHALL use `CREATE TABLE IF NOT EXISTS` for every table, so that running the DDL against an already-initialized database does not raise an error.
9. THE Schema_DDL SHALL declare no column of numeric type as REAL, FLOAT, DOUBLE, or any floating-point affinity; all monetary columns SHALL use INTEGER affinity.
10. IF a foreign key constraint is violated by an insert or update, THEN THE Schema_DDL SHALL enforce referential integrity such that the operation is rejected with an error indicating a constraint violation.

---

### Requirement 2: Database Connection (`getDb`)

**User Story:** As a developer, I want a single function that opens a database, applies the schema, and returns the connection, so that any module can obtain a ready DB without repeating initialization logic.

#### Acceptance Criteria

1. WHEN `getDb(path)` is called where `path` is a non-empty string representing an absolute or relative filesystem path, THE getDb SHALL return a better-sqlite3 database connection with all seven Schema_DDL tables queryable via `sqlite_master`.
2. WHEN `getDb(':memory:')` is called, THE getDb SHALL return a better-sqlite3 database connection with all seven Schema_DDL tables queryable via `sqlite_master`, and no file shall be created on the filesystem.
3. WHEN `getDb(path)` is called and no file exists at `path`, THE getDb SHALL create the file at `path`, apply Schema_DDL, and return the connection.
4. WHEN `getDb(path)` is called and the database file at `path` already has the schema applied, THE getDb SHALL apply Schema_DDL using `IF NOT EXISTS` semantics, return the connection, and leave all pre-existing rows in every table unmodified.
5. THE getDb SHALL execute all Schema_DDL statements synchronously before returning, so that the caller can immediately prepare and run statements against any of the seven tables.
6. IF `getDb(path)` is called with a path that cannot be opened or created by the process (e.g., a directory path, an inaccessible location, or an empty string), THEN THE getDb SHALL throw an error indicating the path is invalid or inaccessible without returning a connection object.

---

### Requirement 3: Seed Data (`seed`)

**User Story:** As a developer, I want a seed function that populates the database with one product, its suppliers, bulk tiers, and pre-existing holdings, so that the demo loop has realistic pool depth from the start and tests have a known, stable fixture.

#### Acceptance Criteria

1. WHEN `seed(db)` is called, THE Seed SHALL insert exactly 2 rows into `suppliers`.
2. WHEN `seed(db)` is called, THE Seed SHALL insert exactly one row into `products`, belonging to exactly one category, with its `supplier_id` referencing one of the 2 seeded supplier rows.
3. WHEN `seed(db)` is called, THE Seed SHALL insert a Base_Tier row into `bulk_tiers` for the seeded product with `min_qty = 1` and a `unit_cost_cents` value greater than zero.
4. WHEN `seed(db)` is called, THE Seed SHALL insert at least one additional Bulk_Tier row for the seeded product with `min_qty = 50` and a `unit_cost_cents` strictly less than the Base_Tier's `unit_cost_cents`, so that reaching the tier boundary produces a lower unit cost.
5. WHEN `seed(db)` is called, THE Seed SHALL insert exactly 3 `inventory_holdings` rows assigned to Seeded_User IDs, each with a `quantity` of exactly 10 and a `unit_cost_cents` matching one of the seeded Bulk_Tier values, so that Pool_Quantity for the seeded product is exactly 30 before the Demo_User buys in.
6. IF `seed(db)` is called more than once on the same database, THEN THE Seed SHALL NOT insert duplicate rows for any seeded supplier, product, bulk tier, or holding, leaving row counts for those tables unchanged after the second and any subsequent call.
7. THE Seed SHALL assign no Holdings to the Demo_User, so that the Demo_User's inventory starts empty when the demo begins.
8. IF any seeded monetary field (`unit_cost_cents` or equivalent price field in Holdings) contains a non-integer or floating-point value, THEN THE Seed SHALL raise an error indicating a data integrity violation before committing the transaction.

---

### Requirement 4: Bulk Tier Structural Invariants

**User Story:** As a developer, I want the seeded bulk tier data to satisfy the invariants the pricing engine relies on, so that Task 2's tier-lookup logic always finds a valid tier.

#### Acceptance Criteria

1. THE Seed SHALL ensure that for the seeded product, at least one Bulk_Tier has `min_qty` equal to 1, guaranteeing a tier is always found for any Pool_Quantity of 1 or more.
2. THE Seed SHALL ensure that every seeded Bulk_Tier's `unit_cost_cents` is an integer greater than or equal to 1.
3. THE Seed SHALL ensure that every seeded Bulk_Tier's `min_qty` is an integer greater than or equal to 1.
4. THE Seed SHALL ensure that no two seeded Bulk_Tiers for the same product share the same `min_qty` value, so that the tier-selection expression `max(t for t in tiers if t.min_qty <= pool_qty_after)` resolves to exactly one tier.
5. THE Seed SHALL ensure that higher `min_qty` tiers have strictly lower `unit_cost_cents` values than lower `min_qty` tiers for the same product, so that a larger Pool_Quantity never results in a higher unit cost.

---

### Requirement 5: Test Coverage

**User Story:** As a developer, I want an automated test that exercises `getDb` and `seed` together, so that regressions in the schema or seed data are caught immediately.

#### Acceptance Criteria

1. THE `server/test/db.test.js` file SHALL use the `node:test` built-in test runner (no third-party test framework).
2. WHEN the test suite runs, THE `db.test.js` SHALL call `getDb(':memory:')` and pass the returned connection to `seed(db)` before asserting anything.
3. WHEN the test suite runs, THE `db.test.js` SHALL assert that exactly one row exists in the `products` table after seeding.
4. WHEN the test suite runs, THE `db.test.js` SHALL assert that at least two rows exist in `bulk_tiers` for the seeded product's `id`, where two is the minimum required for a valid pricing ladder (one base tier at `min_qty` 1 and at least one higher tier).
5. WHEN the test suite runs and all assertions pass, THE `db.test.js` SHALL exit with code 0 when invoked as `node --test server/test/db.test.js` from the `server/` directory without any build step, and SHALL exit with a non-zero code if any assertion fails.
6. WHEN `seed(db)` is called twice on the same in-memory DB inside the test, THE `db.test.js` SHALL assert that the `products` row count remains exactly one and that the `bulk_tiers` row count for the seeded product's `id` is identical to the count after the first seed call, verifying idempotent seed behavior.

---

### Requirement 6: Package Configuration

**User Story:** As a developer, I want a `server/package.json` that declares all runtime dependencies and a test script, so that the project can be installed and tested with standard npm commands.

#### Acceptance Criteria

1. THE `server/package.json` SHALL declare `better-sqlite3` as a production dependency under the `"dependencies"` key.
2. WHEN a developer runs `npm test` from the `server/` directory, THE `server/package.json` SHALL execute `node --test` targeting all files matching `server/test/**/*.test.js`.
3. IF `server/package.json` sets `"type": "module"`, THEN every file under `server/src/db/` and `server/test/` SHALL use ES module syntax (`import`/`export`) with no CommonJS `require` or `module.exports` calls; IF `"type"` is omitted or set to `"commonjs"`, THEN every file under `server/src/db/` and `server/test/` SHALL use CommonJS syntax (`require`/`module.exports`) with no ES module `import` or `export` declarations.
4. THE `server/package.json` SHALL perform no monetary arithmetic; all monetary values in `server/src/db/` SHALL be stored and computed as integer cents using integer arithmetic only, with no floating-point or decimal math library listed under any dependency key.
