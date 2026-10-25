// 0.1 sweep: /reporting/cash-flow's 5 sub-queries (net income, asset/
// liability/equity changes, opening/closing cash) all summed journal_lines
// straight across every currency_code, so the operating/financing totals
// and the activities-vs-cash `validated` cross-check were meaningless the
// moment a company posted in more than one currency. Real-Postgres
// pattern, reusing cash-flow-bank-accounts.test.ts's fixture shape.
import request from 'supertest'
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { pool } from '@fnc-erp/db'
import { createApp } from '../src/app.js'
import { createTestUser, cleanReportingData, TEST_COMPANY_ID } from './setup.js'

const app = createApp()
const PREFIX = 'G-CASHFLOW-CUR-TEST'
const FROM_DATE = '2031-07-01'
const TO_DATE = '2031-07-31'

let token: string
let cashAccountId: string
let revenueAccountId: string

beforeAll(async () => {
  const user = await createTestUser()
  token = user.token

  await pool.query(
    `UPDATE chart_of_accounts SET account_category='CASH', is_postable=true
     WHERE company_id=$1 AND code='1100'`,
    [TEST_COMPANY_ID],
  )
  const cashRes = await pool.query<{ id: string }>(
    `SELECT id FROM chart_of_accounts WHERE company_id=$1 AND code='1100'`,
    [TEST_COMPANY_ID],
  )
  cashAccountId = cashRes.rows[0]!.id
  const revRes = await pool.query<{ id: string }>(
    `SELECT id FROM chart_of_accounts WHERE company_id=$1 AND code='4100'`,
    [TEST_COMPANY_ID],
  )
  revenueAccountId = revRes.rows[0]!.id

  const iqdJe = await pool.query<{ id: string }>(
    `INSERT INTO journal_entries (company_id, reference, description, entry_date, status, source_type, created_by)
     VALUES ($1,$2,'IQD cash sale',$3,'posted','manual',(SELECT id FROM users LIMIT 1)) RETURNING id`,
    [TEST_COMPANY_ID, `${PREFIX}-IQD`, FROM_DATE],
  )
  await pool.query(
    `INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, currency_code, amount_company_currency)
     VALUES ($1,$2,500000,0,'IQD',500000), ($1,$3,0,500000,'IQD',500000)`,
    [iqdJe.rows[0]!.id, cashAccountId, revenueAccountId],
  )

  const usdJe = await pool.query<{ id: string }>(
    `INSERT INTO journal_entries (company_id, reference, description, entry_date, status, source_type, created_by)
     VALUES ($1,$2,'USD cash sale',$3,'posted','manual',(SELECT id FROM users LIMIT 1)) RETURNING id`,
    [TEST_COMPANY_ID, `${PREFIX}-USD`, FROM_DATE],
  )
  await pool.query(
    `INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, currency_code, amount_company_currency)
     VALUES ($1,$2,300,0,'USD',300), ($1,$3,0,300,'USD',300)`,
    [usdJe.rows[0]!.id, cashAccountId, revenueAccountId],
  )
})

afterAll(async () => {
  await pool.query(
    `DELETE FROM journal_lines WHERE journal_entry_id IN
      (SELECT id FROM journal_entries WHERE company_id=$1 AND reference LIKE $2)`,
    [TEST_COMPANY_ID, `${PREFIX}%`],
  )
  await pool.query(`DELETE FROM journal_entries WHERE company_id=$1 AND reference LIKE $2`, [
    TEST_COMPANY_ID,
    `${PREFIX}%`,
  ])
  await cleanReportingData()
})

describe('GET /reporting/cash-flow — per currency', () => {
  it('keeps IQD and USD net income/cash movements apart', async () => {
    const iqd = await request(app)
      .get(`/reporting/cash-flow?from_date=${FROM_DATE}&to_date=${TO_DATE}&company_id=${TEST_COMPANY_ID}`)
      .set('Authorization', `Bearer ${token}`)
    expect(iqd.status).toBe(200)
    expect(iqd.body.data.currencyCode).toBe('IQD')
    expect(iqd.body.data.availableCurrencies.sort()).toEqual(['IQD', 'USD'])
    // Must be the 500000 IQD sale only, never 500300 (if the USD line
    // leaked in unconverted).
    expect(iqd.body.data.summary.closing_cash_balance).toBe(500000)
    expect(iqd.body.data.operating.lines[0]!.amount).toBe(500000)
    expect(iqd.body.data.summary.validated).toBe(true)

    const usd = await request(app)
      .get(
        `/reporting/cash-flow?from_date=${FROM_DATE}&to_date=${TO_DATE}&company_id=${TEST_COMPANY_ID}&currency_code=USD`,
      )
      .set('Authorization', `Bearer ${token}`)
    expect(usd.status).toBe(200)
    expect(usd.body.data.summary.closing_cash_balance).toBe(300)
    expect(usd.body.data.summary.validated).toBe(true)
  })
})
