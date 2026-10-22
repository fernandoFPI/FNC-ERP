// Requisition edit requests: what they keep about the lines they touch, and the post-approval
// guard that has to read them.
//
// Regression: the requisition form sends a removed line as an object ({ id, description, qty,
// ... }), which applyRequisitionEditChanges accepts, but the guard in submitPOEditRequest that
// refuses to touch a line already bought against put those objects straight into a
// `pl.id = ANY($1)` uuid query. Submitting an edit request that removes a line from an
// already-approved requisition therefore failed with an invalid-uuid error instead of reaching
// the review queue. Same payload-shape family as the PO side (po-edit-request-details.test.ts).
//
// Real Postgres, nothing mocked.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'
import { AUTO_APPLIED_REQUISITION_REVIEW_NOTE, isAutoAppliedEditRequest } from '../src/lib/poEditChanges.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const EMAIL_PREFIX = 'req-edit-details-test-'
const SKU_PREFIX = 'REDTEST-'

let requesterId: string
let adminId: string

const ctxFor = (userId: string, role: string) =>
  ({
    auth: { companyId: TEST_COMPANY_ID, userId, role, module: 'all', sessionId: 'red-test' },
  }) as never

async function makeUser(key: string, first: string, last: string): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, first_name, last_name) VALUES ($1,'test-hash-not-used',$2,$3)
     ON CONFLICT (email) DO UPDATE SET first_name=EXCLUDED.first_name, last_name=EXCLUDED.last_name RETURNING id`,
    [`${EMAIL_PREFIX}${key}@fnc-erp.local`, first, last],
  )
  return r.rows[0]!.id
}

// A requisition organised by the requester, with two lines, forced to `status`.
async function makeRequisition(status: string): Promise<{ reqId: string; cableId: string; boxId: string }> {
  const sku = `${SKU_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const prod = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$2,'unit','general') RETURNING id`,
    [TEST_COMPANY_ID, sku],
  )
  const created = (await resolvers.Mutation.createRequisition(
    null,
    {
      input: {
        purpose: 'stock',
        lines: [
          { product_id: prod.rows[0]!.id, description: 'Cable 3x2.5', qty: 12, unit_price: 4500 },
          { product_id: prod.rows[0]!.id, description: 'Junction box', qty: 3, unit_price: 900 },
        ],
      },
    },
    ctxFor(requesterId, 'system_admin'),
  )) as { id: string }
  await pool.query(`UPDATE requisitions SET status=$1 WHERE id=$2`, [status, created.id])
  const lines = await pool.query<{ id: string; description: string }>(
    `SELECT id, description FROM po_lines WHERE requisition_id=$1 ORDER BY line_number`,
    [created.id],
  )
  return {
    reqId: created.id,
    cableId: lines.rows.find((l) => l.description === 'Cable 3x2.5')!.id,
    boxId: lines.rows.find((l) => l.description === 'Junction box')!.id,
  }
}

async function cleanup(): Promise<void> {
  const reqs = `SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id IN (SELECT id FROM users WHERE email LIKE $2)`
  const args = [TEST_COMPANY_ID, `${EMAIL_PREFIX}%`]
  await pool.query(`DELETE FROM po_edit_requests WHERE requisition_id IN (${reqs})`, args)
  await pool.query(`DELETE FROM requisition_approval_log WHERE requisition_id IN (${reqs})`, args)
  await pool.query(`DELETE FROM po_lines WHERE requisition_id IN (${reqs})`, args)
  await pool.query(`DELETE FROM requisitions WHERE id IN (${reqs})`, args)
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
    removed?: (string | { id: string; description?: string; qty?: number })[]
  }
}
const storedChanges = async (requestId: string): Promise<StoredChanges> =>
  (await pool.query<{ changes: StoredChanges }>(`SELECT changes FROM po_edit_requests WHERE id=$1`, [requestId])).rows[0]!.changes

const submit = (reqId: string, changes: unknown, as = requesterId) =>
  resolvers.Mutation.submitPOEditRequest(
    null,
    { requisitionId: reqId, changes: JSON.stringify(changes) } as never,
    ctxFor(as, 'user'),
  ) as Promise<{ id: string; status: string }>

describe('submitting an edit request on an approved requisition', () => {
  it('accepts a removal sent as an object, the way the requisition form sends it', async () => {
    const { reqId, boxId } = await makeRequisition('approved')
    const res = await submit(reqId, {
      lines: { removed: [{ id: boxId, description: 'Junction box', qty: 3, unit_price: 900, uom: 'unit' }] },
    })
    expect(res.status).toBe('pending')
  })

  it('accepts a removal sent as a bare id, and an edit', async () => {
    const { reqId, cableId, boxId } = await makeRequisition('approved')
    const res = await submit(reqId, {
      lines: { edited: [{ id: cableId, field: 'qty_ordered', from: 12, to: 20 }], removed: [boxId] },
    })
    expect(res.status).toBe('pending')
  })

  it('still lets an admin review it: approving deletes the line but the request keeps its name', async () => {
    const { reqId, boxId } = await makeRequisition('approved')
    const res = await submit(reqId, { lines: { removed: [boxId] } })
    await resolvers.Mutation.approvePOEditRequest(
      null,
      { requisitionId: reqId, requestId: res.id } as never,
      ctxFor(adminId, 'system_admin'),
    )
    expect((await pool.query(`SELECT 1 FROM po_lines WHERE id=$1`, [boxId])).rows).toHaveLength(0)
    expect((await storedChanges(res.id)).lines?.removed?.[0]).toMatchObject({ id: boxId, description: 'Junction box', qty: 3 })
  })
})

describe('requisition edit requests keep the names of the lines they touch', () => {
  it('names an edited line and a removed line that were sent without names', async () => {
    const { reqId, cableId, boxId } = await makeRequisition('approved')
    const res = await submit(reqId, {
      lines: { edited: [{ id: cableId, field: 'unit_price', from: 4500, to: 4800 }], removed: [boxId] },
    })
    const stored = await storedChanges(res.id)
    expect(stored.lines?.edited?.[0]).toMatchObject({ id: cableId, description: 'Cable 3x2.5' })
    expect(stored.lines?.removed?.[0]).toMatchObject({ id: boxId, description: 'Junction box', qty: 3 })
  })

  it('names the lines of an edit applied straight away on a requisition not yet approved', async () => {
    const { reqId, boxId } = await makeRequisition('draft')
    const res = await submit(reqId, { lines: { removed: [boxId] } })
    expect(res.status).toBe('approved')
    expect((await storedChanges(res.id)).lines?.removed?.[0]).toMatchObject({ id: boxId, description: 'Junction box' })
  })
})

describe('the requisition query returns what the history card needs', () => {
  type Row = { id: string; status: string; auto_applied: boolean | null; requested_by_name: string | null; reviewed_by_name: string | null }
  const history = async (reqId: string): Promise<Row[]> =>
    (
      (await resolvers.Query.requisition(null, { id: reqId }, ctxFor(adminId, 'system_admin'))) as {
        edit_requests: Row[]
      }
    ).edit_requests

  it("flags an auto-applied request and returns people's names", async () => {
    const { reqId, boxId } = await makeRequisition('draft')
    await submit(reqId, { lines: { removed: [boxId] } })
    const [row] = await history(reqId)
    expect(row).toMatchObject({ status: 'approved', auto_applied: true, requested_by_name: 'Yazin Requester', reviewed_by_name: 'Yazin Requester' })
  })

  it('does not flag a request an admin reviewed', async () => {
    const { reqId, boxId } = await makeRequisition('approved')
    const res = await submit(reqId, { lines: { removed: [boxId] } })
    await resolvers.Mutation.rejectPOEditRequest(
      null,
      { requisitionId: reqId, requestId: res.id, reviewNotes: 'Keep the box' } as never,
      ctxFor(adminId, 'system_admin'),
    )
    const [row] = await history(reqId)
    expect(row).toMatchObject({ status: 'rejected', auto_applied: false, reviewed_by_name: 'Nadia Admin' })
  })
})

describe('the auto-apply note', () => {
  it('is written from the one shared constant, and recognised by the same one', async () => {
    const { reqId, boxId } = await makeRequisition('draft')
    const res = await submit(reqId, { lines: { removed: [boxId] } })
    const row = await pool.query<Record<string, unknown>>(`SELECT * FROM po_edit_requests WHERE id=$1`, [res.id])
    expect(row.rows[0]!.review_notes).toBe(AUTO_APPLIED_REQUISITION_REVIEW_NOTE)
    expect(isAutoAppliedEditRequest(row.rows[0]!)).toBe(true)
  })
})

describe('the money effect of a requisition edit request', () => {
  interface Impact {
    totals: { currency_code: string; before: string; after: string }[]
    lines: { id: string; line_number: number | null; before: number | null; after: number | null }[]
    failure?: string | null
  }
  const impactFor = async (requestId: string, role = 'system_admin', userId = adminId): Promise<Impact | null> =>
    (await resolvers.Query.poEditRequestImpact(null, { requestId } as never, ctxFor(userId, role))) as Impact | null
  const sumTotals = async (reqId: string): Promise<number> =>
    parseFloat(
      (await pool.query<{ t: string }>(`SELECT COALESCE(SUM(total_price),0)::text AS t FROM po_lines WHERE requisition_id=$1`, [reqId])).rows[0]!.t,
    )

  it('dry-runs a pending removal and leaves the requisition untouched', async () => {
    const { reqId, boxId } = await makeRequisition('approved')
    const res = await submit(reqId, { lines: { removed: [boxId] } })
    const totalBefore = await sumTotals(reqId)
    const linesBefore = (await pool.query(`SELECT count(*)::int AS n FROM po_lines WHERE requisition_id=$1`, [reqId])).rows[0]!.n

    const i = (await impactFor(res.id))!
    expect(parseFloat(i.totals[0]!.before)).toBe(totalBefore)
    expect(parseFloat(i.totals[0]!.after)).toBe(totalBefore - 2700)
    expect(i.lines).toMatchObject([{ id: boxId, before: 2700, after: null }])

    expect(await sumTotals(reqId)).toBe(totalBefore)
    expect((await pool.query(`SELECT count(*)::int AS n FROM po_lines WHERE requisition_id=$1`, [reqId])).rows[0]!.n).toBe(linesBefore)
  })

  it('gives the totals that approving it then produces, and keeps them with the request', async () => {
    const { reqId, cableId, boxId } = await makeRequisition('approved')
    const res = await submit(reqId, {
      lines: { edited: [{ id: cableId, field: 'qty_ordered', from: 12, to: 20 }], removed: [boxId] },
    })
    const predicted = (await impactFor(res.id))!
    await resolvers.Mutation.approvePOEditRequest(null, { requisitionId: reqId, requestId: res.id } as never, ctxFor(adminId, 'system_admin'))
    expect(await sumTotals(reqId)).toBe(parseFloat(predicted.totals[0]!.after))

    const afterwards = (await impactFor(res.id))!
    expect(afterwards.totals).toEqual(predicted.totals)
  })

  it('shows reviewers the impact and nobody else', async () => {
    const { reqId, boxId } = await makeRequisition('approved')
    const res = await submit(reqId, { lines: { removed: [boxId] } })
    expect(await impactFor(res.id, 'company_admin')).not.toBeNull()
    expect(await impactFor(res.id, 'user', requesterId)).toBeNull()
  })

  it('records the impact of an edit applied straight away on a requisition not yet approved', async () => {
    const { reqId, boxId } = await makeRequisition('draft')
    const before = await sumTotals(reqId)
    const res = await submit(reqId, { lines: { removed: [boxId] } })
    const i = (await impactFor(res.id))!
    expect(parseFloat(i.totals[0]!.before)).toBe(before)
    expect(parseFloat(i.totals[0]!.after)).toBe(before - 2700)
  })
})
