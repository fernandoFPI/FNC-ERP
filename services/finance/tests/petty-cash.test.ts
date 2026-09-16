// Petty cash floats must post to a real, postable CASH-category Chart of
// Accounts account (e.g. "1211 Main Cashbox") — not any of the ~300
// accounts of every type GET /finance/accounts used to return unfiltered.
// Same real-Postgres + supertest pattern as finance.test.ts.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { pool } from '@fnc-erp/db'
import { TEST_COMPANY_ID, createTestUser, cleanFinanceData, getAccountId } from './setup.js'

const app = createApp()
let token: string
let testUserId: string
let cashAccountId: string
let expenseAccountId: string
let employeeId: string

async function cleanPettyCash(): Promise<void> {
  await pool.query(
    `DELETE FROM petty_cash_transactions WHERE company_id=$1`,
    [TEST_COMPANY_ID],
  )
  await pool.query(
    `DELETE FROM petty_cash_replenishments WHERE company_id=$1`,
    [TEST_COMPANY_ID],
  )
  await pool.query(`DELETE FROM petty_cash_floats WHERE company_id=$1`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM employees WHERE employee_number='PC-TEST-CUSTODIAN'`)
}

beforeAll(async () => {
  const user = await createTestUser()
  token = user.token
  testUserId = user.userId

  // The shared test fixture's "1100 Cash and Bank Accounts" predates
  // migration 236's category/is_postable columns and was never backfilled
  // — set it here so it behaves like a real company's CASH account (code
  // 1211 in production) instead of leaving it uncategorized.
  cashAccountId = await getAccountId('1100')
  await pool.query(`UPDATE chart_of_accounts SET account_category='CASH' WHERE id=$1`, [cashAccountId])
  expenseAccountId = await getAccountId('5100')

  await cleanPettyCash()
  const empRes = await pool.query<{ id: string }>(
    `INSERT INTO employees (company_id, user_id, first_name, last_name, hire_date, employee_number)
     VALUES ($1,$2,'Test','Custodian',CURRENT_DATE,'PC-TEST-CUSTODIAN')
     ON CONFLICT (company_id, employee_number) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING id`,
    [TEST_COMPANY_ID, testUserId],
  )
  employeeId = empRes.rows[0]!.id
})

afterAll(async () => {
  await cleanPettyCash()
  await cleanFinanceData()
  await pool.end()
})

describe('POST /finance/petty-cash/floats', () => {
  it('rejects a float with no gl_account_id — it is required, not optional', async () => {
    const res = await request(app)
      .post('/finance/petty-cash/floats')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `No Account Float ${Date.now()}`, authorized_limit: 100 })
    expect(res.status).toBe(500) // zod parse failure — no gl_account_id
  })

  it('rejects a non-CASH account (an expense account) with a clear validation error', async () => {
    const res = await request(app)
      .post('/finance/petty-cash/floats')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Wrong Account Float ${Date.now()}`,
        authorized_limit: 100,
        gl_account_id: expenseAccountId,
      })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('VALIDATION')
    expect(res.body.error.message).toMatch(/CASH/)
  })

  it('creates a float against a real CASH account with an employee custodian, and resolves custodian_display_name', async () => {
    const name = `Main Cashbox Float ${Date.now()}`
    const createRes = await request(app)
      .post('/finance/petty-cash/floats')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name,
        authorized_limit: 500,
        opening_balance: 100,
        gl_account_id: cashAccountId,
        custodian_employee_id: employeeId,
      })
    expect(createRes.status).toBe(201)
    expect(createRes.body.data.gl_account_id).toBe(cashAccountId)
    expect(createRes.body.data.custodian_employee_id).toBe(employeeId)

    const floatId = createRes.body.data.id as string
    const listRes = await request(app)
      .get('/finance/petty-cash/floats')
      .set('Authorization', `Bearer ${token}`)
    const row = listRes.body.data.find((f: { id: string }) => f.id === floatId)
    expect(row.custodian_display_name).toBe('Test Custodian')
    expect(row.account_code).toBe('1100')

    const detailRes = await request(app)
      .get(`/finance/petty-cash/floats/${floatId}`)
      .set('Authorization', `Bearer ${token}`)
    expect(detailRes.body.data.custodian_display_name).toBe('Test Custodian')
  })
})

describe('POST /finance/petty-cash/replenishments/:id/approve', () => {
  it('rejects an offset_account_id that is neither CASH nor BANK category', async () => {
    const createRes = await request(app)
      .post('/finance/petty-cash/floats')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Replen Float ${Date.now()}`,
        authorized_limit: 200,
        gl_account_id: cashAccountId,
      })
    const floatId = createRes.body.data.id as string

    const replenRes = await request(app)
      .post(`/finance/petty-cash/floats/${floatId}/replenish`)
      .set('Authorization', `Bearer ${token}`)
      .send({ requested_amount: 50 })
    const replenId = replenRes.body.data.id as string

    const approveRes = await request(app)
      .post(`/finance/petty-cash/replenishments/${replenId}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ approved_amount: 50, offset_account_id: expenseAccountId })
    expect(approveRes.status).toBe(422)
    expect(approveRes.body.error.code).toBe('VALIDATION')
  })
})
