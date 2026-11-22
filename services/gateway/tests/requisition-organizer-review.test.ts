// The organizer review step (migration 329, playbook #115): after Items Bought and before any purchase order exists the
// organizer double-checks what was bought. Nothing changed and he did not buy the items himself: he confirms and the purchase
// orders are created. Otherwise a PO Admin (never the organizer) approves first.
//
// Real Postgres, real mutations, and the real schema for the query that runs through ApolloServer; nothing mocked. One user per
// role: the organizer (a plain user), a buyer, a PO Admin (a plain user holding the po_admin position), a stranger, two admins and
// an admin of another company. The flow is driven through direct supply (draft > approval > Items Bought), the shortest way
// to a requisition at Items Bought.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { pool } from '@fnc-erp/db'
import { typeDefs } from '../src/graphql/schema.js'
import { resolvers } from '../src/graphql/resolvers.js'
import {
  canActOnReview,
  canApproveReview,
  describeReviewEdit,
  nextReviewOriginals,
  reviewApprovalReason,
  reviewNeedsApproval,
} from '../src/lib/requisitionReview.js'

const COMPANY_ID = 'f0000000-0000-0000-0000-000000000009'
const OTHER_COMPANY_ID = 'f0000000-0000-0000-0000-000000000010'
const EMAIL_PREFIX = 'org-review-test-'
const CODE_PREFIX = 'ORVTEST-'
const VENDOR_PREFIX = 'ORVTEST-VENDOR-'
const FILE_PREFIX = 'orvtest/'
const EMP_PREFIX = 'ORVTEST-EMP-'

type Who = 'organizer' | 'buyer' | 'poadmin' | 'stranger' | 'admin' | 'admin2' | 'foreignadmin'
const WHO: Who[] = ['organizer', 'buyer', 'poadmin', 'stranger', 'admin', 'admin2', 'foreignadmin']
const userIds = {} as Record<Who, string>
let projectId: string
let vendorA: string
let vendorB: string
let toleranceBefore: { tolerance_pct: string; tolerance_abs: string; is_provisional: boolean } | null = null

type TestCtx = {
  auth: { companyId: string; userId: string; role: string; module: string; sessionId: string }
}
const ADMINS: Who[] = ['admin', 'admin2', 'foreignadmin']
const ctxFor = (who: Who, role?: string, companyId = COMPANY_ID): TestCtx => ({
  auth: {
    companyId,
    userId: userIds[who],
    role: role ?? (ADMINS.includes(who) ? 'system_admin' : 'user'),
    module: 'all',
    sessionId: 'orv-test',
  },
})
// A plain user cannot create a requisition or record a purchase in this fixture: act as an administrator WITH that user's id.
const asAdmin = (who: Who): TestCtx => ctxFor(who, 'system_admin')
const foreign = (): TestCtx => ctxFor('foreignadmin', 'system_admin', OTHER_COMPANY_ID)

const server = new ApolloServer<TestCtx>({ typeDefs, resolvers })

type Mut = Record<string, (...a: unknown[]) => Promise<unknown>>
const M = resolvers.Mutation as unknown as Mut
const Q = resolvers.Query as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>

async function makeReceipt(): Promise<string> {
  const f = await pool.query<{ id: string }>(
    `INSERT INTO files (company_id, uploaded_by, file_key, original_filename, mime_type, size_bytes, category, status)
     VALUES ($1,$2,$3,'receipt.jpg','image/jpeg',1024,'attachment','uploaded') RETURNING id`,
    [COMPANY_ID, userIds.admin, `${FILE_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`],
  )
  return f.rows[0]!.id
}

async function lineIds(reqId: string): Promise<string[]> {
  return (await pool.query<{ id: string }>(`SELECT id FROM po_lines WHERE requisition_id=$1 ORDER BY line_number`, [reqId])).rows.map(
    (r) => r.id,
  )
}
async function statusOf(reqId: string): Promise<string> {
  return (await pool.query<{ status: string }>(`SELECT status FROM requisitions WHERE id=$1`, [reqId])).rows[0]!.status
}
async function purchasesOf(reqId: string) {
  return (
    await pool.query<{
      id: string
      qty: string
      actual_unit_price: string
      over_tolerance: boolean
      tolerance_approved_by: string | null
      review_original_qty: string | null
      review_original_price: string | null
      bought_by: string
    }>(
      `SELECT plp.id, plp.qty, plp.actual_unit_price, plp.over_tolerance, plp.tolerance_approved_by,
              plp.review_original_qty, plp.review_original_price, plp.bought_by
         FROM po_line_purchases plp JOIN po_lines pl ON pl.id = plp.po_line_id
        WHERE pl.requisition_id=$1 ORDER BY pl.line_number`,
      [reqId],
    )
  ).rows
}
async function logActions(reqId: string): Promise<string[]> {
  return (
    await pool.query<{ action: string }>(
      `SELECT action FROM requisition_approval_log WHERE requisition_id=$1 ORDER BY created_at, id`,
      [reqId],
    )
  ).rows.map((r) => r.action)
}
async function childPOs(reqId: string) {
  return (
    await pool.query<{ id: string; status: string; vendor_id: string; total_amount: string | null }>(
      `SELECT id, status, vendor_id, total_amount FROM purchase_orders WHERE requisition_id=$1 ORDER BY created_at`,
      [reqId],
    )
  ).rows
}
async function notices(reqId: string, type: string, expectSome = true) {
  const read = async () =>
    (
      await pool.query<{ payload: Record<string, unknown> }>(
        `SELECT payload FROM service_outbox WHERE event_type=$1 AND payload->>'requisitionId'=$2`,
        [type, reqId],
      )
    ).rows
  if (!expectSome) return read()
  // one await-ed INSERT per recipient, fire-and-forget: wait until the count stops changing (playbook #35)
  let last = -1
  for (let i = 0; i < 40; i++) {
    const rows = await read()
    if (rows.length > 0 && rows.length === last) return rows
    last = rows.length
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`no ${type} notice was written`)
}

