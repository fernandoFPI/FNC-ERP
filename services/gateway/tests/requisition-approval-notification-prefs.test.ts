// Regression for the "notify every active system_admin, with no way to opt
// out" gap: notifyDeptHeadsAndAdminsForRequisitionGW now skips a system_admin
// who has set notification_preferences.admin_requisition_approval = false —
// unless skipping them would leave nobody notified at all, in which case it
// notifies every admin anyway (resolveRequisitionApprovalRecipients).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers, resolveRequisitionApprovalRecipients } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const TEST_USER_EMAIL = 'g1-req-notify-prefs-test@fnc-erp.local'
const OPTED_IN_ADMIN_EMAIL = 'g1-req-notify-prefs-admin-in@fnc-erp.local'
const OPTED_OUT_ADMIN_EMAIL = 'g1-req-notify-prefs-admin-out@fnc-erp.local'
const SKU_PREFIX = 'G1NPTEST-'

let userId: string
let optedInAdminId: string
let optedOutAdminId: string
let ctx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }

async function makeProduct(suffix: string): Promise<string> {
  const sku = `${SKU_PREFIX}${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$3,'unit','general') RETURNING id`,
    [TEST_COMPANY_ID, sku, sku],
  )
  return r.rows[0]!.id
}

// Drives a fresh requisition all the way to pending_approval via the pricing
// path (0 from-stock), which is where verifyRequisitionPrices fires the
// (fire-and-forget) notifyDeptHeadsAndAdminsForRequisitionGW call.
async function makeReqAtPendingApproval() {
  const productId = await makeProduct('notify')
  const created = await resolvers.Mutation.createRequisition(
    null,
    { input: { purpose: 'stock', lines: [{ product_id: productId, description: 'x', qty: 1, unit_price: 1 }] } },
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
    { id: reqId, linePrices: [{ lineId, marketPrice: 10, currencyCode: 'IQD' }] },
    ctx as never,
  )
  await resolvers.Mutation.verifyRequisitionPrices(
    null,
    { id: reqId, lineAdjustments: [{ lineId, verifiedPrice: 10 }] },
    ctx as never,
  )
  return reqId
}

// The notify call is `void`-fired, not awaited by verifyRequisitionPrices —
// poll briefly for its service_outbox rows instead of assuming they exist
// the instant the mutation returns.
async function waitForOutboxRows(requisitionId: string, timeoutMs = 3000): Promise<{ userId: string }[]> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const r = await pool.query<{ payload: { userId: string } }>(
      `SELECT payload FROM service_outbox
       WHERE service='notifications' AND event_type='REQ_APPROVAL_REQUIRED'
         AND payload->>'requisitionId' = $1`,
      [requisitionId],
    )
    if (r.rows.length > 0 || Date.now() > deadline) {
      return r.rows.map((row) => ({ userId: row.payload.userId }))
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

async function cleanup(): Promise<void> {
  await pool.query(
    `DELETE FROM service_outbox WHERE payload->>'requisitionId' IN (SELECT id::text FROM requisitions WHERE company_id=$1 AND organizer_id=$2)`,
    [TEST_COMPANY_ID, userId],
  )
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
  ctx = { auth: { companyId: TEST_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'g1-notify-prefs-test' } }

  const inR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, is_active, notification_preferences) VALUES ($1,'test-hash-not-used',true,'{}')
     ON CONFLICT (email) DO UPDATE SET is_active=true, notification_preferences='{}' RETURNING id`,
    [OPTED_IN_ADMIN_EMAIL],
  )
  optedInAdminId = inR.rows[0]!.id
  const outR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, is_active, notification_preferences)
     VALUES ($1,'test-hash-not-used',true,'{"admin_requisition_approval": false}')
     ON CONFLICT (email) DO UPDATE SET is_active=true, notification_preferences='{"admin_requisition_approval": false}' RETURNING id`,
    [OPTED_OUT_ADMIN_EMAIL],
  )
  optedOutAdminId = outR.rows[0]!.id
  for (const adminId of [optedInAdminId, optedOutAdminId]) {
    await pool.query(
      `INSERT INTO user_company_roles (user_id, company_id, role, module, is_active) VALUES ($1,$2,'system_admin',NULL,true)
       ON CONFLICT (user_id, company_id, role, COALESCE(module, '')) DO UPDATE SET is_active=true`,
      [adminId, TEST_COMPANY_ID],
    )
  }

  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM user_company_roles WHERE user_id = ANY($1)`, [[optedInAdminId, optedOutAdminId]])
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [[optedInAdminId, optedOutAdminId]])
  await pool.end()
})

describe('resolveRequisitionApprovalRecipients (pure fallback logic)', () => {
  it('uses dept heads + eligible admins when that list is non-empty', () => {
    expect(resolveRequisitionApprovalRecipients(['dept-head'], ['admin-in'], ['admin-in', 'admin-out'])).toEqual([
      'dept-head',
      'admin-in',
    ])
  })

  it('falls back to every admin when dept heads + eligible admins is empty', () => {
    expect(resolveRequisitionApprovalRecipients([], [], ['admin-in', 'admin-out'])).toEqual(['admin-in', 'admin-out'])
  })

  it('returns nothing when even the fallback list is empty', () => {
    expect(resolveRequisitionApprovalRecipients([], [], [])).toEqual([])
  })
})

describe('notifyDeptHeadsAndAdminsForRequisitionGW — admin_requisition_approval opt-out', () => {
  it('skips an opted-out admin but still notifies an opted-in one', async () => {
    const reqId = await makeReqAtPendingApproval()
    const rows = await waitForOutboxRows(reqId)
    const notifiedIds = rows.map((r) => r.userId)
    expect(notifiedIds).toContain(optedInAdminId)
    expect(notifiedIds).not.toContain(optedOutAdminId)
  })
})
