// Goods can never be received into a VIRTUAL location (playbook #105).
//
// Regression (NY-PRJ-2026-0032, and 13 confirmed receipts on production): the Record Receipt form listed every active stock location,
// including "Virtual Receipts" and "Virtual Consumption", and the server accepted whatever id arrived. A receipt booked into Virtual
// Consumption moves the stock from Virtual Receipts straight to the consumption sink: the goods never become stock, no Store Out can ever
// issue them, and the project they were bought for is never charged (USD 3,330.65 and IQD 79,950 on that project). A company with no
// warehouse also got "any active location" as the fallback when none was picked, which could be the same sink.
//
// Real Postgres through the real recordReceipt / confirmReceipt / adminCorrectPO, nothing mocked.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'
import {
  assertReceivableLocation,
  isVirtualLocationType,
  receivingLocationRefusal,
} from '../src/lib/receivingLocation.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const TAG = 'RLV-'
const TEST_USER_EMAIL = 'receipt-location-virtual-test@fnc-erp.local'
const REFUSED = /virtual system location/

let userId: string
let warehouseId: string
let siteId: string
let virtualOutId: string
let virtualInId: string
let vendorId: string
let ctx: unknown

const today = () => new Date().toISOString().slice(0, 10)

async function findOrMakeVirtual(
  type: 'virtual_in' | 'virtual_out',
  name: string,
): Promise<string> {
  const found = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type=$2 AND is_active=true LIMIT 1`,
    [TEST_COMPANY_ID, type],
  )
  if (found.rows[0]) return found.rows[0].id
  const made = await pool.query<{ id: string }>(
    `INSERT INTO stock_locations (company_id, name, type, is_active) VALUES ($1,$2,$3,true) RETURNING id`,
    [TEST_COMPANY_ID, `${TAG}${name}`, type],
  )
  return made.rows[0]!.id
}

async function attachFile(entityType: string, entityId: string, category: string): Promise<void> {
  const key = `${TAG}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const f = await pool.query<{ id: string }>(
    `INSERT INTO files (company_id, uploaded_by, file_key, original_filename, mime_type, size_bytes, category, status)
     VALUES ($1,$2,$3,'receipt.jpg','image/jpeg',1024,$4,'uploaded') RETURNING id`,
    [TEST_COMPANY_ID, userId, key, category],
  )
  await pool.query(
    `INSERT INTO document_attachments (file_id, entity_type, entity_id, uploaded_by) VALUES ($1,$2,$3,$4)`,
    [f.rows[0]!.id, entityType, entityId, userId],
  )
}

