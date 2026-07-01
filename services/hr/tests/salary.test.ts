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
})

afterAll(async () => {
  await cleanHRData(employeeId)
  await pool.end()
})

describe('Salary config versioning', () => {
  it('creates initial salary config', async () => {
    const res = await request(app)
      .post('/hr/salary')
      .set('Authorization', `Bearer ${token}`)
      .send({
        employee_id: employeeId,
        base_salary: 1_000_000,
        currency_code: 'IQD',
        housing_allowance: 200_000,
        transport_allowance: 100_000,
        other_allowances: 0,
        income_tax_pct: 0.05,
        social_security_pct: 0.03,
        effective_from: '2025-01-01',
      })
    expect(res.status).toBe(201)
    expect(parseFloat(res.body.data.base_salary)).toBe(1_000_000)
    expect(res.body.data.effective_to).toBeNull()
  })

  it('GET /current returns the active config', async () => {
    const res = await request(app)
      .get(`/hr/salary/${employeeId}/current`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(parseFloat(res.body.data.base_salary)).toBe(1_000_000)
    expect(res.body.data.effective_to).toBeNull()
  })

  it('creating a new config closes the previous one', async () => {
    const res = await request(app)
      .post('/hr/salary')
      .set('Authorization', `Bearer ${token}`)
      .send({
        employee_id: employeeId,
        base_salary: 1_200_000,
        currency_code: 'IQD',
        housing_allowance: 200_000,
        transport_allowance: 100_000,
        other_allowances: 0,
        income_tax_pct: 0.05,
        social_security_pct: 0.03,
        effective_from: '2025-07-01',
      })
    expect(res.status).toBe(201)
    expect(parseFloat(res.body.data.base_salary)).toBe(1_200_000)
    expect(res.body.data.effective_to).toBeNull()

    // Previous config should now have effective_to = '2025-06-30'
    const all = await request(app)
      .get(`/hr/salary/${employeeId}`)
      .set('Authorization', `Bearer ${token}`)
    expect(all.status).toBe(200)
    expect(all.body.data).toHaveLength(2)
    const old = (all.body.data as Array<{ base_salary: string; effective_to: string | null }>)
      .find(c => parseFloat(c.base_salary) === 1_000_000)
    expect(old?.effective_to?.slice(0, 10)).toBe('2025-06-30')
  })

  it('GET /current reflects new salary', async () => {
    const res = await request(app)
      .get(`/hr/salary/${employeeId}/current`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(parseFloat(res.body.data.base_salary)).toBe(1_200_000)
  })

  it('only one active config exists (unique partial index enforced)', async () => {
    const result = await pool.query(
      `SELECT COUNT(*) AS cnt FROM salary_configs WHERE employee_id = $1 AND effective_to IS NULL`,
      [employeeId],
    )
    expect(parseInt((result.rows[0] as { cnt: string })['cnt'])).toBe(1)
  })
})
