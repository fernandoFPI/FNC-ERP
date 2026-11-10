// Withholding tax (WHT) on the project (migration 320). The new-RFQ and edit-project forms replaced Budget
// Amount with a WHT block: does it apply, the scenario, the rate. The tax the project will carry is
// calculated as Bid Price (projects.project_value) x rate and is never stored.
//
// Real Postgres through the real ApolloServer schema, with the selection sets the web form sends.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { pool } from '@fnc-erp/db'
import { typeDefs } from '../src/graphql/schema.js'
import { resolvers } from '../src/graphql/resolvers.js'
import {
  PROJECT_WHT_SCENARIOS,
  PROJECT_WHT_OFF,
  projectWhtAmount,
  resolveProjectWht,
} from '../src/lib/projectWht.js'

const COMPANY_ID = 'f0000000-0000-0000-0000-000000000009'
const OTHER_COMPANY_ID = 'f0000000-0000-0000-0000-000000000010'
const EMAIL_PREFIX = 'project-wht-test-'
const NAME_PREFIX = 'PWHT test '

type Ctx = { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }
const server = new ApolloServer<Ctx>({ typeDefs, resolvers })

let userId: string
let otherUserId: string
const addedSequences: string[] = []
const ctx =(): Ctx => ({
  auth: { companyId: COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'pwht-test' },
})
const otherCtx = (): Ctx => ({
  auth: { companyId: OTHER_COMPANY_ID, userId: otherUserId, role: 'system_admin', module: 'all', sessionId: 'pwht-test-other' },
})

const FIELDS = `id projectValue projectValueCurrency budgetAmount budgetCurrency whtApplies whtScenario whtRate whtAmount`
const CREATE_RFQ = `mutation ($input: ProjectCreateInput!) { createRFQ(input: $input) { ${FIELDS} } }`
const CREATE_PROJECT = `mutation ($input: ProjectCreateInput!) { createProject(input: $input) { ${FIELDS} } }`
const UPDATE = `mutation ($id: ID!, $input: ProjectUpdateInput!) { updateProject(id: $id, input: $input) { ${FIELDS} } }`
const READ = `query ($id: ID!) { project(id: $id) { ${FIELDS} } }`

type P = {
  id: string
  projectValue: number | null
  projectValueCurrency: string | null
  budgetAmount: number | null
  budgetCurrency: string | null
  whtApplies: boolean | null
  whtScenario: string | null
  whtRate: number | null
  whtAmount: number | null
}

async function gql<T>(query: string, variables: Record<string, unknown>, c: Ctx = ctx()) {
  const res = await server.executeOperation({ query, variables }, { contextValue: c })
  if (res.body.kind !== 'single') throw new Error('unexpected response kind')
  const { data, errors } = res.body.singleResult
  return { data: data as T | null | undefined, error: errors?.[0]?.message }
}

let seq = 0
const name = () => `${NAME_PREFIX}${Date.now()}-${++seq}`
const rfq = async (input: Record<string, unknown>, c: Ctx = ctx()) =>
  gql<{ createRFQ: P }>(CREATE_RFQ, { input: { name: name(), ...input } }, c)

async function ok(input: Record<string, unknown>): Promise<P> {
  const r = await rfq(input)
  expect(r.error).toBeUndefined()
  return r.data!.createRFQ
}
async function update(id: string, input: Record<string, unknown>, c: Ctx = ctx()) {
  return gql<{ updateProject: P }>(UPDATE, { id, input }, c)
}
async function dbRow(id: string) {
  const r = await pool.query(
    `SELECT wht_applies, wht_scenario, wht_rate::float8 AS wht_rate, name, budget_amount::float8 AS budget_amount FROM projects WHERE id=$1`,
    [id],
  )
  return r.rows[0] as { wht_applies: boolean; wht_scenario: string | null; wht_rate: number; name: string; budget_amount: number }
}
const projectCount = async () =>
  Number(
    (
      await pool.query(`SELECT COUNT(*) AS n FROM projects WHERE company_id=$1 AND created_by = ANY($2::uuid[])`, [
        COMPANY_ID,
        [userId],
      ])
    ).rows[0].n,
  )

