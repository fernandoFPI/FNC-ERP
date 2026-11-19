// Temporary stores and store transfers that spend time in transit (playbook #108, phase 2 of STORE_OUT_EQUIPMENT_PLAN.md).
//
// Before this, moving stock between two locations (createManualTransfer) was instant: nothing said "sent, not yet received", a short
// delivery left no trace, and bought goods could not wait in a temporary store with a destination. Now: a `temporary` location type, a
// final destination on a receipt into one, and a transfer that takes stock into the company's transit location when it is sent, puts what
// arrived into the To location when it is received, writes off what did not (with the reason), and can be cancelled while in transit.
//
// Real Postgres through the real resolvers, nothing mocked.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const COMPANY = '00000000-0000-0000-0000-000000000001'
const OTHER_COMPANY = 'f0000000-0000-0000-0000-000000000009'
const TAG = 'STRF-'
const USER_EMAIL = 'store-transfers-test@fnc-erp.local'

type Ctx = { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }
let userId: string
let ctx: Ctx
let otherCtx: Ctx
let mainId: string
let tempId: string
let siteId: string
let otherLocId: string
let virtualInId: string
let virtualOutId: string
let vendorId: string

const today = () => new Date().toISOString().slice(0, 10)

function must<T>(v: T | null | undefined): T {
  if (v === null || v === undefined) throw new Error('expected a value')
  return v
}

