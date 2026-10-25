// 0.1 sweep (Projects section): projectCostCodes/projectCostSummary summed
// project_committed_costs.committed_amount straight across every
// currency_code (the table allows a per-row currency, default 'USD').
// Real-Postgres pattern.
import { describe, it, expect, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const NAME_PREFIX = 'G-PCC-TEST-'
const TEST_USER_EMAIL = 'g-project-cost-codes-test@fnc-erp.local'

async function makeCompany(): Promise<{ companyId: string; userId: string; projectId: string; costCodeId: string }> {
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
    `INSERT INTO projects (company_id, code, name, status, budget_currency, created_by)
     VALUES ($1,$2,'Cost Codes Test Project','ongoing','IQD',$3) RETURNING id`,
    [companyId, `${NAME_PREFIX}${Date.now()}`, userId],
  )
  const projectId = projRes.rows[0]!.id
  const codeRes = await pool.query<{ id: string }>(
    `INSERT INTO project_cost_codes (project_id, code, name, category, budget_amount)
     VALUES ($1,'CC-01','Test Cost Code','material',1000000) RETURNING id`,
    [projectId],
  )
  const costCodeId = codeRes.rows[0]!.id

  await pool.query(
    `INSERT INTO project_committed_costs (project_id, cost_code_id, description, committed_amount, currency_code, status)
     VALUES ($1,$2,'IQD commitment',300000,'IQD','active')`,
    [projectId, costCodeId],
  )
  await pool.query(
    `INSERT INTO project_committed_costs (project_id, cost_code_id, description, committed_amount, currency_code, status)
     VALUES ($1,$2,'USD commitment',200,'USD','active')`,
    [projectId, costCodeId],
  )

  return { companyId, userId, projectId, costCodeId }
}

function ctxFor(companyId: string, userId: string) {
  return { auth: { companyId, userId, role: 'company_admin', module: 'all', sessionId: 'project-cost-codes-test' } }
}

async function cleanup(companyId: string, projectId: string): Promise<void> {
  await pool.query(`DELETE FROM project_committed_costs WHERE project_id=$1`, [projectId])
  await pool.query(`DELETE FROM project_cost_codes WHERE project_id=$1`, [projectId])
  await pool.query(`DELETE FROM projects WHERE id=$1`, [projectId])
  await pool.query(`DELETE FROM user_company_roles WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId])
}

afterAll(async () => {
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('projectCostCodes / projectCostSummary — per currency', () => {
  it('does not blend IQD and USD committed costs on the same cost code', async () => {
    const { companyId, userId, projectId, costCodeId } = await makeCompany()
    try {
      const ctx = ctxFor(companyId, userId) as never

      // Defaults to the project's own budget_currency (IQD) -- must be
      // 300000, never 300200 (if the USD row leaked in unconverted).
      const codesDefault = (await resolvers.Query.projectCostCodes(null, { projectId }, ctx)) as {
        id: string
        committedAmount: number
      }[]
      const codeRow = codesDefault.find((c) => c.id === costCodeId)
      expect(codeRow).toBeDefined()
      expect(codeRow!.committedAmount).toBe(300000)

      const codesUsd = (await resolvers.Query.projectCostCodes(
        null,
        { projectId, currencyCode: 'USD' },
        ctx,
      )) as { id: string; committedAmount: number }[]
      const codeRowUsd = codesUsd.find((c) => c.id === costCodeId)
      expect(codeRowUsd!.committedAmount).toBe(200)

      const summaryDefault = (await resolvers.Query.projectCostSummary(null, { projectId }, ctx)) as {
        totalCommitted: number
        currencyCode: string
        availableCurrencies: string[]
      }
      expect(summaryDefault.currencyCode).toBe('IQD')
      expect(summaryDefault.availableCurrencies.sort()).toEqual(['IQD', 'USD'])
      expect(summaryDefault.totalCommitted).toBe(300000)

      const summaryUsd = (await resolvers.Query.projectCostSummary(
        null,
        { projectId, currencyCode: 'USD' },
        ctx,
      )) as { totalCommitted: number }
      expect(summaryUsd.totalCommitted).toBe(200)
    } finally {
      await cleanup(companyId, projectId)
    }
  })
})
