// What an edit request keeps about the lines it touches, so the Edit Request History can
// say which line a change was about.
//
// Regression: the web form sent line edits without the line's name and removals as bare
// ids. An approved removal deletes the line, so the history could only ever say "1 line
// removed" (21 of the 24 removals already on production are unrecoverable that way).
// The gateway now writes each touched line's name, quantity and price into the stored
// request at submission, while the line still exists.
//
// The first block is pure (no database). The rest is real Postgres, nothing mocked.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'
import {
  AUTO_APPLIED_REQUISITION_REVIEW_NOTE,
  AUTO_APPLIED_REVIEW_NOTE,
  isAutoAppliedEditRequest,
  recordLineNamesInEditChanges,
  type PoLineSnapshot,
} from '../src/lib/poEditChanges.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const EMAIL_PREFIX = 'po-edit-details-test-'
const SKU_PREFIX = 'PEDTEST-'
const PO_PREFIX = 'PEDTEST-PO-'

const line = (over: Partial<PoLineSnapshot> & { id: string }): PoLineSnapshot => ({
  line_number: 1,
  description: 'Cable 3x2.5',
  qty_ordered: '12.0000',
  unit_price: '4500.0000',
  uom: 'm',
  currency_code: 'IQD',
  total_price: '54000.0000',
  ...over,
})

describe('recordLineNamesInEditChanges (pure)', () => {
  it('names an edited line and turns a bare removed id into a full entry', () => {
    const out = recordLineNamesInEditChanges(
      {
        lines: {
          edited: [{ id: 'a', field: 'qty_ordered', from: 12, to: 20 }],
          removed: ['b'],
        },
      },
      [line({ id: 'a' }), line({ id: 'b', line_number: 2, description: 'Junction box', qty_ordered: '3', unit_price: '900', uom: 'ea' })],
    )
    expect(out.lines?.edited?.[0]).toMatchObject({ id: 'a', field: 'qty_ordered', description: 'Cable 3x2.5' })
    expect(out.lines?.removed?.[0]).toEqual({
      id: 'b',
      line_number: 2,
      description: 'Junction box',
      qty: 3,
      unit_price: 900,
      uom: 'ea',
      currency_code: 'IQD',
    })
  })

  it("records each touched line as it was, with its index, so the history can show 'line 2' later", () => {
    const out = recordLineNamesInEditChanges(
      { lines: { edited: [{ id: 'a' }, { id: 'a' }], removed: ['b'] } },
      [
        line({ id: 'a', line_number: 1 }),
        line({ id: 'b', line_number: 2, description: 'Junction box', qty_ordered: '3', unit_price: '900', uom: 'ea', total_price: '2700' }),
        line({ id: 'c', line_number: 3 }), // not touched
      ],
    ) as { touched?: { id: string; line_number: number; description: string | null; qty: number; unit_price: number; total: number }[] }
    expect(out.touched?.map((t) => t.id)).toEqual(['a', 'b']) // once each, in order, no untouched line
    expect(out.touched?.[1]).toEqual({
      id: 'b',
      line_number: 2,
      description: 'Junction box',
      qty: 3,
      unit_price: 900,
      uom: 'ea',
      currency_code: 'IQD',
      total: 2700,
    })
  })

  it('adds no touched list when no listed line is on the PO', () => {
    const out = recordLineNamesInEditChanges({ lines: { removed: ['ghost'] } }, [line({ id: 'a' })])
    expect(out).not.toHaveProperty('touched')
  })

  it('keeps what the caller already recorded', () => {
    const out = recordLineNamesInEditChanges(
      {
        lines: {
          edited: [{ id: 'a', field: 'unit_price', from: 1, to: 2, description: 'Name the form sent' }],
          removed: [{ id: 'b', description: 'Name the form sent', qty: 99 }],
        },
      },
      [line({ id: 'a' }), line({ id: 'b' })],
    )
    expect(out.lines?.edited?.[0]?.description).toBe('Name the form sent')
    expect(out.lines?.removed?.[0]).toMatchObject({ id: 'b', description: 'Name the form sent', qty: 99, unit_price: 4500 })
  })

  it('leaves an id that is not on the PO exactly as it came', () => {
    const out = recordLineNamesInEditChanges(
      { lines: { edited: [{ id: 'ghost', field: 'uom', from: 'a', to: 'b' }], removed: ['ghost'] } },
      [line({ id: 'a' })],
    )
    expect(out.lines?.edited?.[0]).toEqual({ id: 'ghost', field: 'uom', from: 'a', to: 'b' })
    expect(out.lines?.removed).toEqual(['ghost'])
  })

  it('does not change the input, and passes a header-only edit straight through', () => {
    const input = { lines: { removed: ['a'] } }
    recordLineNamesInEditChanges(input, [line({ id: 'a' })])
    expect(input.lines.removed).toEqual(['a'])

    const headerOnly = { header: { notes: { from: '', to: 'x' } } }
    expect(recordLineNamesInEditChanges(headerOnly, [line({ id: 'a' })])).toBe(headerOnly)
  })

  it('does not invent a name for a line that has none', () => {
    const out = recordLineNamesInEditChanges(
      { lines: { edited: [{ id: 'a' }], removed: ['a'] } },
      [line({ id: 'a', description: null })],
    )
    expect(out.lines?.edited?.[0]).toEqual({ id: 'a' })
    expect(out.lines?.removed?.[0]).not.toHaveProperty('description')
  })
})

