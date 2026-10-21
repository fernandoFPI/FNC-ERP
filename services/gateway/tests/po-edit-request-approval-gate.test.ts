// Whether an edit request on a purchase order needs an admin's approval.
//
// Regression: the gate was a list of POST-approval statuses and "everything else"
// auto-applied. It predated the requisition-split child POs, so their statuses
// (bought, finance_review, payment_pending, closed) were missing and edits to a
// child PO in Finance review, quantities and prices included, were applied by the
// requester with no admin review (NY-PO-2026-0042, Oct 2026). It is now an
// allow-list of the pre-approval statuses (lib/poEditApproval.ts).
//
// Real-Postgres pattern, nothing mocked. The "every status is classified" test
// reads the statuses from the purchase_orders CHECK constraint itself, so adding a
// status in a migration fails it until someone decides which side it belongs on.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'
import { AUTO_APPLY_PO_STATUSES, poEditNeedsApproval } from '../src/lib/poEditApproval.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const EMAIL_PREFIX = 'po-edit-gate-test-'
const SKU_PREFIX = 'PEGTEST-'
const PO_PREFIX = 'PEGTEST-PO-'

// Every purchase_orders.status the database allows, and which side of the gate each is on.
const AUTO_APPLY = [
  'draft',
  'inventory_check',
  'store_pricing',
  'market_pricing',
  'price_verification',
  'pending_approval',
  'rejected',
  'deleted',
]
const NEEDS_APPROVAL = [
  'approved',
  'ready_to_issue',
  'items_bought',
  'goods_received',
  'finance_audit',
  'invoiced',
  'completed',
  'cancelled',
  // requisition-split child POs
  'bought',
  'finance_review',
  'payment_pending',
  'closed',
]

let requesterId: string
let adminId: string

const ctxFor = (userId: string, role: string) =>
  ({
    auth: { companyId: TEST_COMPANY_ID, userId, role, module: 'all', sessionId: 'peg-test' },
  }) as never

async function makeUser(key: string): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [`${EMAIL_PREFIX}${key}@fnc-erp.local`],
  )
  return r.rows[0]!.id
}

async function makePO(status: string): Promise<{ poId: string; lineId: string }> {
  const sku = `${SKU_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const prod = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$2,'unit','general') RETURNING id`,
    [TEST_COMPANY_ID, sku],
  )
  const po = await pool.query<{ id: string }>(
    `INSERT INTO purchase_orders (company_id, po_number, created_by, status, currency_code, purpose)
     VALUES ($1,$2,$3,$4,'IQD','stock') RETURNING id`,
    [
      TEST_COMPANY_ID,
      `${PO_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      requesterId,
      status,
    ],
  )
  const line = await pool.query<{ id: string }>(
    `INSERT INTO po_lines (po_id, line_number, description, product_id, qty_ordered, unit_price, total_price)
     VALUES ($1,1,'test line',$2,1,10,10) RETURNING id`,
    [po.rows[0]!.id, prod.rows[0]!.id],
  )
  return { poId: po.rows[0]!.id, lineId: line.rows[0]!.id }
}

const qtyEdit = (lineId: string) =>
  JSON.stringify({ lines: { edited: [{ id: lineId, field: 'qty_ordered', from: 1, to: 2 }] } })

const requesterSubmits = (poId: string, lineId: string) =>
  resolvers.Mutation.submitPOEditRequest(
    null,
    { id: poId, changes: qtyEdit(lineId) } as never,
    ctxFor(requesterId, 'user'),
  ) as Promise<{ id: string; status: string; reviewed_by: string | null }>

async function qty(lineId: string): Promise<number> {
  const r = await pool.query<{ qty_ordered: string }>(
    `SELECT qty_ordered FROM po_lines WHERE id=$1`,
    [lineId],
  )
  return parseFloat(r.rows[0]!.qty_ordered)
}

async function cleanup(): Promise<void> {
  const pos = `SELECT id FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2`
  const args = [TEST_COMPANY_ID, `${PO_PREFIX}%`]
  await pool.query(`DELETE FROM po_edit_requests WHERE po_id IN (${pos})`, args)
  await pool.query(`DELETE FROM po_approval_log WHERE po_id IN (${pos})`, args)
  await pool.query(`DELETE FROM po_lines WHERE po_id IN (${pos})`, args)
  await pool.query(`DELETE FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2`, args)
  await pool.query(`DELETE FROM products WHERE company_id=$1 AND sku LIKE $2`, [
    TEST_COMPANY_ID,
    `${SKU_PREFIX}%`,
  ])
}

beforeAll(async () => {
  requesterId = await makeUser('requester')
  adminId = await makeUser('admin')
  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await pool
    .query(`DELETE FROM users WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`])
    .catch(() => undefined)
  await pool.end()
})

describe('the gate itself', () => {
  it('is an allow-list: the pre-approval statuses auto-apply, everything else needs approval', () => {
    expect([...AUTO_APPLY_PO_STATUSES].sort()).toEqual([...AUTO_APPLY].sort())
    for (const s of AUTO_APPLY) expect(poEditNeedsApproval(s)).toBe(false)
    for (const s of NEEDS_APPROVAL) expect(poEditNeedsApproval(s)).toBe(true)
  })

  it('treats a status it has never heard of as needing approval (safe by default)', () => {
    expect(poEditNeedsApproval('some_future_status')).toBe(true)
    expect(poEditNeedsApproval('')).toBe(true)
  })

  it('classifies every status the purchase_orders CHECK constraint allows', async () => {
    const r = await pool.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
       WHERE conrelid='purchase_orders'::regclass AND conname='purchase_orders_status_check'`,
    )
    const inDb = [...r.rows[0]!.def.matchAll(/'([a-z_]+)'::character varying/g)].map((m) => m[1]!)
    expect(inDb.length).toBeGreaterThan(15)
    // A status added by a migration lands here until someone decides which side of the gate it is on.
    expect([...inDb].sort()).toEqual([...AUTO_APPLY, ...NEEDS_APPROVAL].sort())
  })
})

