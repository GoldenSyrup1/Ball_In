CREATE TABLE IF NOT EXISTS suppliers (
  id   INTEGER PRIMARY KEY,
  name TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id       INTEGER PRIMARY KEY,
  name     TEXT    NOT NULL,
  category TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS bulk_tiers (
  id              INTEGER PRIMARY KEY,
  product_id      INTEGER NOT NULL REFERENCES products(id),
  supplier_id     INTEGER NOT NULL REFERENCES suppliers(id),
  min_qty         INTEGER NOT NULL CHECK(min_qty >= 0),
  unit_cost_cents INTEGER NOT NULL CHECK(unit_cost_cents >= 1)
);

CREATE TABLE IF NOT EXISTS inventory_holdings (
  id              INTEGER PRIMARY KEY,
  user_id         TEXT    NOT NULL,
  product_id      INTEGER NOT NULL REFERENCES products(id),
  quantity        INTEGER NOT NULL CHECK(quantity >= 0),
  unit_cost_cents INTEGER NOT NULL CHECK(unit_cost_cents >= 1),
  created_at      TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS listings (
  id                 INTEGER PRIMARY KEY,
  holding_id         INTEGER NOT NULL REFERENCES inventory_holdings(id),
  asking_price_cents INTEGER NOT NULL CHECK(asking_price_cents >= 1),
  status             TEXT    NOT NULL CHECK(status IN ('open','sold','cancelled')),
  created_at         TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS offers (
  id                INTEGER PRIMARY KEY,
  listing_id        INTEGER NOT NULL REFERENCES listings(id),
  buyer_id          TEXT    NOT NULL,
  offer_price_cents INTEGER NOT NULL CHECK(offer_price_cents >= 1),
  status            TEXT    NOT NULL CHECK(status IN ('pending','accepted','declined')),
  created_at        TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS sales (
  id                  INTEGER PRIMARY KEY,
  offer_id            INTEGER NOT NULL REFERENCES offers(id),
  sale_price_cents    INTEGER NOT NULL CHECK(sale_price_cents >= 1),
  unit_cost_cents     INTEGER NOT NULL CHECK(unit_cost_cents >= 1),
  profit_cents        INTEGER NOT NULL,
  fee_cents           INTEGER NOT NULL CHECK(fee_cents >= 0),
  net_to_seller_cents INTEGER NOT NULL,
  status              TEXT    NOT NULL CHECK(status IN ('fulfilled')),
  created_at          TEXT    NOT NULL
);