async function mkLoc(name: string, type: string, company = COMPANY): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO stock_locations (company_id, name, type, is_active) VALUES ($1,$2,$3,true) RETURNING id`,
    [company, `${TAG}${name}-${Date.now()}`, type],
  )
  return must(r.rows[0]).id
}
async function mkProduct(suffix = 'p'): Promise<string> {
  const sku = `${TAG}${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category, cost_currency) VALUES ($1,$2,$2,'EA','general','USD') RETURNING id`,
    [COMPANY, sku],
  )
  return must(r.rows[0]).id
}
async function stock(productId: string, locationId: string, qty: number, cost = 10): Promise<void> {
  await pool.query(
    `INSERT INTO stock_moves (company_id, product_id, from_location_id, to_location_id, moved_at, qty, unit_cost, total_cost, currency_code, source_type, moved_by)
     VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,'USD','po_receipt',$8)`,
    [COMPANY, productId, virtualInId, locationId, qty, cost, qty * cost, userId],
  )
}
async function qtyAt(productId: string, locationId: string): Promise<number> {
  const r = await pool.query<{ q: string }>(
    `SELECT qty_on_hand AS q FROM stock_balances WHERE product_id=$1 AND location_id=$2 AND lot_id IS NULL`,
    [productId, locationId],
  )
  return parseFloat(r.rows[0]?.q ?? '0')
}
const inTransit = async (productId: string): Promise<number> =>
  parseFloat(
    must(
      (
        await pool.query<{ q: string }>(
          `-- currency-safe: a quantity of units
          SELECT COALESCE(SUM(sb.qty_on_hand),0) AS q FROM stock_balances sb JOIN stock_locations sl ON sl.id = sb.location_id
            WHERE sb.product_id=$1 AND sl.company_id=$2 AND sl.type='transit'`,
          [productId, COMPANY],
        )
      ).rows[0],
    ).q,
  )
const consumed = async (productId: string): Promise<number> =>
  parseFloat(
    must(
      (
        await pool.query<{ q: string }>(
          `-- currency-safe: a quantity of units
          SELECT COALESCE(SUM(sb.qty_on_hand),0) AS q FROM stock_balances sb JOIN stock_locations sl ON sl.id = sb.location_id
            WHERE sb.product_id=$1 AND sl.company_id=$2 AND sl.type='virtual_out'`,
          [productId, COMPANY],
        )
      ).rows[0],
    ).q,
  )

interface Transfer {
  id: string
  transferNumber: string
  status: string
  fromLocationName: string
  toLocationName: string
  driverName: string | null
  daysInTransit: number | null
  receivedByName: string | null
  lines: { id: string; productId: string; qtySent: number; qtyReceived: number | null; remarks: string | null; receiveRemarks: string | null }[]
}
const send = (
  lines: { productId: string; qty: number; remarks?: string }[],
  over: Record<string, unknown> = {},
  as: Ctx = ctx,
  from = mainId,
  to = siteId,
) =>
  resolvers.Mutation.createStoreTransfer(
    null,
    { input: { fromLocationId: from, toLocationId: to, driverName: 'Saman Aziz', vehicleNo: 'ERB 45213', waybillNo: 'WB-1', lines, ...over } },
    as as never,
  ) as Promise<Transfer>
const receive = (t: Transfer, got: number[], remarks: (string | undefined)[] = [], as: Ctx = ctx) =>
  resolvers.Mutation.receiveStoreTransfer(
    null,
    {
      id: t.id,
      input: { receivedByName: 'Store 2', lines: t.lines.map((l, i) => ({ lineId: l.id, qtyReceived: got[i] ?? 0, ...(remarks[i] ? { remarks: remarks[i] } : {}) })) },
    },
    as as never,
  ) as Promise<Transfer>
const cancel = (t: Transfer, as: Ctx = ctx) => resolvers.Mutation.cancelStoreTransfer(null, { id: t.id }, as as never) as Promise<Transfer>
const list = async (status?: string, as: Ctx = ctx) =>
  (await resolvers.Query.storeTransfers(null, status ? { status } : {}, as as never)) as Transfer[]

async function cleanup(): Promise<void> {
  const pos = `SELECT id FROM purchase_orders WHERE po_number LIKE $1`
  const like = [`${TAG}%`]
  await pool.query(`DELETE FROM stock_transfers WHERE sent_by=$1`, [userId])
  await pool.query(`DELETE FROM document_attachments WHERE (entity_type='po_receipt' AND entity_id IN (SELECT id FROM po_receipts WHERE po_id IN (${pos}))) OR (entity_type='purchase_order' AND entity_id IN (${pos}))`, like)
  await pool.query(`DELETE FROM stock_moves WHERE po_line_id IN (SELECT id FROM po_lines WHERE po_id IN (${pos}))`, like)
  await pool.query(`DELETE FROM po_receipt_lines WHERE receipt_id IN (SELECT id FROM po_receipts WHERE po_id IN (${pos}))`, like)
  await pool.query(`DELETE FROM po_receipts WHERE po_id IN (${pos})`, like)
  await pool.query(`DELETE FROM po_approval_log WHERE po_id IN (${pos})`, like)
  await pool.query(`DELETE FROM po_lines WHERE po_id IN (${pos})`, like)
  await pool.query(`DELETE FROM purchase_orders WHERE po_number LIKE $1`, like)
  await pool.query(`DELETE FROM files WHERE company_id=$1 AND file_key LIKE $2`, [COMPANY, `${TAG}%`])
  await pool.query(`DELETE FROM product_cost_change_requests WHERE product_id IN (SELECT id FROM products WHERE sku LIKE $1)`, like)
  await pool.query(`DELETE FROM product_cost_history WHERE product_id IN (SELECT id FROM products WHERE sku LIKE $1)`, like)
  await pool.query(`DELETE FROM stock_moves WHERE product_id IN (SELECT id FROM products WHERE sku LIKE $1)`, like)
  await pool.query(`DELETE FROM stock_balances WHERE product_id IN (SELECT id FROM products WHERE sku LIKE $1)`, like)
  await pool.query(`DELETE FROM products WHERE sku LIKE $1`, like)
  await pool.query(`DELETE FROM vendors WHERE company_id=$1 AND name LIKE $2`, [COMPANY, `${TAG}%`])
  await pool.query(`DELETE FROM stock_locations WHERE name LIKE $1`, like)
}

beforeAll(async () => {
  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [USER_EMAIL],
  )
  userId = must(u.rows[0]).id
  ctx = { auth: { companyId: COMPANY, userId, role: 'system_admin', module: 'all', sessionId: 'store-transfers-test' } }
  otherCtx = { auth: { ...ctx.auth, companyId: OTHER_COMPANY } }
  await cleanup()
  const one = async (type: string): Promise<string> => {
    const r = await pool.query<{ id: string }>(`SELECT id FROM stock_locations WHERE company_id=$1 AND type=$2 AND is_active=true LIMIT 1`, [COMPANY, type])
    if (r.rows[0]) return r.rows[0].id
    return mkLoc(type, type)
  }
  virtualInId = await one('virtual_in')
  virtualOutId = await one('virtual_out')
  mainId = await mkLoc('Main', 'warehouse')
  tempId = await mkLoc('Temp', 'temporary')
  siteId = await mkLoc('Site', 'site')
  otherLocId = await mkLoc('Other', 'warehouse', OTHER_COMPANY)
  const v = await pool.query<{ id: string }>(`INSERT INTO vendors (company_id, name) VALUES ($1,$2) RETURNING id`, [COMPANY, `${TAG}Zagros Pipes`])
  vendorId = must(v.rows[0]).id
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email=$1`, [USER_EMAIL])
  await pool.end()
})

