// G19 (0.1 sweep #5): /finance/ar/summary, /wht-recoverable and /by-client
// used to blend project_invoices + rental_invoices across every currency
// into one scalar. Real-Postgres pattern, reusing the shared finance test
// company (confirmed no other finance test file touches project_invoices/
// rental_invoices — see setup.ts).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { pool } from '@fnc-erp/db'
import { TEST_COMPANY_ID, createTestUser } from './setup.js'

const app = createApp()
const PREFIX = 'AR-CUR-TEST-'

let token: string
let projectId: string
let contractId: string

async function cleanup() {
  await pool.query(
    `DELETE FROM project_invoices WHERE invoice_number LIKE $1`,
    [`${PREFIX}%`],
  )
  await pool.query(`DELETE FROM project_contracts WHERE contract_number LIKE $1`, [`${PREFIX}%`])
  await pool.query(`DELETE FROM projects WHERE code LIKE $1`, [`${PREFIX}%`])
}

beforeAll(async () => {
  await cleanup()
  const user = await createTestUser()
  token = user.token

  const projRes = await pool.query<{ id: string }>(
    `INSERT INTO projects (company_id, code, name, status, client_name, created_by)
     VALUES ($1,$2,'AR Currency Test Project','ongoing','AR Currency Test Client',$3) RETURNING id`,
    [TEST_COMPANY_ID, `${PREFIX}${Date.now()}`, user.userId],
  )
  projectId = projRes.rows[0]!.id

  const contractRes = await pool.query<{ id: string }>(
    `INSERT INTO project_contracts
       (project_id, company_id, contract_number, contract_name, client_name, contract_value, currency_code, contract_date, created_by)
     VALUES ($1,$2,$3,'AR Currency Test Contract','AR Currency Test Client',100000,'IQD','2031-01-01',$4)
     RETURNING id`,
    [projectId, TEST_COMPANY_ID, `${PREFIX}${Date.now()}`, user.userId],
  )
  contractId = contractRes.rows[0]!.id

  await pool.query(
    `INSERT INTO project_invoices
       (contract_id, project_id, company_id, invoice_number, billing_method, net_payable,
        currency_code, status, invoice_date, due_date, wht_scenario, wht_amount, created_by)
     VALUES ($1,$2,$3,$4,'milestone',500000,'IQD','issued',CURRENT_DATE,CURRENT_DATE + 30,'client_withholds',5000,$5)`,
    [contractId, projectId, TEST_COMPANY_ID, `${PREFIX}IQD-${Date.now()}`, user.userId],
  )
  await pool.query(
    `INSERT INTO project_invoices
       (contract_id, project_id, company_id, invoice_number, billing_method, net_payable,
        currency_code, status, invoice_date, due_date, wht_scenario, wht_amount, created_by)
     VALUES ($1,$2,$3,$4,'milestone',300,'USD','issued',CURRENT_DATE,CURRENT_DATE + 30,'client_withholds',3,$5)`,
    [contractId, projectId, TEST_COMPANY_ID, `${PREFIX}USD-${Date.now()}`, user.userId],
  )
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM sessions WHERE refresh_token_hash = 'test-refresh-hash-finance'`)
  await pool.query(`DELETE FROM users WHERE email = 'finance-test@fnc-erp.local'`)
  await pool.end()
})

describe('GET /finance/ar/summary — per currency', () => {
  it('keeps IQD and USD outstanding totals apart', async () => {
    const iqd = await request(app)
      .get('/finance/ar/summary?currency_code=IQD')
      .set('Authorization', `Bearer ${token}`)
    expect(iqd.status).toBe(200)
    expect(iqd.body.data.currencyCode).toBe('IQD')
    expect(iqd.body.data.availableCurrencies.sort()).toEqual(['IQD', 'USD'])
    expect(parseFloat(iqd.body.data.total_outstanding)).toBe(500000)

    const usd = await request(app)
      .get('/finance/ar/summary?currency_code=USD')
      .set('Authorization', `Bearer ${token}`)
    expect(usd.status).toBe(200)
    expect(parseFloat(usd.body.data.total_outstanding)).toBe(300)
  })
})

describe('GET /finance/ar/wht-recoverable — per currency', () => {
  it('keeps IQD and USD withheld amounts apart', async () => {
    const iqd = await request(app)
      .get('/finance/ar/wht-recoverable?currency_code=IQD')
      .set('Authorization', `Bearer ${token}`)
    expect(iqd.status).toBe(200)
    expect(iqd.body.data.wht_recoverable).toBe(5000)

    const usd = await request(app)
      .get('/finance/ar/wht-recoverable?currency_code=USD')
      .set('Authorization', `Bearer ${token}`)
    expect(usd.status).toBe(200)
    expect(usd.body.data.wht_recoverable).toBe(3)
  })
})

describe('GET /finance/ar/by-client — per currency', () => {
  it('does not blend the same client\'s IQD and USD invoices', async () => {
    const iqd = await request(app)
      .get('/finance/ar/by-client?currency_code=IQD')
      .set('Authorization', `Bearer ${token}`)
    expect(iqd.status).toBe(200)
    const iqdRow = iqd.body.data.rows.find(
      (r: { client_name: string }) => r.client_name === 'AR Currency Test Client',
    )
    expect(parseFloat(iqdRow.total_outstanding)).toBe(500000)

    const usd = await request(app)
      .get('/finance/ar/by-client?currency_code=USD')
      .set('Authorization', `Bearer ${token}`)
    expect(usd.status).toBe(200)
    const usdRow = usd.body.data.rows.find(
      (r: { client_name: string }) => r.client_name === 'AR Currency Test Client',
    )
    expect(parseFloat(usdRow.total_outstanding)).toBe(300)
  })
})
