// One history of Store In, Store Out, store transfers and equipment returns (playbook #109, phase 3 of STORE_OUT_EQUIPMENT_PLAN.md).
// Real Postgres through the real resolvers: the four kinds of document are made by the real mutations, then read back together.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const COMPANY = '00000000-0000-0000-0000-000000000001'
const OTHER_COMPANY = 'f0000000-0000-0000-0000-000000000009'
const TAG = 'SDOC-'
const USER_EMAIL = 'store-documents-test@fnc-erp.local'

type Ctx = { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }
let userId: string
let ctx: Ctx
let otherCtx: Ctx
let mainId: string
let tempId: string
let siteId: string
let virtualInId: string
let vendorId: string
let productId: string
let equipmentId: string

interface Doc {
  id: string
  docType: string
  number: string
  date: string
  storeId: string | null
  storeName: string | null
  party: string | null
  reference: string | null
  lineCount: number
  status: string
}
const today = () => new Date().toISOString().slice(0, 10)
function must<T>(v: T | null | undefined): T {
  if (v === null || v === undefined) throw new Error('expected a value')
  return v
}
async function mkLoc(name: string, type: string, company = COMPANY): Promise<string> {
  const r = await pool.query<{ id: string }>(`INSERT INTO stock_locations (company_id, name, type, is_active) VALUES ($1,$2,$3,true) RETURNING id`, [company, `${TAG}${name}-${Date.now()}`, type])
  return must(r.rows[0]).id
}
async function mkProduct(suffix: string, returnable = false): Promise<string> {
  const sku = `${TAG}${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(`INSERT INTO products (company_id, sku, name, uom, category, is_returnable) VALUES ($1,$2,$2,'EA','general',$3) RETURNING id`, [COMPANY, sku, returnable])
  return must(r.rows[0]).id
}
async function stock(product: string, loc: string, qty: number): Promise<void> {
  await pool.query(
    `INSERT INTO stock_moves (company_id, product_id, from_location_id, to_location_id, moved_at, qty, unit_cost, total_cost, currency_code, source_type, moved_by)
     VALUES ($1,$2,$3,$4,NOW(),$5,10,$6,'USD','po_receipt',$7)`,
    [COMPANY, product, virtualInId, loc, qty, qty * 10, userId],
  )
}
const docs = async (args: { type?: string; locationId?: string; search?: string } = {}, as: Ctx = ctx): Promise<Doc[]> =>
  (await resolvers.Query.storeDocuments(null, args, as as never)) as Doc[]
const mine = async (args: { type?: string; locationId?: string; search?: string } = {}, as: Ctx = ctx): Promise<Doc[]> =>
  (await docs(args, as)).filter((d) => d.number.startsWith('SDOC') || (d.party ?? '').includes(TAG) || (d.reference ?? '').includes(TAG) || ids.has(d.id))
const ids = new Set<string>()

let storeInId: string
let storeInNumber: string
let storeOutId: string
let storeOutNumber: string
let transferId: string
let transferNumber: string
let returnNumber: string

async function cleanup(): Promise<void> {
  const pos = `SELECT id FROM purchase_orders WHERE po_number LIKE $1`
  const like = [`${TAG}%`]
  const myIssues = `SELECT id FROM project_material_issues WHERE created_by=$1`
  await pool.query(`DELETE FROM store_out_return_lines WHERE return_id IN (SELECT id FROM store_out_returns WHERE created_by=$1)`, [userId])
  await pool.query(`DELETE FROM store_out_returns WHERE created_by=$1`, [userId])
  await pool.query(`DELETE FROM stock_transfers WHERE sent_by=$1`, [userId])
  await pool.query(`DELETE FROM project_material_issue_lines WHERE issue_id IN (${myIssues})`, [userId])
  await pool.query(`DELETE FROM project_material_issues WHERE created_by=$1`, [userId])
  await pool.query(`DELETE FROM document_attachments WHERE (entity_type='po_receipt' AND entity_id IN (SELECT id FROM po_receipts WHERE po_id IN (${pos}))) OR (entity_type='purchase_order' AND entity_id IN (${pos}))`, like)
  await pool.query(`DELETE FROM stock_moves WHERE po_line_id IN (SELECT id FROM po_lines WHERE po_id IN (${pos}))`, like)
  await pool.query(`DELETE FROM po_receipt_lines WHERE receipt_id IN (SELECT id FROM po_receipts WHERE po_id IN (${pos}))`, like)
  await pool.query(`DELETE FROM po_receipts WHERE po_id IN (${pos})`, like)
  await pool.query(`DELETE FROM po_approval_log WHERE po_id IN (${pos})`, like)
  await pool.query(`DELETE FROM po_lines WHERE po_id IN (${pos})`, like)
  await pool.query(`DELETE FROM purchase_orders WHERE po_number LIKE $1`, like)
  await pool.query(`DELETE FROM stock_moves WHERE product_id IN (SELECT id FROM products WHERE sku LIKE $1)`, like)
  await pool.query(`DELETE FROM stock_balances WHERE product_id IN (SELECT id FROM products WHERE sku LIKE $1)`, like)
  await pool.query(`DELETE FROM product_cost_change_requests WHERE product_id IN (SELECT id FROM products WHERE sku LIKE $1)`, like)
  await pool.query(`DELETE FROM product_cost_history WHERE product_id IN (SELECT id FROM products WHERE sku LIKE $1)`, like)
  await pool.query(`DELETE FROM products WHERE sku LIKE $1`, like)
  await pool.query(`DELETE FROM vendors WHERE company_id=$1 AND name LIKE $2`, [COMPANY, `${TAG}%`])
  await pool.query(`DELETE FROM stock_locations WHERE name LIKE $1`, like)
}

beforeAll(async () => {
  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used') ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [USER_EMAIL],
  )
  userId = must(u.rows[0]).id
  ctx = { auth: { companyId: COMPANY, userId, role: 'system_admin', module: 'all', sessionId: 'store-documents-test' } }
  otherCtx = { auth: { ...ctx.auth, companyId: OTHER_COMPANY } }
  await cleanup()
  const vin = await pool.query<{ id: string }>(`SELECT id FROM stock_locations WHERE company_id=$1 AND type='virtual_in' AND is_active=true LIMIT 1`, [COMPANY])
  virtualInId = vin.rows[0] ? vin.rows[0].id : await mkLoc('VIn', 'virtual_in')
  mainId = await mkLoc('Main', 'warehouse')
  tempId = await mkLoc('Temp', 'temporary')
  siteId = await mkLoc('Site', 'site')
  vendorId = must((await pool.query<{ id: string }>(`INSERT INTO vendors (company_id, name) VALUES ($1,$2) RETURNING id`, [COMPANY, `${TAG}Zagros Pipes`])).rows[0]).id
  productId = await mkProduct('item')
  equipmentId = await mkProduct('eq', true)
  await stock(productId, mainId, 50)
  await stock(equipmentId, mainId, 5)

  // Store In: a receipt of a PO line into the temporary store, going on to the site
  const poNumber = `${TAG}PO-${Date.now()}`
  const po = await pool.query<{ id: string }>(
    `INSERT INTO purchase_orders (company_id, po_number, vendor_id, status, currency_code, purpose, created_by) VALUES ($1,$2,$3,'approved','USD','stock',$4) RETURNING id`,
    [COMPANY, poNumber, vendorId, userId],
  )
  const poId = must(po.rows[0]).id
  const line = await pool.query<{ id: string }>(
    `INSERT INTO po_lines (po_id, product_id, description, line_number, qty_ordered, unit_price, total_price, uom, currency_code) VALUES ($1,$2,'x',1,10,5,50,'unit','USD') RETURNING id`,
    [poId, productId],
  )
  const rec = (await resolvers.Mutation.recordReceipt(
    null,
    { poId, input: { receipt_date: today(), location_id: tempId, final_destination_location_id: siteId, lines: [{ po_line_id: must(line.rows[0]).id, qty_received: 10, actual_unit_price: 5 }] } },
    ctx as never,
  )) as { id: string; receipt_number: string }
  storeInId = rec.id
  storeInNumber = rec.receipt_number

  // Store Out: a manual one issued to a person, two lines
  const so = (await resolvers.Mutation.createMaterialIssue(null, { issueDate: today(), issuedToName: `${TAG}Ahmed Ali` }, ctx as never)) as { id: string; issueNumber: string }
  for (const [p, qty] of [[productId, 2], [equipmentId, 1]] as const)
    await resolvers.Mutation.addMaterialIssueLine(null, { issueId: so.id, productId: p, qtyIssued: qty, unitCost: 10, fromLocationId: mainId }, ctx as never)
  await resolvers.Mutation.issueMaterialIssue(null, { id: so.id }, ctx as never)
  storeOutId = so.id
  storeOutNumber = so.issueNumber

  // Transfer: main to site, one line
  const tr = (await resolvers.Mutation.createStoreTransfer(
    null,
    { input: { fromLocationId: mainId, toLocationId: siteId, reference: `${TAG}MR-7`, lines: [{ productId, qty: 4 }] } },
    ctx as never,
  )) as { id: string; transferNumber: string }
  transferId = tr.id
  transferNumber = tr.transferNumber

  // Return: the equipment goes back to the warehouse
  const line1 = await pool.query<{ id: string }>(`SELECT id FROM project_material_issue_lines WHERE issue_id=$1 AND is_returnable`, [so.id])
  const ret = (await resolvers.Mutation.createEquipmentReturn(
    null,
    { input: { receivedByName: `${TAG}Store keeper`, lines: [{ issueLineId: must(line1.rows[0]).id, qtyReturned: 1, condition: 'good', toLocationId: mainId }] } },
    ctx as never,
  )) as { id: string; returnNumber: string }
  returnNumber = ret.returnNumber
  for (const id of [storeInId, storeOutId, transferId, ret.id]) ids.add(id)
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email=$1`, [USER_EMAIL])
  await pool.end()
})

