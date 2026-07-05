-- Migration 103: Expense Claims + Petty Cash
-- ─────────────────────────────────────────────

-- Configurable expense categories
CREATE TABLE expense_categories (
  id            UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id    UUID         NOT NULL,
  name          VARCHAR(100) NOT NULL,
  gl_account_id UUID,
  is_active     BOOLEAN      NOT NULL DEFAULT true,
  UNIQUE (company_id, name)
);

-- Expense claim headers
CREATE TABLE expense_claims (
  id                      UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id              UUID         NOT NULL,
  claim_number            VARCHAR(50)  NOT NULL,
  employee_id             UUID         NOT NULL,
  employee_name           VARCHAR(200) NOT NULL,
  description             TEXT,
  currency_code           VARCHAR(3)   NOT NULL DEFAULT 'IQD',
  total_amount            NUMERIC(18,2) NOT NULL DEFAULT 0,
  status                  VARCHAR(20)  NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','submitted','approved','rejected','posted','paid')),
  submitted_at            TIMESTAMPTZ,
  approved_by             UUID,
  approved_at             TIMESTAMPTZ,
  rejected_by             UUID,
  rejected_at             TIMESTAMPTZ,
  rejection_reason        TEXT,
  journal_entry_id        UUID,
  payment_voucher_id      UUID,
  reimbursement_account_id UUID,
  notes                   TEXT,
  created_by              UUID,
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, claim_number)
);

-- Expense claim lines (individual receipts)
CREATE TABLE expense_claim_lines (
  id            UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id      UUID         NOT NULL REFERENCES expense_claims(id) ON DELETE CASCADE,
  company_id    UUID         NOT NULL,
  expense_date  DATE         NOT NULL,
  category_id   UUID         REFERENCES expense_categories(id),
  category_name VARCHAR(100),
  gl_account_id UUID,
  description   TEXT,
  amount        NUMERIC(18,2) NOT NULL,
  currency_code VARCHAR(3)   NOT NULL DEFAULT 'IQD',
  receipt_url   TEXT,
  notes         TEXT
);

-- Petty cash floats (one per location / department)
CREATE TABLE petty_cash_floats (
  id               UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id       UUID         NOT NULL,
  name             VARCHAR(200) NOT NULL,
  location         VARCHAR(200),
  custodian_name   VARCHAR(200),
  currency_code    VARCHAR(3)   NOT NULL DEFAULT 'IQD',
  authorized_limit NUMERIC(18,2) NOT NULL DEFAULT 0,
  current_balance  NUMERIC(18,2) NOT NULL DEFAULT 0,
  gl_account_id    UUID,
  is_active        BOOLEAN      NOT NULL DEFAULT true,
  notes            TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, name)
);

-- Petty cash transactions
CREATE TABLE petty_cash_transactions (
  id               UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  float_id         UUID         NOT NULL REFERENCES petty_cash_floats(id),
  company_id       UUID         NOT NULL,
  transaction_date DATE         NOT NULL,
  description      TEXT         NOT NULL,
  category_id      UUID         REFERENCES expense_categories(id),
  category_name    VARCHAR(100),
  gl_account_id    UUID,
  amount           NUMERIC(18,2) NOT NULL,
  transaction_type VARCHAR(20)  NOT NULL DEFAULT 'spend'
                   CHECK (transaction_type IN ('spend','replenishment','opening','adjustment')),
  balance_after    NUMERIC(18,2),
  receipt_url      TEXT,
  journal_entry_id UUID,
  created_by       UUID,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Petty cash replenishment requests
CREATE TABLE petty_cash_replenishments (
  id                    UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  float_id              UUID        NOT NULL REFERENCES petty_cash_floats(id),
  company_id            UUID        NOT NULL,
  replenishment_number  VARCHAR(50) NOT NULL,
  requested_amount      NUMERIC(18,2) NOT NULL,
  approved_amount       NUMERIC(18,2),
  status                VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','posted','rejected')),
  journal_entry_id      UUID,
  requested_by          UUID,
  approved_by           UUID,
  approved_at           TIMESTAMPTZ,
  rejection_reason      TEXT,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, replenishment_number)
);

-- Indexes
CREATE INDEX idx_exp_claims_company   ON expense_claims(company_id, status);
CREATE INDEX idx_exp_claims_employee  ON expense_claims(employee_id);
CREATE INDEX idx_exp_lines_claim      ON expense_claim_lines(claim_id);
CREATE INDEX idx_pc_floats_company    ON petty_cash_floats(company_id);
CREATE INDEX idx_pc_txns_float        ON petty_cash_transactions(float_id, transaction_date);
CREATE INDEX idx_pc_replen_float      ON petty_cash_replenishments(float_id);
CREATE INDEX idx_exp_categories_co    ON expense_categories(company_id);
