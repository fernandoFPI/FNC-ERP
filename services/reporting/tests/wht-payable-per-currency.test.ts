// G22 (0.1 sweep #4): /reporting/compliance/wht-payable blended every
// currency into one scalar, counted every invoice status (not just
// approved ones), and used total_amount (which also includes other
// taxes) instead of subtotal as the WHT base. Real-Postgres pattern.
import request from 'supertest'
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { pool } from '@fnc-erp/db'
import { createApp } from '../src/app.js'
import { createTestUser, cleanReportingData, TEST_COMPANY_ID } from './setup.js'

const app = createApp()
const PREFIX = 'G-WHTPAY-TEST-'

let token: string
let vendorId: string

async function cleanupFixtures(): Promise<void> {
  await pool.query(`DELETE FROM vendor_invoices WHERE invoice_number LIKE $1`, [`${PREFIX}%`])
  await pool.query(`DELETE FROM vendors WHERE name LIKE $1`, [`${PREFIX}%`])
}

beforeAll(async () => {
  await cleanupFixtures()
  const user = await createTestUser()
  token = user.token

  const vendorRes = await pool.query<{ id: string }>(
    `INSERT INTO vendors (company_id, name, currency_code) VALUES ($1,$2,'IQD') RETURNING id`,
    [TEST_COMPANY_ID, `${PREFIX}Vendor`],
  )
  vendorId = vendorRes.rows[0]!.id

  async function makeInvoice(opts: {
    subtotal: number
    taxAmount: number
    whtAmount: number
    currencyCode: string
    status: string
  }) {
    const totalAmount = opts.subtotal + opts.taxAmount
    const netPayable = totalAmount - opts.whtAmount
    await pool.query(
      `INSERT INTO vendor_invoices
         (company_id, vendor_id, invoice_number, invoice_date, due_date,
          subtotal, tax_amount, total_amount, net_payable, wht_amount, currency_code, status, created_by)
       VALUES ($1,$2,$3,date_trunc('month', CURRENT_DATE)::date,date_trunc('month', CURRENT_DATE)::date + 30,
               $4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        TEST_COMPANY_ID,
        vendorId,
        `${PREFIX}${opts.currencyCode}-${opts.status}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        opts.subtotal,
        opts.taxAmount,
        totalAmount,
        netPayable,
        opts.whtAmount,
        opts.currencyCode,
        opts.status,
        user.userId,
      ],
    )
  }

  // Approved IQD invoice: subtotal 200000, tax 10000 -> total_amount 210000.
  // The WHT base must be the 200000 subtotal, never the 210000 total.
  await makeInvoice({ subtotal: 200000, taxAmount: 10000, whtAmount: 20000, currencyCode: 'IQD', status: 'approved' })
  // Submitted (not yet approved) IQD invoice with wht_amount > 0 -- must
  // be excluded entirely.
  await makeInvoice({ subtotal: 999999, taxAmount: 0, whtAmount: 99999, currencyCode: 'IQD', status: 'submitted' })
  // Paid USD invoice, kept in a separate currency book.
  await makeInvoice({ subtotal: 1000, taxAmount: 50, whtAmount: 100, currencyCode: 'USD', status: 'paid' })
})

afterAll(async () => {
  await cleanupFixtures()
  await cleanReportingData()
})

describe('GET /reporting/compliance/wht-payable — per currency, approved-only, subtotal as base', () => {
  it('keeps IQD and USD apart and excludes the submitted invoice', async () => {
    const iqd = await request(app)
      .get('/reporting/compliance/wht-payable?currency_code=IQD')
      .set('Authorization', `Bearer ${token}`)
    expect(iqd.status).toBe(200)
    expect(iqd.body.data.currencyCode).toBe('IQD')
    expect(iqd.body.data.availableCurrencies.sort()).toEqual(['IQD', 'USD'])
    expect(iqd.body.data.total_wht_payable).toBe(20000)
    expect(iqd.body.data.invoice_count).toBe(1)
    const iqdMonth = iqd.body.data.monthly.find((m: { wht_amount: string }) => parseFloat(m.wht_amount) > 0)
    // Must be the 200000 subtotal, never 210000 (total_amount) or
    // 1199999 (if the excluded submitted invoice leaked in).
    expect(parseFloat(iqdMonth.payments_subject_to_wht)).toBe(200000)

    const usd = await request(app)
      .get('/reporting/compliance/wht-payable?currency_code=USD')
      .set('Authorization', `Bearer ${token}`)
    expect(usd.status).toBe(200)
    expect(usd.body.data.total_wht_payable).toBe(100)
    const usdMonth = usd.body.data.monthly.find((m: { wht_amount: string }) => parseFloat(m.wht_amount) > 0)
    expect(parseFloat(usdMonth.payments_subject_to_wht)).toBe(1000)
  })
})
