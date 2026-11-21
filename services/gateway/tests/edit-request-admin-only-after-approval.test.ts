// After approval only an administrator may change a requisition or a purchase order, and only through the edit request flow (playbook #112).
//
//   - Before approval nothing changes: the people who work on the document edit it and the edit applies at once.
//   - After approval a plain user, the organizer included, can neither edit nor file an edit request: refused, nothing queued, nothing changed.
//   - A system, company or module administrator still files a request, and an administrator approves or rejects it (the two steps stay).
//   - A request an employee filed BEFORE this rule is left in the queue: an administrator can still approve or reject it.
//
// Real Postgres, through the real resolvers, nothing mocked.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'
import {
  AUTO_APPLY_REQUISITION_STATUSES,
  EDIT_ADMIN_ROLES,
  isEditAdminRole,
  requisitionEditNeedsApproval,
} from '../src/lib/poEditApproval.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const EMAIL_PREFIX = 'edit-admin-only-test-'
const SKU_PREFIX = 'EAOTEST-'
const PO_PREFIX = 'EAOTEST-PO-'

// Every requisitions.status the database allows, and which side of the rule each is on. Declared here, apart from the library, so a status
// added in a migration fails the "classified" test until somebody decides which side it belongs on.
const REQ_BEFORE_APPROVAL = ['draft', 'inventory_check', 'store_pricing', 'market_pricing', 'price_verification', 'pending_approval', 'rejected', 'deleted']
const REQ_AFTER_APPROVAL = ['approved', 'items_bought', 'sourcing', 'completed', 'cancelled']
const PO_AFTER_APPROVAL = ['approved', 'bought', 'finance_review', 'payment_pending', 'closed']
const REFUSAL_REQ = /Only an administrator can change an approved requisition/
const REFUSAL_PO = /Only an administrator can change an approved purchase order/

let organizerId: string // a plain user: organizes the requisitions and created the POs
let strangerId: string // a plain user with no tie to any of them
let adminId: string

const ctxFor = (userId: string, role: string) =>
  ({ auth: { companyId: TEST_COMPANY_ID, userId, role, module: 'all', sessionId: 'eao-test' } }) as never

async function makeUser(key: string): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [`${EMAIL_PREFIX}${key}@fnc-erp.local`],
  )
  return r.rows[0]!.id
}

async function makeProduct(): Promise<string> {
  const sku = `${SKU_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$2,'unit','general') RETURNING id`,
    [TEST_COMPANY_ID, sku],
  )
  return r.rows[0]!.id
}

/** A requisition organized by the plain user, with one line, forced to `status`. */
async function makeRequisition(status: string): Promise<{ reqId: string; lineId: string }> {
  const created = (await resolvers.Mutation.createRequisition(
    null,
    { input: { purpose: 'stock', lines: [{ product_id: await makeProduct(), description: 'Cable', qty: 3, unit_price: 900 }] } },
    ctxFor(organizerId, 'system_admin'),
  )) as { id: string }
  await pool.query(`UPDATE requisitions SET status=$1 WHERE id=$2`, [status, created.id])
  const line = await pool.query<{ id: string }>(`SELECT id FROM po_lines WHERE requisition_id=$1`, [created.id])
  return { reqId: created.id, lineId: line.rows[0]!.id }
}

