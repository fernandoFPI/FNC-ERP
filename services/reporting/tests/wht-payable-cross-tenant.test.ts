// Regression: /reporting/compliance/wht-payable (and every other route in
// compliance.ts/entity.ts/hr.ts) used to take company_id from the query
// string ahead of the caller's own session company
// (`(req.query['company_id'] as string) || getAuth(req).companyId`), so
// anyone holding this route's permission in their own company could read
// another company's WHT-payable data just by passing a different
// company_id. Fixed to always use the session's companyId. This is the
// live route (WHTPayablePage.tsx); the test proves a caller from
// TEST_COMPANY_ID can't pull another company's numbers through it.
import request from 'supertest'
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { pool } from '@fnc-erp/db'
import { createApp } from '../src/app.js'
import { createTestUser, cleanReportingData, TEST_COMPANY_ID } from './setup.js'

const app = createApp()
const PREFIX = 'G-WHTXTENANT-TEST-'

let token: string
let otherCompanyId: string
let otherVendorId: string

async function cleanupFixtures(): Promise<void> {
  await pool.query(`DELETE FROM vendor_invoices WHERE invoice_number LIKE $1`, [`${PREFIX}%`])
  await pool.query(`DELETE FROM vendors WHERE name LIKE $1`, [`${PREFIX}%`])
  await pool.query(`DELETE FROM companies WHERE name LIKE $1`, [`${PREFIX}%`])
}

beforeAll(async () => {
  await cleanupFixtures()
  const user = await createTestUser()
  token = user.token

  const companyRes = await pool.query<{ id: string }>(
    `INSERT INTO companies (name, legal_name, country_code, currency_code)
     VALUES ($1,$1,'IQ','IQD') RETURNING id`,
    [`${PREFIX}Other-${Date.now()}`],
  )
  otherCompanyId = companyRes.rows[0]!.id

  const vendorRes = await pool.query<{ id: string }>(
    `INSERT INTO vendors (company_id, name, currency_code) VALUES ($1,$2,'IQD') RETURNING id`,
    [otherCompanyId, `${PREFIX}Vendor`],
  )
  otherVendorId = vendorRes.rows[0]!.id

  // A large, unmistakable WHT-payable amount in the OTHER company — if it
  // ever leaks into the test user's response, the total jumps by exactly
  // this much.
  await pool.query(
    `INSERT INTO vendor_invoices
       (company_id, vendor_id, invoice_number, invoice_date, due_date,
        subtotal, tax_amount, total_amount, net_payable, wht_amount, currency_code, status, created_by)
     VALUES ($1,$2,$3,date_trunc('month', CURRENT_DATE)::date,date_trunc('month', CURRENT_DATE)::date + 30,
             5000000,0,5000000,4000000,1000000,'IQD','approved',$4)`,
    [otherCompanyId, otherVendorId, `${PREFIX}LEAK-${Date.now()}`, user.userId],
  )
})

afterAll(async () => {
  await cleanupFixtures()
  await cleanReportingData()
})

describe('GET /reporting/compliance/wht-payable — cross-tenant isolation', () => {
  it('ignores a client-supplied company_id and never returns another company\'s data', async () => {
    const res = await request(app)
      .get(`/reporting/compliance/wht-payable?currency_code=IQD&company_id=${otherCompanyId}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    // The other company's 1,000,000 WHT line must not appear anywhere in
    // a caller from TEST_COMPANY_ID's response.
    expect(res.body.data.total_wht_payable).not.toBe(1000000)
    const leaked = (res.body.data.monthly as { wht_amount: string }[]).some(
      (m) => parseFloat(m.wht_amount) === 1000000,
    )
    expect(leaked).toBe(false)
  })

  it('still scopes correctly to the caller\'s own company when no company_id is passed', async () => {
    const withParam = await request(app)
      .get(`/reporting/compliance/wht-payable?currency_code=IQD&company_id=${otherCompanyId}`)
      .set('Authorization', `Bearer ${token}`)
    const withoutParam = await request(app)
      .get('/reporting/compliance/wht-payable?currency_code=IQD')
      .set('Authorization', `Bearer ${token}`)
    // Identical regardless of the (now-ignored) company_id query param.
    expect(withParam.body.data.total_wht_payable).toBe(withoutParam.body.data.total_wht_payable)
  })
})
