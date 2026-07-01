-- All cross-epoch refs stored as plain UUID — fnc_app lacks REFERENCES privilege
-- on pre-existing tables (stock_locations, chart_of_accounts, analytic_accounts, journal_entries)

-- ── EQUIPMENT ASSETS ──────────────────────────────────────────
CREATE TABLE equipment_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL,
  asset_number VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  model VARCHAR(255),
  serial_number VARCHAR(255),
  year_of_manufacture INTEGER,
  daily_rate NUMERIC(20,4) NOT NULL DEFAULT 0,
  weekly_rate NUMERIC(20,4),
  monthly_rate NUMERIC(20,4),
  currency_code CHAR(3) NOT NULL DEFAULT 'IQD',
  purchase_cost NUMERIC(20,4),
  purchase_date DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'available'
    CHECK (status IN ('available','rented','maintenance','disposed')),
  current_location_id UUID,   -- no FK; ref to stock_locations
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, asset_number)
);

-- ── RENTAL CONTRACTS ──────────────────────────────────────────
CREATE TABLE rental_contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL,
  contract_number VARCHAR(100) NOT NULL,
  rental_type VARCHAR(20) NOT NULL DEFAULT 'external'
    CHECK (rental_type IN ('external','internal')),
  client_name VARCHAR(255),
  client_contact TEXT,
  to_company_id UUID,           -- no FK; ref to companies (internal rental target)
  project_id UUID REFERENCES projects(id),
  billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly'
    CHECK (billing_cycle IN ('daily','weekly','monthly','fixed')),
  rate_amount NUMERIC(20,4) NOT NULL,
  currency_code CHAR(3) NOT NULL DEFAULT 'IQD',
  start_date DATE NOT NULL,
  end_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','completed','cancelled')),
  revenue_account_id UUID,      -- no FK; ref to chart_of_accounts
  analytic_account_id UUID,     -- no FK; ref to analytic_accounts
  cancel_reason TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, contract_number)
);

-- ── RENTAL CONTRACT LINES ──────────────────────────────────────
CREATE TABLE rental_contract_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id UUID NOT NULL REFERENCES rental_contracts(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES equipment_assets(id),
  qty INTEGER NOT NULL DEFAULT 1,
  daily_rate NUMERIC(20,4) NOT NULL,
  currency_code CHAR(3) NOT NULL DEFAULT 'IQD',
  deployment_location_id UUID   -- no FK; ref to stock_locations
);

-- ── RENTAL INVOICES ────────────────────────────────────────────
CREATE TABLE rental_invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id UUID NOT NULL REFERENCES rental_contracts(id),
  invoice_number VARCHAR(100) NOT NULL,
  billing_period_start DATE NOT NULL,
  billing_period_end DATE NOT NULL,
  days_billed INTEGER NOT NULL,
  amount NUMERIC(20,4) NOT NULL,
  currency_code CHAR(3) NOT NULL DEFAULT 'IQD',
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','issued','paid','cancelled')),
  journal_entry_id UUID,         -- no FK; ref to journal_entries
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(contract_id, billing_period_start, billing_period_end)
);
