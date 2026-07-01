-- ── INTERCO STOCK TRANSFERS ────────────────────────────────────
-- Tracks every cross-entity stock move atomically.
CREATE TABLE interco_stock_transfers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_company_id UUID NOT NULL REFERENCES companies(id),
  to_company_id UUID NOT NULL REFERENCES companies(id),
  source_type VARCHAR(30) NOT NULL DEFAULT 'project_issue'
    CHECK (source_type IN ('project_issue','manual')),
  source_id UUID,
  transfer_number VARCHAR(100) NOT NULL,
  transfer_date DATE NOT NULL,
  notes TEXT,
  pricing_method VARCHAR(20) NOT NULL
    CHECK (pricing_method IN ('avco','cost_plus','market','standard')),
  from_stock_move_id UUID REFERENCES stock_moves(id),
  to_stock_move_id UUID REFERENCES stock_moves(id),
  interco_transaction_id UUID REFERENCES interco_transactions(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','posted','cancelled')),
  initiated_by UUID NOT NULL REFERENCES users(id),
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (from_company_id <> to_company_id),
  UNIQUE(from_company_id, transfer_number)
);

-- ── INTERCO STOCK TRANSFER LINES ──────────────────────────────
CREATE TABLE interco_stock_transfer_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transfer_id UUID NOT NULL REFERENCES interco_stock_transfers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  lot_id UUID REFERENCES stock_lots(id),
  from_location_id UUID NOT NULL REFERENCES stock_locations(id),
  to_location_id UUID NOT NULL REFERENCES stock_locations(id),
  qty NUMERIC(20,4) NOT NULL CHECK (qty > 0),
  avco_at_transfer NUMERIC(20,4) NOT NULL,
  standard_cost_at_transfer NUMERIC(20,4),
  transfer_price NUMERIC(20,4) NOT NULL,
  markup_pct_applied NUMERIC(5,4),
  total_transfer_value NUMERIC(20,4) NOT NULL,
  currency_code CHAR(3) NOT NULL DEFAULT 'IQD',
  from_stock_move_id UUID REFERENCES stock_moves(id),
  to_stock_move_id UUID REFERENCES stock_moves(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── TRANSFER PRICING AUDIT LOG ─────────────────────────────────
CREATE TABLE interco_pricing_config_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id),
  changed_by UUID NOT NULL REFERENCES users(id),
  previous_method VARCHAR(20),
  new_method VARCHAR(20) NOT NULL,
  previous_markup_pct NUMERIC(5,4),
  new_markup_pct NUMERIC(5,4),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── INDEXES ────────────────────────────────────────────────────
CREATE INDEX idx_interco_stock_from_company
  ON interco_stock_transfers(from_company_id, created_at DESC);

CREATE INDEX idx_interco_stock_to_company
  ON interco_stock_transfers(to_company_id, created_at DESC);

CREATE INDEX idx_interco_stock_status
  ON interco_stock_transfers(status)
  WHERE status = 'pending';

CREATE INDEX idx_interco_stock_source
  ON interco_stock_transfers(source_type, source_id);

CREATE INDEX idx_interco_stock_lines_transfer
  ON interco_stock_transfer_lines(transfer_id);

CREATE INDEX idx_interco_stock_lines_product
  ON interco_stock_transfer_lines(product_id);

CREATE INDEX idx_pricing_config_log_company
  ON interco_pricing_config_log(company_id, created_at DESC);
