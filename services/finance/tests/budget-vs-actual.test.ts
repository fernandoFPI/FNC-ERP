// G15: /budget/:id/vs-actual joined gl_budget_lines straight to journal_lines
// on account_id alone, with no period condition on the join itself and no
// je.status filter. gl_budget_lines is normally one row per account PER
// MONTH, so a report spanning N budget-line periods for an account
// multiplied that account's actual by N (every journal line matched every
// one of that account's budget-line rows). Also included unposted entries.
//
// Pre-release pass item 1: actual_amount used to convert a different-
// currency journal line into the budget's own currency via fx_rate --
// real currency exchange, forbidden by the no-currency-exchange policy.
// Now filtered to the budget's own currency only; other-currency activity
// shows up in outsideBudgetCurrency (raw, per-currency, never converted).
// Real-Postgres pattern.
import request from 'supertest'
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { pool } from '@fnc-erp/db'
import { createApp } from '../src/app.js'
import { TEST_COMPANY_ID, createTestUser, getAccountId } from './setup.js'

const app = createApp()
const PREFIX = 'G15-BUDGET-TEST-'

let token: string
let budgetId: string
let accountId: string
let postedJeId: string
let draftJeId: string

async function cleanup(): Promise<void> {
  if (postedJeId || draftJeId) {
    await pool.query(`DELETE FROM journal_lines WHERE journal_entry_id = ANY($1)`, [
      [postedJeId, draftJeId].filter(Boolean),
    ])
  }
  await pool.query(`DELETE FROM journal_entries WHERE reference LIKE $1`, [`${PREFIX}%`])
  await pool.query(`DELETE FROM gl_budgets WHERE name LIKE $1`, [`${PREFIX}%`])
}

beforeAll(async () => {
  await cleanup()
  const user = await createTestUser()
  token = user.token
  accountId = await getAccountId('5300')

  const budgetRes = await pool.query<{ id: string }>(
    `INSERT INTO gl_budgets (company_id, name, fiscal_year, currency_code, status, created_by)
     VALUES ($1,$2,2031,'IQD','active',$3) RETURNING id`,
    [TEST_COMPANY_ID, `${PREFIX}Budget`, user.userId],
  )
  budgetId = budgetRes.rows[0]!.id

  // Two budget-line periods for the SAME account -- this is what triggered
  // the fan-out: a naive single join multiplies actual by however many
  // period rows exist for this account within the report range.
  await pool.query(
    `INSERT INTO gl_budget_lines (budget_id, company_id, account_id, period, amount)
     VALUES ($1,$2,$3,'2031-01',1000), ($1,$2,$3,'2031-02',2000)`,
    [budgetId, TEST_COMPANY_ID, accountId],
  )

  const postedJe = await pool.query<{ id: string }>(
    `INSERT INTO journal_entries (company_id, reference, description, entry_date, status, source_type, created_by)
     VALUES ($1,$2,'posted test entry','2031-01-15','posted','manual',$3) RETURNING id`,
    [TEST_COMPANY_ID, `${PREFIX}posted-${Date.now()}`, user.userId],
  )
  postedJeId = postedJe.rows[0]!.id
  await pool.query(
    `INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, currency_code, amount_company_currency)
     VALUES ($1,$2,500,0,'IQD',500)`,
    [postedJeId, accountId],
  )
  // Same account, a posted USD line -- must never be converted into the
  // IQD budget's comparison (the bug this item removes), and must show up
  // raw in outsideBudgetCurrency instead.
  await pool.query(
    `INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, currency_code, amount_company_currency)
     VALUES ($1,$2,100,0,'USD',100)`,
    [postedJeId, accountId],
  )

  // Draft (unposted) entry with a large amount -- must be excluded entirely.
  const draftJe = await pool.query<{ id: string }>(
    `INSERT INTO journal_entries (company_id, reference, description, entry_date, status, source_type, created_by)
     VALUES ($1,$2,'draft test entry','2031-01-20','draft','manual',$3) RETURNING id`,
    [TEST_COMPANY_ID, `${PREFIX}draft-${Date.now()}`, user.userId],
  )
  draftJeId = draftJe.rows[0]!.id
  await pool.query(
    `INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, currency_code, amount_company_currency)
     VALUES ($1,$2,9999,0,'IQD',9999)`,
    [draftJeId, accountId],
  )
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM sessions WHERE refresh_token_hash = 'test-refresh-hash-finance'`)
  await pool.query(`DELETE FROM users WHERE email = 'finance-test@fnc-erp.local'`)
  await pool.end()
})

describe('GET /finance/budget/:id/vs-actual', () => {
  it('does not multiply actuals by the number of budget-line periods, and excludes unposted entries', async () => {
    const res = await request(app)
      .get(`/finance/budget/${budgetId}/vs-actual?period_from=2031-01&period_to=2031-02`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    const row = res.body.data.rows.find((r: { account_id: string }) => r.account_id === accountId)
    expect(row).toBeDefined()
    expect(row.budget_amount).toBe(3000)
    // Previously this would have been 1000 (the single 500 posted line
    // matched against both the Jan and Feb budget-line rows) and would
    // have included the draft entry's 9999 on top of that.
    expect(row.actual_amount).toBe(500)
  })

  it('does not convert a different-currency line into the budget currency; it shows up raw in outsideBudgetCurrency instead', async () => {
    const res = await request(app)
      .get(`/finance/budget/${budgetId}/vs-actual?period_from=2031-01&period_to=2031-02`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.budget.currency_code).toBe('IQD')

    const row = res.body.data.rows.find((r: { account_id: string }) => r.account_id === accountId)
    // The USD 100 line must NOT be converted and added in here -- this
    // stays exactly 500 (the IQD-only sum), same as the previous test.
    expect(row.actual_amount).toBe(500)

    expect(res.body.data.outsideBudgetCurrency).toHaveLength(1)
    const usd = res.body.data.outsideBudgetCurrency[0]
    expect(usd.currencyCode).toBe('USD')
    expect(usd.amount).toBe(100)
  })
})
