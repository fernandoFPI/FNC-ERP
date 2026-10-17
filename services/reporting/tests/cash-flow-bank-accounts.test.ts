// G1/G2: the cash-flow report classified cash by code prefix '11%', which
// only ever matched CASH-categorized accounts. Every BANK-categorized
// account (the real chart's 1220-1225 — Banks, Bank Accounts IQD/USD,
// Short-term Deposits, Cheques Under Collection) sits under '12%', so a
// bank balance movement was both excluded from the opening/closing cash
// reconciliation AND wrongly counted as a "non-cash asset change" in
// operating activities. Fixed to classify by account_category instead.
// Uses a BANK-categorized account scoped to this test, since the shared
// reporting test fixture's chart (seed-test-fixtures.ts) predates
// migration 236 and leaves account_category unset.
import request from 'supertest'
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { pool } from '@fnc-erp/db'
import { createApp } from '../src/app.js'
import { createTestUser, cleanReportingData, TEST_COMPANY_ID } from './setup.js'

const app = createApp()
let token: string
let bankAccountId: string
let revenueAccountId: string
const TEST_BANK_CODE = '1221'
const ENTRY_DATE = '2031-06-15'
const FROM_DATE = '2031-06-01'
const TO_DATE = '2031-06-30'

beforeAll(async () => {
  const user = await createTestUser()
  token = user.token

  await pool.query(
    `UPDATE chart_of_accounts SET account_category='CASH', is_postable=true
     WHERE company_id=$1 AND code='1100'`,
    [TEST_COMPANY_ID],
  )

  const bankRes = await pool.query<{ id: string }>(
    `INSERT INTO chart_of_accounts (company_id, code, name, account_type, account_category, is_postable, is_active)
     VALUES ($1,$2,'Test Bank Account','asset','BANK',true,true)
     ON CONFLICT (company_id, code) DO UPDATE SET account_category='BANK', is_postable=true
     RETURNING id`,
    [TEST_COMPANY_ID, TEST_BANK_CODE],
  )
  bankAccountId = bankRes.rows[0]!.id

  const revRes = await pool.query<{ id: string }>(
    `SELECT id FROM chart_of_accounts WHERE company_id=$1 AND code='4100'`,
    [TEST_COMPANY_ID],
  )
  revenueAccountId = revRes.rows[0]!.id

  const jeRes = await pool.query<{ id: string }>(
    `INSERT INTO journal_entries (company_id, reference, description, entry_date, status, source_type, created_by)
     VALUES ($1,'G1G2-CASHFLOW-TEST','Test bank deposit',$2,'posted','manual',
       (SELECT id FROM users LIMIT 1))
     RETURNING id`,
    [TEST_COMPANY_ID, ENTRY_DATE],
  )
  const jeId = jeRes.rows[0]!.id
  await pool.query(
    `INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, currency_code, amount_company_currency)
     VALUES ($1,$2,500000,0,'IQD',500000), ($1,$3,0,500000,'IQD',500000)`,
    [jeId, bankAccountId, revenueAccountId],
  )
})

afterAll(async () => {
  await pool.query(`DELETE FROM journal_lines WHERE journal_entry_id IN
    (SELECT id FROM journal_entries WHERE company_id=$1 AND reference='G1G2-CASHFLOW-TEST')`, [
    TEST_COMPANY_ID,
  ])
  await pool.query(`DELETE FROM journal_entries WHERE company_id=$1 AND reference='G1G2-CASHFLOW-TEST'`, [
    TEST_COMPANY_ID,
  ])
  await pool.query(`DELETE FROM chart_of_accounts WHERE company_id=$1 AND code=$2`, [
    TEST_COMPANY_ID,
    TEST_BANK_CODE,
  ])
  await cleanReportingData()
})

describe('cash-flow report — BANK-categorized accounts', () => {
  it('counts a bank deposit as cash, not as a non-cash asset change', async () => {
    const res = await request(app)
      .get(
        `/reporting/cash-flow?from_date=${FROM_DATE}&to_date=${TO_DATE}&company_id=${TEST_COMPANY_ID}`,
      )
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)

    // The deposit landed in the BANK account, so the closing cash balance
    // must include it (previously missed entirely by `code LIKE '11%'`).
    expect(res.body.data.summary.closing_cash_balance).toBe(500000)

    // And it must NOT also show up as a working-capital / asset-change
    // line — previously `code NOT LIKE '11%'` failed to exclude a '12xx'
    // bank code, so the same movement was double-counted here too.
    const lines = res.body.data.operating.lines as { code: string }[]
    expect(lines.some((l) => l.code === TEST_BANK_CODE)).toBe(false)

    // Net income (the revenue line) flows straight through to cash with
    // nothing left over once the bank movement isn't double-counted.
    expect(res.body.data.summary.validated).toBe(true)
  })
})