interface Bought {
  reqId: string
  lines: string[]
  purchases: string[]
}
// A direct supply requisition with two lines (10 x 12.50 USD each), approved, and BOTH lines bought in full with a receipt:
// line 1 from vendor A, line 2 from vendor B. `by` is who records the purchases. The last purchase takes it to the review.
async function reachReview(by: Who = 'buyer'): Promise<Bought> {
  const created = (await M.createRequisition(
    null,
    {
      input: {
        purpose: 'direct_supply',
        project_id: projectId,
        lines: [1, 2].map((n) => ({
          description: `Item ${n}`,
          qty: 10,
          unit_price: 12.5,
          uom: 'pc',
          requested_currency_code: 'USD',
        })),
      },
    },
    asAdmin('organizer'),
  )) as { id: string }
  await M.submitRequisitionDirectSupply(null, { id: created.id }, asAdmin('organizer'))
  await M.approveRequisition(null, { id: created.id }, ctxFor('admin'))
  const lines = await lineIds(created.id)
  const purchases: string[] = []
  for (const [i, lineId] of lines.entries()) {
    const p = (await M.recordLinePurchase(
      null,
      {
        input: {
          lineId,
          vendorId: i === 0 ? vendorA : vendorB,
          qty: 10,
          actualUnitPrice: 12.5,
          currencyCode: 'USD',
          receiptFileId: await makeReceipt(),
        },
      },
      asAdmin(by),
    )) as { id: string }
    purchases.push(p.id)
  }
  return { reqId: created.id, lines, purchases }
}

// The review mutations are called with the user's OWN role: the organizer is a plain user (no admin power), a stranger and a
// buyer have none either, and only 'admin' / 'admin2' are administrators. (asAdmin is only for recording purchases and
// creating requisitions, which a plain user cannot do in this fixture.)
const confirm = (reqId: string, who: Who = 'organizer') => M.confirmReview(null, { requisitionId: reqId }, ctxFor(who))
const submit = (reqId: string, who: Who = 'organizer', notes?: string) =>
  M.submitReviewForApproval(null, { requisitionId: reqId, notes }, ctxFor(who))
const approveR = (reqId: string, who: Who = 'poadmin') => M.approveReview(null, { requisitionId: reqId }, ctxFor(who))
const rejectR = (reqId: string, reason: string, who: Who = 'poadmin') =>
  M.rejectReview(null, { requisitionId: reqId, reason }, ctxFor(who))
const edit = (purchaseId: string, qty?: number, price?: number, who: Who = 'organizer') =>
  M.editReviewPurchase(null, { purchaseId, qty, actualUnitPrice: price }, ctxFor(who))
const sendBack = (reqId: string, reason: string, purchaseIds?: string[], who: Who = 'organizer') =>
  M.sendBackToBuying(null, { requisitionId: reqId, reason, purchaseIds }, ctxFor(who))

async function cleanup(): Promise<void> {
  const reqs = `SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id IN (SELECT id FROM users WHERE email LIKE $2)`
  const params = [COMPANY_ID, `${EMAIL_PREFIX}%`]
  await pool.query(
    `DELETE FROM po_line_purchases WHERE po_line_id IN (SELECT id FROM po_lines WHERE requisition_id IN (${reqs}) OR po_id IN (SELECT id FROM purchase_orders WHERE requisition_id IN (${reqs})))`,
    params,
  )
  await pool.query(`DELETE FROM document_attachments WHERE file_id IN (SELECT id FROM files WHERE file_key LIKE $1)`, [`${FILE_PREFIX}%`])
  await pool.query(`DELETE FROM files WHERE file_key LIKE $1`, [`${FILE_PREFIX}%`])
  await pool.query(
    `DELETE FROM service_outbox WHERE payload->>'requisitionId' IN (SELECT id::text FROM requisitions WHERE company_id=$1 AND organizer_id IN (SELECT id FROM users WHERE email LIKE $2))`,
    params,
  )
  await pool.query(`DELETE FROM po_edit_requests WHERE requisition_id IN (${reqs})`, params)
  await pool.query(`DELETE FROM requisition_approved_totals WHERE requisition_id IN (${reqs})`, params)
  await pool.query(`DELETE FROM requisition_approval_log WHERE requisition_id IN (${reqs})`, params)
  await pool.query(`DELETE FROM po_lines WHERE po_id IN (SELECT id FROM purchase_orders WHERE requisition_id IN (${reqs}))`, params)
  await pool.query(`DELETE FROM purchase_orders WHERE requisition_id IN (${reqs})`, params)
  await pool.query(`DELETE FROM po_lines WHERE requisition_id IN (${reqs})`, params)
  await pool.query(`DELETE FROM requisitions WHERE company_id=$1 AND organizer_id IN (SELECT id FROM users WHERE email LIKE $2)`, params)
  await pool.query(`DELETE FROM projects WHERE code LIKE $1`, [`${CODE_PREFIX}%`])
  await pool.query(`DELETE FROM vendors WHERE company_id=$1 AND name LIKE $2`, [COMPANY_ID, `${VENDOR_PREFIX}%`])
  await pool.query(
    `DELETE FROM po_position_assignments WHERE employee_id IN (SELECT id FROM employees WHERE employee_number LIKE $1)`,
    [`${EMP_PREFIX}%`],
  )
  await pool.query(`DELETE FROM employees WHERE employee_number LIKE $1`, [`${EMP_PREFIX}%`])
}

