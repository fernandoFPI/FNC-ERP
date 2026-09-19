// Integration tests for migration 279's line-level review flags — the
// reject-with-a-flagged-line-and-reason feature added to every PO/
// requisition reject/send-back mutation. po_lines is the one table both
// document types' lines live in, so this covers both through the shared
// applyLineFlags/markLinesAddressed/resolveLineFlag machinery, same
// real-Postgres pattern as the other G1 test files.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const TEST_USER_EMAIL = 'g1-line-flags-test@fnc-erp.local'
const DEPTHEAD_EMAIL = 'g1-line-flags-depthead-test@fnc-erp.local'
const SKU_PREFIX = 'G1FLAGTEST-'

let userId: string
let deptHeadUserId: string
let ctx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }
let strangerCtx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }

async function makeProduct(suffix: string): Promise<string> {
  const sku = `${SKU_PREFIX}${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$3,'unit','general') RETURNING id`,
    [TEST_COMPANY_ID, sku, sku],
  )
  return r.rows[0]!.id
}

async function makeReqAtPriceVerification(): Promise<{ reqId: string; lineId: string }> {
  const productId = await makeProduct('pv')
  const created = await resolvers.Mutation.createRequisition(
    null,
    { input: { purpose: 'stock', lines: [{ product_id: productId, description: 'x', qty: 3, unit_price: 1 }] } },
    ctx as never,
  )
  const reqId = (created as { id: string }).id
  const lineRow = await pool.query<{ id: string }>(`SELECT id FROM po_lines WHERE requisition_id=$1`, [reqId])
  const lineId = lineRow.rows[0]!.id
  await resolvers.Mutation.submitRequisitionToInventoryCheck(null, { id: reqId }, ctx as never)
  await resolvers.Mutation.confirmRequisitionInventoryCheck(
    null,
    { id: reqId, lineStockQtys: [{ lineId, qtyFromStock: 0 }] },
    ctx as never,
  )
  await resolvers.Mutation.submitRequisitionMarketPricing(
    null,
    { id: reqId, linePrices: [{ lineId, marketPrice: 5, currencyCode: 'IQD' }] },
    ctx as never,
  )
  return { reqId, lineId }
}

async function makeReqAtPendingApproval(): Promise<{ reqId: string; lineId: string }> {
  const { reqId, lineId } = await makeReqAtPriceVerification()
  await resolvers.Mutation.verifyRequisitionPrices(
    null,
    { id: reqId, lineAdjustments: [{ lineId, verifiedPrice: 5 }] },
    ctx as never,
  )
  return { reqId, lineId }
}

async function cleanup(): Promise<void> {
  await pool.query(
    `DELETE FROM requisition_approval_log WHERE requisition_id IN (SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id=$2)`,
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
  ctx = { auth: { companyId: TEST_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'g1-flag-test' } }

  const dhR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [DEPTHEAD_EMAIL],
  )
  deptHeadUserId = dhR.rows[0]!.id
  strangerCtx = {
    auth: { companyId: TEST_COMPANY_ID, userId: deptHeadUserId, role: 'user', module: 'all', sessionId: 'g1-flag-test-stranger' },
  }

  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.query(`DELETE FROM users WHERE email=$1`, [DEPTHEAD_EMAIL])
  await pool.end()
})

