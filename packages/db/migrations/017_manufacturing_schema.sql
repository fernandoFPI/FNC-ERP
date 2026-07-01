-- All cross-epoch refs stored as plain UUID — fnc_app lacks REFERENCES privilege
-- on pre-existing tables (products, stock_locations, analytic_accounts, journal_entries, stock_moves)

-- ── WORK CENTERS ──────────────────────────────────────────────
CREATE TABLE work_centers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50),
  cost_per_hour NUMERIC(20,4) NOT NULL DEFAULT 0,
  currency_code CHAR(3) NOT NULL DEFAULT 'IQD',
  capacity_hours_per_day NUMERIC(6,2) NOT NULL DEFAULT 8,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, code)
);

-- ── BILL OF MATERIALS ─────────────────────────────────────────
CREATE TABLE boms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL,
  finished_product_id UUID NOT NULL,  -- no FK; ref to products
  version VARCHAR(20) NOT NULL DEFAULT '1.0',
  name VARCHAR(255),
  qty_produced NUMERIC(20,4) NOT NULL DEFAULT 1,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, finished_product_id, version)
);

-- ── BOM LINES ─────────────────────────────────────────────────
CREATE TABLE bom_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bom_id UUID NOT NULL REFERENCES boms(id) ON DELETE CASCADE,
  component_product_id UUID NOT NULL,  -- no FK; ref to products
  qty_required NUMERIC(20,4) NOT NULL CHECK (qty_required > 0),
  uom VARCHAR(20) NOT NULL DEFAULT 'unit',
  work_center_id UUID REFERENCES work_centers(id),
  operation_time_hours NUMERIC(8,4),
  sequence INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

-- ── MANUFACTURING ORDERS ───────────────────────────────────────
CREATE TABLE manufacturing_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL,
  mo_number VARCHAR(50) NOT NULL,
  bom_id UUID NOT NULL REFERENCES boms(id),
  finished_product_id UUID NOT NULL,       -- no FK; ref to products
  project_id UUID REFERENCES projects(id),
  analytic_account_id UUID,                -- no FK; ref to analytic_accounts
  qty_planned NUMERIC(20,4) NOT NULL CHECK (qty_planned > 0),
  qty_produced NUMERIC(20,4) NOT NULL DEFAULT 0,
  dispatch_type VARCHAR(20) NOT NULL DEFAULT 'warehouse_first'
    CHECK (dispatch_type IN ('direct_to_site','warehouse_first')),
  destination_location_id UUID,            -- no FK; ref to stock_locations
  status VARCHAR(30) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','confirmed','in_progress','completed','cancelled')),
  scheduled_start DATE,
  scheduled_end DATE,
  actual_start TIMESTAMPTZ,
  actual_end TIMESTAMPTZ,
  planned_cost NUMERIC(20,4) NOT NULL DEFAULT 0,
  actual_cost NUMERIC(20,4) NOT NULL DEFAULT 0,
  currency_code CHAR(3) NOT NULL DEFAULT 'IQD',
  journal_entry_id UUID,                   -- no FK; ref to journal_entries
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, mo_number)
);

-- ── MO MATERIAL CONSUMPTION ────────────────────────────────────
CREATE TABLE mo_consumptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mo_id UUID NOT NULL REFERENCES manufacturing_orders(id) ON DELETE CASCADE,
  component_product_id UUID NOT NULL,  -- no FK; ref to products
  bom_line_id UUID REFERENCES bom_lines(id),
  qty_planned NUMERIC(20,4) NOT NULL,
  qty_consumed NUMERIC(20,4) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(20,4) NOT NULL DEFAULT 0,
  total_cost NUMERIC(20,4) NOT NULL DEFAULT 0,
  stock_move_id UUID,                  -- no FK; ref to stock_moves
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── MO WORK CENTER TIME ────────────────────────────────────────
CREATE TABLE mo_work_center_time (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mo_id UUID NOT NULL REFERENCES manufacturing_orders(id) ON DELETE CASCADE,
  work_center_id UUID NOT NULL REFERENCES work_centers(id),
  planned_hours NUMERIC(8,4) NOT NULL DEFAULT 0,
  actual_hours NUMERIC(8,4) NOT NULL DEFAULT 0,
  cost_per_hour NUMERIC(20,4) NOT NULL,
  total_cost NUMERIC(20,4) NOT NULL DEFAULT 0,
  recorded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
