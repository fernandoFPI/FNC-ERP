// A requisition's owner can price and buy some of its lines himself while procurement does the rest, in parallel
// (migration 315); the requisition waits for both before it moves on, and Finish Buying happens by itself once
// the last line is done.
//
// Regression background: Market pricing needed the procurement_officer position and every Items Bought action the
// buyer position, for the WHOLE requisition, so an owner who was happy to buy some items himself (the kitchen's
// weekly shopping) could not record it, and there was no way to say "this line is mine".
//
// Real Postgres, real mutations (createRequisition, setRequisitionLineOwner, submitRequisitionMarketPricing,
// recordLinePurchase, markRequisitionLineShort, approveTolerancePurchase, attachFile, finishBuyingRequisition);
// nothing mocked. Users: an owner with NO position, a procurement officer, a buyer, a stranger, two admins.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { pool } from '@fnc-erp/db'
import { typeDefs } from '../src/graphql/schema.js'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const EMAIL_PREFIX = 'req-owner-split-'
const EMP_PREFIX = 'ROS-EMP-'
const SKU_PREFIX = 'ROSTEST-'
const VENDOR_PREFIX = 'ROSTEST Vendor '

type Who = 'owner' | 'procurement' | 'buyer' | 'stranger' | 'admin' | 'admin2'
const userIds = {} as Record<Who, string>
let vendorId: string
let toleranceBefore: { tolerance_pct: string; tolerance_abs: string; is_provisional: boolean } | null = null

const ctxFor = (who: Who) =>
  ({
    auth: {
      companyId: TEST_COMPANY_ID,
      userId: userIds[who],
      role: who === 'admin' || who === 'admin2' ? 'system_admin' : 'user',
      module: 'all',
      sessionId: 'ros-test',
    },
  }) as never

async function makeUser(key: Who): Promise<void> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, first_name, last_name) VALUES ($1,'test-hash-not-used',$2,'Tester')
     ON CONFLICT (email) DO UPDATE SET first_name=EXCLUDED.first_name RETURNING id`,
    [`${EMAIL_PREFIX}${key}@fnc-erp.local`, key],
  )
  userIds[key] = r.rows[0]!.id
}

async function givePosition(who: Who, position: string): Promise<void> {
  const emp = await pool.query<{ id: string }>(
    `INSERT INTO employees (company_id, user_id, first_name, last_name, hire_date, employee_number)
     VALUES ($1,$2,$3,'Tester',CURRENT_DATE,$4)
     ON CONFLICT (company_id, employee_number) DO UPDATE SET user_id=EXCLUDED.user_id RETURNING id`,
    [TEST_COMPANY_ID, userIds[who], who, `${EMP_PREFIX}${who}`],
  )
  await pool.query(
    `INSERT INTO po_position_assignments (company_id, employee_id, position, department_id, branch_id, is_active, assigned_by)
     VALUES ($1,$2,$3,NULL,NULL,true,$4)`,
    [TEST_COMPANY_ID, emp.rows[0]!.id, position, userIds.admin],
  )
}

interface LineSpec {
  qty?: number
  unitPrice?: number
  owner?: boolean
  fromStock?: number
}
interface Req {
  reqId: string
  lines: string[]
}

// A requisition owned by `owner`, forced to `status`, with the given lines. Each line is a catalog product.
async function makeRequisition(status: string, specs: LineSpec[]): Promise<Req> {
  const lines: { product_id: string; description: string; qty: number; unit_price: number }[] = []
  for (const [i, s] of specs.entries()) {
    const sku = `${SKU_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const prod = await pool.query<{ id: string }>(
      `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$2,'unit','general') RETURNING id`,
      [TEST_COMPANY_ID, sku],
    )
    lines.push({
      product_id: prod.rows[0]!.id,
      description: `Item ${i + 1}`,
      qty: s.qty ?? 10,
      unit_price: s.unitPrice ?? 1000,
    })
  }
  const created = (await resolvers.Mutation.createRequisition(
    null,
    { input: { purpose: 'stock', lines } },
    { auth: { ...(ctxFor('owner') as { auth: object }).auth, role: 'system_admin' } } as never,
  )) as { id: string }
  await pool.query(`UPDATE requisitions SET status=$1 WHERE id=$2`, [status, created.id])
  const rows = await pool.query<{ id: string }>(`SELECT id FROM po_lines WHERE requisition_id=$1 ORDER BY line_number`, [
    created.id,
  ])
  for (const [i, s] of specs.entries()) {
    await pool.query(
      `UPDATE po_lines SET owner_handles=$2, qty_from_stock=$3, approved_unit_price=$4 WHERE id=$1`,
      [rows.rows[i]!.id, !!s.owner, s.fromStock ?? 0, s.unitPrice ?? 1000],
    )
  }
  return { reqId: created.id, lines: rows.rows.map((r) => r.id) }
}

const status = async (reqId: string): Promise<string> =>
  (await pool.query<{ status: string }>(`SELECT status FROM requisitions WHERE id=$1`, [reqId])).rows[0]!.status
const submittedAt = async (reqId: string) =>
  (
    await pool.query<{ o: string | null; p: string | null }>(
      `SELECT owner_pricing_submitted_at AS o, procurement_pricing_submitted_at AS p FROM requisitions WHERE id=$1`,
      [reqId],
    )
  ).rows[0]!