beforeAll(async () => {
  for (const who of WHO) {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
      [`${EMAIL_PREFIX}${who}@fnc-erp.local`],
    )
    userIds[who] = r.rows[0]!.id
  }
  await cleanup()
  // the organizer must be reachable by the notifier, the PO Admin holds the position; both active users
  const emp = await pool.query<{ id: string }>(
    `INSERT INTO employees (company_id, user_id, first_name, last_name, hire_date, employee_number)
     VALUES ($1,$2,'Poadmin','Tester',CURRENT_DATE,$3) RETURNING id`,
    [COMPANY_ID, userIds.poadmin, `${EMP_PREFIX}poadmin`],
  )
  await pool.query(
    `INSERT INTO po_position_assignments (company_id, employee_id, position, department_id, branch_id, is_active, assigned_by)
     VALUES ($1,$2,'po_admin',NULL,NULL,true,$3)`,
    [COMPANY_ID, emp.rows[0]!.id, userIds.admin],
  )
  projectId = (
    await pool.query<{ id: string }>(
      `INSERT INTO projects (company_id, code, name, status, created_by) VALUES ($1,$2,'Review test project','approved',$3) RETURNING id`,
      [COMPANY_ID, `${CODE_PREFIX}A`, userIds.admin],
    )
  ).rows[0]!.id
  const vendor = async (n: string) =>
    (
      await pool.query<{ id: string }>(`INSERT INTO vendors (company_id, name) VALUES ($1,$2) RETURNING id`, [
        COMPANY_ID,
        `${VENDOR_PREFIX}${n}-${Date.now()}`,
      ])
    ).rows[0]!.id
  vendorA = await vendor('A')
  vendorB = await vendor('B')
  // 5% or 1 USD, whichever is less: an estimate of 12.50 tolerates up to 13.125 and no more.
  const before = await pool.query(
    `SELECT tolerance_pct, tolerance_abs, is_provisional FROM company_price_tolerance WHERE company_id=$1 AND currency_code='USD'`,
    [COMPANY_ID],
  )
  toleranceBefore = before.rows[0] ?? null
  await pool.query(
    `INSERT INTO company_price_tolerance (company_id, currency_code, tolerance_pct, tolerance_abs, is_provisional)
     VALUES ($1,'USD',5,1,true)
     ON CONFLICT (company_id, currency_code) DO UPDATE SET tolerance_pct=5, tolerance_abs=1`,
    [COMPANY_ID],
  )
})

