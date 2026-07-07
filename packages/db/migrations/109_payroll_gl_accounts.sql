-- Seed payroll-specific GL accounts for every company that does not already have them.
-- Required by the PAYROLL_JOURNAL_REQUESTED outbox handler.
INSERT INTO chart_of_accounts (company_id, code, name, account_type, is_active)
SELECT id, '6000', 'Salary & Wages Expense', 'expense', true FROM companies
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts WHERE company_id = companies.id AND code = '6000'
);

INSERT INTO chart_of_accounts (company_id, code, name, account_type, is_active)
SELECT id, '2400', 'Accrued Salaries Payable', 'liability', true FROM companies
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts WHERE company_id = companies.id AND code = '2400'
);

INSERT INTO chart_of_accounts (company_id, code, name, account_type, is_active)
SELECT id, '2500', 'Payroll Tax & SS Payable', 'liability', true FROM companies
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts WHERE company_id = companies.id AND code = '2500'
);
