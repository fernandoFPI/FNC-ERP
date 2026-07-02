-- Migration 102: GL Budget Management + Currency Revaluation
-- ─────────────────────────────────────────────────────────────

-- GL Budgets (header)
CREATE TABLE gl_budgets (
  id            UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id    UUID         NOT NULL,
  name          VARCHAR(200) NOT NULL,
  fiscal_year   INT          NOT NULL,
  currency_code VARCHAR(3)   NOT NULL DEFAULT 'IQD',
  status        VARCHAR(20)  NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','active','locked')),
  notes         TEXT,
  created_by    UUID,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, name, fiscal_year)
);

-- GL Budget Lines (one row per account × period)
CREATE TABLE gl_budget_lines (
  id         UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  budget_id  UUID         NOT NULL REFERENCES gl_budgets(id) ON DELETE CASCADE,
  company_id UUID         NOT NULL,
  account_id UUID         NOT NULL,
  period     VARCHAR(7)   NOT NULL,  -- YYYY-MM
  amount     NUMERIC(18,2) NOT NULL DEFAULT 0,
  notes      TEXT,
  UNIQUE (budget_id, account_id, period)
);

-- FX Revaluation Runs
CREATE TABLE fx_revaluation_runs (
  id               UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id       UUID         NOT NULL,
  run_date         DATE         NOT NULL,
  period           VARCHAR(7)   NOT NULL,  -- YYYY-MM
  status           VARCHAR(20)  NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','posted','reversed')),
  total_gain_loss  NUMERIC(18,2) NOT NULL DEFAULT 0,
  journal_entry_id UUID,
  reversal_entry_id UUID,
  notes            TEXT,
  created_by       UUID,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- FX Revaluation Lines (per account per currency)
CREATE TABLE fx_revaluation_lines (
  id               UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id           UUID         NOT NULL REFERENCES fx_revaluation_runs(id) ON DELETE CASCADE,
  company_id       UUID         NOT NULL,
  account_id       UUID         NOT NULL,
  currency_code    VARCHAR(3)   NOT NULL,
  original_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
  fx_rate_used     NUMERIC(18,6) NOT NULL,
  revalued_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
  gain_loss        NUMERIC(18,2) NOT NULL DEFAULT 0
);

-- Indexes
CREATE INDEX idx_gl_budgets_company ON gl_budgets(company_id, fiscal_year);
CREATE INDEX idx_gl_budget_lines_budget ON gl_budget_lines(budget_id);
CREATE INDEX idx_gl_budget_lines_account ON gl_budget_lines(company_id, account_id, period);
CREATE INDEX idx_fx_reval_company ON fx_revaluation_runs(company_id, period);
CREATE INDEX idx_fx_reval_lines_run ON fx_revaluation_lines(run_id);
