# Requirements Document

## Introduction

The `create-listing` feature lets a seller publish one unit from an existing inventory holding as a marketplace listing. Calling `createListing(db, holdingId, sellerUserId)` validates ownership and availability, atomically decrements the holding quantity by one, inserts a new `listings` row priced at the holding's unit cost, and returns the created listing. The operation is wrapped in a single SQLite transaction so a failure at any step leaves both tables unchanged.

## Glossary

- **Listing**: A marketplace row in the `listings` table representing one unit available for sale at an asking price, with status `'open'`, `'sold'`, or `'cancelled'`.
- **Holding**: A row in `inventory_holdings` recording how many units of a product a user purchased and at what unit cost.
- **Pool Quantity**: The sum of all `inventory_holdings.quantity` values for a given product across all buyers.
- **Asking Price**: The initial sale price (in integer cents) seeded from `holding.unit_cost_cents`; the seller may negotiate from there via offers.
- **HoldingNotFoundError**: Thrown when no `inventory_holdings` row exists for the given `holdingId`.
- **HoldingOwnershipError**: Thrown when the `holding.user_id` does not match `sellerUserId`.
- **HoldingExhaustedError**: Thrown when `holding.quantity < 1` before the decrement.
- **createListing**: The exported function `createListing(db, holdingId, sellerUserId)` in `server/src/models/listing.js`.
- **Listing_Module**: The module `server/src/models/listing.js` that exports `createListing` and the three named error classes.
- **DB**: A `better-sqlite3` database instance with foreign keys enabled and the Ball-In schema applied.

---

## Requirements

### Requirement 1: Validate Holding Existence

**User Story:** As a seller, I want the system to reject listings for non-existent holdings, so that invalid data never enters the marketplace.

#### Acceptance Criteria

1. WHEN `createListing` is called with a `holdingId` that has no corresponding row in `inventory_holdings`, THEN THE `Listing_Module` SHALL throw a `HoldingNotFoundError`.
2. THE `Listing_Module` SHALL export `HoldingNotFoundError` as a named class whose `name` property equals `'HoldingNotFoundError'`.

---

### Requirement 2: Validate Holding Ownership

**User Story:** As a seller, I want the system to reject listings for holdings I do not own, so that only the rightful owner can list a unit.

#### Acceptance Criteria

1. WHEN `createListing` is called with a `holdingId` whose `user_id` does not equal `sellerUserId`, THEN THE `Listing_Module` SHALL throw a `HoldingOwnershipError`.
2. THE `Listing_Module` SHALL export `HoldingOwnershipError` as a named class whose `name` property equals `'HoldingOwnershipError'`.

---

### Requirement 3: Validate Holding Availability

**User Story:** As a seller, I want the system to reject listings on an exhausted holding, so that I cannot list more units than I own.

#### Acceptance Criteria

1. WHEN `createListing` is called and `holding.quantity < 1`, THEN THE `Listing_Module` SHALL throw a `HoldingExhaustedError` before modifying any data.
2. THE `Listing_Module` SHALL export `HoldingExhaustedError` as a named class whose `name` property equals `'HoldingExhaustedError'`.

---

### Requirement 4: Decrement Holding Quantity

**User Story:** As a marketplace operator, I want each listing creation to consume exactly one unit from the holding, so that inventory remains accurate.

#### Acceptance Criteria

1. WHEN `createListing` succeeds, THE `Listing_Module` SHALL decrement `inventory_holdings.quantity` by exactly 1 for the given `holdingId`.
2. WHEN `createListing` is called N times on the same holding (with sufficient quantity), THE `Listing_Module` SHALL decrement `inventory_holdings.quantity` by N in total.

---

### Requirement 5: Insert Listing Row

**User Story:** As a buyer, I want new listings to appear in the marketplace at the seller's cost price as the initial ask, so that I have a fair starting point for offers.

#### Acceptance Criteria

1. WHEN `createListing` succeeds, THE `Listing_Module` SHALL insert one row into `listings` with `holding_id = holdingId`, `asking_price_cents = holding.unit_cost_cents`, `status = 'open'`, and a valid ISO-8601 `created_at` timestamp.
2. THE `Listing_Module` SHALL set `asking_price_cents` to `holding.unit_cost_cents`, which is an integer number of cents, so that money is never stored as a float.

---

### Requirement 6: Return Listing Object

**User Story:** As a caller of `createListing`, I want a structured return value, so that I can reference the new listing without querying the database again.

#### Acceptance Criteria

1. WHEN `createListing` succeeds, THE `Listing_Module` SHALL return an object with fields: `id` (integer row ID), `holdingId` (integer), `askingPriceCents` (integer cents), `status` (`'open'`), and `createdAt` (ISO-8601 string).
2. THE `Listing_Module` SHALL return `askingPriceCents` as an integer equal to `holding.unit_cost_cents`.

---

### Requirement 7: Atomic Transaction

**User Story:** As a marketplace operator, I want the decrement and insert to be atomic, so that a failure at any step leaves the database in its original state.

#### Acceptance Criteria

1. THE `Listing_Module` SHALL wrap the decrement of `inventory_holdings.quantity` and the insert into `listings` in a single `db.transaction(...)` call.
2. IF the insert into `listings` fails after the decrement, THEN THE `Listing_Module` SHALL roll back the decrement so `inventory_holdings.quantity` is unchanged.
3. WHEN `createListing` throws `HoldingExhaustedError` on an already-exhausted holding, THE `Listing_Module` SHALL leave `inventory_holdings.quantity` unchanged at 0 (not -1).