const lineRow = async (lineId: string) =>
  (await pool.query<{ owner_handles: boolean; market_price: string | null }>(`SELECT owner_handles, market_price FROM po_lines WHERE id=$1`, [lineId]))
    .rows[0]!

// How many "verify prices" notices went to the organizer for this requisition (the notifier is fire-and-forget).
const verificationNotices = async (reqId: string): Promise<number> =>
  (
    await pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM service_outbox WHERE event_type='REQ_PRICE_VERIFICATION_REQUIRED' AND payload->>'requisitionId'=$1`,
      [reqId],
    )
  ).rows[0]!.n

const price = (lineId: string, p = 1100) => ({ lineId, marketPrice: p, currencyCode: 'IQD' })
const submit = (who: Who, reqId: string, linePrices: ReturnType<typeof price>[], side?: 'OWNER' | 'PROCUREMENT') =>
  resolvers.Mutation.submitRequisitionMarketPricing(null, { id: reqId, linePrices, side } as never, ctxFor(who))
const setOwner = (who: Who, lineId: string, byOwner: boolean) =>
  resolvers.Mutation.setRequisitionLineOwner(null, { lineId, byOwner } as never, ctxFor(who))

async function makeReceiptFile(): Promise<string> {
  const f = await pool.query<{ id: string }>(
    `INSERT INTO files (company_id, uploaded_by, file_key, original_filename, mime_type, size_bytes, category, status)
     VALUES ($1,$2,$3,'receipt.jpg','image/jpeg',1024,'attachment','uploaded') RETURNING id`,
    [TEST_COMPANY_ID, userIds.owner, `ros-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`],
  )
  return f.rows[0]!.id
}
// Puts `qty` of a product on the shelf of an active warehouse and returns that warehouse's id.
async function receiveStock(productId: string, qty: number): Promise<string> {
  const wh = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='warehouse' AND is_active=true LIMIT 1`,
    [TEST_COMPANY_ID],
  )
  const vin = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='virtual_in' AND is_active=true LIMIT 1`,
    [TEST_COMPANY_ID],
  )
  await pool.query(
    `INSERT INTO stock_moves (company_id, product_id, from_location_id, to_location_id, moved_at, qty, unit_cost, total_cost, source_type, moved_by)
     VALUES ($1,$2,$3,$4,NOW(),$5,10,$6,'po_receipt',$7)`,
    [TEST_COMPANY_ID, productId, vin.rows[0]!.id, wh.rows[0]!.id, qty, qty * 10, userIds.admin],
  )
  return wh.rows[0]!.id
}

const buy = (who: Who, lineId: string, qty: number, p: number, receiptFileId?: string) =>
  resolvers.Mutation.recordLinePurchase(
    null,
    { input: { lineId, vendorId, qty, actualUnitPrice: p, currencyCode: 'IQD', receiptFileId } } as never,
    ctxFor(who),
  ) as Promise<{ id: string }>

async function cleanup(): Promise<void> {
  const reqs = `SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id IN (SELECT id FROM users WHERE email LIKE $2)`
  const a = [TEST_COMPANY_ID, `${EMAIL_PREFIX}%`]
  await pool.query(
    `DELETE FROM service_outbox WHERE event_type='REQ_PRICE_VERIFICATION_REQUIRED' AND payload->>'requisitionId' IN (SELECT id::text FROM requisitions WHERE company_id=$1 AND organizer_id IN (SELECT id FROM users WHERE email LIKE $2))`,
    a,
  )
  await pool.query(`DELETE FROM requisition_approval_log WHERE requisition_id IN (${reqs})`, a)
  await pool.query(`DELETE FROM po_line_purchases WHERE po_line_id IN (SELECT id FROM po_lines WHERE requisition_id IN (${reqs}))`, a)
  await pool.query(`DELETE FROM document_attachments WHERE entity_type='po_line_purchase' AND uploaded_by IN (SELECT id FROM users WHERE email LIKE $1)`, [
    `${EMAIL_PREFIX}%`,
  ])
  await pool.query(`DELETE FROM files WHERE company_id=$1 AND file_key LIKE 'ros-test-%'`, [TEST_COMPANY_ID])
  await pool.query(
    `DELETE FROM project_material_issue_lines WHERE issue_id IN (SELECT id FROM project_material_issues WHERE requisition_id IN (${reqs}))`,
    a,
  )
  await pool.query(`DELETE FROM project_material_issues WHERE requisition_id IN (${reqs})`, a)
  await pool.query(`DELETE FROM po_lines WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1 AND requisition_id IN (${reqs}))`, a)
  await pool.query(`DELETE FROM po_lines WHERE requisition_id IN (${reqs})`, a)
  await pool.query(`DELETE FROM purchase_orders WHERE company_id=$1 AND requisition_id IN (${reqs})`, a)
  await pool.query(`DELETE FROM requisitions WHERE id IN (${reqs})`, a)
  await pool.query(`DELETE FROM stock_moves WHERE company_id=$1 AND product_id IN (SELECT id FROM products WHERE sku LIKE $2)`, [
    TEST_COMPANY_ID,
    `${SKU_PREFIX}%`,
  ])
  await pool.query(`DELETE FROM stock_balances WHERE product_id IN (SELECT id FROM products WHERE sku LIKE $1)`, [`${SKU_PREFIX}%`])
  await pool.query(`DELETE FROM product_cost_change_requests WHERE product_id IN (SELECT id FROM products WHERE sku LIKE $1)`, [`${SKU_PREFIX}%`])
  await pool.query(`DELETE FROM product_cost_history WHERE product_id IN (SELECT id FROM products WHERE sku LIKE $1)`, [`${SKU_PREFIX}%`])
  await pool.query(`DELETE FROM products WHERE company_id=$1 AND sku LIKE $2`, [TEST_COMPANY_ID, `${SKU_PREFIX}%`])
  await pool.query(`DELETE FROM vendors WHERE company_id=$1 AND name LIKE $2`, [TEST_COMPANY_ID, `${VENDOR_PREFIX}%`])
  await pool.query(`DELETE FROM po_position_assignments WHERE employee_id IN (SELECT id FROM employees WHERE employee_number LIKE $1)`, [`${EMP_PREFIX}%`])
  await pool.query(`DELETE FROM employees WHERE employee_number LIKE $1`, [`${EMP_PREFIX}%`])
}

beforeAll(async () => {
  for (const who of ['owner', 'procurement', 'buyer', 'stranger', 'admin', 'admin2'] as Who[]) await makeUser(who)
  await cleanup()
  await givePosition('procurement', 'procurement_officer')
  await givePosition('buyer', 'buyer')
  vendorId = (
    await pool.query<{ id: string }>(`INSERT INTO vendors (company_id, name) VALUES ($1,$2) RETURNING id`, [
      TEST_COMPANY_ID,
      `${VENDOR_PREFIX}${Date.now()}`,
    ])
  ).rows[0]!.id
  toleranceBefore =
    (
      await pool.query(`SELECT tolerance_pct, tolerance_abs, is_provisional FROM company_price_tolerance WHERE company_id=$1 AND currency_code='IQD'`, [
        TEST_COMPANY_ID,
      ])
    ).rows[0] ?? null
  await pool.query(
    `INSERT INTO company_price_tolerance (company_id, currency_code, tolerance_pct, tolerance_abs, is_provisional)
     VALUES ($1,'IQD',5,25000,true)
     ON CONFLICT (company_id, currency_code) DO UPDATE SET tolerance_pct=5, tolerance_abs=25000`,
    [TEST_COMPANY_ID],
  )
})

afterAll(async () => {
  await cleanup()
  if (toleranceBefore) {
    await pool.query(
      `UPDATE company_price_tolerance SET tolerance_pct=$2, tolerance_abs=$3, is_provisional=$4 WHERE company_id=$1 AND currency_code='IQD'`,
      [TEST_COMPANY_ID, toleranceBefore.tolerance_pct, toleranceBefore.tolerance_abs, toleranceBefore.is_provisional],
    )
  } else {
    await pool.query(`DELETE FROM company_price_tolerance WHERE company_id=$1 AND currency_code='IQD'`, [TEST_COMPANY_ID])
  }
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`]).catch(() => undefined)
  await pool.end()
})

