// Integration tests for the G9 stock-locking work: the reservation write in
// confirmPOInventoryCheck (Site 1), the strict guard in issueMaterialIssue
// (Site 2), the qty_reserved delta sync in applyPOEditChanges, and the
// interim cancelPO guard. Deliberately NOT mocking @fnc-erp/db — these need
// a real Postgres connection so FOR UPDATE actually blocks a concurrent
// transaction, which a mock can't reproduce. Mirrors the real-DB pattern
// already used by services/inventory/tests (see its setup.ts).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const TEST_USER_EMAIL = 'g9-stock-locking-test@fnc-erp.local'
const SKU_PREFIX = 'G9TEST-'
const PO_PREFIX = 'G9TEST-PO-'

let userId: string
let warehouseId: string
let virtualInId: string
let ctx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function makeProduct(suffix: string): Promise<string> {
  const sku = `${SKU_PREFIX}${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$3,'unit','general') RETURNING id`,
    [TEST_COMPANY_ID, sku, sku],
  )
  return r.rows[0]!.id
}

// Posts a receipt move (virtual_in -> warehouse) so the trigger populates a
// real stock_balances row, same as a real PO receipt would.
async function receive(productId: string, locationId: string, qty: number, unitCost = 10): Promise<void> {
  await pool.query(
    `INSERT INTO stock_moves (company_id, product_id, from_location_id, to_location_id, moved_at, qty, unit_cost, total_cost, source_type, moved_by)
     VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,'po_receipt',$8)`,
    [TEST_COMPANY_ID, productId, virtualInId, locationId, qty, unitCost, qty * unitCost, userId],
  )
}

async function getBalance(productId: string, locationId: string): Promise<{ onHand: number; reserved: number }> {
  const r = await pool.query<{ qty_on_hand: string; qty_reserved: string }>(
    `SELECT qty_on_hand, qty_reserved FROM stock_balances WHERE product_id=$1 AND location_id=$2 AND lot_id IS NULL`,
    [productId, locationId],
  )
  return {
    onHand: parseFloat(r.rows[0]?.qty_on_hand ?? '0'),
    reserved: parseFloat(r.rows[0]?.qty_reserved ?? '0'),
  }
}

async function makePO(status: string): Promise<string> {
  const poNumber = `${PO_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO purchase_orders (company_id, po_number, created_by, status, currency_code, purpose)
     VALUES ($1,$2,$3,$4,'IQD','stock') RETURNING id`,
    [TEST_COMPANY_ID, poNumber, userId, status],
  )
  return r.rows[0]!.id
}

async function makePOLine(poId: string, productId: string, qtyOrdered: number, unitPrice = 10): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO po_lines (po_id, line_number, description, product_id, qty_ordered, unit_price, total_price)
     VALUES ($1,1,'test line',$2,$3,$4,$5) RETURNING id`,
    [poId, productId, qtyOrdered, unitPrice, qtyOrdered * unitPrice],
  )
  return r.rows[0]!.id
}

async function makeDraftIssue(poId: string, productId: string, qtyIssued: number): Promise<string> {
  const issueR = await pool.query<{ id: string }>(
    `INSERT INTO project_material_issues (company_id, po_id, issue_number, issue_date, status, created_by)
     VALUES ($1,$2,$3,NOW()::date,'draft',$4) RETURNING id`,
    [TEST_COMPANY_ID, poId, `G9TEST-SO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, userId],
  )
  const issueId = issueR.rows[0]!.id
  await pool.query(
    `INSERT INTO project_material_issue_lines (issue_id, product_id, qty_issued, from_location_id, unit_cost)
     VALUES ($1,$2,$3,$4,0)`,
    [issueId, productId, qtyIssued, warehouseId],
  )
  return issueId
}

