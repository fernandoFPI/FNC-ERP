// myRequisitionApprovalQueue must show a person exactly the requisitions they
// can act on — each stage mirrors the mutation that moves it forward (see the
// resolver's own comment). Regressions covered, all found by comparing the
// queue's SQL with userHasPositionForRequisitionGW / userIsDeptHeadForRequisitionGW
// / approveRequisition:
//   - price_verification went to the organizer, but the action is gated by
//     the procurement_2nd position (or an admin), so those holders saw nothing
//   - position scope compared the CALLER's department instead of the
//     organizer's, ignored branch, and let a branch-only grant match everything
//   - any department head saw EVERY pending_approval requisition, not just
//     their own department's
//   - po_admin (allowed to approve) never saw pending_approval items
//   - company_admin / procurement module admins (allowed to act) saw nothing
// All non-admin actors use role 'user' with no permissions, so only the
// position / department-head / approver rule can be what makes an item appear.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const EMAIL = (k: string) => `rqq-${k}-test@fnc-erp.local`
const EMP_PREFIX = 'RQQTEST-'
const SKU_PREFIX = 'RQQTEST-'

type Ctx = { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }

const userIds: Record<string, string> = {}
const empIds: Record<string, string> = {}
const ctxs: Record<string, Ctx> = {}
const createdReqIds: string[] = []
let deptA: string
let deptB: string
let branchX: string
let branchY: string

async function makeUser(key: string, role = 'user', department?: string): Promise<void> {
  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [EMAIL(key)],
  )
  userIds[key] = u.rows[0]!.id
  ctxs[key] = {
    auth: { companyId: TEST_COMPANY_ID, userId: userIds[key]!, role, module: 'all', sessionId: `rqq-${key}` },
  }
  const e = await pool.query<{ id: string }>(
    `INSERT INTO employees (company_id, user_id, first_name, last_name, hire_date, employee_number, department_id)
     VALUES ($1,$2,'Rqq',$3,CURRENT_DATE,$4,$5)
     ON CONFLICT (company_id, employee_number) DO UPDATE SET user_id = EXCLUDED.user_id, department_id = EXCLUDED.department_id
     RETURNING id`,
    [TEST_COMPANY_ID, userIds[key], key, `${EMP_PREFIX}${key}`, department ?? null],
  )
  empIds[key] = e.rows[0]!.id
}

async function grant(
  key: string,
  position: string,
  scope: { department?: string; branch?: string } = {},
): Promise<void> {
  await pool.query(
    `INSERT INTO po_position_assignments (company_id, employee_id, position, department_id, branch_id, is_active, assigned_by)
     VALUES ($1,$2,$3,$4,$5,true,$6)`,
    [TEST_COMPANY_ID, empIds[key], position, scope.department ?? null, scope.branch ?? null, userIds.admin],
  )
}

// A requisition organized by `organizer`, forced to `status` / `branch`.
async function makeReq(organizer: string, status: string, branch: string | null = null): Promise<string> {
  const sku = `${SKU_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const p = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$2,'unit','general') RETURNING id`,
    [TEST_COMPANY_ID, sku],
  )
  const created = await resolvers.Mutation.createRequisition(
    null,
    { input: { purpose: 'stock', lines: [{ product_id: p.rows[0]!.id, description: 'x', qty: 1, unit_price: 1 }] } },
    ctxs.admin as never,
  )
  const id = (created as { id: string }).id
  createdReqIds.push(id)
  await pool.query(`UPDATE requisitions SET organizer_id=$1, status=$2, branch_id=$3 WHERE id=$4`, [
    userIds[organizer],
    status,
    branch,
    id,
  ])
  return id
}

async function queue(key: string): Promise<string[]> {
  const rows = (await resolvers.Query.myRequisitionApprovalQueue(null, {}, ctxs[key] as never)) as { id: string }[]
  return rows.map((r) => r.id).filter((id) => createdReqIds.includes(id))
}

