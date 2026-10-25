// 0.1 sweep: employee-advances /summary and /dashboard byEmployee, and
// expense-claims /summary, all summed straight across every currency_code
// unlike their already-fixed sibling /dashboard queries. Real-Postgres
// pattern.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { pool } from '@fnc-erp/db'
import { TEST_COMPANY_ID, createTestUser, getAccountId } from './setup.js'

const app = createApp()
const PREFIX = 'G-ADVEXP-TEST-'

let token: string
let employeeId: string
let cashAccountId: string
let advanceAssetAccountId: string

async function cleanup(): Promise<void> {
  await pool.query(`DELETE FROM expense_claims WHERE claim_number LIKE $1`, [`${PREFIX}%`])
  await pool.query(`DELETE FROM employee_advances WHERE advance_number LIKE $1`, [`${PREFIX}%`])
  await pool.query(`DELETE FROM employees WHERE employee_number LIKE $1`, [`${PREFIX}%`])
}

beforeAll(async () => {
  await cleanup()
  const user = await createTestUser()
  token = user.token
  cashAccountId = await getAccountId('1100')
  advanceAssetAccountId = await getAccountId('1200')

  const empRes = await pool.query<{ id: string }>(
    `INSERT INTO employees (company_id, first_name, last_name, hire_date, employee_number, status)
     VALUES ($1,'AdvExp','Tester',CURRENT_DATE,$2,'active') RETURNING id`,
    [TEST_COMPANY_ID, `${PREFIX}${Date.now()}`],
  )
  employeeId = empRes.rows[0]!.id

  // Same employee, two currencies -- the point of this fixture.
  await pool.query(
    `INSERT INTO employee_advances
       (company_id, advance_number, employee_id, employee_name, currency_code, amount,
        cash_account_id, advance_account_id, status)
     VALUES ($1,$2,$3,'AdvExp Tester','IQD',500000,$4,$5,'approved')`,
    [TEST_COMPANY_ID, `${PREFIX}IQD-${Date.now()}`, employeeId, cashAccountId, advanceAssetAccountId],
  )
  await pool.query(
    `INSERT INTO employee_advances
       (company_id, advance_number, employee_id, employee_name, currency_code, amount,
        cash_account_id, advance_account_id, status)
     VALUES ($1,$2,$3,'AdvExp Tester','USD',300,$4,$5,'approved')`,
    [TEST_COMPANY_ID, `${PREFIX}USD-${Date.now()}`, employeeId, cashAccountId, advanceAssetAccountId],
  )

  await pool.query(
    `INSERT INTO expense_claims (company_id, claim_number, employee_id, employee_name, currency_code, total_amount, status)
     VALUES ($1,$2,$3,'AdvExp Tester','IQD',80000,'submitted')`,
    [TEST_COMPANY_ID, `${PREFIX}IQD-${Date.now()}`, employeeId],
  )
  await pool.query(
    `INSERT INTO expense_claims (company_id, claim_number, employee_id, employee_name, currency_code, total_amount, status)
     VALUES ($1,$2,$3,'AdvExp Tester','USD',40,'submitted')`,
    [TEST_COMPANY_ID, `${PREFIX}USD-${Date.now()}`, employeeId],
  )
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM sessions WHERE refresh_token_hash = 'test-refresh-hash-finance'`)
  await pool.query(`DELETE FROM users WHERE email = 'finance-test@fnc-erp.local'`)
  await pool.end()
})

describe('GET /finance/advances/summary — per currency', () => {
  it('keeps IQD and USD outstanding totals apart', async () => {
    const iqd = await request(app)
      .get('/finance/advances/summary?currency_code=IQD')
      .set('Authorization', `Bearer ${token}`)
    expect(iqd.status).toBe(200)
    expect(iqd.body.data.currencyCode).toBe('IQD')
    expect(iqd.body.data.availableCurrencies.sort()).toEqual(['IQD', 'USD'])
    expect(parseFloat(iqd.body.data.total_outstanding)).toBe(500000)

    const usd = await request(app)
      .get('/finance/advances/summary?currency_code=USD')
      .set('Authorization', `Bearer ${token}`)
    expect(parseFloat(usd.body.data.total_outstanding)).toBe(300)
  })
})

describe('GET /finance/advances/dashboard — byEmployee per currency', () => {
  it('does not blend one employee\'s IQD and USD advances', async () => {
    const iqd = await request(app)
      .get('/finance/advances/dashboard?currency_code=IQD')
      .set('Authorization', `Bearer ${token}`)
    expect(iqd.status).toBe(200)
    const iqdRow = iqd.body.data.by_employee.find((e: { employee_id: string }) => e.employee_id === employeeId)
    expect(iqdRow).toBeDefined()
    expect(iqdRow.currency_code).toBe('IQD')
    expect(parseFloat(iqdRow.total_outstanding)).toBe(500000)

    const usd = await request(app)
      .get('/finance/advances/dashboard?currency_code=USD')
      .set('Authorization', `Bearer ${token}`)
    const usdRow = usd.body.data.by_employee.find((e: { employee_id: string }) => e.employee_id === employeeId)
    expect(usdRow).toBeDefined()
    expect(parseFloat(usdRow.total_outstanding)).toBe(300)
  })
})

describe('GET /finance/expense-claims/summary — per currency', () => {
  it('keeps IQD and USD pending amounts apart', async () => {
    const iqd = await request(app)
      .get('/finance/expense-claims/summary?currency_code=IQD')
      .set('Authorization', `Bearer ${token}`)
    expect(iqd.status).toBe(200)
    expect(iqd.body.data.currencyCode).toBe('IQD')
    expect(iqd.body.data.availableCurrencies.sort()).toEqual(['IQD', 'USD'])
    expect(parseFloat(iqd.body.data.pending_amount)).toBe(80000)

    const usd = await request(app)
      .get('/finance/expense-claims/summary?currency_code=USD')
      .set('Authorization', `Bearer ${token}`)
    expect(parseFloat(usd.body.data.pending_amount)).toBe(40)
  })
})
