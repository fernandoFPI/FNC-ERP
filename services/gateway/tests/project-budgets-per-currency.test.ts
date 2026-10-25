// D2 (currency fix plan item 9): a project holds one budget PER CURRENCY
// (project_budgets, migration 309), not one single budget_amount/
// budget_currency pair converted via the now-removed fx_to_budget(). A
// currency with cost but no budget row must show "no budget" (null
// budgetRemaining), never a converted guess. Real-Postgres pattern.
import { describe, it, expect, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const NAME_PREFIX = 'G-PROJBUDGET-TEST-'
const TEST_USER_EMAIL = 'g-project-budgets-test@fnc-erp.local'

async function makeCompanyAndProject(): Promise<{
  companyId: string
  userId: string
  projectId: string
}> {
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
  const projectRes = await pool.query<{ id: string }>(
    `INSERT INTO projects (company_id, code, name, status, budget_amount, budget_currency, created_by)
     VALUES ($1,$2,'Budget Test Project','ongoing',1000000,'IQD',$3) RETURNING id`,
    [companyId, `${NAME_PREFIX}PRJ-${Date.now()}`, userId],
  )
  const projectId = projectRes.rows[0]!.id
  // createProject/createRFQ/updateProject keep project_budgets' primary row
  // in sync, but this fixture inserts straight into projects (as the other
  // per-currency project tests do) -- migrate it by hand, same as
  // migration 309's own backfill.
  await pool.query(
    `INSERT INTO project_budgets (project_id, currency_code, budget_amount, is_primary)
     VALUES ($1,'IQD',1000000,true)`,
    [projectId],
  )

  // IQD cost: a posted journal-backed project_cost_actuals row would need
  // a real chart_of_accounts/journal_entries fixture; a journal-less row
  // (stock_issue shape) is sufficient here since v_project_cost_by_currency
  // counts those unconditionally.
  await pool.query(
    `INSERT INTO project_cost_actuals (project_id, amount, currency_code, entry_date, source_type)
     VALUES ($1,300000,'IQD',CURRENT_DATE,'stock_issue')`,
    [projectId],
  )
  // USD cost: no USD budget exists for this project.
  await pool.query(
    `INSERT INTO project_cost_actuals (project_id, amount, currency_code, entry_date, source_type)
     VALUES ($1,150,'USD',CURRENT_DATE,'stock_issue')`,
    [projectId],
  )

  return { companyId, userId, projectId }
}

function ctxFor(companyId: string, userId: string) {
  return { auth: { companyId, userId, role: 'company_admin', module: 'all', sessionId: 'project-budgets-test' } }
}

async function cleanup(companyId: string, projectId: string): Promise<void> {
  await pool.query(`DELETE FROM project_cost_actuals WHERE project_id=$1`, [projectId])
  await pool.query(`DELETE FROM project_budgets WHERE project_id=$1`, [projectId])
  await pool.query(`DELETE FROM projects WHERE id=$1`, [projectId])
  await pool.query(`DELETE FROM user_company_roles WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId])
}

afterAll(async () => {
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

type CostSummaryEntry = {
  currencyCode: string
  budgetAmount: number | null
  actualCosts: number
  budgetRemaining: number | null
}

describe('project.costSummary — per currency (D2)', () => {
  it('shows "no budget" for a currency with cost but no project_budgets row, never a converted guess', async () => {
    const { companyId, userId, projectId } = await makeCompanyAndProject()
    try {
      const ctx = ctxFor(companyId, userId) as never
      const proj = (await resolvers.Query.project(null, { id: projectId }, ctx)) as {
        costSummary: CostSummaryEntry[]
      }
      expect(proj.costSummary).toHaveLength(2)
      const iqd = proj.costSummary.find((e) => e.currencyCode === 'IQD')!
      const usd = proj.costSummary.find((e) => e.currencyCode === 'USD')!

      expect(iqd.budgetAmount).toBe(1000000)
      expect(iqd.actualCosts).toBe(300000)
      expect(iqd.budgetRemaining).toBe(700000)

      // The real bug this replaces: USD cost compared against the IQD
      // budget as if they were the same unit (or silently converted).
      expect(usd.budgetAmount).toBeNull()
      expect(usd.actualCosts).toBe(150)
      expect(usd.budgetRemaining).toBeNull()
    } finally {
      await cleanup(companyId, projectId)
    }
  })

  it('addProjectBudget fills in budgetRemaining for that currency; removeProjectBudget removes it again', async () => {
    const { companyId, userId, projectId } = await makeCompanyAndProject()
    try {
      const ctx = ctxFor(companyId, userId) as never

      const added = (await resolvers.Mutation.addProjectBudget(
        null,
        { projectId, currencyCode: 'USD', amount: 500 },
        ctx,
      )) as { id: string; currencyCode: string; amount: number; isPrimary: boolean }
      expect(added.currencyCode).toBe('USD')
      expect(added.amount).toBe(500)
      expect(added.isPrimary).toBe(false)

      await expect(
        resolvers.Mutation.addProjectBudget(null, { projectId, currencyCode: 'USD', amount: 999 }, ctx),
      ).rejects.toThrow(/already has a budget/i)

      const proj = (await resolvers.Query.project(null, { id: projectId }, ctx)) as {
        costSummary: CostSummaryEntry[]
      }
      const usd = proj.costSummary.find((e) => e.currencyCode === 'USD')!
      expect(usd.budgetAmount).toBe(500)
      expect(usd.budgetRemaining).toBe(350)

      const removed = await resolvers.Mutation.removeProjectBudget(null, { id: added.id }, ctx)
      expect(removed).toBe(true)

      const projAfter = (await resolvers.Query.project(null, { id: projectId }, ctx)) as {
        costSummary: CostSummaryEntry[]
      }
      const usdAfter = projAfter.costSummary.find((e) => e.currencyCode === 'USD')!
      expect(usdAfter.budgetAmount).toBeNull()
    } finally {
      await cleanup(companyId, projectId)
    }
  })

  it('removeProjectBudget refuses to remove the primary budget', async () => {
    const { companyId, userId, projectId } = await makeCompanyAndProject()
    try {
      const ctx = ctxFor(companyId, userId) as never
      const primary = await pool.query<{ id: string }>(
        `SELECT id FROM project_budgets WHERE project_id=$1 AND is_primary=true`,
        [projectId],
      )
      await expect(
        resolvers.Mutation.removeProjectBudget(null, { id: primary.rows[0]!.id }, ctx),
      ).rejects.toThrow(/primary budget/i)
    } finally {
      await cleanup(companyId, projectId)
    }
  })
})

describe('createProject / createRFQ / updateProject — keep project_budgets in sync (D2)', () => {
  it('createProject creates a matching primary project_budgets row', async () => {
    const companyRes = await pool.query<{ id: string }>(
      `INSERT INTO companies (name, legal_name, country_code, currency_code)
       VALUES ($1,$1,'IQ','IQD') RETURNING id`,
      [`${NAME_PREFIX}CREATE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`],
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
    // createProject -> deriveRfqNumber needs these (normally seeded by the
    // real company-creation flow, bypassed by this raw fixture insert).
    await pool.query(
      `INSERT INTO document_sequences (company_id, doc_type, prefix) VALUES ($1,'project','PRJ'),($1,'rfq','RFQ')`,
      [companyId],
    )
    const ctx = ctxFor(companyId, userId) as never
    let projectId: string | undefined
    try {
      const created = (await resolvers.Mutation.createProject(
        null,
        {
          input: {
            name: 'Create Project Budget Sync Test',
            code: `${NAME_PREFIX}CRPRJ-${Date.now()}`,
            budgetAmount: 200000,
            budgetCurrency: 'EUR',
          },
        },
        ctx,
      )) as { id: string }
      projectId = created.id

      const rows = await pool.query<{ currency_code: string; budget_amount: string; is_primary: boolean }>(
        `SELECT currency_code, budget_amount, is_primary FROM project_budgets WHERE project_id=$1`,
        [projectId],
      )
      expect(rows.rows).toHaveLength(1)
      expect(rows.rows[0]!.currency_code).toBe('EUR')
      expect(parseFloat(rows.rows[0]!.budget_amount)).toBe(200000)
      expect(rows.rows[0]!.is_primary).toBe(true)

      // Changing the primary currency on update demotes the old row and
      // promotes/creates the new one -- never two primary rows at once.
      await resolvers.Mutation.updateProject(
        null,
        { id: projectId, input: { budgetAmount: 50000, budgetCurrency: 'GBP' } },
        ctx,
      )
      const rowsAfter = await pool.query<{ currency_code: string; budget_amount: string; is_primary: boolean }>(
        `SELECT currency_code, budget_amount, is_primary FROM project_budgets WHERE project_id=$1 ORDER BY currency_code`,
        [projectId],
      )
      expect(rowsAfter.rows).toHaveLength(2)
      const eur = rowsAfter.rows.find((r) => r.currency_code === 'EUR')!
      const gbp = rowsAfter.rows.find((r) => r.currency_code === 'GBP')!
      expect(eur.is_primary).toBe(false)
      expect(gbp.is_primary).toBe(true)
      expect(parseFloat(gbp.budget_amount)).toBe(50000)
    } finally {
      if (projectId) {
        await pool.query(`DELETE FROM project_budgets WHERE project_id=$1`, [projectId])
        await pool.query(`DELETE FROM project_status_history WHERE project_id=$1`, [projectId])
        await pool.query(`DELETE FROM projects WHERE id=$1`, [projectId])
      }
      await pool.query(`DELETE FROM document_sequences WHERE company_id=$1`, [companyId])
      await pool.query(`DELETE FROM user_company_roles WHERE company_id=$1`, [companyId])
      await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId])
    }
  })
})