describe('isAutoAppliedEditRequest (pure)', () => {
  const base = { status: 'approved', requested_by: 'u1', reviewed_by: 'u1', review_notes: AUTO_APPLIED_REVIEW_NOTE }
  it('is true only for an approved request the requester themselves "reviewed" with the auto-apply note', () => {
    expect(isAutoAppliedEditRequest(base)).toBe(true)
    expect(isAutoAppliedEditRequest({ ...base, status: 'pending' })).toBe(false)
    expect(isAutoAppliedEditRequest({ ...base, reviewed_by: 'u2' })).toBe(false)
    expect(isAutoAppliedEditRequest({ ...base, review_notes: 'Looks fine' })).toBe(false)
    expect(isAutoAppliedEditRequest({ ...base, review_notes: null })).toBe(false)
  })

  it("matches a requisition's request against the requisition note, not the PO one", () => {
    const req = { ...base, requisition_id: 'r1', review_notes: AUTO_APPLIED_REQUISITION_REVIEW_NOTE }
    expect(isAutoAppliedEditRequest(req)).toBe(true)
    expect(isAutoAppliedEditRequest({ ...req, review_notes: AUTO_APPLIED_REVIEW_NOTE })).toBe(false)
    expect(isAutoAppliedEditRequest({ ...base, review_notes: AUTO_APPLIED_REQUISITION_REVIEW_NOTE })).toBe(false)
  })
})

let requesterId: string
let adminId: string

const ctxFor = (userId: string, role: string) =>
  ({
    auth: { companyId: TEST_COMPANY_ID, userId, role, module: 'all', sessionId: 'ped-test' },
  }) as never

async function makeUser(key: string, first: string, last: string): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, first_name, last_name) VALUES ($1,'test-hash-not-used',$2,$3)
     ON CONFLICT (email) DO UPDATE SET first_name=EXCLUDED.first_name, last_name=EXCLUDED.last_name RETURNING id`,
    [`${EMAIL_PREFIX}${key}@fnc-erp.local`, first, last],
  )
  return r.rows[0]!.id
}

async function makePO(status: string): Promise<{ poId: string; cableId: string; boxId: string }> {
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
  const insertLine = async (n: number, desc: string, qty: number, price: number, uom: string) =>
    (
      await pool.query<{ id: string }>(
        `INSERT INTO po_lines (po_id, line_number, description, product_id, qty_ordered, unit_price, total_price, uom, currency_code)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'IQD') RETURNING id`,
        [poId, n, desc, prod.rows[0]!.id, qty, price, qty * price, uom],
      )
    ).rows[0]!.id
  return {
    poId,
    cableId: await insertLine(1, 'Cable 3x2.5', 12, 4500, 'm'),
    boxId: await insertLine(2, 'Junction box', 3, 900, 'ea'),
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
  requesterId = await makeUser('requester', 'Yazin', 'Requester')
  adminId = await makeUser('admin', 'Nadia', 'Admin')
  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`]).catch(() => undefined)
  await pool.end()
})

interface StoredChanges {
  lines?: {
    edited?: { id: string; field: string; description?: string }[]
    removed?: (string | { id: string; description?: string; qty?: number; unit_price?: number; uom?: string })[]
  }
}
const storedChanges = async (requestId: string): Promise<StoredChanges> =>
  (await pool.query<{ changes: StoredChanges }>(`SELECT changes FROM po_edit_requests WHERE id=$1`, [requestId])).rows[0]!.changes

interface HistoryRow {
  id: string
  status: string
  auto_applied: boolean | null
  requested_by_name: string | null
  reviewed_by_name: string | null
  requested_by_email: string | null
}
const history = async (poId: string, as = adminId): Promise<HistoryRow[]> =>
  (
    (await resolvers.Query.purchaseOrder(null, { id: poId }, ctxFor(as, 'system_admin'))) as {
      edit_requests: HistoryRow[]
    }
  ).edit_requests

