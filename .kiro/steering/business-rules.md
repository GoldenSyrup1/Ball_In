---
inclusion: always
---

# Ball-In Business Rules

These rules govern every spec, design decision, and line of code in this repository. When any implementation detail conflicts with what is written here, these rules take precedence.

---

## 1. Project Scope

Ball-In is a **single-category bulk-buy marketplace demo**. The scope is fixed:

- Exactly one product category.
- A small, fixed set of mock suppliers with fixed bulk-price tiers.
- No live or competing supplier pricing.
- No multi-category catalog.
- No real payments or real delivery.

Do not design or implement features that reach outside this scope without an explicit scope-change decision.

---

## 2. Money Representation

All monetary values — prices, costs, fees, profits, payouts — are stored and computed as **integer cents**. Never use floats for money at any layer (database columns, API payloads, in-memory calculations). When a division or percentage calculation produces a non-integer, apply standard rounding (`round()`, i.e. half-up) and keep the result as an integer.

---

## 3. Bulk-Tier Pricing

When a buyer purchases units into their inventory, the unit cost is determined by the **pool quantity** for that product after the purchase is added.

**Pool quantity** = sum of all existing inventory holdings for that product across all buyers, plus the quantity being purchased now.

**Tier selection rule:** choose the tier with the highest `min_qty` that is ≤ the pool quantity. Hitting a tier's `min_qty` exactly qualifies for that tier (the boundary is inclusive).

```
applicable_tier = max(t for t in tiers if t.min_qty <= pool_qty_after)
unit_cost_cents = applicable_tier.unit_cost_cents
```

Each tier has exactly two fields: `min_qty` (integer) and `unit_cost_cents` (integer). There must always be a base tier with `min_qty = 1` (or `0`) to guarantee a tier is always found.

---

## 4. Profit-Contingent Fee

When a sale settles, the platform calculates its fee as follows:

```
profit_cents = sale_price_cents - unit_cost_cents

if profit_cents <= 0:
    fee_cents = 0          # no fee on a loss or break-even
else:
    fee_cents = round(profit_cents * feeRatePercent / 100)

net_to_seller_cents = sale_price_cents - fee_cents
```

- `feeRatePercent` is a configuration value (not hard-coded per product).
- `profit_cents <= 0` always produces `fee_cents = 0`; the seller is never charged a fee on a losing sale.
- `net_to_seller_cents` is what the seller actually receives; it is always ≥ `sale_price_cents` when there is no fee (i.e., equal to `sale_price_cents` on a loss).

---

## 5. Summary of Key Formulas

| Concept | Formula |
|---|---|
| Pool quantity | `sum(all holdings for product) + purchase_qty` |
| Applicable tier | `max tier where tier.min_qty <= pool_qty_after` |
| Unit cost | `applicable_tier.unit_cost_cents` |
| Profit | `sale_price_cents - unit_cost_cents` |
| Fee | `0` if `profit_cents <= 0`, else `round(profit_cents * feeRatePercent / 100)` |
| Net to seller | `sale_price_cents - fee_cents` |