// A fresh PO (one line, 10 units, a catalogued product) every time: recordReceipt refuses the same lines twice within 15 minutes.
async function makePO(): Promise<{ poId: string; lineId: string; productId: string }> {
  const sku = `${TAG}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const product = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$2,'unit','general') RETURNING id`,
    [TEST_COMPANY_ID, sku],
  )
  const po = await pool.query<{ id: string }>(
    `INSERT INTO purchase_orders (company_id, po_number, vendor_id, status, currency_code, purpose, created_by)
     VALUES ($1,$2,$3,'approved','USD','stock',$4) RETURNING id`,
    [
      TEST_COMPANY_ID,
      `${TAG}PO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      vendorId,
      userId,
    ],
  )
  const line = await pool.query<{ id: string }>(
    `INSERT INTO po_lines (po_id, product_id, description, line_number, qty_ordered, unit_price, total_price, uom, currency_code)
     VALUES ($1,$2,'test line',1,10,5,50,'unit','USD') RETURNING id`,
    [po.rows[0]!.id, product.rows[0]!.id],
  )
  return { poId: po.rows[0]!.id, lineId: line.rows[0]!.id, productId: product.rows[0]!.id }
}

const record = (poId: string, lineId: string, locationId?: string) =>
  resolvers.Mutation.recordReceipt(
    null,
    {
      poId,
      input: {
        receipt_date: today(),
        ...(locationId ? { location_id: locationId } : {}),
        lines: [{ po_line_id: lineId, qty_received: 10, actual_unit_price: 5 }],
      },
    },
    ctx as never,
  ) as Promise<{ id: string }>

async function withPhotos(poId: string, receiptId: string): Promise<void> {
  await attachFile('po_receipt', receiptId, 'po_receipt_photo')
  await attachFile('purchase_order', poId, 'po_receipt_document')
}

const confirm = (receiptId: string) =>
  resolvers.Mutation.confirmReceipt(null, { id: receiptId }, ctx as never)

const receiptsOf = async (poId: string) =>
  (
    await pool.query<{ id: string; status: string; warehouse_location_id: string | null }>(
      `SELECT id, status, warehouse_location_id FROM po_receipts WHERE po_id=$1`,
      [poId],
    )
  ).rows
const movesOf = async (poLineId: string) =>
  (
    await pool.query<{ to_location_id: string; superseded_at: string | null }>(
      `SELECT to_location_id, superseded_at FROM stock_moves WHERE po_line_id=$1 AND source_type='po_receipt' ORDER BY moved_at, id`,
      [poLineId],
    )
  ).rows
const qtyReceived = async (lineId: string) =>
  parseFloat(
    (
      await pool.query<{ q: string | null }>(`SELECT qty_received AS q FROM po_lines WHERE id=$1`, [
        lineId,
      ])
    ).rows[0]!.q ?? '0',
  )

async function cleanup(): Promise<void> {
  const pos = `SELECT id FROM purchase_orders WHERE po_number LIKE $1`
  const like = [`${TAG}%`]
  await pool.query(
    `DELETE FROM document_attachments WHERE (entity_type='po_receipt' AND entity_id IN (SELECT id FROM po_receipts WHERE po_id IN (${pos}))) OR (entity_type='purchase_order' AND entity_id IN (${pos}))`,
    like,
  )
  await pool.query(
    `DELETE FROM stock_moves WHERE po_line_id IN (SELECT id FROM po_lines WHERE po_id IN (${pos}))`,
    like,
  )
  await pool.query(
    `DELETE FROM po_receipt_lines WHERE receipt_id IN (SELECT id FROM po_receipts WHERE po_id IN (${pos}))`,
    like,
  )
  await pool.query(`DELETE FROM po_receipts WHERE po_id IN (${pos})`, like)
  await pool.query(`DELETE FROM po_approval_log WHERE po_id IN (${pos})`, like)
  await pool.query(`DELETE FROM po_lines WHERE po_id IN (${pos})`, like)
  await pool.query(`DELETE FROM purchase_orders WHERE po_number LIKE $1`, like)
  await pool.query(`DELETE FROM files WHERE company_id=$1 AND file_key LIKE $2`, [
    TEST_COMPANY_ID,
    `${TAG}%`,
  ])
  await pool.query(
    `DELETE FROM product_cost_change_requests WHERE product_id IN (SELECT id FROM products WHERE sku LIKE $1)`,
    like,
  )
  await pool.query(
    `DELETE FROM product_cost_history WHERE product_id IN (SELECT id FROM products WHERE sku LIKE $1)`,
    like,
  )
  await pool.query(
    `DELETE FROM stock_moves WHERE product_id IN (SELECT id FROM products WHERE sku LIKE $1)`,
    like,
  )
  await pool.query(
    `DELETE FROM stock_balances WHERE product_id IN (SELECT id FROM products WHERE sku LIKE $1)`,
    like,
  )
  await pool.query(`DELETE FROM products WHERE sku LIKE $1`, like)
  await pool.query(`DELETE FROM vendors WHERE company_id=$1 AND name LIKE $2`, [
    TEST_COMPANY_ID,
    `${TAG}%`,
  ])
  await pool.query(`DELETE FROM stock_locations WHERE company_id=$1 AND name LIKE $2`, [
    TEST_COMPANY_ID,
    `${TAG}%`,
  ])
}

beforeAll(async () => {
  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  userId = u.rows[0]!.id
  ctx = {
    auth: {
      companyId: TEST_COMPANY_ID,
      userId,
      role: 'system_admin',
      module: 'all',
      sessionId: 'receipt-location-virtual-test',
    },
  }
  const wh = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='warehouse' AND is_active=true LIMIT 1`,
    [TEST_COMPANY_ID],
  )
  if (!wh.rows[0]) throw new Error('No warehouse location seeded for the test company')
  warehouseId = wh.rows[0].id
  await cleanup()
  virtualOutId = await findOrMakeVirtual('virtual_out', 'Virtual Consumption')
  virtualInId = await findOrMakeVirtual('virtual_in', 'Virtual Receipts')
  const site = await pool.query<{ id: string }>(
    `INSERT INTO stock_locations (company_id, name, type, is_active) VALUES ($1,$2,'site',true) RETURNING id`,
    [TEST_COMPANY_ID, `${TAG}Site Store`],
  )
  siteId = site.rows[0]!.id
  const v = await pool.query<{ id: string }>(
    `INSERT INTO vendors (company_id, name) VALUES ($1,$2) RETURNING id`,
    [TEST_COMPANY_ID, `${TAG}Vendor`],
  )
  vendorId = v.rows[0]!.id
})

