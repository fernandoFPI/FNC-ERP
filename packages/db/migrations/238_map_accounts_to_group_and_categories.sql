-- Migration 238: Map all existing local accounts to group accounts + backfill category
-- Joined by (code, name) — this pair uniquely identifies each distinct local
-- account definition across all 3 companies as of this migration, including the
-- cases where the same code means different things per company (6000, 6100, etc).
-- Runs BEFORE migration 239's renumber/retype of the Yakam drift accounts, so it
-- maps them under their current (pre-fix) code/name; 239 only changes code/type
-- on the same row afterward and leaves group_account_id/account_category intact.

UPDATE chart_of_accounts c
SET group_account_id = g.id,
    account_category = v.category,
    updated_at = NOW()
FROM (VALUES
  ('1100', 'Cash and Bank Accounts',                '1110', 'CASH'),
  ('1200', 'Accounts Receivable',                   '1120', 'RECEIVABLE'),
  ('1210', 'Intercompany Receivable',                '1160', 'INTERCOMPANY'),
  ('1700', 'Intercompany Receivable',                '1160', 'INTERCOMPANY'),
  ('1300', 'Inventory / Raw Materials',              '1130', 'INVENTORY'),
  ('1310', 'Raw Material Inventory',                 '1130', 'INVENTORY'),
  ('1320', 'Finished Goods Inventory',                '1130', 'INVENTORY'),
  ('1390', 'WHT Recoverable',                        '1170', 'TAX'),
  ('1400', 'Work in Progress',                       '1140', 'WIP'),
  ('1500', 'Prepaid Expenses',                       '1150', 'PREPAID'),
  ('1600', 'Fixed Assets',                           '1210', 'FIXED_ASSET'),
  ('2100', 'Accounts Payable',                       '2110', 'PAYABLE'),
  ('2200', 'Accrued Liabilities',                    '2120', 'PAYABLE'),
  ('2300', 'Tax Payable',                            '2130', 'TAX'),
  ('2390', 'WHT Payable',                            '2130', 'TAX'),
  ('2400', 'Intercompany Payable',                   '2140', 'INTERCOMPANY'),
  ('2150', 'Intercompany Payable',                   '2140', 'INTERCOMPANY'),
  ('2500', 'Payroll Tax & SS Payable',                '2150', 'TAX'),
  ('2600', 'Accrued Salaries Payable',                '2160', 'PAYABLE'),
  ('3100', 'Share Capital',                          '3100', 'EQUITY'),
  ('3200', 'Retained Earnings',                      '3200', 'EQUITY'),
  ('4100', 'Construction Revenue',                   '4100', 'REVENUE'),
  ('4200', 'Manufacturing Revenue',                  '4200', 'REVENUE'),
  ('4300', 'Rental Revenue',                         '4300', 'REVENUE'),
  ('4400', 'Trading Revenue',                        '4400', 'REVENUE'),
  ('4000', 'Contract Revenue',                       '4100', 'REVENUE'),
  ('4000', 'Manufacturing / Interco Revenue',         '4200', 'REVENUE'),
  ('5100', 'Cost of Materials',                      '5110', 'COGS'),
  ('5200', 'Direct Labour',                          '5120', 'COGS'),
  ('5300', 'Subcontractor Costs',                    '5130', 'COGS'),
  ('5400', 'Equipment Costs',                        '5140', 'COGS'),
  ('5500', 'Overhead',                               '5150', 'COGS'),
  ('5700', 'General and Administrative',              '5220', 'OPEX'),
  ('5600', 'Salaries and Wages',                     '5210', 'OPEX'),
  ('5000', 'Raw Material Cost',                      '5110', 'COGS'),
  ('5000', 'Cost of Goods Sold / Project Cost',       '5190', 'COGS'),
  ('6000', 'Salary & Wages Expense',                 '5210', 'OPEX'),
  ('6000', 'General & Administrative Expense',        '5220', 'OPEX'),
  ('6100', 'WHT Tax Expense',                        '5230', 'TAX'),
  ('6100', 'Equipment Rental Expense',                '5240', 'OPEX'),
  -- Yakam drift accounts, mapped under their pre-fix (code, name); migration 239
  -- retypes/renumbers the same rows without touching this mapping.
  ('10005', 'Cash IQD',                              '1110', 'CASH'),
  ('10082', 'Advance',                               '1125', 'RECEIVABLE'),
  ('10082-01', 'Employee Advances — Fernando Kakony', '1125', 'RECEIVABLE'),
  ('10082-1', 'Fernando Advnace',                    '1125', 'RECEIVABLE')
) AS v(code, name, group_code, category)
JOIN group_chart_of_accounts g ON g.code = v.group_code
WHERE c.code = v.code AND c.name = v.name;
