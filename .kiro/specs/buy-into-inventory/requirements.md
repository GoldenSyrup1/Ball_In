# Requirements Document

## Introduction

The buy-into-inventory feature lets a buyer purchase units of the single listed product into their personal inventory. The price per unit is determined by the **pool quantity after the purchase** — that is, the sum of all existing inventory holdings plus the new quantity being bought. This is Ball-In's core bulk-tier mechanism: buying into a larger pool unlocks a lower unit cost, even for the buyer who pushes the pool over a tier boundary. All monetary values are stored and computed in integer cents. The feature is exposed as a single function, `buyIntoInventory`, exported from `server/src/models/inventory.js`.

## Glossary

- **Inventory_Module**: The `buyIntoInventory` function and `InvalidQuantityError` class exported from `server/src/models/inventory.js`.
- **Pool_Quantity**: The sum of all `quantity` values in `inventory_holdings` for a given product across all buyers, used to determine bulk-tier pricing.
- **Pool_Quantity_After**: `Pool_Quantity` for a product plus the quantity being purchased in the current call. This is the value used for tier resolution.
- **Bulk_Tier**: A pricing record in `bulk_tiers` with a `min_qty` threshold and a `unit_cost_cents` value. The applicable tier is the one with the highest `min_qty` that is ≤ `Pool_Quantity_After`.
- **Holding**: A row in `inventory_holdings` representing a buyer's ownership of a quantity of units purchased at a specific `unit_cost_cents`.
- **InvalidQuantityError**: A named error class (extends `Error`, `name = 'InvalidQuantityError'`) thrown when the supplied quantity fails validation.
- **Product_Module**: The module at `server/src/models/product.js` exporting `getPoolQuantity` and `getBulkUnitCostCents`.
- **DB**: A `better-sqlite3` synchronous database connection produced by `getDb()`.

## Requirements

### Requirement 1: Quantity Validation

**User Story:** As a buyer, I want the system to reject invalid purchase quantities immediately, so that only well-formed requests reach the database.

#### Acceptance Criteria

1. WHEN `buyIntoInventory` is called with a `quantity` that is not a positive integer (i.e., `!(Number.isInteger(quantity) && quantity >= 1)`), THEN THE `Inventory_Module` SHALL throw an `InvalidQuantityError` before performing any database read or write.
2. THE `Inventory_Module` SHALL set the `name` property of every thrown `InvalidQuantityError` to the string `'InvalidQuantityError'`.
3. THE `Inventory_Module` SHALL include the invalid value in the `InvalidQuantityError` message.
4. WHEN `buyIntoInventory` is called with `quantity = 0`, THEN THE `Inventory_Module` SHALL throw an `InvalidQuantityError`.
5. WHEN `buyIntoInventory` is called with a negative integer quantity, THEN THE `Inventory_Module` SHALL throw an `InvalidQuantityError`.
6. WHEN `buyIntoInventory` is called with a non-integer numeric quantity (e.g., `1.5`), THEN THE `Inventory_Module` SHALL throw an `InvalidQuantityError`.
7. WHEN `buyIntoInventory` is called with a non-numeric quantity (e.g., the string `'5'`), THEN THE `Inventory_Module` SHALL throw an `InvalidQuantityError`.

### Requirement 2: Pool-Quantity-After Computation

**User Story:** As a buyer, I want the unit cost to reflect the total pool size after my purchase, so that my buy-in benefits from the tier my purchase unlocks.

#### Acceptance Criteria

1. WHEN `buyIntoInventory` is called with a valid `quantity`, THE `Inventory_Module` SHALL compute `Pool_Quantity_After` as `getPoolQuantity(db, productId) + quantity`.
2. THE `Inventory_Module` SHALL use `Pool_Quantity_After` (not the pre-purchase pool quantity) as the input to `getBulkUnitCostCents`.
3. WHEN `Pool_Quantity_After` equals a `Bulk_Tier`'s `min_qty` exactly, THE `Inventory_Module` SHALL resolve `unitCostCents` to that tier's `unit_cost_cents` (the boundary is inclusive).

### Requirement 3: Unit Cost Resolution

**User Story:** As a buyer, I want the unit cost locked in at the correct bulk tier for my purchase, so that the recorded cost accurately reflects the pool-based pricing.

#### Acceptance Criteria

1. WHEN `buyIntoInventory` is called with a valid `quantity`, THE `Inventory_Module` SHALL resolve `unitCostCents` by calling `getBulkUnitCostCents(db, productId, Pool_Quantity_After)`.
2. THE `Inventory_Module` SHALL store `unitCostCents` as an integer number of cents with no floating-point arithmetic.
3. WHEN `Pool_Quantity_After` is below the lowest non-base `Bulk_Tier` threshold, THE `Inventory_Module` SHALL use the base tier's `unit_cost_cents`.

### Requirement 4: Holding Insertion

**User Story:** As a buyer, I want my purchase to be recorded as a holding in the database, so that my inventory is updated and future pool calculations include my units.

#### Acceptance Criteria

1. WHEN `buyIntoInventory` is called with a valid `quantity` and unit cost has been resolved, THE `Inventory_Module` SHALL insert exactly one row into `inventory_holdings` with `user_id = buyerUserId`, `product_id = productId`, `quantity = quantity`, `unit_cost_cents = unitCostCents`, and `created_at` set to the current UTC timestamp in ISO 8601 format.
2. WHEN the row is inserted, THE `Inventory_Module` SHALL use the database-assigned row ID as the holding's `id`.
3. AFTER the row is inserted, THE `Inventory_Module` SHALL return a plain object with fields `{ id, userId, productId, quantity, unitCostCents, totalCostCents, createdAt }`.

### Requirement 5: Return Value and Total Cost

**User Story:** As a buyer, I want the function to return the full details of my purchase, so that the caller can display or persist the result without additional queries.

#### Acceptance Criteria

1. THE `Inventory_Module` SHALL return `totalCostCents` as `unitCostCents * quantity`, computed using integer multiplication.
2. THE `Inventory_Module` SHALL return `userId` equal to the `buyerUserId` argument.
3. THE `Inventory_Module` SHALL return `productId` equal to the `productId` argument.
4. THE `Inventory_Module` SHALL return `quantity` equal to the validated `quantity` argument.
5. THE `Inventory_Module` SHALL return `unitCostCents` equal to the value resolved by `getBulkUnitCostCents`.
6. THE `Inventory_Module` SHALL return `createdAt` equal to the ISO 8601 timestamp written to the database row.

### Requirement 6: Pool Growth

**User Story:** As a buyer, I want my purchase to increase the pool quantity for the product, so that subsequent buyers see the correct pool depth and tier pricing.

#### Acceptance Criteria

1. AFTER `buyIntoInventory` completes successfully, THE `Inventory_Module` SHALL result in `getPoolQuantity(db, productId)` returning a value equal to the pool quantity before the call plus `quantity`.
