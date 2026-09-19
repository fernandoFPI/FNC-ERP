// Regression test for a real production authorization bug: isAdminGW used
// to treat ANY module_admin as a full PO/requisition-authority bypass,
// regardless of which module they actually administer. A user who was
// granted module_admin for 'projects' (and nothing procurement-specific —
// no po_position_assignments, no dept-head, no assigned_approver_id) could
// approve/reject/cancel/delete any PO or requisition company-wide. Fixed by
// hasProcurementAuthorityGW, which only lets a module_admin bypass when
// their own module is 'procurement' (mirrors isProjectsModuleAdminGW's
// existing, already-correct pattern).
//
// This exercises the real production code path end to end: addUserRole
// (the same mutation the admin UI calls) grants the role and triggers
// applyModuleAdminPermissions, exactly as it did for the real affected
// user — not a hand-inserted user_permissions row.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const ADMIN_EMAIL = 'g1-authority-scope-admin-test@fnc-erp.local'
const MODADMIN_EMAIL = 'g1-authority-scope-modadmin-test@fnc-erp.local'
const SKU_PREFIX = 'G1AUTHTEST-'

let adminUserId: string
let modAdminUserId: string
let adminCtx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }
let modAdminCtx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }

async function makeProduct(suffix: string): Promise<string> {
  const sku = `${SKU_PREFIX}${suffix}-${Date.now()}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, category) VALUES ($1,$2,$3,'unit','general') RETURNING id`,
    [TEST_COMPANY_ID, sku, sku],
  )
  return r.rows[0]!.id
}

async function makeReqAtPendingApproval(): Promise<string> {
  const productId = await makeProduct('pending')
  const created = await resolvers.Mutation.createRequisition(
    null,
    { input: { purpose: 'stock', lines: [{ product_id: productId, description: 'x', qty: 1, unit_price: 5 }] } },
    adminCtx as never,
  )
  const reqId = (created as { id: string }).id
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
  await resolvers.Mutation.verifyRequisitionPrices(
    null,
    { id: reqId, lineAdjustments: [{ lineId, verifiedPrice: 5 }] },
    adminCtx as never,
  )
  return reqId
}

async function setModAdminModule(module: string): Promise<void> {
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM user_company_roles WHERE user_id=$1 AND company_id=$2`,
    [modAdminUserId, TEST_COMPANY_ID],
  )
  if (existing.rows[0]) {
    await resolvers.Mutation.updateUserRole(
      null,
      { roleId: existing.rows[0].id, input: { module } },
      adminCtx as never,
    )
  } else {
    await resolvers.Mutation.addUserRole(
      null,
      { userId: modAdminUserId, input: { companyId: TEST_COMPANY_ID, module, role: 'module_admin' } },
      adminCtx as never,
    )
  }
}

async function cleanup(): Promise<void> {
  await pool.query(
    `DELETE FROM requisition_approval_log WHERE requisition_id IN (SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id=$2)`,
    [TEST_COMPANY_ID, adminUserId],
  )
  await pool.query(
    `DELETE FROM po_lines WHERE requisition_id IN (SELECT id FROM requisitions WHERE company_id=$1 AND organizer_id=$2)`,
    [TEST_COMPANY_ID, adminUserId],
  )
  await pool.query(`DELETE FROM requisitions WHERE company_id=$1 AND organizer_id=$2`, [
    TEST_COMPANY_ID,
    adminUserId,
  ])
  await pool.query(`DELETE FROM products WHERE company_id=$1 AND sku LIKE $2`, [TEST_COMPANY_ID, `${SKU_PREFIX}%`])
}

beforeAll(async () => {
  const adminR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [ADMIN_EMAIL],
  )
  adminUserId = adminR.rows[0]!.id
  adminCtx = {
    auth: { companyId: TEST_COMPANY_ID, userId: adminUserId, role: 'system_admin', module: 'all', sessionId: 'g1-authority-test-admin' },
  }

  const modAdminR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [MODADMIN_EMAIL],
  )
  modAdminUserId = modAdminR.rows[0]!.id
  // No employees row for modAdminUserId — deliberately: the real affected
  // production user had zero po_position_assignments, no dept-head grant,
  // no assigned_approver_id anywhere. The only thing that could explain PO/
  // requisition authority is the role check itself.
  modAdminCtx = {
    auth: { companyId: TEST_COMPANY_ID, userId: modAdminUserId, role: 'module_admin', module: 'projects', sessionId: 'g1-authority-test-modadmin' },
  }

  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM user_permissions WHERE user_id=$1 AND company_id=$2`, [modAdminUserId, TEST_COMPANY_ID])
  await pool.query(`DELETE FROM user_company_roles WHERE user_id=$1 AND company_id=$2`, [modAdminUserId, TEST_COMPANY_ID])
  await pool.query(`DELETE FROM users WHERE email=$1`, [MODADMIN_EMAIL])
  await pool.query(`DELETE FROM users WHERE email=$1`, [ADMIN_EMAIL])
  await pool.end()
})

describe('module_admin authority is scoped to their own module', () => {
  it('a projects module_admin with no procurement-specific grant cannot approve a requisition', async () => {
    await setModAdminModule('projects')
    const reqId = await makeReqAtPendingApproval()

    await expect(
      resolvers.Mutation.approveRequisition(null, { id: reqId }, modAdminCtx as never),
    ).rejects.toThrow(/not authorized to approve this requisition/i)
  })

  it('a projects module_admin with no procurement-specific grant cannot reject a requisition', async () => {
    await setModAdminModule('projects')
    const reqId = await makeReqAtPendingApproval()

    await expect(
      resolvers.Mutation.rejectRequisitionApproval(null, { id: reqId, reason: 'trying anyway' }, modAdminCtx as never),
    ).rejects.toThrow(/not authorized to reject this requisition/i)
  })

  it('a procurement module_admin (real grant, via addUserRole/applyModuleAdminPermissions) CAN approve a requisition', async () => {
    await setModAdminModule('procurement')
    const reqId = await makeReqAtPendingApproval()

    const procurementCtx = {
      auth: { ...modAdminCtx.auth, module: 'procurement' },
    }
    const result = await resolvers.Mutation.approveRequisition(null, { id: reqId }, procurementCtx as never)
    expect(['items_bought', 'sourcing']).toContain((result as { status: string }).status)
  })
})
