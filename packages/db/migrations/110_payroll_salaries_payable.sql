-- 2400 was already taken as Intercompany Payable.
-- Use 2600 for Accrued Salaries Payable instead.
INSERT INTO chart_of_accounts (company_id, code, name, account_type, is_active)
SELECT id, '2600', 'Accrued Salaries Payable', 'liability', true FROM companies
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts WHERE company_id = companies.id AND code = '2600'
);