beforeEach(async () => {
  // each test builds its own requisitions; nothing to reset
})

describe('market pricing without an owner split behaves exactly as before', () => {
  it('procurement’s single submit still moves the whole requisition on', async () => {
    const r = await makeRequisition('market_pricing', [{}, {}])
    await submit('procurement', r.reqId, r.lines.map((l) => price(l)))
    expect(await status(r.reqId)).toBe('price_verification')
    const s = await submittedAt(r.reqId)
    expect(s.p).not.toBeNull()
    expect(s.o).toBeNull()
  })

  it('the owner alone still cannot submit procurement’s part', async () => {
    const r = await makeRequisition('market_pricing', [{}])
    await expect(submit('owner', r.reqId, [price(r.lines[0]!)])).rejects.toThrow(/procurement_officer position required/)
    expect(await status(r.reqId)).toBe('market_pricing')
  })

  it('a stranger can submit neither part', async () => {
    const r = await makeRequisition('market_pricing', [{ owner: true }, {}])
    await expect(submit('stranger', r.reqId, [price(r.lines[1]!)])).rejects.toThrow(/procurement_officer/)
    await expect(submit('stranger', r.reqId, [price(r.lines[0]!)], 'OWNER')).rejects.toThrow(/owner/)
    expect((await submittedAt(r.reqId)).o).toBeNull()
  })
})

