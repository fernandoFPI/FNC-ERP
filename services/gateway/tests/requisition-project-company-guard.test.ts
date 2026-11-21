// A requisition (and a purchase order) belongs to ONE company, and so must the project and the branch it points at.
// NY-REQ-2026-0074 (Nishtimani Yakam) was filed on a Factory project: a form left open across a company switch sent
// the Factory project to a Yakam session, and createRequisition only checked the project's company for direct supply
// (playbook #114). Real Postgres, real mutations; a project and a branch of ANOTHER company are the hostile input.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const COMPANY_ID = 'f0000000-0000-0000-0000-000000000009'
const OTHER_COMPANY_ID = 'f0000000-0000-0000-0000-000000000010'
const EMAIL = 'req-company-guard-test@fnc-erp.local'
const CODE_PREFIX = 'RCGTEST-'

let userId: string
let ownProjectId: string
let foreignProjectId: string
let ownBranchId: string
let foreignBranchId: string
let projectCostCenterId: string
let branchCostCenterId: string

const ctx = () => ({
  auth: { companyId: COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'rcg-test' },
})

const line = { description: 'Pipe', qty: 2, unit_price: 5, uom: 'pc', requested_currency_code: 'USD' }

function create(input: Record<string, unknown>) {
  return resolvers.Mutation.createRequisition(null, { input: { lines: [line], ...input } } as never, ctx() as never) as Promise<{
    id: string
  }>
}
function createPO(input: Record<string, unknown>) {
  return resolvers.Mutation.createPurchaseOrder(null, { input: { lines: [line], ...input } } as never, ctx() as never) as Promise<{
    id: string
  }>
}

const requisitionCount = async () =>
  Number((await pool.query<{ n: string }>(`SELECT count(*) AS n FROM requisitions WHERE organizer_id=$1`, [userId])).rows[0]!.n)
const poCount = async () =>
  Number((await pool.query<{ n: string }>(`SELECT count(*) AS n FROM purchase_orders WHERE created_by=$1`, [userId])).rows[0]!.n)
const lineCostCenters = async (reqId: string) =>
  (await pool.query<{ cost_center_id: string | null }>(`SELECT cost_center_id FROM po_lines WHERE requisition_id=$1`, [reqId])).rows.map(
    (r) => r.cost_center_id,
  )

async function cleanup(): Promise<void> {
  const reqs = `SELECT id FROM requisitions WHERE organizer_id IN (SELECT id FROM users WHERE email=$1)`
  await pool.query(`DELETE FROM po_lines WHERE requisition_id IN (${reqs})`, [EMAIL])
  await pool.query(`DELETE FROM po_lines WHERE po_id IN (SELECT id FROM purchase_orders WHERE created_by IN (SELECT id FROM users WHERE email=$1))`, [EMAIL])
  await pool.query(`DELETE FROM requisition_approval_log WHERE requisition_id IN (${reqs})`, [EMAIL])
  await pool.query(`DELETE FROM requisitions WHERE organizer_id IN (SELECT id FROM users WHERE email=$1)`, [EMAIL])
  await pool.query(`DELETE FROM purchase_orders WHERE created_by IN (SELECT id FROM users WHERE email=$1)`, [EMAIL])
  await pool.query(`DELETE FROM projects WHERE code LIKE $1`, [`${CODE_PREFIX}%`])
  await pool.query(`DELETE FROM company_branches WHERE name LIKE $1`, [`${CODE_PREFIX}%`])
  await pool.query(`DELETE FROM cost_centers WHERE code LIKE $1`, [`${CODE_PREFIX}%`])
}

