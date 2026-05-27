CREATE SCHEMA IF NOT EXISTS "__SCHEMA__";

CREATE TABLE IF NOT EXISTS "__SCHEMA__".settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "__SCHEMA__".products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode TEXT NOT NULL,
  name TEXT NOT NULL,
  name_normalized TEXT NOT NULL DEFAULT '',
  price DECIMAL(12, 2) NOT NULL,
  mrp DECIMAL(12, 2),
  selling_price DECIMAL(12, 2),
  unit TEXT NOT NULL DEFAULT 'pcs',
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  batch_no TEXT NOT NULL DEFAULT '',
  expiry_date DATE,
  pack_size INTEGER NOT NULL DEFAULT 1,
  num_boxes INTEGER NOT NULL DEFAULT 1,
  strips_per_box INTEGER NOT NULL DEFAULT 1,
  tablets_per_strip INTEGER NOT NULL DEFAULT 1,
  quantity_on_hand INTEGER NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  reorder_level INTEGER NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  cost_price DECIMAL(12, 2),
  dealer_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT products_barcode_unique UNIQUE (barcode)
);

CREATE INDEX IF NOT EXISTS idx_products_name ON "__SCHEMA__".products (name);
CREATE INDEX IF NOT EXISTS idx_products_name_normalized ON "__SCHEMA__".products (name_normalized);

CREATE TABLE IF NOT EXISTS "__SCHEMA__".customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_name ON "__SCHEMA__".customers (name);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone_unique ON "__SCHEMA__".customers (phone)
  WHERE phone <> '';

CREATE TABLE IF NOT EXISTS "__SCHEMA__".invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES "__SCHEMA__".customers (id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_email TEXT NOT NULL DEFAULT '',
  created_by_name TEXT NOT NULL DEFAULT '',
  subtotal DECIMAL(12, 2) NOT NULL,
  tax DECIMAL(12, 2) NOT NULL DEFAULT 0,
  total DECIMAL(12, 2) NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  whatsapp_message_id TEXT,
  whatsapp_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invoices_number_unique UNIQUE (invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_invoices_date ON "__SCHEMA__".invoices (date DESC);

CREATE TABLE IF NOT EXISTS "__SCHEMA__".invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES "__SCHEMA__".invoices (id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES "__SCHEMA__".products (id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  barcode TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(12, 2) NOT NULL,
  unit_cost DECIMAL(12, 2),
  amount DECIMAL(12, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON "__SCHEMA__".invoice_items (invoice_id);

CREATE TABLE IF NOT EXISTS "__SCHEMA__".stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES "__SCHEMA__".products (id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('OPENING', 'STOCK_IN', 'SALE', 'ADJUSTMENT', 'RETURN_IN')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reference_type TEXT NOT NULL DEFAULT 'manual',
  reference_id UUID,
  reference_label TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  dealer_name TEXT NOT NULL DEFAULT '',
  batch_no TEXT NOT NULL DEFAULT '',
  expiry_date DATE,
  cost_price DECIMAL(12, 2),
  mrp DECIMAL(12, 2),
  selling_price DECIMAL(12, 2),
  num_boxes INTEGER NOT NULL DEFAULT 1,
  strips_per_box INTEGER NOT NULL DEFAULT 1,
  tablets_per_strip INTEGER NOT NULL DEFAULT 1,
  created_by_email TEXT NOT NULL DEFAULT '',
  created_by_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product_date ON "__SCHEMA__".stock_movements (product_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON "__SCHEMA__".stock_movements (date DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON "__SCHEMA__".stock_movements (type);
