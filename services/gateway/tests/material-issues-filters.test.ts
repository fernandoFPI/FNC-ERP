// Coverage for the Store Out page's new search-by-PO/REQ/Store-In filters —
// materialIssues(poId, requisitionId, receiptNumber). receiptNumber has no
// direct FK from project_material_issues to a specific receipt, so it
// resolves via the PO both share (see the resolver's own comment). Real-
// Postgres pattern, same as cancel-material-issue-reservation.test.ts.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const TEST_USER_EMAIL = 'mi-filters-test@fnc-erp.local'
const PREFIX = 'MIFILTERTEST-'

let userId: string
let vendorId: string
let ctx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }

async function makePO(receiptNumber?: string): Promise<string> {
  const poNumber = `${PREFIX}PO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO purchase_orders (company_id, po_number, vendor_id, status, currency_code, purpose, created_by)
     VALUES ($1,$2,$3,'approved','IQD','stock',$4) RETURNING id`,
    [TEST_COMPANY_ID, poNumber, vendorId, userId],
  )
  const poId = r.rows[0]!.id
  if (receiptNumber) {
    await pool.query(
      `INSERT INTO po_receipts (po_id, receipt_number, received_date, received_by)
       VALUES ($1,$2,CURRENT_DATE,$3)`,
      [poId, receiptNumber, userId],
    )
  }
  return poId
}

async function makeRequisition(): Promise<string> {
  const reqNumber = `${PREFIX}REQ-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO requisitions (company_id, requisition_number, purpose, priority, organizer_id, status)
     VALUES ($1,$2,'stock','low',$3,'draft') RETURNING id`,
    [TEST_COMPANY_ID, reqNumber, userId],
  )
  return r.rows[0]!.id
}

async function makeIssue(opts: { poId?: string; requisitionId?: string }): Promise<string> {
  const issueNumber = `${PREFIX}SO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO project_material_issues (company_id, issue_number, issue_date, po_id, requisition_id, status, created_by)
     VALUES ($1,$2,CURRENT_DATE,$3,$4,'draft',$5) RETURNING id`,
    [TEST_COMPANY_ID, issueNumber, opts.poId ?? null, opts.requisitionId ?? null, userId],
  )
  return r.rows[0]!.id
}

async function cleanup(): Promise<void> {
  await pool.query(
    `DELETE FROM project_material_issues WHERE company_id=$1 AND issue_number LIKE $2`,
    [TEST_COMPANY_ID, `${PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM po_receipts WHERE po_id IN (SELECT id FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2)`,
    [TEST_COMPANY_ID, `${PREFIX}%`],
  )
  await pool.query(`DELETE FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2`, [
    TEST_COMPANY_ID,
    `${PREFIX}%`,
  ])
  await pool.query(`DELETE FROM requisitions WHERE company_id=$1 AND requisition_number LIKE $2`, [
    TEST_COMPANY_ID,
    `${PREFIX}%`,
  ])
}

beforeAll(async () => {
  const userR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  userId = userR.rows[0]!.id
  ctx = { auth: { companyId: TEST_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'mi-filters-test' } }

  const vendorR = await pool.query<{ id: string }>(`SELECT id FROM vendors WHERE company_id=$1 LIMIT 1`, [
    TEST_COMPANY_ID,
  ])
  vendorId =
    vendorR.rows[0]?.id ??
    (
      await pool.query<{ id: string }>(`INSERT INTO vendors (company_id, name) VALUES ($1,$2) RETURNING id`, [
        TEST_COMPANY_ID,
        `${PREFIX}Vendor`,
      ])
    ).rows[0]!.id

  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('materialIssues — poId/requisitionId/receiptNumber filters', () => {
  it('filters by poId', async () => {
    const poA = await makePO()
    const poB = await makePO()
    const issueA = await makeIssue({ poId: poA })
    await makeIssue({ poId: poB })

    const result = (await resolvers.Query.materialIssues(
      null,
      { poId: poA },
      ctx as never,
    )) as { id: string }[]
    expect(result.map((r) => r.id)).toEqual([issueA])
  })

  it('filters by requisitionId', async () => {
    const reqA = await makeRequisition()
    const reqB = await makeRequisition()
    const issueA = await makeIssue({ requisitionId: reqA })
    await makeIssue({ requisitionId: reqB })

    const result = (await resolvers.Query.materialIssues(
      null,
      { requisitionId: reqA },
      ctx as never,
    )) as { id: string; requisitionNumber: string | null }[]
    expect(result.map((r) => r.id)).toEqual([issueA])
    expect(result[0]!.requisitionNumber).not.toBeNull()
  })

  it('filters by receiptNumber, resolved via the PO both a receipt and a Store Out share', async () => {
    const receiptNumber = `${PREFIX}GRN-${Date.now()}`
    const poWithReceipt = await makePO(receiptNumber)
    const poWithoutReceipt = await makePO()
    const issueOnReceiptedPO = await makeIssue({ poId: poWithReceipt })
    await makeIssue({ poId: poWithoutReceipt })

    const exact = (await resolvers.Query.materialIssues(
      null,
      { receiptNumber },
      ctx as never,
    )) as { id: string }[]
    expect(exact.map((r) => r.id)).toEqual([issueOnReceiptedPO])

    // Partial match (ILIKE) — a user typing part of the receipt number
    // should still find it.
    const partial = (await resolvers.Query.materialIssues(
      null,
      { receiptNumber: receiptNumber.slice(-6) },
      ctx as never,
    )) as { id: string }[]
    expect(partial.map((r) => r.id)).toEqual([issueOnReceiptedPO])
  })

  it('returns nothing for a receiptNumber that matches no receipt', async () => {
    await makeIssue({ poId: await makePO() })
    const result = (await resolvers.Query.materialIssues(
      null,
      { receiptNumber: `${PREFIX}NOPE-${Date.now()}` },
      ctx as never,
    )) as { id: string }[]
    expect(result).toEqual([])
  })
})
