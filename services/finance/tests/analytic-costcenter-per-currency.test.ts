// amount_company_currency is retired (it was a real FX conversion for
// manual journal entries only, just the native amount restated for every
// automated producer — blending it across both kinds of line meant
// nothing). /finance/analytic-accounts and /finance/cost-centers used to
// sum it with no currency grouping at all. Fixed to group by
// currency_code and read raw debit/credit. Each fixture line below sets
// amount_company_currency to a deliberately wrong value (999999) so this
// test fails loudly if either route ever reads from it again. Real-Postgres
// pattern, reusing the shared finance test company.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { pool } from '@fnc-erp/db'
import { TEST_COMPANY_ID, createTestUser } from './setup.js'

const app = createApp()
const PREFIX = 'ACYT-'

let token: string
let analyticAccountId: string
let costCenterId: string

async function cleanup() {
  await pool.query(
    `DELETE FROM journal_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE reference LIKE $1)`,
    [`${PREFIX}%`],
  )
  await pool.query(`DELETE FROM journal_entries WHERE reference LIKE $1`, [`${PREFIX}%`])
  await pool.query(`DELETE FROM analytic_accounts WHERE code LIKE $1`, [`${PREFIX}%`])
  await pool.query(`DELETE FROM cost_centers WHERE code LIKE $1`, [`${PREFIX}%`])
  await pool.query(`DELETE FROM chart_of_accounts WHERE name = 'AACC Currency Test Account'`)
}

beforeAll(async () => {
  await cleanup()
  const user = await createTestUser()
  token = user.token

  // chart_of_accounts.code must match ^[0-9]{4}$ while active (migration 242).
  const acctCode = String(9000 + Math.floor(Math.random() * 999))
  const acctRes = await pool.query<{ id: string }>(
    `INSERT INTO chart_of_accounts (company_id, code, name, account_type, is_postable, is_active)
     VALUES ($1,$2,'AACC Currency Test Account','expense',true,true) RETURNING id`,
    [TEST_COMPANY_ID, acctCode],
  )
  const accountId = acctRes.rows[0]!.id

  const aaRes = await pool.query<{ id: string }>(
    `INSERT INTO analytic_accounts (company_id, code, name) VALUES ($1,$2,'AACC Currency Test Analytic') RETURNING id`,
    [TEST_COMPANY_ID, `${PREFIX}${Date.now()}`],
  )
  analyticAccountId = aaRes.rows[0]!.id

  const ccRes = await pool.query<{ id: string }>(
    `INSERT INTO cost_centers (company_id, code, name, type) VALUES ($1,$2,'AACC Currency Test CC','overhead') RETURNING id`,
    [TEST_COMPANY_ID, `${PREFIX}${Date.now()}`],
  )
  costCenterId = ccRes.rows[0]!.id

  const jeRes = await pool.query<{ id: string }>(
    `INSERT INTO journal_entries (company_id, reference, description, entry_date, status, created_by)
     VALUES ($1,$2,'AACC currency test entry',CURRENT_DATE,'posted',$3) RETURNING id`,
    [TEST_COMPANY_ID, `${PREFIX}${Date.now()}`, user.userId],
  )
  const jeId = jeRes.rows[0]!.id

  // IQD: debit 200000, credit 50000. USD: debit 30, credit 5.
  // amount_company_currency is deliberately wrong (999999) on every line.
  await pool.query(
    `INSERT INTO journal_lines (journal_entry_id, account_id, analytic_account_id, cost_center_id, debit, credit, currency_code, amount_company_currency)
     VALUES
       ($1,$2,$3,$4,200000,0,'IQD',999999),
       ($1,$2,$3,$4,0,50000,'IQD',999999),
       ($1,$2,$3,$4,30,0,'USD',999999),
       ($1,$2,$3,$4,0,5,'USD',999999)`,
    [jeId, accountId, analyticAccountId, costCenterId],
  )
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM sessions WHERE refresh_token_hash = 'test-refresh-hash-finance'`)
  await pool.query(`DELETE FROM users WHERE email = 'finance-test@fnc-erp.local'`)
  await pool.end()
})

describe('GET /finance/analytic-accounts — per currency, ignores amount_company_currency', () => {
  it('list: reports one currencyTotals entry per currency with the real debit/credit', async () => {
    const res = await request(app)
      .get('/finance/analytic-accounts')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    const row = res.body.data.find((r: { id: string }) => r.id === analyticAccountId)
    expect(row).toBeDefined()
    expect(row.currency_totals).toHaveLength(2)
    const iqd = row.currency_totals.find((c: { currency_code: string }) => c.currency_code === 'IQD')
    const usd = row.currency_totals.find((c: { currency_code: string }) => c.currency_code === 'USD')
    expect(parseFloat(iqd.total_debits)).toBe(200000)
    expect(parseFloat(iqd.total_credits)).toBe(50000)
    expect(parseFloat(usd.total_debits)).toBe(30)
    expect(parseFloat(usd.total_credits)).toBe(5)
  })

  it('detail: same per-currency breakdown, and lines carry their own currency_code', async () => {
    const res = await request(app)
      .get(`/finance/analytic-accounts/${analyticAccountId}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.currency_totals).toHaveLength(2)
    const usd = res.body.data.currency_totals.find((c: { currency_code: string }) => c.currency_code === 'USD')
    expect(parseFloat(usd.total_debits)).toBe(30)
    expect(res.body.data.lines).toHaveLength(4)
    for (const line of res.body.data.lines as { amount_company_currency?: string }[]) {
      expect(line.amount_company_currency).toBeUndefined()
    }
  })
})

describe('GET /finance/cost-centers/:id — per currency, ignores amount_company_currency', () => {
  it('reports one currencyTotals entry per currency with the real debit/credit', async () => {
    const res = await request(app)
      .get(`/finance/cost-centers/${costCenterId}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.currency_totals).toHaveLength(2)
    const iqd = res.body.data.currency_totals.find((c: { currency_code: string }) => c.currency_code === 'IQD')
    expect(parseFloat(iqd.total_debits)).toBe(200000)
    expect(parseFloat(iqd.total_credits)).toBe(50000)
  })
})
