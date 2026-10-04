CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  shape TEXT NOT NULL,
  sizes BOOLEAN NOT NULL DEFAULT FALSE,
  price_cents INTEGER NOT NULL,        -- precio al público (IVA incluido o no: pendiente de asesor)
  commission_cents INTEGER NOT NULL,   -- importe fijo que va al objetivo del vendedor
  cost_cents INTEGER NOT NULL,         -- coste estimado producto+envío (solo propietario)
  supplier_ref TEXT,                   -- id interno del proveedor (solo servidor)
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS entities (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL DEFAULT 'colegio',
  name TEXT NOT NULL,
  legal_name TEXT, tax_id TEXT, address TEXT, city TEXT,
  contact_name TEXT, contact_role TEXT,
  email TEXT UNIQUE NOT NULL, phone TEXT, iban TEXT,
  password_hash TEXT NOT NULL,
  goal_title TEXT NOT NULL DEFAULT '',
  goal_cents INTEGER NOT NULL DEFAULT 15000,
  color TEXT NOT NULL DEFAULT '#2748E8',
  color2 TEXT NOT NULL DEFAULT '#FFC53D',
  logo TEXT, hero TEXT,
  product_ids TEXT NOT NULL DEFAULT 'camiseta',
  status TEXT NOT NULL DEFAULT 'active',     -- active | suspended
  accepted_terms_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sellers (
  id SERIAL PRIMARY KEY,
  entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  group_name TEXT,
  minor BOOLEAN NOT NULL DEFAULT FALSE,
  tutor_name TEXT, tutor_email TEXT, tutor_phone TEXT,
  consent BOOLEAN NOT NULL DEFAULT FALSE,
  goal_title TEXT, goal_cents INTEGER,
  thanks TEXT, photo TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sellers_entity ON sellers(entity_id);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  public_id TEXT UNIQUE NOT NULL,
  entity_id INTEGER NOT NULL REFERENCES entities(id),
  seller_id INTEGER NOT NULL REFERENCES sellers(id),
  buyer_name TEXT NOT NULL, buyer_email TEXT NOT NULL, buyer_phone TEXT,
  ship_address TEXT NOT NULL, ship_city TEXT NOT NULL, ship_zip TEXT NOT NULL,
  ship_country TEXT NOT NULL DEFAULT 'ES',
  items JSONB NOT NULL,                  -- [{id,name,size,qty,price_cents,commission_cents,cost_cents}]
  total_cents INTEGER NOT NULL,
  seller_cents INTEGER NOT NULL,         -- va al objetivo del vendedor
  cost_cents INTEGER NOT NULL,           -- coste estimado
  status TEXT NOT NULL DEFAULT 'pending',-- pending | paid | refunded | failed
  stripe_session TEXT, stripe_payment_intent TEXT, stripe_fee_cents INTEGER,
  supplier_status TEXT NOT NULL DEFAULT 'none', -- none | sent | error | dry
  supplier_order_id TEXT, supplier_error TEXT, supplier_cost_cents INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS orders_entity ON orders(entity_id, status);
CREATE INDEX IF NOT EXISTS orders_seller ON orders(seller_id, status);

CREATE TABLE IF NOT EXISTS payouts (
  id SERIAL PRIMARY KEY,
  entity_id INTEGER NOT NULL REFERENCES entities(id),
  amount_cents INTEGER NOT NULL,
  iban TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested', -- requested | paid | rejected
  note TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  role TEXT NOT NULL,               -- entity | owner
  entity_id INTEGER,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY, value TEXT NOT NULL
);

ALTER TABLE sellers ADD COLUMN IF NOT EXISTS private_token TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS buyer_sign TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS buyer_message TEXT;
