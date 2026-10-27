// Removing a PO line through an edit request, and what stands in the way.
//
// Found live: approving the removal of a PO line that was never received (PO-2026-0021, 19 units of
// pipe) failed with the raw database error `update or delete on table "po_lines" violates foreign key
// constraint "po_receipt_lines_po_line_id_fkey"`, because the only receipt that mentioned the line
// was a CANCELLED one that never moved any stock. Several tables point at po_lines with no delete
// action, so a removal that could never succeed also reached the review queue and only failed when an
// admin tried to approve it.
//
// Now: a removal is refused with the real reason in plain words, at submission and again at approval;
// receipts count by status (confirmed, draft and reversed block; cancelled does not unless stock moved).
// When only cancelled receipts mention the line, their old rows go with it.
//
// Real Postgres, nothing mocked.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const EMAIL_PREFIX = 'po-line-removal-test-'
const SKU_PREFIX = 'PLRTEST-'
const PO_PREFIX = 'PLRTEST-PO-'
const RCPT_PREFIX = 'PLRTEST-RCPT-'

let requesterId: string
let adminId: string

const ctxFor = (userId: string, role: string) =>
  ({ auth: { companyId: TEST_COMPANY_ID, userId, role, module: 'all', sessionId: 'plr-test' } }) as never

async function makeUser(key: string): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [`${EMAIL_PREFIX}${key}@fnc-erp.local`],
  )
  return r.rows[0]!.id
}

interface Fixture {
  poId: string
  cableId: string
  boxId: string
  productId: string
}

// An approved PO (so an edit needs an admin) with two lines.
async function makePO(): Promise<Fixture> {
  const sku = `${SKU_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const productId = (
    await pool.query<{ id: string }>(
      `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$2,'unit','general') RETURNING id`,
      [TEST_COMPANY_ID, sku],
    )
  ).rows[0]!.id
  const poId = (
    await pool.query<{ id: string }>(
      `INSERT INTO purchase_orders (company_id, po_number, created_by, status, currency_code, purpose)
       VALUES ($1,$2,$3,'approved','IQD','stock') RETURNING id`,
      [TEST_COMPANY_ID, `${PO_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, requesterId],
    )
  ).rows[0]!.id
  const line = async (n: number, desc: string, qty: number, price: number) =>
    (
      await pool.query<{ id: string }>(
        `INSERT INTO po_lines (po_id, line_number, description, product_id, qty_ordered, unit_price, total_price, uom, currency_code)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'ea','IQD') RETURNING id`,
        [poId, n, desc, productId, qty, price, qty * price],
      )
    ).rows[0]!.id
  return { poId, cableId: await line(1, 'Cable 3x2.5', 12, 4500), boxId: await line(2, 'Junction box', 3, 900), productId }
}

async function makeReceipt(
  poId: string,
  status: 'draft' | 'confirmed' | 'cancelled' | 'reversed',
  lines: { lineId: string; qty: number }[],
): Promise<{ receiptId: string; receiptNumber: string; receiptLineIds: string[] }> {
  const receiptNumber = `${RCPT_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const receiptId = (
    await pool.query<{ id: string }>(
      `INSERT INTO po_receipts (po_id, receipt_number, received_date, received_by, status)
       VALUES ($1,$2,CURRENT_DATE,$3,$4) RETURNING id`,
      [poId, receiptNumber, requesterId, status],
    )
  ).rows[0]!.id
  const receiptLineIds: string[] = []
  for (const l of lines) {
    receiptLineIds.push(
      (
        await pool.query<{ id: string }>(
          `INSERT INTO po_receipt_lines (receipt_id, po_line_id, qty_received) VALUES ($1,$2,$3) RETURNING id`,
          [receiptId, l.lineId, l.qty],
        )
      ).rows[0]!.id,
    )
  }
  return { receiptId, receiptNumber, receiptLineIds }
}

async function cleanup(): Promise<void> {
  const pos = `SELECT id FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2`
  const args = [TEST_COMPANY_ID, `${PO_PREFIX}%`]
  const mine = `SELECT id FROM products WHERE company_id=$1 AND sku LIKE $2`
  await pool.query(`DELETE FROM stock_moves WHERE product_id IN (${mine})`, [TEST_COMPANY_ID, `${SKU_PREFIX}%`])
  await pool.query(`DELETE FROM stock_balances WHERE product_id IN (${mine})`, [TEST_COMPANY_ID, `${SKU_PREFIX}%`])
  await pool.query(
    `DELETE FROM stock_moves WHERE po_receipt_line_id IN (
       SELECT prl.id FROM po_receipt_lines prl JOIN po_receipts pr ON pr.id = prl.receipt_id WHERE pr.po_id IN (${pos}))`,
    args,
  )
  await pool.query(`DELETE FROM po_receipt_lines WHERE receipt_id IN (SELECT id FROM po_receipts WHERE po_id IN (${pos}))`, args)
  await pool.query(`DELETE FROM po_receipts WHERE po_id IN (${pos})`, args)
  await pool.query(`DELETE FROM po_edit_requests WHERE po_id IN (${pos})`, args)
  await pool.query(`DELETE FROM po_approval_log WHERE po_id IN (${pos})`, args)
  await pool.query(`UPDATE po_lines SET origin_line_id = NULL WHERE po_id IN (${pos})`, args)
  await pool.query(`DELETE FROM po_lines WHERE po_id IN (${pos})`, args)
  await pool.query(`DELETE FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2`, args)
  await pool.query(`DELETE FROM products WHERE company_id=$1 AND sku LIKE $2`, [TEST_COMPANY_ID, `${SKU_PREFIX}%`])
}

beforeAll(async () => {
  requesterId = await makeUser('requester')
  adminId = await makeUser('admin')
  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`]).catch(() => undefined)
  await pool.end()
})