describe('sending a transfer', () => {
  it('takes the stock out of the From location into transit, carries its cost, and says it is in transit', async () => {
    const p = await mkProduct()
    await stock(p, mainId, 10, 25)
    const t = await send([{ productId: p, qty: 4, remarks: 'Fragile' }], { reference: 'MR-9' })
    expect(t.status).toBe('in_transit')
    expect(t.transferNumber).toBeTruthy()
    expect(t).toMatchObject({ fromLocationName: expect.stringContaining('Main'), toLocationName: expect.stringContaining('Site'), driverName: 'Saman Aziz', daysInTransit: 0 })
    expect(t.lines).toHaveLength(1)
    expect(t.lines[0]).toMatchObject({ qtySent: 4, qtyReceived: null, remarks: 'Fragile' })
    expect(await qtyAt(p, mainId)).toBe(6)
    expect(await inTransit(p)).toBe(4)
    expect(await qtyAt(p, siteId)).toBe(0)
    const cost = await pool.query<{ unit_cost: string; currency_code: string }>(`SELECT unit_cost::text, currency_code FROM stock_transfer_lines WHERE id=$1`, [t.lines[0]!.id])
    expect(parseFloat(must(cost.rows[0]).unit_cost)).toBe(25)
    expect(cost.rows[0]!.currency_code.trim()).toBe('USD')
  })

  it('refuses more than is available (what other documents reserved does not count), naming the numbers, and moves nothing', async () => {
    const p = await mkProduct()
    await stock(p, mainId, 10)
    await pool.query(`UPDATE stock_balances SET qty_reserved = 7 WHERE product_id=$1 AND location_id=$2`, [p, mainId])
    await expect(send([{ productId: p, qty: 5 }])).rejects.toThrow(/3 available \(10 on hand, 7 reserved\), 5 to send/)
    expect(await qtyAt(p, mainId)).toBe(10)
    expect(await inTransit(p)).toBe(0)
    const n = await pool.query(`SELECT 1 FROM stock_transfers WHERE sent_by=$1 AND from_location_id=$2 AND NOT EXISTS (SELECT 1 FROM stock_transfer_lines l WHERE l.transfer_id = stock_transfers.id)`, [userId, mainId])
    expect(n.rows).toHaveLength(0)
  })

  it('refuses a missing item list, a repeated item, a zero quantity, the same place twice, and a bad date', async () => {
    const p = await mkProduct()
    await stock(p, mainId, 5)
    await expect(send([])).rejects.toThrow(/at least one item/)
    await expect(send([{ productId: p, qty: 1 }, { productId: p, qty: 1 }])).rejects.toThrow(/only once/)
    await expect(send([{ productId: p, qty: 0 }])).rejects.toThrow(/greater than 0/)
    await expect(send([{ productId: p, qty: 1 }], {}, ctx, mainId, mainId)).rejects.toThrow(/two different locations/)
    await expect(send([{ productId: p, qty: 1 }], { transferDate: '2026-02-30' })).rejects.toThrow(/valid date/)
    expect(await qtyAt(p, mainId)).toBe(5)
  })

  it('only moves between real places of its own company: not a virtual location, not transit, not another company', async () => {
    const p = await mkProduct()
    await stock(p, mainId, 5)
    await expect(send([{ productId: p, qty: 1 }], {}, ctx, mainId, virtualOutId)).rejects.toThrow(/not a place stock can be sent/)
    await expect(send([{ productId: p, qty: 1 }], {}, ctx, virtualInId, siteId)).rejects.toThrow(/not a place stock can be sent/)
    await expect(send([{ productId: p, qty: 1 }], {}, ctx, mainId, otherLocId)).rejects.toThrow(/Location not found/)
    const inactive = await mkLoc('Inactive', 'site')
    await pool.query(`UPDATE stock_locations SET is_active=false WHERE id=$1`, [inactive])
    await expect(send([{ productId: p, qty: 1 }], {}, ctx, mainId, inactive)).rejects.toThrow(/is not active/)
    expect(await qtyAt(p, mainId)).toBe(5)
  })
})