/** A purchase order created by the plain user, with one line, at `status`. */
async function makePO(status: string): Promise<{ poId: string; lineId: string }> {
  const po = await pool.query<{ id: string }>(
    `INSERT INTO purchase_orders (company_id, po_number, created_by, status, currency_code, purpose) VALUES ($1,$2,$3,$4,'IQD','stock') RETURNING id`,
    [TEST_COMPANY_ID, `${PO_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, organizerId, status],
  )
  const line = await pool.query<{ id: string }>(
    `INSERT INTO po_lines (po_id, line_number, description, product_id, qty_ordered, unit_price, total_price) VALUES ($1,1,'test line',$2,3,10,30) RETURNING id`,
    [po.rows[0]!.id, await makeProduct()],
  )
  return { poId: po.rows[0]!.id, lineId: line.rows[0]!.id }
}

const qtyEdit = (lineId: string) => JSON.stringify({ lines: { edited: [{ id: lineId, field: 'qty_ordered', from: 3, to: 5 }] } })
const lineQty = async (lineId: string) => parseFloat((await pool.query<{ q: string }>(`SELECT qty_ordered AS q FROM po_lines WHERE id=$1`, [lineId])).rows[0]!.q)
const requestsOnReq = async (reqId: string) => (await pool.query(`SELECT id FROM po_edit_requests WHERE requisition_id=$1`, [reqId])).rows.length
const requestsOnPO = async (poId: string) => (await pool.query(`SELECT id FROM po_edit_requests WHERE po_id=$1`, [poId])).rows.length

const askReq = (reqId: string, lineId: string, userId: string, role: string) =>
  resolvers.Mutation.submitPOEditRequest(null, { requisitionId: reqId, changes: qtyEdit(lineId) } as never, ctxFor(userId, role)) as Promise<{ id: string; status: string }>
const askPO = (poId: string, lineId: string, userId: string, role: string) =>
  resolvers.Mutation.submitPOEditRequest(null, { id: poId, changes: qtyEdit(lineId) } as never, ctxFor(userId, role)) as Promise<{ id: string; status: string }>

async function cleanup(): Promise<void> {
  // two small queries, each with its own $1 / $2, so a parameter can never point at the wrong list
  const reqs = `SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id IN (SELECT id FROM users WHERE email LIKE $2)`
  const reqArgs = [TEST_COMPANY_ID, `${EMAIL_PREFIX}%`]
  const pos = `SELECT id FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2`
  const poArgs = [TEST_COMPANY_ID, `${PO_PREFIX}%`]
  await pool.query(`DELETE FROM po_edit_requests WHERE requisition_id IN (${reqs})`, reqArgs)
  await pool.query(`DELETE FROM po_edit_requests WHERE po_id IN (${pos})`, poArgs)
  await pool.query(`DELETE FROM requisition_approval_log WHERE requisition_id IN (${reqs})`, reqArgs)
  await pool.query(`DELETE FROM po_approval_log WHERE po_id IN (${pos})`, poArgs)
  await pool.query(`DELETE FROM po_lines WHERE requisition_id IN (${reqs})`, reqArgs)
  await pool.query(`DELETE FROM po_lines WHERE po_id IN (${pos})`, poArgs)
  await pool.query(`DELETE FROM requisitions WHERE id IN (${reqs})`, reqArgs)
  await pool.query(`DELETE FROM purchase_orders WHERE id IN (${pos})`, poArgs)
  await pool.query(`DELETE FROM products WHERE company_id=$1 AND sku LIKE $2`, [TEST_COMPANY_ID, `${SKU_PREFIX}%`])
}

beforeAll(async () => {
  organizerId = await makeUser('organizer')
  strangerId = await makeUser('stranger')
  adminId = await makeUser('admin')
  await cleanup()
})
afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`]).catch(() => undefined)
  await pool.end()
})

describe('who counts as an administrator', () => {
  it('is the same three roles that could already approve an edit request, and nobody else', () => {
    expect([...EDIT_ADMIN_ROLES]).toEqual(['system_admin', 'company_admin', 'module_admin'])
    for (const r of EDIT_ADMIN_ROLES) expect(isEditAdminRole(r)).toBe(true)
    for (const r of ['user', 'manager', '', 'SYSTEM_ADMIN', null, undefined]) expect(isEditAdminRole(r)).toBe(false)
  })
})