const submitRemoval = (poId: string, lineId: string) =>
  resolvers.Mutation.submitPOEditRequest(
    null,
    { id: poId, changes: JSON.stringify({ lines: { removed: [lineId] } }) } as never,
    ctxFor(requesterId, 'user'),
  ) as Promise<{ id: string; status: string }>

const approve = (poId: string, requestId: string) =>
  resolvers.Mutation.approvePOEditRequest(null, { id: poId, requestId } as never, ctxFor(adminId, 'system_admin'))

const lineExists = async (lineId: string): Promise<boolean> =>
  (await pool.query(`SELECT 1 FROM po_lines WHERE id=$1`, [lineId])).rows.length > 0
const requestCount = async (poId: string): Promise<number> =>
  parseInt((await pool.query<{ c: string }>(`SELECT COUNT(*) AS c FROM po_edit_requests WHERE po_id=$1`, [poId])).rows[0]!.c, 10)

describe('a line whose only receipt was cancelled can be removed', () => {
  it('removes the line, and takes only that line off the cancelled receipt', async () => {
    const { poId, cableId, boxId } = await makePO()
    const cancelled = await makeReceipt(poId, 'cancelled', [
      { lineId: cableId, qty: 12 },
      { lineId: boxId, qty: 3 },
    ])
    const req = await submitRemoval(poId, boxId)
    expect(req.status).toBe('pending') // not refused: nothing was received

    await approve(poId, req.id)

    expect(await lineExists(boxId)).toBe(false)
    const rows = await pool.query<{ po_line_id: string }>(
      `SELECT po_line_id FROM po_receipt_lines WHERE receipt_id=$1`,
      [cancelled.receiptId],
    )
    expect(rows.rows.map((r) => r.po_line_id)).toEqual([cableId]) // the other line's row is untouched
    const status = await pool.query<{ status: string }>(`SELECT status FROM po_edit_requests WHERE id=$1`, [req.id])
    expect(status.rows[0]!.status).toBe('approved')
  })

  it('does not touch a confirmed receipt of a different line', async () => {
    const { poId, cableId, boxId } = await makePO()
    await makeReceipt(poId, 'cancelled', [{ lineId: boxId, qty: 3 }])
    const confirmed = await makeReceipt(poId, 'confirmed', [{ lineId: cableId, qty: 12 }])
    const req = await submitRemoval(poId, boxId)
    await approve(poId, req.id)
    expect(await lineExists(boxId)).toBe(false)
    const kept = await pool.query(`SELECT 1 FROM po_receipt_lines WHERE receipt_id=$1`, [confirmed.receiptId])
    expect(kept.rows).toHaveLength(1)
  })
})