describe('receiving a transfer', () => {
  it('puts everything that arrived into the To location, empties transit, and marks it received', async () => {
    const p = await mkProduct()
    await stock(p, mainId, 10)
    const t = await send([{ productId: p, qty: 6 }])
    const done = await receive(t, [6])
    expect(done.status).toBe('received')
    expect(done.receivedByName).toBe('Store 2')
    expect(done.lines[0]).toMatchObject({ qtySent: 6, qtyReceived: 6 })
    expect(await qtyAt(p, siteId)).toBe(6)
    expect(await inTransit(p)).toBe(0)
    expect(await qtyAt(p, mainId)).toBe(4)
  })

  it('writes a short quantity off with its reason, so every unit is still somewhere in the ledger', async () => {
    const p = await mkProduct()
    await stock(p, mainId, 10)
    const t = await send([{ productId: p, qty: 8 }])
    const done = await receive(t, [5], ['3 boxes crushed on the road'])
    expect(done.status).toBe('received_short')
    expect(done.lines[0]).toMatchObject({ qtySent: 8, qtyReceived: 5, receiveRemarks: '3 boxes crushed on the road' })
    expect(await qtyAt(p, siteId)).toBe(5)
    expect(await inTransit(p)).toBe(0)
    expect(await consumed(p)).toBe(3)
    const note = await pool.query<{ notes: string }>(`SELECT notes FROM stock_moves WHERE product_id=$1 AND to_location_id=$2 AND source_type='store_transfer'`, [p, virtualOutId])
    expect(must(note.rows[0]).notes).toMatch(/short on receipt: 3 boxes crushed/)
  })

  it('needs a reason for a short line, and refuses more than was sent, a missing line and a line of another transfer', async () => {
    const p = await mkProduct()
    const q = await mkProduct()
    await stock(p, mainId, 10)
    await stock(q, mainId, 10)
    const t = await send([{ productId: p, qty: 4 }, { productId: q, qty: 2 }])
    // the lines come back in a fixed order that is not the order they were typed in: find each by its item
    const at = (id: string) => t.lines.findIndex((l) => l.productId === id)
    const got = (pGot: number, qGot: number) => {
      const out: number[] = []
      out[at(p)] = pGot
      out[at(q)] = qGot
      return out
    }
    await expect(receive(t, got(3, 2))).rejects.toThrow(/Say what happened/)
    await expect(receive(t, got(5, 2))).rejects.toThrow(/between 0 and 4/)
    await expect(
      resolvers.Mutation.receiveStoreTransfer(null, { id: t.id, input: { lines: [{ lineId: must(t.lines[0]).id, qtyReceived: must(t.lines[0]).qtySent }] } }, ctx as never),
    ).rejects.toThrow(/every item/)
    const other = await send([{ productId: p, qty: 1 }])
    await expect(
      resolvers.Mutation.receiveStoreTransfer(
        null,
        { id: t.id, input: { lines: [{ lineId: must(other.lines[0]).id, qtyReceived: 1 }, ...t.lines.map((l) => ({ lineId: l.id, qtyReceived: l.qtySent }))] } },
        ctx as never,
      ),
    ).rejects.toThrow(/does not belong/)
    expect((await list('in_transit')).find((x) => x.id === t.id)).toBeDefined()
    expect(await inTransit(p)).toBe(5)
  })

  it('cannot be received twice, and another company cannot see or receive it', async () => {
    const p = await mkProduct()
    await stock(p, mainId, 5)
    const t = await send([{ productId: p, qty: 2 }])
    await expect(receive(t, [2], [], otherCtx)).rejects.toThrow(/Transfer not found/)
    expect((await list('all', otherCtx)).find((x) => x.id === t.id)).toBeUndefined()
    await receive(t, [2])
    await expect(receive(t, [2])).rejects.toThrow(/already received/)
    expect(await qtyAt(p, siteId)).toBe(2)
  })

  it('waits for the transfer lock and then sees what another receipt already did', async () => {
    const p = await mkProduct()
    await stock(p, mainId, 5)
    const t = await send([{ productId: p, qty: 2 }])
    const holder = await pool.connect()
    try {
      await holder.query('BEGIN')
      await holder.query(`SELECT 1 FROM stock_transfers WHERE id=$1 FOR UPDATE`, [t.id])
      let settled = false
      const attempt = receive(t, [2]).finally(() => {
        settled = true
      })
      let waiting = false
      for (let i = 0; i < 40 && !waiting && !settled; i++) {
        await new Promise((r) => setTimeout(r, 50))
        const w = await pool.query(`SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%FROM stock_transfers WHERE id=$1 AND company_id=$2 FOR UPDATE%'`)
        waiting = w.rows.length > 0
      }
      expect(waiting).toBe(true)
      await holder.query(`UPDATE stock_transfers SET status='received' WHERE id=$1`, [t.id])
      await holder.query('COMMIT')
      await expect(attempt).rejects.toThrow(/already received/)
    } finally {
      holder.release()
    }
    expect(await qtyAt(p, siteId)).toBe(0)
  })
})