async function cleanup(): Promise<void> {
  const users = `SELECT id FROM users WHERE email LIKE $1`
  await pool.query(`DELETE FROM projects WHERE created_by IN (${users})`, [`${EMAIL_PREFIX}%`])
  // createProject makes an analytic account coded from the sequence; with the sequence removed afterwards the
  // next run would start at the same code and collide with the leftover one.
  await pool.query(`DELETE FROM analytic_accounts WHERE company_id = $1 AND name LIKE $2`, [
    COMPANY_ID,
    `Project: ${NAME_PREFIX}%`,
  ])
}

beforeAll(async () => {
  await cleanup()
  const mk = async (who: string) =>
    (
      await pool.query<{ id: string }>(
        `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
        [`${EMAIL_PREFIX}${who}@fnc-erp.local`],
      )
    ).rows[0]!.id
  userId = await mk('a')
  otherUserId = await mk('b')
  // createRFQ derives the RFQ number from the company's 'project' and 'rfq' document sequences (and throws
  // without them), which the shared fixture company does not have. Added here, and removed again below.
  for (const [docType, prefix] of [
    ['project', 'PRJ'],
    ['rfq', 'RFQ'],
  ] as const) {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO document_sequences (company_id, doc_type, prefix) VALUES ($1,$2,$3)
       ON CONFLICT (company_id, doc_type) DO NOTHING RETURNING id`,
      [COMPANY_ID, docType, prefix],
    )
    if (r.rows[0]) addedSequences.push(r.rows[0].id)
  }
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM document_sequences WHERE id = ANY($1::uuid[])`, [addedSequences])
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`])
  await pool.end()
})

describe('a new RFQ with withholding tax', () => {
  it('stores the three settings and calculates the tax from the Bid Price', async () => {
    const p = await ok({
      projectValue: 200000,
      projectValueCurrency: 'USD',
      budgetCurrency: 'USD',
      whtApplies: true,
      whtScenario: 'client_withholds',
      whtRate: 0.03,
    })
    expect(p).toMatchObject({
      projectValue: 200000,
      projectValueCurrency: 'USD',
      whtApplies: true,
      whtScenario: 'client_withholds',
      whtRate: 0.03,
      whtAmount: 6000,
    })
    expect(await dbRow(p.id)).toMatchObject({ wht_applies: true, wht_scenario: 'client_withholds', wht_rate: 0.03 })
  })

  it('both scenarios are accepted', async () => {
    const p = await ok({ projectValue: 1000, whtApplies: true, whtScenario: 'fnc_pays', whtRate: 0.05 })
    expect(p).toMatchObject({ whtScenario: 'fnc_pays', whtAmount: 50 })
  })

  it('rounds the amount to four decimals, as an invoice does, from the Bid Price as it is stored (two decimals)', async () => {
    // 1234.5678 is stored as 1234.57 (projects.project_value has two decimals), and 1234.57 x 3.3% = 40.74081.
    const p = await ok({ projectValue: 1234.5678, whtApplies: true, whtScenario: 'client_withholds', whtRate: 0.033 })
    expect(p.projectValue).toBe(1234.57)
    expect(p.whtAmount).toBe(40.7408)
  })

  it('no WHT asked for: it is off, with no scenario and a zero rate, and no amount', async () => {
    const p = await ok({ projectValue: 5000 })
    expect(p).toMatchObject({ whtApplies: false, whtScenario: null, whtRate: 0, whtAmount: null })
    expect(await dbRow(p.id)).toMatchObject({ wht_applies: false, wht_scenario: null, wht_rate: 0 })
  })

  it('WHT switched off drops a scenario and a rate that came with it', async () => {
    const p = await ok({ projectValue: 5000, whtApplies: false, whtScenario: 'fnc_pays', whtRate: 0.03 })
    expect(p).toMatchObject({ whtApplies: false, whtScenario: null, whtRate: 0, whtAmount: null })
  })

  it('applies but there is no Bid Price yet: no amount (not a made-up zero), and it appears once one is typed', async () => {
    const p = await ok({ whtApplies: true, whtScenario: 'client_withholds', whtRate: 0.03 })
    expect(p).toMatchObject({ projectValue: null, whtApplies: true, whtAmount: null })
    const u = await update(p.id, { projectValue: 1000 })
    expect(u.error).toBeUndefined()
    expect(u.data!.updateProject).toMatchObject({ whtApplies: true, whtRate: 0.03, whtAmount: 30 })
  })

  it('a project with no Budget Amount sent gets a zero budget (the field is gone from the form)', async () => {
    const p = await ok({ projectValue: 1000, budgetCurrency: 'USD' })
    expect(p).toMatchObject({ budgetAmount: 0, budgetCurrency: 'USD' })
  })

  it("the Currency the form sends labels the Bid Price too (it used to stay 'IQD')", async () => {
    const p = await ok({ projectValue: 1000, projectValueCurrency: 'USD', budgetCurrency: 'USD' })
    expect(p).toMatchObject({ projectValueCurrency: 'USD', budgetCurrency: 'USD' })
  })

  it('createProject takes the same settings', async () => {
    const r = await gql<{ createProject: P }>(CREATE_PROJECT, {
      input: { name: name(), projectValue: 400, whtApplies: true, whtScenario: 'fnc_pays', whtRate: 0.1 },
    })
    expect(r.error).toBeUndefined()
    expect(r.data!.createProject).toMatchObject({ whtApplies: true, whtScenario: 'fnc_pays', whtRate: 0.1, whtAmount: 40 })
  })

  it('project(id) returns them, as the edit form reads them', async () => {
    const p = await ok({ projectValue: 2000, whtApplies: true, whtScenario: 'client_withholds', whtRate: 0.0325 })
    const r = await gql<{ project: P }>(READ, { id: p.id })
    expect(r.error).toBeUndefined()
    expect(r.data!.project).toMatchObject({ whtApplies: true, whtScenario: 'client_withholds', whtRate: 0.0325, whtAmount: 65 })
  })
})

