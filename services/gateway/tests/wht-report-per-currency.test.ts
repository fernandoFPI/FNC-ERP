// G22 (0.1 sweep #4): the gateway whtReport resolver blended every
// currency into one scalar, summed vi.total_amount (which includes other
// taxes) instead of the subtotal as the WHT base, and included every
// invoice status instead of approved invoices only. Real-Postgres
// pattern.
import { describe, it, expect, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const NAME_PREFIX = 'G-WHT-TEST-'
const TEST_USER_EMAIL = 'g-wht-report-test@fnc-erp.local'

async function makeCompany(): Promise<{ companyId: string; userId: string; vendorId: string }> {
  const companyRes = await pool.query<{ id: string }>(
    `INSERT INTO companies (name, legal_name, country_code, currency_code)
     VALUES ($1,$1,'IQ','IQD') RETURNING id`,
    [`${NAME_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`],
  )
  const companyId = companyRes.rows[0]!.id
  const vendorRes = await pool.query<{ id: string }>(
    `INSERT INTO vendors (company_id, name, currency_code, withholding_tax_rate) VALUES ($1,$2,'IQD',0.1) RETURNING id`,
    [companyId, `${NAME_PREFIX}Vendor`],
  )
  const vendorId = vendorRes.rows[0]!.id
  const userR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  const userId = userR.rows[0]!.id
  await pool.query(
    `INSERT INTO user_company_roles (user_id, company_id, role, module) VALUES ($1,$2,'company_admin','all') ON CONFLICT DO NOTHING`,
    [userId, companyId],
  )
  return { companyId, userId, vendorId }
}

async function makeInvoice(
  companyId: string,
  vendorId: string,
  userId: string,
  opts: { subtotal: number; taxAmount: number; whtAmount: number; currencyCode: string; status: string },
): Promise<void> {
  const totalAmount = opts.subtotal + opts.taxAmount
  const netPayable = totalAmount - opts.whtAmount
  await pool.query(
    `INSERT INTO vendor_invoices
       (company_id, vendor_id, invoice_number, invoice_date, due_date,
        subtotal, tax_amount, total_amount, net_payable, wht_amount, currency_code, status, created_by)
     VALUES ($1,$2,$3,date_trunc('month', CURRENT_DATE)::date,date_trunc('month', CURRENT_DATE)::date + 30,
             $4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      companyId,
      vendorId,
      `${NAME_PREFIX}${opts.currencyCode}-${opts.status}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      opts.subtotal,
      opts.taxAmount,
      totalAmount,
      netPayable,
      opts.whtAmount,
      opts.currencyCode,
      opts.status,
      userId,
    ],
  )
}

function ctxFor(companyId: string, userId: string) {
  return { auth: { companyId, userId, role: 'company_admin', module: 'all', sessionId: 'wht-report-test' } }
}

async function cleanup(companyId: string): Promise<void> {
  await pool.query(`DELETE FROM vendor_invoices WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM vendors WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM user_company_roles WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId])
}

afterAll(async () => {
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('whtReport — per currency, approved-only, subtotal as base', () => {
  it('keeps IQD and USD apart, excludes draft invoices, and uses subtotal not total_amount', async () => {
    const { companyId, userId, vendorId } = await makeCompany()
    try {
      // Approved IQD invoice: subtotal 100000, tax 5000 -> total_amount 105000.
      // The WHT base must be the 100000 subtotal, never the 105000 total.
      await makeInvoice(companyId, vendorId, userId, {
        subtotal: 100000,
        taxAmount: 5000,
        whtAmount: 10000,
        currencyCode: 'IQD',
        status: 'approved',
      })
      // Draft IQD invoice with wht_amount > 0 -- must be excluded entirely
      // (not yet a confirmed liability).
      await makeInvoice(companyId, vendorId, userId, {
        subtotal: 999999,
        taxAmount: 0,
        whtAmount: 99999,
        currencyCode: 'IQD',
        status: 'draft',
      })
      // Approved USD invoice, kept in a separate currency book.
      await makeInvoice(companyId, vendorId, userId, {
        subtotal: 500,
        taxAmount: 25,
        whtAmount: 50,
        currencyCode: 'USD',
        status: 'paid',
      })

      const fromDate = new Date()
      fromDate.setDate(1)
      const toDate = new Date()
      toDate.setMonth(toDate.getMonth() + 1)
      toDate.setDate(0)
      const fmt = (d: Date) => d.toISOString().slice(0, 10)

      const iqd = (await resolvers.Query.whtReport(
        null,
        { fromDate: fmt(fromDate), toDate: fmt(toDate) },
        ctxFor(companyId, userId) as never,
      )) as {
        currencyCode: string
        availableCurrencies: string[]
        totalWHT: number
        totalPaymentsSubjectToWHT: number
        rows: { paymentAmount: number; whtAmount: number }[]
      }

      expect(iqd.currencyCode).toBe('IQD')
      expect(iqd.availableCurrencies.sort()).toEqual(['IQD', 'USD'])
      expect(iqd.totalWHT).toBe(10000)
      // Must be the 100000 subtotal, never 105000 (total_amount) or
      // 1099999 (if the excluded draft invoice leaked in).
      expect(iqd.totalPaymentsSubjectToWHT).toBe(100000)
      expect(iqd.rows).toHaveLength(1)
      expect(iqd.rows[0]!.paymentAmount).toBe(100000)

      const usd = (await resolvers.Query.whtReport(
        null,
        { fromDate: fmt(fromDate), toDate: fmt(toDate), currencyCode: 'USD' },
        ctxFor(companyId, userId) as never,
      )) as { totalWHT: number; totalPaymentsSubjectToWHT: number }
      expect(usd.totalWHT).toBe(50)
      expect(usd.totalPaymentsSubjectToWHT).toBe(500)
    } finally {
      await cleanup(companyId)
    }
  })
})