async function cleanup(): Promise<void> {
  await pool.query(
    `DELETE FROM project_material_issue_lines WHERE issue_id IN (SELECT id FROM project_material_issues WHERE company_id=$1 AND issue_number LIKE 'G9TEST-%')`,
    [TEST_COMPANY_ID],
  )
  await pool.query(`DELETE FROM project_material_issues WHERE company_id=$1 AND issue_number LIKE 'G9TEST-%'`, [
    TEST_COMPANY_ID,
  ])
  await pool.query(
    `DELETE FROM po_approval_log WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2)`,
    [TEST_COMPANY_ID, `${PO_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM po_edit_requests WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2)`,
    [TEST_COMPANY_ID, `${PO_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM po_lines WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2)`,
    [TEST_COMPANY_ID, `${PO_PREFIX}%`],
  )
  await pool.query(`DELETE FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2`, [
    TEST_COMPANY_ID,
    `${PO_PREFIX}%`,
  ])
  await pool.query(
    `DELETE FROM stock_moves WHERE company_id=$1 AND product_id IN (SELECT id FROM products WHERE company_id=$1 AND sku LIKE $2)`,
    [TEST_COMPANY_ID, `${SKU_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM stock_balances WHERE product_id IN (SELECT id FROM products WHERE company_id=$1 AND sku LIKE $2)`,
    [TEST_COMPANY_ID, `${SKU_PREFIX}%`],
  )
  await pool.query(`DELETE FROM products WHERE company_id=$1 AND sku LIKE $2`, [TEST_COMPANY_ID, `${SKU_PREFIX}%`])
}

beforeAll(async () => {
  const userR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  userId = userR.rows[0]!.id
  ctx = { auth: { companyId: TEST_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'g9-test' } }

  const whR = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='warehouse' AND is_active=true LIMIT 1`,
    [TEST_COMPANY_ID],
  )
  if (!whR.rows[0]) throw new Error('No warehouse location seeded for test company — run seeds first')
  warehouseId = whR.rows[0].id

  const viR = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='virtual_in' AND is_active=true LIMIT 1`,
    [TEST_COMPANY_ID],
  )
  if (!viR.rows[0]) throw new Error('No virtual_in location seeded for test company — run seeds first')
  virtualInId = viR.rows[0].id

  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('confirmPOInventoryCheck reservation (Site 1)', () => {
  it('reserves stock on confirm and releases it on cancel — round trip', async () => {
    const productId = await makeProduct('roundtrip')
    await receive(productId, warehouseId, 20)

    const poId = await makePO('inventory_check')
    const lineId = await makePOLine(poId, productId, 5)

    await resolvers.Mutation.confirmPOInventoryCheck(
      null,
      { id: poId, lineStockQtys: [{ lineId, qtyFromStock: 5, sourceLocationId: warehouseId }] },
      ctx as never,
    )

    const afterConfirm = await getBalance(productId, warehouseId)
    expect(afterConfirm.reserved).toBe(5)
    expect(afterConfirm.onHand).toBe(20) // reservation doesn't touch on_hand

    const poStatus = await pool.query<{ status: string }>(`SELECT status FROM purchase_orders WHERE id=$1`, [poId])
    // qtyFromStock(5) >= qty_ordered(5) — fully covered, fast path to ready_to_issue.
    expect(poStatus.rows[0]!.status).toBe('ready_to_issue')

    await resolvers.Mutation.cancelPO(null, { id: poId, reason: 'test cleanup' }, ctx as never)

    const afterCancel = await getBalance(productId, warehouseId)
    expect(afterCancel.reserved).toBe(0)
    expect(afterCancel.onHand).toBe(20)
  })

  it('rejects a from-stock line with no chosen source location', async () => {
    const productId = await makeProduct('nolocation')
    await receive(productId, warehouseId, 10)
    const poId = await makePO('inventory_check')
    const lineId = await makePOLine(poId, productId, 3)

    await expect(
      resolvers.Mutation.confirmPOInventoryCheck(
        null,
        { id: poId, lineStockQtys: [{ lineId, qtyFromStock: 3 }] },
        ctx as never,
      ),
    ).rejects.toThrow(/source stock location/i)

    const bal = await getBalance(productId, warehouseId)
    expect(bal.reserved).toBe(0)
  })
})

describe('issueMaterialIssue strict guard (Site 2)', () => {
  it('throws a reservation-mismatch error instead of flooring qty_reserved at 0', async () => {
    const productId = await makeProduct('strictguard')
    await receive(productId, warehouseId, 10)
    // Deliberately under-reserved relative to what the Store Out will ask
    // for — simulates a desync (e.g. data predating the reservation
    // system) rather than going through confirmPOInventoryCheck.
    await pool.query(
      `UPDATE stock_balances SET qty_reserved = 2 WHERE product_id=$1 AND location_id=$2 AND lot_id IS NULL`,
      [productId, warehouseId],
    )

    const poId = await makePO('items_bought')
    const issueId = await makeDraftIssue(poId, productId, 5)

    await expect(
      resolvers.Mutation.issueMaterialIssue(null, { id: issueId }, ctx as never),
    ).rejects.toThrow(/reservation mismatch/i)

    // Rolled back entirely — neither on_hand nor reserved moved, and the
    // issue is still draft (not silently marked issued).
    const bal = await getBalance(productId, warehouseId)
    expect(bal.onHand).toBe(10)
    expect(bal.reserved).toBe(2)
    const issue = await pool.query<{ status: string }>(`SELECT status FROM project_material_issues WHERE id=$1`, [
      issueId,
    ])
    expect(issue.rows[0]!.status).toBe('draft')
  })
})

describe('applyPOEditChanges qty_from_stock delta (Site 1, edit-request path)', () => {
  it('adjusts qty_reserved by the exact delta in both directions', async () => {
    const productId = await makeProduct('editdelta')
    await receive(productId, warehouseId, 20)

    const poId = await makePO('inventory_check')
    // qty_ordered(10) > qtyFromStock(4) below — needs purchase, so the PO
    // lands on market_pricing (not a POST_APPROVAL_PO_STATUSES status),
    // which is what makes submitPOEditRequest auto-apply immediately
    // instead of queuing for approval.
    const lineId = await makePOLine(poId, productId, 10)

    await resolvers.Mutation.confirmPOInventoryCheck(
      null,
      { id: poId, lineStockQtys: [{ lineId, qtyFromStock: 4, sourceLocationId: warehouseId }] },
      ctx as never,
    )
    expect((await getBalance(productId, warehouseId)).reserved).toBe(4)

    // Increase 4 -> 7 (delta +3)
    await resolvers.Mutation.submitPOEditRequest(
      null,
      {
        id: poId,
        changes: JSON.stringify({ lines: { edited: [{ id: lineId, field: 'qty_from_stock', from: 4, to: 7 }] } }),
      },
      ctx as never,
    )
    expect((await getBalance(productId, warehouseId)).reserved).toBe(7)
    const lineAfterIncrease = await pool.query<{ qty_from_stock: string }>(
      `SELECT qty_from_stock FROM po_lines WHERE id=$1`,
      [lineId],
    )
    expect(parseFloat(lineAfterIncrease.rows[0]!.qty_from_stock)).toBe(7)

    // Decrease 7 -> 2 (delta -5)
    await resolvers.Mutation.submitPOEditRequest(
      null,
      {
        id: poId,
        changes: JSON.stringify({ lines: { edited: [{ id: lineId, field: 'qty_from_stock', from: 7, to: 2 }] } }),
      },
      ctx as never,
    )
    expect((await getBalance(productId, warehouseId)).reserved).toBe(2)
    const lineAfterDecrease = await pool.query<{ qty_from_stock: string }>(
      `SELECT qty_from_stock FROM po_lines WHERE id=$1`,
      [lineId],
    )
    expect(parseFloat(lineAfterDecrease.rows[0]!.qty_from_stock)).toBe(2)
  })
})

describe('cancelPO interim G7 guard', () => {
  it('refuses to cancel a PO once it has reached goods_received', async () => {
    const poId = await makePO('goods_received')

    await expect(
      resolvers.Mutation.cancelPO(null, { id: poId, reason: 'should not be allowed' }, ctx as never),
    ).rejects.toThrow(/cannot cancel po in status 'goods_received'/i)

    const status = await pool.query<{ status: string }>(`SELECT status FROM purchase_orders WHERE id=$1`, [poId])
    expect(status.rows[0]!.status).toBe('goods_received')
  })
})

describe('concurrent Store Outs on the same balance row', () => {
  it('blocks the second confirmation until the first releases the lock, then fails on re-read', async () => {
    const productId = await makeProduct('concurrency')
    await receive(productId, warehouseId, 5)
    await pool.query(
      `UPDATE stock_balances SET qty_reserved = 5 WHERE product_id=$1 AND location_id=$2 AND lot_id IS NULL`,
      [productId, warehouseId],
    )

    const poId = await makePO('items_bought')
    const issueId = await makeDraftIssue(poId, productId, 5)

    // TxA: a raw connection standing in for "another Store Out confirmation
    // already in flight" — holds the exact same FOR UPDATE lock
    // issueMaterialIssue itself takes, without committing yet.
    const txA = await pool.connect()
    await txA.query('BEGIN')
    await txA.query(
      `SELECT qty_on_hand, qty_reserved FROM stock_balances WHERE product_id=$1 AND location_id=$2 AND lot_id IS NULL FOR UPDATE`,
      [productId, warehouseId],
    )

    try {
      // TxB: the real resolver, confirming the second Store Out. Kicked off
      // without awaiting so it runs concurrently with TxA holding the lock.
      const txBPromise = resolvers.Mutation.issueMaterialIssue(null, { id: issueId }, ctx as never)
      const txBSettled = txBPromise.then(
        () => 'resolved',
        () => 'rejected',
      )

      // Prove it's genuinely blocked: it must not settle while TxA holds
      // the lock, well past the few ms its own pre-lock queries take.
      const race = await Promise.race([txBSettled, delay(500).then(() => 'timeout')])
      expect(race).toBe('timeout')

      // TxA "wins": simulate it having consumed everything, then commit —
      // this both releases the lock and leaves the row in a state where
      // TxB's guard must now fail.
      await txA.query(
        `UPDATE stock_balances SET qty_on_hand = 0, qty_reserved = 0 WHERE product_id=$1 AND location_id=$2 AND lot_id IS NULL`,
        [productId, warehouseId],
      )
      await txA.query('COMMIT')

      // TxB unblocks and must fail against the FRESH (post-TxA-commit) data,
      // not a stale snapshot taken before it blocked.
      await expect(txBPromise).rejects.toThrow(/insufficient stock/i)

      const issue = await pool.query<{ status: string }>(
        `SELECT status FROM project_material_issues WHERE id=$1`,
        [issueId],
      )
      expect(issue.rows[0]!.status).toBe('draft')
    } finally {
      txA.release()
    }
  })
})
