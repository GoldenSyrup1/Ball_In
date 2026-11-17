'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fc = require('fast-check');
const { getDb } = require('../src/db/index.js');
const { seed } = require('../src/db/seed.js');
const { getPoolQuantity, getBulkUnitCostCents } = require('../src/models/product.js');

// --- Unit tests ---

test('getPoolQuantity returns 30 for seeded product', () => {
  const db = getDb(':memory:');
  seed(db);
  assert.equal(getPoolQuantity(db, 1), 30);
});

test('getPoolQuantity returns 0 for unknown product', () => {
  const db = getDb(':memory:');
  seed(db);
  assert.equal(getPoolQuantity(db, 9999), 0);
});

test('getBulkUnitCostCents returns base tier cost for pool of 49', () => {
  const db = getDb(':memory:');
  seed(db);
  assert.equal(getBulkUnitCostCents(db, 1, 49), 1500);
});

test('getBulkUnitCostCents returns bulk tier cost at exactly pool of 50 (inclusive boundary)', () => {
  const db = getDb(':memory:');
  seed(db);
  assert.equal(getBulkUnitCostCents(db, 1, 50), 1000);
});

test('getBulkUnitCostCents returns bulk tier cost for pool above 50', () => {
  const db = getDb(':memory:');
  seed(db);
  assert.equal(getBulkUnitCostCents(db, 1, 100), 1000);
});

test('getBulkUnitCostCents returns base tier for pool of 1', () => {
  const db = getDb(':memory:');
  seed(db);
  assert.equal(getBulkUnitCostCents(db, 1, 1), 1500);
});

test('getBulkUnitCostCents throws for poolQtyAfter of 0', () => {
  const db = getDb(':memory:');
  seed(db);
  assert.throws(
    () => getBulkUnitCostCents(db, 1, 0),
    /invalid|poolQty/i
  );
});

// --- Property-based tests ---

// Feature: bulk-tier-pricing, Property 1: selected tier's min_qty is always <= poolQtyAfter
test('Property 1: selected tier min_qty is always <= poolQtyAfter', () => {
  const db = getDb(':memory:');
  seed(db);

  const getTierForCost = db.prepare(
    'SELECT min_qty FROM bulk_tiers WHERE product_id = 1 AND unit_cost_cents = ? ORDER BY min_qty DESC LIMIT 1'
  );

  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 10000 }),
      (poolQtyAfter) => {
        const cost = getBulkUnitCostCents(db, 1, poolQtyAfter);
        assert.ok(Number.isInteger(cost), 'cost must be an integer');

        // Query the DB directly for the max min_qty tier that is <= poolQtyAfter
        const expectedTier = db.prepare(
          'SELECT unit_cost_cents FROM bulk_tiers WHERE product_id = 1 AND min_qty <= ? ORDER BY min_qty DESC LIMIT 1'
        ).get(poolQtyAfter);

        assert.equal(cost, expectedTier.unit_cost_cents, `cost mismatch at poolQtyAfter=${poolQtyAfter}`);

        // Verify no tier with a higher min_qty that is still <= poolQtyAfter exists with a different cost
        const appliedTier = getTierForCost.get(cost);
        assert.ok(appliedTier.min_qty <= poolQtyAfter, `applied tier min_qty ${appliedTier.min_qty} exceeds poolQtyAfter ${poolQtyAfter}`);
      }
    ),
    { numRuns: 200 }
  );
});

// Feature: bulk-tier-pricing, Property 2: increasing poolQtyAfter never increases unit cost
test('Property 2: increasing poolQtyAfter never increases unit cost', () => {
  const db = getDb(':memory:');
  seed(db);

  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 9999 }).chain((a) =>
        fc.integer({ min: a + 1, max: 10000 }).map((b) => [a, b])
      ),
      ([a, b]) => {
        const costA = getBulkUnitCostCents(db, 1, a);
        const costB = getBulkUnitCostCents(db, 1, b);
        assert.ok(costA >= costB, `cost at ${a} (${costA}) should be >= cost at ${b} (${costB})`);
      }
    ),
    { numRuns: 200 }
  );
});
