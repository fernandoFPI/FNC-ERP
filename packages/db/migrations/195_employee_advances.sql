-- ── Employee Cash Advance module ──────────────────────────────────────────
-- Employee draws cash before spending (issuance), later accounts for it via
-- settlement lines tagged with their own GL account/project/cost center, and
-- returns whatever's unused. Cash moves directly against chart_of_accounts —
-- no separate balance-tracked "cashbox" entity; the GL ledger stays the
-- single source of truth for cash-on-hand.

ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS is_project_related BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE employee_advances (
  id                  UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id          UUID          NOT NULL,
  advance_number      VARCHAR(50)   NOT NULL,
  employee_id         UUID          NOT NULL,
  employee_name       VARCHAR(200)  NOT NULL,
  purpose             TEXT,
  project_id          UUID,                  -- nullable = "Multiple / Not Defined"; informational only at issuance
  cost_center_id      UUID,                  -- informational tag only at issuance
  currency_code       CHAR(3)       NOT NULL DEFAULT 'IQD',
  fx_rate             NUMERIC(20,6) NOT NULL DEFAULT 1,
  amount              NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  cash_account_id     UUID          NOT NULL,   -- chart_of_accounts; credited once, at issuance only
  advance_account_id  UUID          NOT NULL,   -- chart_of_accounts control account for this advance's whole life
  status              VARCHAR(20)   NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','pending_approval','approved','rejected','partially_settled','settled','cancelled')),
  settled_amount      NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (settled_amount >= 0),
  returned_amount     NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (returned_amount >= 0),
  outstanding_amount  NUMERIC(18,2) GENERATED ALWAYS AS (amount - settled_amount - returned_amount) STORED,
  submitted_at        TIMESTAMPTZ,
  approved_by         UUID,
  approved_at         TIMESTAMPTZ,
  rejected_by         UUID,
  rejected_at         TIMESTAMPTZ,
  rejection_reason    TEXT,
  journal_entry_id    UUID,
  notes               TEXT,
  created_by          UUID,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, advance_number),
  CHECK (settled_amount + returned_amount <= amount)
);

CREATE TABLE advance_settlements (
  id                  UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id          UUID          NOT NULL,
  settlement_number   VARCHAR(50)   NOT NULL,
  advance_id          UUID          NOT NULL REFERENCES employee_advances(id),
  employee_id         UUID          NOT NULL,
  employee_name       VARCHAR(200)  NOT NULL,
  settlement_date     DATE          NOT NULL DEFAULT CURRENT_DATE,
  description         TEXT,
  currency_code       CHAR(3)       NOT NULL DEFAULT 'IQD',
  total_amount        NUMERIC(18,2) NOT NULL DEFAULT 0,
  status              VARCHAR(20)   NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','submitted','approved','rejected')),
  submitted_at        TIMESTAMPTZ,
  approved_by         UUID,
  approved_at         TIMESTAMPTZ,
  rejected_by         UUID,
  rejected_at         TIMESTAMPTZ,
  rejection_reason    TEXT,
  journal_entry_id    UUID,
  notes               TEXT,
  created_by          UUID,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, settlement_number)
);

CREATE TABLE advance_settlement_lines (
  id               UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  settlement_id    UUID          NOT NULL REFERENCES advance_settlements(id) ON DELETE CASCADE,
  company_id       UUID          NOT NULL,
  line_date        DATE          NOT NULL,
  gl_account_id    UUID          NOT NULL,
  category_id      UUID          REFERENCES expense_categories(id),
  category_name    VARCHAR(100),
  project_id       UUID          REFERENCES projects(id),
  cost_center_id   UUID          NOT NULL REFERENCES cost_centers(id),
  supplier_id      UUID          REFERENCES vendors(id),
  description      TEXT          NOT NULL,
  amount           NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  currency_code    CHAR(3)       NOT NULL DEFAULT 'IQD',
  fx_rate          NUMERIC(20,6) NOT NULL DEFAULT 1,
  receipt_url      TEXT,
  notes            TEXT
);

CREATE TABLE advance_returns (
  id                UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id        UUID          NOT NULL,
  return_number     VARCHAR(50)   NOT NULL,
  advance_id        UUID          NOT NULL REFERENCES employee_advances(id),
  return_date       DATE          NOT NULL DEFAULT CURRENT_DATE,
  amount            NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  currency_code     CHAR(3)       NOT NULL DEFAULT 'IQD',
  fx_rate           NUMERIC(20,6) NOT NULL DEFAULT 1,
  cash_account_id   UUID          NOT NULL,
  description       TEXT,
  status            VARCHAR(20)   NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','approved','cancelled')),
  journal_entry_id  UUID,
  approved_by       UUID,
  approved_at       TIMESTAMPTZ,
  created_by        UUID,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, return_number)
);

CREATE INDEX idx_emp_adv_company ON employee_advances(company_id, status);
CREATE INDEX idx_emp_adv_employee ON employee_advances(employee_id);
CREATE INDEX idx_emp_adv_project ON employee_advances(project_id);
CREATE INDEX idx_adv_settlements_advance ON advance_settlements(advance_id);
CREATE INDEX idx_adv_settlements_company ON advance_settlements(company_id, status);
CREATE INDEX idx_adv_settlement_lines_settlement ON advance_settlement_lines(settlement_id);
CREATE INDEX idx_adv_settlement_lines_project ON advance_settlement_lines(project_id);
CREATE INDEX idx_adv_settlement_lines_cost_center ON advance_settlement_lines(cost_center_id);
CREATE INDEX idx_adv_returns_advance ON advance_returns(advance_id);
CREATE INDEX idx_adv_returns_company ON advance_returns(company_id, status);
