-- Migration 304 (Phase 2.1): shared per-currency read path.
-- Every ledger/project-cost report so far has rolled its own join and its
-- own (often missing) posted/date filter, which is how G3/G4/G19 and the
-- 60-site currency-blind-reads sweep happened. These views are the single
-- place that join is defined; no report built on top of them can forget
-- "posted only" because the view already enforces it, and every row
-- carries its own currency_code so nothing downstream can collapse rows
-- across currencies by accident.

-- Journal lines, posted entries only, with their account's identity
-- carried along (code/name/type/is_active) so a report can show an
-- account that's since been deactivated but still has posted history
-- (G2.2) without a second query. One row per line — callers GROUP BY
-- whatever they need (account_id, currency_code, a date bucket, ...) and
-- apply their own date/company filter; this view only fixes the part that
-- was actually missing (posted-only, per-line currency).
CREATE VIEW v_posted_journal_balances_by_currency AS
SELECT
  je.company_id,
  jl.account_id,
  a.code         AS account_code,
  a.name         AS account_name,
  a.account_type,
  a.is_active    AS account_is_active,
  jl.currency_code,
  jl.analytic_account_id,
  jl.cost_center_id,
  je.entry_date,
  jl.debit,
  jl.credit
FROM journal_lines jl
JOIN journal_entries je ON je.id = jl.journal_entry_id
JOIN chart_of_accounts a ON a.id = jl.account_id
WHERE je.status = 'posted';

-- project_cost_actuals rows split into two real shapes: most are tied to a
-- journal_line_id (po_completion, project_invoice, advance_settlement,
-- interco_transaction) and should only count once that journal is
-- actually posted; a real minority (stock_issue, po_direct_delivery,
-- material_return — migration 071 made journal_line_id nullable for
-- exactly this reason) were never backed by a journal entry at all, so
-- there is no status to check and they always count.
CREATE VIEW v_project_cost_by_currency AS
SELECT
  pca.project_id,
  pca.currency_code,
  pca.source_type,
  pca.cost_category,
  pca.entry_date,
  pca.amount
FROM project_cost_actuals pca
LEFT JOIN journal_lines jl ON jl.id = pca.journal_line_id
LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
WHERE pca.journal_line_id IS NULL OR je.status = 'posted';
