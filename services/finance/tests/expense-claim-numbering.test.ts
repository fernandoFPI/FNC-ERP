// Claim numbers are the highest existing EXP-YYYY-NNNN plus one, not COUNT(*)+1.
// Regression: Al Watanyia had 25 claims with a highest number of 0028 after three
// claims were moved to another company, so count+1 = 0026 already existed and
// every submit failed on the (company_id, claim_number) unique key. Same
// real-Postgres + supertest pattern as expense-claims-funding.test.ts.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { pool } from '@fnc-erp/db'
import { TEST_COMPANY_ID, createTestUser, cleanFinanceData, getAccountId } from './setup.js'

const app = createApp()
const yr = new Date().getFullYear()
const num = (n: number): string => `EXP-${yr}-${String(n).padStart(4, '0')}`

let token: string
let employeeId: string
let categoryId: string

async function cleanFixtures(): Promise<void> {
  await pool.query(`DELETE FROM expense_claim_lines WHERE company_id=$1`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM expense_claims WHERE company_id=$1`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM expense_categories WHERE company_id=$1`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM employees WHERE employee_number='EXP-NUMBERING-TEST'`)
}

async function seedClaim(claimNumber: string): Promise<void> {
  await pool.query(
    `INSERT INTO expense_claims (company_id, claim_number, employee_id, employee_name, total_amount, status)
     VALUES ($1,$2,$3,'Numbering Tester',1000,'submitted')`,
    [TEST_COMPANY_ID, claimNumber, employeeId],
  )
}

async function submit(): Promise<request.Response> {
  return request(app)
    .post('/finance/expense-claims/request-self')
    .set('Authorization', `Bearer ${token}`)
    .send({
      currency_code: 'IQD',
      lines: [{ expense_date: '2026-01-10', category_id: categoryId, description: 'Numbering test', amount: 5000 }],
    })
}

beforeAll(async () => {
  const user = await createTestUser()
  token = user.token
  await cleanFixtures()

  const glAccountId = await getAccountId('5700')
  const empRes = await pool.query<{ id: string }>(
    `INSERT INTO employees (company_id, user_id, first_name, last_name, hire_date, employee_number)
     VALUES ($1,$2,'Numbering','Tester',CURRENT_DATE,'EXP-NUMBERING-TEST')
     ON CONFLICT (company_id, employee_number) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING id`,
    [TEST_COMPANY_ID, user.userId],
  )
  employeeId = empRes.rows[0]!.id
  const catRes = await pool.query<{ id: string }>(
    `INSERT INTO expense_categories (company_id, name, gl_account_id) VALUES ($1,'Numbering Test Category',$2) RETURNING id`,
    [TEST_COMPANY_ID, glAccountId],
  )
  categoryId = catRes.rows[0]!.id
})

afterAll(async () => {
  await cleanFixtures()
  await cleanFinanceData()
  await pool.end()
})

describe('Expense claim numbering', () => {
  it('starts at 0001 when the company has no claims this year', async () => {
    const res = await submit()
    expect(res.status).toBe(201)
    expect(res.body.data.claim_number).toBe(num(1))
  })

  it('goes past the highest number when the count is lower (claims moved out of the company)', async () => {
    await pool.query(`DELETE FROM expense_claim_lines WHERE company_id=$1`, [TEST_COMPANY_ID])
    await pool.query(`DELETE FROM expense_claims WHERE company_id=$1`, [TEST_COMPANY_ID])
    // 3 claims, highest 0004: the old count+1 would pick 0004, which exists.
    await seedClaim(num(1))
    await seedClaim(num(2))
    await seedClaim(num(4))

    const res = await submit()
    expect(res.status).toBe(201)
    expect(res.body.data.claim_number).toBe(num(5))
  })

  it('ignores numbers from other years', async () => {
    await pool.query(`DELETE FROM expense_claim_lines WHERE company_id=$1`, [TEST_COMPANY_ID])
    await pool.query(`DELETE FROM expense_claims WHERE company_id=$1`, [TEST_COMPANY_ID])
    await seedClaim(`EXP-${yr - 1}-0099`)
    await seedClaim(num(7))

    const res = await submit()
    expect(res.status).toBe(201)
    expect(res.body.data.claim_number).toBe(num(8))
  })

  it('gives simultaneous submits distinct numbers', async () => {
    await pool.query(`DELETE FROM expense_claim_lines WHERE company_id=$1`, [TEST_COMPANY_ID])
    await pool.query(`DELETE FROM expense_claims WHERE company_id=$1`, [TEST_COMPANY_ID])
    await seedClaim(num(3))

    const results = await Promise.all([submit(), submit(), submit()])
    for (const r of results) expect(r.status).toBe(201)
    const numbers = results.map((r) => r.body.data.claim_number as string).sort()
    expect(numbers).toEqual([num(4), num(5), num(6)])
  })
})
