// G19 (0.1 sweep #5, AP mirror): /finance/vendor-invoices/ap-summary and
// /vendor/:vendorId/summary used to sum vendor_invoices straight across
// every currency_code. Real-Postgres pattern, reusing the shared finance
// test company (no other finance test file touches vendor_invoices for
// this vendor name prefix).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { pool } from '@fnc-erp/db'
import { TEST_COMPANY_ID, createTestUser } from './setup.js'

const app = createApp()
const PREFIX = 'AP-CUR-TEST-'

let token: string
let vendorId: string
let userId: string
const invoiceIds: string[] = []

async function cleanup() {
  await pool.query(`DELETE FROM vendor_invoices WHERE invoice_number LIKE $1`, [`${PREFIX}%`])
  await pool.query(`DELETE FROM vendors WHERE name LIKE $1`, [`${PREFIX}%`])
}

beforeAll(async () => {
  await cleanup()
  const user = await createTestUser()
  token = user.token
  userId = user.userId

  const vendorRes = await pool.query<{ id: string }>(
    `INSERT INTO vendors (company_id, name, currency_code) VALUES ($1,$2,'IQD') RETURNING id`,
    [TEST_COMPANY_ID, `${PREFIX}Vendor`],
  )
  vendorId = vendorRes.rows[0]!.id

  const iqdInv = await pool.query<{ id: string }>(
    `INSERT INTO vendor_invoices
       (company_id, vendor_id, invoice_number, invoice_date, due_date, net_payable, currency_code, status, created_by)
     VALUES ($1,$2,$3,CURRENT_DATE,CURRENT_DATE + 30,400000,'IQD','approved',$4) RETURNING id`,
    [TEST_COMPANY_ID, vendorId, `${PREFIX}IQD-${Date.now()}`, userId],
  )
  invoiceIds.push(iqdInv.rows[0]!.id)

  const usdInv = await pool.query<{ id: string }>(
    `INSERT INTO vendor_invoices
       (company_id, vendor_id, invoice_number, invoice_date, due_date, net_payable, currency_code, status, created_by)
     VALUES ($1,$2,$3,CURRENT_DATE,CURRENT_DATE + 30,250,'USD','submitted',$4) RETURNING id`,
    [TEST_COMPANY_ID, vendorId, `${PREFIX}USD-${Date.now()}`, userId],
  )
  invoiceIds.push(usdInv.rows[0]!.id)
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM sessions WHERE refresh_token_hash = 'test-refresh-hash-finance'`)
  await pool.query(`DELETE FROM users WHERE email = 'finance-test@fnc-erp.local'`)
  await pool.end()
})

describe('GET /finance/vendor-invoices/ap-summary — per currency', () => {
  it('keeps IQD and USD outstanding totals apart, but counts stay company-wide', async () => {
    const iqd = await request(app)
      .get('/finance/vendor-invoices/ap-summary?currency_code=IQD')
      .set('Authorization', `Bearer ${token}`)
    expect(iqd.status).toBe(200)
    expect(iqd.body.data.currencyCode).toBe('IQD')
    expect(iqd.body.data.availableCurrencies.sort()).toEqual(['IQD', 'USD'])
    expect(parseFloat(iqd.body.data.total_outstanding)).toBe(400000)
    // pending_approval_count is a COUNT(*), not a money sum -- it must see
    // the USD 'submitted' invoice too, regardless of the currency filter
    // (useAPPendingCount's nav badge depends on this staying company-wide).
    expect(iqd.body.data.pending_approval_count).toBe(1)

    const usd = await request(app)
      .get('/finance/vendor-invoices/ap-summary?currency_code=USD')
      .set('Authorization', `Bearer ${token}`)
    expect(usd.status).toBe(200)
    expect(parseFloat(usd.body.data.total_outstanding)).toBe(250)
    expect(usd.body.data.pending_approval_count).toBe(1)
  })
})

describe('GET /finance/vendor-invoices/vendor/:vendorId/summary — per currency', () => {
  it('defaults to the vendor\'s own currency and keeps USD separate on request', async () => {
    const def = await request(app)
      .get(`/finance/vendor-invoices/vendor/${vendorId}/summary`)
      .set('Authorization', `Bearer ${token}`)
    expect(def.status).toBe(200)
    expect(def.body.data.currencyCode).toBe('IQD')
    expect(parseFloat(def.body.data.total_outstanding)).toBe(400000)

    const usd = await request(app)
      .get(`/finance/vendor-invoices/vendor/${vendorId}/summary?currency_code=USD`)
      .set('Authorization', `Bearer ${token}`)
    expect(usd.status).toBe(200)
    expect(parseFloat(usd.body.data.total_outstanding)).toBe(250)
  })
})
