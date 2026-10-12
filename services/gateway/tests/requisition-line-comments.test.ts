// Line Comments (reply/flag/resolve on a line) was already live on Purchase
// Orders, but po_line_comments.po_id was NOT NULL and every resolver
// required a real purchase_orders row — so it silently couldn't be used on
// a requisition-stage line, which has no po_id yet (po_lines.requisition_id
// is always set; po_id only exists once a vendor PO is created, see
// migration 258). Migration 297 made po_id nullable; this verifies the
// resolvers now accept a requisition id in the `poId` arg and derive
// ownership/ the real po_id from po_lines itself, same real-Postgres
// pattern as the other G1 test files.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const TEST_USER_EMAIL = 'req-line-comments-test@fnc-erp.local'
const SKU_PREFIX = 'REQLINECOMMENTSTEST-'

let userId: string
let ctx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }

async function makeProduct(): Promise<string> {
  const sku = `${SKU_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$3,'unit','general') RETURNING id`,
    [TEST_COMPANY_ID, sku, sku],
  )
  return r.rows[0]!.id
}

async function makeRequisition(): Promise<{ reqId: string; lineId: string }> {
  const productId = await makeProduct()
  const created = await resolvers.Mutation.createRequisition(
    null,
    { input: { purpose: 'stock', lines: [{ product_id: productId, description: 'x', qty: 1, unit_price: 1 }] } },
    ctx as never,
  )
  const reqId = (created as { id: string }).id
  const lineRow = await pool.query<{ id: string }>(`SELECT id FROM po_lines WHERE requisition_id=$1`, [reqId])
  return { reqId, lineId: lineRow.rows[0]!.id }
}

async function cleanup(): Promise<void> {
  await pool.query(
    `DELETE FROM po_line_comments WHERE po_line_id IN (
       SELECT pl.id FROM po_lines pl JOIN requisitions req ON req.id=pl.requisition_id
       WHERE req.company_id=$1 AND req.organizer_id=$2)`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(
    `DELETE FROM po_lines WHERE requisition_id IN (SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id=$2)`,
    [TEST_COMPANY_ID, userId],
  )
  await pool.query(`DELETE FROM requisitions WHERE company_id=$1 AND organizer_id=$2`, [TEST_COMPANY_ID, userId])
  await pool.query(`DELETE FROM products WHERE company_id=$1 AND sku LIKE $2`, [TEST_COMPANY_ID, `${SKU_PREFIX}%`])
}

beforeAll(async () => {
  const userR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  userId = userR.rows[0]!.id
  ctx = { auth: { companyId: TEST_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'req-line-comments-test' } }
  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('Line Comments on a requisition-stage line (no po_id yet)', () => {
  it('adds a flagged reply, lists it, and resolves it, using the requisition id as poId', async () => {
    const { reqId, lineId } = await makeRequisition()

    const added = await resolvers.Mutation.addPOLineComment(
      null,
      { poId: reqId, lineId, comment: 'Please mention the dates', flag: 'warning' },
      ctx as never,
    )
    const comment = added as { id: string; po_line_id: string; flag: string; resolved: boolean }
    expect(comment.po_line_id).toBe(lineId)
    expect(comment.flag).toBe('warning')
    expect(comment.resolved).toBe(false)

    // po_id stays null — no vendor PO exists for this line yet.
    const row = await pool.query<{ po_id: string | null }>(
      `SELECT po_id FROM po_line_comments WHERE id=$1`,
      [comment.id],
    )
    expect(row.rows[0]!.po_id).toBeNull()

    const list = (await resolvers.Query.poLineComments(null, { poId: reqId }, ctx as never)) as { id: string }[]
    expect(list.some((c) => c.id === comment.id)).toBe(true)

    const resolved = await resolvers.Mutation.resolvePOLineComment(
      null,
      { poId: reqId, commentId: comment.id },
      ctx as never,
    )
    expect((resolved as { resolved: boolean }).resolved).toBe(true)
  })

  it('rejects a comment on a line that does not belong to the given requisition', async () => {
    const { lineId } = await makeRequisition()
    const { reqId: otherReqId } = await makeRequisition()

    await expect(
      resolvers.Mutation.addPOLineComment(
        null,
        { poId: otherReqId, lineId, comment: 'should not be allowed' },
        ctx as never,
      ),
    ).rejects.toThrow('Line not found')
  })
})
