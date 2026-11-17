'use strict';

class HoldingNotFoundError extends Error {
  constructor(msg) { super(msg); this.name = 'HoldingNotFoundError'; }
}
class HoldingOwnershipError extends Error {
  constructor(msg) { super(msg); this.name = 'HoldingOwnershipError'; }
}
class HoldingExhaustedError extends Error {
  constructor(msg) { super(msg); this.name = 'HoldingExhaustedError'; }
}

function createListing(db, holdingId, sellerUserId) {
  return db.transaction(() => {
    const holding = db.prepare(
      'SELECT * FROM inventory_holdings WHERE id = ?'
    ).get(holdingId);

    if (!holding) {
      throw new HoldingNotFoundError(`Holding ${holdingId} not found`);
    }
    if (holding.user_id !== sellerUserId) {
      throw new HoldingOwnershipError(
        `Holding ${holdingId} does not belong to user ${sellerUserId}`
      );
    }
    if (holding.quantity < 1) {
      throw new HoldingExhaustedError(
        `Holding ${holdingId} has no units remaining`
      );
    }

    db.prepare(
      'UPDATE inventory_holdings SET quantity = quantity - 1 WHERE id = ?'
    ).run(holdingId);

    const createdAt = new Date().toISOString();
    const result = db.prepare(
      `INSERT INTO listings (holding_id, asking_price_cents, status, created_at)
       VALUES (?, ?, 'open', ?)`
    ).run(holdingId, holding.unit_cost_cents, createdAt);

    return {
      id: result.lastInsertRowid,
      holdingId,
      askingPriceCents: holding.unit_cost_cents,
      status: 'open',
      createdAt,
    };
  })();
}

module.exports = { createListing, HoldingNotFoundError, HoldingOwnershipError, HoldingExhaustedError };
