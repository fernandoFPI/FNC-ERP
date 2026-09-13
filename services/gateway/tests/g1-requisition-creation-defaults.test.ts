// Integration tests for G1 Phase 3 Milestone A screen 2's creation-form
// support: createRequisition's account_id/cost_center_id defaulting
// (project's cost center for Project Supply, else the branch's default;
// system_configuration's company-wide default account), and that an
// explicit per-line accountId/costCenterId always wins over any default.
// Same real-Postgres pattern as the earlier G1 test files.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const TEST_USER_EMAIL = 'g1-req-creation-defaults-test@fnc-erp.local'
const PREFIX = 'G1RCDTEST-'

let userId: string
let ctx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }
let branchId: string
let branchCostCenterId: string
let projectCostCenterId: string
let systemDefaultAccountId: string
let projectId: string

async function makeProduct(suffix: string): Promise<string> {
  const sku = `${PREFIX}${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$3,'unit','general') RETURNING id`,
    [TEST_COMPANY_ID, sku, sku],
  )
  return r.rows[0]!.id
}

async function cleanup(): Promise<void> {
  await pool.query(
    `DELETE FROM po_lines WHERE requisition_id IN (SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id=$2)`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(`DELETE FROM requisitions WHERE company_id=$1 AND organizer_id=$2`, [TEST_COMPANY_ID, userId])
  await pool.query(`DELETE FROM products WHERE company_id=$1 AND sku LIKE $2`, [TEST_COMPANY_ID, `${PREFIX}%`])
  await pool.query(`DELETE FROM projects WHERE company_id=$1 AND code LIKE $2`, [TEST_COMPANY_ID, `${PREFIX}%`])
  await pool.query(`DELETE FROM company_branches WHERE company_id=$1 AND name LIKE $2`, [TEST_COMPANY_ID, `${PREFIX}%`])
  await pool.query(`DELETE FROM cost_centers WHERE company_id=$1 AND code LIKE $2`, [TEST_COMPANY_ID, `${PREFIX}%`])
  // '9091' is deliberately NOT deleted — once set, system_configuration.
  // default_unallocated_purchase_account_id keeps referencing it (FK), so
  // treating it as a permanent piece of the shared test company's config
  // (same as a real company's default account would be) avoids an FK
  // violation on every subsequent run. '9092' (the override test's own
  // account, never referenced elsewhere) is fine to remove.
  await pool.query(`DELETE FROM chart_of_accounts WHERE company_id=$1 AND code='9092'`, [TEST_COMPANY_ID])
}

beforeAll(async () => {
  const userR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  userId = userR.rows[0]!.id
  ctx = { auth: { companyId: TEST_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'g1-rcd-test' } }

  await cleanup()

  const branchCc = await pool.query<{ id: string }>(
    `INSERT INTO cost_centers (company_id, code, name, type) VALUES ($1,$2,'Branch Default','department') RETURNING id`,
    [TEST_COMPANY_ID, `${PREFIX}BRANCH`],
  )
  branchCostCenterId = branchCc.rows[0]!.id
  const projectCc = await pool.query<{ id: string }>(
    `INSERT INTO cost_centers (company_id, code, name, type) VALUES ($1,$2,'Project CC','project') RETURNING id`,
    [TEST_COMPANY_ID, `${PREFIX}PROJECT`],
  )
  projectCostCenterId = projectCc.rows[0]!.id

  const branch = await pool.query<{ id: string }>(
    `INSERT INTO company_branches (company_id, name, default_cost_center_id) VALUES ($1,$2,$3) RETURNING id`,
    [TEST_COMPANY_ID, `${PREFIX}Branch`, branchCostCenterId],
  )
  branchId = branch.rows[0]!.id

  const project = await pool.query<{ id: string }>(
    `INSERT INTO projects (company_id, code, name, cost_center_id, status, created_by) VALUES ($1,$2,$3,$4,'ongoing',$5) RETURNING id`,
    [TEST_COMPANY_ID, `${PREFIX}PRJ`, 'G1 RCD Test Project', projectCostCenterId, userId],
  )
  projectId = project.rows[0]!.id

  const acctRow = await pool.query<{ default_unallocated_purchase_account_id: string | null }>(
    `SELECT default_unallocated_purchase_account_id FROM system_configuration WHERE company_id=$1`,
    [TEST_COMPANY_ID],
  )
  if (acctRow.rows[0]?.default_unallocated_purchase_account_id) {
    systemDefaultAccountId = acctRow.rows[0].default_unallocated_purchase_account_id
  } else {
    const acct = await pool.query<{ id: string }>(
      `INSERT INTO chart_of_accounts (company_id, code, name, account_type) VALUES ($1,'9091','Unallocated Purchases Test','expense') RETURNING id`,
      [TEST_COMPANY_ID],
    )
    systemDefaultAccountId = acct.rows[0]!.id
    await pool.query(
      `INSERT INTO system_configuration (company_id, default_unallocated_purchase_account_id)
       VALUES ($1,$2)
       ON CONFLICT (company_id) DO UPDATE SET default_unallocated_purchase_account_id=EXCLUDED.default_unallocated_purchase_account_id`,
      [TEST_COMPANY_ID, systemDefaultAccountId],
    )
  }
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('createRequisition — account/cost-center defaulting', () => {
  it('defaults a stock-purpose line to the branch cost center and the system default account', async () => {
    const productId = await makeProduct('stock')
    const created = await resolvers.Mutation.createRequisition(
      null,
      {
        input: {
          purpose: 'stock',
          branch_id: branchId,
          lines: [{ product_id: productId, description: 'x', qty: 2, unit_price: 5 }],
        },
      },
      ctx as never,
    )
    const reqId = (created as { id: string }).id
    const line = await pool.query<{ account_id: string; cost_center_id: string }>(
      `SELECT account_id, cost_center_id FROM po_lines WHERE requisition_id=$1`,
      [reqId],
    )
    expect(line.rows[0]!.cost_center_id).toBe(branchCostCenterId)
    expect(line.rows[0]!.account_id).toBe(systemDefaultAccountId)
  })

  it('prefers the project cost center over the branch default for a Project Supply line', async () => {
    const productId = await makeProduct('project')
    const created = await resolvers.Mutation.createRequisition(
      null,
      {
        input: {
          purpose: 'project',
          project_id: projectId,
          delivery_destination: 'inventory',
          branch_id: branchId,
          lines: [{ product_id: productId, description: 'x', qty: 1, unit_price: 10 }],
        },
      },
      ctx as never,
    )
    const reqId = (created as { id: string }).id
    const line = await pool.query<{ cost_center_id: string }>(
      `SELECT cost_center_id FROM po_lines WHERE requisition_id=$1`,
      [reqId],
    )
    expect(line.rows[0]!.cost_center_id).toBe(projectCostCenterId)
  })

  it('lets an explicit per-line accountId/costCenterId override the computed default', async () => {
    const productId = await makeProduct('override')
    const overrideAcct = await pool.query<{ id: string }>(
      `INSERT INTO chart_of_accounts (company_id, code, name, account_type) VALUES ($1,'9092','Explicit Override','expense') RETURNING id`,
      [TEST_COMPANY_ID],
    )
    const overrideCc = await pool.query<{ id: string }>(
      `INSERT INTO cost_centers (company_id, code, name, type) VALUES ($1,$2,'Explicit CC','overhead') RETURNING id`,
      [TEST_COMPANY_ID, `${PREFIX}OVERRIDECC`],
    )
    const created = await resolvers.Mutation.createRequisition(
      null,
      {
        input: {
          purpose: 'stock',
          branch_id: branchId,
          lines: [
            {
              product_id: productId,
              description: 'x',
              qty: 1,
              unit_price: 1,
              accountId: overrideAcct.rows[0]!.id,
              costCenterId: overrideCc.rows[0]!.id,
            },
          ],
        },
      },
      ctx as never,
    )
    const reqId = (created as { id: string }).id
    const line = await pool.query<{ account_id: string; cost_center_id: string }>(
      `SELECT account_id, cost_center_id FROM po_lines WHERE requisition_id=$1`,
      [reqId],
    )
    expect(line.rows[0]!.account_id).toBe(overrideAcct.rows[0]!.id)
    expect(line.rows[0]!.cost_center_id).toBe(overrideCc.rows[0]!.id)
  })

  it('leaves cost_center_id null with no branch given, while account_id still gets the system-wide default', async () => {
    const productId = await makeProduct('nodefaults')
    const created = await resolvers.Mutation.createRequisition(
      null,
      {
        input: {
          purpose: 'stock',
          lines: [{ product_id: productId, description: 'x', qty: 1, unit_price: 1 }],
        },
      },
      ctx as never,
    )
    const reqId = (created as { id: string }).id
    const line = await pool.query<{ account_id: string | null; cost_center_id: string | null }>(
      `SELECT account_id, cost_center_id FROM po_lines WHERE requisition_id=$1`,
      [reqId],
    )
    // No branch_id given, so cost_center_id has nothing to default from.
    expect(line.rows[0]!.cost_center_id).toBeNull()
    // account_id still gets the system-wide default regardless of branch.
    expect(line.rows[0]!.account_id).toBe(systemDefaultAccountId)
  })

  // Regression: the project/branch cost-center lookups used to have no
  // company_id filter at all, so a project_id or branch_id belonging to a
  // *different* company (stale client state after switching companies, or
  // an id simply guessed) would silently leak that other company's cost
  // center onto this line. ctx here is still TEST_COMPANY_ID's session —
  // the caller never actually belongs to the foreign company.
  it("does not leak another company's project/branch cost center into a requisition line", async () => {
    const FOREIGN_COMPANY_ID = 'f9999999-0000-0000-0000-000000000001'
    // Defensive pre-cleanup — if a previous run of this test was
    // interrupted mid-way (e.g. the process killed between creating these
    // rows and the test's own finally block), leftovers here would
    // collide with this run's own INSERTs on the (company_id, code)
    // unique constraints below.
    await pool.query(
      `DELETE FROM po_lines WHERE requisition_id IN (SELECT id FROM requisitions WHERE project_id IN (SELECT id FROM projects WHERE company_id=$1))`,
      [FOREIGN_COMPANY_ID],
    )
    await pool.query(
      `DELETE FROM requisitions WHERE project_id IN (SELECT id FROM projects WHERE company_id=$1)`,
      [FOREIGN_COMPANY_ID],
    )
    await pool.query(`DELETE FROM projects WHERE company_id=$1`, [FOREIGN_COMPANY_ID])
    await pool.query(`DELETE FROM company_branches WHERE company_id=$1`, [FOREIGN_COMPANY_ID])
    await pool.query(`DELETE FROM cost_centers WHERE company_id=$1`, [FOREIGN_COMPANY_ID])
    await pool.query(
      `INSERT INTO companies (id, name, legal_name, country_code, currency_code)
       VALUES ($1,'G1RCD Foreign Test Co','G1RCD Foreign Test Co','IQ','IQD')
       ON CONFLICT (id) DO NOTHING`,
      [FOREIGN_COMPANY_ID],
    )
    const foreignCc = await pool.query<{ id: string }>(
      `INSERT INTO cost_centers (company_id, code, name, type) VALUES ($1,$2,'Foreign CC','department') RETURNING id`,
      [FOREIGN_COMPANY_ID, `${PREFIX}FOREIGNCC`],
    )
    const foreignBranch = await pool.query<{ id: string }>(
      `INSERT INTO company_branches (company_id, name, default_cost_center_id) VALUES ($1,$2,$3) RETURNING id`,
      [FOREIGN_COMPANY_ID, `${PREFIX}ForeignBranch`, foreignCc.rows[0]!.id],
    )
    const foreignProject = await pool.query<{ id: string }>(
      `INSERT INTO projects (company_id, code, name, cost_center_id, status, created_by) VALUES ($1,$2,$3,$4,'ongoing',$5) RETURNING id`,
      [FOREIGN_COMPANY_ID, `${PREFIX}FPRJ`, 'Foreign Co Project', foreignCc.rows[0]!.id, userId],
    )

    let reqId: string | undefined
    try {
      const productId = await makeProduct('crosstenant')
      const created = await resolvers.Mutation.createRequisition(
        null,
        {
          input: {
            purpose: 'project',
            project_id: foreignProject.rows[0]!.id,
            delivery_destination: 'inventory',
            branch_id: foreignBranch.rows[0]!.id,
            lines: [{ product_id: productId, description: 'x', qty: 1, unit_price: 1 }],
          },
        },
        ctx as never,
      )
      reqId = (created as { id: string }).id
      const line = await pool.query<{ cost_center_id: string | null }>(
        `SELECT cost_center_id FROM po_lines WHERE requisition_id=$1`,
        [reqId],
      )
      // Must come back null, exactly as if project_id/branch_id were never
      // set — not the foreign company's cost center.
      expect(line.rows[0]!.cost_center_id).toBeNull()
    } finally {
      // The requisition itself FK-references the foreign project — must
      // go before it, or the project delete below violates that FK. The
      // main cleanup() in afterAll would also catch this row (same
      // company_id/organizer_id as everything else), but only after this
      // finally block already needs the project gone.
      if (reqId) {
        await pool.query(`DELETE FROM po_lines WHERE requisition_id=$1`, [reqId])
        await pool.query(`DELETE FROM requisitions WHERE id=$1`, [reqId])
      }
      await pool.query(`DELETE FROM projects WHERE id=$1`, [foreignProject.rows[0]!.id])
      await pool.query(`DELETE FROM company_branches WHERE id=$1`, [foreignBranch.rows[0]!.id])
      await pool.query(`DELETE FROM cost_centers WHERE id=$1`, [foreignCc.rows[0]!.id])
    }
  })
})
