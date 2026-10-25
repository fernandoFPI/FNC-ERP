-- D2: a project holds one budget amount PER CURRENCY, not one single
-- budget_amount/budget_currency pair. Cost in a currency is compared only
-- with that currency's own budget; a currency with cost but no budget row
-- shows "no budget" rather than a converted margin. fx_to_budget() (migration
-- 054) is dropped -- nothing is converted anywhere, so there is nothing left
-- for it to do.
--
-- projects.budget_amount/budget_currency are NOT dropped here (forward-only
-- migrations can't be undone, and several REST/mobile-sync paths still read
-- them for display). They go inert as far as cost-vs-budget math is
-- concerned -- every resolver that used to read them for that purpose now
-- reads project_budgets instead. createProject/createRFQ/updateProject keep
-- writing both the old columns (so existing single-currency display/reads
-- stay accurate) and the new table's primary row, in the same mutation, so
-- the two never drift apart.
CREATE TABLE project_budgets (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  currency_code CHAR(3) NOT NULL,
  budget_amount NUMERIC(20,4) NOT NULL,
  is_primary    BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, currency_code)
);

-- At most one primary row per project (the one createProject/updateProject's
-- single budget-amount input maps onto).
CREATE UNIQUE INDEX idx_project_budgets_primary ON project_budgets (project_id) WHERE is_primary;

CREATE INDEX idx_project_budgets_project ON project_budgets (project_id);

-- Migrate each existing project's single budget_amount into one primary row
-- in its current budget_currency -- every project, including a genuine
-- budget of 0 (a deliberate value, distinct from "no budget row at all").
INSERT INTO project_budgets (project_id, currency_code, budget_amount, is_primary)
SELECT id, budget_currency, budget_amount, true
FROM projects;

DROP FUNCTION IF EXISTS fx_to_budget(CHAR(3), CHAR(3));
