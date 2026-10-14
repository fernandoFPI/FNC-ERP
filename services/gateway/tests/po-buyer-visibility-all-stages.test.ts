// Regression coverage for a real visibility request: a buyer position
// holder used to see a PO's detail page only while it sat at
// 'items_bought' (callerHasCurrentStagePositionGW's own case for that
// status) — every other stage, including both earlier ones (draft,
// approved) and the late-stage finance ones (finance_audit, invoiced,
// completed), returned the viewerRestricted stub unless the caller was
// also the organizer, an admin, or finance team. purchaseOrder(id) now
// treats holding the 'buyer' position as full visibility regardless of
// the PO's current status. Real-Postgres pattern, same as
// requisition-items-bought.test.ts's own buyer setup.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const TEST_USER_EMAIL = 'po-buyer-visibility-test@fnc-erp.local'
const BUYER_USER_EMAIL = 'po-buyer-visibility-buyer-test@fnc-erp.local'
const BUYER_EMPLOYEE_NUMBER = 'PO-BUYER-VIS-TEST'
const PO_PREFIX = 'POBUYERVISTEST-PO-'

let userId: string
let buyerUserId: string
let buyerEmployeeId: string
let buyerCtx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }

async function makePO(status: string): Promise<string> {
  const poNumber = `${PO_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO purchase_orders (company_id, po_number, created_by, status, currency_code, base_currency_code, purpose)
     VALUES ($1,$2,$3,$4,'IQD','IQD','stock') RETURNING id`,
    [TEST_COMPANY_ID, poNumber, userId, status],
  )
  return r.rows[0]!.id
}

async function cleanup(): Promise<void> {
  await pool.query(`DELETE FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2`, [
    TEST_COMPANY_ID,
    `${PO_PREFIX}%`,
  ])
}

beforeAll(async () => {
  const userR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  userId = userR.rows[0]!.id

  const buyerUserR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [BUYER_USER_EMAIL],
  )
  buyerUserId = buyerUserR.rows[0]!.id
  const buyerEmployeeR = await pool.query<{ id: string }>(
    `INSERT INTO employees (company_id, user_id, first_name, last_name, hire_date, employee_number)
     VALUES ($1,$2,'Test','Buyer',CURRENT_DATE,$3)
     ON CONFLICT (company_id, employee_number) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING id`,
    [TEST_COMPANY_ID, buyerUserId, BUYER_EMPLOYEE_NUMBER],
  )
  buyerEmployeeId = buyerEmployeeR.rows[0]!.id
  // Company-wide 'buyer' grant (project_id/department_id/branch_id all
  // null) — not the PO's organizer, not an admin, not finance team, not
  // holding store_keeper/store_pricing/procurement_officer either.
  await pool.query(`DELETE FROM po_position_assignments WHERE employee_id=$1 AND position='buyer'`, [
    buyerEmployeeId,
  ])
  await pool.query(
    `INSERT INTO po_position_assignments (company_id, employee_id, position, is_active, assigned_by)
     VALUES ($1,$2,'buyer',true,$3)`,
    [TEST_COMPANY_ID, buyerEmployeeId, userId],
  )
  buyerCtx = {
    auth: {
      companyId: TEST_COMPANY_ID,
      userId: buyerUserId,
      role: 'user',
      module: 'all',
      sessionId: 'po-buyer-vis-test-buyer',
    },
  }

  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM po_position_assignments WHERE employee_id=$1 AND position='buyer'`, [
    buyerEmployeeId,
  ])
  await pool.query(`DELETE FROM employees WHERE id=$1`, [buyerEmployeeId])
  await pool.query(`DELETE FROM users WHERE email IN ($1,$2)`, [TEST_USER_EMAIL, BUYER_USER_EMAIL])
  await pool.end()
})

describe('purchaseOrder(id) — buyer position sees every stage', () => {
  it.each(['draft', 'approved', 'ready_to_issue', 'goods_received', 'finance_audit', 'invoiced', 'completed'])(
    'is not viewerRestricted for a buyer position holder when the PO is %s',
    async (status) => {
      const poId = await makePO(status)
      const result = (await resolvers.Query.purchaseOrder(null, { id: poId }, buyerCtx as never)) as {
        viewerRestricted: boolean
      }
      expect(result.viewerRestricted).toBe(false)
    },
  )

  it('does not grant visibility through the buyer check for someone who holds no position at all', async () => {
    // A second, genuinely unprivileged user (no po_position_assignments row,
    // not the organizer, not admin, not finance team) — proves the new
    // isBuyer check is additive, not a blanket loosening of the gate.
    // Covers the same ground as po-currency-totals.test.ts's own
    // viewerRestricted regression, scoped here to a non-items_bought status.
    const unauthorizedR = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
      ['po-buyer-visibility-unauth-test@fnc-erp.local'],
    )
    const unauthorizedCtx = {
      auth: {
        companyId: TEST_COMPANY_ID,
        userId: unauthorizedR.rows[0]!.id,
        role: 'user',
        module: 'all',
        sessionId: 'po-buyer-vis-test-unauth',
      },
    }
    const poId = await makePO('approved')
    const result = (await resolvers.Query.purchaseOrder(
      null,
      { id: poId },
      unauthorizedCtx as never,
    )) as { viewerRestricted: boolean }
    expect(result.viewerRestricted).toBe(true)
    await pool.query(`DELETE FROM users WHERE email=$1`, [
      'po-buyer-visibility-unauth-test@fnc-erp.local',
    ])
  })
})
