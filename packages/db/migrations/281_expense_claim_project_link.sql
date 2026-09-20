-- Optional project link on an expense claim header — informational at
-- creation, but drives cost attribution at approval time: approveExpenseClaim
-- resolves the linked project's analytic_account_id and stamps it onto every
-- DEBIT journal_line the claim posts, so the existing trg_sync_project_costs
-- trigger (packages/db/migrations/016_projects_schema.sql) auto-inserts the
-- claim's total into project_cost_actuals — the same pattern already used by
-- advance_settlement_lines (packages/db/migrations/195_employee_advances.sql).
ALTER TABLE expense_claims
  ADD COLUMN project_id UUID REFERENCES projects(id);