describe('the store document history', () => {
  it('lists a Store In, a Store Out, a transfer and a return together, each with its own store, party, reference, lines and status', async () => {
    const all = await mine()
    const by = (n: string) => must(all.find((d) => d.number === n))
    expect(by(storeInNumber)).toMatchObject({ docType: 'store_in', storeName: expect.stringContaining('Temp'), party: `${TAG}Zagros Pipes`, lineCount: 1, status: 'draft', date: today() })
    expect(by(storeInNumber).reference).toMatch(new RegExp(`^${TAG}PO-`))
    expect(by(storeOutNumber)).toMatchObject({ docType: 'store_out', storeName: expect.stringContaining('Main'), party: `${TAG}Ahmed Ali`, lineCount: 2, status: 'issued' })
    expect(by(transferNumber)).toMatchObject({ docType: 'transfer', storeName: expect.stringContaining('Main'), party: expect.stringContaining('Site'), reference: `${TAG}MR-7`, lineCount: 1, status: 'in_transit' })
    expect(by(returnNumber)).toMatchObject({ docType: 'return', storeName: expect.stringContaining('Main'), party: `${TAG}Store keeper`, lineCount: 1, status: 'done' })
  })

  it('filters by kind, and refuses a kind that does not exist', async () => {
    for (const [type, number] of [['store_in', storeInNumber], ['store_out', storeOutNumber], ['transfer', transferNumber], ['return', returnNumber]] as const) {
      const rows = await mine({ type })
      expect(rows.every((d) => d.docType === type)).toBe(true)
      expect(rows.map((d) => d.number)).toContain(number)
    }
    await expect(docs({ type: 'invoice' })).rejects.toThrow(/type must be/)
  })

  it('filters by store: any store the document touched, so a transfer is found at both ends and a receipt at its destination too', async () => {
    const atMain = (await docs({ locationId: mainId })).map((d) => d.number)
    expect(atMain).toEqual(expect.arrayContaining([storeOutNumber, transferNumber, returnNumber]))
    expect(atMain).not.toContain(storeInNumber)
    const atSite = (await docs({ locationId: siteId })).map((d) => d.number)
    expect(atSite).toContain(transferNumber) // the To end
    expect(atSite).toContain(storeInNumber) // the receipt's final destination
    expect(atSite).not.toContain(storeOutNumber)
    const atTemp = (await docs({ locationId: tempId })).map((d) => d.number)
    expect(atTemp).toEqual([storeInNumber])
  })

  it('searches the number, the party and the reference, and treats a wildcard typed in the box as text', async () => {
    expect((await docs({ search: transferNumber.toLowerCase() })).map((d) => d.number)).toEqual([transferNumber])
    expect((await docs({ search: `${TAG}Ahmed` })).map((d) => d.number)).toEqual([storeOutNumber])
    expect((await docs({ search: `${TAG}MR-7` })).map((d) => d.number)).toEqual([transferNumber])
    expect(await docs({ search: '%' })).toEqual([])
    expect(await docs({ search: '_' })).toEqual([])
  })

  it('shows a cancelled transfer and a cancelled Store Out too, as what they are', async () => {
    const p = await mkProduct('cancel')
    await stock(p, mainId, 5)
    const t = (await resolvers.Mutation.createStoreTransfer(null, { input: { fromLocationId: mainId, toLocationId: siteId, lines: [{ productId: p, qty: 1 }] } }, ctx as never)) as { id: string; transferNumber: string }
    await resolvers.Mutation.cancelStoreTransfer(null, { id: t.id }, ctx as never)
    const draft = (await resolvers.Mutation.createMaterialIssue(null, { issueDate: today() }, ctx as never)) as { id: string; issueNumber: string }
    await resolvers.Mutation.cancelMaterialIssue(null, { id: draft.id }, ctx as never)
    const all = await docs({ search: undefined })
    expect(all.find((d) => d.id === t.id)?.status).toBe('cancelled')
    expect(all.find((d) => d.id === draft.id)).toMatchObject({ docType: 'store_out', status: 'cancelled', lineCount: 0 })
  })

  it('is newest first: a transfer dated days ago comes after the documents of today', async () => {
    await pool.query(`UPDATE stock_transfers SET transfer_date = CURRENT_DATE - 5 WHERE id=$1`, [transferId])
    const all = await docs()
    for (let i = 1; i < all.length; i++) expect(must(all[i - 1]).date >= must(all[i]).date).toBe(true)
    const numbers = all.map((d) => d.number)
    expect(numbers.indexOf(transferNumber)).toBeGreaterThan(numbers.indexOf(storeOutNumber))
    expect(must(all.find((d) => d.number === transferNumber)).date).not.toBe(today())
  })

  it("shows another company nothing of this company's documents", async () => {
    const theirs = (await docs({}, otherCtx)).map((d) => d.id)
    for (const id of ids) expect(theirs).not.toContain(id)
    expect((await docs({ locationId: mainId }, otherCtx)).map((d) => d.id)).toEqual([])
  })
})