describe('cancelling a transfer', () => {
  it('puts everything back where it came from while it is still in transit', async () => {
    const p = await mkProduct()
    await stock(p, mainId, 10)
    const t = await send([{ productId: p, qty: 7 }])
    const c = await cancel(t)
    expect(c.status).toBe('cancelled')
    expect(await qtyAt(p, mainId)).toBe(10)
    expect(await inTransit(p)).toBe(0)
    expect((await list('in_transit')).find((x) => x.id === t.id)).toBeUndefined()
    await expect(receive(t, [7])).rejects.toThrow(/already cancelled/)
  })

  it('refuses a transfer that was already received, and another company', async () => {
    const p = await mkProduct()
    await stock(p, mainId, 5)
    const t = await send([{ productId: p, qty: 2 }])
    await expect(cancel(t, otherCtx)).rejects.toThrow(/Transfer not found/)
    await receive(t, [2])
    await expect(cancel(t)).rejects.toThrow(/Only a transfer that is in transit/)
    expect(await qtyAt(p, siteId)).toBe(2)
  })
})

describe('the list of transfers', () => {
  it('filters by status and shows the newest first, with days in transit only while it is in transit', async () => {
    const p = await mkProduct()
    await stock(p, mainId, 20)
    const a = await send([{ productId: p, qty: 1 }])
    const b = await send([{ productId: p, qty: 1 }])
    await receive(b, [1])
    const open = await list('in_transit')
    expect(open.map((x) => x.id)).toContain(a.id)
    expect(open.map((x) => x.id)).not.toContain(b.id)
    const done = (await list('received')).find((x) => x.id === b.id)
    expect(done?.daysInTransit).toBeNull()
    const all = await list('all')
    expect(all.findIndex((x) => x.id === b.id)).toBeLessThan(all.findIndex((x) => x.id === a.id))
  })

  it('returns exactly one transfer when asked for it by id (Store History links to it), cancelled ones included, and nothing for another company or a bad id', async () => {
    const p = await mkProduct()
    await stock(p, mainId, 20)
    const a = await send([{ productId: p, qty: 1 }])
    const b = await send([{ productId: p, qty: 2 }])
    await cancel(b)
    const one = (await resolvers.Query.storeTransfers(null, { status: 'all', id: b.id }, ctx as never)) as Transfer[]
    expect(one.map((x) => x.id)).toEqual([b.id])
    expect(one[0]?.status).toBe('cancelled')
    expect(one[0]?.lines).toHaveLength(1)
    // a transfer of this company is invisible to another company's user, and a malformed id (it comes from a URL) is "none", not an error
    const foreign = (await resolvers.Query.storeTransfers(null, { status: 'all', id: a.id }, otherCtx as never)) as Transfer[]
    expect(foreign).toEqual([])
    const bad = (await resolvers.Query.storeTransfers(null, { status: 'all', id: "x' OR '1'='1" }, ctx as never)) as Transfer[]
    expect(bad).toEqual([])
  })
})

