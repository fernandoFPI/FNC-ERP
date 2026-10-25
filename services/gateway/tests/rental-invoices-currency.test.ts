// 0.1 sweep: rentalInvoices never carried currency_code through to the
// client at all (missing from both the GraphQL type and the frontend
// query), so RentalInvoicesPage.tsx hardcoded "IQD" on every amount and
// blind-summed totalOutstanding/totalPaid across whatever currencies
// happened to be in the list. This test proves the resolver now returns
// currency_code per row (the frontend fix is covered by typecheck since
// there's no dedicated component test harness for this page).
import { describe, it, expect, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const NAME_PREFIX = 'G-RENTINV-TEST-'
const TEST_USER_EMAIL = 'g-rental-invoices-test@fnc-erp.local'

async function makeCompany(): Promise<{ companyId: string; userId: string; contractId: string }> {
  const companyRes = await pool.query<{ id: string }>(
    `INSERT INTO companies (name, legal_name, country_code, currency_code)
     VALUES ($1,$1,'IQ','IQD') RETURNING id`,
    [`${NAME_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`],
  )
  const companyId = companyRes.rows[0]!.id
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
  const contractRes = await pool.query<{ id: string }>(
    `INSERT INTO rental_contracts (company_id, contract_number, rate_amount, currency_code, start_date, created_by)
     VALUES ($1,$2,100000,'IQD','2031-01-01',$3) RETURNING id`,
    [companyId, `${NAME_PREFIX}${Date.now()}`, userId],
  )
  const contractId = contractRes.rows[0]!.id

  await pool.query(
    `INSERT INTO rental_invoices
       (contract_id, company_id, invoice_number, billing_period_start, billing_period_end, days_billed,
        amount, total_amount, currency_code, status)
     VALUES ($1,$2,$3,'2031-01-01','2031-01-31',31,500000,500000,'IQD','issued')`,
    [contractId, companyId, `${NAME_PREFIX}IQD-${Date.now()}`],
  )
  await pool.query(
    `INSERT INTO rental_invoices
       (contract_id, company_id, invoice_number, billing_period_start, billing_period_end, days_billed,
        amount, total_amount, currency_code, status)
     VALUES ($1,$2,$3,'2031-02-01','2031-02-28',28,300,300,'USD','paid')`,
    [contractId, companyId, `${NAME_PREFIX}USD-${Date.now()}`],
  )

  return { companyId, userId, contractId }
}

function ctxFor(companyId: string, userId: string) {
  return { auth: { companyId, userId, role: 'company_admin', module: 'all', sessionId: 'rental-invoices-test' } }
}

async function cleanup(companyId: string, contractId: string): Promise<void> {
  await pool.query(`DELETE FROM rental_invoices WHERE contract_id=$1`, [contractId])
  await pool.query(`DELETE FROM rental_contracts WHERE id=$1`, [contractId])
  await pool.query(`DELETE FROM user_company_roles WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId])
}

afterAll(async () => {
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('rentalInvoices — currency_code per row', () => {
  it('returns each invoice\'s own currency_code, not blended', async () => {
    const { companyId, userId, contractId } = await makeCompany()
    try {
      const rows = (await resolvers.Query.rentalInvoices(
        null,
        {},
        ctxFor(companyId, userId) as never,
      )) as { currency_code: string; total_amount: string; status: string }[]
      const iqd = rows.find((r) => r.currency_code === 'IQD')
      const usd = rows.find((r) => r.currency_code === 'USD')
      expect(iqd).toBeDefined()
      expect(usd).toBeDefined()
      // pg returns NUMERIC as a string when calling the resolver directly
      // (GraphQL's Float scalar would coerce it over the wire).
      expect(parseFloat(iqd!.total_amount)).toBe(500000)
      expect(parseFloat(usd!.total_amount)).toBe(300)
    } finally {
      await cleanup(companyId, contractId)
    }
  })
})
