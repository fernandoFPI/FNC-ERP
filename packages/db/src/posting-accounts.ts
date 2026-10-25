import { pool, firstRowOrThrow } from './client.js'

export const POSTING_ACCOUNT_ROLES = [
  'ar',
  'ap',
  'revenue_project',
  'revenue_rental',
  'expense_default',
  'cash',
  'retention_receivable',
  'retention_payable',
  'wht_recoverable',
  'wht_payable',
  'wht_expense',
  'salaries_payable',
  'payroll_tax_payable',
  'grni',
  'stock_variance',
  'interco_receivable',
  'interco_payable',
  'inventory',
] as const

export type PostingAccountRole = (typeof POSTING_ACCOUNT_ROLES)[number]

export interface CompanyPostingAccount {
  id: string
  company_id: string
  role: PostingAccountRole
  currency_code: string | null
  account_id: string
  account_code: string
  account_name: string
  updated_at: string
}

// G1/G2: thrown instead of ever silently falling back to a different
// account or skipping a line. The message is a stable, greppable token
// ("POSTING_ACCOUNT_NOT_CONFIGURED: <role>") so callers (and the user
// reading a failed-event log) can tell exactly which setting is missing.
export class PostingAccountNotConfiguredError extends Error {
  constructor(public readonly role: PostingAccountRole) {
    super(`POSTING_ACCOUNT_NOT_CONFIGURED: ${role}`)
    this.name = 'PostingAccountNotConfiguredError'
  }
}

// Resolution order: an explicit override on the line/document itself,
// then a category/product-level account (e.g. an expense category's own
// GL account), then this company's configured default for the role —
// preferring a currency-specific row over the company-wide default when
// both exist. Throws PostingAccountNotConfiguredError rather than ever
// falling back to a different account or a guessed one.
export async function resolvePostingAccount(
  companyId: string,
  role: PostingAccountRole,
  opts: {
    currencyCode?: string | null
    lineOverrideAccountId?: string | null
    categoryAccountId?: string | null
  } = {},
): Promise<string> {
  if (opts.lineOverrideAccountId) return opts.lineOverrideAccountId
  if (opts.categoryAccountId) return opts.categoryAccountId

  const result = await pool.query<{ account_id: string }>(
    `SELECT account_id FROM company_posting_accounts
     WHERE company_id = $1 AND role = $2
       AND (currency_code = $3 OR currency_code IS NULL)
     ORDER BY (currency_code IS NULL) ASC
     LIMIT 1`,
    [companyId, role, opts.currencyCode ?? null],
  )
  const accountId = result.rows[0]?.account_id
  if (!accountId) throw new PostingAccountNotConfiguredError(role)
  return accountId
}

export async function listCompanyPostingAccounts(
  companyId: string,
): Promise<CompanyPostingAccount[]> {
  const result = await pool.query<CompanyPostingAccount>(
    `SELECT cpa.id, cpa.company_id, cpa.role, cpa.currency_code, cpa.account_id,
            a.code AS account_code, a.name AS account_name, cpa.updated_at
     FROM company_posting_accounts cpa
     JOIN chart_of_accounts a ON a.id = cpa.account_id
     WHERE cpa.company_id = $1
     ORDER BY cpa.role, cpa.currency_code NULLS FIRST`,
    [companyId],
  )
  return result.rows
}

// Validation (company match, active, postable) is enforced again by
// trg_validate_company_posting_account regardless of this caller, but
// checking first lets the settings screen show a clean message instead
// of a raw trigger exception.
export async function upsertCompanyPostingAccount(
  companyId: string,
  role: PostingAccountRole,
  currencyCode: string | null,
  accountId: string,
  userId: string,
): Promise<CompanyPostingAccount> {
  const accountCheck = await pool.query<{ ok: boolean }>(
    `SELECT (company_id = $2 AND is_active AND is_postable) AS ok FROM chart_of_accounts WHERE id = $1`,
    [accountId, companyId],
  )
  if (accountCheck.rows[0]?.ok !== true) {
    throw new Error(
      'Posting account must belong to this company, be active, and be a postable (leaf) account',
    )
  }

  const normalizedCurrency = currencyCode ? currencyCode.toUpperCase() : null
  const result = await pool.query<{ id: string }>(
    normalizedCurrency
      ? `INSERT INTO company_posting_accounts (company_id, role, currency_code, account_id, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$5)
         ON CONFLICT (company_id, role, currency_code) WHERE currency_code IS NOT NULL
         DO UPDATE SET account_id = EXCLUDED.account_id, updated_by = EXCLUDED.updated_by, updated_at = NOW()
         RETURNING id`
      : `INSERT INTO company_posting_accounts (company_id, role, currency_code, account_id, created_by, updated_by)
         VALUES ($1,$2,$3::char(3),$4,$5,$5)
         ON CONFLICT (company_id, role) WHERE currency_code IS NULL
         DO UPDATE SET account_id = EXCLUDED.account_id, updated_by = EXCLUDED.updated_by, updated_at = NOW()
         RETURNING id`,
    [companyId, role, normalizedCurrency, accountId, userId],
  )
  const id = firstRowOrThrow(result).id
  const full = await pool.query<CompanyPostingAccount>(
    `SELECT cpa.id, cpa.company_id, cpa.role, cpa.currency_code, cpa.account_id,
            a.code AS account_code, a.name AS account_name, cpa.updated_at
     FROM company_posting_accounts cpa
     JOIN chart_of_accounts a ON a.id = cpa.account_id
     WHERE cpa.id = $1`,
    [id],
  )
  return firstRowOrThrow(full)
}

export async function deleteCompanyPostingAccount(
  companyId: string,
  role: PostingAccountRole,
  currencyCode: string | null,
): Promise<void> {
  const normalizedCurrency = currencyCode ? currencyCode.toUpperCase() : null
  await pool.query(
    `DELETE FROM company_posting_accounts
     WHERE company_id = $1 AND role = $2
       AND (currency_code = $3 OR (currency_code IS NULL AND $3 IS NULL))`,
    [companyId, role, normalizedCurrency],
  )
}
