// Integration tests for G1 Phase 2 PR 2: approveRequisition (Store Out
// draft creation, approved -> items_bought auto-chain, per-line/per-
// currency snapshots) and rejectRequisitionApproval (reservation release,
// direct-to-draft). Same real-Postgres pattern as the earlier G1 test
// files.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const TEST_USER_EMAIL = 'g1-requisition-approval-test@fnc-erp.local'
const APPROVER_USER_EMAIL = 'g1-requisition-approval-approver-test@fnc-erp.local'
const APPROVER_EMPLOYEE_NUMBER = 'G1ATEST-APPROVER'
const SKU_PREFIX = 'G1ATEST-'

let userId: string
let warehouseId: string
let virtualInId: string
let ctx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }
// A second, non-admin/non-dept-head user + employee row, used only to prove
// requisitions.assigned_approver_id is its own authorization path — not
// just admin/dept_head/po_admin in disguise.
let approverUserId: string
let approverEmployeeId: string
let approverCtx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }

async function makeProduct(suffix: string): Promise<string> {
  const sku = `${SKU_PREFIX}${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$3,'unit','general') RETURNING id`,
    [TEST_COMPANY_ID, sku, sku],
  )
  return r.rows[0]!.id
}

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

async function cleanup(): Promise<void> {
  await pool.query(
    `DELETE FROM project_material_issue_lines WHERE issue_id IN (SELECT id FROM project_material_issues WHERE company_id=$1 AND created_by=$2)`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(`DELETE FROM project_material_issues WHERE company_id=$1 AND created_by=$2`, [
    TEST_COMPANY_ID,
    userId,
  ])
  await pool.query(
    `DELETE FROM requisition_approved_totals WHERE requisition_id IN (SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id=$2)`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(
    `DELETE FROM requisition_approval_log WHERE requisition_id IN (SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id=$2)`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(
    `DELETE FROM po_lines WHERE requisition_id IN (SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id=$2)`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(`DELETE FROM requisitions WHERE company_id=$1 AND organizer_id=$2`, [
    TEST_COMPANY_ID,
    userId,
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

// Drives a fresh requisition all the way to pending_approval: one line,
// a chosen from-stock qty (0 for "fully bought", >0 for "some/all from
// stock"), priced at marketPrice, then verified at the same price.
async function makeReqAtPendingApproval(opts: {
  qtyOrdered: number
  qtyFromStock: number
  marketPrice: number
  currencyCode?: string
  productId?: string
}) {
  const productId = opts.productId ?? (await makeProduct('approval'))
  const created = await resolvers.Mutation.createRequisition(
    null,
    { input: { purpose: 'stock', lines: [{ product_id: productId, description: 'x', qty: opts.qtyOrdered, unit_price: 1 }] } },
    ctx as never,
  )
  const reqId = (created as { id: string }).id
  const lineRow = await pool.query<{ id: string }>(`SELECT id FROM po_lines WHERE requisition_id=$1`, [reqId])
  const lineId = lineRow.rows[0]!.id

  await resolvers.Mutation.submitRequisitionToInventoryCheck(null, { id: reqId }, ctx as never)
  await resolvers.Mutation.confirmRequisitionInventoryCheck(
    null,
    {
      id: reqId,
      lineStockQtys: [
        { lineId, qtyFromStock: opts.qtyFromStock, sourceLocationId: opts.qtyFromStock > 0 ? warehouseId : undefined },
      ],
    },
    ctx as never,
  )
  await resolvers.Mutation.submitRequisitionStorePricing(null, { id: reqId }, ctx as never)
  await resolvers.Mutation.submitRequisitionMarketPricing(
    null,
    { id: reqId, linePrices: [{ lineId, marketPrice: opts.marketPrice, currencyCode: opts.currencyCode ?? 'IQD' }] },
    ctx as never,
  )
  await resolvers.Mutation.verifyRequisitionPrices(
    null,
    { id: reqId, lineAdjustments: [{ lineId, verifiedPrice: opts.marketPrice }] },
    ctx as never,
  )
  return { reqId, lineId, productId }
}

beforeAll(async () => {
  const userR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  userId = userR.rows[0]!.id
  ctx = { auth: { companyId: TEST_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'g1-test' } }

  const approverUserR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [APPROVER_USER_EMAIL],
  )
  approverUserId = approverUserR.rows[0]!.id
  const approverEmployeeR = await pool.query<{ id: string }>(
    `INSERT INTO employees (company_id, user_id, first_name, last_name, hire_date, employee_number)
     VALUES ($1,$2,'Test','Approver',CURRENT_DATE,$3)
     ON CONFLICT (company_id, employee_number) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING id`,
    [TEST_COMPANY_ID, approverUserId, APPROVER_EMPLOYEE_NUMBER],
  )
  approverEmployeeId = approverEmployeeR.rows[0]!.id
  approverCtx = {
    auth: { companyId: TEST_COMPANY_ID, userId: approverUserId, role: 'user', module: 'all', sessionId: 'g1-test-approver' },
  }

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
  await pool.query(`DELETE FROM employees WHERE employee_number=$1`, [APPROVER_EMPLOYEE_NUMBER])
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.query(`DELETE FROM users WHERE email=$1`, [APPROVER_USER_EMAIL])
  await pool.end()
})

describe('approveRequisition', () => {
  it('rejects approval from a status other than pending_approval', async () => {
    const productId = await makeProduct('badstatus')
    const created = await resolvers.Mutation.createRequisition(
      null,
      { input: { purpose: 'stock', lines: [{ product_id: productId, description: 'x', qty: 1, unit_price: 1 }] } },
      ctx as never,
    )
    await expect(
      resolvers.Mutation.approveRequisition(null, { id: (created as { id: string }).id }, ctx as never),
    ).rejects.toThrow(/cannot approve requisition in status 'draft'/i)
  })

  it('creates a draft Store Out for from-stock qty, chains straight to items_bought, and logs the admin position', async () => {
    const productId = await makeProduct('mixed')
    await receive(productId, warehouseId, 10)
    const { reqId, lineId } = await makeReqAtPendingApproval({ qtyOrdered: 10, qtyFromStock: 4, marketPrice: 25, productId })

    const result = await resolvers.Mutation.approveRequisition(null, { id: reqId }, ctx as never)
    expect((result as { status: string }).status).toBe('items_bought')

    const issue = await pool.query<{ id: string; status: string; requisition_id: string; po_id: string | null }>(
      `SELECT id, status, requisition_id, po_id FROM project_material_issues WHERE requisition_id=$1`,
      [reqId],
    )
    expect(issue.rows).toHaveLength(1)
    expect(issue.rows[0]!.status).toBe('draft') // store keeper must still confirm it
    expect(issue.rows[0]!.po_id).toBeNull() // no child PO yet — requisition-sourced

    const issueLine = await pool.query<{ qty_issued: string; po_line_id: string }>(
      `SELECT qty_issued, po_line_id FROM project_material_issue_lines WHERE issue_id=$1`,
      [issue.rows[0]!.id],
    )
    expect(issueLine.rows).toHaveLength(1)
    expect(parseFloat(issueLine.rows[0]!.qty_issued)).toBe(4)
    expect(issueLine.rows[0]!.po_line_id).toBe(lineId)

    // Draft Store Out only — stock isn't actually deducted until the store
    // keeper confirms it (issueMaterialIssue), same as the PO model.
    const bal = await getBalance(productId, warehouseId)
    expect(bal.onHand).toBe(10)
    expect(bal.reserved).toBe(4)

    const log = await pool.query<{ actor_position: string }>(
      `SELECT actor_position FROM requisition_approval_log WHERE requisition_id=$1 AND action='approve'`,
      [reqId],
    )
    expect(log.rows[0]!.actor_position).toBe('admin')
  })

  it('a fully stock-covered requisition (zero bought lines) goes to sourcing, not items_bought', async () => {
    // Deliberately not reusing makeReqAtPendingApproval here — a fully-
    // covered line has nothing to price, so this calls store/market
    // pricing with empty linePrices (advancing the requisition's status
    // without touching the line, which is already correctly zeroed by
    // confirmRequisitionInventoryCheck).
    const productId = await makeProduct('zerobought')
    await receive(productId, warehouseId, 10)
    const created = await resolvers.Mutation.createRequisition(
      null,
      { input: { purpose: 'stock', lines: [{ product_id: productId, description: 'x', qty: 5, unit_price: 1 }] } },
      ctx as never,
    )
    const reqId = (created as { id: string }).id
    const lineRow = await pool.query<{ id: string }>(`SELECT id FROM po_lines WHERE requisition_id=$1`, [reqId])
    const lineId = lineRow.rows[0]!.id

    await resolvers.Mutation.submitRequisitionToInventoryCheck(null, { id: reqId }, ctx as never)
    await resolvers.Mutation.confirmRequisitionInventoryCheck(
      null,
      { id: reqId, lineStockQtys: [{ lineId, qtyFromStock: 5, sourceLocationId: warehouseId }] },
      ctx as never,
    )
    await resolvers.Mutation.submitRequisitionStorePricing(null, { id: reqId }, ctx as never)
    await resolvers.Mutation.submitRequisitionMarketPricing(null, { id: reqId }, ctx as never)
    await resolvers.Mutation.verifyRequisitionPrices(null, { id: reqId }, ctx as never)

    const line = await pool.query<{ total_price: string; qty_from_stock: string }>(
      `SELECT total_price, qty_from_stock FROM po_lines WHERE id=$1`,
      [lineId],
    )
    expect(parseFloat(line.rows[0]!.total_price)).toBe(0) // still zeroed — never touched
    expect(parseFloat(line.rows[0]!.qty_from_stock)).toBe(5)

    const result = await resolvers.Mutation.approveRequisition(null, { id: reqId }, ctx as never)
    expect((result as { status: string }).status).toBe('sourcing')

    // Still a draft Store Out for the covered qty, exactly as the mixed
    // case — the only thing that changes with zero bought lines is which
    // status the requisition lands in afterward.
    const issue = await pool.query(`SELECT id FROM project_material_issues WHERE requisition_id=$1`, [reqId])
    expect(issue.rows).toHaveLength(1)
  })

  it('creates one Store Out draft per distinct source location', async () => {
    const productA = await makeProduct('locA')
    const productB = await makeProduct('locB')
    const whR = await pool.query<{ id: string }>(
      `SELECT id FROM stock_locations WHERE company_id=$1 AND type='warehouse' AND is_active=true AND id != $2 LIMIT 1`,
      [TEST_COMPANY_ID, warehouseId],
    )
    // Falls back to reusing the same warehouse (still proves per-line
    // location grouping and single-issue-per-line-group correctness) if
    // the test company genuinely only seeds one warehouse — the assertion
    // below adapts to whichever is true rather than assuming a second
    // location exists.
    const secondLocationId = whR.rows[0]?.id ?? warehouseId
    const expectedIssueCount = whR.rows[0] ? 2 : 1

    await receive(productA, warehouseId, 10)
    await receive(productB, secondLocationId, 10)

    const created = await resolvers.Mutation.createRequisition(
      null,
      {
        input: {
          purpose: 'stock',
          lines: [
            { product_id: productA, description: 'from wh1', qty: 3, unit_price: 1 },
            { product_id: productB, description: 'from wh2', qty: 4, unit_price: 1 },
          ],
        },
      },
      ctx as never,
    )
    const reqId = (created as { id: string }).id
    const lines = await pool.query<{ id: string; description: string }>(
      `SELECT id, description FROM po_lines WHERE requisition_id=$1 ORDER BY line_number`,
      [reqId],
    )
    const lineA = lines.rows.find((l) => l.description === 'from wh1')!.id
    const lineB = lines.rows.find((l) => l.description === 'from wh2')!.id

    await resolvers.Mutation.submitRequisitionToInventoryCheck(null, { id: reqId }, ctx as never)
    await resolvers.Mutation.confirmRequisitionInventoryCheck(
      null,
      {
        id: reqId,
        lineStockQtys: [
          { lineId: lineA, qtyFromStock: 3, sourceLocationId: warehouseId },
          { lineId: lineB, qtyFromStock: 4, sourceLocationId: secondLocationId },
        ],
      },
      ctx as never,
    )
    await resolvers.Mutation.submitRequisitionStorePricing(null, { id: reqId }, ctx as never)
    await resolvers.Mutation.submitRequisitionMarketPricing(null, { id: reqId }, ctx as never)
    await resolvers.Mutation.verifyRequisitionPrices(null, { id: reqId }, ctx as never)
    await resolvers.Mutation.approveRequisition(null, { id: reqId }, ctx as never)

    const issues = await pool.query<{ id: string }>(
      `SELECT id FROM project_material_issues WHERE requisition_id=$1`,
      [reqId],
    )
    expect(issues.rows).toHaveLength(expectedIssueCount)

    // Every issue line traces back to exactly one of the two lines, and
    // each issue carries requisition_id (no child PO exists yet).
    const allIssueLines = await pool.query<{ po_line_id: string }>(
      `SELECT pmil.po_line_id FROM project_material_issue_lines pmil
       JOIN project_material_issues pmi ON pmi.id = pmil.issue_id
       WHERE pmi.requisition_id=$1`,
      [reqId],
    )
    expect(allIssueLines.rows.map((r) => r.po_line_id).sort()).toEqual([lineA, lineB].sort())
  })

  it('snapshots approved_unit_price per line and per-currency totals, immune to later drift', async () => {
    const { reqId, lineId } = await makeReqAtPendingApproval({ qtyOrdered: 5, qtyFromStock: 0, marketPrice: 30, currencyCode: 'USD' })

    await resolvers.Mutation.approveRequisition(null, { id: reqId }, ctx as never)

    const line = await pool.query<{ approved_unit_price: string; unit_price: string }>(
      `SELECT approved_unit_price, unit_price FROM po_lines WHERE id=$1`,
      [lineId],
    )
    expect(parseFloat(line.rows[0]!.approved_unit_price)).toBe(30)
    expect(parseFloat(line.rows[0]!.unit_price)).toBe(30)

    const totals = await pool.query<{ currency_code: string; subtotal: string; line_count: number }>(
      `SELECT currency_code, subtotal, line_count FROM requisition_approved_totals WHERE requisition_id=$1`,
      [reqId],
    )
    expect(totals.rows).toHaveLength(1)
    expect(totals.rows[0]!.currency_code).toBe('USD')
    expect(parseFloat(totals.rows[0]!.subtotal)).toBe(150) // 5 * 30
    expect(totals.rows[0]!.line_count).toBe(1)

    // Mutate unit_price afterward (simulating some later, unrelated change)
    // — the snapshot must not move with it.
    await pool.query(`UPDATE po_lines SET unit_price = 999 WHERE id=$1`, [lineId])
    const lineAfter = await pool.query<{ approved_unit_price: string }>(
      `SELECT approved_unit_price FROM po_lines WHERE id=$1`,
      [lineId],
    )
    expect(parseFloat(lineAfter.rows[0]!.approved_unit_price)).toBe(30)
  })

  it('creates no Store Out when nothing is from-stock', async () => {
    const { reqId } = await makeReqAtPendingApproval({ qtyOrdered: 3, qtyFromStock: 0, marketPrice: 5 })
    await resolvers.Mutation.approveRequisition(null, { id: reqId }, ctx as never)
    const issue = await pool.query(`SELECT id FROM project_material_issues WHERE requisition_id=$1`, [reqId])
    expect(issue.rows).toHaveLength(0)
  })

  it('assigned_approver_id grants approval rights to a non-admin, non-dept-head user', async () => {
    const { reqId } = await makeReqAtPendingApproval({ qtyOrdered: 2, qtyFromStock: 0, marketPrice: 7 })

    await expect(
      resolvers.Mutation.approveRequisition(null, { id: reqId }, approverCtx as never),
    ).rejects.toThrow(/not authorized to approve this requisition/i)

    await pool.query(`UPDATE requisitions SET assigned_approver_id=$1 WHERE id=$2`, [approverEmployeeId, reqId])

    const result = await resolvers.Mutation.approveRequisition(null, { id: reqId }, approverCtx as never)
    // qtyFromStock: 0 in this fixture — still needs purchasing, so
    // items_bought is correct here; the zero-bought-lines -> sourcing
    // branch is covered separately above. This test's only concern is
    // authorization.
    expect((result as { status: string }).status).toBe('items_bought')

    const log = await pool.query<{ actor_position: string }>(
      `SELECT actor_position FROM requisition_approval_log WHERE requisition_id=$1 AND action='approve'`,
      [reqId],
    )
    expect(log.rows[0]!.actor_position).toBe('assigned_approver')
  })
})

describe('rejectRequisitionApproval', () => {
  it('requires a non-empty reason', async () => {
    const { reqId } = await makeReqAtPendingApproval({ qtyOrdered: 1, qtyFromStock: 0, marketPrice: 1 })
    await expect(
      resolvers.Mutation.rejectRequisitionApproval(null, { id: reqId, reason: '  ' }, ctx as never),
    ).rejects.toThrow(/reason is required/i)
  })

  it('releases reservations and returns directly to draft — not a separate rejected status', async () => {
    const productId = await makeProduct('rejectflow')
    await receive(productId, warehouseId, 10)
    const { reqId, lineId } = await makeReqAtPendingApproval({ qtyOrdered: 10, qtyFromStock: 6, marketPrice: 15, productId })
    expect((await getBalance(productId, warehouseId)).reserved).toBe(6)

    const result = await resolvers.Mutation.rejectRequisitionApproval(
      null,
      { id: reqId, reason: 'wrong quantity, redo' },
      ctx as never,
    )
    expect((result as { status: string }).status).toBe('draft')

    const bal = await getBalance(productId, warehouseId)
    expect(bal.reserved).toBe(0)
    expect(bal.onHand).toBe(10)

    const log = await pool.query<{ from_status: string; to_status: string; action: string; actor_position: string; notes: string }>(
      `SELECT from_status, to_status, action, actor_position, notes FROM requisition_approval_log WHERE requisition_id=$1 AND action='reject'`,
      [reqId],
    )
    expect(log.rows[0]).toEqual({
      from_status: 'pending_approval',
      to_status: 'draft',
      action: 'reject',
      actor_position: 'admin',
      notes: 'wrong quantity, redo',
    })

    // No approved_unit_price snapshot — rejection never reached approval.
    const line = await pool.query<{ approved_unit_price: string | null }>(
      `SELECT approved_unit_price FROM po_lines WHERE id=$1`,
      [lineId],
    )
    expect(line.rows[0]!.approved_unit_price).toBeNull()
  })

  it('assigned_approver_id grants rejection rights to a non-admin, non-dept-head user', async () => {
    const { reqId } = await makeReqAtPendingApproval({ qtyOrdered: 2, qtyFromStock: 0, marketPrice: 7 })

    await expect(
      resolvers.Mutation.rejectRequisitionApproval(
        null,
        { id: reqId, reason: 'not authorized yet' },
        approverCtx as never,
      ),
    ).rejects.toThrow(/not authorized to reject this requisition/i)

    await pool.query(`UPDATE requisitions SET assigned_approver_id=$1 WHERE id=$2`, [approverEmployeeId, reqId])

    const result = await resolvers.Mutation.rejectRequisitionApproval(
      null,
      { id: reqId, reason: 'assigned approver says redo' },
      approverCtx as never,
    )
    expect((result as { status: string }).status).toBe('draft')

    const log = await pool.query<{ actor_position: string }>(
      `SELECT actor_position FROM requisition_approval_log WHERE requisition_id=$1 AND action='reject'`,
      [reqId],
    )
    expect(log.rows[0]!.actor_position).toBe('assigned_approver')
  })
})