beforeAll(async () => {
  userId = (
    await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
      [EMAIL],
    )
  ).rows[0]!.id
  await cleanup()
  const cc = async (code: string) =>
    (
      await pool.query<{ id: string }>(
        `INSERT INTO cost_centers (company_id, code, name, type) VALUES ($1,$2,$2,'project') RETURNING id`,
        [COMPANY_ID, `${CODE_PREFIX}${code}`],
      )
    ).rows[0]!.id
  projectCostCenterId = await cc('PROJECT-CC')
  branchCostCenterId = await cc('BRANCH-CC')
  const project = async (companyId: string, code: string, costCenterId: string | null) =>
    (
      await pool.query<{ id: string }>(
        `INSERT INTO projects (company_id, code, name, status, cost_center_id, created_by)
         VALUES ($1,$2,$2,'approved',$3,$4) RETURNING id`,
        [companyId, `${CODE_PREFIX}${code}`, costCenterId, userId],
      )
    ).rows[0]!.id
  ownProjectId = await project(COMPANY_ID, 'OWN', projectCostCenterId)
  foreignProjectId = await project(OTHER_COMPANY_ID, 'FOREIGN', null)
  const branch = async (companyId: string, name: string, costCenterId: string | null) =>
    (
      await pool.query<{ id: string }>(
        `INSERT INTO company_branches (company_id, name, default_cost_center_id) VALUES ($1,$2,$3) RETURNING id`,
        [companyId, `${CODE_PREFIX}${name}`, costCenterId],
      )
    ).rows[0]!.id
  ownBranchId = await branch(COMPANY_ID, 'OWN-BRANCH', branchCostCenterId)
  foreignBranchId = await branch(OTHER_COMPANY_ID, 'FOREIGN-BRANCH', null)
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email=$1`, [EMAIL])
  await pool.end()
})

describe('createRequisition refuses another company\'s project', () => {
  for (const purpose of ['project', 'direct_supply', 'stock', 'manufacturing', 'expense', 'advance']) {
    it(`purpose ${purpose}: "Project not found", and nothing is written`, async () => {
      const before = await requisitionCount()
      await expect(create({ purpose, project_id: foreignProjectId })).rejects.toThrow('Project not found')
      expect(await requisitionCount()).toBe(before)
    })
  }

  it('a project id that does not exist is refused the same way', async () => {
    const before = await requisitionCount()
    await expect(create({ purpose: 'project', project_id: '00000000-0000-4000-8000-00000000dead' })).rejects.toThrow(
      'Project not found',
    )
    expect(await requisitionCount()).toBe(before)
  })

  it('a project of the caller\'s own company is accepted (Project Supply and direct supply)', async () => {
    const a = await create({ purpose: 'project', project_id: ownProjectId, delivery_destination: 'jobsite' })
    const b = await create({ purpose: 'direct_supply', project_id: ownProjectId })
    const rows = (
      await pool.query<{ id: string; company_id: string; project_id: string }>(
        `SELECT id, company_id, project_id FROM requisitions WHERE id = ANY($1)`,
        [[a.id, b.id]],
      )
    ).rows
    expect(rows).toHaveLength(2)
    for (const r of rows) {
      expect(r.company_id).toBe(COMPANY_ID)
      expect(r.project_id).toBe(ownProjectId)
    }
  })

  it('a requisition with no project at all is still fine', async () => {
    const r = await create({ purpose: 'stock' })
    expect(r.id).toBeTruthy()
  })
})

describe('createRequisition refuses another company\'s branch', () => {
  it('"Branch not found", and nothing is written', async () => {
    const before = await requisitionCount()
    await expect(create({ purpose: 'stock', branch_id: foreignBranchId })).rejects.toThrow('Branch not found')
    await expect(create({ purpose: 'project', project_id: ownProjectId, branch_id: foreignBranchId })).rejects.toThrow(
      'Branch not found',
    )
    expect(await requisitionCount()).toBe(before)
  })

  it('a branch of the caller\'s own company is accepted', async () => {
    const r = await create({ purpose: 'stock', branch_id: ownBranchId })
    const row = (await pool.query<{ branch_id: string }>(`SELECT branch_id FROM requisitions WHERE id=$1`, [r.id])).rows[0]!
    expect(row.branch_id).toBe(ownBranchId)
  })
})

describe('the default cost center is the same as before the guard', () => {
  it('Project Supply uses the PROJECT\'s cost center over the branch\'s', async () => {
    const r = await create({ purpose: 'project', project_id: ownProjectId, branch_id: ownBranchId, delivery_destination: 'jobsite' })
    expect(await lineCostCenters(r.id)).toEqual([projectCostCenterId])
  })

  it('direct supply uses the project\'s cost center too', async () => {
    const r = await create({ purpose: 'direct_supply', project_id: ownProjectId, branch_id: ownBranchId })
    expect(await lineCostCenters(r.id)).toEqual([projectCostCenterId])
  })

  it('any other purpose ignores the project\'s cost center and uses the branch\'s', async () => {
    const r = await create({ purpose: 'stock', project_id: ownProjectId, branch_id: ownBranchId })
    expect(await lineCostCenters(r.id)).toEqual([branchCostCenterId])
  })

  it('a branch alone gives its cost center, and neither gives none', async () => {
    const withBranch = await create({ purpose: 'stock', branch_id: ownBranchId })
    expect(await lineCostCenters(withBranch.id)).toEqual([branchCostCenterId])
    const neither = await create({ purpose: 'stock' })
    expect(await lineCostCenters(neither.id)).toEqual([null])
  })
})

describe('createPurchaseOrder refuses another company\'s linked project', () => {
  it('"Project not found", and no purchase order is written', async () => {
    const before = await poCount()
    await expect(createPO({ purpose: 'project', linkedProjectId: foreignProjectId })).rejects.toThrow('Project not found')
    await expect(
      createPO({ purpose: 'project', linkedProjectId: '00000000-0000-4000-8000-00000000dead' }),
    ).rejects.toThrow('Project not found')
    expect(await poCount()).toBe(before)
  })

  it('the caller\'s own project is accepted, and a PO with no project is still fine', async () => {
    const own = await createPO({ purpose: 'project', linkedProjectId: ownProjectId, delivery_destination: 'jobsite' })
    const row = (
      await pool.query<{ company_id: string; project_id: string }>(`SELECT company_id, project_id FROM purchase_orders WHERE id=$1`, [own.id])
    ).rows[0]!
    expect(row.company_id).toBe(COMPANY_ID)
    expect(row.project_id).toBe(ownProjectId)
    const none = await createPO({ purpose: 'stock' })
    expect(none.id).toBeTruthy()
  })
})
