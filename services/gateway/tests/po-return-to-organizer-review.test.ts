// Finance sends a purchase order that failed its review back to the requisition's Organizer Review, and the PO keeps its number
// (migration 337, playbook #129). Real Postgres, the real mutations and the real schema for the reads the pages make.
//
// The fixture is the real flow up to the fork (create, approve, buy, pass the review), so the purchase orders and their
// po_lines.purchase_id links are made by the code under test. The only shortcut is the last step to Finance review: the PO's lines
// are marked fully received and its status set, because recording and confirming a receipt is covered by its own tests.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { pool } from '@fnc-erp/db'
import { typeDefs } from '../src/graphql/schema.js'
import { resolvers } from '../src/graphql/resolvers.js'
import {
  lineNeedsNewReceipt,
  purchaseChangesLine,
  reopenedNotAvailable,
  returnTargetStatus,
} from '../src/lib/poReturnReview.js'
import { passReview } from './review-helpers.js'

const COMPANY_ID = 'f0000000-0000-0000-0000-000000000009'
const EMAIL_PREFIX = 'po-return-test-'
const CODE_PREFIX = 'PORETTEST-'
const VENDOR_PREFIX = 'PORETTEST-VENDOR-'
const FILE_PREFIX = 'poretest/'

type Who = 'organizer' | 'buyer' | 'admin'
const WHO: Who[] = ['organizer', 'buyer', 'admin']
const userIds = {} as Record<Who, string>
let projectId: string
let vendorA: string
let vendorB: string
let vendorC: string

type TestCtx = {
  auth: { companyId: string; userId: string; role: string; module: string; sessionId: string }
}
const ctxFor = (who: Who, role?: string): TestCtx => ({
  auth: {
    companyId: COMPANY_ID,
    userId: userIds[who],
    role: role ?? (who === 'admin' ? 'system_admin' : 'user'),
    module: 'all',
    sessionId: 'po-return-test',
  },
})
const asAdmin = (who: Who): TestCtx => ctxFor(who, 'system_admin')

const server = new ApolloServer<TestCtx>({ typeDefs, resolvers })
type Mut = Record<string, (...a: unknown[]) => Promise<unknown>>
const M = resolvers.Mutation as unknown as Mut

