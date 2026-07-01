import type { PoolClient } from 'pg'

const COMPANY_IDS = {
  YAKAM: '00000000-0000-0000-0000-000000000001',
  FACTORY: '00000000-0000-0000-0000-000000000002',
  WATANYIA: '00000000-0000-0000-0000-000000000003',
}

interface AccountDef {
  code: string
  name: string
  account_type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
  is_reconcilable?: boolean
}

const accounts: AccountDef[] = [
  // Assets
  { code: '1100', name: 'Cash and Bank Accounts', account_type: 'asset', is_reconcilable: true },
  { code: '1200', name: 'Accounts Receivable', account_type: 'asset', is_reconcilable: true },
  { code: '1300', name: 'Inventory / Raw Materials', account_type: 'asset' },
  { code: '1400', name: 'Work in Progress', account_type: 'asset' },
  { code: '1500', name: 'Prepaid Expenses', account_type: 'asset' },
  { code: '1600', name: 'Fixed Assets', account_type: 'asset' },
  { code: '1700', name: 'Intercompany Receivable', account_type: 'asset', is_reconcilable: true },
  // Liabilities
  { code: '2100', name: 'Accounts Payable', account_type: 'liability', is_reconcilable: true },
  { code: '2200', name: 'Accrued Liabilities', account_type: 'liability' },
  { code: '2300', name: 'Tax Payable', account_type: 'liability' },
  { code: '2400', name: 'Intercompany Payable', account_type: 'liability', is_reconcilable: true },
  // Equity
  { code: '3100', name: 'Share Capital', account_type: 'equity' },
  { code: '3200', name: 'Retained Earnings', account_type: 'equity' },
  // Revenue
  { code: '4100', name: 'Construction Revenue', account_type: 'revenue' },
  { code: '4200', name: 'Manufacturing Revenue', account_type: 'revenue' },
  { code: '4300', name: 'Rental Revenue', account_type: 'revenue' },
  { code: '4400', name: 'Trading Revenue', account_type: 'revenue' },
  // Expenses
  { code: '5100', name: 'Cost of Materials', account_type: 'expense' },
  { code: '5200', name: 'Direct Labour', account_type: 'expense' },
  { code: '5300', name: 'Subcontractor Costs', account_type: 'expense' },
  { code: '5400', name: 'Equipment Costs', account_type: 'expense' },
  { code: '5500', name: 'Overhead', account_type: 'expense' },
  { code: '5600', name: 'Salaries and Wages', account_type: 'expense' },
  { code: '5700', name: 'General and Administrative', account_type: 'expense' },
]

export async function seedChartOfAccounts(client: PoolClient): Promise<void> {
  for (const [, companyId] of Object.entries(COMPANY_IDS)) {
    for (const acct of accounts) {
      await client.query(
        `INSERT INTO chart_of_accounts
           (company_id, code, name, account_type, is_reconcilable)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (company_id, code) DO NOTHING`,
        [companyId, acct.code, acct.name, acct.account_type, acct.is_reconcilable ?? false],
      )
    }
  }
  console.warn('[seed] Chart of accounts seeded for all 3 companies.')
}
