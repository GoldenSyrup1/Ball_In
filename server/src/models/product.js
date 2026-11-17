'use strict';

function getPoolQuantity(db, productId) {
  const row = db.prepare(
    'SELECT COALESCE(SUM(quantity), 0) AS total FROM inventory_holdings WHERE product_id = ?'
  ).get(productId);
  return row.total;
}

function getBulkUnitCostCents(db, productId, poolQtyAfter) {
  if (!Number.isInteger(poolQtyAfter) || poolQtyAfter < 1) {
    throw new Error(`Invalid poolQtyAfter: ${poolQtyAfter}`);
  }
  const tier = db.prepare(
    `SELECT unit_cost_cents FROM bulk_tiers
     WHERE product_id = ? AND min_qty <= ?
     ORDER BY min_qty DESC
     LIMIT 1`
  ).get(productId, poolQtyAfter);
  if (!tier) {
    throw new Error(`No bulk tier found for product ${productId} at pool qty ${poolQtyAfter}`);
  }
  return tier.unit_cost_cents;
}

module.exports = { getPoolQuantity, getBulkUnitCostCents };
