-- Migration 305 (Phase 2.3/2.4, 0.1 sweep #3): v_project_profitability was
-- a single blind SUM(pca.amount) per project with no currency_code at
-- all -- and every consumer of this view (resolvers.ts, projects.ts,
-- reporting/projects.ts) inherited the bug for free. Rewritten on top of
-- v_project_cost_by_currency (migration 304), which already separates
-- journal-backed cost rows (posted-only) from the real journal-less ones.
-- Now one row per (project, currency) that has cost activity, plus one
-- zero-activity row per project so a project with nothing posted yet
-- still lists (LEFT JOIN).
--
-- budget_remaining stays a real number only for the currency that
-- actually matches the project's own budget_currency -- comparing a
-- different currency's actual cost against one budget figure is exactly
-- the conversion question D2 is meant to settle, not something to guess
-- at here (ship per-currency totals first).
-- CREATE OR REPLACE VIEW can only append columns, not insert one in the
-- middle of the existing list (Postgres: "cannot change name of view
-- column") -- currency_code goes last rather than next to company_name.
DROP VIEW IF EXISTS v_project_profitability;
CREATE VIEW v_project_profitability AS
SELECT
  p.id AS project_id,
  p.code,
  p.name,
  p.project_type,
  p.status,
  p.budget_amount,
  p.budget_currency,
  p.company_id,
  c.name AS company_name,
  COALESCE(SUM(CASE WHEN pcbc.amount > 0 THEN pcbc.amount ELSE 0 END), 0) AS total_costs,
  COALESCE(SUM(CASE WHEN pcbc.amount < 0 THEN ABS(pcbc.amount) ELSE 0 END), 0) AS total_revenue,
  COALESCE(SUM(CASE WHEN pcbc.amount < 0 THEN ABS(pcbc.amount) ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN pcbc.amount > 0 THEN pcbc.amount ELSE 0 END), 0) AS gross_margin,
  CASE WHEN pcbc.currency_code IS NULL OR pcbc.currency_code = p.budget_currency
    THEN p.budget_amount - COALESCE(SUM(CASE WHEN pcbc.amount > 0 THEN pcbc.amount ELSE 0 END), 0)
    ELSE NULL
  END AS budget_remaining,
  pcbc.currency_code
FROM projects p
JOIN companies c ON c.id = p.company_id
LEFT JOIN v_project_cost_by_currency pcbc ON pcbc.project_id = p.id
GROUP BY p.id, p.code, p.name, p.project_type, p.status,
         p.budget_amount, p.budget_currency, p.company_id, c.name, pcbc.currency_code;
