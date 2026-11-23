// The organizer review, add and remove lines (migration 330, playbook #116). In the organizer's review he can add an item that was
// bought and forgotten (the line and its purchase together, with the receipt) and remove a line with a reason. Either one is a
// change a PO Admin has to approve before any purchase order exists, and neither goes through the admin edit-request path.
//
// Real Postgres, real mutations, and the real schema for the query that runs through ApolloServer; nothing mocked. One user per
// role: the organizer (a plain user), a buyer, a PO Admin (a plain user holding the po_admin position), a stranger, an admin and an
// admin of another company. The flow is driven through direct supply (draft > approval > Items Bought), the shortest way to a
// requisition at Items Bought.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { pool } from '@fnc-erp/db'
import { typeDefs } from '../src/graphql/schema.js'
import { resolvers } from '../src/graphql/resolvers.js'

const COMPANY_ID = 'f0000000-0000-0000-0000-000000000009'
const OTHER_COMPANY_ID = 'f0000000-0000-0000-0000-000000000010'
const EMAIL_PREFIX = 'org-review-ar-test-'
const CODE_PREFIX = 'ORVARTEST-'
const VENDOR_PREFIX = 'ORVARTEST-VENDOR-'
const FILE_PREFIX = 'orvartest/'
const EMP_PREFIX = 'ORVARTEST-EMP-'
const SKU_PREFIX = 'ORVARTEST-SKU-'
const LOC_PREFIX = 'ORVARTEST-LOC-'

type Who = 'organizer' | 'buyer' | 'poadmin' | 'stranger' | 'admin' | 'foreignadmin'
const WHO: Who[] = ['organizer', 'buyer', 'poadmin', 'stranger', 'admin', 'foreignadmin']
const userIds = {} as Record<Who, string>
let projectId: string
let vendorA: string
let vendorB: string
let foreignVendor: string

type TestCtx = {
  auth: { companyId: string; userId: string; role: string; module: string; sessionId: string }
}
const ADMINS: Who[] = ['admin', 'foreignadmin']
const ctxFor = (who: Who, role?: string, companyId = COMPANY_ID): TestCtx => ({
  auth: {
    companyId,
    userId: userIds[who],
    role: role ?? (ADMINS.includes(who) ? 'system_admin' : 'user'),
    module: 'all',
    sessionId: 'orvar-test',
  },
})
// A plain user cannot create a requisition or record a purchase in this fixture: act as an administrator WITH that user's id.
const asAdmin = (who: Who): TestCtx => ctxFor(who, 'system_admin')
const foreign = (): TestCtx => ctxFor('foreignadmin', 'system_admin', OTHER_COMPANY_ID)

const server = new ApolloServer<TestCtx>({ typeDefs, resolvers })

type Mut = Record<string, (...a: unknown[]) => Promise<unknown>>
const M = resolvers.Mutation as unknown as Mut

async function makeFile(companyId = COMPANY_ID, owner: Who = 'admin'): Promise<string> {
  const f = await pool.query<{ id: string }>(
    `INSERT INTO files (company_id, uploaded_by, file_key, original_filename, mime_type, size_bytes, category, status)
     VALUES ($1,$2,$3,'receipt.jpg','image/jpeg',1024,'attachment','uploaded') RETURNING id`,
    [companyId, userIds[owner], `${FILE_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`],
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
    await pool.query<{ id: string; vendor_id: string }>(
      `SELECT id, vendor_id FROM purchase_orders WHERE requisition_id=$1 ORDER BY created_at`,
      [reqId],
    )
  ).rows
}
async function childLineDescriptions(reqId: string): Promise<string[]> {
  return (
    await pool.query<{ description: string }>(
      `SELECT description FROM po_lines WHERE po_id IN (SELECT id FROM purchase_orders WHERE requisition_id=$1) ORDER BY description`,
      [reqId],
    )
  ).rows.map((r) => r.description)
}
async function approvedTotals(reqId: string) {
  return (
    await pool.query<{ currency_code: string; subtotal: string; line_count: number }>(
      `SELECT currency_code, subtotal, line_count FROM requisition_approved_totals WHERE requisition_id=$1 ORDER BY currency_code`,
      [reqId],
    )
  ).rows
}
async function removedRows(reqId: string) {
  return (
    await pool.query<{ description: string; reason: string; purchases: { vendor: string; qty: string; price: string; currency: string; had_receipt: boolean }[] }>(
      `SELECT description, reason, purchases FROM requisition_review_removed_lines WHERE requisition_id=$1 ORDER BY removed_at, id`,
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
// line 1 from vendor A, line 2 from vendor B, by the buyer. The last purchase takes it to the review.
async function reachReview(by: Who = 'buyer', currencies: [string, string] = ['USD', 'USD']): Promise<Bought> {
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
          requested_currency_code: currencies[n - 1],
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
          currencyCode: currencies[i]!,
          receiptFileId: await makeFile(),
        },
      },
      asAdmin(by),
    )) as { id: string }
    purchases.push(p.id)
  }
  expect(await statusOf(created.id)).toBe('organizer_review')
  return { reqId: created.id, lines, purchases }
}

const addInput = (reqId: string, over: Record<string, unknown> = {}) => ({
  requisitionId: reqId,
  description: 'Forgotten bolts',
  qty: 4,
  uom: 'box',
  vendorId: vendorA,
  actualUnitPrice: 7.25,
  currencyCode: 'USD',
  receiptFileId: undefined as unknown as string,
  ...over,
})
async function add(reqId: string, who: Who = 'organizer', over: Record<string, unknown> = {}) {
  const input = addInput(reqId, over)
  if (input.receiptFileId === undefined) input.receiptFileId = await makeFile()
  return M.addReviewLine(null, { input }, ctxFor(who))
}
const remove = (reqId: string, lineId: string, reason = 'Not needed any more', who: Who = 'organizer') =>
  M.removeReviewLine(null, { requisitionId: reqId, lineId, reason }, ctxFor(who))
const confirm = (reqId: string, who: Who = 'organizer') => M.confirmReview(null, { requisitionId: reqId }, ctxFor(who))
const submit = (reqId: string, who: Who = 'organizer') => M.submitReviewForApproval(null, { requisitionId: reqId }, ctxFor(who))
const approveR = (reqId: string, who: Who = 'poadmin') => M.approveReview(null, { requisitionId: reqId }, ctxFor(who))
const rejectR = (reqId: string, reason: string, who: Who = 'poadmin') =>
  M.rejectReview(null, { requisitionId: reqId, reason }, ctxFor(who))
const sendBack = (reqId: string, reason: string, who: Who = 'organizer') =>
  M.sendBackToBuying(null, { requisitionId: reqId, reason, purchaseIds: [] }, ctxFor(who))

