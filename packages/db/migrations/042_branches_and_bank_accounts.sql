-- ── Company branches / locations ─────────────────────────────────────────────
CREATE TABLE company_branches (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id   UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         VARCHAR(255) NOT NULL,
  address      TEXT,
  city         VARCHAR(100),
  country_code CHAR(2)     NOT NULL DEFAULT 'IQ',
  phone        VARCHAR(50),
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_company_branches_company_id ON company_branches(company_id);

-- ── Universal bank accounts (group-level, no company_id) ─────────────────────
CREATE TABLE bank_accounts (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_name   VARCHAR(255) NOT NULL,
  bank_name      VARCHAR(255) NOT NULL,
  account_number VARCHAR(100),
  iban           VARCHAR(100),
  swift          VARCHAR(50),
  currency_code  CHAR(3)     NOT NULL DEFAULT 'IQD',
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Link invoices to a bank account ─────────────────────────────────────────
ALTER TABLE project_invoices
  ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES bank_accounts(id);
