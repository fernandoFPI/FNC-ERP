// 0.1 sweep (Billing section): dashboardKPIs' revenue, spendByCategory
// and revenueVsTarget all summed straight across every currency_code on
// the plain "Company Dashboard" home page. Real-Postgres pattern.
import { describe, it, expect, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const NAME_PREFIX = 'G-CODASH-TEST-'
const TEST_USER_EMAIL = 'g-company-dashboard-test@fnc-erp.local'

async function makeCompany(): Promise<{ companyId: string; userId: string; projectId: string }> {
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
  const projRes = await pool.query<{ id: string }>(
    `INSERT INTO projects (company_id, code, name, status, created_by)
     VALUES ($1,$2,'Company Dashboard Test Project','ongoing',$3) RETURNING id`,
    [companyId, `${NAME_PREFIX}${Date.now()}`, userId],
  )
  const projectId = projRes.rows[0]!.id
  const contractRes = await pool.query<{ id: string }>(
    `INSERT INTO project_contracts
       (project_id, company_id, contract_number, contract_name, client_name, contract_value, currency_code, contract_date, created_by)
     VALUES ($1,$2,$3,'Dashboard Test Contract','Dashboard Test Client',100000,'IQD','2031-01-01',$4)
     RETURNING id`,
    [projectId, companyId, `${NAME_PREFIX}${Date.now()}`, userId],
  )
  const contractId = contractRes.rows[0]!.id

  await pool.query(
    `INSERT INTO project_invoices
       (contract_id, project_id, company_id, invoice_number, billing_method, net_payable,
        currency_code, status, invoice_date, due_date, created_by)
     VALUES ($1,$2,$3,$4,'milestone',700000,'IQD','issued',CURRENT_DATE,CURRENT_DATE + 30,$5)`,
    [contractId, projectId, companyId, `${NAME_PREFIX}IQD-${Date.now()}`, userId],
  )
  await pool.query(
    `INSERT INTO project_invoices
       (contract_id, project_id, company_id, invoice_number, billing_method, net_payable,
        currency_code, status, invoice_date, due_date, created_by)
     VALUES ($1,$2,$3,$4,'milestone',400,'USD','issued',CURRENT_DATE,CURRENT_DATE + 30,$5)`,
    [contractId, projectId, companyId, `${NAME_PREFIX}USD-${Date.now()}`, userId],
  )

  await pool.query(
    `INSERT INTO purchase_orders (company_id, po_number, status, currency_code, total_amount, purpose, created_by)
     VALUES ($1,$2,'approved','IQD',250000,'stock',$3)`,
    [companyId, `${NAME_PREFIX}IQD-${Date.now()}`, userId],
  )
  await pool.query(
    `INSERT INTO purchase_orders (company_id, po_number, status, currency_code, total_amount, purpose, created_by)
     VALUES ($1,$2,'approved','USD',150,'stock',$3)`,
    [companyId, `${NAME_PREFIX}USD-${Date.now()}`, userId],
  )

  return { companyId, userId, projectId }
}

function ctxFor(companyId: string, userId: string) {
  return { auth: { companyId, userId, role: 'company_admin', module: 'all', sessionId: 'company-dashboard-test' } }
}

async function cleanup(companyId: string, projectId: string): Promise<void> {
  await pool.query(`DELETE FROM project_invoices WHERE project_id=$1`, [projectId])
  await pool.query(`DELETE FROM project_contracts WHERE project_id=$1`, [projectId])
  await pool.query(`DELETE FROM purchase_orders WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM projects WHERE id=$1`, [projectId])
  await pool.query(`DELETE FROM user_company_roles WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId])
}

afterAll(async () => {
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('Company Dashboard — per currency', () => {
  it('keeps IQD and USD revenue/spend apart across dashboardKPIs, spendByCategory and revenueVsTarget', async () => {
    const { companyId, userId, projectId } = await makeCompany()
    try {
      const ctx = ctxFor(companyId, userId) as never

      const kpisIqd = (await resolvers.Query.dashboardKPIs(null, { companyId }, ctx)) as { revenue: number }
      expect(kpisIqd.revenue).toBe(700000)
      const kpisUsd = (await resolvers.Query.dashboardKPIs(
        null,
        { companyId, currencyCode: 'USD' },
        ctx,
      )) as { revenue: number }
      expect(kpisUsd.revenue).toBe(400)

      const spendIqd = (await resolvers.Query.spendByCategory(null, { companyId }, ctx)) as {
        category: string
        amount: number
      }[]
      expect(spendIqd.reduce((s, r) => s + r.amount, 0)).toBe(250000)
      const spendUsd = (await resolvers.Query.spendByCategory(
        null,
        { companyId, currencyCode: 'USD' },
        ctx,
      )) as { amount: number }[]
      expect(spendUsd.reduce((s, r) => s + r.amount, 0)).toBe(150)

      const revIqd = (await resolvers.Query.revenueVsTarget(null, { companyId }, ctx)) as {
        revenue: number
      }[]
      expect(revIqd.reduce((s, r) => s + r.revenue, 0)).toBe(700000)
      const revUsd = (await resolvers.Query.revenueVsTarget(
        null,
        { companyId, currencyCode: 'USD' },
        ctx,
      )) as { revenue: number }[]
      expect(revUsd.reduce((s, r) => s + r.revenue, 0)).toBe(400)
    } finally {
      await cleanup(companyId, projectId)
    }
  })
})
