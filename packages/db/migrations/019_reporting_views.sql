-- ── CONSOLIDATED TRIAL BALANCE VIEW ───────────────────────────
CREATE OR REPLACE VIEW v_consolidated_trial_balance AS
SELECT
  coa.account_type,
  coa.code AS account_code,
  coa.name AS account_name,
  c.id AS company_id,
  c.name AS company_name,
  SUM(jl.debit * jl.fx_rate) AS total_debit_iqd,
  SUM(jl.credit * jl.fx_rate) AS total_credit_iqd,
  SUM((jl.debit - jl.credit) * jl.fx_rate) AS balance_iqd
FROM journal_lines jl
JOIN journal_entries je ON je.id = jl.journal_entry_id
JOIN chart_of_accounts coa ON coa.id = jl.account_id
JOIN companies c ON c.id = je.company_id
WHERE je.status = 'posted'
GROUP BY coa.account_type, coa.code, coa.name, c.id, c.name;

-- ── PROJECT PROFITABILITY VIEW ─────────────────────────────────
CREATE OR REPLACE VIEW v_project_profitability AS
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
  COALESCE(SUM(CASE WHEN pca.amount > 0 THEN pca.amount ELSE 0 END), 0) AS total_costs,
  COALESCE(SUM(CASE WHEN pca.amount < 0 THEN ABS(pca.amount) ELSE 0 END), 0) AS total_revenue,
  COALESCE(SUM(CASE WHEN pca.amount < 0 THEN ABS(pca.amount) ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN pca.amount > 0 THEN pca.amount ELSE 0 END), 0) AS gross_margin,
  p.budget_amount - COALESCE(SUM(CASE WHEN pca.amount > 0 THEN pca.amount ELSE 0 END), 0) AS budget_remaining
FROM projects p
JOIN companies c ON c.id = p.company_id
LEFT JOIN project_cost_actuals pca ON pca.project_id = p.id
GROUP BY p.id, p.code, p.name, p.project_type, p.status,
         p.budget_amount, p.budget_currency, p.company_id, c.name;

-- ── INTERCO ELIMINATION VIEW ───────────────────────────────────
CREATE OR REPLACE VIEW v_interco_eliminations AS
SELECT
  it.id AS transaction_id,
  it.from_company_id,
  fc.name AS from_company,
  it.to_company_id,
  tc.name AS to_company,
  it.transaction_type,
  it.amount,
  it.currency_code,
  it.status,
  it.from_journal_entry_id,
  it.to_journal_entry_id
FROM interco_transactions it
JOIN companies fc ON fc.id = it.from_company_id
JOIN companies tc ON tc.id = it.to_company_id
WHERE it.status = 'posted';

-- ── PAYROLL COST BY COMPANY VIEW ──────────────────────────────
-- Grouped by company and period (payslips table has no cost_center_id)
CREATE OR REPLACE VIEW v_payroll_cost_by_company AS
SELECT
  ps.company_id,
  c.name AS company_name,
  pr.period_name,
  pr.start_date AS period_start,
  pr.end_date AS period_end,
  SUM(ps.gross_salary) AS total_gross,
  SUM(ps.net_salary) AS total_net,
  SUM(ps.income_tax) AS total_income_tax,
  SUM(ps.social_security) AS total_social_security,
  COUNT(ps.employee_id) AS headcount
FROM payslips ps
JOIN payroll_runs pr ON pr.id = ps.payroll_run_id
JOIN companies c ON c.id = ps.company_id
WHERE pr.status = 'posted'
GROUP BY ps.company_id, c.name, pr.period_name, pr.start_date, pr.end_date;
