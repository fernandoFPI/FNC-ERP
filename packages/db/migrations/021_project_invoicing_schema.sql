-- ── INTERCO PRICING SETTINGS (companies table) ───────────────
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS interco_transfer_pricing_method VARCHAR(20)
    NOT NULL DEFAULT 'avco'
    CHECK (interco_transfer_pricing_method IN ('avco','cost_plus','market','standard')),
  ADD COLUMN IF NOT EXISTS interco_cost_plus_markup_pct NUMERIC(5,4)
    NOT NULL DEFAULT 0
    CHECK (interco_cost_plus_markup_pct >= 0);

-- ── PROJECT CONTRACTS ──────────────────────────────────────────
CREATE TABLE project_contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contract_number VARCHAR(100) NOT NULL,
  contract_name VARCHAR(255) NOT NULL,
  client_name VARCHAR(255) NOT NULL,
  client_contact TEXT,
  contract_value NUMERIC(20,4) NOT NULL CHECK (contract_value > 0),
  currency_code CHAR(3) NOT NULL DEFAULT 'IQD',
  default_billing_method VARCHAR(20) NOT NULL DEFAULT 'milestone'
    CHECK (default_billing_method IN ('milestone','progress','cost_plus','fixed_lump_sum')),
  default_margin_pct NUMERIC(5,4) NOT NULL DEFAULT 0,
  payment_terms_days INTEGER NOT NULL DEFAULT 30,
  retention_pct NUMERIC(5,4) NOT NULL DEFAULT 0,
  contract_date DATE NOT NULL,
  start_date DATE,
  end_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','completed','cancelled')),
  contract_doc_path VARCHAR(500),
  notes TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, contract_number)
);

-- ── PROJECT MILESTONES ─────────────────────────────────────────
CREATE TABLE project_milestones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id UUID NOT NULL REFERENCES project_contracts(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage_id UUID REFERENCES project_stages(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  sequence INTEGER NOT NULL DEFAULT 0,
  billable_amount NUMERIC(20,4) NOT NULL CHECK (billable_amount > 0),
  currency_code CHAR(3) NOT NULL DEFAULT 'IQD',
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','reached','invoiced','cancelled')),
  reached_at TIMESTAMPTZ,
  reached_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── PROJECT INVOICES ───────────────────────────────────────────
CREATE TABLE project_invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id UUID NOT NULL REFERENCES project_contracts(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_number VARCHAR(100) NOT NULL,
  billing_method VARCHAR(20) NOT NULL
    CHECK (billing_method IN ('milestone','progress','cost_plus','fixed_lump_sum')),
  progress_pct NUMERIC(5,2),
  previous_progress_pct NUMERIC(5,2) DEFAULT 0,
  display_mode VARCHAR(20) NOT NULL DEFAULT 'summarised'
    CHECK (display_mode IN ('summarised','detailed')),
  subtotal NUMERIC(20,4) NOT NULL DEFAULT 0,
  margin_total NUMERIC(20,4) NOT NULL DEFAULT 0,
  gross_total NUMERIC(20,4) NOT NULL DEFAULT 0,
  retention_amount NUMERIC(20,4) NOT NULL DEFAULT 0,
  net_payable NUMERIC(20,4) NOT NULL DEFAULT 0,
  currency_code CHAR(3) NOT NULL DEFAULT 'IQD',
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','review','approved','issued','partial','paid','cancelled')),
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,
  journal_entry_id UUID REFERENCES journal_entries(id),
  pdf_path VARCHAR(500),
  pdf_generated_at TIMESTAMPTZ,
  issued_by UUID REFERENCES users(id),
  issued_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, invoice_number)
);

-- ── PROJECT INVOICE LINES ──────────────────────────────────────
CREATE TABLE project_invoice_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES project_invoices(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  description VARCHAR(500) NOT NULL,
  source_type VARCHAR(30) NOT NULL
    CHECK (source_type IN (
      'manufacturing_order','purchase_order','payroll',
      'rental','stock_issue','milestone','manual'
    )),
  source_id UUID,
  mo_display_mode VARCHAR(20) DEFAULT 'summarised'
    CHECK (mo_display_mode IN ('summarised','detailed')),
  qty NUMERIC(20,4) NOT NULL DEFAULT 1,
  unit_cost NUMERIC(20,4) NOT NULL DEFAULT 0,
  subtotal NUMERIC(20,4) NOT NULL DEFAULT 0,
  margin_pct NUMERIC(5,4) NOT NULL DEFAULT 0,
  margin_amount NUMERIC(20,4) NOT NULL DEFAULT 0,
  line_total NUMERIC(20,4) NOT NULL DEFAULT 0,
  currency_code CHAR(3) NOT NULL DEFAULT 'IQD',
  mo_components JSONB,
  is_invoiced BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(invoice_id, line_number)
);

-- ── PROJECT MATERIAL ISSUES ────────────────────────────────────
CREATE TABLE project_material_issues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  issue_number VARCHAR(100) NOT NULL,
  issue_date DATE NOT NULL,
  notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','issued','cancelled')),
  issued_by UUID REFERENCES users(id),
  issued_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, issue_number)
);

-- ── PROJECT MATERIAL ISSUE LINES ──────────────────────────────
CREATE TABLE project_material_issue_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  issue_id UUID NOT NULL REFERENCES project_material_issues(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  lot_id UUID REFERENCES stock_lots(id),
  from_location_id UUID NOT NULL REFERENCES stock_locations(id),
  to_location_id UUID NOT NULL REFERENCES stock_locations(id),
  qty_issued NUMERIC(20,4) NOT NULL CHECK (qty_issued > 0),
  unit_cost NUMERIC(20,4) NOT NULL DEFAULT 0,
  total_cost NUMERIC(20,4) NOT NULL DEFAULT 0,
  stock_move_id UUID REFERENCES stock_moves(id),
  is_invoiced BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── PROJECT INVOICE PAYMENTS ──────────────────────────────────
CREATE TABLE project_invoice_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES project_invoices(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL,
  amount NUMERIC(20,4) NOT NULL CHECK (amount > 0),
  currency_code CHAR(3) NOT NULL DEFAULT 'IQD',
  payment_reference VARCHAR(255),
  payment_method VARCHAR(50),
  journal_entry_id UUID REFERENCES journal_entries(id),
  notes TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── ADD is_invoiced FLAGS TO SOURCE TABLES ────────────────────
ALTER TABLE manufacturing_orders
  ADD COLUMN IF NOT EXISTS is_invoiced BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE po_receipts
  ADD COLUMN IF NOT EXISTS is_invoiced BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE rental_invoices
  ADD COLUMN IF NOT EXISTS is_invoiced BOOLEAN NOT NULL DEFAULT false;