async function makeReceipt(): Promise<string> {
  const f = await pool.query<{ id: string }>(
    `INSERT INTO files (company_id, uploaded_by, file_key, original_filename, mime_type, size_bytes, category, status)
     VALUES ($1,$2,$3,'receipt.jpg','image/jpeg',1024,'attachment','uploaded') RETURNING id`,
    [COMPANY_ID, userIds.admin, `${FILE_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`],
  )
  return f.rows[0]!.id
}

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
  await pool.query(`DELETE FROM requisition_review_removed_lines WHERE requisition_id IN (${reqs})`, params)
  await pool.query(`DELETE FROM requisition_approved_totals WHERE requisition_id IN (${reqs})`, params)
  await pool.query(`DELETE FROM requisition_approval_log WHERE requisition_id IN (${reqs})`, params)
  await pool.query(`DELETE FROM po_approval_log WHERE po_id IN (SELECT id FROM purchase_orders WHERE requisition_id IN (${reqs}))`, params)
  await pool.query(`DELETE FROM po_lines WHERE po_id IN (SELECT id FROM purchase_orders WHERE requisition_id IN (${reqs}))`, params)
  await pool.query(`DELETE FROM purchase_orders WHERE requisition_id IN (${reqs})`, params)
  await pool.query(`DELETE FROM po_lines WHERE requisition_id IN (${reqs})`, params)
  await pool.query(`DELETE FROM requisitions WHERE company_id=$1 AND organizer_id IN (SELECT id FROM users WHERE email LIKE $2)`, params)
  await pool.query(`DELETE FROM project_cost_actuals WHERE project_id IN (SELECT id FROM projects WHERE code LIKE $1)`, [`${CODE_PREFIX}%`])
  await pool.query(`DELETE FROM projects WHERE code LIKE $1`, [`${CODE_PREFIX}%`])
  await pool.query(`DELETE FROM vendors WHERE company_id=$1 AND name LIKE $2`, [COMPANY_ID, `${VENDOR_PREFIX}%`])
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
  projectId = (
    await pool.query<{ id: string }>(
      `INSERT INTO projects (company_id, code, name, status, created_by) VALUES ($1,$2,'PO return test project','approved',$3) RETURNING id`,
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
  vendorC = await vendor('C')
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`])
  await pool.end()
})

interface Fixture {
  reqId: string
  reqNumber: string
  lines: string[] // the requisition's own lines, in order
  poA: string
  poB: string
  numberA: string
  numberB: string
  purchases: string[] // one per line, in order
}

// A direct supply requisition with three lines of 5 x 40 USD: lines 1 and 2 are bought from vendor A, line 3 from vendor B. It is
// approved, bought, passed through the review (so the two purchase orders are made by the real fork) and both POs are put at
// Finance review with everything received.
async function reachFinanceReview(): Promise<Fixture> {
  const created = (await M.createRequisition(
    null,
    {
      input: {
        purpose: 'direct_supply',
        project_id: projectId,
        lines: [1, 2, 3].map((n) => ({
          description: `Return item ${n}`,
          qty: 5,
          unit_price: 40,
          uom: 'pc',
          requested_currency_code: 'USD',
        })),
      },
    },
    asAdmin('organizer'),
  )) as { id: string; requisition_number: string }
  await M.submitRequisitionDirectSupply(null, { id: created.id }, asAdmin('organizer'))
  await M.approveRequisition(null, { id: created.id }, ctxFor('admin'))
  const lines = (
    await pool.query<{ id: string }>(`SELECT id FROM po_lines WHERE requisition_id=$1 ORDER BY line_number`, [created.id])
  ).rows.map((r) => r.id)
  const purchases: string[] = []
  for (const [i, lineId] of lines.entries()) {
    const p = (await M.recordLinePurchase(
      null,
      {
        input: {
          lineId,
          vendorId: i < 2 ? vendorA : vendorB,
          qty: 5,
          actualUnitPrice: 40,
          currencyCode: 'USD',
          receiptFileId: await makeReceipt(),
        },
      },
      asAdmin('buyer'),
    )) as { id: string }
    purchases.push(p.id)
  }
  await passReview(created.id, ctxFor('organizer'))
  const pos = await pool.query<{ id: string; po_number: string; vendor_id: string }>(
    `SELECT id, po_number, vendor_id FROM purchase_orders WHERE requisition_id=$1`,
    [created.id],
  )
  const a = pos.rows.find((p) => p.vendor_id === vendorA)!
  const b = pos.rows.find((p) => p.vendor_id === vendorB)!
  for (const po of [a, b]) {
    await pool.query(`UPDATE po_lines SET qty_received = qty_ordered WHERE po_id=$1`, [po.id])
    await pool.query(`UPDATE purchase_orders SET status='finance_review' WHERE id=$1`, [po.id])
  }
  return {
    reqId: created.id,
    reqNumber: created.requisition_number,
    lines,
    poA: a.id,
    poB: b.id,
    numberA: a.po_number,
    numberB: b.po_number,
    purchases,
  }
}

async function reqStatus(id: string): Promise<string> {
  return (await pool.query<{ status: string }>(`SELECT status FROM requisitions WHERE id=$1`, [id])).rows[0]!.status
}
async function poRow(id: string) {
  return (
    await pool.query<{ status: string; po_number: string; total_amount: string | null; reason: string | null }>(
      `SELECT status, po_number, total_amount, returned_to_organizer_reason AS reason FROM purchase_orders WHERE id=$1`,
      [id],
    )
  ).rows[0]!
}
async function poLines(poId: string) {
  return (
    await pool.query<{
      id: string
      purchase_id: string | null
      qty_ordered: string
      qty_received: string
      unit_price: string
      total_price: string
      audit_status: string | null
      currency_code: string
    }>(
      `SELECT id, purchase_id, qty_ordered, qty_received, unit_price, total_price, audit_status, currency_code
         FROM po_lines WHERE po_id=$1 ORDER BY line_number`,
      [poId],
    )
  ).rows
}
// Finance has to say which lines are wrong: by default the first line of the purchase order, with a reason of its own.
const send = async (
  poId: string,
  reason = 'Prices on the vendor invoice do not match',
  lineFlags?: { lineId: string; reason: string }[],
) => {
  const flags = lineFlags ?? [{ lineId: (await poLines(poId))[0]!.id, reason: 'The invoice price is different' }]
  return M.returnPOToOrganizer(null, { id: poId, reason, lineFlags: flags }, ctxFor('admin'))
}

async function reviewOf(reqId: string, who: Who = 'organizer') {
  const res = await server.executeOperation(
    {
      query: `query($id: ID!) { requisition(id: $id) { status review {
        caller_can_edit reopened_pos { id po_number vendor_id reason } edited_count removed_count added_count } } }`,
      variables: { id: reqId },
    },
    { contextValue: ctxFor(who) },
  )
  if (res.body.kind !== 'single') throw new Error('unexpected response')
  expect(res.body.singleResult.errors).toBeUndefined()
  return (
    res.body.singleResult.data as {
      requisition: {
        status: string
        review: {
          caller_can_edit: boolean
          reopened_pos: { id: string; po_number: string; vendor_id: string; reason: string | null }[] | null
          edited_count: number
          removed_count: number
          added_count: number
        } | null
      }
    }
  ).requisition
}

describe('the rules in lib/poReturnReview.ts', () => {
  it('a raised or added quantity that was not received needs a new receipt; an untouched short line does not', () => {
    expect(lineNeedsNewReceipt({ oldQty: 5, newQty: 8, received: 5, added: false })).toBe(true)
    expect(lineNeedsNewReceipt({ oldQty: 0, newQty: 3, received: 0, added: true })).toBe(true)
    expect(lineNeedsNewReceipt({ oldQty: 5, newQty: 5, received: 3, added: false })).toBe(false)
    expect(lineNeedsNewReceipt({ oldQty: 5, newQty: 4, received: 3, added: false })).toBe(false)
    // raised, but everything up to the new quantity was already received (an over-delivery recorded earlier)
    expect(lineNeedsNewReceipt({ oldQty: 5, newQty: 6, received: 6, added: false })).toBe(false)
  })

  it('goes back to Goods received only when a receipt is needed, otherwise to Finance review', () => {
    expect(returnTargetStatus(true)).toBe('goods_received')
    expect(returnTargetStatus(false)).toBe('finance_review')
  })

  it('applies a purchase to its line only when quantity, price or currency really differs', () => {
    const line = { qty: 5, price: 40, currency: 'USD' }
    expect(purchaseChangesLine(line, { ...line })).toBe(false)
    expect(purchaseChangesLine(line, { ...line, qty: 6 })).toBe(true)
    expect(purchaseChangesLine(line, { ...line, price: 40.01 })).toBe(true)
    expect(purchaseChangesLine(line, { ...line, currency: 'IQD' })).toBe(true)
    expect(reopenedNotAvailable('Taking an item from stock')).toMatch(/^Taking an item from stock is not available while the review is reopened/)
  })
})

describe('the fork links every PO line to its purchase', () => {
  it('gives each line of each purchase order the purchase it was made from', async () => {
    const f = await reachFinanceReview()
    const a = await poLines(f.poA)
    const b = await poLines(f.poB)
    expect(a.map((l) => l.purchase_id).sort()).toEqual([f.purchases[0], f.purchases[1]].sort())
    expect(b.map((l) => l.purchase_id)).toEqual([f.purchases[2]])
  })
})

describe('Finance sends a purchase order back', () => {
  it('needs the Finance permission, a reason, and a PO at Finance review', async () => {
    const f = await reachFinanceReview()
    await expect(M.returnPOToOrganizer(null, { id: f.poA, reason: 'x' }, ctxFor('buyer'))).rejects.toThrow(
      /Finance approval permission required/,
    )
    await expect(M.returnPOToOrganizer(null, { id: f.poA, reason: '   ' }, ctxFor('admin'))).rejects.toThrow(/reason is required/)
    await pool.query(`UPDATE purchase_orders SET status='goods_received' WHERE id=$1`, [f.poA])
    await expect(send(f.poA)).rejects.toThrow(/only from Finance review/)
    expect((await poRow(f.poA)).status).toBe('goods_received')
    expect(await reqStatus(f.reqId)).toBe('sourcing')
  })

  it('locks the PO under its own number and reopens the requisition review for it', async () => {
    const f = await reachFinanceReview()
    await send(f.poA, 'Invoice shows 45 USD')
    const po = await poRow(f.poA)
    expect(po.status).toBe('returned_to_organizer')
    expect(po.po_number).toBe(f.numberA)
    expect(po.reason).toBe('Invoice shows 45 USD')
    expect(await reqStatus(f.reqId)).toBe('organizer_review')
    // the other PO is untouched
    expect((await poRow(f.poB)).status).toBe('finance_review')
    const log = await pool.query(
      `SELECT notes FROM requisition_approval_log WHERE requisition_id=$1 AND action='reopen_review'`,
      [f.reqId],
    )
    expect(log.rows).toHaveLength(1)
    expect(String(log.rows[0]!.notes)).toContain(f.numberA)
    const poLog = await pool.query(`SELECT action FROM po_approval_log WHERE po_id=$1 ORDER BY created_at DESC LIMIT 1`, [f.poA])
    expect(poLog.rows[0]!.action).toBe('return_to_organizer')
    // the page reads which PO the review was reopened for, and the organizer may act in it
    const rq = await reviewOf(f.reqId)
    expect(rq.review?.reopened_pos).toEqual([
      expect.objectContaining({ id: f.poA, po_number: f.numberA, vendor_id: vendorA, reason: 'Invoice shows 45 USD' }),
    ])
    expect(rq.review?.caller_can_edit).toBe(true)
    // the organizer is told which PO came back and why
    const notice = await pool.query(
      `SELECT payload FROM service_outbox WHERE event_type='REQ_REVIEW_REQUIRED' AND payload->>'requisitionId'=$1 AND payload->>'userId'=$2 ORDER BY created_at DESC LIMIT 1`,
      [f.reqId, userIds.organizer],
    )
    expect(notice.rows).toHaveLength(1)
    expect(String((notice.rows[0]!.payload as { title: string }).title)).toContain(f.numberA)
    expect(String((notice.rows[0]!.payload as { body: string }).body)).toContain('Invoice shows 45 USD')
  })

  it('an ordinary review has no reopened purchase orders', async () => {
    const f = await reachFinanceReview()
    const rq = await reviewOf(f.reqId)
    expect(rq.review).toBeNull()
  })

  it('starts the review from what the PO line says now, when an edit request changed the line after the PO was made', async () => {
    const f = await reachFinanceReview()
    const lineId = (await poLines(f.poA)).find((l) => l.purchase_id === f.purchases[0])!.id
    await pool.query(`UPDATE po_lines SET unit_price=41, actual_unit_price=41, total_price=205 WHERE id=$1`, [lineId])
    await send(f.poA)
    const p = await pool.query(`SELECT actual_unit_price, discounted_unit_price FROM po_line_purchases WHERE id=$1`, [f.purchases[0]])
    expect(Number(p.rows[0]!.actual_unit_price)).toBe(41)
    expect(p.rows[0]!.discounted_unit_price).toBeNull()
    // so a review that changes nothing else leaves the line at 41 (the earlier edit is not undone)
    await M.editReviewPurchase(null, { purchaseId: f.purchases[1], actualUnitPrice: 43 }, ctxFor('organizer'))
    await passReview(f.reqId, ctxFor('organizer'))
    expect(Number((await poLines(f.poA)).find((l) => l.id === lineId)!.unit_price)).toBe(41)
  })

  it('refuses a PO that has a line its purchases do not explain (added later by an edit)', async () => {
    const f = await reachFinanceReview()
    await pool.query(`UPDATE po_lines SET purchase_id=NULL WHERE id=$1`, [(await poLines(f.poA))[0]!.id])
    await expect(send(f.poA)).rejects.toThrow(/was added to this purchase order after it was created|could not be matched/)
    expect((await poRow(f.poA)).status).toBe('finance_review')
    expect(await reqStatus(f.reqId)).toBe('sourcing')
  })

  it('refuses a PO with an extra line that no purchase explains, while every purchase has its line (only the line check can catch it)', async () => {
    const f = await reachFinanceReview()
    await pool.query(
      `INSERT INTO po_lines (po_id, requisition_id, line_number, description, qty_ordered, unit_price, uom, currency_code, total_price)
       VALUES ($1,$2,9,'Added later by an edit request',1,5,'pc','USD',5)`,
      [f.poA, f.reqId],
    )
    await expect(send(f.poA)).rejects.toThrow(/Added later by an edit request.*after it was created/)
    expect((await poRow(f.poA)).status).toBe('finance_review')
  })

  it('refuses a PO when a purchase has no line of its own, while no line is loose (only the purchase check can catch it)', async () => {
    const f = await reachFinanceReview()
    // line 1 now claims purchase 2: purchase 1 has no line, and no line is without a purchase
    await pool.query(`UPDATE po_lines SET purchase_id=$2 WHERE purchase_id=$1`, [f.purchases[0], f.purchases[1]])
    await expect(send(f.poA)).rejects.toThrow(/could not be matched to a line of this purchase order/)
    expect((await poRow(f.poA)).status).toBe('finance_review')
    expect(await reqStatus(f.reqId)).toBe('sourcing')
  })

  it('a second PO of the same requisition joins the open review; both leave it together', async () => {
    const f = await reachFinanceReview()
    await send(f.poA)
    await send(f.poB, 'Wrong quantity')
    expect((await reviewOf(f.reqId)).review?.reopened_pos?.map((p) => p.po_number).sort()).toEqual([f.numberA, f.numberB].sort())
    await M.editReviewPurchase(null, { purchaseId: f.purchases[2], actualUnitPrice: 41 }, ctxFor('organizer'))
    await M.editReviewPurchase(null, { purchaseId: f.purchases[0], actualUnitPrice: 42 }, ctxFor('organizer'))
    await passReview(f.reqId, ctxFor('organizer'))
    expect(await reqStatus(f.reqId)).toBe('sourcing')
    expect((await poRow(f.poA)).status).toBe('finance_review')
    expect((await poRow(f.poB)).status).toBe('finance_review')
    expect((await poRow(f.poA)).po_number).toBe(f.numberA)
    expect(Number((await poLines(f.poB))[0]!.unit_price)).toBe(41)
  })

  it('cannot be sent back while the requisition waits for approval of an earlier send-back', async () => {
    const f = await reachFinanceReview()
    await send(f.poA)
    await M.editReviewPurchase(null, { purchaseId: f.purchases[0], actualUnitPrice: 41 }, ctxFor('organizer'))
    await M.submitReviewForApproval(null, { requisitionId: f.reqId }, ctxFor('organizer'))
    await expect(send(f.poB)).rejects.toThrow(/waiting for a PO Admin's approval/)
    expect((await poRow(f.poB)).status).toBe('finance_review')
  })
})

describe('what the reopened review does not offer', () => {
  it('refuses a purchase of a PO that was not sent back, naming the ones that were', async () => {
    const f = await reachFinanceReview()
    await send(f.poA)
    await expect(
      M.editReviewPurchase(null, { purchaseId: f.purchases[2], actualUnitPrice: 41 }, ctxFor('organizer')),
    ).rejects.toThrow(new RegExp(`not sent back: only ${f.numberA}`))
    await expect(
      M.editReviewPurchase(null, { purchaseId: f.purchases[0], actualUnitPrice: 41 }, ctxFor('organizer')),
    ).resolves.toBeDefined()
  })

  it('refuses the stock actions, sending back to the buyers, and edit requests', async () => {
    const f = await reachFinanceReview()
    await send(f.poA)
    const org = ctxFor('organizer')
    await expect(
      M.takeReviewLineFromStock(null, { requisitionId: f.reqId, lineId: f.lines[0], locationId: userIds.admin, qty: 1 }, org),
    ).rejects.toThrow(/is not available while the review is reopened/)
    await expect(
      M.replaceReviewPurchasesWithStock(null, { requisitionId: f.reqId, lineId: f.lines[0], locationId: userIds.admin }, org),
    ).rejects.toThrow(/is not available while the review is reopened/)
    await expect(
      M.sendBackToBuying(null, { requisitionId: f.reqId, reason: 'x' }, org),
    ).rejects.toThrow(/Sending the requisition back to the buyers is not available/)
    await expect(
      M.submitPOEditRequest(null, { requisitionId: f.reqId, changes: JSON.stringify({}), reason: 'x' }, ctxFor('admin')),
    ).rejects.toThrow(/An edit request is not available while the review is reopened/)
    await expect(
      M.submitPOEditRequest(null, { id: f.poA, changes: JSON.stringify({}), reason: 'x' }, ctxFor('admin')),
    ).rejects.toThrow(/sent back to the organizer/)
  })

  it('cannot cancel the requisition while a PO is held in the review', async () => {
    const f = await reachFinanceReview()
    // the other PO is put back at 'bought' (not a blocker), so the held PO is the only thing that can stop the cancel
    await pool.query(`UPDATE purchase_orders SET status='bought' WHERE id=$1`, [f.poB])
    await send(f.poA)
    await expect(M.cancelRequisition(null, { id: f.reqId, reason: 'x' }, ctxFor('admin'))).rejects.toThrow(
      new RegExp(`child PO ${f.numberA} is already at 'returned_to_organizer'`),
    )
  })

  it('adds an item only to a PO that was sent back (its vendor), never to another vendor', async () => {
    const f = await reachFinanceReview()
    await send(f.poA)
    const add = async (vendorId: string) =>
      M.addReviewLine(
        null,
        {
          input: {
            requisitionId: f.reqId,
            description: 'Forgotten item',
            qty: 2,
            uom: 'pc',
            vendorId,
            actualUnitPrice: 10,
            currencyCode: 'USD',
            receiptFileId: await makeReceipt(),
          },
        },
        ctxFor('organizer'),
      )
    await expect(add(vendorB)).rejects.toThrow(/can only be added to a purchase order that was sent back/)
    await expect(add(vendorC)).rejects.toThrow(/can only be added to a purchase order that was sent back/)
    await expect(add(vendorA)).resolves.toBeDefined()
  })
})

describe('approving the reopened review applies the changes to the same purchase order', () => {
  it('a price change updates its line, the total and the audit marks; the number, the other PO and the requisition move on', async () => {
    const f = await reachFinanceReview()
    await pool.query(`UPDATE po_lines SET audit_status='ok' WHERE po_id=$1`, [f.poA])
    await send(f.poA)
    await M.editReviewPurchase(null, { purchaseId: f.purchases[0], actualUnitPrice: 45 }, ctxFor('organizer'))
    expect((await reviewOf(f.reqId)).review?.edited_count).toBe(1)
    await passReview(f.reqId, ctxFor('organizer'))

    expect(await reqStatus(f.reqId)).toBe('sourcing')
    const po = await poRow(f.poA)
    expect(po.po_number).toBe(f.numberA)
    expect(po.status).toBe('finance_review')
    const lines = await poLines(f.poA)
    const changed = lines.find((l) => l.purchase_id === f.purchases[0])!
    expect(Number(changed.unit_price)).toBe(45)
    expect(Number(changed.total_price)).toBe(225)
    expect(Number(lines.find((l) => l.purchase_id === f.purchases[1])!.unit_price)).toBe(40)
    expect(Number(po.total_amount)).toBe(425)
    // Finance audits it again from scratch
    expect(lines.every((l) => l.audit_status === 'pending')).toBe(true)
    // nothing about the other PO changed
    expect((await poRow(f.poB)).status).toBe('finance_review')
    expect(Number((await poLines(f.poB))[0]!.unit_price)).toBe(40)
    // the review's marks do not count toward a later one
    const marks = await pool.query(
      `SELECT COUNT(*) AS c FROM po_line_purchases WHERE po_line_id = ANY($1::uuid[]) AND review_original_price IS NOT NULL`,
      [f.lines],
    )
    expect(Number(marks.rows[0]!.c)).toBe(0)
    const log = await pool.query(`SELECT action FROM po_approval_log WHERE po_id=$1 ORDER BY created_at DESC LIMIT 1`, [f.poA])
    expect(log.rows[0]!.action).toBe('resubmit_to_finance')
  })

  it('re-prices the jobsite cost booked for a delivered line, and leaves a line that did not change alone', async () => {
    const f = await reachFinanceReview()
    const lines = await poLines(f.poA)
    const changed = lines.find((l) => l.purchase_id === f.purchases[0])!
    const other = lines.find((l) => l.purchase_id === f.purchases[1])!
    for (const l of [changed, other])
      await pool.query(
        `INSERT INTO project_cost_actuals (project_id, source_type, source_id, cost_category, amount, currency_code, entry_date)
         VALUES ($1,'po_direct_delivery',$2,'materials',200,'USD',CURRENT_DATE)`,
        [projectId, l.id],
      )
    await send(f.poA)
    await M.editReviewPurchase(null, { purchaseId: f.purchases[0], actualUnitPrice: 45 }, ctxFor('organizer'))
    await passReview(f.reqId, ctxFor('organizer'))
    const cost = async (id: string) =>
      Number((await pool.query(`SELECT amount FROM project_cost_actuals WHERE source_type='po_direct_delivery' AND source_id=$1`, [id])).rows[0]!.amount)
    expect(await cost(changed.id)).toBe(225)
    expect(await cost(other.id)).toBe(200)
  })

  it('a raised quantity sends the PO back to Goods received, because the extra needs a new receipt', async () => {
    const f = await reachFinanceReview()
    await send(f.poA)
    await M.editReviewPurchase(null, { purchaseId: f.purchases[0], qty: 8 }, ctxFor('organizer'))
    await passReview(f.reqId, ctxFor('organizer'))
    const po = await poRow(f.poA)
    expect(po.status).toBe('goods_received')
    expect(po.po_number).toBe(f.numberA)
    const line = (await poLines(f.poA)).find((l) => l.purchase_id === f.purchases[0])!
    expect(Number(line.qty_ordered)).toBe(8)
    expect(Number(line.qty_received)).toBe(5)
    expect(Number(line.total_price)).toBe(320)
    const log = await pool.query(`SELECT action, notes FROM po_approval_log WHERE po_id=$1 ORDER BY created_at DESC LIMIT 1`, [f.poA])
    expect(log.rows[0]!.action).toBe('reopen_receiving')
    expect(String(log.rows[0]!.notes)).toMatch(/record a receipt for the extra/)
  })

  it('a lowered quantity that is still at least what was received returns to Finance review', async () => {
    const f = await reachFinanceReview()
    await pool.query(`UPDATE po_lines SET qty_received=3 WHERE id=$1`, [(await poLines(f.poA)).find((l) => l.purchase_id === f.purchases[0])!.id])
    await send(f.poA)
    await M.editReviewPurchase(null, { purchaseId: f.purchases[0], qty: 3 }, ctxFor('organizer'))
    await passReview(f.reqId, ctxFor('organizer'))
    expect((await poRow(f.poA)).status).toBe('finance_review')
    expect(Number((await poLines(f.poA)).find((l) => l.purchase_id === f.purchases[0])!.qty_ordered)).toBe(3)
  })

  it('refuses a quantity below what was received, naming the quantity', async () => {
    const f = await reachFinanceReview()
    await send(f.poA)
    await expect(
      M.editReviewPurchase(null, { purchaseId: f.purchases[0], qty: 3 }, ctxFor('organizer')),
    ).rejects.toThrow(/already has 5 received/)
    // the purchase was not changed
    const p = await pool.query(`SELECT qty FROM po_line_purchases WHERE id=$1`, [f.purchases[0]])
    expect(Number(p.rows[0]!.qty)).toBe(5)
  })

  it('removing an item deletes its PO line and purchase, recalculates the PO, and closes the removal so a later review starts clean', async () => {
    const f = await reachFinanceReview()
    await send(f.poA)
    await M.removeReviewLine(null, { requisitionId: f.reqId, lineId: f.lines[1], reason: 'Not delivered by the vendor' }, ctxFor('organizer'))
    expect(await poLines(f.poA)).toHaveLength(1)
    expect((await pool.query(`SELECT 1 FROM po_line_purchases WHERE id=$1`, [f.purchases[1]])).rows).toHaveLength(0)
    expect((await reviewOf(f.reqId)).review?.removed_count).toBe(1)
    await passReview(f.reqId, ctxFor('organizer'))
    const po = await poRow(f.poA)
    expect(po.status).toBe('finance_review')
    expect(Number(po.total_amount)).toBe(200)
    const removed = await pool.query(`SELECT closed_at FROM requisition_review_removed_lines WHERE requisition_id=$1`, [f.reqId])
    expect(removed.rows).toHaveLength(1)
    expect(removed.rows[0]!.closed_at).not.toBeNull()
    // a second send-back starts with nothing counted
    await send(f.poA, 'second round')
    expect((await reviewOf(f.reqId)).review?.removed_count).toBe(0)
  })

  it('refuses to remove the last item of a purchase order, saying to cancel it instead', async () => {
    const f = await reachFinanceReview()
    await send(f.poB)
    await expect(
      M.removeReviewLine(null, { requisitionId: f.reqId, lineId: f.lines[2], reason: 'x' }, ctxFor('organizer')),
    ).rejects.toThrow(/with no items/)
    expect((await poLines(f.poB))).toHaveLength(1)
    expect((await pool.query(`SELECT 1 FROM po_line_purchases WHERE id=$1`, [f.purchases[2]])).rows).toHaveLength(1)
  })

  it('refuses to remove an item that is on a PO that was not sent back', async () => {
    const f = await reachFinanceReview()
    await send(f.poA)
    await expect(
      M.removeReviewLine(null, { requisitionId: f.reqId, lineId: f.lines[2], reason: 'x' }, ctxFor('organizer')),
    ).rejects.toThrow(/not sent back/)
  })

  it('the extra quantity is received with a new receipt, and the order then reaches Finance review again through Send to Finance Audit', async () => {
    const f = await reachFinanceReview()
    await send(f.poA)
    await M.editReviewPurchase(null, { purchaseId: f.purchases[0], qty: 8 }, ctxFor('organizer'))
    await passReview(f.reqId, ctxFor('organizer'))
    expect((await poRow(f.poA)).status).toBe('goods_received')
    const line = (await poLines(f.poA)).find((l) => l.purchase_id === f.purchases[0])!
    // the new receipt: 3 more units arrive at the jobsite (a direct-supply order is delivered there)
    await M.recordDirectDelivery(
      null,
      { poId: f.poA, input: { received_date: '2026-11-27', lines: [{ po_line_id: line.id, qty_received: 3 }] } },
      ctxFor('admin'),
    )
    const after = (await poLines(f.poA)).find((l) => l.id === line.id)!
    expect(Number(after.qty_received)).toBe(8)
    expect(Number(after.qty_ordered)).toBe(8)
    const cost = await pool.query(
      `SELECT amount FROM project_cost_actuals WHERE source_type='po_direct_delivery' AND source_id=$1`,
      [line.id],
    )
    expect(Number(cost.rows[0]!.amount)).toBe(120)
    await M.sendPOToAudit(null, { id: f.poA }, ctxFor('admin'))
    expect((await poRow(f.poA)).status).toBe('finance_review')
  })

  it('goes to Finance review, not the older audit status, when its purchases are attached to a line that is not on it (the purchase link decides)', async () => {
    const f = await reachFinanceReview()
    await pool.query(`UPDATE purchase_orders SET status='goods_received' WHERE id=$1`, [f.poA])
    const otherLine = (await poLines(f.poB))[0]!.id
    // the purchases of PO A now hang on a line of PO B: only po_lines.purchase_id still ties them to PO A
    await pool.query(`UPDATE po_line_purchases SET po_line_id=$1 WHERE id = ANY($2::uuid[])`, [
      otherLine,
      [f.purchases[0], f.purchases[1]],
    ])
    await M.sendPOToAudit(null, { id: f.poA }, ctxFor('admin'))
    expect((await poRow(f.poA)).status).toBe('finance_review')
  })

  it('an added item becomes a new line of the PO of its vendor, needs a receipt, and the PO keeps its number', async () => {
    const f = await reachFinanceReview()
    await send(f.poA)
    await M.addReviewLine(
      null,
      {
        input: {
          requisitionId: f.reqId,
          description: 'Forgotten gasket',
          qty: 2,
          uom: 'pc',
          vendorId: vendorA,
          actualUnitPrice: 10,
          currencyCode: 'USD',
          receiptFileId: await makeReceipt(),
        },
      },
      ctxFor('organizer'),
    )
    expect((await reviewOf(f.reqId)).review?.added_count).toBe(1)
    await passReview(f.reqId, ctxFor('organizer'))
    const po = await poRow(f.poA)
    expect(po.po_number).toBe(f.numberA)
    expect(po.status).toBe('goods_received')
    const lines = await poLines(f.poA)
    expect(lines).toHaveLength(3)
    const added = lines.find((l) => Number(l.qty_ordered) === 2)!
    expect(added.purchase_id).not.toBeNull()
    expect(Number(added.qty_received)).toBe(0)
    expect(Number(added.total_price)).toBe(20)
    expect(Number(po.total_amount)).toBe(420)
    // it is no longer marked as added in a review
    const marked = await pool.query(`SELECT COUNT(*) AS c FROM po_lines WHERE requisition_id=$1 AND review_added_at IS NOT NULL`, [f.reqId])
    expect(Number(marked.rows[0]!.c)).toBe(0)
  })
})

describe('the lines Finance flags when it sends a purchase order back (playbook #131)', () => {
  const flagsOf = async (poId: string) =>
    (
      await pool.query<{ id: string; audit_status: string | null; audit_note: string | null; audit_flagged_by_email: string | null }>(
        `SELECT id, audit_status, audit_note, audit_flagged_by_email FROM po_lines WHERE po_id=$1 ORDER BY line_number`,
        [poId],
      )
    ).rows
  interface SeenPurchase {
    id: string
    finance_flag_reason: string | null
    finance_flagged_by: string | null
    finance_flagged_at: string | null
  }
  const purchasesSeenByOrganizer = async (reqId: string): Promise<SeenPurchase[]> => {
    const res = await server.executeOperation(
      {
        query: `query($id: ID!) { requisition(id: $id) { lines { id purchases { id finance_flag_reason finance_flagged_by finance_flagged_at } } } }`,
        variables: { id: reqId },
      },
      { contextValue: ctxFor('organizer') },
    )
    if (res.body.kind !== 'single') throw new Error('expected a single result')
    expect(res.body.singleResult.errors).toBeUndefined()
    const data = res.body.singleResult.data as { requisition: { lines: { id: string; purchases: SeenPurchase[] | null }[] } }
    return data.requisition.lines.flatMap((l) => l.purchases ?? [])
  }
  // the purchase a PO line was made from
  const purchaseOf = async (lineId: string): Promise<string> =>
    (await pool.query<{ purchase_id: string }>(`SELECT purchase_id FROM po_lines WHERE id=$1`, [lineId])).rows[0]!.purchase_id

  it('needs at least one line, and a reason for each', async () => {
    const f = await reachFinanceReview()
    const [l1] = await poLines(f.poA)
    const call = (lineFlags: { lineId: string; reason: string }[] | null | undefined) =>
      M.returnPOToOrganizer(null, { id: f.poA, reason: 'Wrong prices', lineFlags }, ctxFor('admin'))
    await expect(call(undefined)).rejects.toThrow(/Tick at least one line/)
    await expect(call(null)).rejects.toThrow(/Tick at least one line/)
    await expect(call([])).rejects.toThrow(/Tick at least one line/)
    await expect(call([{ lineId: l1!.id, reason: '   ' }])).rejects.toThrow(/Every flagged line needs a reason/)
    await expect(
      call([
        { lineId: l1!.id, reason: 'a' },
        { lineId: l1!.id, reason: 'b' },
      ]),
    ).rejects.toThrow(/only once/)
    // nothing happened
    expect((await poRow(f.poA)).status).toBe('finance_review')
    expect(await reqStatus(f.reqId)).toBe('sourcing')
    expect((await flagsOf(f.poA)).every((l) => l.audit_status !== 'flagged')).toBe(true)
  })

  it('refuses a line of another purchase order and writes nothing', async () => {
    const f = await reachFinanceReview()
    const [own] = await poLines(f.poA)
    const [other] = await poLines(f.poB)
    await expect(
      M.returnPOToOrganizer(
        null,
        {
          id: f.poA,
          reason: 'x',
          lineFlags: [
            { lineId: own!.id, reason: 'bad' },
            { lineId: other!.id, reason: 'not mine' },
          ],
        },
        ctxFor('admin'),
      ),
    ).rejects.toThrow(/do not belong to this purchase order/)
    expect((await poRow(f.poA)).status).toBe('finance_review')
    expect((await flagsOf(f.poA)).every((l) => l.audit_status !== 'flagged')).toBe(true)
    expect((await flagsOf(f.poB)).every((l) => l.audit_status !== 'flagged')).toBe(true)
  })

  it('saves each ticked line with its own reason and who flagged it, and only those lines', async () => {
    const f = await reachFinanceReview()
    const lines = await poLines(f.poA)
    await send(f.poA, 'Prices do not match', [{ lineId: lines[1]!.id, reason: 'Invoice says 45 USD, we paid 40' }])
    const after = await flagsOf(f.poA)
    const flagged = after.filter((l) => l.audit_status === 'flagged')
    expect(flagged).toHaveLength(1)
    expect(flagged[0]).toMatchObject({ id: lines[1]!.id, audit_note: 'Invoice says 45 USD, we paid 40' })
    expect(flagged[0]!.audit_flagged_by_email).toMatch(/@/)
    expect(after.find((l) => l.id === lines[0]!.id)!.audit_status).not.toBe('flagged')
    // the other purchase order is untouched
    expect((await flagsOf(f.poB)).every((l) => l.audit_status !== 'flagged')).toBe(true)
  })

  it('a line flagged in the audit earlier but not ticked now is not one of the lines sent back', async () => {
    const f = await reachFinanceReview()
    const lines = await poLines(f.poA)
    await pool.query(`UPDATE po_lines SET audit_status='flagged', audit_note='old note' WHERE id=$1`, [lines[0]!.id])
    await send(f.poA, 'x', [{ lineId: lines[1]!.id, reason: 'this one' }])
    const after = await flagsOf(f.poA)
    expect(after.find((l) => l.id === lines[0]!.id)).toMatchObject({ audit_status: 'pending', audit_note: null })
    expect(after.find((l) => l.id === lines[1]!.id)!.audit_status).toBe('flagged')
  })

  it('shows the organizer which purchases failed and why, in the reopened review', async () => {
    const f = await reachFinanceReview()
    const lines = await poLines(f.poA)
    // a line Finance checked and passed, with a note of its own, is not a failing line
    await pool.query(`UPDATE po_lines SET audit_status='ok', audit_note='looks fine' WHERE id=$1`, [lines[1]!.id])
    await send(f.poA, 'Prices do not match', [{ lineId: lines[0]!.id, reason: 'Invoice says 45 USD' }])
    const seen = await purchasesSeenByOrganizer(f.reqId)
    const flagged = seen.filter((p) => p.finance_flag_reason)
    expect(flagged.map((p) => p.id)).toEqual([await purchaseOf(lines[0]!.id)])
    expect(flagged[0]!.finance_flag_reason).toBe('Invoice says 45 USD')
    expect(flagged[0]!.finance_flagged_by).toMatch(/@/)
    expect(flagged[0]!.finance_flagged_at).toBeTruthy()
    // the purchase of the other vendor, whose purchase order was not sent back, carries no flag
    expect(seen.find((p) => p.id === f.purchases[2])!.finance_flag_reason).toBeNull()
  })

  it('shows no flag before the purchase order is sent back, and none once the round has ended', async () => {
    const f = await reachFinanceReview()
    const lines = await poLines(f.poA)
    // flagged in the audit but still at Finance review: not the organizer's business yet
    await pool.query(`UPDATE po_lines SET audit_status='flagged', audit_note='audit note' WHERE id=$1`, [lines[0]!.id])
    expect((await purchasesSeenByOrganizer(f.reqId)).every((p) => p.finance_flag_reason === null)).toBe(true)
    await send(f.poA, 'x', [{ lineId: lines[0]!.id, reason: 'bad' }])
    expect((await purchasesSeenByOrganizer(f.reqId)).some((p) => p.finance_flag_reason === 'bad')).toBe(true)
    await M.editReviewPurchase(null, { purchaseId: f.purchases[0], actualUnitPrice: 41 }, ctxFor('organizer'))
    await passReview(f.reqId, ctxFor('organizer'))
    expect((await poRow(f.poA)).status).toBe('finance_review')
    expect((await purchasesSeenByOrganizer(f.reqId)).every((p) => p.finance_flag_reason === null)).toBe(true)
    expect((await flagsOf(f.poA)).every((l) => l.audit_status === 'pending')).toBe(true)
  })
})
