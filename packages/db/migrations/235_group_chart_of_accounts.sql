-- Migration 235: Group Chart of Accounts
-- Group-level accounts (no company_id), mirroring the existing bank_accounts
-- "group-level" pattern (042_branches_and_bank_accounts.sql). Companies map
-- their local chart_of_accounts rows to these via chart_of_accounts.group_account_id
-- (added in migration 236).

CREATE TABLE group_chart_of_accounts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code          VARCHAR(20) NOT NULL UNIQUE,
  name          VARCHAR(255) NOT NULL,
  account_type  VARCHAR(50) NOT NULL CHECK (account_type IN ('asset','liability','equity','revenue','expense')),
  parent_id     UUID REFERENCES group_chart_of_accounts(id),
  is_header     BOOLEAN NOT NULL DEFAULT false,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_group_coa_parent ON group_chart_of_accounts(parent_id);

-- ── Seed: group template tree ────────────────────────────────────────────────
INSERT INTO group_chart_of_accounts (code, name, account_type, is_header) VALUES
    ('1000', 'Assets',                       'asset',     true),
    ('1100', 'Current Assets',                'asset',     true),
    ('1110', 'Cash & Cash Equivalents',       'asset',     false),
    ('1120', 'Accounts Receivable',           'asset',     false),
    ('1125', 'Employee Advances',             'asset',     false),
    ('1130', 'Inventory',                     'asset',     false),
    ('1140', 'Work in Progress',              'asset',     false),
    ('1150', 'Prepaid Expenses',              'asset',     false),
    ('1160', 'Intercompany Receivable',       'asset',     false),
    ('1170', 'Tax Recoverable',               'asset',     false),
    ('1200', 'Non-Current Assets',            'asset',     true),
    ('1210', 'Fixed Assets',                  'asset',     false),
    ('2000', 'Liabilities',                   'liability', true),
    ('2100', 'Current Liabilities',           'liability', true),
    ('2110', 'Accounts Payable',              'liability', false),
    ('2120', 'Accrued Liabilities',           'liability', false),
    ('2130', 'Tax Payable',                   'liability', false),
    ('2140', 'Intercompany Payable',          'liability', false),
    ('2150', 'Payroll Tax & SS Payable',      'liability', false),
    ('2160', 'Accrued Salaries Payable',      'liability', false),
    ('3000', 'Equity',                        'equity',    true),
    ('3100', 'Share Capital',                 'equity',    false),
    ('3200', 'Retained Earnings',             'equity',    false),
    ('4000', 'Revenue',                       'revenue',   true),
    ('4100', 'Construction Revenue',          'revenue',   false),
    ('4200', 'Manufacturing Revenue',         'revenue',   false),
    ('4300', 'Rental Revenue',                'revenue',   false),
    ('4400', 'Trading Revenue',               'revenue',   false),
    ('4900', 'Intercompany / Other Revenue',  'revenue',   false),
    ('5000', 'Expenses',                      'expense',   true),
    ('5100', 'Cost of Sales',                 'expense',   true),
    ('5110', 'Cost of Materials',             'expense',   false),
    ('5120', 'Direct Labour',                 'expense',   false),
    ('5130', 'Subcontractor Costs',           'expense',   false),
    ('5140', 'Equipment Costs',               'expense',   false),
    ('5150', 'Overhead',                      'expense',   false),
    ('5190', 'Other Cost of Sales',           'expense',   false),
    ('5200', 'Operating Expenses',            'expense',   true),
    ('5210', 'Salaries & Wages',              'expense',   false),
    ('5220', 'General & Administrative',      'expense',   false),
    ('5230', 'Tax Expense',                   'expense',   false),
    ('5240', 'Equipment Rental Expense',      'expense',   false);

-- ── Wire parent_id (by code, since ids are generated above) ──────────────────
UPDATE group_chart_of_accounts c SET parent_id = p.id FROM group_chart_of_accounts p
  WHERE p.code = '1000' AND c.code IN ('1100','1200');
UPDATE group_chart_of_accounts c SET parent_id = p.id FROM group_chart_of_accounts p
  WHERE p.code = '1100' AND c.code IN ('1110','1120','1125','1130','1140','1150','1160','1170');
UPDATE group_chart_of_accounts c SET parent_id = p.id FROM group_chart_of_accounts p
  WHERE p.code = '1200' AND c.code IN ('1210');
UPDATE group_chart_of_accounts c SET parent_id = p.id FROM group_chart_of_accounts p
  WHERE p.code = '2000' AND c.code IN ('2100');
UPDATE group_chart_of_accounts c SET parent_id = p.id FROM group_chart_of_accounts p
  WHERE p.code = '2100' AND c.code IN ('2110','2120','2130','2140','2150','2160');
UPDATE group_chart_of_accounts c SET parent_id = p.id FROM group_chart_of_accounts p
  WHERE p.code = '3000' AND c.code IN ('3100','3200');
UPDATE group_chart_of_accounts c SET parent_id = p.id FROM group_chart_of_accounts p
  WHERE p.code = '4000' AND c.code IN ('4100','4200','4300','4400','4900');
UPDATE group_chart_of_accounts c SET parent_id = p.id FROM group_chart_of_accounts p
  WHERE p.code = '5000' AND c.code IN ('5100','5200');
UPDATE group_chart_of_accounts c SET parent_id = p.id FROM group_chart_of_accounts p
  WHERE p.code = '5100' AND c.code IN ('5110','5120','5130','5140','5150','5190');
UPDATE group_chart_of_accounts c SET parent_id = p.id FROM group_chart_of_accounts p
  WHERE p.code = '5200' AND c.code IN ('5210','5220','5230','5240');