describe('taking a line', () => {
  it('the owner can take and hand back a line that has no price yet', async () => {
    const r = await makeRequisition('market_pricing', [{}, {}])
    await setOwner('owner', r.lines[0]!, true)
    expect((await lineRow(r.lines[0]!)).owner_handles).toBe(true)
    expect((await lineRow(r.lines[1]!)).owner_handles).toBe(false)
    await setOwner('owner', r.lines[0]!, false)
    expect((await lineRow(r.lines[0]!)).owner_handles).toBe(false)
  })

  it('the owner cannot change a line that already has a market price; procurement can', async () => {
    const r = await makeRequisition('market_pricing', [{ owner: true }, {}])
    await pool.query(`UPDATE po_lines SET market_price=1100 WHERE id=ANY($1)`, [r.lines])
    await expect(setOwner('owner', r.lines[0]!, false)).rejects.toThrow(/already has a market price/)
    await expect(setOwner('owner', r.lines[1]!, true)).rejects.toThrow(/already has a market price/)
    await setOwner('procurement', r.lines[1]!, true)
    expect((await lineRow(r.lines[1]!)).owner_handles).toBe(true)
  })

  it('a stranger cannot take a line, and admins can', async () => {
    const r = await makeRequisition('market_pricing', [{}])
    await expect(setOwner('stranger', r.lines[0]!, true)).rejects.toThrow(/Only the requisition owner or procurement/)
    await setOwner('admin', r.lines[0]!, true)
    expect((await lineRow(r.lines[0]!)).owner_handles).toBe(true)
  })

  it('only while the requisition is in market pricing', async () => {
    for (const st of ['store_pricing', 'price_verification', 'items_bought']) {
      const r = await makeRequisition(st, [{}])
      await expect(setOwner('owner', r.lines[0]!, true)).rejects.toThrow(/only be taken or handed back while the requisition is in market pricing/)
      expect((await lineRow(r.lines[0]!)).owner_handles).toBe(false)
    }
  })

  it('a line of another company is not found', async () => {
    const r = await makeRequisition('market_pricing', [{}])
    const other = { auth: { companyId: 'f0000000-0000-0000-0000-0000000000ff', userId: userIds.owner, role: 'user', module: 'all', sessionId: 'x' } } as never
    await expect(resolvers.Mutation.setRequisitionLineOwner(null, { lineId: r.lines[0]!, byOwner: true } as never, other)).rejects.toThrow(/not found/)
  })
})

describe('both parts have to be submitted before the requisition moves on', () => {
  it('owner first, then procurement', async () => {
    const r = await makeRequisition('market_pricing', [{ owner: true }, {}, {}])
    await submit('owner', r.reqId, [price(r.lines[0]!)], 'OWNER')
    // Procurement's part is still to come.
    expect(await status(r.reqId)).toBe('market_pricing')
    const mid = await submittedAt(r.reqId)
    expect(mid.o).not.toBeNull()
    expect(mid.p).toBeNull()
    await submit('procurement', r.reqId, [price(r.lines[1]!), price(r.lines[2]!)])
    expect(await status(r.reqId)).toBe('price_verification')
  })

  it('procurement first, then the owner', async () => {
    const r = await makeRequisition('market_pricing', [{ owner: true }, {}])
    await submit('procurement', r.reqId, [price(r.lines[1]!)])
    expect(await status(r.reqId)).toBe('market_pricing')
    await submit('owner', r.reqId, [price(r.lines[0]!)], 'OWNER')
    expect(await status(r.reqId)).toBe('price_verification')
  })

  it('the owner took every line: his submit alone moves it on', async () => {
    const r = await makeRequisition('market_pricing', [{ owner: true }, { owner: true }])
    await submit('owner', r.reqId, r.lines.map((l) => price(l)), 'OWNER')
    expect(await status(r.reqId)).toBe('price_verification')
  })

  it('a line fully covered from stock needs no price and does not make the owner’s part wait', async () => {
    const r = await makeRequisition('market_pricing', [{ owner: true, fromStock: 10 }, {}])
    await submit('procurement', r.reqId, [price(r.lines[1]!)])
    expect(await status(r.reqId)).toBe('price_verification')
  })

  it('the owner cannot submit his part while a line he took has no price', async () => {
    const r = await makeRequisition('market_pricing', [{ owner: true }, { owner: true }])
    await expect(submit('owner', r.reqId, [price(r.lines[0]!)], 'OWNER')).rejects.toThrow(/Every line you took needs a market price/)
    expect((await submittedAt(r.reqId)).o).toBeNull()
    expect(await status(r.reqId)).toBe('market_pricing')
  })

  it('the owner can price only the lines he took, and nothing is written when he tries another', async () => {
    const r = await makeRequisition('market_pricing', [{ owner: true }, {}])
    await expect(submit('owner', r.reqId, [price(r.lines[0]!), price(r.lines[1]!)], 'OWNER')).rejects.toThrow(/only price the lines you took/)
    expect((await lineRow(r.lines[0]!)).market_price).toBeNull()
    expect((await lineRow(r.lines[1]!)).market_price).toBeNull()
  })

  it('procurement can step in: price the owner’s line and submit his part for him', async () => {
    const r = await makeRequisition('market_pricing', [{ owner: true }, {}])
    await submit('procurement', r.reqId, [price(r.lines[0]!)], 'OWNER')
    expect((await submittedAt(r.reqId)).o).not.toBeNull()
    expect(await status(r.reqId)).toBe('market_pricing')
    await submit('procurement', r.reqId, [price(r.lines[1]!)])
    expect(await status(r.reqId)).toBe('price_verification')
  })

  it('an admin can submit either part', async () => {
    const r = await makeRequisition('market_pricing', [{ owner: true }, {}])
    await submit('admin', r.reqId, [price(r.lines[0]!)], 'OWNER')
    await submit('admin', r.reqId, [price(r.lines[1]!)], 'PROCUREMENT')
    expect(await status(r.reqId)).toBe('price_verification')
  })

  it('a part cannot be submitted outside market pricing, and nothing is written when it is refused', async () => {
    // Two lines on purpose: with procurement's line still pending, no transition would run to catch the wrong stage.
    const r = await makeRequisition('price_verification', [{ owner: true }, {}])
    await expect(submit('owner', r.reqId, [price(r.lines[0]!)], 'OWNER')).rejects.toThrow(/Expected 'market_pricing'/)
    expect((await lineRow(r.lines[0]!)).market_price).toBeNull()
    expect((await submittedAt(r.reqId)).o).toBeNull()
  })

  it('the organizer is told to verify prices once, when the last part lands, not after the first', async () => {
    const r = await makeRequisition('market_pricing', [{ owner: true }, {}])
    await submit('owner', r.reqId, [price(r.lines[0]!)], 'OWNER')
    await new Promise((res) => setTimeout(res, 300))
    expect(await verificationNotices(r.reqId)).toBe(0)
    await submit('procurement', r.reqId, [price(r.lines[1]!)])
    await vi.waitFor(async () => expect(await verificationNotices(r.reqId)).toBe(1))
    await new Promise((res) => setTimeout(res, 300))
    expect(await verificationNotices(r.reqId)).toBe(1)
  })

  // Regression: this notice used to carry `poId`, which the worker's REQ_* handler cannot read, so every one failed
  // ("invalid input syntax for type uuid: "undefined"", 192 on production) and none reached the organizer.
  it('sends the notice to the organizer with the id key the worker reads, and not the one it cannot', async () => {
    const r = await makeRequisition('market_pricing', [{}])
    await submit('procurement', r.reqId, [price(r.lines[0]!)])
    await vi.waitFor(async () => expect(await verificationNotices(r.reqId)).toBe(1))
    const row = await pool.query<{ payload: Record<string, unknown> }>(
      `SELECT payload FROM service_outbox WHERE event_type='REQ_PRICE_VERIFICATION_REQUIRED' AND payload->>'requisitionId'=$1`,
      [r.reqId],
    )
    const payload = row.rows[0]!.payload
    expect(payload.requisitionId).toBe(r.reqId)
    expect(payload.userId).toBe(userIds.owner) // the organizer
    expect(payload).not.toHaveProperty('poId')
  })


  it('handing a line back re-opens procurement’s part, which then has to submit again', async () => {
    const r = await makeRequisition('market_pricing', [{ owner: true }, {}])
    await submit('procurement', r.reqId, [price(r.lines[1]!)])
    expect((await submittedAt(r.reqId)).p).not.toBeNull()
    await setOwner('owner', r.lines[0]!, false)
    expect((await submittedAt(r.reqId)).p).toBeNull()
    expect(await status(r.reqId)).toBe('market_pricing')
  })

  it('taking a line re-opens the owner’s part', async () => {
    const r = await makeRequisition('market_pricing', [{ owner: true }, {}])
    await submit('owner', r.reqId, [price(r.lines[0]!)], 'OWNER')
    expect((await submittedAt(r.reqId)).o).not.toBeNull()
    await setOwner('procurement', r.lines[1]!, true)
    expect((await submittedAt(r.reqId)).o).toBeNull()
  })

  it('sending the requisition back to market pricing clears both parts', async () => {
    const r = await makeRequisition('market_pricing', [{ owner: true }, {}])
    await submit('owner', r.reqId, [price(r.lines[0]!)], 'OWNER')
    await submit('procurement', r.reqId, [price(r.lines[1]!)])
    expect(await status(r.reqId)).toBe('price_verification')
    await resolvers.Mutation.rejectRequisitionVerificationToMarketPricing(
      null,
      { id: r.reqId, reason: 'recheck', lineFlags: [{ lineId: r.lines[1]!, reason: 'wrong price' }] } as never,
      ctxFor('admin'),
    )
    expect(await status(r.reqId)).toBe('market_pricing')
    const s = await submittedAt(r.reqId)
    expect([s.o, s.p]).toEqual([null, null])
  })
})