async function cleanup(): Promise<void> {
  if (createdReqIds.length > 0) {
    await pool.query(`DELETE FROM requisition_approval_log WHERE requisition_id = ANY($1)`, [createdReqIds])
    await pool.query(`DELETE FROM po_lines WHERE requisition_id = ANY($1)`, [createdReqIds])
    await pool.query(`DELETE FROM requisitions WHERE id = ANY($1)`, [createdReqIds])
    createdReqIds.length = 0
  }
  await pool.query(`DELETE FROM products WHERE company_id=$1 AND sku LIKE $2`, [TEST_COMPANY_ID, `${SKU_PREFIX}%`])
}

beforeAll(async () => {
  await cleanup()
  await pool.query(
    `DELETE FROM po_position_assignments WHERE employee_id IN (SELECT id FROM employees WHERE employee_number LIKE $1)`,
    [`${EMP_PREFIX}%`],
  )
  await pool.query(`DELETE FROM employees WHERE employee_number LIKE $1`, [`${EMP_PREFIX}%`])
  await pool.query(`DELETE FROM departments WHERE company_id=$1 AND name LIKE 'RQQTEST-%'`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM company_branches WHERE company_id=$1 AND name LIKE 'RQQTEST-%'`, [TEST_COMPANY_ID])

  deptA = (
    await pool.query<{ id: string }>(
      `INSERT INTO departments (company_id, name) VALUES ($1,'RQQTEST-A') RETURNING id`,
      [TEST_COMPANY_ID],
    )
  ).rows[0]!.id
  deptB = (
    await pool.query<{ id: string }>(
      `INSERT INTO departments (company_id, name) VALUES ($1,'RQQTEST-B') RETURNING id`,
      [TEST_COMPANY_ID],
    )
  ).rows[0]!.id
  branchX = (
    await pool.query<{ id: string }>(`INSERT INTO company_branches (company_id, name) VALUES ($1,'RQQTEST-X') RETURNING id`, [
      TEST_COMPANY_ID,
    ])
  ).rows[0]!.id
  branchY = (
    await pool.query<{ id: string }>(`INSERT INTO company_branches (company_id, name) VALUES ($1,'RQQTEST-Y') RETURNING id`, [
      TEST_COMPANY_ID,
    ])
  ).rows[0]!.id

  await makeUser('admin', 'system_admin')
  await makeUser('companyadmin', 'company_admin')
  await makeUser('orgA', 'user', deptA)
  await makeUser('orgB', 'user', deptB)
  await makeUser('stranger')
  await makeUser('skCompany')
  await makeUser('skBranchX')
  await makeUser('skDeptA', 'user', deptB) // own dept is B, but assigned to dept A's work
  await makeUser('p2')
  await makeUser('headB', 'user', deptB)
  await makeUser('poadmin')
  await makeUser('buyerDeptA')
  await pool.query(`UPDATE departments SET manager_id=$1 WHERE id=$2`, [empIds.headB, deptB])

  await grant('skCompany', 'store_keeper')
  await grant('skBranchX', 'store_keeper', { branch: branchX })
  await grant('skDeptA', 'store_keeper', { department: deptA })
  await grant('p2', 'procurement_2nd')
  await grant('poadmin', 'po_admin')
  await grant('buyerDeptA', 'buyer', { department: deptA })
})

afterAll(async () => {
  await cleanup()
  await pool.query(
    `DELETE FROM po_position_assignments WHERE employee_id IN (SELECT id FROM employees WHERE employee_number LIKE $1)`,
    [`${EMP_PREFIX}%`],
  )
  await pool.query(`UPDATE departments SET manager_id=NULL WHERE id=$1`, [deptB])
  await pool.query(`DELETE FROM employees WHERE employee_number LIKE $1`, [`${EMP_PREFIX}%`])
  await pool.query(`DELETE FROM departments WHERE id = ANY($1)`, [[deptA, deptB]])
  await pool.query(`DELETE FROM company_branches WHERE id = ANY($1)`, [[branchX, branchY]])
  await pool.query(`DELETE FROM users WHERE email LIKE 'rqq-%-test@fnc-erp.local'`)
  await pool.end()
})

describe('myRequisitionApprovalQueue', () => {
  it('organizer sees their own draft, but not price_verification (that is procurement_2nd work)', async () => {
    const draft = await makeReq('orgA', 'draft')
    const pv = await makeReq('orgA', 'price_verification')
    const q = await queue('orgA')
    expect(q).toContain(draft)
    expect(q).not.toContain(pv)
  })

  it('procurement_2nd holder sees price_verification requisitions; a stranger does not', async () => {
    const pv = await makeReq('orgA', 'price_verification')
    expect(await queue('p2')).toContain(pv)
    expect(await queue('stranger')).not.toContain(pv)
  })

  it('a company-wide store_keeper sees inventory_check; a stranger does not', async () => {
    const r = await makeReq('orgA', 'inventory_check')
    expect(await queue('skCompany')).toContain(r)
    expect(await queue('stranger')).not.toContain(r)
  })

  it('a branch-scoped store_keeper sees only their branch (a branch-only grant is not company-wide)', async () => {
    const inX = await makeReq('orgA', 'inventory_check', branchX)
    const inY = await makeReq('orgA', 'inventory_check', branchY)
    const noBranch = await makeReq('orgA', 'inventory_check', null)
    const q = await queue('skBranchX')
    expect(q).toContain(inX)
    expect(q).not.toContain(inY)
    expect(q).not.toContain(noBranch)
  })

  it("department scope follows the ORGANIZER's department, not the caller's", async () => {
    const fromA = await makeReq('orgA', 'inventory_check')
    const fromB = await makeReq('orgB', 'inventory_check')
    const q = await queue('skDeptA') // assigned to dept A, but is an employee of dept B
    expect(q).toContain(fromA)
    expect(q).not.toContain(fromB)
  })

  it('a department-scoped buyer sees items_bought requisitions from that department', async () => {
    const fromA = await makeReq('orgA', 'items_bought')
    const fromB = await makeReq('orgB', 'items_bought')
    const q = await queue('buyerDeptA')
    expect(q).toContain(fromA)
    expect(q).not.toContain(fromB)
  })

  it("a department head sees pending_approval only from their own department's organizers", async () => {
    const fromB = await makeReq('orgB', 'pending_approval')
    const fromA = await makeReq('orgA', 'pending_approval')
    const q = await queue('headB')
    expect(q).toContain(fromB)
    expect(q).not.toContain(fromA)
  })

  it('a po_admin sees pending_approval requisitions from any department', async () => {
    const fromA = await makeReq('orgA', 'pending_approval')
    const fromB = await makeReq('orgB', 'pending_approval')
    const q = await queue('poadmin')
    expect(q).toContain(fromA)
    expect(q).toContain(fromB)
    expect(await queue('stranger')).not.toContain(fromA)
  })

  it('system_admin and company_admin see every actionable stage', async () => {
    const pa = await makeReq('orgA', 'pending_approval')
    const pv = await makeReq('orgA', 'price_verification')
    const sk = await makeReq('orgA', 'inventory_check')
    for (const key of ['admin', 'companyadmin']) {
      const q = await queue(key)
      expect(q).toEqual(expect.arrayContaining([pa, pv, sk]))
    }
  })

  it('does not queue sourcing / completed requisitions for anyone', async () => {
    const done = await makeReq('orgA', 'completed')
    const sourcing = await makeReq('orgA', 'sourcing')
    for (const key of ['admin', 'orgA', 'poadmin']) {
      const q = await queue(key)
      expect(q).not.toContain(done)
      expect(q).not.toContain(sourcing)
    }
  })
})