// ── goods received into a temporary store ───────────────────────────────────────────────────────────
async function makePO(): Promise<{ poId: string; lineId: string; productId: string; poNumber: string }> {
  const sku = `${TAG}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const product = await pool.query<{ id: string }>(`INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$2,'unit','general') RETURNING id`, [COMPANY, sku])
  const poNumber = `${TAG}PO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const po = await pool.query<{ id: string }>(
    `INSERT INTO purchase_orders (company_id, po_number, vendor_id, status, currency_code, purpose, created_by) VALUES ($1,$2,$3,'approved','USD','stock',$4) RETURNING id`,
    [COMPANY, poNumber, vendorId, userId],
  )
  const line = await pool.query<{ id: string }>(
    `INSERT INTO po_lines (po_id, product_id, description, line_number, qty_ordered, unit_price, total_price, uom, currency_code) VALUES ($1,$2,'test line',1,10,5,50,'unit','USD') RETURNING id`,
    [must(po.rows[0]).id, must(product.rows[0]).id],
  )
  return { poId: must(po.rows[0]).id, lineId: must(line.rows[0]).id, productId: must(product.rows[0]).id, poNumber }
}
const record = (poId: string, lineId: string, locationId?: string, finalDestination?: string) =>
  resolvers.Mutation.recordReceipt(
    null,
    {
      poId,
      input: {
        receipt_date: today(),
        ...(locationId ? { location_id: locationId } : {}),
        ...(finalDestination ? { final_destination_location_id: finalDestination } : {}),
        lines: [{ po_line_id: lineId, qty_received: 10, actual_unit_price: 5 }],
      },
    },
    ctx as never,
  ) as Promise<{ id: string }>
