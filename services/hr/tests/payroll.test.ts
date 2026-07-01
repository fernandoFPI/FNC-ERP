import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { pool } from '@fnc-erp/db'
import { createTestUser, createTestEmployee, cleanHRData, TEST_COMPANY_ID } from './setup.js'

const app = createApp()
let token: string
let userId: string
let employeeId: string

beforeAll(async () => {
  const user = await createTestUser()
  token = user.token
  userId = user.userId
  employeeId = await createTestEmployee(userId)

  // Seed salary config for payroll tests
  await pool.query(
    `INSERT INTO salary_configs (employee_id, company_id, base_salary, currency_code,
     housing_allowance, transport_allowance, other_allowances,
     income_tax_pct, social_security_pct, effective_from, created_by)
     VALUES ($1,$2,1200000,'IQD',200000,100000,0,0.05,0.03,'2025-01-01',$3)
     ON CONFLICT DO NOTHING`,
    [employeeId, TEST_COMPANY_ID, userId],
  )

  // Seed 5h overtime for May
  await pool.query(
    `INSERT INTO overtime_logs (employee_id, company_id, work_date, regular_hours, overtime_hours)
     VALUES ($1,$2,'2025-05-10',8,5)
     ON CONFLICT (employee_id, work_date) DO NOTHING`,
    [employeeId, TEST_COMPANY_ID],
  )
})

afterAll(async () => {
  await cleanHRData(employeeId)
  await pool.end()
})

describe('Payroll run lifecycle', () => {
  let runId: string

  it('creates a draft payroll run', async () => {
    const res = await request(app)
      .post('/hr/payroll')
      .set('Authorization', `Bearer ${token}`)
      .send({ period_name: 'TEST-2025-05', start_date: '2025-05-01', end_date: '2025-05-31' })
    expect(res.status).toBe(201)
    expect(res.body.data.status).toBe('draft')
    runId = res.body.data.id as string
  })

  it('rejects duplicate period', async () => {
    const res = await request(app)
      .post('/hr/payroll')
      .set('Authorization', `Bearer ${token}`)
      .send({ period_name: 'TEST-2025-05', start_date: '2025-05-01', end_date: '2025-05-31' })
    expect(res.status).toBe(409)
  })

  it('processes payroll and computes payslip correctly', async () => {
    const res = await request(app)
      .post(`/hr/payroll/${runId}/process`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('approved')
    expect(parseFloat(res.body.data.total_gross)).toBeGreaterThan(0)

    // Verify payslip maths
    const slips = await request(app)
      .get(`/hr/payroll/${runId}/payslips`)
      .set('Authorization', `Bearer ${token}`)
    expect(slips.status).toBe(200)
    const payslip = (slips.body.data as Array<{ employee_id: string; gross_salary: string; net_salary: string; overtime_pay: string; income_tax: string; social_security: string }>)
      .find(p => p.employee_id === employeeId)
    expect(payslip).toBeDefined()

    // Base: 1,200,000 + Housing: 200,000 + Transport: 100,000 = 1,500,000
    // OT: 1,200,000 / 30 / 8 * 1.5 * 5h = 37,500
    // Gross = 1,537,500
    const expectedGross = 1_537_500
    expect(parseFloat(payslip!.gross_salary)).toBeCloseTo(expectedGross, 0)

    // Income tax = 5% of gross = 76,875
    // SS = 3% of base = 36,000
    // Net = 1,537,500 - 76,875 - 36,000 = 1,424,625
    expect(parseFloat(payslip!.income_tax)).toBeCloseTo(76_875, 0)
    expect(parseFloat(payslip!.social_security)).toBeCloseTo(36_000, 0)
    expect(parseFloat(payslip!.net_salary)).toBeCloseTo(1_424_625, 0)
  })

  it('cannot process an already-approved run', async () => {
    const res = await request(app)
      .post(`/hr/payroll/${runId}/process`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(409)
  })

  it('cancels the run', async () => {
    const res = await request(app)
      .post(`/hr/payroll/${runId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('cancelled')
  })
})
