// Regression: sendPOToAudit's hasReceipt check only looked at po_receipts,
// but a direct-to-jobsite delivery (recordDirectDelivery) never creates one
// — it updates po_lines.qty_received straight away instead. So a fully-
// delivered jobsite PO could never be sent to finance audit at all, even
// though the PO detail page's own hasAnyReceipt check (fixed alongside this)
// correctly showed the Send to Finance Audit button. Found live on
// NF-PO-2026-0042: clicking the button threw "Record at least one receipt
// before sending this PO to finance audit" despite the delivery being fully
// recorded (qty_received === qty_ordered, cost posted to the project).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const TEST_USER_EMAIL = 'send-po-audit-dd-test@fnc-erp.local'
const SKU_PREFIX = 'SPADDTEST-'
const PO_PREFIX = 'SPADDTEST-PO-'

let userId: string
let vendorId: string
let ctx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }

async function makeProject(suffix: string): Promise<string> {
  const code = `${SKU_PREFIX}${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO projects (company_id, code, name, status, created_by) VALUES ($1,$2,$3,'ongoing',$4) RETURNING id`,
    [TEST_COMPANY_ID, code, code, userId],
  )
  return r.rows[0]!.id
}

// project_id and linked_project_id deliberately match — see
// project-material-return.test.ts's makeDirectDeliveryPO for why.
async function makeDirectDeliveryPO(projectId: string): Promise<string> {
  const poNumber = `${PO_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO purchase_orders (company_id, po_number, vendor_id, status, currency_code, purpose, project_id, linked_project_id, delivery_destination, created_by)
     VALUES ($1,$2,$3,'approved','IQD','project',$4,$4,'jobsite',$5) RETURNING id`,
    [TEST_COMPANY_ID, poNumber, vendorId, projectId, userId],
  )
  return r.rows[0]!.id
}

async function makePOLine(poId: string, qtyOrdered: number, unitPrice: number): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO po_lines (po_id, product_id, description, line_number, qty_ordered, unit_price, total_price, uom)
     VALUES ($1,NULL,'test direct-delivery line',1,$2,$3,$4,'unit') RETURNING id`,
    [poId, qtyOrdered, unitPrice, qtyOrdered * unitPrice],
  )
  return r.rows[0]!.id
}

async function cleanup(): Promise<void> {
  await pool.query(
    `DELETE FROM pending_product_catalog_items WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2)`,
    [TEST_COMPANY_ID, `${PO_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM project_cost_actuals WHERE project_id IN (SELECT id FROM projects WHERE company_id=$1 AND code LIKE $2)`,
    [TEST_COMPANY_ID, `${SKU_PREFIX}%`],
  )
  await pool.query(`DELETE FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2`, [
    TEST_COMPANY_ID,
    `${PO_PREFIX}%`,
  ])
  await pool.query(`DELETE FROM projects WHERE company_id=$1 AND code LIKE $2`, [
    TEST_COMPANY_ID,
    `${SKU_PREFIX}%`,
  ])
}

beforeAll(async () => {
  const userR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  userId = userR.rows[0]!.id
  ctx = { auth: { companyId: TEST_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'spadd-test' } }

  const vendorR = await pool.query<{ id: string }>(`SELECT id FROM vendors WHERE company_id=$1 LIMIT 1`, [
    TEST_COMPANY_ID,
  ])
  vendorId =
    vendorR.rows[0]?.id ??
    (
      await pool.query<{ id: string }>(
        `INSERT INTO vendors (company_id, name) VALUES ($1,$2) RETURNING id`,
        [TEST_COMPANY_ID, `${SKU_PREFIX}Vendor`],
      )
    ).rows[0]!.id

  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('sendPOToAudit — direct-to-jobsite delivery counts as a receipt', () => {
  it('sends a fully-delivered jobsite PO to audit without a po_receipts row', async () => {
    const projectId = await makeProject('audit-dd')
    const poId = await makeDirectDeliveryPO(projectId)
    const lineId = await makePOLine(poId, 2, 2.5)

    await resolvers.Mutation.recordDirectDelivery(
      null,
      {
        poId,
        input: {
          received_date: new Date().toISOString().slice(0, 10),
          lines: [{ po_line_id: lineId, qty_received: 2 }],
        },
      },
      ctx as never,
    )

    const receiptCount = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM po_receipts WHERE po_id=$1`,
      [poId],
    )
    expect(receiptCount.rows[0]!.n).toBe('0')

    const result = (await resolvers.Mutation.sendPOToAudit(null, { id: poId }, ctx as never)) as {
      status: string
    }
    expect(['finance_audit', 'finance_review']).toContain(result.status)
  })

  it('still rejects a jobsite PO with no delivery recorded at all', async () => {
    const projectId = await makeProject('audit-dd-empty')
    const poId = await makeDirectDeliveryPO(projectId)
    await makePOLine(poId, 2, 2.5)
    await pool.query(`UPDATE purchase_orders SET status='goods_received' WHERE id=$1`, [poId])

    await expect(resolvers.Mutation.sendPOToAudit(null, { id: poId }, ctx as never)).rejects.toThrow(
      /record at least one receipt/i,
    )
  })
})