describe('a removal that can never succeed is refused, with the reason', () => {
  it('goods already received (confirmed receipt): refused at submission, naming the receipt, nothing stored', async () => {
    const { poId, boxId } = await makePO()
    const rc = await makeReceipt(poId, 'confirmed', [{ lineId: boxId, qty: 3 }])
    await expect(submitRemoval(poId, boxId)).rejects.toThrow(
      new RegExp(`Junction box" can't be removed: goods are already received against it \\(receipt ${rc.receiptNumber}\\)`),
    )
    expect(await requestCount(poId)).toBe(0)
    expect(await lineExists(boxId)).toBe(true)
  })

  it('a Store In that is still a draft: says to cancel the draft', async () => {
    const { poId, boxId } = await makePO()
    await makeReceipt(poId, 'draft', [{ lineId: boxId, qty: 3 }])
    await expect(submitRemoval(poId, boxId)).rejects.toThrow(/still a draft.*cancel that draft first/)
    expect(await lineExists(boxId)).toBe(true)
  })

  it('a receipt that was received and then reversed: refused, the history is kept', async () => {
    const { poId, boxId } = await makePO()
    await makeReceipt(poId, 'reversed', [{ lineId: boxId, qty: 3 }])
    await expect(submitRemoval(poId, boxId)).rejects.toThrow(/received and the receipt reversed/)
  })

  it('stock moved for a cancelled receipt: refused, so its history is not deleted', async () => {
    const { poId, boxId, productId } = await makePO()
    const rc = await makeReceipt(poId, 'cancelled', [{ lineId: boxId, qty: 3 }])
    const loc = async (type: string) =>
      (
        await pool.query<{ id: string }>(
          `SELECT id FROM stock_locations WHERE company_id=$1 AND type=$2 AND is_active=true LIMIT 1`,
          [TEST_COMPANY_ID, type],
        )
      ).rows[0]!.id
    await pool.query(
      `INSERT INTO stock_moves (company_id, product_id, from_location_id, to_location_id, moved_at, qty, unit_cost, total_cost, source_type, moved_by, po_receipt_line_id)
       VALUES ($1,$2,$3,$4,NOW(),3,10,30,'po_receipt',$5,$6)`,
      [TEST_COMPANY_ID, productId, await loc('virtual_in'), await loc('warehouse'), requesterId, rc.receiptLineIds[0]],
    )
    await expect(submitRemoval(poId, boxId)).rejects.toThrow(/stock has already moved for it/)
    expect(await lineExists(boxId)).toBe(true)
  })

  it('a line other lines were split from: refused', async () => {
    const { poId, boxId } = await makePO()
    await pool.query(
      `INSERT INTO po_lines (po_id, line_number, description, qty_ordered, unit_price, total_price, uom, currency_code, origin_line_id)
       VALUES ($1,3,'Split off',1,900,900,'ea','IQD',$2)`,
      [poId, boxId],
    )
    await expect(submitRemoval(poId, boxId)).rejects.toThrow(/other lines were split from it/)
  })

  it('lists every reason when there is more than one', async () => {
    const { poId, boxId } = await makePO()
    await makeReceipt(poId, 'confirmed', [{ lineId: boxId, qty: 3 }])
    await pool.query(
      `INSERT INTO po_lines (po_id, line_number, description, qty_ordered, unit_price, total_price, uom, currency_code, origin_line_id)
       VALUES ($1,3,'Split off',1,900,900,'ea','IQD',$2)`,
      [poId, boxId],
    )
    await expect(submitRemoval(poId, boxId)).rejects.toThrow(/already received.*; other lines were split from it/)
  })

  it('a different PO\'s line cannot be probed through this one', async () => {
    const mine = await makePO()
    const other = await makePO()
    await makeReceipt(other.poId, 'confirmed', [{ lineId: other.boxId, qty: 3 }])
    // naming the other PO's line in my request must not reveal (or act on) anything about it
    const req = await submitRemoval(mine.poId, other.boxId)
    expect(req.status).toBe('pending')
    expect(await lineExists(other.boxId)).toBe(true)
  })
})

describe('the same check runs at approval, for a request raised before the goods arrived', () => {
  it('refuses, keeps the request pending, deletes nothing, and the review card shows the plain reason', async () => {
    const { poId, boxId } = await makePO()
    const req = await submitRemoval(poId, boxId) // nothing received yet: accepted
    expect(req.status).toBe('pending')

    const rc = await makeReceipt(poId, 'confirmed', [{ lineId: boxId, qty: 3 }]) // goods arrive afterwards

    await expect(approve(poId, req.id)).rejects.toThrow(
      new RegExp(`goods are already received against it \\(receipt ${rc.receiptNumber}\\)`),
    )
    expect(await lineExists(boxId)).toBe(true)
    const status = await pool.query<{ status: string }>(`SELECT status FROM po_edit_requests WHERE id=$1`, [req.id])
    expect(status.rows[0]!.status).toBe('pending')

    const impact = (await resolvers.Query.poEditRequestImpact(
      null,
      { requestId: req.id } as never,
      ctxFor(adminId, 'system_admin'),
    )) as { failure?: string | null } | null
    expect(impact?.failure).toMatch(/already received/)
    expect(impact?.failure).not.toMatch(/violates foreign key/)
  })
})

describe('a removal with nothing in the way is unchanged', () => {
  it('an untouched line is still removed', async () => {
    const { poId, boxId } = await makePO()
    const req = await submitRemoval(poId, boxId)
    await approve(poId, req.id)
    expect(await lineExists(boxId)).toBe(false)
  })
})
