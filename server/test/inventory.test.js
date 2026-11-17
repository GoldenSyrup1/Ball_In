'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getDb } = require('../src/db/index.js');
const { seed } = require('../src/db/seed.js');
const { getPoolQuantity, getBulkUnitCostCents } = require('../src/models/product.js');
const { buyIntoInventory, InvalidQuantityError } = require('../src/models/inventory.js');
const fc = require('fast-check');

// ─── Unit Tests ───────────────────────────────────────────────────────────────

test('Test 1 — normal buy-in at base tier', () => {
  const db = getDb(':memory:');
  seed(db);

  const result = buyIntoInventory(db, 1, 'demo-user', 5);

  // poolQtyAfter = 30 + 5 = 35, still below 50 → base tier 1500¢
  assert.equal(result.quantity, 5);
  assert.equal(result.unitCostCents, 1500);
  assert.equal(result.totalCostCents, 7500);

  const row = db.prepare('SELECT * FROM inventory_holdings WHERE id = ?').get(result.id);
  assert.ok(row, 'row should exist in inventory_holdings');
  assert.equal(row.user_id, 'demo-user');
  assert.equal(row.quantity, 5);
  assert.equal(row.unit_cost_cents, 1500);
});

test('Test 2 — buy-in that crosses the tier boundary at exactly 50', () => {
  const db = getDb(':memory:');
  seed(db);

  // 30 + 20 = 50, hits min_qty=50 exactly → bulk tier 1000¢
  const result = buyIntoInventory(db, 1, 'demo-user', 20);

  assert.equal(result.unitCostCents, 1000);
  assert.equal(result.totalCostCents, 20000);
});

test('Test 3 — pool grows after buy-in', () => {
  const db = getDb(':memory:');
  seed(db);

  buyIntoInventory(db, 1, 'demo-user', 10);

  assert.equal(getPoolQuantity(db, 1), 40);
});

test('Test 4 — throw on quantity = 0', () => {
  const db = getDb(':memory:');
  seed(db);

  assert.throws(
    () => buyIntoInventory(db, 1, 'demo-user', 0),
    (err) => {
      assert.equal(err.name, 'InvalidQuantityError');
      return true;
    }
  );
});

test('Test 5 — throw on quantity = -1', () => {
  const db = getDb(':memory:');
  seed(db);

  assert.throws(
    () => buyIntoInventory(db, 1, 'demo-user', -1),
    (err) => {
      assert.equal(err.name, 'InvalidQuantityError');
      return true;
    }
  );
});

test('Test 6 — throw on quantity = 1.5 (float)', () => {
  const db = getDb(':memory:');
  seed(db);

  assert.throws(
    () => buyIntoInventory(db, 1, 'demo-user', 1.5),
    (err) => {
      assert.equal(err.name, 'InvalidQuantityError');
      return true;
    }
  );
});

test('Test 7 — throw on quantity = \'5\' (string)', () => {
  const db = getDb(':memory:');
  seed(db);

  assert.throws(
    () => buyIntoInventory(db, 1, 'demo-user', '5'),
    (err) => {
      assert.equal(err.name, 'InvalidQuantityError');
      return true;
    }
  );
});

test('Test 8 — returned id matches the actual DB row', () => {
  const db = getDb(':memory:');
  seed(db);

  const result = buyIntoInventory(db, 1, 'demo-user', 1);

  const row = db.prepare('SELECT * FROM inventory_holdings WHERE id = ?').get(result.id);
  assert.ok(row, 'row should exist in inventory_holdings');
  assert.equal(row.user_id, result.userId);
  assert.equal(row.product_id, result.productId);
  assert.equal(row.quantity, result.quantity);
  assert.equal(row.unit_cost_cents, result.unitCostCents);
  assert.equal(row.created_at, result.createdAt);
});

// ─── Property-Based Tests ─────────────────────────────────────────────────────

test('Property 1 — unitCostCents matches getBulkUnitCostCents at poolQtyAfter', () => {
  // Feature: buy-into-inventory, Property 1: unitCostCents always equals the tier resolved at poolBefore + quantity
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 100 }),
      (qty) => {
        const db = getDb(':memory:');
        seed(db);

        const poolBefore = getPoolQuantity(db, 1);
        const result = buyIntoInventory(db, 1, 'demo-user', qty);

        assert.equal(result.unitCostCents, getBulkUnitCostCents(db, 1, poolBefore + qty));
        assert.ok(Number.isInteger(result.unitCostCents));
      }
    ),
    { numRuns: 200 }
  );
});

test('Property 2 — totalCostCents is unitCostCents * quantity, always an integer', () => {
  // Feature: buy-into-inventory, Property 2: totalCostCents === unitCostCents * quantity, always an integer
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 100 }),
      (qty) => {
        const db = getDb(':memory:');
        seed(db);

        const result = buyIntoInventory(db, 1, 'demo-user', qty);

        assert.equal(result.totalCostCents, result.unitCostCents * result.quantity);
        assert.ok(Number.isInteger(result.totalCostCents));
      }
    ),
    { numRuns: 200 }
  );
});
