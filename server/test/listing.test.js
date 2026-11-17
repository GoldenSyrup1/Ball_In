'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getDb } = require('../src/db/index.js');
const { seed } = require('../src/db/seed.js');
const { buyIntoInventory } = require('../src/models/inventory.js');
const { createListing, HoldingNotFoundError, HoldingOwnershipError, HoldingExhaustedError } = require('../src/models/listing.js');

function freshDb() {
  const db = getDb(':memory:');
  seed(db);
  return db;
}

// After seed: holdings id=1,2,3 for seed-user-1/2/3 each with quantity=10.
// Pool total = 30 units, base tier unit_cost_cents = 1500.

test('Test 1 — normal listing creation returns correct shape', () => {
  const db = freshDb();
  const { id: holdingId } = buyIntoInventory(db, 1, 'demo-user', 10);
  const listing = createListing(db, holdingId, 'demo-user');

  assert.ok(listing.id);
  assert.strictEqual(listing.holdingId, holdingId);
  assert.strictEqual(listing.status, 'open');
  assert.strictEqual(listing.askingPriceCents, 1500);
  assert.ok(typeof listing.createdAt === 'string');

  // verify row in DB
  const row = db.prepare('SELECT * FROM listings WHERE id = ?').get(listing.id);
  assert.ok(row);
  assert.strictEqual(row.status, 'open');
  assert.strictEqual(row.asking_price_cents, 1500);
});

test('Test 2 — holding quantity decrements by 1', () => {
  const db = freshDb();
  const { id: holdingId } = buyIntoInventory(db, 1, 'demo-user', 10);
  const before = db.prepare('SELECT quantity FROM inventory_holdings WHERE id = ?').get(holdingId).quantity;

  createListing(db, holdingId, 'demo-user');

  const after = db.prepare('SELECT quantity FROM inventory_holdings WHERE id = ?').get(holdingId).quantity;
  assert.strictEqual(after, before - 1);
});

test('Test 3 — multiple listings decrement sequentially', () => {
  const db = freshDb();
  const { id: holdingId } = buyIntoInventory(db, 1, 'demo-user', 10);

  createListing(db, holdingId, 'demo-user');
  createListing(db, holdingId, 'demo-user');
  createListing(db, holdingId, 'demo-user');

  const qty = db.prepare('SELECT quantity FROM inventory_holdings WHERE id = ?').get(holdingId).quantity;
  assert.strictEqual(qty, 7);

  const listingCount = db.prepare('SELECT COUNT(*) as c FROM listings WHERE holding_id = ?').get(holdingId).c;
  assert.strictEqual(listingCount, 3);
});

test('Test 4 — throw HoldingNotFoundError for non-existent holdingId', () => {
  const db = freshDb();
  assert.throws(
    () => createListing(db, 99999, 'demo-user'),
    (err) => { assert.strictEqual(err.name, 'HoldingNotFoundError'); return true; }
  );
});

test('Test 5 — throw HoldingOwnershipError when seller does not own the holding', () => {
  // Seed holding id=1 belongs to seed-user-1
  const db = freshDb();
  assert.throws(
    () => createListing(db, 1, 'wrong-user'),
    (err) => { assert.strictEqual(err.name, 'HoldingOwnershipError'); return true; }
  );
});

test('Test 6 — throw HoldingExhaustedError when quantity is 0', () => {
  const db = freshDb();
  const { id: holdingId } = buyIntoInventory(db, 1, 'demo-user', 1);

  createListing(db, holdingId, 'demo-user'); // depletes quantity to 0

  assert.throws(
    () => createListing(db, holdingId, 'demo-user'),
    (err) => { assert.strictEqual(err.name, 'HoldingExhaustedError'); return true; }
  );
});

test('Test 7 — atomicity: exhausted holding leaves quantity at 0, not -1', () => {
  const db = freshDb();
  const { id: holdingId } = buyIntoInventory(db, 1, 'demo-user', 1);

  createListing(db, holdingId, 'demo-user'); // quantity → 0
  try { createListing(db, holdingId, 'demo-user'); } catch {}

  const qty = db.prepare('SELECT quantity FROM inventory_holdings WHERE id = ?').get(holdingId).quantity;
  assert.strictEqual(qty, 0);
});