describe('refused, and nothing left behind', () => {
  const bad: [string, Record<string, unknown>, RegExp][] = [
    ['applies with no scenario', { whtApplies: true, whtRate: 0.03 }, /who pays the withholding tax/],
    ['an unknown scenario', { whtApplies: true, whtScenario: 'bogus', whtRate: 0.03 }, /who pays the withholding tax/],
    ['a rate over 100%', { whtApplies: true, whtScenario: 'fnc_pays', whtRate: 1.5 }, /between 0% and 100%/],
    ['a negative rate', { whtApplies: true, whtScenario: 'fnc_pays', whtRate: -0.01 }, /between 0% and 100%/],
    ['a rate with more than two decimals of a percent', { whtApplies: true, whtScenario: 'fnc_pays', whtRate: 0.03333 }, /at most two decimals/],
  ]
  for (const [label, input, message] of bad) {
    it(`${label}: a new RFQ is refused and no project is made`, async () => {
      const before = await projectCount()
      const r = await rfq({ projectValue: 100, ...input })
      expect(r.error).toMatch(message)
      expect(await projectCount()).toBe(before)
    })
  }

  it('a refused update changes nothing, not even the other fields sent with it', async () => {
    const p = await ok({ projectValue: 1000, whtApplies: true, whtScenario: 'client_withholds', whtRate: 0.03 })
    const before = await dbRow(p.id)
    const u = await update(p.id, { name: name(), whtRate: 2 })
    expect(u.error).toMatch(/between 0% and 100%/)
    expect(await dbRow(p.id)).toEqual(before)
  })

  it('the database refuses an inconsistent row too (applies without a scenario, a rate above 100%)', async () => {
    const p = await ok({ projectValue: 1 })
    await expect(
      pool.query(`UPDATE projects SET wht_applies = true WHERE id = $1`, [p.id]),
    ).rejects.toThrow(/projects_wht_consistent/)
    await expect(
      pool.query(`UPDATE projects SET wht_applies = true, wht_scenario = 'fnc_pays', wht_rate = 1.5 WHERE id = $1`, [p.id]),
    ).rejects.toThrow(/projects_wht_consistent|numeric field overflow/)
    await expect(
      pool.query(`UPDATE projects SET wht_applies = false, wht_scenario = 'fnc_pays' WHERE id = $1`, [p.id]),
    ).rejects.toThrow(/projects_wht_consistent/)
  })
})

