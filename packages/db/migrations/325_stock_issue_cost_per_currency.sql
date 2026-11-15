-- Migration 325: a Store Out's project cost can be booked in more than one currency (playbook #94).
--
-- issueMaterialIssue wrote ONE project_cost_actuals row per Store Out, always labelled 'IQD', whatever the items were priced in.
-- On NY-PRJ-2026-0032 the 14 Store Outs held 174 lines priced in USD (2,470.57 USD) inside a 99,835.60 "IQD" total, so the
-- project's USD Actual was understated and its IQD Actual overstated by the same amount. The fix books one row per currency
-- (the currency of each line's product cost), so a Store Out of USD and IQD items now has two cost rows with the same
-- source_id. The unique index of migration 141 allowed one row per source_id and would have refused the second.
--
-- The index becomes (source_id, currency_code): still one row per Store Out per currency, so re-confirming cannot double a
-- cost, and every row that exists today (one per source_id) already satisfies it. Forward-only, no data changes, safe to
-- re-run (IF EXISTS / IF NOT EXISTS).
DROP INDEX IF EXISTS uq_project_cost_actuals_stock_issue;

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_cost_actuals_stock_issue_ccy
  ON project_cost_actuals (source_id, currency_code)
  WHERE source_type = 'stock_issue' AND source_id IS NOT NULL;
