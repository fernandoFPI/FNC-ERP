-- ── PRODUCTS ──────────────────────────────────────────────────
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sku VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  uom VARCHAR(20) NOT NULL DEFAULT 'unit',
  valuation_method VARCHAR(20) NOT NULL DEFAULT 'avco'
    CHECK (valuation_method IN ('avco','fifo','standard')),
  standard_cost NUMERIC(20,4) NOT NULL DEFAULT 0,
  average_cost NUMERIC(20,4) NOT NULL DEFAULT 0,
  reorder_point NUMERIC(20,4),
  reorder_qty NUMERIC(20,4),
  is_storable BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, sku)
);

-- ── STOCK LOCATIONS ────────────────────────────────────────────
CREATE TABLE stock_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50),
  type VARCHAR(20) NOT NULL DEFAULT 'warehouse'
    CHECK (type IN ('warehouse','site','transit','virtual_in','virtual_out')),
  parent_id UUID REFERENCES stock_locations(id),
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, code)
);

-- ── STOCK LOTS ────────────────────────────────────────────────
CREATE TABLE stock_lots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id),
  lot_number VARCHAR(100) NOT NULL,
  expiry_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, lot_number)
);

-- ── STOCK MOVES ───────────────────────────────────────────────
-- Immutable append-only ledger. Never update or delete.
CREATE TABLE stock_moves (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  lot_id UUID REFERENCES stock_lots(id),
  from_location_id UUID NOT NULL REFERENCES stock_locations(id),
  to_location_id UUID NOT NULL REFERENCES stock_locations(id),
  qty NUMERIC(20,4) NOT NULL CHECK (qty > 0),
  unit_cost NUMERIC(20,4) NOT NULL DEFAULT 0,
  total_cost NUMERIC(20,4) NOT NULL DEFAULT 0,
  currency_code CHAR(3) NOT NULL DEFAULT 'IQD',
  source_type VARCHAR(50),
  source_id UUID,
  notes TEXT,
  moved_by UUID REFERENCES users(id),
  moved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── STOCK BALANCES ────────────────────────────────────────────
-- Materialized running balance, updated by trigger on stock_moves insert.
CREATE TABLE stock_balances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id),
  location_id UUID NOT NULL REFERENCES stock_locations(id),
  lot_id UUID REFERENCES stock_lots(id),
  qty_on_hand NUMERIC(20,4) NOT NULL DEFAULT 0,
  qty_reserved NUMERIC(20,4) NOT NULL DEFAULT 0,
  average_cost NUMERIC(20,4) NOT NULL DEFAULT 0,
  last_move_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, location_id, lot_id)
);

-- Add FK from po_receipts to stock_locations (now that the table exists)
ALTER TABLE po_receipts
  ADD CONSTRAINT fk_po_receipts_location
  FOREIGN KEY (warehouse_location_id) REFERENCES stock_locations(id);

-- ── STOCK BALANCE TRIGGER ─────────────────────────────────────
CREATE OR REPLACE FUNCTION update_stock_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- Deduct from source location
  INSERT INTO stock_balances (product_id, location_id, lot_id, qty_on_hand, average_cost, last_move_at, updated_at)
  VALUES (NEW.product_id, NEW.from_location_id, NEW.lot_id, -NEW.qty, NEW.unit_cost, NEW.moved_at, NOW())
  ON CONFLICT (product_id, location_id, lot_id)
  DO UPDATE SET
    qty_on_hand = stock_balances.qty_on_hand - NEW.qty,
    last_move_at = NEW.moved_at,
    updated_at = NOW();

  -- Add to destination location with weighted average cost recalculation
  INSERT INTO stock_balances (product_id, location_id, lot_id, qty_on_hand, average_cost, last_move_at, updated_at)
  VALUES (NEW.product_id, NEW.to_location_id, NEW.lot_id, NEW.qty, NEW.unit_cost, NEW.moved_at, NOW())
  ON CONFLICT (product_id, location_id, lot_id)
  DO UPDATE SET
    average_cost = CASE
      WHEN (stock_balances.qty_on_hand + NEW.qty) > 0
      THEN ((stock_balances.qty_on_hand * stock_balances.average_cost) + (NEW.qty * NEW.unit_cost))
           / (stock_balances.qty_on_hand + NEW.qty)
      ELSE NEW.unit_cost
    END,
    qty_on_hand = stock_balances.qty_on_hand + NEW.qty,
    last_move_at = NEW.moved_at,
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_stock_balance
  AFTER INSERT ON stock_moves
  FOR EACH ROW EXECUTE FUNCTION update_stock_balance();
