-- ── CHART OF ACCOUNTS ──────────────────────────────────────────
CREATE TABLE chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(255) NOT NULL,
  account_type VARCHAR(50) NOT NULL
    CHECK (account_type IN ('asset','liability','equity','revenue','expense')),
  parent_id UUID REFERENCES chart_of_accounts(id),
  currency_code CHAR(3) NOT NULL DEFAULT 'IQD',
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_reconcilable BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, code)
);

-- ── COST CENTERS ───────────────────────────────────────────────
CREATE TABLE cost_centers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL
    CHECK (type IN ('department','project','entity','overhead')),
  parent_id UUID REFERENCES cost_centers(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, code)
);

-- ── ANALYTIC ACCOUNTS ──────────────────────────────────────────
CREATE TABLE analytic_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(255) NOT NULL,
  cost_center_id UUID REFERENCES cost_centers(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, code)
);

-- ── FX RATES ──────────────────────────────────────────────────
CREATE TABLE fx_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_currency CHAR(3) NOT NULL,
  to_currency CHAR(3) NOT NULL,
  rate NUMERIC(20,6) NOT NULL CHECK (rate > 0),
  rate_date DATE NOT NULL,
  source VARCHAR(50) NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(from_currency, to_currency, rate_date)
);

-- ── JOURNAL ENTRIES ────────────────────────────────────────────
CREATE TABLE journal_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  reference VARCHAR(100) NOT NULL,
  description TEXT,
  entry_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','posted','cancelled')),
  source_type VARCHAR(50),
  source_id UUID,
  created_by UUID NOT NULL REFERENCES users(id),
  posted_at TIMESTAMPTZ,
  posted_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── JOURNAL LINES ─────────────────────────────────────────────
CREATE TABLE journal_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES chart_of_accounts(id),
  analytic_account_id UUID REFERENCES analytic_accounts(id),
  cost_center_id UUID REFERENCES cost_centers(id),
  description TEXT,
  debit NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  currency_code CHAR(3) NOT NULL DEFAULT 'IQD',
  fx_rate NUMERIC(20,6) NOT NULL DEFAULT 1,
  amount_company_currency NUMERIC(20,4) NOT NULL,
  CHECK (
    (debit > 0 AND credit = 0) OR
    (credit > 0 AND debit = 0)
  )
);

-- ── ACCOUNTING PERIODS ────────────────────────────────────────
CREATE TABLE accounting_periods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','closing','closed')),
  closed_by UUID REFERENCES users(id),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, start_date)
);