afterAll(async () => {
  await pool.query(`UPDATE stock_locations SET is_active=true WHERE id=$1`, [warehouseId])
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('the rule itself (pure)', () => {
  it('knows the two virtual types and nothing else', () => {
    expect(isVirtualLocationType('virtual_in')).toBe(true)
    expect(isVirtualLocationType('virtual_out')).toBe(true)
    for (const real of ['warehouse', 'site', 'transit', 'temporary', '', null, undefined])
      expect(isVirtualLocationType(real)).toBe(false)
  })

  it('names the location and says what to do instead', () => {
    const text = receivingLocationRefusal('Virtual Consumption')
    expect(text).toContain('"Virtual Consumption"')
    expect(text).toMatch(REFUSED)
    expect(text).toMatch(/warehouse or site/i)
  })

  it('refuses a virtual location, the transit location and a missing one, and accepts a warehouse, a site and a temporary store', async () => {
    await expect(assertReceivableLocation(pool, virtualOutId)).rejects.toThrow(REFUSED)
    await expect(assertReceivableLocation(pool, virtualInId)).rejects.toThrow(REFUSED)
    await expect(assertReceivableLocation(pool, randomUUID())).rejects.toThrow(/not found/)
    await expect(assertReceivableLocation(pool, warehouseId)).resolves.toBeUndefined()
    await expect(assertReceivableLocation(pool, siteId)).resolves.toBeUndefined()
    const transit = await pool.query<{ id: string }>(
      `INSERT INTO stock_locations (company_id, name, type, is_active) VALUES ($1,$2,'transit',true) RETURNING id`,
      [TEST_COMPANY_ID, `${TAG}Transit`],
    )
    await expect(assertReceivableLocation(pool, transit.rows[0]!.id)).rejects.toThrow(/transit location/)
    const temp = await pool.query<{ id: string }>(
      `INSERT INTO stock_locations (company_id, name, type, is_active) VALUES ($1,$2,'temporary',true) RETURNING id`,
      [TEST_COMPANY_ID, `${TAG}Temp`],
    )
    await expect(assertReceivableLocation(pool, temp.rows[0]!.id)).resolves.toBeUndefined()
  })
})

describe('recording a receipt', () => {
  it('refuses Virtual Consumption and writes nothing', async () => {
    const { poId, lineId } = await makePO()
    await expect(record(poId, lineId, virtualOutId)).rejects.toThrow(REFUSED)
    expect(await receiptsOf(poId)).toEqual([])
  })

  it('refuses Virtual Receipts too', async () => {
    const { poId, lineId } = await makePO()
    await expect(record(poId, lineId, virtualInId)).rejects.toThrow(REFUSED)
    expect(await receiptsOf(poId)).toEqual([])
  })

  it('refuses a location that does not exist', async () => {
    const { poId, lineId } = await makePO()
    await expect(record(poId, lineId, randomUUID())).rejects.toThrow(/not found/)
    expect(await receiptsOf(poId)).toEqual([])
  })

  it('accepts a warehouse and a site', async () => {
    for (const loc of [warehouseId, siteId]) {
      const { poId, lineId } = await makePO()
      const receipt = await record(poId, lineId, loc)
      const rows = await receiptsOf(poId)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ id: receipt.id, status: 'draft', warehouse_location_id: loc })
    }
  })

  it('still accepts a receipt with no location (the server picks a real one when it is confirmed)', async () => {
    const { poId, lineId } = await makePO()
    await record(poId, lineId)
    const rows = await receiptsOf(poId)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.warehouse_location_id).toBeNull()
  })
})

