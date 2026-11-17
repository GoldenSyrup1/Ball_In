'use strict';

const assert = require('assert');

// Monetary literals — asserted as integers before any INSERT
const TIER_1_COST = 1500;
const TIER_2_COST = 1000;
const HOLDING_COST = 1500;

assert(Number.isInteger(TIER_1_COST), 'TIER_1_COST must be an integer');
assert(Number.isInteger(TIER_2_COST), 'TIER_2_COST must be an integer');
assert(Number.isInteger(HOLDING_COST), 'HOLDING_COST must be an integer');

function seed(db) {
  // 1. Suppliers
  const insertSupplier = db.prepare(
    'INSERT OR IGNORE INTO suppliers (id, name) VALUES (?, ?)'
  );
  insertSupplier.run(1, 'BulkCo Electronics');
  insertSupplier.run(2, 'MegaSource Ltd');

  // 2. Products
  const insertProduct = db.prepare(
    'INSERT OR IGNORE INTO products (id, name, category) VALUES (?, ?, ?)'
  );
  insertProduct.run(1, 'USB-C Hub 7-Port', 'Electronics');

  // 3. Bulk tiers
  const insertTier = db.prepare(
    'INSERT OR IGNORE INTO bulk_tiers (id, product_id, supplier_id, min_qty, unit_cost_cents) VALUES (?, ?, ?, ?, ?)'
  );
  insertTier.run(1, 1, 1, 1, TIER_1_COST);   // base tier: pool 1–49 → $15.00
  insertTier.run(2, 1, 1, 50, TIER_2_COST);  // bulk tier: pool 50+  → $10.00

  // 4. Inventory holdings (seed users only — no demo user)
  const insertHolding = db.prepare(
    'INSERT OR IGNORE INTO inventory_holdings (id, user_id, product_id, quantity, unit_cost_cents, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const createdAt = '2026-11-14T00:00:00.000Z';
  insertHolding.run(1, 'seed-user-1', 1, 10, HOLDING_COST, createdAt);
  insertHolding.run(2, 'seed-user-2', 1, 10, HOLDING_COST, createdAt);
  insertHolding.run(3, 'seed-user-3', 1, 10, HOLDING_COST, createdAt);
  // Pool total after seed: 10 + 10 + 10 = 30 units
}

module.exports = { seed };
