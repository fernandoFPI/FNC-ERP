-- ── MIGRATION 054: FX CONVERSION HELPER FOR PROJECT COST SUMMARY ───────────
-- The project cost-summary query (gateway resolvers.ts, `project` query)
-- summed project_cost_actuals.amount and purchase_orders.total_amount
-- directly against projects.budget_amount/project_value without converting
-- currencies first, so a USD budget minus IQD costs produced a nonsensical
-- deeply-negative "Budget Remaining". This helper looks up the latest
-- fx_rates entry for a currency pair (1 if currencies match) so the
-- resolver's SQL can convert each row before summing.

CREATE OR REPLACE FUNCTION fx_to_budget(p_from_currency CHAR(3), p_to_currency CHAR(3))
RETURNS NUMERIC AS $$
  SELECT CASE
    WHEN p_from_currency = p_to_currency THEN 1
    ELSE (
      SELECT rate FROM fx_rates
      WHERE from_currency = p_from_currency AND to_currency = p_to_currency
      ORDER BY rate_date DESC LIMIT 1
    )
  END
$$ LANGUAGE sql STABLE;
