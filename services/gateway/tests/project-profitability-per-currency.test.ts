// 0.1 sweep finding #3: project_cost_actuals blind sums were far more
// widespread than first found -- including v_project_profitability
// itself (migration 019), inherited by every one of its consumers.
// Rewritten on v_project_cost_by_currency (migration 305);
// projectProfitabilityReport now reads the view instead of re-deriving
// the same logic with a direct, currency-blind SUM. Real-Postgres
// pattern.
import { describe, it, expect, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const NAME_PREFIX = 'G-PROJCOST-TEST-'
const TEST_USER_EMAIL = 'g-proj-profitability-test@fnc-erp.local'

async function makeCompanyAndProject(): Promise<{
  companyId: string
  userId: string
  projectId: string
  expenseAccountId: string
}> {
  const companyRes = await pool.query<{ id: string }>(
    `INSERT INTO companies (name, legal_name, country_code, currency_code)
     VALUES ($1,$1,'IQ','IQD') RETURNING id`,
    [`${NAME_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`],
  )
  const companyId = companyRes.rows[0]!.id
  const expenseRes = await pool.query<{ id: string }>(
    `INSERT INTO chart_of_accounts (company_id, code, name, account_type, is_postable, is_active)
     VALUES ($1,'5100','Project Expense','expense',true,true) RETURNING id`,
    [companyId],
  )
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
  const analyticRes = await pool.query<{ id: string }>(
    `INSERT INTO analytic_accounts (company_id, code, name) VALUES ($1,$2,'Test analytic') RETURNING id`,
    [companyId, `AA-${Date.now().toString(36)}`],
  )
  const projectRes = await pool.query<{ id: string }>(
    `INSERT INTO projects (company_id, code, name, status, budget_amount, budget_currency, analytic_account_id, created_by)
     VALUES ($1,$2,'Test project','ongoing',1000000,'IQD',$3,$4) RETURNING id`,
    [companyId, `${NAME_PREFIX}PRJ-${Date.now()}`, analyticRes.rows[0]!.id, userId],
  )
  const projectId = projectRes.rows[0]!.id

  // IQD cost: a posted journal line via the real trigger path
  const je = await pool.query<{ id: string }>(
    `INSERT INTO journal_entries (company_id, reference, description, entry_date, status, source_type, created_by)
     VALUES ($1,$2,'test entry',CURRENT_DATE,'posted','manual',$3) RETURNING id`,
    [companyId, `${NAME_PREFIX}IQD-${Date.now()}`, userId],
  )
  await pool.query(
    `INSERT INTO journal_lines (journal_entry_id, account_id, analytic_account_id, debit, credit, currency_code, amount_company_currency)
     VALUES ($1,$2,$3,300000,0,'IQD',300000)`,
    [je.rows[0]!.id, expenseRes.rows[0]!.id, analyticRes.rows[0]!.id],
  )

  // USD cost: a journal-less project_cost_actuals row (the real shape
  // stock_issue/po_direct_delivery/material_return use)
  await pool.query(
    `INSERT INTO project_cost_actuals (project_id, amount, currency_code, entry_date, source_type)
     VALUES ($1,150,'USD',CURRENT_DATE,'stock_issue')`,
    [projectId],
  )

  return { companyId, userId, projectId, expenseAccountId: expenseRes.rows[0]!.id }
}

function ctxFor(companyId: string, userId: string) {
  return { auth: { companyId, userId, role: 'company_admin', module: 'all', sessionId: 'proj-profitability-test' } }
}

async function cleanup(companyId: string, projectId: string): Promise<void> {
  await pool.query(`DELETE FROM project_cost_actuals WHERE project_id=$1`, [projectId])
  await pool.query(
    `DELETE FROM journal_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE company_id=$1)`,
    [companyId],
  )
  await pool.query(`DELETE FROM journal_entries WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM projects WHERE id=$1`, [projectId])
  await pool.query(`DELETE FROM analytic_accounts WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM user_company_roles WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM chart_of_accounts WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId])
}

afterAll(async () => {
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('v_project_profitability / projectProfitabilityReport — per currency', () => {
  it('keeps the journal-backed IQD cost and the journal-less USD cost as separate rows', async () => {
    const { companyId, userId, projectId } = await makeCompanyAndProject()
    try {
      const viewRows = await pool.query<{ currency_code: string | null; total_costs: string }>(
        `SELECT currency_code, total_costs FROM v_project_profitability WHERE project_id=$1 ORDER BY currency_code`,
        [projectId],
      )
      expect(viewRows.rows).toHaveLength(2)
      const iqdRow = viewRows.rows.find((r) => r.currency_code === 'IQD')
      const usdRow = viewRows.rows.find((r) => r.currency_code === 'USD')
      expect(parseFloat(iqdRow!.total_costs)).toBe(300000)
      expect(parseFloat(usdRow!.total_costs)).toBe(150)

      const report = (await resolvers.Query.projectProfitabilityReport(
        null,
        {},
        ctxFor(companyId, userId) as never,
      )) as { id: string; currencyCode: string | null; actualCost: number; marginPct: number }[]

      const reportRows = report.filter((r) => r.id === projectId)
      expect(reportRows).toHaveLength(2)
      const iqdReportRow = reportRows.find((r) => r.currencyCode === 'IQD')
      const usdReportRow = reportRows.find((r) => r.currencyCode === 'USD')
      expect(iqdReportRow!.actualCost).toBe(300000)
      expect(usdReportRow!.actualCost).toBe(150)
      // budget_amount (1,000,000 IQD) vs actual cost is only ever computed
      // for the matching currency -- the USD row must not be compared
      // against the IQD budget as if it were the same unit.
      expect(usdReportRow!.marginPct).toBe(0)
      expect(iqdReportRow!.marginPct).toBeCloseTo(70, 5)
    } finally {
      await cleanup(companyId, projectId)
    }
  })
})
