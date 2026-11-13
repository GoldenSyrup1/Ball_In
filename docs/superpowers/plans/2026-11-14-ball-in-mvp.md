# Ball-In MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the single-category demo of Ball-In: pre-buy into inventory at a
pooled bulk-tier price, list it, negotiate an offer, accept or decline, and settle
with a profit-contingent fee (0% on a loss) — end to end, API-driven, with a thin
frontend on top.

**Architecture:** One repo, no microservices. Express backend with SQLite
(better-sqlite3) holding the domain logic as plain functions under
`server/src/models` and `server/src/services`, thin Express routes wrapping them,
a minimal React (Vite) frontend consuming the API, and a `.kiro/` directory
(steering docs + one hook) driving and documenting the Kiro usage the hackathon
write-up needs.

**Tech Stack:** Node.js, Express, better-sqlite3, Vite + React, node:test for
backend tests.

**Spec:** `docs/superpowers/specs/2026-11-14-ball-in-design.md`

## Global Constraints

- Single product category only; no multi-category catalog (spec non-goal)
- No real supplier integration, no real payments, no real delivery — all simulated
- Money stored and computed in integer cents everywhere, never floats
- `/.kiro` directory must exist at repo root and must never be gitignored
- Solo build; every task must leave the app runnable and demoable on its own

## Review Focus

- Non-positive or oversized quantity passed to the pre-buy flow — must be rejected,
  not silently accepted into inventory
- Pool quantity landing exactly on a bulk-tier boundary — the tier lookup must
  resolve the boundary consistently (inclusive on the tier that was just reached)
- An offer priced at or below the holding's unit cost — the fee engine must return
  exactly 0, never a negative fee
- Accepting an offer on a listing that is already sold (double-accept / stale offer) —
  must be rejected, not produce a second sale
- Declining an offer must leave the listing open for further offers, not mark it sold

---

## Task 1: Scaffold + schema + seed data

**Files:**
- Create: `server/package.json`, `server/src/db/schema.sql`, `server/src/db/index.js`, `server/src/db/seed.js`
- Test: `server/test/db.test.js`

**Interfaces:**
- Produces: `getDb()` returning a ready, migrated better-sqlite3 connection; `seed(db)` populating one category's products, suppliers, and bulk tiers, plus a handful of other-seller inventory holdings so the pool already has depth before the demo user buys in

- [ ] **Step 1: Write the failing test**

```js
test('getDb runs schema and seed populates one category with bulk tiers', () => {
  const db = getDb(':memory:');
  seed(db);
  const products = db.prepare('SELECT * FROM products').all();
  assert.strictEqual(products.length, 1);
  const tiers = db.prepare('SELECT * FROM bulk_tiers WHERE product_id = ?').all(products[0].id);
  assert.ok(tiers.length >= 2); // at least two price breaks
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/test/db.test.js`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement schema and `getDb(path)` / `seed(db)` in `server/src/db/`**