describe('buying an owner’s line', () => {
  it('the owner can record a purchase on a line he took, and only on those', async () => {
    const r = await makeRequisition('items_bought', [{ owner: true }, {}])
    const receipt = await makeReceiptFile()
    const p = await buy('owner', r.lines[0]!, 10, 1000, receipt)
    expect(p.id).toBeTruthy()
    await expect(buy('owner', r.lines[1]!, 10, 1000, receipt)).rejects.toThrow(/or its owner for a line he took/)
  })

  it('procurement’s buyer can buy any line, the owner’s included (stepping in)', async () => {
    const r = await makeRequisition('items_bought', [{ owner: true }, {}])
    const receipt = await makeReceiptFile()
    expect((await buy('buyer', r.lines[0]!, 10, 1000, receipt)).id).toBeTruthy()
    expect((await buy('buyer', r.lines[1]!, 10, 1000, receipt)).id).toBeTruthy()
  })

  it('a stranger cannot buy, even a line marked as the owner’s', async () => {
    const r = await makeRequisition('items_bought', [{ owner: true }])
    await expect(buy('stranger', r.lines[0]!, 10, 1000)).rejects.toThrow(/or its owner for a line he took/)
  })

  it('someone else’s requisition: an owner’s ticked line does not make a stranger an owner', async () => {
    const r = await makeRequisition('items_bought', [{ owner: true }])
    // the owner flag is on the line, but the caller is not the organizer
    await expect(buy('procurement', r.lines[0]!, 10, 1000)).rejects.toThrow(/or its owner/)
  })

  it('the owner can mark a line of his short, and not another line', async () => {
    const r = await makeRequisition('items_bought', [{ owner: true }, {}, {}])
    await resolvers.Mutation.markRequisitionLineShort(null, { lineId: r.lines[0]!, reason: 'not available' } as never, ctxFor('owner'))
    await expect(
      resolvers.Mutation.markRequisitionLineShort(null, { lineId: r.lines[1]!, reason: 'x' } as never, ctxFor('owner')),
    ).rejects.toThrow(/or its owner for a line he took/)
  })

  it('the owner cannot resolve procurement’s line from stock', async () => {
    const r = await makeRequisition('items_bought', [{ owner: true }, {}])
    const loc = await pool.query<{ id: string }>(`SELECT id FROM stock_locations WHERE company_id=$1 LIMIT 1`, [TEST_COMPANY_ID])
    await expect(
      resolvers.Mutation.resolveRequisitionLineFromStock(
        null,
        { lineId: r.lines[1]!, qty: 1, sourceLocationId: loc.rows[0]?.id ?? '00000000-0000-0000-0000-000000000000' } as never,
        ctxFor('owner'),
      ),
    ).rejects.toThrow(/or its owner for a line he took/)
  })

  it('an owner who bought a line cannot approve his own over-tolerance purchase', async () => {
    const r = await makeRequisition('items_bought', [{ owner: true }])
    // approved at 1,000: the ceiling is 1,000 + min(5 %, 25,000) = 1,050, so 1,300 is over tolerance
    const p = await buy('owner', r.lines[0]!, 10, 1300, await makeReceiptFile())
    const flagged = await pool.query(`SELECT over_tolerance FROM po_line_purchases WHERE id=$1`, [p.id])
    expect(flagged.rows[0].over_tolerance).toBe(true)
    await expect(resolvers.Mutation.approveTolerancePurchase(null, { purchaseId: p.id } as never, ctxFor('owner'))).rejects.toThrow(/Not authorized/)
  })
})