async function reviewOf(reqId: string, who: Who = 'organizer') {
  const res = await server.executeOperation(
    {
      query: `query($id: ID!) { requisition(id: $id) {
        id status
        review { needs_approval approval_reason added_count removed_count edited_count organizer_bought_count
                 removed_lines { id line_number description qty_ordered uom currency_code unit_price reason removed_by_name removed_at
                                 purchases { vendor qty price currency had_receipt bought_by } }
                 totals { currency_code was now purchases } }
        lines { id description review_added_at purchases { id } }
      } }`,
      variables: { id: reqId },
    },
    { contextValue: asAdmin(who) },
  )
  expect(res.body.kind).toBe('single')
  if (res.body.kind !== 'single') throw new Error('not single')
  expect(res.body.singleResult.errors).toBeUndefined()
  return (
    res.body.singleResult.data as {
      requisition: {
        status: string
        review: {
          needs_approval: boolean
          approval_reason: string | null
          added_count: number
          removed_count: number
          removed_lines: {
            id: string
            description: string
            reason: string
            removed_by_name: string | null
            purchases: { vendor: string; qty: string; price: string; currency: string; had_receipt: boolean; bought_by: string | null }[]
          }[]
          totals: { currency_code: string; was: string; now: string; purchases: number }[]
        } | null
        lines: { id: string; description: string; review_added_at: string | null; purchases: { id: string }[] }[]
      }
    }
  ).requisition
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
  await pool.query(`DELETE FROM project_material_issues WHERE requisition_id IN (${reqs})`, params)
  await pool.query(`DELETE FROM po_edit_requests WHERE requisition_id IN (${reqs})`, params)
  await pool.query(`DELETE FROM requisition_approved_totals WHERE requisition_id IN (${reqs})`, params)
  await pool.query(`DELETE FROM requisition_review_removed_lines WHERE requisition_id IN (${reqs})`, params)
  await pool.query(`DELETE FROM requisition_approval_log WHERE requisition_id IN (${reqs})`, params)
  await pool.query(`DELETE FROM po_lines WHERE po_id IN (SELECT id FROM purchase_orders WHERE requisition_id IN (${reqs}))`, params)
  await pool.query(`DELETE FROM purchase_orders WHERE requisition_id IN (${reqs})`, params)
  // split lines point at their origin line, so they go first
  await pool.query(`DELETE FROM po_lines WHERE requisition_id IN (${reqs}) AND origin_line_id IS NOT NULL`, params)
  await pool.query(`DELETE FROM po_lines WHERE requisition_id IN (${reqs})`, params)
  await pool.query(`DELETE FROM requisitions WHERE company_id=$1 AND organizer_id IN (SELECT id FROM users WHERE email LIKE $2)`, params)
  await pool.query(`DELETE FROM stock_balances WHERE product_id IN (SELECT id FROM products WHERE sku LIKE $1)`, [`${SKU_PREFIX}%`])
  await pool.query(`DELETE FROM stock_locations WHERE company_id=$1 AND name LIKE $2`, [COMPANY_ID, `${LOC_PREFIX}%`])
  await pool.query(`DELETE FROM products WHERE sku LIKE $1`, [`${SKU_PREFIX}%`])
  await pool.query(`DELETE FROM projects WHERE code LIKE $1`, [`${CODE_PREFIX}%`])
  await pool.query(`DELETE FROM vendors WHERE name LIKE $1`, [`${VENDOR_PREFIX}%`])
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
      `INSERT INTO projects (company_id, code, name, status, created_by) VALUES ($1,$2,'Add/remove test project','approved',$3) RETURNING id`,
      [COMPANY_ID, `${CODE_PREFIX}A`, userIds.admin],
    )
  ).rows[0]!.id
  const vendor = async (n: string, company = COMPANY_ID) =>
    (
      await pool.query<{ id: string }>(`INSERT INTO vendors (company_id, name) VALUES ($1,$2) RETURNING id`, [
        company,
        `${VENDOR_PREFIX}${n}-${Date.now()}`,
      ])
    ).rows[0]!.id
  vendorA = await vendor('A')
  vendorB = await vendor('B')
  foreignVendor = await vendor('FOREIGN', OTHER_COMPANY_ID)
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`])
  await pool.end()
})

describe('adding an item that was bought and forgotten', () => {
  it('creates the line and its purchase together, as an addition that needs a PO Admin', async () => {
    const b = await reachReview()
    await add(b.reqId)
    const lines = await lineIds(b.reqId)
    expect(lines).toHaveLength(3)
    const row = (
      await pool.query<{
        description: string
        qty_ordered: string
        unit_price: string
        approved_unit_price: string
        total_price: string
        currency_code: string
        requested_currency_code: string
        uom: string
        line_number: number
        review_added_at: string | null
        review_added_by: string | null
        qty_from_stock: string
        po_id: string | null
      }>(`SELECT * FROM po_lines WHERE id=$1`, [lines[2]])
    ).rows[0]!
    expect(row.description).toBe('Forgotten bolts')
    expect(Number(row.qty_ordered)).toBe(4)
    expect(Number(row.unit_price)).toBeCloseTo(7.25, 4)
    // the price paid is the approved price, so the new line is not flagged over tolerance against nothing
    expect(Number(row.approved_unit_price)).toBeCloseTo(7.25, 4)
    expect(Number(row.total_price)).toBeCloseTo(29, 4)
    expect(row.currency_code).toBe('USD')
    expect(row.requested_currency_code).toBe('USD')
    expect(row.uom).toBe('box')
    expect(row.line_number).toBe(3)
    expect(row.review_added_at).not.toBeNull()
    expect(row.review_added_by).toBe(userIds.organizer)
    expect(Number(row.qty_from_stock)).toBe(0)
    expect(row.po_id).toBeNull()

    const purchase = (
      await pool.query<{
        vendor_id: string
        qty: string
        actual_unit_price: string
        currency_code: string
        bought_by: string
        over_tolerance: boolean
        receipt_attachment_id: string | null
      }>(`SELECT * FROM po_line_purchases WHERE po_line_id=$1`, [lines[2]])
    ).rows
    expect(purchase).toHaveLength(1)
    expect(purchase[0]!.vendor_id).toBe(vendorA)
    expect(Number(purchase[0]!.qty)).toBe(4)
    expect(Number(purchase[0]!.actual_unit_price)).toBeCloseTo(7.25, 4)
    expect(purchase[0]!.currency_code).toBe('USD')
    expect(purchase[0]!.bought_by).toBe(userIds.organizer)
    expect(purchase[0]!.over_tolerance).toBe(false)
    expect(purchase[0]!.receipt_attachment_id).not.toBeNull()
    // the receipt is attached to the purchase and the file is marked attached
    const att = await pool.query<{ status: string }>(
      `SELECT f.status FROM document_attachments da JOIN files f ON f.id=da.file_id WHERE da.id=$1`,
      [purchase[0]!.receipt_attachment_id],
    )
    expect(att.rows[0]?.status).toBe('attached')

    expect(await logActions(b.reqId)).toContain('review_line_added')
    expect(await statusOf(b.reqId)).toBe('organizer_review')
  })

  it("an item added by an administrator needs a PO Admin on its own: the purchase is not the organizer's, so the addition is the only reason", async () => {
    const b = await reachReview('buyer')
    await M.addReviewLine(null, { input: addInput(b.reqId, { receiptFileId: await makeFile() }) }, ctxFor('admin'))
    const r = await reviewOf(b.reqId, 'admin')
    expect(r.review!.added_count).toBe(1)
    expect(r.review!.organizer_bought_count).toBe(0)
    expect(r.review!.needs_approval).toBe(true)
    await expect(confirm(b.reqId)).rejects.toThrow(/PO Admin must approve this first.*1 item was added/)
    await submit(b.reqId)
    expect(await statusOf(b.reqId)).toBe('review_approval')
  })

  it('needs a PO Admin: confirming alone is refused, submitting works, and approving creates the PO with the new line', async () => {
    const b = await reachReview()
    await add(b.reqId)
    await expect(confirm(b.reqId)).rejects.toThrow(/PO Admin must approve this first.*1 item was added/)
    await submit(b.reqId)
    expect(await statusOf(b.reqId)).toBe('review_approval')
    await approveR(b.reqId)
    expect(await statusOf(b.reqId)).toBe('sourcing')
    // vendor A holds Item 1 and the added bolts, vendor B holds Item 2
    expect((await childPOs(b.reqId)).map((p) => p.vendor_id).sort()).toEqual([vendorA, vendorB].sort())
    expect(await childLineDescriptions(b.reqId)).toEqual(['Forgotten bolts', 'Item 1', 'Item 2'])
  })

  it('refreshes the approved totals to match the lines when the PO is created', async () => {
    const b = await reachReview()
    const before = await approvedTotals(b.reqId)
    expect(before).toHaveLength(1)
    expect(Number(before[0]!.subtotal)).toBeCloseTo(250, 4)
    expect(before[0]!.line_count).toBe(2)
    await add(b.reqId)
    // not touched while the review is still open
    expect(Number((await approvedTotals(b.reqId))[0]!.subtotal)).toBeCloseTo(250, 4)
    await submit(b.reqId)
    await approveR(b.reqId)
    const after = await approvedTotals(b.reqId)
    expect(after).toHaveLength(1)
    expect(Number(after[0]!.subtotal)).toBeCloseTo(279, 4)
    expect(after[0]!.line_count).toBe(3)
  })

  it('drops a currency from the approved totals when its last line is removed', async () => {
    const b = await reachReview('buyer', ['USD', 'IQD'])
    const before = await approvedTotals(b.reqId)
    expect(before.map((x) => x.currency_code)).toEqual(['IQD', 'USD'])
    await remove(b.reqId, b.lines[1]!, 'The IQD item is not needed')
    // not touched while the review is open
    expect((await approvedTotals(b.reqId)).map((x) => x.currency_code)).toEqual(['IQD', 'USD'])
    await submit(b.reqId)
    await approveR(b.reqId)
    const after = await approvedTotals(b.reqId)
    expect(after.map((x) => x.currency_code)).toEqual(['USD'])
    expect(Number(after[0]!.subtotal)).toBeCloseTo(125, 4)
  })

  it('does not touch the approved totals of a review with no addition or removal', async () => {
    const b = await reachReview()
    await pool.query(`UPDATE requisition_approved_totals SET subtotal = 999 WHERE requisition_id=$1`, [b.reqId])
    // an edit is a change, but not an added or removed line: the snapshot is left as it was
    await M.editReviewPurchase(null, { purchaseId: b.purchases[0], actualUnitPrice: 12.9 }, ctxFor('organizer'))
    await submit(b.reqId)
    await approveR(b.reqId)
    expect(Number((await approvedTotals(b.reqId))[0]!.subtotal)).toBe(999)
  })

  it('shows the addition to the page: the line is marked, the totals "was" leaves it out and "now" counts it', async () => {
    const b = await reachReview()
    await add(b.reqId)
    const r = await reviewOf(b.reqId)
    expect(r.review!.added_count).toBe(1)
    expect(r.review!.removed_count).toBe(0)
    expect(r.review!.needs_approval).toBe(true)
    expect(r.review!.approval_reason).toContain('1 item was added')
    const marked = r.lines.filter((l) => l.review_added_at !== null)
    expect(marked.map((l) => l.description)).toEqual(['Forgotten bolts'])
    expect(marked[0]!.purchases).toHaveLength(1)
    const usd = r.review!.totals.find((t) => t.currency_code === 'USD')!
    expect(Number(usd.was)).toBeCloseTo(250, 4)
    expect(Number(usd.now)).toBeCloseTo(279, 4)
    expect(usd.purchases).toBe(3)
  })

  it('takes a catalog product (and names the line from it when no description is typed)', async () => {
    const b = await reachReview()
    const product = (
      await pool.query<{ id: string }>(
        `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,'Catalog washer','unit','general') RETURNING id`,
        [COMPANY_ID, `${SKU_PREFIX}W1`],
      )
    ).rows[0]!.id
    await add(b.reqId, 'organizer', { description: '', productId: product })
    const line = (await pool.query<{ description: string; product_id: string }>(`SELECT description, product_id FROM po_lines WHERE id=$1`, [(await lineIds(b.reqId))[2]])).rows[0]!
    expect(line.description).toBe('Catalog washer')
    expect(line.product_id).toBe(product)
  })

  it('accepts the organizer and an admin, and refuses a stranger, the buyer and a PO Admin who is not the organizer', async () => {
    const b = await reachReview()
    for (const who of ['stranger', 'buyer', 'poadmin'] as Who[])
      await expect(add(b.reqId, who)).rejects.toThrow(/Only the requisition's organizer, or an admin/)
    expect(await lineIds(b.reqId)).toHaveLength(2)
    await add(b.reqId, 'admin')
    expect(await lineIds(b.reqId)).toHaveLength(3)
  })

  it("never reaches another company's requisition", async () => {
    const b = await reachReview()
    const input = addInput(b.reqId, { receiptFileId: await makeFile() })
    await expect(M.addReviewLine(null, { input }, foreign())).rejects.toThrow(/Requisition not found/)
    expect(await lineIds(b.reqId)).toHaveLength(2)
  })

  it('is refused outside the organizer review, with the stage named', async () => {
    const b = await reachReview()
    await sendBack(b.reqId, 'buy more')
    await expect(add(b.reqId)).rejects.toThrow(/not in Organizer Review/)
    expect(await statusOf(b.reqId)).toBe('items_bought')
  })

  it('refuses a vendor of another company, an unknown vendor, a receipt of another company, and a product of another company', async () => {
    const b = await reachReview()
    await expect(add(b.reqId, 'organizer', { vendorId: foreignVendor })).rejects.toThrow(/Vendor not found/)
    await expect(add(b.reqId, 'organizer', { vendorId: '00000000-0000-0000-0000-00000000dead' })).rejects.toThrow(/Vendor not found/)
    await expect(add(b.reqId, 'organizer', { receiptFileId: await makeFile(OTHER_COMPANY_ID, 'foreignadmin') })).rejects.toThrow(
      /Receipt file not found/,
    )
    // a company that is neither this one nor the central warehouse
    const plain = (await pool.query<{ id: string }>(`SELECT id FROM companies WHERE name='TEST-FIXTURE-HR' AND NOT is_central_warehouse`)).rows[0]!.id
    const foreignProduct = (
      await pool.query<{ id: string }>(
        `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,'Foreign item','unit','general') RETURNING id`,
        [plain, `${SKU_PREFIX}F1`],
      )
    ).rows[0]!.id
    await expect(add(b.reqId, 'organizer', { productId: foreignProduct })).rejects.toThrow(/Product not found/)
    expect(await lineIds(b.reqId)).toHaveLength(2)
  })

  it("accepts a product of the central warehouse (the requisition form offers it too), and only because it is the central warehouse", async () => {
    const b = await reachReview()
    const was = (await pool.query<{ is_central_warehouse: boolean }>(`SELECT is_central_warehouse FROM companies WHERE id=$1`, [OTHER_COMPANY_ID])).rows[0]!.is_central_warehouse
    const central = (
      await pool.query<{ id: string }>(
        `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,'Central item','unit','general') RETURNING id`,
        [OTHER_COMPANY_ID, `${SKU_PREFIX}C1`],
      )
    ).rows[0]!.id
    try {
      await pool.query(`UPDATE companies SET is_central_warehouse=true WHERE id=$1`, [OTHER_COMPANY_ID])
      await add(b.reqId, 'organizer', { description: '', productId: central })
      expect(await lineIds(b.reqId)).toHaveLength(3)
      // the same product is refused once its company is not the central warehouse
      await pool.query(`UPDATE companies SET is_central_warehouse=false WHERE id=$1`, [OTHER_COMPANY_ID])
      await expect(add(b.reqId, 'organizer', { description: '', productId: central })).rejects.toThrow(/Product not found/)
      expect(await lineIds(b.reqId)).toHaveLength(3)
    } finally {
      await pool.query(`UPDATE companies SET is_central_warehouse=$2 WHERE id=$1`, [OTHER_COMPANY_ID, was])
    }
  })

  it('refuses an unnamed item, a zero quantity or price, and a missing or malformed currency', async () => {
    const b = await reachReview()
    await expect(add(b.reqId, 'organizer', { description: '  ' })).rejects.toThrow(/Name the item/)
    await expect(add(b.reqId, 'organizer', { qty: 0 })).rejects.toThrow(/qty must be greater than 0/)
    await expect(add(b.reqId, 'organizer', { actualUnitPrice: 0 })).rejects.toThrow(/actualUnitPrice must be greater than 0/)
    await expect(add(b.reqId, 'organizer', { currencyCode: '' })).rejects.toThrow(/Choose the currency/)
    await expect(add(b.reqId, 'organizer', { currencyCode: 'DOLLARS' })).rejects.toThrow(/Choose the currency/)
    expect(await lineIds(b.reqId)).toHaveLength(2)
  })

  it('takes the currency as typed, upper-cased, never a default', async () => {
    const b = await reachReview()
    await add(b.reqId, 'organizer', { currencyCode: 'iqd', actualUnitPrice: 1500, qty: 2 })
    const line = (await pool.query<{ currency_code: string }>(`SELECT currency_code FROM po_lines WHERE id=$1`, [(await lineIds(b.reqId))[2]])).rows[0]!
    expect(line.currency_code).toBe('IQD')
    const r = await reviewOf(b.reqId)
    expect(r.review!.totals.map((t) => t.currency_code)).toEqual(['IQD', 'USD'])
  })

})

describe('removing a line', () => {
  it('removes the line and its purchases, keeps what it was, and needs a PO Admin', async () => {
    const b = await reachReview()
    await remove(b.reqId, b.lines[1]!, 'Bought by mistake')
    expect(await lineIds(b.reqId)).toEqual([b.lines[0]])
    // its purchase and the receipt attached to it are gone
    expect(
      (await pool.query<{ c: string }>(`SELECT COUNT(*) AS c FROM po_line_purchases WHERE id=$1`, [b.purchases[1]])).rows[0]!.c,
    ).toBe('0')
    expect(
      (
        await pool.query<{ c: string }>(
          `SELECT COUNT(*) AS c FROM document_attachments WHERE entity_type='po_line_purchase' AND entity_id=$1`,
          [b.purchases[1]],
        )
      ).rows[0]!.c,
    ).toBe('0')
    // what it was is kept, in the words and numbers it had
    const kept = await removedRows(b.reqId)
    expect(kept).toHaveLength(1)
    expect(kept[0]!.description).toBe('Item 2')
    expect(kept[0]!.reason).toBe('Bought by mistake')
    expect(kept[0]!.purchases).toHaveLength(1)
    expect(kept[0]!.purchases[0]!.vendor).toMatch(/ORVARTEST-VENDOR-B/)
    expect(Number(kept[0]!.purchases[0]!.qty)).toBe(10)
    expect(Number(kept[0]!.purchases[0]!.price)).toBeCloseTo(12.5, 4)
    expect(kept[0]!.purchases[0]!.currency).toBe('USD')
    expect(kept[0]!.purchases[0]!.had_receipt).toBe(true)
    expect(await logActions(b.reqId)).toContain('review_line_removed')

    await expect(confirm(b.reqId)).rejects.toThrow(/PO Admin must approve this first.*1 item was removed/)
    await submit(b.reqId)
    await approveR(b.reqId)
    expect(await statusOf(b.reqId)).toBe('sourcing')
    // only the remaining line becomes a purchase order
    expect((await childPOs(b.reqId)).map((p) => p.vendor_id)).toEqual([vendorA])
    expect(await childLineDescriptions(b.reqId)).toEqual(['Item 1'])
  })

  it('refreshes the approved totals to match the remaining lines when the PO is created', async () => {
    const b = await reachReview()
    await remove(b.reqId, b.lines[1]!)
    await submit(b.reqId)
    await approveR(b.reqId)
    const after = await approvedTotals(b.reqId)
    expect(after).toHaveLength(1)
    expect(Number(after[0]!.subtotal)).toBeCloseTo(125, 4)
    expect(after[0]!.line_count).toBe(1)
  })

  it('shows the removal to the page: the removed list, and totals whose "was" still holds what was bought', async () => {
    const b = await reachReview()
    await remove(b.reqId, b.lines[1]!, 'Bought by mistake')
    const r = await reviewOf(b.reqId)
    expect(r.review!.removed_count).toBe(1)
    expect(r.review!.added_count).toBe(0)
    expect(r.review!.approval_reason).toContain('1 item was removed')
    expect(r.review!.removed_lines).toHaveLength(1)
    const rl = r.review!.removed_lines[0]!
    expect(rl.description).toBe('Item 2')
    expect(rl.reason).toBe('Bought by mistake')
    expect(rl.removed_by_name).toBeTruthy()
    expect(rl.purchases[0]).toMatchObject({ qty: '10.0000', price: '12.5000', currency: 'USD', had_receipt: true })
    const usd = r.review!.totals.find((t) => t.currency_code === 'USD')!
    expect(Number(usd.was)).toBeCloseTo(250, 4)
    expect(Number(usd.now)).toBeCloseTo(125, 4)
    expect(usd.purchases).toBe(1)
  })

  it('tells the buyer whose purchase went, and not the person who removed it', async () => {
    const b = await reachReview('buyer')
    await remove(b.reqId, b.lines[0]!, 'Wrong item')
    const told = await notices(b.reqId, 'REQ_REVIEW_LINE_REMOVED')
    expect(told.map((n) => n.payload.userId)).toEqual([userIds.buyer])
    expect(String(told[0]!.payload.body)).toContain('Item 1 was removed')
    expect(String(told[0]!.payload.body)).toContain('Wrong item')
    // the organizer himself recorded nothing here, and an admin removing it is not told about their own action
    const b2 = await reachReview('buyer')
    await M.removeReviewLine(null, { requisitionId: b2.reqId, lineId: b2.lines[0], reason: 'x' }, ctxFor('admin'))
    const told2 = await notices(b2.reqId, 'REQ_REVIEW_LINE_REMOVED')
    expect(told2.map((n) => n.payload.userId)).toEqual([userIds.buyer])
  })

  it('does not tell the organizer about his own removal when he was the one who bought the item', async () => {
    const b = await reachReview('organizer')
    await remove(b.reqId, b.lines[0]!, 'Wrong item')
    // the notice is written without being awaited, so give it the same time the positive cases wait for
    await new Promise((r) => setTimeout(r, 600))
    expect(await notices(b.reqId, 'REQ_REVIEW_LINE_REMOVED', false)).toEqual([])
  })

  it('needs a reason, and refuses a stranger, the buyer and another company', async () => {
    const b = await reachReview()
    await expect(remove(b.reqId, b.lines[1]!, '   ')).rejects.toThrow(/reason is required/)
    for (const who of ['stranger', 'buyer', 'poadmin'] as Who[])
      await expect(remove(b.reqId, b.lines[1]!, 'because', who)).rejects.toThrow(/Only the requisition's organizer, or an admin/)
    await expect(M.removeReviewLine(null, { requisitionId: b.reqId, lineId: b.lines[1], reason: 'because' }, foreign())).rejects.toThrow(
      /Requisition not found/,
    )
    expect(await lineIds(b.reqId)).toHaveLength(2)
    expect(await removedRows(b.reqId)).toHaveLength(0)
  })

  it('refuses a line that is not part of the requisition, even one of another requisition of the same company', async () => {
    const b = await reachReview()
    const other = await reachReview()
    await expect(remove(b.reqId, other.lines[0]!)).rejects.toThrow(/not part of this requisition/)
    expect(await lineIds(other.reqId)).toHaveLength(2)
  })

  it('refuses to remove the last line, and says to cancel instead', async () => {
    const b = await reachReview()
    await remove(b.reqId, b.lines[1]!)
    await expect(remove(b.reqId, b.lines[0]!)).rejects.toThrow(/at least one line: cancel the requisition/)
    expect(await lineIds(b.reqId)).toEqual([b.lines[0]])
  })

  it('is refused outside the organizer review', async () => {
    const b = await reachReview()
    await sendBack(b.reqId, 'buy more')
    await expect(remove(b.reqId, b.lines[1]!)).rejects.toThrow(/not in Organizer Review/)
  })

  it('names what blocks a line (here: other lines were split from it) and removes nothing', async () => {
    const b = await reachReview()
    await pool.query(
      `INSERT INTO po_lines (requisition_id, line_number, description, qty_ordered, unit_price, initial_unit_price, total_price, uom, currency_code, origin_line_id)
       VALUES ($1, 9, 'Split from item 2', 1, 1, 1, 1, 'pc', 'USD', $2)`,
      [b.reqId, b.lines[1]],
    )
    await expect(remove(b.reqId, b.lines[1]!)).rejects.toThrow(/can't be removed: other lines were split from it/)
    expect(await lineIds(b.reqId)).toContain(b.lines[1])
    expect(await removedRows(b.reqId)).toHaveLength(0)
    expect(
      (await pool.query<{ c: string }>(`SELECT COUNT(*) AS c FROM po_line_purchases WHERE id=$1`, [b.purchases[1]])).rows[0]!.c,
    ).toBe('1')
  })

  it('an item added in this same review and then removed leaves no trace to approve', async () => {
    const b = await reachReview()
    await add(b.reqId)
    const added = (await lineIds(b.reqId))[2]!
    await remove(b.reqId, added, 'Added by mistake')
    expect(await removedRows(b.reqId)).toHaveLength(0)
    const r = await reviewOf(b.reqId)
    expect(r.review!.added_count).toBe(0)
    expect(r.review!.removed_count).toBe(0)
    expect(r.review!.needs_approval).toBe(false)
    // nothing needs a PO Admin any more, so the organizer can confirm himself (he bought nothing)
    await confirm(b.reqId)
    expect(await statusOf(b.reqId)).toBe('sourcing')
    expect(await logActions(b.reqId)).toEqual(expect.arrayContaining(['review_line_added', 'review_line_removed']))
  })

  describe('stock', () => {
    let productId: string
    let locationId: string
    beforeAll(async () => {
      productId = (
        await pool.query<{ id: string }>(
          `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,'Stock bolt','unit','general') RETURNING id`,
          [COMPANY_ID, `${SKU_PREFIX}S1`],
        )
      ).rows[0]!.id
      locationId = (
        await pool.query<{ id: string }>(
          `INSERT INTO stock_locations (company_id, name, type, is_active) VALUES ($1,$2,'warehouse',true) RETURNING id`,
          [COMPANY_ID, `${LOC_PREFIX}W`],
        )
      ).rows[0]!.id
    })

    // Line 2 is covered from stock for 4 units (reserved, with a draft Store Out), as if it had been through the inventory check.
    async function stockCover(b: Bought, issueStatus = 'draft') {
      await pool.query(`UPDATE po_lines SET product_id=$2, qty_from_stock=4, source_location_id=$3 WHERE id=$1`, [b.lines[1], productId, locationId])
      await pool.query(`DELETE FROM stock_balances WHERE product_id=$1 AND location_id=$2`, [productId, locationId])
      await pool.query(`INSERT INTO stock_balances (product_id, location_id, qty_on_hand, qty_reserved) VALUES ($1,$2,50,4)`, [productId, locationId])
      const number = `ORVARTEST-SO-${Math.random().toString(36).slice(2, 8)}`
      const issue = (
        await pool.query<{ id: string }>(
          `INSERT INTO project_material_issues (project_id, company_id, requisition_id, issue_number, issue_date, status, created_by)
           VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,$6) RETURNING id`,
          [projectId, COMPANY_ID, b.reqId, number, issueStatus, userIds.admin],
        )
      ).rows[0]!.id
      await pool.query(
        `INSERT INTO project_material_issue_lines (issue_id, product_id, from_location_id, to_location_id, qty_issued, po_line_id)
         VALUES ($1,$2,$3,NULL,4,$4)`,
        [issue, productId, locationId, b.lines[1]],
      )
      return { issue, number }
    }
    const reserved = async () =>
      Number(
        (await pool.query<{ qty_reserved: string }>(`SELECT qty_reserved FROM stock_balances WHERE product_id=$1 AND location_id=$2`, [productId, locationId])).rows[0]!
          .qty_reserved,
      )

    it('releases the stock the line reserved, deletes its draft Store Out line and cancels a Store Out left empty', async () => {
      const b = await reachReview()
      const s = await stockCover(b)
      expect(await reserved()).toBe(4)
      await remove(b.reqId, b.lines[1]!, 'Use the stock elsewhere')
      expect(await reserved()).toBe(0)
      expect(
        (await pool.query<{ c: string }>(`SELECT COUNT(*) AS c FROM project_material_issue_lines WHERE issue_id=$1`, [s.issue])).rows[0]!.c,
      ).toBe('0')
      expect((await pool.query<{ status: string }>(`SELECT status FROM project_material_issues WHERE id=$1`, [s.issue])).rows[0]!.status).toBe('cancelled')
      const kept = await removedRows(b.reqId)
      expect(Number((await pool.query<{ qty_from_stock: string }>(`SELECT qty_from_stock FROM requisition_review_removed_lines WHERE requisition_id=$1`, [b.reqId])).rows[0]!.qty_from_stock)).toBe(4)
      expect(kept).toHaveLength(1)
    })

    it('keeps a Store Out that still has other lines, and only drops this line from it', async () => {
      const b = await reachReview()
      const s = await stockCover(b)
      // a second line on the same Store Out, for line 1
      await pool.query(`UPDATE po_lines SET product_id=$2, qty_from_stock=2, source_location_id=$3 WHERE id=$1`, [b.lines[0], productId, locationId])
      await pool.query(`UPDATE stock_balances SET qty_reserved = 6 WHERE product_id=$1 AND location_id=$2`, [productId, locationId])
      await pool.query(
        `INSERT INTO project_material_issue_lines (issue_id, product_id, from_location_id, to_location_id, qty_issued, po_line_id)
         VALUES ($1,$2,$3,NULL,2,$4)`,
        [s.issue, productId, locationId, b.lines[0]],
      )
      await remove(b.reqId, b.lines[1]!)
      expect(await reserved()).toBe(2)
      expect((await pool.query<{ status: string }>(`SELECT status FROM project_material_issues WHERE id=$1`, [s.issue])).rows[0]!.status).toBe('draft')
      expect(
        (await pool.query<{ po_line_id: string }>(`SELECT po_line_id FROM project_material_issue_lines WHERE issue_id=$1`, [s.issue])).rows.map((r) => r.po_line_id),
      ).toEqual([b.lines[0]])
    })

    it('refuses a line whose stock was already issued to the project, naming the Store Out, and changes nothing', async () => {
      const b = await reachReview()
      const s = await stockCover(b, 'issued')
      await expect(remove(b.reqId, b.lines[1]!)).rejects.toThrow(new RegExp(`stock for it was already issued \\(Store Out ${s.number}\\)`))
      expect(await lineIds(b.reqId)).toHaveLength(2)
      expect(await reserved()).toBe(4)
      expect(await removedRows(b.reqId)).toHaveLength(0)
      expect(
        (await pool.query<{ c: string }>(`SELECT COUNT(*) AS c FROM po_line_purchases WHERE id=$1`, [b.purchases[1]])).rows[0]!.c,
      ).toBe('1')
    })
  })
})

describe('what happens to the changes along the way', () => {
  it('keeps an addition and a removal when the requisition is sent back to Items Bought and returns to the review', async () => {
    const b = await reachReview()
    await add(b.reqId)
    await remove(b.reqId, b.lines[1]!, 'Not needed')
    await sendBack(b.reqId, 'Please check the receipts again')
    expect(await statusOf(b.reqId)).toBe('items_bought')
    // everything left is covered, so the buyer finishes buying and it comes back to the review
    await M.finishBuyingRequisition(null, { id: b.reqId }, asAdmin('buyer'))
    expect(await statusOf(b.reqId)).toBe('organizer_review')
    const r = await reviewOf(b.reqId)
    expect(r.review!.added_count).toBe(1)
    expect(r.review!.removed_count).toBe(1)
    expect(r.review!.needs_approval).toBe(true)
    await expect(confirm(b.reqId)).rejects.toThrow(/PO Admin must approve this first/)
  })

  it('keeps them when a PO Admin sends the review back, and the organizer can still change his mind', async () => {
    const b = await reachReview()
    await add(b.reqId)
    await remove(b.reqId, b.lines[1]!, 'Not needed')
    await submit(b.reqId)
    await rejectR(b.reqId, 'The added item has no vendor invoice')
    expect(await statusOf(b.reqId)).toBe('organizer_review')
    const r = await reviewOf(b.reqId)
    expect(r.review!.added_count).toBe(1)
    expect(r.review!.removed_count).toBe(1)
    // he takes the added item back out
    await remove(b.reqId, (await lineIds(b.reqId)).at(-1)!, 'No invoice')
    const r2 = await reviewOf(b.reqId)
    expect(r2.review!.added_count).toBe(0)
    expect(r2.review!.removed_count).toBe(1)
    await submit(b.reqId)
    await approveR(b.reqId)
    expect(await childLineDescriptions(b.reqId)).toEqual(['Item 1'])
  })

  it('the organizer cannot approve what was added in his own review', async () => {
    const b = await reachReview()
    await add(b.reqId, 'admin')
    await submit(b.reqId, 'admin')
    // admin is not the organizer of this requisition, so another admin-level user may approve; the organizer may not
    await expect(approveR(b.reqId, 'organizer')).rejects.toThrow(/never the requisition's organizer/)
    await approveR(b.reqId, 'poadmin')
    expect(await statusOf(b.reqId)).toBe('sourcing')
  })
})

describe('the real schema', () => {
  it('has both mutations with the arguments the page sends, and returns the requisition', async () => {
    const b = await reachReview()
    const receipt = await makeFile()
    const res = await server.executeOperation(
      {
        query: `mutation($input: AddReviewLineInput!, $id: ID!, $line: ID!) {
          addReviewLine(input: $input) { id status }
          removeReviewLine(requisitionId: $id, lineId: $line, reason: "Not needed") { id status }
        }`,
        variables: {
          input: {
            requisitionId: b.reqId,
            description: 'Via GraphQL',
            qty: 1,
            uom: 'pc',
            vendorId: vendorA,
            actualUnitPrice: 3,
            currencyCode: 'USD',
            receiptFileId: receipt,
          },
          id: b.reqId,
          line: b.lines[1],
        },
      },
      { contextValue: ctxFor('organizer') },
    )
    expect(res.body.kind).toBe('single')
    if (res.body.kind !== 'single') return
    expect(res.body.singleResult.errors).toBeUndefined()
    const r = await reviewOf(b.reqId)
    expect(r.review!.added_count).toBe(1)
    expect(r.review!.removed_count).toBe(1)
  })
})

// Taking part of a line from stock inside the review (migration 332, playbook #117): the organizer lowers a purchase and covers
// the missing quantity from the shelf instead of accepting it as short. It reserves the stock now, counts as a change a PO Admin
// approves, and the draft Store Out is made only when the purchase orders are.
describe('taking part of a line from stock in the review', () => {
  let productId: string
  let locationId: string
  let otherLocationId: string
  beforeAll(async () => {
    productId = (
      await pool.query<{ id: string }>(
        `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,'Shelf bolt','unit','general') RETURNING id`,
        [COMPANY_ID, `${SKU_PREFIX}T1`],
      )
    ).rows[0]!.id
    const loc = async (name: string, type = 'warehouse') =>
      (
        await pool.query<{ id: string }>(
          `INSERT INTO stock_locations (company_id, name, type, is_active) VALUES ($1,$2,$3,true) RETURNING id`,
          [COMPANY_ID, `${LOC_PREFIX}${name}`, type],
        )
      ).rows[0]!.id
    locationId = await loc('T-A')
    otherLocationId = await loc('T-B')
  })

  const setStock = async (onHand: number, reservedQty: number, location = locationId) => {
    await pool.query(`DELETE FROM stock_balances WHERE product_id=$1 AND location_id=$2`, [productId, location])
    await pool.query(`INSERT INTO stock_balances (product_id, location_id, qty_on_hand, qty_reserved) VALUES ($1,$2,$3,$4)`, [
      productId,
      location,
      onHand,
      reservedQty,
    ])
  }
  const reservedAt = async (location = locationId) =>
    Number(
      (await pool.query<{ qty_reserved: string }>(`SELECT qty_reserved FROM stock_balances WHERE product_id=$1 AND location_id=$2`, [productId, location])).rows[0]!
        .qty_reserved,
    )
  const lineRow = async (lineId: string) =>
    (
      await pool.query<{
        qty_from_stock: string
        review_stock_qty: string | null
        source_location_id: string | null
        qty_ordered: string
        in_stock: boolean
        total_price: string
      }>(`SELECT qty_from_stock, review_stock_qty, source_location_id, qty_ordered, in_stock, total_price FROM po_lines WHERE id=$1`, [lineId])
    ).rows[0]!
  const editQty = (purchaseId: string, qty: number, who: Who = 'organizer') =>
    M.editReviewPurchase(null, { purchaseId, qty }, ctxFor(who))
  const take = (reqId: string, lineId: string, qty: number, location = locationId, who: Who = 'organizer') =>
    M.takeReviewLineFromStock(null, { requisitionId: reqId, lineId, sourceLocationId: location, qty }, ctxFor(who))
  const putBack = (reqId: string, lineId: string, who: Who = 'organizer') =>
    M.putBackReviewStock(null, { requisitionId: reqId, lineId }, ctxFor(who))
  const storeOutLines = async (reqId: string) =>
    (
      await pool.query<{ po_line_id: string; qty_issued: string; status: string }>(
        `SELECT m.po_line_id, m.qty_issued, h.status
           FROM project_material_issue_lines m JOIN project_material_issues h ON h.id = m.issue_id
          WHERE h.requisition_id=$1`,
        [reqId],
      )
    ).rows

  // A requisition in the review whose line 1 is a catalog item (so it has stock to take from), bought for 10 and lowered to 6:
  // 4 are left to cover.
  async function reviewWithShortfall(): Promise<Bought> {
    const b = await reachReview()
    await pool.query(`UPDATE po_lines SET product_id=$2 WHERE id=$1`, [b.lines[0], productId])
    await editQty(b.purchases[0]!, 6)
    await setStock(50, 0)
    return b
  }

  it('reserves the stock, marks the quantity on the line, counts as a change, and makes NO Store Out yet', async () => {
    const b = await reviewWithShortfall()
    await take(b.reqId, b.lines[0]!, 4)
    expect(await reservedAt()).toBe(4)
    const l = await lineRow(b.lines[0]!)
    expect(Number(l.qty_from_stock)).toBe(4)
    expect(Number(l.review_stock_qty)).toBe(4)
    expect(l.source_location_id).toBe(locationId)
    expect(await storeOutLines(b.reqId)).toHaveLength(0)
    expect(await logActions(b.reqId)).toContain('review_taken_from_stock')
    const r = await reviewOf(b.reqId)
    expect(r.review!.needs_approval).toBe(true)
    expect(r.review!.approval_reason).toContain('1 item was taken from stock')
  })

  it('needs the PO Admin; approving makes the draft Store Out and the purchase order with what was bought', async () => {
    const b = await reviewWithShortfall()
    await take(b.reqId, b.lines[0]!, 4)
    await expect(confirm(b.reqId)).rejects.toThrow(/PO Admin must approve/)
    await submit(b.reqId)
    await approveR(b.reqId)
    expect(await statusOf(b.reqId)).toBe('sourcing')
    const outs = await storeOutLines(b.reqId)
    expect(outs).toHaveLength(1)
    expect(outs[0]!.po_line_id).toBe(b.lines[0])
    expect(Number(outs[0]!.qty_issued)).toBe(4)
    expect(outs[0]!.status).toBe('draft')
    expect(await reservedAt()).toBe(4) // still reserved until the Store Out is confirmed
    expect(
      (await pool.query<{ qty_ordered: string }>(`SELECT pl.qty_ordered FROM po_lines pl JOIN purchase_orders po ON po.id=pl.po_id WHERE po.requisition_id=$1 ORDER BY pl.qty_ordered`, [b.reqId])).rows.map((r) => Number(r.qty_ordered)),
    ).toEqual([6, 10])
    // no short mark: the shortfall was covered, not accepted
    expect((await pool.query<{ short_marked_at: string | null }>(`SELECT short_marked_at FROM po_lines WHERE id=$1`, [b.lines[0]])).rows[0]!.short_marked_at).toBeNull()
  })

  it('refuses taking more than what is left to cover, and a line with nothing left to cover', async () => {
    const b = await reviewWithShortfall()
    await expect(take(b.reqId, b.lines[0]!, 5)).rejects.toThrow(/Only 4 .* is left to cover/)
    await pool.query(`UPDATE po_lines SET product_id=$2 WHERE id=$1`, [b.lines[1], productId])
    await expect(take(b.reqId, b.lines[1]!, 1)).rejects.toThrow(/nothing left to cover/)
    await expect(take(b.reqId, b.lines[0]!, 0)).rejects.toThrow(/greater than 0/)
    expect(await reservedAt()).toBe(0)
  })

  it('can be taken in two parts, and refuses what the shelf cannot give, changing nothing', async () => {
    const b = await reviewWithShortfall()
    await take(b.reqId, b.lines[0]!, 1)
    await take(b.reqId, b.lines[0]!, 1)
    expect(Number((await lineRow(b.lines[0]!)).review_stock_qty)).toBe(2)
    await setStock(5, 4) // 1 available, 2 left to cover
    await expect(take(b.reqId, b.lines[0]!, 2)).rejects.toThrow(/Insufficient available stock.*1 available/)
    expect(await reservedAt()).toBe(4)
    expect(Number((await lineRow(b.lines[0]!)).qty_from_stock)).toBe(2)
  })

  it('refuses a virtual location, a location nobody can reach, a custom item and a second shelf for the same line', async () => {
    const b = await reviewWithShortfall()
    const virtual = (await pool.query<{ id: string }>(`SELECT id FROM stock_locations WHERE company_id=$1 AND type='virtual_out' LIMIT 1`, [COMPANY_ID])).rows[0]
    if (virtual) await expect(take(b.reqId, b.lines[0]!, 1, virtual.id)).rejects.toThrow(/virtual location/)
    const plain = (await pool.query<{ id: string }>(`SELECT id FROM companies WHERE name='TEST-FIXTURE-HR' AND NOT is_central_warehouse`)).rows[0]!.id
    const foreignLoc = (
      await pool.query<{ id: string }>(`INSERT INTO stock_locations (company_id, name, type, is_active) VALUES ($1,$2,'warehouse',true) RETURNING id`, [plain, `${LOC_PREFIX}FOREIGN`])
    ).rows[0]!.id
    try {
      await expect(take(b.reqId, b.lines[0]!, 1, foreignLoc)).rejects.toThrow(/not found or not accessible/)
    } finally {
      await pool.query(`DELETE FROM stock_locations WHERE id=$1`, [foreignLoc])
    }
    // a custom item has no stock
    await pool.query(`UPDATE po_lines SET product_id=NULL WHERE id=$1`, [b.lines[0]])
    await expect(take(b.reqId, b.lines[0]!, 1)).rejects.toThrow(/no stock to take from/)
    await pool.query(`UPDATE po_lines SET product_id=$2 WHERE id=$1`, [b.lines[0], productId])
    // a line that already draws from one shelf takes the rest from that one
    await take(b.reqId, b.lines[0]!, 1)
    await setStock(50, 0, otherLocationId)
    await expect(take(b.reqId, b.lines[0]!, 1, otherLocationId)).rejects.toThrow(/take the rest from the same one/)
    expect(await reservedAt(otherLocationId)).toBe(0)
  })

  it('only the organizer or an admin may take, and only in the review', async () => {
    const b = await reviewWithShortfall()
    await expect(take(b.reqId, b.lines[0]!, 1, locationId, 'stranger')).rejects.toThrow(/organizer, or an admin/)
    await expect(take(b.reqId, b.lines[0]!, 1, locationId, 'buyer')).rejects.toThrow(/organizer, or an admin/)
    await expect(M.takeReviewLineFromStock(null, { requisitionId: b.reqId, lineId: b.lines[0], sourceLocationId: locationId, qty: 1 }, foreign())).rejects.toThrow()
    await sendBack(b.reqId, 'Check again')
    await expect(take(b.reqId, b.lines[0]!, 1)).rejects.toThrow(/Organizer Review/)
    expect(await reservedAt()).toBe(0)
  })

  it('put back releases exactly what was taken and returns the line to how it was', async () => {
    const b = await reviewWithShortfall()
    const before = await lineRow(b.lines[0]!)
    await take(b.reqId, b.lines[0]!, 3)
    await putBack(b.reqId, b.lines[0]!)
    expect(await reservedAt()).toBe(0)
    const l = await lineRow(b.lines[0]!)
    expect(Number(l.qty_from_stock)).toBe(0)
    expect(l.review_stock_qty).toBeNull()
    expect(l.source_location_id).toBeNull()
    expect(l.in_stock).toBe(false)
    expect(Number(l.total_price)).toBeCloseTo(Number(before.total_price), 4)
    expect((await reviewOf(b.reqId)).review!.approval_reason ?? '').not.toContain('taken from stock')
    await expect(putBack(b.reqId, b.lines[0]!)).rejects.toThrow(/Nothing was taken from stock/)
    await expect(putBack(b.reqId, b.lines[0]!, 'stranger')).rejects.toThrow(/organizer, or an admin/)
  })

  it('put back keeps stock the inventory check had already given the line', async () => {
    const b = await reachReview()
    await pool.query(`UPDATE po_lines SET product_id=$2, qty_from_stock=2, source_location_id=$3 WHERE id=$1`, [b.lines[0], productId, locationId])
    await setStock(50, 2)
    await editQty(b.purchases[0]!, 5) // ordered 10: 2 from the shelf, 5 bought, 3 left
    await take(b.reqId, b.lines[0]!, 3)
    expect(Number((await lineRow(b.lines[0]!)).qty_from_stock)).toBe(5)
    expect(await reservedAt()).toBe(5)
    await putBack(b.reqId, b.lines[0]!)
    expect(Number((await lineRow(b.lines[0]!)).qty_from_stock)).toBe(2)
    expect(await reservedAt()).toBe(2)
    expect((await lineRow(b.lines[0]!)).source_location_id).toBe(locationId)
  })

  it('put back is refused once a Store Out exists for the line', async () => {
    const b = await reviewWithShortfall()
    await take(b.reqId, b.lines[0]!, 4)
    const number = `ORVARTEST-SO-${Math.random().toString(36).slice(2, 8)}`
    const issue = (
      await pool.query<{ id: string }>(
        `INSERT INTO project_material_issues (project_id, company_id, requisition_id, issue_number, issue_date, status, created_by)
         VALUES ($1,$2,$3,$4,CURRENT_DATE,'draft',$5) RETURNING id`,
        [projectId, COMPANY_ID, b.reqId, number, userIds.admin],
      )
    ).rows[0]!.id
    await pool.query(
      `INSERT INTO project_material_issue_lines (issue_id, product_id, from_location_id, to_location_id, qty_issued, po_line_id) VALUES ($1,$2,$3,NULL,4,$4)`,
      [issue, productId, locationId, b.lines[0]],
    )
    await expect(putBack(b.reqId, b.lines[0]!)).rejects.toThrow(new RegExp(`already has a Store Out \\(${number}\\)`))
    expect(await reservedAt()).toBe(4)
  })

  it('what he took stays marked through a send-back, and removing the line releases the reservation', async () => {
    const b = await reviewWithShortfall()
    await take(b.reqId, b.lines[0]!, 4)
    await sendBack(b.reqId, 'Look again')
    expect(Number((await lineRow(b.lines[0]!)).review_stock_qty)).toBe(4)
    expect(await reservedAt()).toBe(4)
    const c = await reviewWithShortfall()
    await setStock(50, 4)
    await take(c.reqId, c.lines[0]!, 4)
    expect(await reservedAt()).toBe(8)
    await remove(c.reqId, c.lines[0]!, 'Not needed')
    expect(await reservedAt()).toBe(4) // only the first requisition's 4 remain
  })

  it('a rejected review keeps what he took, and a second approval does not make a second Store Out', async () => {
    const b = await reviewWithShortfall()
    await take(b.reqId, b.lines[0]!, 4)
    await submit(b.reqId)
    await rejectR(b.reqId, 'Please check the shelf')
    expect(Number((await lineRow(b.lines[0]!)).review_stock_qty)).toBe(4)
    expect(await storeOutLines(b.reqId)).toHaveLength(0)
    await submit(b.reqId)
    await approveR(b.reqId)
    expect(await storeOutLines(b.reqId)).toHaveLength(1)
  })
})