afterAll(async () => {
  await cleanup()
  if (toleranceBefore) {
    await pool.query(
      `UPDATE company_price_tolerance SET tolerance_pct=$2, tolerance_abs=$3, is_provisional=$4 WHERE company_id=$1 AND currency_code='USD'`,
      [COMPANY_ID, toleranceBefore.tolerance_pct, toleranceBefore.tolerance_abs, toleranceBefore.is_provisional],
    )
  } else {
    await pool.query(`DELETE FROM company_price_tolerance WHERE company_id=$1 AND currency_code='USD'`, [COMPANY_ID])
  }
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`])
  await pool.end()
})

describe('the rules in lib/requisitionReview.ts', () => {
  it('lets the organizer or an admin act, nobody else', () => {
    expect(canActOnReview({ callerId: 'o', callerIsAdmin: false, organizerId: 'o' })).toBe(true)
    expect(canActOnReview({ callerId: 'a', callerIsAdmin: true, organizerId: 'o' })).toBe(true)
    expect(canActOnReview({ callerId: 's', callerIsAdmin: false, organizerId: 'o' })).toBe(false)
    expect(canActOnReview({ callerId: 's', callerIsAdmin: false, organizerId: null })).toBe(false)
  })

  it('lets a PO Admin or an admin approve, and never the organizer, even an organizer who is an admin', () => {
    const base = { organizerId: 'o' }
    expect(canApproveReview({ ...base, callerId: 'p', callerIsAdmin: false, callerIsPoAdmin: true })).toBe(true)
    expect(canApproveReview({ ...base, callerId: 'a', callerIsAdmin: true, callerIsPoAdmin: false })).toBe(true)
    expect(canApproveReview({ ...base, callerId: 's', callerIsAdmin: false, callerIsPoAdmin: false })).toBe(false)
    expect(canApproveReview({ ...base, callerId: 'o', callerIsAdmin: true, callerIsPoAdmin: true })).toBe(false)
  })

  it('needs a PO Admin for a change, for the organizer\'s own purchases and for a missing tolerance sign-off', () => {
    expect(reviewNeedsApproval({ edited: 0, organizerBought: 0, unsignedTolerance: 0 })).toBe(false)
    expect(reviewNeedsApproval({ edited: 1, organizerBought: 0, unsignedTolerance: 0 })).toBe(true)
    expect(reviewNeedsApproval({ edited: 0, organizerBought: 2, unsignedTolerance: 0 })).toBe(true)
    expect(reviewNeedsApproval({ edited: 0, organizerBought: 0, unsignedTolerance: 1 })).toBe(true)
    expect(reviewApprovalReason({ edited: 0, organizerBought: 0, unsignedTolerance: 0 })).toBeNull()
    expect(reviewApprovalReason({ edited: 2, organizerBought: 1, unsignedTolerance: 1 })).toBe(
      '2 purchases were changed; the organizer recorded a purchase himself; 1 over-tolerance purchase needs a sign-off',
    )
  })

  it('remembers what a purchase held when the review began, and an edit back is no change', () => {
    const current = { qty: 10, price: 12.5 }
    const first = nextReviewOriginals({ current, originals: { qty: null, price: null }, next: { qty: 8, price: 12.5 } })
    expect(first).toEqual({ qty: 10, price: 12.5 })
    // a second edit keeps the FIRST "was"
    const second = nextReviewOriginals({ current: { qty: 8, price: 12.5 }, originals: first, next: { qty: 8, price: 14 } })
    expect(second).toEqual({ qty: 10, price: 12.5 })
    // back to the originals: unchanged
    const back = nextReviewOriginals({ current: { qty: 8, price: 14 }, originals: second, next: { qty: 10, price: 12.5 } })
    expect(back).toEqual({ qty: null, price: null })
  })

  it('words an edit for the Log', () => {
    expect(
      describeReviewEdit({ description: 'Pipe', currency: 'USD', before: { qty: 10, price: 12.5 }, after: { qty: 8, price: 14 } }),
    ).toBe('Pipe: qty 10 → 8, price 12.5 → 14 USD')
    expect(
      describeReviewEdit({ description: '', currency: 'USD', before: { qty: 10, price: 12.5 }, after: { qty: 10, price: 13 } }),
    ).toBe('Item: price 12.5 → 13 USD')
  })
})

describe('after the last purchase the requisition goes to the organizer, and no purchase order exists yet', () => {
  it('moves to organizer_review, forks nothing, logs finish_buying and tells the organizer', async () => {
    const b = await reachReview()
    expect(await statusOf(b.reqId)).toBe('organizer_review')
    expect(await childPOs(b.reqId)).toHaveLength(0)
    expect(await logActions(b.reqId)).toContain('finish_buying')
    const notes = await notices(b.reqId, 'REQ_REVIEW_REQUIRED')
    expect(notes).toHaveLength(1)
    expect(notes[0]!.payload.userId).toBe(userIds.organizer)
    expect(notes[0]!.payload.requisitionId).toBe(b.reqId)
    expect(notes[0]!.payload).not.toHaveProperty('poId')
  })

  it('the manual Finish Buying button on a requisition that has already moved on returns it unchanged', async () => {
    const b = await reachReview()
    const out = (await M.finishBuyingRequisition(null, { id: b.reqId }, ctxFor('admin'))) as { status: string }
    expect(out.status).toBe('organizer_review')
    expect(await childPOs(b.reqId)).toHaveLength(0)
  })

  it('a requisition with nothing bought (every line marked short) still goes to the review, and confirming forks nothing', async () => {
    const created = (await M.createRequisition(
      null,
      {
        input: {
          purpose: 'direct_supply',
          project_id: projectId,
          lines: [{ description: 'Short item', qty: 5, unit_price: 3, uom: 'pc', requested_currency_code: 'USD' }],
        },
      },
      asAdmin('organizer'),
    )) as { id: string }
    await M.submitRequisitionDirectSupply(null, { id: created.id }, asAdmin('organizer'))
    await M.approveRequisition(null, { id: created.id }, ctxFor('admin'))
    const [lineId] = await lineIds(created.id)
    await M.markRequisitionLineShort(null, { lineId, reason: 'vendor has none' }, ctxFor('admin'))
    expect(await statusOf(created.id)).toBe('organizer_review')
    await confirm(created.id)
    expect(await statusOf(created.id)).toBe('sourcing')
    expect(await childPOs(created.id)).toHaveLength(0)
  })
})

describe('confirming without changes', () => {
  it('the organizer confirms: one child purchase order per vendor is created and the requisition moves to Sourcing', async () => {
    const b = await reachReview()
    await confirm(b.reqId)
    expect(await statusOf(b.reqId)).toBe('sourcing')
    const pos = await childPOs(b.reqId)
    expect(pos.map((p) => p.vendor_id).sort()).toEqual([vendorA, vendorB].sort())
    expect(pos.every((p) => p.status === 'bought')).toBe(true)
    expect(await logActions(b.reqId)).toContain('confirm_review')
  })

  it('an admin may confirm for the organizer; a stranger and a plain buyer may not; another company\'s admin does not even find it', async () => {
    const strangerReq = await reachReview()
    await expect(confirm(strangerReq.reqId, 'stranger')).rejects.toThrow(/organizer, or an admin/)
    await expect(confirm(strangerReq.reqId, 'buyer')).rejects.toThrow(/organizer, or an admin/)
    await expect(M.confirmReview(null, { requisitionId: strangerReq.reqId }, foreign())).rejects.toThrow('Requisition not found')
    expect(await statusOf(strangerReq.reqId)).toBe('organizer_review')
    await M.confirmReview(null, { requisitionId: strangerReq.reqId }, ctxFor('admin2'))
    expect(await statusOf(strangerReq.reqId)).toBe('sourcing')
  })

  it('refuses a requisition that is not in the review, in words', async () => {
    const b = await reachReview()
    await confirm(b.reqId)
    await expect(confirm(b.reqId)).rejects.toThrow(/'sourcing', not in Organizer Review/)
  })

  it('two confirms at once create the purchase orders once (the loser is refused)', async () => {
    const b = await reachReview()
    const results = await Promise.allSettled([confirm(b.reqId), confirm(b.reqId, 'organizer')])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(await childPOs(b.reqId)).toHaveLength(2)
  })

  it('refuses while a line is no longer fully covered', async () => {
    const b = await reachReview()
    await edit(b.purchases[0]!, 6)
    await expect(submit(b.reqId)).rejects.toThrow(/fully bought or marked short/)
    await expect(confirm(b.reqId)).rejects.toThrow(/fully bought or marked short/)
  })
})

describe('changing a purchase', () => {
  it('stores the new quantity and price, keeps what it was, and logs it', async () => {
    const b = await reachReview()
    await edit(b.purchases[0]!, undefined, 12.9)
    const [p] = await purchasesOf(b.reqId)
    expect(Number(p!.actual_unit_price)).toBeCloseTo(12.9, 4)
    expect(Number(p!.review_original_price)).toBeCloseTo(12.5, 4)
    expect(Number(p!.review_original_qty)).toBeCloseTo(10, 4)
    const log = await pool.query<{ notes: string }>(
      `SELECT notes FROM requisition_approval_log WHERE requisition_id=$1 AND action='review_purchase_edited'`,
      [b.reqId],
    )
    expect(log.rows[0]!.notes).toBe('Item 1: price 12.5 → 12.9 USD')
  })

  it('a second edit keeps the first "was"; editing back to the original clears it, so the review needs nobody again', async () => {
    const b = await reachReview()
    await edit(b.purchases[0]!, undefined, 12.9)
    await edit(b.purchases[0]!, undefined, 13)
    expect(Number((await purchasesOf(b.reqId))[0]!.review_original_price)).toBeCloseTo(12.5, 4)
    await edit(b.purchases[0]!, undefined, 12.5)
    const [p] = await purchasesOf(b.reqId)
    expect(p!.review_original_price).toBeNull()
    expect(p!.review_original_qty).toBeNull()
    await confirm(b.reqId)
    expect(await statusOf(b.reqId)).toBe('sourcing')
  })

  it('moves quantity between two purchases of one split line with two edits', async () => {
    const created = (await M.createRequisition(
      null,
      {
        input: {
          purpose: 'direct_supply',
          project_id: projectId,
          lines: [{ description: 'Split item', qty: 10, unit_price: 12.5, uom: 'pc', requested_currency_code: 'USD' }],
        },
      },
      asAdmin('organizer'),
    )) as { id: string }
    await M.submitRequisitionDirectSupply(null, { id: created.id }, asAdmin('organizer'))
    await M.approveRequisition(null, { id: created.id }, ctxFor('admin'))
    const [lineId] = await lineIds(created.id)
    const buyPart = async (vendorId: string, qty: number) =>
      (await M.recordLinePurchase(
        null,
        { input: { lineId, vendorId, qty, actualUnitPrice: 12.5, currencyCode: 'USD', receiptFileId: await makeReceipt() } },
        ctxFor('buyer', 'system_admin'),
      )) as { id: string }
    const a = await buyPart(vendorA, 6)
    const bb = await buyPart(vendorB, 4)
    expect(await statusOf(created.id)).toBe('organizer_review')
    await edit(a.id, 5)
    await edit(bb.id, 5)
    const rows = await purchasesOf(created.id)
    expect(rows.map((r) => Number(r.qty)).sort()).toEqual([5, 5])
    await expect(M.confirmReview(null, { requisitionId: created.id }, asAdmin('organizer'))).rejects.toThrow(/PO Admin must approve/)
  })

  it('refuses over-buying a line, a zero or negative number, a no-op and an empty edit', async () => {
    const b = await reachReview()
    await expect(edit(b.purchases[0]!, 11)).rejects.toThrow(/Cannot make it 11/)
    await expect(edit(b.purchases[0]!, 0)).rejects.toThrow(/greater than 0/)
    await expect(edit(b.purchases[0]!, undefined, -1)).rejects.toThrow(/greater than 0/)
    await expect(edit(b.purchases[0]!, 10, 12.5)).rejects.toThrow(/nothing to change/)
    await expect(M.editReviewPurchase(null, { purchaseId: b.purchases[0] }, asAdmin('organizer'))).rejects.toThrow(/new quantity or a new price/)
  })

  it('only the organizer or an admin may change it, and only in the review', async () => {
    const b = await reachReview()
    await expect(edit(b.purchases[0]!, 9, undefined, 'stranger')).rejects.toThrow(/organizer, or an admin/)
    await expect(edit(b.purchases[0]!, 9, undefined, 'buyer')).rejects.toThrow(/organizer, or an admin/)
    await expect(M.editReviewPurchase(null, { purchaseId: b.purchases[0], qty: 9 }, foreign())).rejects.toThrow('Purchase entry not found')
    await edit(b.purchases[0]!, undefined, 12.6, 'admin2')
    await submit(b.reqId)
    await expect(edit(b.purchases[0]!, undefined, 12.7)).rejects.toThrow(/only while the requisition is in Organizer Review/)
  })

  it('a price above the approved ceiling plus tolerance is flagged again, unsigned, and a lower price clears it', async () => {
    const b = await reachReview()
    await edit(b.purchases[0]!, undefined, 14)
    let [p] = await purchasesOf(b.reqId)
    expect(p!.over_tolerance).toBe(true)
    expect(p!.tolerance_approved_by).toBeNull()
    await edit(b.purchases[0]!, undefined, 12.6)
    ;[p] = await purchasesOf(b.reqId)
    expect(p!.over_tolerance).toBe(false)
  })
})

describe('a purchase that was already signed off at Items Bought', () => {
  it('keeps its sign-off when only the quantity changes, and loses it when the price changes', async () => {
    const created = (await M.createRequisition(
      null,
      {
        input: {
          purpose: 'direct_supply',
          project_id: projectId,
          lines: [{ description: 'Signed item', qty: 10, unit_price: 12.5, uom: 'pc', requested_currency_code: 'USD' }],
        },
      },
      asAdmin('organizer'),
    )) as { id: string }
    await M.submitRequisitionDirectSupply(null, { id: created.id }, asAdmin('organizer'))
    await M.approveRequisition(null, { id: created.id }, ctxFor('admin'))
    const [lineId] = await lineIds(created.id)
    // 13.30 is above the 13.125 ceiling: flagged, and it waits for a supervisor other than the buyer
    const bought = (await M.recordLinePurchase(
      null,
      { input: { lineId, vendorId: vendorA, qty: 10, actualUnitPrice: 13.3, currencyCode: 'USD', receiptFileId: await makeReceipt() } },
      asAdmin('buyer'),
    )) as { id: string; over_tolerance: boolean }
    expect(bought.over_tolerance).toBe(true)
    expect(await statusOf(created.id)).toBe('items_bought')
    await M.approveTolerancePurchase(null, { purchaseId: bought.id }, ctxFor('admin2'))
    expect(await statusOf(created.id)).toBe('organizer_review')

    await edit(bought.id, 9)
    let [p] = await purchasesOf(created.id)
    expect(p!.over_tolerance).toBe(true)
    expect(p!.tolerance_approved_by).toBe(userIds.admin2)

    await edit(bought.id, undefined, 13.4)
    ;[p] = await purchasesOf(created.id)
    expect(p!.over_tolerance).toBe(true)
    expect(p!.tolerance_approved_by).toBeNull()
  })
})

describe('asking a PO Admin', () => {
  it('a change cannot be confirmed alone: it is submitted, the requisition waits, and the approvers are told (never the organizer)', async () => {
    const b = await reachReview()
    await edit(b.purchases[0]!, undefined, 12.9)
    await expect(confirm(b.reqId)).rejects.toThrow(/PO Admin must approve this first \(1 purchase was changed\)/)
    await submit(b.reqId, 'organizer', 'supplier raised the price')
    expect(await statusOf(b.reqId)).toBe('review_approval')
    expect(await childPOs(b.reqId)).toHaveLength(0)
    const notes = await notices(b.reqId, 'REQ_REVIEW_APPROVAL_REQUIRED')
    const recipients = notes.map((n) => n.payload.userId)
    expect(recipients).toContain(userIds.poadmin)
    expect(recipients).not.toContain(userIds.organizer)
    expect(recipients).not.toContain(userIds.foreignadmin)
    const log = await pool.query<{ notes: string }>(
      `SELECT notes FROM requisition_approval_log WHERE requisition_id=$1 AND action='submit_review'`,
      [b.reqId],
    )
    expect(log.rows[0]!.notes).toBe('1 purchase was changed. supplier raised the price')
  })

  it('refuses to submit when nothing needs a PO Admin, and to confirm while it waits', async () => {
    const clean = await reachReview()
    await expect(submit(clean.reqId)).rejects.toThrow(/confirm the review instead/)
    const waiting = await reachReview()
    await edit(waiting.purchases[0]!, undefined, 12.9)
    await submit(waiting.reqId)
    await expect(confirm(waiting.reqId)).rejects.toThrow(/not in Organizer Review/)
  })

  it('a requisition whose purchases the organizer recorded himself always needs a PO Admin, even with no change', async () => {
    const b = await reachReview('organizer')
    await expect(confirm(b.reqId)).rejects.toThrow(/the organizer recorded 2 purchases himself/)
    await submit(b.reqId)
    expect(await statusOf(b.reqId)).toBe('review_approval')
    await approveR(b.reqId)
    expect(await statusOf(b.reqId)).toBe('sourcing')
  })

  it('a mix is judged by what the organizer recorded: his one purchase is enough', async () => {
    const created = (await M.createRequisition(
      null,
      {
        input: {
          purpose: 'direct_supply',
          project_id: projectId,
          lines: [1, 2].map((n) => ({ description: `Mixed ${n}`, qty: 4, unit_price: 5, uom: 'pc', requested_currency_code: 'USD' })),
        },
      },
      asAdmin('organizer'),
    )) as { id: string }
    await M.submitRequisitionDirectSupply(null, { id: created.id }, asAdmin('organizer'))
    await M.approveRequisition(null, { id: created.id }, ctxFor('admin'))
    const lines = await lineIds(created.id)
    for (const [i, lineId] of lines.entries()) {
      await M.recordLinePurchase(
        null,
        { input: { lineId, vendorId: vendorA, qty: 4, actualUnitPrice: 5, currencyCode: 'USD', receiptFileId: await makeReceipt() } },
        asAdmin(i === 0 ? 'buyer' : 'organizer'),
      )
    }
    await expect(confirm(created.id)).rejects.toThrow(/the organizer recorded a purchase himself/)
  })
})

describe('the PO Admin decides', () => {
  it('approves: the purchase orders are created from the CHANGED values and the requisition moves to Sourcing', async () => {
    const b = await reachReview()
    await edit(b.purchases[0]!, undefined, 13)
    await edit(b.purchases[1]!, undefined, 12.6)
    await submit(b.reqId)
    await approveR(b.reqId)
    expect(await statusOf(b.reqId)).toBe('sourcing')
    const pos = await childPOs(b.reqId)
    expect(pos).toHaveLength(2)
    const lineOf = async (vendorId: string) =>
      (
        await pool.query<{ qty_ordered: string; unit_price: string }>(
          `SELECT pl.qty_ordered, pl.unit_price FROM po_lines pl JOIN purchase_orders po ON po.id=pl.po_id
            WHERE po.requisition_id=$1 AND po.vendor_id=$2`,
          [b.reqId, vendorId],
        )
      ).rows[0]!
    const lineA = await lineOf(vendorA)
    const lineB = await lineOf(vendorB)
    expect(Number(lineA.qty_ordered)).toBeCloseTo(10, 4)
    expect(Number(lineA.unit_price)).toBeCloseTo(13, 4)
    expect(Number(lineB.unit_price)).toBeCloseTo(12.6, 4)
    const log = await pool.query<{ actor_position: string | null }>(
      `SELECT actor_position FROM requisition_approval_log WHERE requisition_id=$1 AND action='approve_review'`,
      [b.reqId],
    )
    expect(log.rows[0]!.actor_position).toBe('po_admin')
    const decided = await notices(b.reqId, 'REQ_REVIEW_DECIDED')
    expect(decided[0]!.payload.userId).toBe(userIds.organizer)
  })

  it('an admin may approve too; the organizer never may, not even as an admin; a stranger may not; another company cannot find it', async () => {
    const b = await reachReview()
    await edit(b.purchases[0]!, undefined, 12.8)
    await submit(b.reqId)
    await expect(M.approveReview(null, { requisitionId: b.reqId }, asAdmin('organizer'))).rejects.toThrow(/never the requisition's organizer/)
    await expect(approveR(b.reqId, 'stranger')).rejects.toThrow(/PO Admin or an admin/)
    await expect(approveR(b.reqId, 'buyer')).rejects.toThrow(/PO Admin or an admin/)
    await expect(M.approveReview(null, { requisitionId: b.reqId }, foreign())).rejects.toThrow('Requisition not found')
    expect(await statusOf(b.reqId)).toBe('review_approval')
    await M.approveReview(null, { requisitionId: b.reqId }, ctxFor('admin2'))
    expect(await statusOf(b.reqId)).toBe('sourcing')
  })

  it('approving signs off the over-tolerance purchase an edit brought back, together with creating the purchase orders', async () => {
    const b = await reachReview()
    await edit(b.purchases[0]!, undefined, 14)
    await expect(confirm(b.reqId)).rejects.toThrow(/PO Admin must approve this first \(1 purchase was changed; 1 over-tolerance/)
    await submit(b.reqId)
    await approveR(b.reqId)
    const [p] = await purchasesOf(b.reqId)
    expect(p!.over_tolerance).toBe(true)
    expect(p!.tolerance_approved_by).toBe(userIds.poadmin)
  })

  it('rejects with a reason: back to the organizer, what he changed is kept, and he is told', async () => {
    const b = await reachReview()
    await edit(b.purchases[0]!, undefined, 12.9)
    await submit(b.reqId)
    await expect(rejectR(b.reqId, '   ')).rejects.toThrow(/reason is required/)
    await expect(rejectR(b.reqId, 'no', 'stranger')).rejects.toThrow(/PO Admin or an admin/)
    await rejectR(b.reqId, 'Price is too high, ask the vendor again')
    expect(await statusOf(b.reqId)).toBe('organizer_review')
    expect(Number((await purchasesOf(b.reqId))[0]!.actual_unit_price)).toBeCloseTo(12.9, 4)
    const decided = await notices(b.reqId, 'REQ_REVIEW_DECIDED')
    expect(decided.some((n) => String(n.payload.body).includes('Price is too high'))).toBe(true)
    const seen = (await Q.requisition(null, { id: b.reqId }, asAdmin('organizer'))) as {
      review: { last_rejection: { reason: string } | null }
    }
    expect(seen.review.last_rejection?.reason).toBe('Price is too high, ask the vendor again')
    // he may edit again and submit again
    await edit(b.purchases[0]!, undefined, 12.5)
    expect(await statusOf(b.reqId)).toBe('organizer_review')
  })
})

describe('sending the requisition back to the buyers', () => {
  it('with a reason and the purchases to record again: they are removed with their receipts, the buyers are told, and it comes back by itself', async () => {
    const b = await reachReview()
    // the edited purchase STAYS (the other one is removed): its "was" markers must be cleared for the next review
    await edit(b.purchases[1]!, undefined, 12.9)
    expect((await purchasesOf(b.reqId))[1]!.review_original_price).not.toBeNull()
    await expect(sendBack(b.reqId, '  ')).rejects.toThrow(/reason is required/)
    await expect(sendBack(b.reqId, 'wrong vendor', undefined, 'stranger')).rejects.toThrow(/organizer, or an admin/)
    await sendBack(b.reqId, 'Wrong vendor on item 1', [b.purchases[0]!])
    expect(await statusOf(b.reqId)).toBe('items_bought')
    const rows = await purchasesOf(b.reqId)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.review_original_price).toBeNull()
    expect(rows[0]!.review_original_qty).toBeNull()
    expect(Number(rows[0]!.actual_unit_price)).toBeCloseTo(12.9, 4) // the edited value itself is kept
    const attachments = await pool.query(`SELECT 1 FROM document_attachments WHERE entity_type='po_line_purchase' AND entity_id=$1`, [b.purchases[0]])
    expect(attachments.rows).toHaveLength(0)
    const told = await notices(b.reqId, 'REQ_SENT_BACK_TO_BUYING')
    expect(told.map((n) => n.payload.userId)).toContain(userIds.buyer)
    expect(String(told[0]!.payload.body)).toContain('Wrong vendor on item 1')
    // the buyer records it again: back to the review by itself
    await M.recordLinePurchase(
      null,
      { input: { lineId: b.lines[0], vendorId: vendorB, qty: 10, actualUnitPrice: 12.5, currencyCode: 'USD', receiptFileId: await makeReceipt() } },
      ctxFor('buyer', 'system_admin'),
    )
    expect(await statusOf(b.reqId)).toBe('organizer_review')
  })

  it('refuses a purchase that belongs to another requisition, and removes nothing', async () => {
    const one = await reachReview()
    const two = await reachReview()
    await expect(sendBack(one.reqId, 'x', [two.purchases[0]!])).rejects.toThrow(/does not belong to this requisition/)
    expect(await statusOf(one.reqId)).toBe('organizer_review')
    expect(await purchasesOf(two.reqId)).toHaveLength(2)
  })

  it('without removing anything it returns to Items Bought, and the Finish Buying button brings it back to the review', async () => {
    const b = await reachReview()
    await sendBack(b.reqId, 'Receipt photo is unreadable')
    expect(await statusOf(b.reqId)).toBe('items_bought')
    await M.finishBuyingRequisition(null, { id: b.reqId }, ctxFor('admin'))
    expect(await statusOf(b.reqId)).toBe('organizer_review')
  })

  it('is not possible once the PO Admin has it, only after he rejects', async () => {
    const b = await reachReview()
    await edit(b.purchases[0]!, undefined, 12.9)
    await submit(b.reqId)
    await expect(sendBack(b.reqId, 'x')).rejects.toThrow(/not in Organizer Review/)
  })
})

describe('what the page reads', () => {
  it('review is filled in the two review statuses only, with per-currency totals that never add across currencies', async () => {
    const b = await reachReview()
    await edit(b.purchases[0]!, undefined, 13)
    const seen = (await Q.requisition(null, { id: b.reqId }, asAdmin('organizer'))) as {
      review: {
        needs_approval: boolean
        approval_reason: string
        edited_count: number
        caller_can_edit: boolean
        caller_can_approve: boolean
        totals: { currency_code: string; was: string; now: string; purchases: number }[]
      } | null
    }
    expect(seen.review).not.toBeNull()
    expect(seen.review!.needs_approval).toBe(true)
    expect(seen.review!.edited_count).toBe(1)
    expect(seen.review!.caller_can_edit).toBe(true)
    expect(seen.review!.caller_can_approve).toBe(false)
    expect(seen.review!.totals).toHaveLength(1)
    const t = seen.review!.totals[0]!
    expect(t.currency_code).toBe('USD')
    expect(Number(t.was)).toBeCloseTo(250, 4) // 10 x 12.50 twice
    expect(Number(t.now)).toBeCloseTo(10 * 13 + 125, 4)
    expect(t.purchases).toBe(2)

    const forStranger = (await Q.requisition(null, { id: b.reqId }, ctxFor('stranger'))) as { review: { caller_can_edit: boolean } | null }
    expect(forStranger.review?.caller_can_edit).toBe(false)

    await submit(b.reqId)
    const forPoAdmin = (await Q.requisition(null, { id: b.reqId }, ctxFor('poadmin'))) as {
      review: { caller_can_edit: boolean; caller_can_approve: boolean }
    }
    expect(forPoAdmin.review.caller_can_approve).toBe(true)
    expect(forPoAdmin.review.caller_can_edit).toBe(false)
    const forOrganizer = (await Q.requisition(null, { id: b.reqId }, asAdmin('organizer'))) as {
      review: { caller_can_approve: boolean; caller_can_edit: boolean }
    }
    expect(forOrganizer.review.caller_can_approve).toBe(false)
    // while a PO Admin holds it the organizer can no longer change anything (even as an admin)
    expect(forOrganizer.review.caller_can_edit).toBe(false)

    await approveR(b.reqId)
    const done = (await Q.requisition(null, { id: b.reqId }, ctxFor('admin'))) as { review: unknown }
    expect(done.review).toBeNull()
  })

  it('every field of the review and of a purchase\'s "was" values is in the real schema (a field the schema lacks nulls the page)', async () => {
    const b = await reachReview()
    await edit(b.purchases[0]!, undefined, 12.9)
    const res = await server.executeOperation(
      {
        query: `query($id: ID!) { requisition(id: $id) {
          id status
          review { needs_approval approval_reason edited_count organizer_bought_count unsigned_tolerance_count
                   caller_can_edit caller_can_approve last_rejection { reason by_name at }
                   totals { currency_code was now purchases } }
          lines { purchases { id qty actual_unit_price review_original_qty review_original_price receipt_filename } }
        } }`,
        variables: { id: b.reqId },
      },
      { contextValue: asAdmin('organizer') },
    )
    expect(res.body.kind).toBe('single')
    if (res.body.kind !== 'single') return
    expect(res.body.singleResult.errors).toBeUndefined()
    const data = res.body.singleResult.data as {
      requisition: { review: { edited_count: number }; lines: { purchases: { review_original_price: string | null }[] }[] }
    }
    expect(data.requisition.review.edited_count).toBe(1)
    expect(Number(data.requisition.lines[0]!.purchases[0]!.review_original_price)).toBeCloseTo(12.5, 4)
  })

  it('the new mutations are in the real schema with the arguments the page sends', async () => {
    const b = await reachReview()
    const res = await server.executeOperation(
      {
        query: `mutation($id: ID!, $p: ID!) {
          editReviewPurchase(purchaseId: $p, qty: 9) { id qty }
          confirmReviewProbe: sendBackToBuying(requisitionId: $id, reason: "probe", purchaseIds: []) { id status }
        }`,
        variables: { id: b.reqId, p: b.purchases[0] },
      },
      { contextValue: asAdmin('organizer') },
    )
    expect(res.body.kind).toBe('single')
    if (res.body.kind !== 'single') return
    expect(res.body.singleResult.errors).toBeUndefined()
    expect(await statusOf(b.reqId)).toBe('items_bought')
  })
})

describe('My Queue', () => {
  const queueIds = async (who: Who, role?: string) =>
    ((await Q.myRequisitionApprovalQueue(null, {}, role ? ctxFor(who, role) : ctxFor(who))) as { id: string }[]).map((r) => r.id)

  it('lists the review for the organizer (and the admins who act for him), not for a stranger', async () => {
    const b = await reachReview()
    expect(await queueIds('organizer')).toContain(b.reqId)
    expect(await queueIds('admin')).toContain(b.reqId)
    expect(await queueIds('stranger')).not.toContain(b.reqId)
    expect(await queueIds('poadmin')).not.toContain(b.reqId)
  })

  it('lists the approval for a PO Admin and the admins, never for the organizer himself, even an organizer who is an admin', async () => {
    const b = await reachReview()
    await edit(b.purchases[0]!, undefined, 12.9)
    await submit(b.reqId)
    expect(await queueIds('poadmin')).toContain(b.reqId)
    expect(await queueIds('admin')).toContain(b.reqId)
    expect(await queueIds('organizer')).not.toContain(b.reqId)
    expect(await queueIds('organizer', 'system_admin')).not.toContain(b.reqId)
    expect(await queueIds('stranger')).not.toContain(b.reqId)
  })

  it('has nothing for a requisition that moved on', async () => {
    const b = await reachReview()
    await confirm(b.reqId)
    expect(await queueIds('organizer')).not.toContain(b.reqId)
    expect(await queueIds('admin')).not.toContain(b.reqId)
  })
})

describe('cancelling', () => {
  it('works from the review and from the approval, with no purchase order to cancel', async () => {
    const one = await reachReview()
    await M.cancelRequisition(null, { id: one.reqId }, asAdmin('organizer'))
    expect(await statusOf(one.reqId)).toBe('cancelled')
    const two = await reachReview()
    await edit(two.purchases[0]!, undefined, 12.9)
    await submit(two.reqId)
    await M.cancelRequisition(null, { id: two.reqId }, ctxFor('admin'))
    expect(await statusOf(two.reqId)).toBe('cancelled')
  })
})
