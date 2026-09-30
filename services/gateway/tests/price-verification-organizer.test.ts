// Integration tests for the price_verification authorization change: the
// dedicated 'procurement_2nd' position was removed and the duty folded
// into the organizer (see po-constants.ts/requisition-constants.ts and the
// isOrganizer checks in submitPOPriceVerification/verifyRequisitionPrices
// and their reject-family mutations). Deliberately uses a genuinely
// non-admin organizer context (role 'user', no permissions granted) rather
// than the usual system_admin ctx every other G1 test file uses — that
// would mask whether the organizer check alone is sufficient, since
// system_admin bypasses it regardless.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const ORGANIZER_EMAIL = 'g1-pv-organizer-test@fnc-erp.local'
const STRANGER_EMAIL = 'g1-pv-stranger-test@fnc-erp.local'
const SKU_PREFIX = 'G1PVORGTEST-'

let adminUserId: string
let organizerUserId: string
let strangerUserId: string
let adminCtx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }
let organizerCtx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }
let strangerCtx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }
// Tracked explicitly rather than matched by organizer/created_by at cleanup
// time — the tests deliberately reassign organizer_id away from whoever
// created the document, so a creator-based filter at cleanup would miss them.
const createdPoIds: string[] = []
const createdReqIds: string[] = []

async function makeProduct(suffix: string): Promise<string> {
  const sku = `${SKU_PREFIX}${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$3,'unit','general') RETURNING id`,
    [TEST_COMPANY_ID, sku, sku],
  )
  return r.rows[0]!.id
}

// Uses adminCtx to get past createPurchaseOrder's requirePermGW check (the
// organizer test user is deliberately granted no permissions at all), then
// reassigns organizer_id directly — isolates the test to exactly the
// isOrganizer check inside submitPOPriceVerification/rejectPOVerification*,
// not procurement.po.edit or anything else.
async function makePOAtPriceVerification(): Promise<{ poId: string; lineId: string }> {
  const productId = await makeProduct('po')
  const created = await resolvers.Mutation.createPurchaseOrder(
    null,
    { input: { purpose: 'stock', lines: [{ product_id: productId, description: 'x', qty: 4, unit_price: 1 }] } },
    adminCtx as never,
  )
  const poId = (created as { id: string }).id
  createdPoIds.push(poId)
  await pool.query(`UPDATE purchase_orders SET organizer_id=$1 WHERE id=$2`, [organizerUserId, poId])
  const lineRow = await pool.query<{ id: string }>(`SELECT id FROM po_lines WHERE po_id=$1`, [poId])
  const lineId = lineRow.rows[0]!.id
  await resolvers.Mutation.submitPOToInventoryCheck(null, { id: poId }, adminCtx as never)
  await resolvers.Mutation.confirmPOInventoryCheck(
    null,
    { id: poId, lineStockQtys: [{ lineId, qtyFromStock: 0 }] },
    adminCtx as never,
  )
  await resolvers.Mutation.submitPOMarketPricing(
    null,
    { id: poId, linePrices: [{ lineId, marketPrice: 5, currencyCode: 'IQD' }] },
    adminCtx as never,
  )
  return { poId, lineId }
}

async function makeReqAtPriceVerification(): Promise<{ reqId: string; lineId: string }> {
  const productId = await makeProduct('req')
  const created = await resolvers.Mutation.createRequisition(
    null,
    { input: { purpose: 'stock', lines: [{ product_id: productId, description: 'x', qty: 4, unit_price: 1 }] } },
    adminCtx as never,
  )
  const reqId = (created as { id: string }).id
  createdReqIds.push(reqId)
  await pool.query(`UPDATE requisitions SET organizer_id=$1 WHERE id=$2`, [organizerUserId, reqId])
  const lineRow = await pool.query<{ id: string }>(`SELECT id FROM po_lines WHERE requisition_id=$1`, [reqId])
  const lineId = lineRow.rows[0]!.id
  await resolvers.Mutation.submitRequisitionToInventoryCheck(null, { id: reqId }, adminCtx as never)
  await resolvers.Mutation.confirmRequisitionInventoryCheck(
    null,
    { id: reqId, lineStockQtys: [{ lineId, qtyFromStock: 0 }] },
    adminCtx as never,
  )
  await resolvers.Mutation.submitRequisitionMarketPricing(
    null,
    { id: reqId, linePrices: [{ lineId, marketPrice: 5, currencyCode: 'IQD' }] },
    adminCtx as never,
  )
  return { reqId, lineId }
}

async function cleanup(): Promise<void> {
  if (createdPoIds.length > 0) {
    await pool.query(`DELETE FROM po_approval_log WHERE po_id = ANY($1)`, [createdPoIds])
  }
  if (createdReqIds.length > 0) {
    await pool.query(`DELETE FROM requisition_approval_log WHERE requisition_id = ANY($1)`, [createdReqIds])
  }
  await pool.query(
    `DELETE FROM po_lines WHERE product_id IN (SELECT id FROM products WHERE company_id=$1 AND sku LIKE $2)`,
    [TEST_COMPANY_ID, `${SKU_PREFIX}%`],
  )
  if (createdPoIds.length > 0) {
    await pool.query(`DELETE FROM purchase_orders WHERE id = ANY($1)`, [createdPoIds])
  }
  if (createdReqIds.length > 0) {
    await pool.query(`DELETE FROM requisitions WHERE id = ANY($1)`, [createdReqIds])
  }
  await pool.query(`DELETE FROM products WHERE company_id=$1 AND sku LIKE $2`, [TEST_COMPANY_ID, `${SKU_PREFIX}%`])
}