describe('confirming a receipt', () => {
  it('refuses a draft recorded before the rule that names a virtual location, and moves no stock', async () => {
    const { poId, lineId } = await makePO()
    const legacy = await pool.query<{ id: string }>(
      `INSERT INTO po_receipts (po_id, receipt_number, received_date, warehouse_location_id, received_by, status)
       VALUES ($1,$2,$3,$4,$5,'draft') RETURNING id`,
      [poId, `${TAG}R-${Date.now()}`, today(), virtualOutId, userId],
    )
    await pool.query(
      `INSERT INTO po_receipt_lines (receipt_id, po_line_id, qty_received) VALUES ($1,$2,10)`,
      [legacy.rows[0]!.id, lineId],
    )
    await withPhotos(poId, legacy.rows[0]!.id)

    await expect(confirm(legacy.rows[0]!.id)).rejects.toThrow(REFUSED)

    expect((await receiptsOf(poId))[0]!.status).toBe('draft')
    expect(await movesOf(lineId)).toEqual([])
    expect(await qtyReceived(lineId)).toBe(0)
  })

  it('puts stock received with no location into the warehouse', async () => {
    const { poId, lineId } = await makePO()
    const receipt = await record(poId, lineId)
    await withPhotos(poId, receipt.id)
    await confirm(receipt.id)
    expect((await movesOf(lineId)).map((m) => m.to_location_id)).toEqual([warehouseId])
    expect(await qtyReceived(lineId)).toBe(10)
  })

  // Switches off every REAL location of the test company except `keep` (the virtual ones stay on), runs `fn`, then switches them back on.
  async function withOnlyRealLocations(keep: string[], fn: () => Promise<void>): Promise<void> {
    const others = await pool.query<{ id: string }>(
      `SELECT id FROM stock_locations WHERE company_id=$1 AND is_active=true AND type NOT IN ('virtual_in','virtual_out') AND NOT (id = ANY($2::uuid[]))`,
      [TEST_COMPANY_ID, keep],
    )
    const ids = others.rows.map((r) => r.id)
    if (ids.length)
      await pool.query(`UPDATE stock_locations SET is_active=false WHERE id = ANY($1::uuid[])`, [
        ids,
      ])
    try {
      await fn()
    } finally {
      if (ids.length)
        await pool.query(`UPDATE stock_locations SET is_active=true WHERE id = ANY($1::uuid[])`, [
          ids,
        ])
    }
  }

  it('with no warehouse and no location chosen, falls back to the one real location and never to a virtual one', async () => {
    await withOnlyRealLocations([siteId], async () => {
      const { poId, lineId } = await makePO()
      const receipt = await record(poId, lineId)
      await withPhotos(poId, receipt.id)
      await confirm(receipt.id)
      const moves = await movesOf(lineId)
      expect(moves).toHaveLength(1)
      expect(moves[0]!.to_location_id).toBe(siteId)
    })
  })

  it('with no real location at all, refuses instead of using a virtual one', async () => {
    await withOnlyRealLocations([], async () => {
      const { poId, lineId } = await makePO()
      const receipt = await record(poId, lineId)
      await withPhotos(poId, receipt.id)
      await expect(confirm(receipt.id)).rejects.toThrow(/No active stock location is configured/)
      expect(await movesOf(lineId)).toEqual([])
      expect((await receiptsOf(poId))[0]!.status).toBe('draft')
    })
  })
})

describe('the admin correction of a receipt location', () => {
  async function confirmedReceipt(): Promise<{ poId: string; lineId: string; receiptId: string }> {
    const { poId, lineId } = await makePO()
    const receipt = await record(poId, lineId, warehouseId)
    await withPhotos(poId, receipt.id)
    await confirm(receipt.id)
    return { poId, lineId, receiptId: receipt.id }
  }
  const correct = (poId: string, receiptId: string, from: string, to: string) =>
    resolvers.Mutation.adminCorrectPO(
      null,
      {
        id: poId,
        reason: 'wrong receiving location',
        changes: JSON.stringify({
          receipts: { edited: [{ id: receiptId, field: 'warehouse_location_id', from, to }] },
        }),
      } as never,
      ctx as never,
    )

  it('cannot move a confirmed receipt into a virtual location, and leaves its stock where it is', async () => {
    const { poId, lineId, receiptId } = await confirmedReceipt()
    await expect(correct(poId, receiptId, warehouseId, virtualOutId)).rejects.toThrow(REFUSED)
    expect((await receiptsOf(poId))[0]!.warehouse_location_id).toBe(warehouseId)
    const live = (await movesOf(lineId)).filter((m) => m.superseded_at === null)
    expect(live.map((m) => m.to_location_id)).toEqual([warehouseId])
  })

  it('can still move it to another real location', async () => {
    const { poId, lineId, receiptId } = await confirmedReceipt()
    await correct(poId, receiptId, warehouseId, siteId)
    expect((await receiptsOf(poId))[0]!.warehouse_location_id).toBe(siteId)
    const live = (await movesOf(lineId)).filter((m) => m.superseded_at === null)
    expect(live.map((m) => m.to_location_id)).toEqual([siteId])
  })
})
