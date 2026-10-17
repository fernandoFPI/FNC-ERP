// Phase 2.2 (G3/G4/G19): trialBalance, profitLoss, balanceSheet and
// accountLedger all used to blend every currency into one scalar total.
// Real-Postgres pattern — a fresh company with real posted lines in two
// currencies, asserting the reports keep them apart rather than adding
// IQD and USD numbers together (no currency exchange anywhere policy).
import { describe, it, expect, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const NAME_PREFIX = 'G3G4-LEDGER-TEST-'
const TEST_USER_EMAIL = 'g3g4-ledger-reports-test@fnc-erp.local'

async function makeCompany(): Promise<{
  companyId: string
  userId: string
  revenueAccountId: string
  expenseAccountId: string
  assetAccountId: string
  liabilityAccountId: string
}> {
  const companyRes = await pool.query<{ id: string }>(
    `INSERT INTO companies (name, legal_name, country_code, currency_code)
     VALUES ($1,$1,'IQ','IQD') RETURNING id`,
    [`${NAME_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`],
  )
  const companyId = companyRes.rows[0]!.id

  const accountsRes = await pool.query<{ id: string; code: string }>(
    `INSERT INTO chart_of_accounts (company_id, code, name, account_type, is_postable, is_active)
     VALUES
       ($1,'4100','Revenue','revenue',true,true),
       ($1,'5100','Expense','expense',true,true),
       ($1,'1100','Cash','asset',true,true),
       ($1,'2100','Payable','liability',true,true)
     RETURNING id, code`,
    [companyId],
  )
  const byCode = new Map(accountsRes.rows.map((r) => [r.code, r.id]))

  const userR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  const userId = userR.rows[0]!.id
  await pool.query(
    `INSERT INTO user_company_roles (user_id, company_id, role, module) VALUES ($1,$2,'company_admin','all') ON CONFLICT DO NOTHING`,
    [userId, companyId],
  )

  return {
    companyId,
    userId,
    revenueAccountId: byCode.get('4100')!,
    expenseAccountId: byCode.get('5100')!,
    assetAccountId: byCode.get('1100')!,
    liabilityAccountId: byCode.get('2100')!,
  }
}

async function postJournal(
  companyId: string,
  userId: string,
  entryDate: string,
  lines: { accountId: string; debit: number; credit: number; currencyCode: string }[],
): Promise<void> {
  const je = await pool.query<{ id: string }>(
    `INSERT INTO journal_entries (company_id, reference, description, entry_date, status, source_type, created_by)
     VALUES ($1,$2,'test entry',$3,'posted','manual',$4) RETURNING id`,
    [companyId, `${NAME_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, entryDate, userId],
  )
  const jeId = je.rows[0]!.id
  for (const line of lines) {
    await pool.query(
      `INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, currency_code, amount_company_currency)
       VALUES ($1,$2,$3,$4,$5,$3::numeric+$4::numeric)`,
      [jeId, line.accountId, line.debit, line.credit, line.currencyCode],
    )
  }
}

function ctxFor(companyId: string, userId: string) {
  return { auth: { companyId, userId, role: 'company_admin', module: 'all', sessionId: 'ledger-reports-test' } }
}

async function cleanupCompany(companyId: string): Promise<void> {
  await pool.query(
    `DELETE FROM journal_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE company_id=$1)`,
    [companyId],
  )
  await pool.query(`DELETE FROM journal_entries WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM user_company_roles WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM chart_of_accounts WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId])
}