describe('editing a project', () => {
  it('turns WHT on for a project that had it off', async () => {
    const p = await ok({ projectValue: 8000 })
    const u = await update(p.id, { whtApplies: true, whtScenario: 'client_withholds', whtRate: 0.03 })
    expect(u.error).toBeUndefined()
    expect(u.data!.updateProject).toMatchObject({ whtApplies: true, whtScenario: 'client_withholds', whtRate: 0.03, whtAmount: 240 })
  })

  it('changing only the rate keeps the scenario; changing only the scenario keeps the rate', async () => {
    const p = await ok({ projectValue: 1000, whtApplies: true, whtScenario: 'client_withholds', whtRate: 0.03 })
    const a = await update(p.id, { whtRate: 0.05 })
    expect(a.data!.updateProject).toMatchObject({ whtScenario: 'client_withholds', whtRate: 0.05, whtAmount: 50 })
    const b = await update(p.id, { whtScenario: 'fnc_pays' })
    expect(b.data!.updateProject).toMatchObject({ whtScenario: 'fnc_pays', whtRate: 0.05 })
  })

  it('turning WHT off clears the scenario and the rate', async () => {
    const p = await ok({ projectValue: 1000, whtApplies: true, whtScenario: 'fnc_pays', whtRate: 0.03 })
    const u = await update(p.id, { whtApplies: false })
    expect(u.data!.updateProject).toMatchObject({ whtApplies: false, whtScenario: null, whtRate: 0, whtAmount: null })
    expect(await dbRow(p.id)).toMatchObject({ wht_applies: false, wht_scenario: null, wht_rate: 0 })
  })

  it("an update that never mentions WHT (the status bar's schedule dates) leaves it alone", async () => {
    const p = await ok({ projectValue: 1000, whtApplies: true, whtScenario: 'fnc_pays', whtRate: 0.04 })
    const u = await update(p.id, { siteVisitDate: '2031-01-15' })
    expect(u.error).toBeUndefined()
    expect(u.data!.updateProject).toMatchObject({ whtApplies: true, whtScenario: 'fnc_pays', whtRate: 0.04, whtAmount: 40 })
  })

  it('an edit that no longer sends Budget Amount keeps the budget the project already has', async () => {
    const p = await ok({ projectValue: 1000, budgetAmount: 5000, budgetCurrency: 'USD' })
    expect(p.budgetAmount).toBe(5000)
    // What the form sends now: the currency (twice) and no budgetAmount.
    const u = await update(p.id, { name: name(), budgetCurrency: 'USD', projectValueCurrency: 'USD', whtApplies: false })
    expect(u.error).toBeUndefined()
    expect(u.data!.updateProject).toMatchObject({ budgetAmount: 5000, budgetCurrency: 'USD' })
    const primary = await pool.query(
      `SELECT budget_amount::float8 AS a FROM project_budgets WHERE project_id=$1 AND is_primary`,
      [p.id],
    )
    expect(primary.rows[0].a).toBe(5000)
  })

  it("another company's project is not found, and is untouched", async () => {
    const p = await ok({ projectValue: 1000 })
    const u = await update(p.id, { whtApplies: true, whtScenario: 'fnc_pays', whtRate: 0.03 }, otherCtx())
    expect(u.error).toMatch(/not found/i)
    expect(await dbRow(p.id)).toMatchObject({ wht_applies: false, wht_scenario: null })
  })
})

describe('the rules are one list', () => {
  it('the scenarios the server accepts are the ones the database allows on a project AND on an invoice', async () => {
    const r = await pool.query<{ table_name: string; def: string }>(
      `SELECT conrelid::regclass::text AS table_name, pg_get_constraintdef(oid) AS def
         FROM pg_constraint
        WHERE contype = 'c' AND conrelid IN ('projects'::regclass, 'project_invoices'::regclass)
          AND pg_get_constraintdef(oid) LIKE '%wht_scenario%' AND pg_get_constraintdef(oid) LIKE '%client_withholds%'`,
    )
    const tables = r.rows.map((x) => x.table_name).sort()
    expect(tables).toEqual(['project_invoices', 'projects'])
    for (const row of r.rows) {
      const found = [...row.def.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()
      expect(found).toEqual([...PROJECT_WHT_SCENARIOS].sort())
    }
  })

  it('the amount uses the invoice rounding', () => {
    expect(projectWhtAmount(1234.5678, { applies: true, scenario: 'client_withholds', rate: 0.033 })).toBe(40.7407)
    expect(projectWhtAmount(100, PROJECT_WHT_OFF)).toBeNull()
    expect(projectWhtAmount(null, { applies: true, scenario: 'fnc_pays', rate: 0.03 })).toBeNull()
  })

  it('an input that says nothing about WHT changes nothing', () => {
    expect(resolveProjectWht({})).toBeNull()
    expect(resolveProjectWht({ whtApplies: null, whtScenario: null, whtRate: null })).toBeNull()
  })
})
