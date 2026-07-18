-- Migration 138: Link project cost codes to analytic accounts
ALTER TABLE project_cost_codes
  ADD COLUMN IF NOT EXISTS analytic_account_id UUID REFERENCES analytic_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cost_codes_analytic ON project_cost_codes(analytic_account_id);