describe('submitPOEditRequest keeps the names of the lines it touches', () => {
  it('names a removed line and an edited line in the stored request', async () => {
    const { poId, cableId, boxId } = await makePO('approved') // needs approval, so it stays pending
    const changes = JSON.stringify({
      lines: { edited: [{ id: cableId, field: 'qty_ordered', from: 12, to: 20 }], removed: [boxId] },
    })
    const res = (await resolvers.Mutation.submitPOEditRequest(
      null,
      { id: poId, changes } as never,
      ctxFor(requesterId, 'user'),
    )) as { id: string; status: string; changes: string }
    expect(res.status).toBe('pending')

    const stored = await storedChanges(res.id)
    expect(stored.lines?.edited?.[0]).toMatchObject({ id: cableId, field: 'qty_ordered', description: 'Cable 3x2.5' })
    expect(stored.lines?.removed?.[0]).toMatchObject({
      id: boxId,
      description: 'Junction box',
      qty: 3,
      unit_price: 900,
      uom: 'ea',
    })
    // the mutation answers with what was stored
    expect(JSON.parse(res.changes)).toEqual(stored)
  })

  it('still names the removed line after an admin approves it and the line is gone', async () => {
    const { poId, boxId } = await makePO('approved')
    const res = (await resolvers.Mutation.submitPOEditRequest(
      null,
      { id: poId, changes: JSON.stringify({ lines: { removed: [boxId] } }) } as never,
      ctxFor(requesterId, 'user'),
    )) as { id: string }

    await resolvers.Mutation.approvePOEditRequest(null, { id: poId, requestId: res.id } as never, ctxFor(adminId, 'system_admin'))
    const gone = await pool.query(`SELECT 1 FROM po_lines WHERE id=$1`, [boxId])
    expect(gone.rows).toHaveLength(0) // the line really is deleted...

    const stored = await storedChanges(res.id)
    expect(stored.lines?.removed?.[0]).toMatchObject({ id: boxId, description: 'Junction box' }) // ...but the history still knows it
  })

  it('names the lines of an edit that applied straight away on a PO not yet approved', async () => {
    const { poId, boxId } = await makePO('draft')
    const res = (await resolvers.Mutation.submitPOEditRequest(
      null,
      { id: poId, changes: JSON.stringify({ lines: { removed: [boxId] } }) } as never,
      ctxFor(requesterId, 'user'),
    )) as { id: string; status: string }
    expect(res.status).toBe('approved')
    const stored = await storedChanges(res.id)
    expect(stored.lines?.removed?.[0]).toMatchObject({ id: boxId, description: 'Junction box', qty: 3 })
  })

  it('leaves a header-only edit alone', async () => {
    const { poId } = await makePO('approved')
    const changes = { header: { notes: { from: '', to: 'deliver to gate 2' } } }
    const res = (await resolvers.Mutation.submitPOEditRequest(
      null,
      { id: poId, changes: JSON.stringify(changes) } as never,
      ctxFor(requesterId, 'user'),
    )) as { id: string }
    expect(await storedChanges(res.id)).toEqual(changes)
  })
})

describe('the PO query returns what the history card needs', () => {
  it("returns people's names and flags an auto-applied request", async () => {
    const { poId, cableId } = await makePO('draft')
    await resolvers.Mutation.submitPOEditRequest(
      null,
      { id: poId, changes: JSON.stringify({ lines: { edited: [{ id: cableId, field: 'unit_price', from: 4500, to: 4800 }] } }) } as never,
      ctxFor(requesterId, 'user'),
    )
    const [row] = await history(poId)
    expect(row?.status).toBe('approved')
    expect(row?.auto_applied).toBe(true)
    expect(row?.requested_by_name).toBe('Yazin Requester')
    expect(row?.reviewed_by_name).toBe('Yazin Requester') // the requester is recorded as reviewer
    expect(row?.requested_by_email).toContain(EMAIL_PREFIX)
  })

  it('does not flag a request an admin reviewed, and names the reviewer', async () => {
    const { poId, boxId } = await makePO('approved')
    const res = (await resolvers.Mutation.submitPOEditRequest(
      null,
      { id: poId, changes: JSON.stringify({ lines: { removed: [boxId] } }) } as never,
      ctxFor(requesterId, 'user'),
    )) as { id: string }

    const [pending] = await history(poId)
    expect(pending).toMatchObject({ id: res.id, status: 'pending', auto_applied: false, reviewed_by_name: null })

    await resolvers.Mutation.rejectPOEditRequest(
      null,
      { id: poId, requestId: res.id, reviewNotes: 'Keep the box' } as never,
      ctxFor(adminId, 'system_admin'),
    )
    const [rejected] = await history(poId)
    expect(rejected).toMatchObject({ status: 'rejected', auto_applied: false, reviewed_by_name: 'Nadia Admin', requested_by_name: 'Yazin Requester' })
  })

  it('writes the auto-apply note from the one shared constant', async () => {
    const { poId, boxId } = await makePO('draft')
    const res = (await resolvers.Mutation.submitPOEditRequest(
      null,
      { id: poId, changes: JSON.stringify({ lines: { removed: [boxId] } }) } as never,
      ctxFor(requesterId, 'user'),
    )) as { id: string }
    const row = await pool.query<{ review_notes: string }>(`SELECT review_notes FROM po_edit_requests WHERE id=$1`, [res.id])
    expect(row.rows[0]!.review_notes).toBe(AUTO_APPLIED_REVIEW_NOTE)
  })
})
