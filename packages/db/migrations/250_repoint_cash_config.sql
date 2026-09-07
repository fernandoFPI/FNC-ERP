-- Migration 249: Repoint default-cash-account config onto the new chart
-- company_default_cash_accounts and system_configuration.advance_control_parent_account_id
-- currently point at accounts migration 244 deactivated. Left alone they'd
-- keep resolving to a legacy, inactive account. Repoint to the new chart's
-- equivalents: 1211 Main Cashbox (was pointing at whatever local "cash"
-- account existed before) and 1241 Employee Advances.

UPDATE company_default_cash_accounts dca
SET account_id = ca.id, updated_at = NOW()
FROM chart_of_accounts ca
WHERE ca.company_id = dca.company_id
  AND ca.code = '1211' AND ca.is_active = true;

-- Cover any company still missing a row entirely (Nishtimani Factory's gap
-- was only fixed by a September data-only migration; don't assume it holds).
INSERT INTO company_default_cash_accounts (company_id, currency_code, account_id)
SELECT ca.company_id, 'IQD', ca.id
FROM chart_of_accounts ca
WHERE ca.code = '1211' AND ca.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM company_default_cash_accounts d
    WHERE d.company_id = ca.company_id AND d.currency_code = 'IQD'
  );

UPDATE system_configuration sc
SET advance_control_parent_account_id = ca.id
FROM chart_of_accounts ca
WHERE ca.company_id = sc.company_id
  AND ca.code = '1241' AND ca.is_active = true;
