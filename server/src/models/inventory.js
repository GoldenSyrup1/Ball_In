'use strict';

const { getPoolQuantity, getBulkUnitCostCents } = require('./product.js');

class InvalidQuantityError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidQuantityError';
  }
}

function buyIntoInventory(db, productId, buyerUserId, quantity) {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new InvalidQuantityError(
      `quantity must be a positive integer, got: ${JSON.stringify(quantity)}`
    );
  }

  const poolBefore = getPoolQuantity(db, productId);
  const poolQtyAfter = poolBefore + quantity;
  const unitCostCents = getBulkUnitCostCents(db, productId, poolQtyAfter);
  const createdAt = new Date().toISOString();

  const result = db.prepare(
    `INSERT INTO inventory_holdings (user_id, product_id, quantity, unit_cost_cents, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(buyerUserId, productId, quantity, unitCostCents, createdAt);

  return {
    id: result.lastInsertRowid,
    userId: buyerUserId,
    productId,
    quantity,
    unitCostCents,
    totalCostCents: unitCostCents * quantity,
    createdAt,
  };
}

module.exports = { buyIntoInventory, InvalidQuantityError };