afterAll(async () => {
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('profitLoss — per currency', () => {
  it('keeps IQD and USD net profit apart instead of blending them', async () => {
    const { companyId, userId, revenueAccountId, expenseAccountId } = await makeCompany()
    try {
      await postJournal(companyId, userId, '2031-01-15', [
        { accountId: revenueAccountId, debit: 0, credit: 1000000, currencyCode: 'IQD' },
        { accountId: expenseAccountId, debit: 400000, credit: 0, currencyCode: 'IQD' },
      ])
      await postJournal(companyId, userId, '2031-01-16', [
        { accountId: revenueAccountId, debit: 0, credit: 500, currencyCode: 'USD' },
        { accountId: expenseAccountId, debit: 200, credit: 0, currencyCode: 'USD' },
      ])

      const result = (await resolvers.Query.profitLoss(
        null,
        { fromDate: '2031-01-01', toDate: '2031-01-31' },
        ctxFor(companyId, userId) as never,
      )) as {
        netProfit: { currency_code: string; amount: string }[]
        totalRevenue: { currency_code: string; amount: string }[]
      }

      const iqdProfit = result.netProfit.find((c) => c.currency_code === 'IQD')
      const usdProfit = result.netProfit.find((c) => c.currency_code === 'USD')
      expect(parseFloat(iqdProfit!.amount)).toBe(600000)
      expect(parseFloat(usdProfit!.amount)).toBe(300)
      // The two currencies' revenue must never have been added together —
      // 1000000 + 500 = 1000500, which would be the blended-bug value.
      expect(result.totalRevenue.some((c) => parseFloat(c.amount) === 1000500)).toBe(false)
    } finally {
      await cleanupCompany(companyId)
    }
  })
})

describe('trialBalance — per currency', () => {
  it('returns a separate row per currency for an account posted in both', async () => {
    const { companyId, userId, assetAccountId, liabilityAccountId } = await makeCompany()
    try {
      await postJournal(companyId, userId, '2031-02-10', [
        { accountId: assetAccountId, debit: 100000, credit: 0, currencyCode: 'IQD' },
        { accountId: liabilityAccountId, debit: 0, credit: 100000, currencyCode: 'IQD' },
      ])
      await postJournal(companyId, userId, '2031-02-11', [
        { accountId: assetAccountId, debit: 50, credit: 0, currencyCode: 'USD' },
        { accountId: liabilityAccountId, debit: 0, credit: 50, currencyCode: 'USD' },
      ])

      const rows = (await resolvers.Query.trialBalance(
        null,
        { as_of_date: '2031-02-28' },
        ctxFor(companyId, userId) as never,
      )) as { id: string; currency_code: string; total_debit: string }[]

      const assetRows = rows.filter((r) => r.id === assetAccountId)
      expect(assetRows).toHaveLength(2)
      expect(assetRows.find((r) => r.currency_code === 'IQD')?.total_debit).toBe('100000.0000')
      expect(assetRows.find((r) => r.currency_code === 'USD')?.total_debit).toBe('50.0000')
    } finally {
      await cleanupCompany(companyId)
    }
  })
})

describe('balanceSheet — per currency', () => {
  it('balances independently per currency rather than blending assets vs liabilities across currencies', async () => {
    const { companyId, userId, assetAccountId, liabilityAccountId } = await makeCompany()
    try {
      await postJournal(companyId, userId, '2031-03-01', [
        { accountId: assetAccountId, debit: 200000, credit: 0, currencyCode: 'IQD' },
        { accountId: liabilityAccountId, debit: 0, credit: 200000, currencyCode: 'IQD' },
      ])
      await postJournal(companyId, userId, '2031-03-02', [
        { accountId: assetAccountId, debit: 100, credit: 0, currencyCode: 'USD' },
        { accountId: liabilityAccountId, debit: 0, credit: 100, currencyCode: 'USD' },
      ])

      const result = (await resolvers.Query.balanceSheet(
        null,
        { asOfDate: '2031-03-31' },
        ctxFor(companyId, userId) as never,
      )) as {
        isBalanced: boolean
        totalAssets: { currency_code: string; amount: string }[]
        totalLiabilities: { currency_code: string; amount: string }[]
      }

      expect(result.isBalanced).toBe(true)
      expect(parseFloat(result.totalAssets.find((c) => c.currency_code === 'IQD')!.amount)).toBe(200000)
      expect(parseFloat(result.totalAssets.find((c) => c.currency_code === 'USD')!.amount)).toBe(100)
    } finally {
      await cleanupCompany(companyId)
    }
  })
})

describe('accountLedger — per currency', () => {
  it('defaults to the account\'s own currency and lists every currency with activity', async () => {
    const { companyId, userId, assetAccountId, liabilityAccountId } = await makeCompany()
    try {
      await postJournal(companyId, userId, '2031-04-01', [
        { accountId: assetAccountId, debit: 70000, credit: 0, currencyCode: 'IQD' },
        { accountId: liabilityAccountId, debit: 0, credit: 70000, currencyCode: 'IQD' },
      ])
      await postJournal(companyId, userId, '2031-04-02', [
        { accountId: assetAccountId, debit: 30, credit: 0, currencyCode: 'USD' },
        { accountId: liabilityAccountId, debit: 0, credit: 30, currencyCode: 'USD' },
      ])

      const defaultResult = (await resolvers.Query.accountLedger(
        null,
        { accountId: assetAccountId },
        ctxFor(companyId, userId) as never,
      )) as { currencyCode: string; availableCurrencies: string[]; totalDebit: string }
      expect(defaultResult.currencyCode).toBe('IQD')
      expect(defaultResult.availableCurrencies.sort()).toEqual(['IQD', 'USD'])
      expect(defaultResult.totalDebit).toBe('70000.0000')

      const usdResult = (await resolvers.Query.accountLedger(
        null,
        { accountId: assetAccountId, currencyCode: 'USD' },
        ctxFor(companyId, userId) as never,
      )) as { currencyCode: string; totalDebit: string; items: { currency_code: string }[] }
      expect(usdResult.currencyCode).toBe('USD')
      expect(usdResult.totalDebit).toBe('30.0000')
      expect(usdResult.items.every((i) => i.currency_code === 'USD')).toBe(true)
    } finally {
      await cleanupCompany(companyId)
    }
  })
})