describe('finishing buying by itself', () => {
  it('finishes the moment the last line is bought, whoever buys it, and forks the child POs', async () => {
    const r = await makeRequisition('items_bought', [{ owner: true }, {}])
    const receipt = await makeReceiptFile()
    await buy('owner', r.lines[0]!, 10, 1000, receipt)
    // Procurement's line is still to buy.
    expect(await status(r.reqId)).toBe('items_bought')
    await buy('buyer', r.lines[1]!, 10, 1000, receipt)
    expect(await status(r.reqId)).toBe('sourcing')
    const pos = await pool.query(`SELECT status FROM purchase_orders WHERE requisition_id=$1`, [r.reqId])
    expect(pos.rows.map((p) => p.status)).toEqual(['bought'])
    // Both lines ended up on the child PO, the owner's and procurement's.
    const onChild = await pool.query(`SELECT COUNT(*)::int AS n FROM po_lines WHERE requisition_id=$1 AND po_id IS NOT NULL`, [r.reqId])
    expect(onChild.rows[0].n).toBe(2)
  })

  it('does not complete the requisition: it waits in Sourcing for the child POs', async () => {
    const r = await makeRequisition('items_bought', [{ owner: true }, {}])
    const receipt = await makeReceiptFile()
    await buy('buyer', r.lines[1]!, 10, 1000, receipt)
    await buy('owner', r.lines[0]!, 10, 1000, receipt)
    expect(await status(r.reqId)).toBe('sourcing')
    expect(await status(r.reqId)).not.toBe('completed')
  })

  it('waits while any purchase has no receipt, and finishes when the receipt is attached', async () => {
    const r = await makeRequisition('items_bought', [{ owner: true }, {}])
    const receipt = await makeReceiptFile()
    const ownerPurchase = await buy('owner', r.lines[0]!, 10, 1000) // no receipt yet
    await buy('buyer', r.lines[1]!, 10, 1000, receipt)
    expect(await status(r.reqId)).toBe('items_bought')
    const later = await makeReceiptFile()
    await resolvers.Mutation.attachFile(null, { fileId: later, entityType: 'po_line_purchase', entityId: ownerPurchase.id } as never, ctxFor('owner'))
    expect(await status(r.reqId)).toBe('sourcing')
  })

  it('waits for an over-tolerance purchase to be approved by someone else, then finishes', async () => {
    const r = await makeRequisition('items_bought', [{ owner: true }, {}])
    const receipt = await makeReceiptFile()
    const over = await buy('buyer', r.lines[1]!, 10, 1300, receipt)
    await buy('owner', r.lines[0]!, 10, 1000, receipt)
    expect(await status(r.reqId)).toBe('items_bought')
    await resolvers.Mutation.approveTolerancePurchase(null, { purchaseId: over.id } as never, ctxFor('admin2'))
    expect(await status(r.reqId)).toBe('sourcing')
  })

  it('marking the last open line short finishes it too', async () => {
    const r = await makeRequisition('items_bought', [{ owner: true }, {}])
    await buy('owner', r.lines[0]!, 10, 1000, await makeReceiptFile())
    expect(await status(r.reqId)).toBe('items_bought')
    await resolvers.Mutation.markRequisitionLineShort(null, { lineId: r.lines[1]!, reason: 'out of stock at the vendor' } as never, ctxFor('buyer'))
    expect(await status(r.reqId)).toBe('sourcing')
  })

  it('a partly bought line keeps it waiting', async () => {
    const r = await makeRequisition('items_bought', [{ owner: true }])
    await buy('owner', r.lines[0]!, 4, 1000, await makeReceiptFile())
    expect(await status(r.reqId)).toBe('items_bought')
    await buy('owner', r.lines[0]!, 6, 1000, await makeReceiptFile())
    expect(await status(r.reqId)).toBe('sourcing')
  })

  it('the Finish Buying button is still there as a fallback, with its old gate', async () => {
    const r = await makeRequisition('items_bought', [{ owner: true }])
    // not ready: nothing bought yet
    await expect(resolvers.Mutation.finishBuyingRequisition(null, { id: r.reqId } as never, ctxFor('buyer'))).rejects.toThrow(
      /fully bought or marked short/,
    )
    // the owner is not a buyer position holder: refused even though the requisition would be ready
    await expect(resolvers.Mutation.finishBuyingRequisition(null, { id: r.reqId } as never, ctxFor('owner'))).rejects.toThrow(
      /Only a buyer position holder/,
    )
  })

  it('pressing Finish Buying after it happened by itself returns the requisition and forks nothing twice', async () => {
    const r = await makeRequisition('items_bought', [{ owner: true }])
    await buy('owner', r.lines[0]!, 10, 1000, await makeReceiptFile())
    expect(await status(r.reqId)).toBe('sourcing')
    const again = (await resolvers.Mutation.finishBuyingRequisition(null, { id: r.reqId } as never, ctxFor('buyer'))) as {
      status: string
    }
    expect(again.status).toBe('sourcing')
    const pos = await pool.query(`SELECT id FROM purchase_orders WHERE requisition_id=$1`, [r.reqId])
    expect(pos.rows).toHaveLength(1)
  })

  it('the button still refuses a caller who is not a buyer, even after it finished by itself', async () => {
    const r = await makeRequisition('items_bought', [{ owner: true }])
    await buy('owner', r.lines[0]!, 10, 1000, await makeReceiptFile())
    await expect(resolvers.Mutation.finishBuyingRequisition(null, { id: r.reqId } as never, ctxFor('owner'))).rejects.toThrow(
      /Only a buyer position holder/,
    )
  })

  it('two finishes at the same moment fork one child PO, not two', async () => {
    const r = await makeRequisition('items_bought', [{}, {}])
    await buy('buyer', r.lines[0]!, 10, 1000, await makeReceiptFile())
    // Marked short straight in the table, so nothing has triggered the automatic finish yet: the requisition is ready
    // and still in Items Bought.
    await pool.query(`UPDATE po_lines SET short_reason='gone', short_marked_by=$2, short_marked_at=NOW() WHERE id=$1`, [
      r.lines[1],
      userIds.buyer,
    ])
    expect(await status(r.reqId)).toBe('items_bought')
    const results = await Promise.allSettled([
      resolvers.Mutation.finishBuyingRequisition(null, { id: r.reqId } as never, ctxFor('buyer')),
      resolvers.Mutation.finishBuyingRequisition(null, { id: r.reqId } as never, ctxFor('admin')),
    ])
    expect(results.filter((x) => x.status === 'fulfilled').length).toBeGreaterThanOrEqual(1)
    // Whoever lost the race was turned away by the row lock (or arrived after it and got the requisition back), never by
    // a failure half way through forking.
    for (const x of results) if (x.status === 'rejected') expect(String(x.reason?.message ?? x.reason)).toMatch(/must be in items_bought status/)
    expect(await status(r.reqId)).toBe('sourcing')
    const pos = await pool.query(`SELECT id FROM purchase_orders WHERE requisition_id=$1`, [r.reqId])
    expect(pos.rows).toHaveLength(1)
    const onChild = await pool.query(`SELECT COUNT(*)::int AS n FROM po_lines WHERE requisition_id=$1 AND po_id IS NOT NULL`, [r.reqId])
    expect(onChild.rows[0].n).toBe(1)
  })

  it('resolving the last line from stock finishes it too', async () => {
    const r = await makeRequisition('items_bought', [{ owner: true }, {}])
    await buy('owner', r.lines[0]!, 10, 1000, await makeReceiptFile())
    expect(await status(r.reqId)).toBe('items_bought')
    const productId = (await pool.query<{ product_id: string }>(`SELECT product_id FROM po_lines WHERE id=$1`, [r.lines[1]])).rows[0]!
      .product_id
    const warehouseId = await receiveStock(productId, 10)
    await resolvers.Mutation.resolveRequisitionLineFromStock(
      null,
      { lineId: r.lines[1]!, qty: 10, sourceLocationId: warehouseId } as never,
      ctxFor('buyer'),
    )
    expect(await status(r.reqId)).toBe('sourcing')
  })

  it('a requisition not yet fully bought is left alone by a purchase on another one', async () => {
    const a = await makeRequisition('items_bought', [{ owner: true }, {}])
    const b = await makeRequisition('items_bought', [{ owner: true }])
    await buy('owner', b.lines[0]!, 10, 1000, await makeReceiptFile())
    expect(await status(b.reqId)).toBe('sourcing')
    expect(await status(a.reqId)).toBe('items_bought')
  })
})

