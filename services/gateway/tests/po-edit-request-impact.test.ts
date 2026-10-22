// The money effect of a PO / requisition edit request, shown to the reviewer before they
// approve and kept with the request afterwards.
//
// It is not re-computed anywhere: a pending request is dry-run by really applying it inside a
// transaction that is rolled back, and a reviewed one carries the before/after totals read around
// the real apply. These tests pin the two properties that make that trustworthy: the dry run gives
// exactly the numbers approval then produces, and it leaves nothing behind.
//
// Real Postgres, nothing mocked.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'
import { buildEditImpact, type EditSnapshot } from '../src/lib/poEditImpact.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const OTHER_COMPANY_ID = '00000000-0000-0000-0000-000000000002'
const EMAIL_PREFIX = 'po-edit-impact-test-'
const SKU_PREFIX = 'PEITEST-'
const PO_PREFIX = 'PEITEST-PO-'

let requesterId: string
let adminId: string

const ctxFor = (userId: string, role: string, companyId = TEST_COMPANY_ID) =>
  ({ auth: { companyId, userId, role, module: 'all', sessionId: 'pei-test' } }) as never

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
  cableId: string // line 1: 12 m @ 4,500 IQD = 54,000
  boxId: string // line 2: 3 ea @ 900 IQD = 2,700
  usdId: string // line 3: 2 ea @ 50 USD = 100
  productId: string
}

// A PO with three lines in two currencies, in `status`.
async function makePO(status: string): Promise<Fixture> {
  const sku = `${SKU_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const prod = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$2,'unit','general') RETURNING id`,
    [TEST_COMPANY_ID, sku],
  )
  const po = await pool.query<{ id: string }>(
    `INSERT INTO purchase_orders (company_id, po_number, created_by, status, currency_code, purpose)
     VALUES ($1,$2,$3,$4,'IQD','stock') RETURNING id`,
    [TEST_COMPANY_ID, `${PO_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, requesterId, status],
  )
  const poId = po.rows[0]!.id
  const addLine = async (n: number, desc: string, qty: number, price: number, uom: string, ccy: string) =>
    (
      await pool.query<{ id: string }>(
        `INSERT INTO po_lines (po_id, line_number, description, product_id, qty_ordered, unit_price, total_price, uom, currency_code)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [poId, n, desc, prod.rows[0]!.id, qty, price, qty * price, uom, ccy],
      )
    ).rows[0]!.id
  return {
    poId,
    productId: prod.rows[0]!.id,
    cableId: await addLine(1, 'Cable 3x2.5', 12, 4500, 'm', 'IQD'),
    boxId: await addLine(2, 'Junction box', 3, 900, 'ea', 'IQD'),
    usdId: await addLine(3, 'Imported relay', 2, 50, 'ea', 'USD'),
  }
}