describe('a requisition', () => {
  it.each(REQ_AFTER_APPROVAL)('refuses the organizer, a plain user, once it is %s: nothing is queued and nothing changes', async (status) => {
    const { reqId, lineId } = await makeRequisition(status)
    await expect(askReq(reqId, lineId, organizerId, 'user')).rejects.toThrow(REFUSAL_REQ)
    expect(await requestsOnReq(reqId)).toBe(0)
    expect(await lineQty(lineId)).toBe(3)
  })

  it.each(REQ_BEFORE_APPROVAL)('still lets the organizer edit it at once while it is %s', async (status) => {
    const { reqId, lineId } = await makeRequisition(status)
    const out = await askReq(reqId, lineId, organizerId, 'user')
    expect(out.status).toBe('approved')
    expect(await lineQty(lineId)).toBe(5)
  })

  it.each([...EDIT_ADMIN_ROLES])('lets a %s ask after approval, and the request waits for approval', async (role) => {
    const { reqId, lineId } = await makeRequisition('approved')
    const out = await askReq(reqId, lineId, adminId, role)
    expect(out.status).toBe('pending')
    expect(await lineQty(lineId)).toBe(3) // not applied until approved
  })

  it('still refuses a plain user with no tie to the requisition before approval, with the old reason', async () => {
    const { reqId, lineId } = await makeRequisition('draft')
    await expect(askReq(reqId, lineId, strangerId, 'user')).rejects.toThrow(/not associated with this requisition/)
    expect(await requestsOnReq(reqId)).toBe(0)
  })

  it('says the administrator rule, not the association one, to a stranger after approval', async () => {
    const { reqId, lineId } = await makeRequisition('approved')
    await expect(askReq(reqId, lineId, strangerId, 'user')).rejects.toThrow(REFUSAL_REQ)
  })

  it('leaves a request an employee filed before the rule in the queue: an administrator can still approve it, an employee cannot', async () => {
    const { reqId, lineId } = await makeRequisition('approved')
    const legacy = await pool.query<{ id: string }>(
      `INSERT INTO po_edit_requests (requisition_id, requested_by, changes, request_notes) VALUES ($1,$2,$3,'filed before the rule') RETURNING id`,
      [reqId, organizerId, qtyEdit(lineId)],
    )
    const requestId = legacy.rows[0]!.id
    await expect(
      resolvers.Mutation.approvePOEditRequest(null, { requisitionId: reqId, requestId } as never, ctxFor(organizerId, 'user')),
    ).rejects.toThrow(/Admin role required/)
    expect(await lineQty(lineId)).toBe(3)
    await resolvers.Mutation.approvePOEditRequest(null, { requisitionId: reqId, requestId } as never, ctxFor(adminId, 'system_admin'))
    expect(await lineQty(lineId)).toBe(5)
  })

  it('classifies every status the database allows: a status added later has to be decided on, not allowed by omission', async () => {
    const r = await pool.query<{ def: string }>(
      `SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c
        WHERE c.conrelid = 'requisitions'::regclass AND c.contype = 'c' AND pg_get_constraintdef(c.oid) LIKE '%inventory_check%'`,
    )
    const statuses = [...r.rows[0]!.def.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!)
    expect(statuses.length).toBeGreaterThan(8)
    const known = new Set([...REQ_BEFORE_APPROVAL, ...REQ_AFTER_APPROVAL])
    expect(statuses.filter((s) => !known.has(s))).toEqual([])
    expect([...known].filter((s) => !statuses.includes(s))).toEqual([])
    // and the library agrees with the lists above, so the two cannot drift
    expect([...AUTO_APPLY_REQUISITION_STATUSES].sort()).toEqual([...REQ_BEFORE_APPROVAL].sort())
    for (const s of REQ_AFTER_APPROVAL) expect(requisitionEditNeedsApproval(s)).toBe(true)
    for (const s of REQ_BEFORE_APPROVAL) expect(requisitionEditNeedsApproval(s)).toBe(false)
    expect(requisitionEditNeedsApproval('some_future_status')).toBe(true) // unknown means review, never open to everyone
  })
})

describe('a purchase order', () => {
  it.each(PO_AFTER_APPROVAL)('refuses the person who created it, a plain user, once it is %s: nothing is queued and nothing changes', async (status) => {
    const { poId, lineId } = await makePO(status)
    await expect(askPO(poId, lineId, organizerId, 'user')).rejects.toThrow(REFUSAL_PO)
    expect(await requestsOnPO(poId)).toBe(0)
    expect(await lineQty(lineId)).toBe(3)
  })

  it('still lets the person who created it edit at once while it is a draft', async () => {
    const { poId, lineId } = await makePO('draft')
    const out = await askPO(poId, lineId, organizerId, 'user')
    expect(out.status).toBe('approved')
    expect(await lineQty(lineId)).toBe(5)
  })

  it.each([...EDIT_ADMIN_ROLES])('lets a %s ask after approval, and the request waits for approval', async (role) => {
    const { poId, lineId } = await makePO('bought')
    const out = await askPO(poId, lineId, adminId, role)
    expect(out.status).toBe('pending')
    expect(await lineQty(lineId)).toBe(3)
  })

  it('says the administrator rule, not the association one, to a stranger after approval', async () => {
    const { poId, lineId } = await makePO('approved')
    await expect(askPO(poId, lineId, strangerId, 'user')).rejects.toThrow(REFUSAL_PO)
  })

  it('leaves a request an employee filed before the rule in the queue: an administrator can still approve it, an employee cannot', async () => {
    const { poId, lineId } = await makePO('bought')
    const legacy = await pool.query<{ id: string }>(
      `INSERT INTO po_edit_requests (po_id, requested_by, changes, request_notes) VALUES ($1,$2,$3,'filed before the rule') RETURNING id`,
      [poId, organizerId, qtyEdit(lineId)],
    )
    const requestId = legacy.rows[0]!.id
    await expect(
      resolvers.Mutation.approvePOEditRequest(null, { id: poId, requestId } as never, ctxFor(organizerId, 'user')),
    ).rejects.toThrow(/Admin role required/)
    await resolvers.Mutation.approvePOEditRequest(null, { id: poId, requestId } as never, ctxFor(adminId, 'company_admin'))
    expect(await lineQty(lineId)).toBe(5)
  })
})