// The names shown beside "Handled by" come straight from requisition(id): the organizer, the procurement officer who
// submitted procurement's part of Market pricing, and each purchase's buyer. Run through the real schema so a field that
// is in the SQL but missing from the type (or the reverse) shows up.
describe('who handles a line, as the web reads it', () => {
  const server = new ApolloServer<ReturnType<typeof ctxFor>>({ typeDefs, resolvers })
  const read = async (who: Who, reqId: string) => {
    const res = await server.executeOperation(
      {
        query: `query ($id: ID!) {
          requisition(id: $id) {
            organizerName
            procurementOfficerName
            lines { id owner_handles purchases { bought_by_name } }
          }
        }`,
        variables: { id: reqId },
      },
      { contextValue: ctxFor(who) },
    )
    if (res.body.kind !== 'single') throw new Error('unexpected response kind')
    const { data, errors } = res.body.singleResult
    if (errors?.length) throw new Error(errors.map((e) => e.message).join('; '))
    return (data as { requisition: Record<string, unknown> & { lines: { id: string; purchases: { bought_by_name: string }[] }[] } })
      .requisition
  }

  it('names the organizer, and has no procurement officer until procurement has submitted its part', async () => {
    const r = await makeRequisition('market_pricing', [{ owner: true }, {}])
    const before = await read('owner', r.reqId)
    expect(before.organizerName).toBe('owner Tester')
    expect(before.procurementOfficerName).toBeNull()
  })

  it('names the procurement officer who submitted procurement’s part', async () => {
    const r = await makeRequisition('market_pricing', [{ owner: true }, {}])
    await submit('procurement', r.reqId, [price(r.lines[1]!)])
    expect((await read('owner', r.reqId)).procurementOfficerName).toBe('procurement Tester')
  })

  it('does not name the organizer as procurement when only the organizer’s part was submitted', async () => {
    const r = await makeRequisition('market_pricing', [{ owner: true }, {}])
    await submit('owner', r.reqId, [price(r.lines[0]!)], 'OWNER')
    expect((await read('owner', r.reqId)).procurementOfficerName).toBeNull()
  })

  it('stays empty when an admin with no employee record submitted procurement’s part', async () => {
    const r = await makeRequisition('market_pricing', [{}])
    await submit('admin', r.reqId, [price(r.lines[0]!)])
    expect((await read('admin', r.reqId)).procurementOfficerName).toBeNull()
  })

  it('gives each purchase its buyer’s name, the organizer’s own and the procurement buyer’s', async () => {
    const r = await makeRequisition('items_bought', [{ owner: true }, {}])
    const receipt = await makeReceiptFile()
    await buy('owner', r.lines[0]!, 10, 1000, receipt)
    await buy('buyer', r.lines[1]!, 10, 1000, receipt)
    // both are bought, so the requisition finished by itself; the purchases are still on the lines
    const lines = (await read('admin', r.reqId)).lines
    const namesOf = (lineId: string) => lines.find((l) => l.id === lineId)?.purchases.map((p) => p.bought_by_name)
    expect(namesOf(r.lines[0]!)).toEqual(['owner Tester'])
    expect(namesOf(r.lines[1]!)).toEqual(['buyer Tester'])
  })

  it('never names an employee of another company, even if the id was somehow stored', async () => {
    const other = await pool.query<{ id: string }>(`SELECT id FROM companies WHERE id <> $1 LIMIT 1`, [TEST_COMPANY_ID])
    if (!other.rows[0]) return // a database with a single company cannot show this
    const emp = await pool.query<{ id: string }>(
      `INSERT INTO employees (company_id, user_id, first_name, last_name, hire_date, employee_number)
       VALUES ($1,$2,'Elsewhere','Person',CURRENT_DATE,$3)
       ON CONFLICT (company_id, employee_number) DO UPDATE SET user_id=EXCLUDED.user_id RETURNING id`,
      [other.rows[0].id, userIds.stranger, `${EMP_PREFIX}other-co`],
    )
    const r = await makeRequisition('market_pricing', [{}])
    await pool.query(`UPDATE requisitions SET procurement_officer_id=$1 WHERE id=$2`, [emp.rows[0]!.id, r.reqId])
    expect((await read('owner', r.reqId)).procurementOfficerName).toBeNull()
    // The mutation response is built by a second query. An admin without an employee record does not overwrite the
    // stored id when submitting, so the other company's employee is still what that query joins.
    const res = await server.executeOperation(
      {
        query: `mutation ($id: ID!, $lp: [RequisitionMarketPriceInput!]) {
          submitRequisitionMarketPricing(id: $id, linePrices: $lp) { procurementOfficerName }
        }`,
        variables: { id: r.reqId, lp: [price(r.lines[0]!)] },
      },
      { contextValue: ctxFor('admin') },
    )
    if (res.body.kind !== 'single') throw new Error('unexpected response kind')
    expect(res.body.singleResult.errors).toBeUndefined()
    expect(res.body.singleResult.data).toEqual({ submitRequisitionMarketPricing: { procurementOfficerName: null } })
  })

  it('comes back on the mutation response too, not only on the detail query', async () => {
    const r = await makeRequisition('market_pricing', [{}])
    const res = await server.executeOperation(
      {
        query: `mutation ($id: ID!, $lp: [RequisitionMarketPriceInput!]) {
          submitRequisitionMarketPricing(id: $id, linePrices: $lp) { procurementOfficerName organizerName }
        }`,
        variables: { id: r.reqId, lp: [price(r.lines[0]!)] },
      },
      { contextValue: ctxFor('procurement') },
    )
    if (res.body.kind !== 'single') throw new Error('unexpected response kind')
    expect(res.body.singleResult.errors).toBeUndefined()
    expect(res.body.singleResult.data).toEqual({
      submitRequisitionMarketPricing: { procurementOfficerName: 'procurement Tester', organizerName: 'owner Tester' },
    })
  })
})
