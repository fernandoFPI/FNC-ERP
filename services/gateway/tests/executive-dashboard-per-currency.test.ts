// 0.1 sweep finding #1 (most severe): executiveDashboard's 8 sub-queries
// used to blend every currency's revenue/costs/PO value into one scalar
// on the home page every user sees first. Now takes a currencyCode (one
// at a time, like accountLedger) with an availableCurrencies list for a
// selector. Real-Postgres pattern.
import { describe, it, expect, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const NAME_PREFIX = 'G-EXEC-TEST-'
const TEST_USER_EMAIL = 'g-exec-dashboard-test@fnc-erp.local'

async function makeCompany(): Promise<{
  companyId: string
  userId: string
  revenueAccountId: string
}> {
  const companyRes = await pool.query<{ id: string }>(
    `INSERT INTO companies (name, legal_name, country_code, currency_code)
     VALUES ($1,$1,'IQ','IQD') RETURNING id`,
    [`${NAME_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`],
  )
  const companyId = companyRes.rows[0]!.id
  const accountRes = await pool.query<{ id: string }>(
    `INSERT INTO chart_of_accounts (company_id, code, name, account_type, is_postable, is_active)
     VALUES ($1,'4100','Revenue','revenue',true,true) RETURNING id`,
    [companyId],
  )
  const expenseRes = await pool.query<{ id: string }>(
    `INSERT INTO chart_of_accounts (company_id, code, name, account_type, is_postable, is_active)
     VALUES ($1,'5100','Expense','expense',true,true) RETURNING id`,
    [companyId],
  )
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

  const je = await pool.query<{ id: string }>(
    `INSERT INTO journal_entries (company_id, reference, description, entry_date, status, source_type, created_by)
     VALUES ($1,$2,'test entry',date_trunc('month', CURRENT_DATE),'posted','manual',$3) RETURNING id`,
    [companyId, `${NAME_PREFIX}IQD-${Date.now()}`, userId],
  )
  await pool.query(
    `INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, currency_code, amount_company_currency)
     VALUES ($1,$2,0,900000,'IQD',900000), ($1,$3,300000,0,'IQD',300000)`,
    [je.rows[0]!.id, accountRes.rows[0]!.id, expenseRes.rows[0]!.id],
  )

  const jeUsd = await pool.query<{ id: string }>(
    `INSERT INTO journal_entries (company_id, reference, description, entry_date, status, source_type, created_by)
     VALUES ($1,$2,'test entry',date_trunc('month', CURRENT_DATE),'posted','manual',$3) RETURNING id`,
    [companyId, `${NAME_PREFIX}USD-${Date.now()}`, userId],
  )
  await pool.query(
    `INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, currency_code, amount_company_currency)
     VALUES ($1,$2,0,400,'USD',400), ($1,$3,150,0,'USD',150)`,
    [jeUsd.rows[0]!.id, accountRes.rows[0]!.id, expenseRes.rows[0]!.id],
  )

  return { companyId, userId, revenueAccountId: accountRes.rows[0]!.id }
}

function ctxFor(companyId: string, userId: string) {
  return { auth: { companyId, userId, role: 'company_admin', module: 'all', sessionId: 'exec-dashboard-test' } }
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

describe('executiveDashboard — per currency', () => {
  it('defaults to the company currency, lists both currencies, and never blends revenue across them', async () => {
    const { companyId, userId } = await makeCompany()
    try {
      const defaultResult = (await resolvers.Query.executiveDashboard(
        null,
        {},
        ctxFor(companyId, userId) as never,
      )) as {
        currencyCode: string
        availableCurrencies: string[]
        totalRevenue: number
        totalCosts: number
        netProfit: number
      }

      expect(defaultResult.currencyCode).toBe('IQD')
      expect(defaultResult.availableCurrencies.sort()).toEqual(['IQD', 'USD'])
      expect(defaultResult.totalRevenue).toBe(900000)
      expect(defaultResult.totalCosts).toBe(300000)
      expect(defaultResult.netProfit).toBe(600000)
      // 900000 + 400 = 900400 is what the old blended bug would have
      // produced for revenue — must never appear.
      expect(defaultResult.totalRevenue).not.toBe(900400)

      const usdResult = (await resolvers.Query.executiveDashboard(
        null,
        { currencyCode: 'USD' },
        ctxFor(companyId, userId) as never,
      )) as { currencyCode: string; totalRevenue: number; totalCosts: number }
      expect(usdResult.currencyCode).toBe('USD')
      expect(usdResult.totalRevenue).toBe(400)
      expect(usdResult.totalCosts).toBe(150)
    } finally {
      await cleanupCompany(companyId)
    }
  })
})
