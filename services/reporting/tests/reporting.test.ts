import request from 'supertest'
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { createApp } from '../src/app.js'
import { createTestUser, cleanReportingData, TEST_COMPANY_ID } from './setup.js'

const app = createApp()
let token: string

beforeAll(async () => {
  const user = await createTestUser()
  token = user.token
})

afterAll(async () => {
  await cleanReportingData()
})

describe('Consolidated reporting', () => {
  it('project profitability returns view results', async () => {
    const res = await request(app)
      .get('/reporting/projects/profitability')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  it('WHT compliance report returns rows grouped by vendor', async () => {
    const res = await request(app)
      .get('/reporting/compliance/withholding-tax')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  it('inventory valuation returns total_inventory_value', async () => {
    const res = await request(app)
      .get('/reporting/compliance/inventory-valuation')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveProperty('total_inventory_value')
    expect(res.body.data).toHaveProperty('items')
  })

  it('payroll summary returns period data', async () => {
    const res = await request(app)
      .get('/reporting/payroll/summary')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})