describe('submitPOEditRequest, requester role (not an admin)', () => {
  it.each(AUTO_APPLY)('applies at once while the PO is %s', async (status) => {
    const { poId, lineId } = await makePO(status)
    const out = await requesterSubmits(poId, lineId)
    expect(out.status).toBe('approved')
    expect(await qty(lineId)).toBe(2)
  })

  it.each(NEEDS_APPROVAL)(
    'queues for admin approval and changes nothing while the PO is %s',
    async (status) => {
      const { poId, lineId } = await makePO(status)
      const out = await requesterSubmits(poId, lineId)
      expect(out.status).toBe('pending')
      expect(out.reviewed_by).toBeNull()
      expect(await qty(lineId)).toBe(1) // not applied
      const log = await pool.query(
        `SELECT 1 FROM po_approval_log WHERE po_id=$1 AND action='edit_applied'`,
        [poId],
      )
      expect(log.rows).toHaveLength(0)
    },
  )
})

describe('the case that was reported: a child PO in Finance review', () => {
  it('stays pending until an admin approves it, then applies and is logged as approved by the admin', async () => {
    const { poId, lineId } = await makePO('finance_review')
    const submitted = await requesterSubmits(poId, lineId)
    expect(submitted.status).toBe('pending')
    expect(await qty(lineId)).toBe(1)

    await resolvers.Mutation.approvePOEditRequest(
      null,
      { id: poId, requestId: submitted.id, reviewNotes: 'checked with the buyer' } as never,
      ctxFor(adminId, 'system_admin'),
    )
    expect(await qty(lineId)).toBe(2)

    const er = await pool.query<{ status: string; reviewed_by: string }>(
      `SELECT status, reviewed_by FROM po_edit_requests WHERE id=$1`,
      [submitted.id],
    )
    expect(er.rows[0]!.status).toBe('approved')
    expect(er.rows[0]!.reviewed_by).toBe(adminId) // reviewed by the admin, not the requester
    const log = await pool.query(
      `SELECT 1 FROM po_approval_log WHERE po_id=$1 AND action='edit_approved'`,
      [poId],
    )
    expect(log.rows).toHaveLength(1)
  })

  it('an admin can also reject it, leaving the line untouched', async () => {
    const { poId, lineId } = await makePO('bought')
    const submitted = await requesterSubmits(poId, lineId)
    await resolvers.Mutation.rejectPOEditRequest(
      null,
      { id: poId, requestId: submitted.id, reviewNotes: 'not warranted' } as never,
      ctxFor(adminId, 'system_admin'),
    )
    expect(await qty(lineId)).toBe(1)
    const er = await pool.query<{ status: string }>(
      `SELECT status FROM po_edit_requests WHERE id=$1`,
      [submitted.id],
    )
    expect(er.rows[0]!.status).toBe('rejected')
  })
})
