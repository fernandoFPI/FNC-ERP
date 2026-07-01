-- WHT redesign: bidirectional (AR + AP), per-invoice scenario + rate.
-- AR invoices: wht_applies toggle, wht_scenario (client_withholds / fnc_pays),
--              wht_rate (decimal), wht_amount (computed: net_payable * wht_rate).
-- Vendor invoices: wht_applies toggle (was forced from vendor record), per-invoice wht_rate.
-- COA: WHT Recoverable (asset 1390), WHT Payable (liability 2390), WHT Expense (expense 6100).

-- ── project_invoices ─────────────────────────────────────────────────────────
ALTER TABLE project_invoices
  ADD COLUMN IF NOT EXISTS wht_applies  BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS wht_scenario VARCHAR(20)
    CHECK (wht_scenario IN ('client_withholds','fnc_pays')),
  ADD COLUMN IF NOT EXISTS wht_rate     NUMERIC(5,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wht_amount   NUMERIC(20,4) NOT NULL DEFAULT 0;

-- ── rental_invoices ──────────────────────────────────────────────────────────
ALTER TABLE rental_invoices
  ADD COLUMN IF NOT EXISTS wht_applies  BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS wht_scenario VARCHAR(20)
    CHECK (wht_scenario IN ('client_withholds','fnc_pays')),
  ADD COLUMN IF NOT EXISTS wht_rate     NUMERIC(5,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wht_amount   NUMERIC(20,4) NOT NULL DEFAULT 0;

-- ── vendor_invoices ──────────────────────────────────────────────────────────
ALTER TABLE vendor_invoices
  ADD COLUMN IF NOT EXISTS wht_applies BOOLEAN      NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS wht_rate    NUMERIC(5,4) NOT NULL DEFAULT 0;

-- Existing vendor invoices with no WHT deduction: mark as wht_applies = false
UPDATE vendor_invoices SET wht_applies = FALSE WHERE wht_amount = 0;

-- ── Chart of accounts — WHT GL accounts (one per company) ────────────────────
INSERT INTO chart_of_accounts (company_id, code, name, account_type, is_active)
SELECT id, '1390', 'WHT Recoverable', 'asset', true FROM companies
ON CONFLICT (company_id, code) DO NOTHING;

INSERT INTO chart_of_accounts (company_id, code, name, account_type, is_active)
SELECT id, '2390', 'WHT Payable', 'liability', true FROM companies
ON CONFLICT (company_id, code) DO NOTHING;

INSERT INTO chart_of_accounts (company_id, code, name, account_type, is_active)
SELECT id, '6100', 'WHT Tax Expense', 'expense', true FROM companies
ON CONFLICT (company_id, code) DO NOTHING;
