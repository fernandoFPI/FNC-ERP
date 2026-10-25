// Highest-severity finding in the payroll currency sweep: payroll run
// generation summed every 'pending' salary_deduction_requests row for an
// employee with no currency_code check, even though the only creator of
// these rows (a PO-return damage deduction, services/gateway/src/graphql/
// resolvers.ts ~14164) inherits the RETURN's own currency_code, which has
// no relation to the employee's payroll currency. A mismatched-currency
// deduction would get subtracted unconverted from net_salary. Real API +
// Postgres pattern, following the same shape as payroll.test.ts.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { pool } from '@fnc-erp/db'
import { createTestUser, createTestEmployee, cleanHRData, TEST_COMPANY_ID } from './setup.js'

const app = createApp()
const PREFIX = 'G-SALDED-TEST-'

let token: string
let userId: string
let employeeId: string
let iqdDeductionId: string
let usdDeductionId: string

beforeAll(async () => {
  const user = await createTestUser()
  token = user.token
  userId = user.userId
  employeeId = await createTestEmployee(userId)

  await pool.query(
    `INSERT INTO salary_configs (employee_id, company_id, base_salary, currency_code,
     housing_allowance, transport_allowance, other_allowances,
     income_tax_pct, social_security_pct, effective_from, created_by)
     VALUES ($1,$2,1000000,'IQD',0,0,0,0,0,'2025-01-01',$3)
     ON CONFLICT DO NOTHING`,
    [employeeId, TEST_COMPANY_ID, userId],
  )

  const iqdRes = await pool.query<{ id: string }>(
    `INSERT INTO salary_deduction_requests (company_id, employee_id, source_type, source_id, amount, currency_code, reason, created_by)
     VALUES ($1,$2,'po_return','00000000-0000-0000-0000-000000000001',50000,'IQD',$3,$4) RETURNING id`,
    [TEST_COMPANY_ID, employeeId, `${PREFIX}iqd`, userId],
  )
  iqdDeductionId = iqdRes.rows[0]!.id

  const usdRes = await pool.query<{ id: string }>(
    `INSERT INTO salary_deduction_requests (company_id, employee_id, source_type, source_id, amount, currency_code, reason, created_by)
     VALUES ($1,$2,'po_return','00000000-0000-0000-0000-000000000002',50,'USD',$3,$4) RETURNING id`,
    [TEST_COMPANY_ID, employeeId, `${PREFIX}usd`, userId],
  )
  usdDeductionId = usdRes.rows[0]!.id
})

afterAll(async () => {
  await pool.query(`DELETE FROM salary_deduction_requests WHERE id = ANY($1)`, [
    [iqdDeductionId, usdDeductionId].filter(Boolean),
  ])
  await cleanHRData(employeeId)
  await pool.end()
})

describe('Payroll run — salary deduction currency matching', () => {
  let runId: string

  it('creates and processes a payroll run', async () => {
    const createRes = await request(app)
      .post('/hr/payroll')
      .set('Authorization', `Bearer ${token}`)
      .send({ period_name: 'TEST-2031-06', start_date: '2031-06-01', end_date: '2031-06-30' })
    expect(createRes.status).toBe(201)
    runId = createRes.body.data.id as string

    const processRes = await request(app)
      .post(`/hr/payroll/${runId}/process`)
      .set('Authorization', `Bearer ${token}`)
    expect(processRes.status).toBe(200)
  })

  it('applies only the matching-currency deduction to net_salary', async () => {
    const slips = await request(app)
      .get(`/hr/payroll/${runId}/payslips`)
      .set('Authorization', `Bearer ${token}`)
    const payslip = (
      slips.body.data as Array<{ employee_id: string; gross_salary: string; net_salary: string; other_deductions: string }>
    ).find((p) => p.employee_id === employeeId)
    expect(payslip).toBeDefined()
    expect(parseFloat(payslip!.gross_salary)).toBeCloseTo(1_000_000, 0)
    // Only the 50000 IQD deduction may be applied -- never the 50 USD one
    // on top (the pre-fix bug would have produced 1,000,000 - 50,050).
    expect(parseFloat(payslip!.other_deductions)).toBeCloseTo(50_000, 0)
    expect(parseFloat(payslip!.net_salary)).toBeCloseTo(950_000, 0)
  })

  it('marks the IQD deduction applied and leaves the USD one pending', async () => {
    const rows = await pool.query<{ id: string; status: string }>(
      `SELECT id, status FROM salary_deduction_requests WHERE id = ANY($1)`,
      [[iqdDeductionId, usdDeductionId]],
    )
    const iqd = rows.rows.find((r) => r.id === iqdDeductionId)
    const usd = rows.rows.find((r) => r.id === usdDeductionId)
    expect(iqd!.status).toBe('applied')
    expect(usd!.status).toBe('pending')
  })
})