describe('applyLineFlags — required, validated, persisted', () => {
  it('rejects with no lineFlags at all', async () => {
    const { reqId } = await makeReqAtPriceVerification()
    await expect(
      resolvers.Mutation.rejectRequisitionVerificationToMarketPricing(
        null,
        { id: reqId, reason: 'x', lineFlags: [] },
        ctx as never,
      ),
    ).rejects.toThrow(/at least one line must be flagged/i)
  })

  it('rejects a flagged line with an empty reason', async () => {
    const { reqId, lineId } = await makeReqAtPriceVerification()
    await expect(
      resolvers.Mutation.rejectRequisitionVerificationToMarketPricing(
        null,
        { id: reqId, reason: 'x', lineFlags: [{ lineId, reason: '  ' }] },
        ctx as never,
      ),
    ).rejects.toThrow(/every flagged line needs a reason/i)
  })

  it('rejects a lineId that belongs to a different requisition', async () => {
    const { reqId } = await makeReqAtPriceVerification()
    const { lineId: otherLineId } = await makeReqAtPriceVerification()
    await expect(
      resolvers.Mutation.rejectRequisitionVerificationToMarketPricing(
        null,
        { id: reqId, reason: 'x', lineFlags: [{ lineId: otherLineId, reason: 'x' }] },
        ctx as never,
      ),
    ).rejects.toThrow(/do not belong to this document/i)
  })

  it('persists flag_reason/flagged_at/flagged_by_name/flagged_from_status, visible on the next read', async () => {
    const { reqId, lineId } = await makeReqAtPriceVerification()
    await resolvers.Mutation.rejectRequisitionVerificationToInventoryCheck(
      null,
      { id: reqId, reason: 'overall reason', lineFlags: [{ lineId, reason: 'wrong product entirely' }] },
      ctx as never,
    )
    const result = await resolvers.Query.requisition(null, { id: reqId }, ctx as never)
    const line = (result as { lines: { id: string; flag_reason: string; flagged_from_status: string; flagged_by_name: string; flag_addressed_at: string | null; flag_resolved_at: string | null }[] }).lines.find(
      (l) => l.id === lineId,
    )!
    expect(line.flag_reason).toBe('wrong product entirely')
    expect(line.flagged_from_status).toBe('price_verification')
    expect(line.flagged_by_name).toBeTruthy()
    expect(line.flag_addressed_at).toBeNull()
    expect(line.flag_resolved_at).toBeNull()
  })
})

describe('markLinesAddressed — auto-downgrade on the next forward action', () => {
  it('confirmRequisitionInventoryCheck addresses a flag sent back to inventory_check', async () => {
    const { reqId, lineId } = await makeReqAtPriceVerification()
    await resolvers.Mutation.rejectRequisitionVerificationToInventoryCheck(
      null,
      { id: reqId, reason: 'x', lineFlags: [{ lineId, reason: 'wrong qty' }] },
      ctx as never,
    )
    let line = await pool.query<{ flag_addressed_at: string | null }>(`SELECT flag_addressed_at FROM po_lines WHERE id=$1`, [lineId])
    expect(line.rows[0]!.flag_addressed_at).toBeNull()

    await resolvers.Mutation.confirmRequisitionInventoryCheck(
      null,
      { id: reqId, lineStockQtys: [{ lineId, qtyFromStock: 0 }] },
      ctx as never,
    )
    line = await pool.query(`SELECT flag_addressed_at FROM po_lines WHERE id=$1`, [lineId])
    expect(line.rows[0]!.flag_addressed_at).not.toBeNull()

    // Still flagged (not cleared) — just downgraded to addressed.
    const full = await pool.query<{ flag_reason: string; flag_resolved_at: string | null }>(
      `SELECT flag_reason, flag_resolved_at FROM po_lines WHERE id=$1`,
      [lineId],
    )
    expect(full.rows[0]!.flag_reason).toBe('wrong qty')
    expect(full.rows[0]!.flag_resolved_at).toBeNull()
  })

  it('resetRequisitionToDraft + submitRequisitionToInventoryCheck addresses every open flag on the requisition', async () => {
    const { reqId, lineId } = await makeReqAtPriceVerification()
    await resolvers.Mutation.resetRequisitionToDraft(
      null,
      { id: reqId, reason: 'start over', lineFlags: [{ lineId, reason: 'everything wrong' }] },
      ctx as never,
    )
    await resolvers.Mutation.submitRequisitionToInventoryCheck(null, { id: reqId }, ctx as never)
    const line = await pool.query<{ flag_addressed_at: string | null }>(`SELECT flag_addressed_at FROM po_lines WHERE id=$1`, [lineId])
    expect(line.rows[0]!.flag_addressed_at).not.toBeNull()
  })
})

