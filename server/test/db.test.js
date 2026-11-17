'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getDb } = require('../src/db/index.js');
const { seed } = require('../src/db/seed.js');

// Test 1 — Schema: all 7 tables exist
test('getDb creates all 7 schema tables', () => {
  const db = getDb(':memory:');

  const rows = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  ).all();

  const tableNames = rows.map(r => r.name);
  const expected = [
    'bulk_tiers',
    'inventory_holdings',
    'listings',
    'offers',
    'products',
    'sales',
    'suppliers',
  ];

  for (const name of expected) {
    assert.ok(
      tableNames.includes(name),
      `Expected table "${name}" to exist in sqlite_master`
    );
  }

  assert.equal(tableNames.length, 7, 'Expected exactly 7 tables');
});

// Test 2 — Seed: one product, ≥2 bulk tiers
test('seed inserts exactly one product and at least two bulk tiers', () => {
  const db = getDb(':memory:');
  seed(db);

  const { count: productCount } = db
    .prepare('SELECT COUNT(*) as count FROM products')
    .get();
  assert.equal(productCount, 1, 'Expected exactly 1 product after seed');

  const { id: productId } = db.prepare('SELECT id FROM products').get();
  const { count: tierCount } = db
    .prepare('SELECT COUNT(*) as count FROM bulk_tiers WHERE product_id = ?')
    .get(productId);
  assert.ok(tierCount >= 2, `Expected at least 2 bulk tiers for product ${productId}, got ${tierCount}`);
});

// Test 3 — Seed idempotency
test('seed is idempotent: calling it twice leaves row counts unchanged', () => {
  const db = getDb(':memory:');

  seed(db);
  const { count: productsAfterFirst } = db
    .prepare('SELECT COUNT(*) as count FROM products')
    .get();
  const { id: productId } = db.prepare('SELECT id FROM products').get();
  const { count: tiersAfterFirst } = db
    .prepare('SELECT COUNT(*) as count FROM bulk_tiers WHERE product_id = ?')
    .get(productId);

  seed(db);
  const { count: productsAfterSecond } = db
    .prepare('SELECT COUNT(*) as count FROM products')
    .get();
  const { count: tiersAfterSecond } = db
    .prepare('SELECT COUNT(*) as count FROM bulk_tiers WHERE product_id = ?')
    .get(productId);

  assert.equal(productsAfterSecond, 1, 'products count must remain 1 after second seed call');
  assert.equal(
    tiersAfterSecond,
    tiersAfterFirst,
    `bulk_tiers count must be unchanged after second seed (expected ${tiersAfterFirst}, got ${tiersAfterSecond})`
  );
  assert.equal(productsAfterFirst, productsAfterSecond); // sanity
});