async function confirmWithPhotos(poId: string, receiptId: string): Promise<void> {
  for (const [type, id, cat] of [['po_receipt', receiptId, 'po_receipt_photo'], ['purchase_order', poId, 'po_receipt_document']] as const) {
    const f = await pool.query<{ id: string }>(
      `INSERT INTO files (company_id, uploaded_by, file_key, original_filename, mime_type, size_bytes, category, status) VALUES ($1,$2,$3,'r.jpg','image/jpeg',1024,$4,'uploaded') RETURNING id`,
      [COMPANY, userId, `${TAG}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, cat],
    )
    await pool.query(`INSERT INTO document_attachments (file_id, entity_type, entity_id, uploaded_by) VALUES ($1,$2,$3,$4)`, [must(f.rows[0]).id, type, id, userId])
  }
  await resolvers.Mutation.confirmReceipt(null, { id: receiptId }, ctx as never)
}

describe('receiving goods into a temporary store', () => {
  it('needs a final destination, which must be a different warehouse or site of the same company', async () => {
    const { poId, lineId } = await makePO()
    await expect(record(poId, lineId, tempId)).rejects.toThrow(/Choose the final destination/)
    await expect(record(poId, lineId, tempId, tempId)).rejects.toThrow(/different location/)
    await expect(record(poId, lineId, tempId, otherLocId)).rejects.toThrow(/Location not found/)
    const temp2 = await mkLoc('Temp2', 'temporary')
    await expect(record(poId, lineId, tempId, temp2)).rejects.toThrow(/not another temporary store/)
    await expect(record(poId, lineId, tempId, virtualOutId)).rejects.toThrow(/not a place stock can be sent/)
    const r = await pool.query(`SELECT 1 FROM po_receipts WHERE po_id=$1`, [poId])
    expect(r.rows).toHaveLength(0)
  })

  it('refuses a final destination for a receipt into any other kind of location, and the transit location as a receiving place', async () => {
    const { poId, lineId } = await makePO()
    await expect(record(poId, lineId, mainId, siteId)).rejects.toThrow(/only applies to goods received into a temporary store/)
    const transit = await mkLoc('Tr', 'transit')
    await expect(record(poId, lineId, transit)).rejects.toThrow(/transit location/)
  })

  it('stores the destination, and the goods then wait in the store with the PO, the supplier, the destination and their age', async () => {
    const { poId, lineId, productId, poNumber } = await makePO()
    const rec = await record(poId, lineId, tempId, siteId)
    const stored = await pool.query<{ final_destination_location_id: string }>(`SELECT final_destination_location_id FROM po_receipts WHERE id=$1`, [rec.id])
    expect(must(stored.rows[0]).final_destination_location_id).toBe(siteId)
    await confirmWithPhotos(poId, rec.id)

    const rows = (await resolvers.Query.tempStoreItems(null, {}, ctx as never)) as {
      productId: string
      qty: number
      locationName: string
      daysWaiting: number
      late: boolean
      poNumbers: string | null
      suppliers: string | null
      destinationName: string | null
      destinationLocationId: string | null
    }[]
    const mine = rows.find((r) => r.productId === productId)
    expect(mine).toMatchObject({ qty: 10, daysWaiting: 0, late: false, poNumbers: poNumber, suppliers: `${TAG}Zagros Pipes`, destinationLocationId: siteId })
    expect(mine?.locationName).toContain('Temp')
    expect(mine?.destinationName).toContain('Site')
  })

  it('flags goods that have waited more than 7 days, counting from the oldest arrival still on the shelf, and the summary agrees with the list', async () => {
    const { poId, lineId, productId } = await makePO()
    const rec = await record(poId, lineId, tempId, siteId)
    await confirmWithPhotos(poId, rec.id)
    await pool.query(`UPDATE stock_moves SET moved_at = NOW() - interval '10 days' WHERE product_id=$1 AND source_type='po_receipt'`, [productId])
    // a later top-up of the same item does not hide the pallet that has waited ten days
    await stock(productId, tempId, 3)
    const rows = (await resolvers.Query.tempStoreItems(null, {}, ctx as never)) as { productId: string; qty: number; daysWaiting: number; late: boolean }[]
    const mine = must(rows.find((r) => r.productId === productId))
    expect(mine).toMatchObject({ qty: 13, daysWaiting: 10, late: true })
    const summary = (await resolvers.Query.tempStoreSummary(null, {}, ctx as never)) as { itemsWaiting: number; waitingTooLong: number; inTransit: number; oldestDays: number }
    expect(summary.itemsWaiting).toBe(rows.length)
    expect(summary.waitingTooLong).toBe(rows.filter((r) => r.late).length)
    expect(summary.oldestDays).toBe(Math.max(...rows.map((r) => r.daysWaiting)))
    const open = (await list('in_transit')).length
    expect(summary.inTransit).toBe(open)
  })

  it('does not count a pallet that was already sent on: age is the age of what is still there', async () => {
    const { poId, lineId, productId } = await makePO()
    const rec = await record(poId, lineId, tempId, siteId)
    await confirmWithPhotos(poId, rec.id)
    await pool.query(`UPDATE stock_moves SET moved_at = NOW() - interval '10 days' WHERE product_id=$1 AND source_type='po_receipt'`, [productId])
    const t = await send([{ productId, qty: 10 }], {}, ctx, tempId, siteId)
    await receive(t, [10])
    await stock(productId, tempId, 3)
    const rows = (await resolvers.Query.tempStoreItems(null, {}, ctx as never)) as { productId: string; qty: number; daysWaiting: number; late: boolean }[]
    expect(rows.find((r) => r.productId === productId)).toMatchObject({ qty: 3, daysWaiting: 0, late: false })
  })

  it('leaves the store once it is sent on, and shows nothing to another company', async () => {
    const { poId, lineId, productId } = await makePO()
    const rec = await record(poId, lineId, tempId, siteId)
    await confirmWithPhotos(poId, rec.id)
    const before = (await resolvers.Query.tempStoreItems(null, {}, ctx as never)) as { productId: string }[]
    expect(before.some((r) => r.productId === productId)).toBe(true)
    expect(((await resolvers.Query.tempStoreItems(null, {}, otherCtx as never)) as { productId: string }[]).some((r) => r.productId === productId)).toBe(false)
    const t = await send([{ productId, qty: 10 }], {}, ctx, tempId, siteId)
    const after = (await resolvers.Query.tempStoreItems(null, {}, ctx as never)) as { productId: string }[]
    expect(after.some((r) => r.productId === productId)).toBe(false)
    await receive(t, [10])
    expect(await qtyAt(productId, siteId)).toBe(10)
  })
})
