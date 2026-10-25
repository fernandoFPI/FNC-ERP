// 0.1 sweep finding #2: consolidatedPL/consolidatedBS/consolidatedTrialBalance
// (the live phase5 copies -- the base copies are dead, shadowed per
// playbook #4) blended every currency into one number. consolidatedBS
// and consolidatedPL also each had their own sign bug independent of
// currency: `consolidated = debit-credit` applied uniformly to every
// account type is right for debit-normal types (asset, expense) and
// backwards for credit-normal ones (liability, equity, revenue) unless
// negated back — the same class of mistake as G3 in profitLoss.
// Real-Postgres pattern.
import { describe, it, expect, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const NAME_PREFIX = 'G-CONS-TEST-'
const TEST_USER_EMAIL = 'g-consolidated-reports-test@fnc-erp.local'

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
  return { auth: { companyId, userId, role: 'company_admin', module: 'all', sessionId: 'consolidated-reports-test' } }
}

async function cleanup(companyId: string): Promise<void> {
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

describe('consolidatedPL — per currency and sign', () => {
  it('keeps IQD and USD apart, and reports positive revenue/expense magnitudes', async () => {
    const { companyId, userId, revenueAccountId, expenseAccountId } = await makeCompany()
    try {
      await postJournal(companyId, userId, '2031-05-15', [
        { accountId: revenueAccountId, debit: 0, credit: 1000000, currencyCode: 'IQD' },
        { accountId: expenseAccountId, debit: 400000, credit: 0, currencyCode: 'IQD' },
      ])
      await postJournal(companyId, userId, '2031-05-16', [
        { accountId: revenueAccountId, debit: 0, credit: 500, currencyCode: 'USD' },
        { accountId: expenseAccountId, debit: 200, credit: 0, currencyCode: 'USD' },
      ])

      const iqd = (await resolvers.Query.consolidatedPL(
        null,
        { fromDate: '2031-05-01', toDate: '2031-05-31' },
        ctxFor(companyId, userId) as never,
      )) as { currency: string; availableCurrencies: string[]; totalRevenue: number; totalExpenses: number; netProfit: number }
      expect(iqd.currency).toBe('IQD')
      expect(iqd.availableCurrencies.sort()).toEqual(['IQD', 'USD'])
      expect(iqd.totalRevenue).toBe(1000000)
      expect(iqd.totalExpenses).toBe(400000)
      expect(iqd.netProfit).toBe(600000)

      const usd = (await resolvers.Query.consolidatedPL(
        null,
        { fromDate: '2031-05-01', toDate: '2031-05-31', currencyCode: 'USD' },
        ctxFor(companyId, userId) as never,
      )) as { totalRevenue: number; totalExpenses: number }
      expect(usd.totalRevenue).toBe(500)
      expect(usd.totalExpenses).toBe(200)
    } finally {
      await cleanup(companyId)
    }
  })
})

describe('consolidatedBS — per currency and sign', () => {
  it('balances per currency with positive liability/equity totals', async () => {
    const { companyId, userId, assetAccountId, liabilityAccountId } = await makeCompany()
    try {
      await postJournal(companyId, userId, '2031-06-01', [
        { accountId: assetAccountId, debit: 200000, credit: 0, currencyCode: 'IQD' },
        { accountId: liabilityAccountId, debit: 0, credit: 200000, currencyCode: 'IQD' },
      ])

      const result = (await resolvers.Query.consolidatedBS(
        null,
        { asOfDate: '2031-06-30' },
        ctxFor(companyId, userId) as never,
      )) as { totalAssets: number; totalLiabilities: number; totalEquity: number; isBalanced: boolean }

      expect(result.totalAssets).toBe(200000)
      // Previously this would have been -200000 (unnegated debit-credit
      // on a credit-normal account) and isBalanced would have been false.
      expect(result.totalLiabilities).toBe(200000)
      expect(result.isBalanced).toBe(true)
    } finally {
      await cleanup(companyId)
    }
  })
})

describe('consolidatedPL — real cross-company consolidation', () => {
  it('sums two companies\' revenue under one shared group account, with a per-company breakdown', async () => {
    const companyA = await makeCompany()
    const companyB = await makeCompany()
    try {
      const groupRes = await pool.query<{ id: string }>(
        `SELECT id FROM group_chart_of_accounts WHERE code = '4100'`,
      )
      const groupId = groupRes.rows[0]!.id
      await pool.query(`UPDATE chart_of_accounts SET group_account_id=$1 WHERE id=$2`, [
        groupId,
        companyA.revenueAccountId,
      ])
      await pool.query(`UPDATE chart_of_accounts SET group_account_id=$1 WHERE id=$2`, [
        groupId,
        companyB.revenueAccountId,
      ])

      await postJournal(companyA.companyId, companyA.userId, '2031-08-01', [
        { accountId: companyA.revenueAccountId, debit: 0, credit: 1000, currencyCode: 'IQD' },
        { accountId: companyA.expenseAccountId, debit: 1000, credit: 0, currencyCode: 'IQD' },
      ])
      await postJournal(companyB.companyId, companyB.userId, '2031-08-02', [
        { accountId: companyB.revenueAccountId, debit: 0, credit: 400, currencyCode: 'IQD' },
        { accountId: companyB.expenseAccountId, debit: 400, credit: 0, currencyCode: 'IQD' },
      ])

      const result = (await resolvers.Query.consolidatedPL(
        null,
        { fromDate: '2031-08-01', toDate: '2031-08-31', currencyCode: 'IQD' },
        ctxFor(companyA.companyId, companyA.userId) as never,
      )) as {
        totalRevenue: number
        rows: { accountCode: string; consolidated: number; companies: Record<string, number> }[]
      }
      expect(result.totalRevenue).toBe(1400) // 1000 + 400, combined under group code 4100
      const revenueRow = result.rows.find((r) => r.accountCode === '4100')!
      expect(revenueRow.companies[companyA.companyId]).toBe(-1000) // credit-normal: debit-credit is negative
      expect(revenueRow.companies[companyB.companyId]).toBe(-400)
    } finally {
      await cleanup(companyA.companyId)
      await cleanup(companyB.companyId)
    }
  })

  it('nets interco eliminations against the dedicated Intercompany Payable/Receivable group rows', async () => {
    const companyA = await makeCompany()
    const companyB = await makeCompany()
    try {
      const groupRes = await pool.query<{ code: string; id: string }>(
        `SELECT code, id FROM group_chart_of_accounts WHERE code IN ('1160','2140')`,
      )
      const receivableGroupId = groupRes.rows.find((r) => r.code === '1160')!.id
      const payableGroupId = groupRes.rows.find((r) => r.code === '2140')!.id
      // Reuse the asset/liability test accounts as the Intercompany
      // Receivable (company A) / Payable (company B) accounts.
      await pool.query(`UPDATE chart_of_accounts SET group_account_id=$1 WHERE id=$2`, [
        receivableGroupId,
        companyA.assetAccountId,
      ])
      await pool.query(`UPDATE chart_of_accounts SET group_account_id=$1 WHERE id=$2`, [
        payableGroupId,
        companyB.liabilityAccountId,
      ])

      await postJournal(companyA.companyId, companyA.userId, '2031-09-01', [
        { accountId: companyA.assetAccountId, debit: 500, credit: 0, currencyCode: 'IQD' },
        { accountId: companyA.revenueAccountId, debit: 0, credit: 500, currencyCode: 'IQD' },
      ])
      await postJournal(companyB.companyId, companyB.userId, '2031-09-01', [
        { accountId: companyB.expenseAccountId, debit: 500, credit: 0, currencyCode: 'IQD' },
        { accountId: companyB.liabilityAccountId, debit: 0, credit: 500, currencyCode: 'IQD' },
      ])
      const fromJe = await pool.query<{ id: string }>(
        `SELECT id FROM journal_entries WHERE company_id=$1 ORDER BY created_at DESC LIMIT 1`,
        [companyA.companyId],
      )
      const toJe = await pool.query<{ id: string }>(
        `SELECT id FROM journal_entries WHERE company_id=$1 ORDER BY created_at DESC LIMIT 1`,
        [companyB.companyId],
      )
      await pool.query(
        `INSERT INTO interco_transactions
           (from_company_id, to_company_id, transaction_type, amount, currency_code, status,
            from_journal_entry_id, to_journal_entry_id, created_by)
         VALUES ($1,$2,'service_charge',500,'IQD','posted',$3,$4,$5)`,
        [companyA.companyId, companyB.companyId, fromJe.rows[0]!.id, toJe.rows[0]!.id, companyA.userId],
      )

      const result = (await resolvers.Query.consolidatedBS(
        null,
        { asOfDate: '2031-09-30', currencyCode: 'IQD' },
        ctxFor(companyA.companyId, companyA.userId) as never,
      )) as { rows: { accountCode: string; eliminated: number }[] }
      const receivableRow = result.rows.find((r) => r.accountCode === '1160')!
      const payableRow = result.rows.find((r) => r.accountCode === '2140')!
      expect(receivableRow.eliminated).toBe(500)
      expect(payableRow.eliminated).toBe(500)
    } finally {
      await pool.query(
        `DELETE FROM interco_transactions WHERE from_company_id=$1 OR to_company_id=$1`,
        [companyA.companyId],
      )
      await cleanup(companyA.companyId)
      await cleanup(companyB.companyId)
    }
  })
})

describe('consolidatedTrialBalance — per currency', () => {
  it('keeps IQD and USD debit/credit totals apart', async () => {
    const { companyId, userId, assetAccountId, liabilityAccountId } = await makeCompany()
    try {
      await postJournal(companyId, userId, '2031-07-01', [
        { accountId: assetAccountId, debit: 90000, credit: 0, currencyCode: 'IQD' },
        { accountId: liabilityAccountId, debit: 0, credit: 90000, currencyCode: 'IQD' },
      ])
      await postJournal(companyId, userId, '2031-07-02', [
        { accountId: assetAccountId, debit: 40, credit: 0, currencyCode: 'USD' },
        { accountId: liabilityAccountId, debit: 0, credit: 40, currencyCode: 'USD' },
      ])

      const iqd = (await resolvers.Query.consolidatedTrialBalance(
        null,
        { asOfDate: '2031-07-31' },
        ctxFor(companyId, userId) as never,
      )) as { totalDebits: number; totalCredits: number; isBalanced: boolean }
      expect(iqd.totalDebits).toBe(90000)
      expect(iqd.totalCredits).toBe(90000)
      expect(iqd.isBalanced).toBe(true)

      const usd = (await resolvers.Query.consolidatedTrialBalance(
        null,
        { asOfDate: '2031-07-31', currencyCode: 'USD' },
        ctxFor(companyId, userId) as never,
      )) as { totalDebits: number; totalCredits: number }
      expect(usd.totalDebits).toBe(40)
      expect(usd.totalCredits).toBe(40)
    } finally {
      await cleanup(companyId)
    }
  })
})