beforeAll(async () => {
  const adminR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ('g1-pv-admin-test@fnc-erp.local','test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
  )
  adminUserId = adminR.rows[0]!.id
  adminCtx = { auth: { companyId: TEST_COMPANY_ID, userId: adminUserId, role: 'system_admin', module: 'all', sessionId: 'g1-pv-admin' } }

  const orgR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [ORGANIZER_EMAIL],
  )
  organizerUserId = orgR.rows[0]!.id
  // Deliberately plain 'user' role with no user_permissions rows granted —
  // proves the organizer check alone is what authorizes these mutations,
  // not some other bypass.
  organizerCtx = { auth: { companyId: TEST_COMPANY_ID, userId: organizerUserId, role: 'user', module: 'all', sessionId: 'g1-pv-organizer' } }

  const strR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [STRANGER_EMAIL],
  )
  strangerUserId = strR.rows[0]!.id
  strangerCtx = { auth: { companyId: TEST_COMPANY_ID, userId: strangerUserId, role: 'user', module: 'all', sessionId: 'g1-pv-stranger' } }

  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email IN ($1,$2,'g1-pv-admin-test@fnc-erp.local')`, [
    ORGANIZER_EMAIL,
    STRANGER_EMAIL,
  ])
  await pool.end()
})

describe('PO price_verification — organizer replaces the old procurement_2nd position', () => {
  it('the organizer (non-admin, no permissions) can submit price verification; a stranger cannot', async () => {
    const { poId, lineId } = await makePOAtPriceVerification()
    await expect(
      resolvers.Mutation.submitPOPriceVerification(
        null,
        { id: poId, lineAdjustments: [{ lineId, verifiedPrice: 5 }] },
        strangerCtx as never,
      ),
    ).rejects.toThrow(/organizer or an admin/i)

    const result = await resolvers.Mutation.submitPOPriceVerification(
      null,
      { id: poId, lineAdjustments: [{ lineId, verifiedPrice: 5 }] },
      organizerCtx as never,
    )
    expect((result as { status: string }).status).toBe('pending_approval')
  })

  it('the organizer can reject back to market pricing; a stranger cannot', async () => {
    const { poId, lineId } = await makePOAtPriceVerification()
    await expect(
      resolvers.Mutation.rejectPOVerificationToMarketPricing(
        null,
        { id: poId, reason: 'x', lineFlags: [{ lineId, reason: 'x' }] },
        strangerCtx as never,
      ),
    ).rejects.toThrow(/organizer or an admin/i)

    const result = await resolvers.Mutation.rejectPOVerificationToMarketPricing(
      null,
      { id: poId, reason: 'price looks off', lineFlags: [{ lineId, reason: 'price looks off' }] },
      organizerCtx as never,
    )
    expect((result as { status: string }).status).toBe('market_pricing')
  })

  it('the organizer can resolve a price_verification-origin flag; a stranger cannot', async () => {
    const { poId, lineId } = await makePOAtPriceVerification()
    await resolvers.Mutation.rejectPOVerificationToMarketPricing(
      null,
      { id: poId, reason: 'x', lineFlags: [{ lineId, reason: 'bad price' }] },
      organizerCtx as never,
    )
    await expect(resolvers.Mutation.resolveLineFlag(null, { lineId }, strangerCtx as never)).rejects.toThrow(
      /not authorized to resolve this flag/i,
    )
    const result = await resolvers.Mutation.resolveLineFlag(null, { lineId }, organizerCtx as never)
    expect(result).toBe(true)
  })
})

describe('Requisition price_verification — organizer replaces the old procurement_2nd position', () => {
  it('the organizer (non-admin, no permissions) can submit price verification; a stranger cannot', async () => {
    const { reqId, lineId } = await makeReqAtPriceVerification()
    await expect(
      resolvers.Mutation.verifyRequisitionPrices(
        null,
        { id: reqId, lineAdjustments: [{ lineId, verifiedPrice: 5 }] },
        strangerCtx as never,
      ),
    ).rejects.toThrow(/organizer or an admin/i)

    const result = await resolvers.Mutation.verifyRequisitionPrices(
      null,
      { id: reqId, lineAdjustments: [{ lineId, verifiedPrice: 5 }] },
      organizerCtx as never,
    )
    expect((result as { status: string }).status).toBe('pending_approval')
  })

  it('the organizer can reject back to market pricing; a stranger cannot', async () => {
    const { reqId, lineId } = await makeReqAtPriceVerification()
    await expect(
      resolvers.Mutation.rejectRequisitionVerificationToMarketPricing(
        null,
        { id: reqId, reason: 'x', lineFlags: [{ lineId, reason: 'x' }] },
        strangerCtx as never,
      ),
    ).rejects.toThrow(/organizer or an admin/i)

    const result = await resolvers.Mutation.rejectRequisitionVerificationToMarketPricing(
      null,
      { id: reqId, reason: 'price looks off', lineFlags: [{ lineId, reason: 'price looks off' }] },
      organizerCtx as never,
    )
    expect((result as { status: string }).status).toBe('market_pricing')
  })

  it('the organizer can resolve a price_verification-origin flag; a stranger cannot', async () => {
    const { reqId, lineId } = await makeReqAtPriceVerification()
    await resolvers.Mutation.rejectRequisitionVerificationToMarketPricing(
      null,
      { id: reqId, reason: 'x', lineFlags: [{ lineId, reason: 'bad price' }] },
      organizerCtx as never,
    )
    await expect(resolvers.Mutation.resolveLineFlag(null, { lineId }, strangerCtx as never)).rejects.toThrow(
      /not authorized to resolve this flag/i,
    )
    const result = await resolvers.Mutation.resolveLineFlag(null, { lineId }, organizerCtx as never)
    expect(result).toBe(true)
  })
})