Schema tables: `suppliers(id, name)`, `products(id, name, category)`,
`bulk_tiers(id, product_id, supplier_id, min_qty, unit_cost_cents)`,
`inventory_holdings(id, user_id, product_id, quantity, unit_cost_cents, created_at)`,
`listings(id, holding_id, asking_price_cents, status, created_at)`,
`offers(id, listing_id, buyer_id, offer_price_cents, status, created_at)`,
`sales(id, offer_id, sale_price_cents, unit_cost_cents, profit_cents, fee_cents, net_to_seller_cents, status, created_at)`.
Seed one product with at least 2 bulk tiers (e.g. `min_qty: 1` and `min_qty: 50` at
a lower `unit_cost_cents`) and 2-3 pre-existing `inventory_holdings` rows from other
seeded `user_id`s so the pool has non-zero depth.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/test/db.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/package.json server/src/db server/test/db.test.js
git commit -m "feat: db schema and seed data for one category"
```

---

## Task 2: Bulk-tier pricing lookup

**Files:**
- Create: `server/src/models/product.js`
- Test: `server/test/product.test.js`

**Interfaces:**
- Consumes: `getDb()` from Task 1
- Produces: `getPoolQuantity(db, productId)` returning the sum of all
  `inventory_holdings.quantity` for that product; `getBulkUnitCostCents(db, productId, poolQtyAfterBuy)` returning the `unit_cost_cents` of the highest-`min_qty` tier with `min_qty <= poolQtyAfterBuy`

- [ ] **Step 1: Write the failing test**

```js
test('getBulkUnitCostCents resolves the boundary tier inclusively', () => {
  // tiers seeded: min_qty 1 @ 1000c, min_qty 50 @ 700c
  assert.strictEqual(getBulkUnitCostCents(db, productId, 49), 1000);
  assert.strictEqual(getBulkUnitCostCents(db, productId, 50), 700);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/test/product.test.js`
Expected: FAIL (function not defined)

- [ ] **Step 3: Implement `getPoolQuantity` and `getBulkUnitCostCents` in `server/src/models/product.js`**

`getBulkUnitCostCents` orders tiers by `min_qty` descending and returns the first
row whose `min_qty <= poolQtyAfterBuy`; throw if none match (pool below the lowest
tier should not happen since the lowest tier must have `min_qty: 1`, but guard it).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/test/product.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/models/product.js server/test/product.test.js
git commit -m "feat: bulk-tier pricing lookup"
```

---

## Task 3: Pre-buy into inventory

**Files:**
- Create: `server/src/models/inventory.js`
- Test: `server/test/inventory.test.js`

**Interfaces:**
- Consumes: `getPoolQuantity`, `getBulkUnitCostCents` from Task 2
- Produces: `buyIntoInventory(db, { userId, productId, quantity }) -> { holdingId, unitCostCents, totalCostCents }`; throws `InvalidQuantityError` for `quantity <= 0`

- [ ] **Step 1: Write the failing test**

```js
test('buyIntoInventory rejects non-positive quantity', () => {
  assert.throws(() => buyIntoInventory(db, { userId: 'u1', productId, quantity: 0 }), /InvalidQuantityError/);
});

test('buyIntoInventory locks in the tier price for the pool total after this buy', () => {
  const result = buyIntoInventory(db, { userId: 'u1', productId, quantity: 1 });
  assert.strictEqual(result.unitCostCents, expectedTierPriceForNewPoolTotal);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/test/inventory.test.js`
Expected: FAIL (function not defined)

- [ ] **Step 3: Implement `buyIntoInventory` in `server/src/models/inventory.js`**

Validate quantity first. Compute `poolQtyAfterBuy = getPoolQuantity(db, productId) + quantity`,
look up `unitCostCents` via `getBulkUnitCostCents`, insert one `inventory_holdings`
row, return `{ holdingId, unitCostCents, totalCostCents: unitCostCents * quantity }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/test/inventory.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/models/inventory.js server/test/inventory.test.js
git commit -m "feat: pre-buy into inventory at pooled tier price"
```

---

## Task 4: Listing

**Files:**
- Create: `server/src/models/listing.js`
- Test: `server/test/listing.test.js`

**Interfaces:**
- Consumes: `inventory_holdings` rows from Task 3
- Produces: `createListing(db, { holdingId, askingPriceCents }) -> { listingId }`; throws `HoldingUnavailableError` if the holding's `quantity < 1` (one unit per listing, MVP simplification) and decrements the holding's quantity by 1 on success

- [ ] **Step 1: Write the failing test**

```js
test('createListing decrements the holding and rejects an exhausted holding', () => {
  const { listingId } = createListing(db, { holdingId, askingPriceCents: 1500 });
  assert.ok(listingId);
  const holding = db.prepare('SELECT quantity FROM inventory_holdings WHERE id = ?').get(holdingId);
  assert.strictEqual(holding.quantity, originalQuantity - 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/test/listing.test.js`
Expected: FAIL (function not defined)

- [ ] **Step 3: Implement `createListing` in `server/src/models/listing.js`**

Wrap the quantity check, decrement, and listing insert in a single
`db.transaction(...)` so they commit or fail together.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/test/listing.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/models/listing.js server/test/listing.test.js
git commit -m "feat: list one unit from a held product"
```

---

## Task 5: Offers (create, decline)

**Files:**
- Create: `server/src/models/offer.js`
- Test: `server/test/offer.test.js`

**Interfaces:**
- Consumes: `listings` rows from Task 4
- Produces: `createOffer(db, { listingId, buyerId, offerPriceCents }) -> { offerId }`;
  `declineOffer(db, offerId) -> void`, which sets the offer's status to `'declined'`
  and leaves the listing's status untouched (still `'open'`)

- [ ] **Step 1: Write the failing test**

```js
test('declineOffer leaves the listing open for further offers', () => {
  const { offerId } = createOffer(db, { listingId, buyerId: 'b1', offerPriceCents: 1200 });
  declineOffer(db, offerId);
  const offer = db.prepare('SELECT status FROM offers WHERE id = ?').get(offerId);
  const listing = db.prepare('SELECT status FROM listings WHERE id = ?').get(listingId);
  assert.strictEqual(offer.status, 'declined');
  assert.strictEqual(listing.status, 'open');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/test/offer.test.js`
Expected: FAIL (function not defined)

- [ ] **Step 3: Implement `createOffer` and `declineOffer` in `server/src/models/offer.js`**

`createOffer` inserts with `status: 'pending'`; reject (throw `ListingNotOpenError`)
if the listing's status is not `'open'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/test/offer.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/models/offer.js server/test/offer.test.js
git commit -m "feat: create and decline offers"
```

---

## Task 6: Fee engine

**Files:**
- Create: `server/src/services/feeEngine.js`
- Test: `server/test/feeEngine.test.js`

**Interfaces:**
- Produces: `computeFee({ salePriceCents, unitCostCents, feeRatePercent }) -> { profitCents, feeCents, netToSellerCents }`

- [ ] **Step 1: Write the failing test**

```js
test('computeFee charges 0 on a loss', () => {
  const r = computeFee({ salePriceCents: 800, unitCostCents: 1000, feeRatePercent: 20 });
  assert.strictEqual(r.profitCents, -200);
  assert.strictEqual(r.feeCents, 0);
  assert.strictEqual(r.netToSellerCents, 800);
});

test('computeFee charges feeRatePercent of profit only', () => {
  const r = computeFee({ salePriceCents: 1500, unitCostCents: 1000, feeRatePercent: 20 });
  assert.strictEqual(r.profitCents, 500);
  assert.strictEqual(r.feeCents, 100);
  assert.strictEqual(r.netToSellerCents, 1400);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/test/feeEngine.test.js`
Expected: FAIL (function not defined)

- [ ] **Step 3: Implement `computeFee` in `server/src/services/feeEngine.js`**

`profitCents = salePriceCents - unitCostCents`. `feeCents = profitCents > 0 ? Math.round(profitCents * feeRatePercent / 100) : 0`. `netToSellerCents = salePriceCents - feeCents`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/test/feeEngine.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/services/feeEngine.js server/test/feeEngine.test.js
git commit -m "feat: profit-contingent fee engine, 0% on loss"
```

---

## Task 7: Accept offer -> sale (simulated fulfillment)

**Files:**
- Create: `server/src/models/sale.js`
- Modify: `server/src/models/offer.js` (add `acceptOffer`)
- Test: `server/test/sale.test.js`

**Interfaces:**
- Consumes: `computeFee` from Task 6; `offers`/`listings` from Tasks 4-5
- Produces: `acceptOffer(db, offerId, { feeRatePercent }) -> Sale` where `Sale = { id, saleId, salePriceCents, unitCostCents, profitCents, feeCents, netToSellerCents, status: 'fulfilled' }`; throws `OfferNotPendingError` if the offer or its listing is no longer open/pending

- [ ] **Step 1: Write the failing test**

```js
test('acceptOffer rejects a double-accept on an already-sold listing', () => {
  acceptOffer(db, offerId, { feeRatePercent: 20 });
  assert.throws(() => acceptOffer(db, offerId, { feeRatePercent: 20 }), /OfferNotPendingError/);
});

test('acceptOffer produces a fulfilled sale with fee applied', () => {
  const sale = acceptOffer(db, offerId, { feeRatePercent: 20 });
  assert.strictEqual(sale.status, 'fulfilled');
  assert.ok(sale.feeCents >= 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/test/sale.test.js`
Expected: FAIL (function not defined)

- [ ] **Step 3: Implement `acceptOffer` (in `offer.js`) and the `sales` insert (in `sale.js`)**

In one `db.transaction(...)`: re-check the offer is `'pending'` and its listing is
`'open'` (else throw `OfferNotPendingError`); call `computeFee` using the offer's
`offer_price_cents` as `salePriceCents` and the holding's `unit_cost_cents`; insert
the `sales` row with `status: 'fulfilled'`; set the offer's status to `'accepted'`
and the listing's status to `'sold'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/test/sale.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/models/sale.js server/src/models/offer.js server/test/sale.test.js
git commit -m "feat: accept offer into a fulfilled, fee-settled sale"
```

---

## Task 8: API routes + end-to-end integration test

**Files:**
- Create: `server/src/app.js`, `server/src/server.js`, `server/src/routes/products.js`, `server/src/routes/inventory.js`, `server/src/routes/listings.js`, `server/src/routes/offers.js`
- Test: `server/test/api.test.js`

**Interfaces:**
- Consumes: every model/service from Tasks 1-7
- Produces: `GET /products`, `POST /inventory`, `POST /listings`, `POST /offers`, `POST /offers/:id/accept`, `POST /offers/:id/decline`, each thin wrappers returning the underlying function's result as JSON, mapping thrown `*Error`s to HTTP 400

- [ ] **Step 1: Write the failing test**

```js
test('full loop: buy, list, offer, accept returns a fulfilled sale over HTTP', async () => {
  const app = buildApp(testDb);
  const buy = await request(app).post('/inventory').send({ userId: 'u1', productId, quantity: 1 });
  const listing = await request(app).post('/listings').send({ holdingId: buy.body.holdingId, askingPriceCents: 1500 });
  const offer = await request(app).post('/offers').send({ listingId: listing.body.listingId, buyerId: 'b1', offerPriceCents: 1500 });
  const sale = await request(app).post(`/offers/${offer.body.offerId}/accept`).send({});
  assert.strictEqual(sale.status, 200);
  assert.strictEqual(sale.body.status, 'fulfilled');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/test/api.test.js`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `buildApp(db)` in `app.js` and the five routes**

Each route parses the body, calls the matching Task 1-7 function, and either
returns `res.json(result)` or catches a named error and returns
`res.status(400).json({ error: err.message })`. `server.js` just calls
`buildApp(getDb('ball-in.db'))` and `app.listen(...)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/test/api.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/app.js server/src/server.js server/src/routes server/test/api.test.js
git commit -m "feat: wire API routes, full loop passes end to end"
```

---

## Task 9: Minimal frontend

**Files:**
- Create: `web/` (Vite + React scaffold), `web/src/App.jsx`, `web/src/api.js`
- Manual verification only (no automated UI tests in this plan — see Non-goals)

**Interfaces:**
- Consumes: the Task 8 HTTP API

- [ ] **Step 1: Scaffold Vite React app in `web/`**

Run: `npm create vite@latest web -- --template react`

- [ ] **Step 2: Implement `web/src/api.js` thin fetch wrappers**

One function per Task 8 route (`buyIntoInventory`, `createListing`, `createOffer`,
`acceptOffer`, `declineOffer`, `getProducts`), each a `fetch` call returning parsed JSON.

- [ ] **Step 3: Implement `web/src/App.jsx` with four screens**

Pool/product view (current pool quantity + tier price), inventory view (your held
units), listing/offer view (list, submit offer, accept/decline), and a sale-result
view showing `profitCents` / `feeCents` / `netToSellerCents` from the last accepted
sale — this is the screen that makes the profit-contingent fee visible on camera.

- [ ] **Step 4: Manually verify the full loop in the browser**

Run: `npm run dev` in both `server/` and `web/`; walk the buy -> list -> offer ->
accept loop once with a profit and once with a loss; confirm the fee shown is 0 on
the loss run.

- [ ] **Step 5: Commit**

```bash
git add web
git commit -m "feat: minimal frontend for the full demo loop"
```

---

## Task 10: Kiro scaffolding and write-up material

**Files:**
- Create: `.kiro/steering/business-rules.md`, `.kiro/hooks/` (one hook config), `README.md` (Kiro usage section), `LICENSE`

**Interfaces:**
- Consumes: nothing (documentation/config task)
- Produces: the `/.kiro` directory the hackathon requires at repo root

- [ ] **Step 1: Write `.kiro/steering/business-rules.md`**

Document, as steering content Kiro reads: the bulk-tier pricing rule (pool
quantity determines unit cost, boundary inclusive), the fee rule (0% fee on a
loss, `feeRatePercent` of profit otherwise, computed in integer cents), and the
single-category constraint — so any Kiro-generated code stays consistent with
Task 1-7's actual implementation.

- [ ] **Step 2: Configure one Kiro agent hook**

Set up a hook that runs `node --test server/test/*.test.js` on save of any file
under `server/src/`, so Kiro-assisted edits get immediate test feedback.

- [ ] **Step 3: Write the Kiro-usage section of `README.md`**

Cover, in plain prose for the judges: which Kiro surfaces were used (IDE/CLI),
what the steering doc encodes and why, what the hook automates, and whether specs
or MCP were used — fill in honestly once the build is actually done, don't
pre-write claims ahead of the real workflow.

- [ ] **Step 4: Add an OSS `LICENSE` file and surface it on GitHub**

Pick a license (MIT is the simplest fit here), add the standard `LICENSE` text at
repo root, and confirm on github.com/GoldenSyrup1/Ball_In that the About section
shows it — the hackathon requires this to be detectable, not just present.

- [ ] **Step 5: Verify `.kiro` is tracked, not ignored**

Run: `git check-ignore -v .kiro/steering/business-rules.md`
Expected: no output (not ignored). If anything is printed, fix `.gitignore`.

- [ ] **Step 6: Commit**

```bash
git add .kiro README.md LICENSE
git commit -m "docs: kiro steering, hook, license, and write-up material"
```
