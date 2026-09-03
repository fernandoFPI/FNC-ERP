-- Migration 239: Fix known-bad live chart_of_accounts records
-- All corrections here are metadata-only (code/name/type/is_active) on existing
-- rows — no row's id changes, so journal_lines.account_id, employee_advances.*,
-- system_configuration.*, and company_default_cash_accounts.account_id all keep
-- resolving correctly with no repointing needed. No journal history is touched.

-- ── 1. Yakam: retype + renumber the 4 drift accounts ──────────────────────────
-- Root cause: apps/web/src/pages/finance/accounts/AccountForm.tsx defaulted new
-- accounts to account_type 'expense' — these were created without changing it.

UPDATE chart_of_accounts
SET code = '1110', name = 'Cash IQD', account_type = 'asset', updated_at = NOW()
WHERE code = '10005' AND name = 'Cash IQD';

UPDATE chart_of_accounts
SET code = '1180', name = 'Employee Advances', account_type = 'asset', updated_at = NOW()
WHERE code = '10082' AND name = 'Advance';

UPDATE chart_of_accounts
SET code = '1181', account_type = 'asset', updated_at = NOW()
WHERE code = '10082-01' AND name = 'Employee Advances — Fernando Kakony';

-- Zero journal activity, typo'd near-duplicate of 10082-01 — deactivate rather
-- than renumber or delete, preserving the record of the mistake.
UPDATE chart_of_accounts
SET is_active = false, updated_at = NOW()
WHERE code = '10082-1' AND name = 'Fernando Advnace';

-- ── 2. Deactivate unused duplicate accounts (zero journal activity each) ──────
UPDATE chart_of_accounts
SET is_active = false, updated_at = NOW()
WHERE code = '1700' AND name = 'Intercompany Receivable'
  AND company_id = (SELECT id FROM companies WHERE name = 'Nishtimani Factory');

UPDATE chart_of_accounts
SET is_active = false, updated_at = NOW()
WHERE code = '2150' AND name = 'Intercompany Payable'
  AND company_id = (SELECT id FROM companies WHERE name = 'Nishtimani Yakam');

-- ── 3. Fix company_default_cash_accounts ───────────────────────────────────────

-- Al Watanyia: was pointing at Accounts Receivable (1200) instead of cash.
UPDATE company_default_cash_accounts dca
SET account_id = ca.id, updated_at = NOW()
FROM chart_of_accounts ca
WHERE dca.company_id = (SELECT id FROM companies WHERE name = 'Al Watanyia')
  AND ca.company_id = dca.company_id
  AND ca.code = '1100' AND ca.name = 'Cash and Bank Accounts';

-- Nishtimani Factory: no default cash account configured at all.
INSERT INTO company_default_cash_accounts (company_id, currency_code, account_id)
SELECT co.id, 'IQD', ca.id
FROM companies co
JOIN chart_of_accounts ca ON ca.company_id = co.id AND ca.code = '1100' AND ca.name = 'Cash and Bank Accounts'
WHERE co.name = 'Nishtimani Factory'
  AND NOT EXISTS (
    SELECT 1 FROM company_default_cash_accounts d WHERE d.company_id = co.id AND d.currency_code = 'IQD'
  );

-- Yakam: already points at the 10005/1110 row by id — no change needed; it now
-- resolves to an asset-typed account once step 1 above retypes it.