async function cleanup(): Promise<void> {
  const pos = `SELECT id FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2`
  const args = [TEST_COMPANY_ID, `${PO_PREFIX}%`]
  await pool.query(`DELETE FROM po_edit_requests WHERE po_id IN (${pos})`, args)
  await pool.query(`DELETE FROM po_approval_log WHERE po_id IN (${pos})`, args)
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

interface Impact {
  totals: { currency_code: string; before: string; after: string }[]
  lines: { id: string; line_number: number | null; description: string | null; before: number | null; after: number | null }[]
  failure?: string | null
}

const submit = async (poId: string, changes: unknown): Promise<{ id: string; status: string }> =>
  (await resolvers.Mutation.submitPOEditRequest(
    null,
    { id: poId, changes: JSON.stringify(changes) } as never,
    ctxFor(requesterId, 'user'),
  )) as { id: string; status: string }

const impactFor = async (requestId: string, as = ctxFor(adminId, 'system_admin')): Promise<Impact | null> =>
  (await resolvers.Query.poEditRequestImpact(null, { requestId } as never, as)) as Impact | null

const total = (i: Impact, ccy: string, side: 'before' | 'after') =>
  parseFloat(i.totals.find((t) => t.currency_code === ccy)![side])

// Everything about the PO's lines and header that a dry run must leave exactly as it found it.
async function fingerprint(poId: string): Promise<string> {
  const lines = await pool.query(
    `SELECT id, line_number, description, qty_ordered::text, unit_price::text, total_price::text, currency_code, qty_from_stock::text
     FROM po_lines WHERE po_id=$1 ORDER BY line_number, id`,
    [poId],
  )
  const po = await pool.query(`SELECT subtotal::text, total_amount::text, status FROM purchase_orders WHERE id=$1`, [poId])
  return JSON.stringify({ lines: lines.rows, po: po.rows })
}

describe('dry-running a pending PO edit request', () => {
  it('shows the new total when a quantity changes, and the line it changes', async () => {
    const { poId, cableId } = await makePO('approved')
    const req = await submit(poId, { lines: { edited: [{ id: cableId, field: 'qty_ordered', from: 12, to: 20 }] } })
    expect(req.status).toBe('pending')

    const i = (await impactFor(req.id))!
    expect(total(i, 'IQD', 'before')).toBe(56700)
    expect(total(i, 'IQD', 'after')).toBe(92700) // 20 x 4,500 + 2,700
    expect(total(i, 'USD', 'before')).toBe(100)
    expect(total(i, 'USD', 'after')).toBe(100) // the other currency is untouched
    expect(i.lines).toEqual([{ id: cableId, line_number: 1, description: 'Cable 3x2.5', currency_code: 'IQD', before: 54000, after: 90000 }])
    expect(i.failure ?? null).toBeNull()
  })

  it('shows a removed line as gone, an added line as new, and keeps currencies apart', async () => {
    const { poId, boxId, usdId } = await makePO('approved')
    const req = await submit(poId, {
      lines: {
        removed: [boxId],
        edited: [{ id: usdId, field: 'unit_price', from: 50, to: 60 }],
        added: [{ description: 'Cable tie', qty: 100, unit_price: 25, uom: 'ea' }],
      },
    })
    const i = (await impactFor(req.id))!
    // IQD: -2,700 for the box, +2,500 for the ties (the PO's own currency)
    expect(total(i, 'IQD', 'before')).toBe(56700)
    expect(total(i, 'IQD', 'after')).toBe(56500)
    expect(total(i, 'USD', 'after')).toBe(120) // 2 x 60
    const byId = new Map(i.lines.map((l) => [l.id, l]))
    expect(byId.get(boxId)).toMatchObject({ before: 2700, after: null })
    expect(byId.get(usdId)).toMatchObject({ before: 100, after: 120 })
    const added = i.lines.find((l) => l.before === null)!
    expect(added).toMatchObject({ description: 'Cable tie', after: 2500 })
  })

  it('leaves the PO exactly as it was, and the request unchanged', async () => {
    const { poId, cableId, boxId } = await makePO('approved')
    const req = await submit(poId, {
      lines: { edited: [{ id: cableId, field: 'qty_ordered', from: 12, to: 99 }], removed: [boxId], added: [{ description: 'x', qty: 1, unit_price: 1 }] },
    })
    const before = await fingerprint(poId)
    const requestRow = JSON.stringify((await pool.query(`SELECT changes, status FROM po_edit_requests WHERE id=$1`, [req.id])).rows)

    await impactFor(req.id)
    await impactFor(req.id)

    expect(await fingerprint(poId)).toBe(before)
    expect(JSON.stringify((await pool.query(`SELECT changes, status FROM po_edit_requests WHERE id=$1`, [req.id])).rows)).toBe(requestRow)
  })

  it('gives exactly the totals that approving it then produces', async () => {
    const { poId, cableId, boxId, usdId } = await makePO('approved')
    const req = await submit(poId, {
      lines: {
        edited: [
          { id: cableId, field: 'qty_ordered', from: 12, to: 7.5 },
          { id: usdId, field: 'unit_price', from: 50, to: 61.25 },
        ],
        removed: [boxId],
        added: [{ description: 'Cable tie', qty: 3, unit_price: 12.5, uom: 'ea' }],
      },
    })
    const predicted = (await impactFor(req.id))!

    await resolvers.Mutation.approvePOEditRequest(null, { id: poId, requestId: req.id } as never, ctxFor(adminId, 'system_admin'))
    const actual = await pool.query<{ currency_code: string; total: string }>(
      `SELECT currency_code, SUM(total_price)::text AS total FROM po_lines WHERE po_id=$1 GROUP BY currency_code`,
      [poId],
    )
    for (const t of predicted.totals) {
      const real = actual.rows.find((r) => r.currency_code === t.currency_code)
      expect(parseFloat(real!.total)).toBe(parseFloat(t.after))
    }
  })

  it('says why approving would fail, and still changes nothing', async () => {
    const { poId, cableId } = await makePO('approved')
    // taking 2 of the line from stock needs a source stock location, which this line has none of
    const req = await submit(poId, { lines: { edited: [{ id: cableId, field: 'qty_from_stock', from: 0, to: 2 }] } })
    const before = await fingerprint(poId)

    const i = (await impactFor(req.id))!
    expect(i.failure).toMatch(/from-stock quantity/i)
    expect(i.lines).toEqual([])
    expect(await fingerprint(poId)).toBe(before)
  })
})

describe('who gets to see it', () => {
  it('shows it to reviewers and not to the requester or a plain user', async () => {
    const { poId, cableId } = await makePO('approved')
    const req = await submit(poId, { lines: { edited: [{ id: cableId, field: 'qty_ordered', from: 12, to: 13 }] } })
    expect(await impactFor(req.id, ctxFor(adminId, 'system_admin'))).not.toBeNull()
    expect(await impactFor(req.id, ctxFor(adminId, 'company_admin'))).not.toBeNull()
    expect(await impactFor(req.id, ctxFor(adminId, 'module_admin'))).not.toBeNull()
    expect(await impactFor(req.id, ctxFor(requesterId, 'user'))).toBeNull()
  })

  it("does not answer for another company's request", async () => {
    const { poId, cableId } = await makePO('approved')
    const req = await submit(poId, { lines: { edited: [{ id: cableId, field: 'qty_ordered', from: 12, to: 13 }] } })
    expect(await impactFor(req.id, ctxFor(adminId, 'system_admin', OTHER_COMPANY_ID))).toBeNull()
  })

  it('returns nothing for a request that does not exist', async () => {
    expect(await impactFor('00000000-0000-0000-0000-00000000dead')).toBeNull()
  })
})

describe('the impact kept with a reviewed request', () => {
  it('is recorded when an admin approves it, and returned afterwards', async () => {
    const { poId, cableId } = await makePO('approved')
    const req = await submit(poId, { lines: { edited: [{ id: cableId, field: 'qty_ordered', from: 12, to: 20 }] } })
    await resolvers.Mutation.approvePOEditRequest(null, { id: poId, requestId: req.id } as never, ctxFor(adminId, 'system_admin'))

    const stored = (await pool.query<{ changes: { impact?: Impact } }>(`SELECT changes FROM po_edit_requests WHERE id=$1`, [req.id])).rows[0]!.changes.impact!
    expect(parseFloat(stored.totals.find((t) => t.currency_code === 'IQD')!.before)).toBe(56700)
    expect(parseFloat(stored.totals.find((t) => t.currency_code === 'IQD')!.after)).toBe(92700)

    const again = (await impactFor(req.id))!
    expect(again.totals).toEqual(stored.totals)
  })

  it('is recorded for an edit applied straight away on a PO not yet approved', async () => {
    const { poId, boxId } = await makePO('draft')
    const req = await submit(poId, { lines: { removed: [boxId] } })
    expect(req.status).toBe('approved')
    const i = (await impactFor(req.id))!
    expect(total(i, 'IQD', 'before')).toBe(56700)
    expect(total(i, 'IQD', 'after')).toBe(54000)
  })

  it('is not recorded for a rejected request (nothing was applied)', async () => {
    const { poId, cableId } = await makePO('approved')
    const req = await submit(poId, { lines: { edited: [{ id: cableId, field: 'qty_ordered', from: 12, to: 20 }] } })
    await resolvers.Mutation.rejectPOEditRequest(null, { id: poId, requestId: req.id, reviewNotes: 'no' } as never, ctxFor(adminId, 'system_admin'))
    expect(await impactFor(req.id)).toBeNull()
  })

  it('does not stop an approval that cannot be applied from failing the way it always did', async () => {
    const { poId, cableId } = await makePO('approved')
    const req = await submit(poId, { lines: { edited: [{ id: cableId, field: 'qty_from_stock', from: 0, to: 2 }] } })
    await expect(
      resolvers.Mutation.approvePOEditRequest(null, { id: poId, requestId: req.id } as never, ctxFor(adminId, 'system_admin')),
    ).rejects.toThrow(/from-stock quantity/i)
    const row = await pool.query(`SELECT status FROM po_edit_requests WHERE id=$1`, [req.id])
    expect(row.rows[0]!.status).toBe('pending') // rolled back: still waiting, no impact written
  })
})

describe('buildEditImpact (pure)', () => {
  const snap = (rows: [string, number, number][], totals: Record<string, string>): EditSnapshot => ({
    lines: rows.map(([id, n, total]) => ({ id, line_number: n, description: id, currency_code: 'IQD', total })),
    totals: new Map(Object.entries(totals)),
  })

  it('lists only lines that were added, removed or changed, in line order', () => {
    const i = buildEditImpact(
      snap([['a', 1, 10], ['b', 2, 20], ['c', 3, 30]], { IQD: '60' }),
      snap([['a', 1, 10], ['c', 3, 35], ['d', 4, 5]], { IQD: '50' }),
    )
    expect(i.lines.map((l) => [l.id, l.before, l.after])).toEqual([
      ['b', 20, null],
      ['c', 30, 35],
      ['d', null, 5],
    ])
    expect(i.totals).toEqual([{ currency_code: 'IQD', before: '60', after: '50' }])
  })

  it('includes a currency that exists on only one side', () => {
    const i = buildEditImpact(snap([], { IQD: '10' }), snap([], { IQD: '10', USD: '5' }))
    expect(i.totals).toEqual([
      { currency_code: 'IQD', before: '10', after: '10' },
      { currency_code: 'USD', before: '0', after: '5' },
    ])
  })

  it('reports no line changes when nothing changed', () => {
    const s = snap([['a', 1, 10]], { IQD: '10' })
    expect(buildEditImpact(s, s).lines).toEqual([])
  })
})