describe('resolveLineFlag', () => {
  it('requires an existing, unresolved flag', async () => {
    const { lineId } = await makeReqAtPriceVerification()
    await expect(resolvers.Mutation.resolveLineFlag(null, { lineId }, ctx as never)).rejects.toThrow(
      /no flag to resolve/i,
    )
  })

  it('procurement_2nd (or admin) can resolve a price_verification-origin flag; a stranger cannot', async () => {
    const { reqId, lineId } = await makeReqAtPriceVerification()
    await resolvers.Mutation.rejectRequisitionVerificationToMarketPricing(
      null,
      { id: reqId, reason: 'x', lineFlags: [{ lineId, reason: 'bad price' }] },
      ctx as never,
    )
    await expect(resolvers.Mutation.resolveLineFlag(null, { lineId }, strangerCtx as never)).rejects.toThrow(
      /not authorized to resolve this flag/i,
    )
    const result = await resolvers.Mutation.resolveLineFlag(null, { lineId }, ctx as never)
    expect(result).toBe(true)
    const line = await pool.query<{ flag_resolved_at: string | null; flag_resolved_by: string | null }>(
      `SELECT flag_resolved_at, flag_resolved_by FROM po_lines WHERE id=$1`,
      [lineId],
    )
    expect(line.rows[0]!.flag_resolved_at).not.toBeNull()
    expect(line.rows[0]!.flag_resolved_by).toBe(userId)
  })

  it('cannot resolve the same flag twice', async () => {
    const { reqId, lineId } = await makeReqAtPriceVerification()
    await resolvers.Mutation.rejectRequisitionVerificationToMarketPricing(
      null,
      { id: reqId, reason: 'x', lineFlags: [{ lineId, reason: 'bad price' }] },
      ctx as never,
    )
    await resolvers.Mutation.resolveLineFlag(null, { lineId }, ctx as never)
    await expect(resolvers.Mutation.resolveLineFlag(null, { lineId }, ctx as never)).rejects.toThrow(
      /already resolved/i,
    )
  })

  it('re-flagging a resolved line starts a fresh cycle (clears addressed/resolved state)', async () => {
    const { reqId, lineId } = await makeReqAtPendingApproval()
    // Flag once from pending_approval, resolve it.
    await resolvers.Mutation.rejectRequisitionToMarketPricing(
      null,
      { id: reqId, reason: 'x', lineFlags: [{ lineId, reason: 'first complaint' }] },
      ctx as never,
    )
    await resolvers.Mutation.resolveLineFlag(null, { lineId }, ctx as never)

    // Drive it back to pending_approval and flag it again.
    await resolvers.Mutation.submitRequisitionMarketPricing(
      null,
      { id: reqId, linePrices: [{ lineId, marketPrice: 6, currencyCode: 'IQD' }] },
      ctx as never,
    )
    await resolvers.Mutation.verifyRequisitionPrices(
      null,
      { id: reqId, lineAdjustments: [{ lineId, verifiedPrice: 6 }] },
      ctx as never,
    )
    await resolvers.Mutation.rejectRequisitionApproval(
      null,
      { id: reqId, reason: 'x', lineFlags: [{ lineId, reason: 'second complaint' }] },
      ctx as never,
    )
    const line = await pool.query<{ flag_reason: string; flag_addressed_at: string | null; flag_resolved_at: string | null }>(
      `SELECT flag_reason, flag_addressed_at, flag_resolved_at FROM po_lines WHERE id=$1`,
      [lineId],
    )
    expect(line.rows[0]!.flag_reason).toBe('second complaint')
    expect(line.rows[0]!.flag_addressed_at).toBeNull()
    expect(line.rows[0]!.flag_resolved_at).toBeNull()
  })

  it('dept-head/approver/admin (not procurement_2nd alone) is required for a pending_approval-origin flag', async () => {
    const { reqId, lineId } = await makeReqAtPendingApproval()
    await resolvers.Mutation.rejectRequisitionApproval(
      null,
      { id: reqId, reason: 'x', lineFlags: [{ lineId, reason: 'needs rework' }] },
      ctx as never,
    )
    // ctx is system_admin, which passes hasProcurementAuthorityGW regardless
    // of stage — resolve succeeds.
    const result = await resolvers.Mutation.resolveLineFlag(null, { lineId }, ctx as never)
    expect(result).toBe(true)
  })
})
