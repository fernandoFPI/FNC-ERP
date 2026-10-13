// Coverage for a real company-level rule: Nishtimani Yakam and Al Watanyia
// run no inventory of their own, so a project-purpose requisition/PO there
// can only ever deliver to the jobsite -- see
// 301_requires_jobsite_delivery. requires_jobsite_delivery (companies) is
// the data-driven flag, same pattern is_central_warehouse already uses
// (280_companies_central_warehouse), checked by createRequisition,
// createPurchaseOrder, applyRequisitionEditChanges, and
// applyAdminPOCorrection. Real-Postgres pattern, same as
// create-company-price-tolerance.test.ts.
import { describe, it, expect, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const NAME_PREFIX = 'JOBSITELOCKTEST-'
const TEST_USER_EMAIL = 'requires-jobsite-delivery-test@fnc-erp.local'

async function cleanup(): Promise<void> {
  await pool.query(
    `DELETE FROM po_lines WHERE requisition_id IN (SELECT id FROM requisitions WHERE company_id IN (SELECT id FROM companies WHERE name LIKE $1))
       OR po_id IN (SELECT id FROM purchase_orders WHERE company_id IN (SELECT id FROM companies WHERE name LIKE $1))`,
    [`${NAME_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM po_edit_requests WHERE requisition_id IN (SELECT id FROM requisitions WHERE company_id IN (SELECT id FROM companies WHERE name LIKE $1))`,
    [`${NAME_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM requisitions WHERE company_id IN (SELECT id FROM companies WHERE name LIKE $1)`,
    [`${NAME_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM purchase_orders WHERE company_id IN (SELECT id FROM companies WHERE name LIKE $1)`,
    [`${NAME_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM vendors WHERE company_id IN (SELECT id FROM companies WHERE name LIKE $1)`,
    [`${NAME_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM company_price_tolerance WHERE company_id IN (SELECT id FROM companies WHERE name LIKE $1)`,
    [`${NAME_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM document_sequences WHERE company_id IN (SELECT id FROM companies WHERE name LIKE $1)`,
    [`${NAME_PREFIX}%`],
  )
  await pool.query(
    `DELETE FROM system_configuration WHERE company_id IN (SELECT id FROM companies WHERE name LIKE $1)`,
    [`${NAME_PREFIX}%`],
  )
  await pool.query(`DELETE FROM companies WHERE name LIKE $1`, [`${NAME_PREFIX}%`])
}

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

async function makeCompany(locked: boolean): Promise<{ id: string; userId: string }> {
  const userR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  const userId = userR.rows[0]!.id
  const ctx = {
    auth: { companyId: '', userId, role: 'system_admin', module: 'all', sessionId: 'jobsite-lock-test' },
  }
  const name = `${NAME_PREFIX}${locked ? 'locked' : 'open'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const company = (await resolvers.Mutation.createCompany(
    null,
    { input: { name, country_code: 'IQ', interco_transfer_pricing_method: 'last_cost' } },
    ctx as never,
  )) as { id: string }
  if (locked) {
    await pool.query(`UPDATE companies SET requires_jobsite_delivery=true WHERE id=$1`, [company.id])
  }
  return { id: company.id, userId }
}

function makeCtx(companyId: string, userId: string) {
  return {
    auth: { companyId, userId, role: 'system_admin', module: 'all', sessionId: 'jobsite-lock-test' },
  }
}

describe('requires_jobsite_delivery — createRequisition', () => {
  it('forces delivery_destination to jobsite regardless of what was submitted', async () => {
    const { id: companyId, userId } = await makeCompany(true)
    const ctx = makeCtx(companyId, userId)
    const created = (await resolvers.Mutation.createRequisition(
      null,
      {
        input: {
          purpose: 'project',
          delivery_destination: 'inventory',
          lines: [{ description: 'Cement bags', qty: 10, unit_price: 5 }],
        },
      },
      ctx as never,
    )) as { id: string }
    const r = await pool.query<{ delivery_destination: string }>(
      `SELECT delivery_destination FROM requisitions WHERE id=$1`,
      [created.id],
    )
    expect(r.rows[0]!.delivery_destination).toBe('jobsite')
  })

  it('still allows the real choice for a company without the flag', async () => {
    const { id: companyId, userId } = await makeCompany(false)
    const ctx = makeCtx(companyId, userId)
    const created = (await resolvers.Mutation.createRequisition(
      null,
      {
        input: {
          purpose: 'project',
          delivery_destination: 'inventory',
          lines: [{ description: 'Cement bags', qty: 10, unit_price: 5 }],
        },
      },
      ctx as never,
    )) as { id: string }
    const r = await pool.query<{ delivery_destination: string }>(
      `SELECT delivery_destination FROM requisitions WHERE id=$1`,
      [created.id],
    )
    expect(r.rows[0]!.delivery_destination).toBe('inventory')
  })
})

describe('requires_jobsite_delivery — createPurchaseOrder', () => {
  it('forces delivery_destination to jobsite regardless of what was submitted', async () => {
    const { id: companyId, userId } = await makeCompany(true)
    const ctx = makeCtx(companyId, userId)
    const created = (await resolvers.Mutation.createPurchaseOrder(
      null,
      {
        input: {
          purpose: 'project',
          delivery_destination: 'inventory',
          lines: [{ description: 'Cement bags', qty: 10, unit_price: 5 }],
        },
      },
      ctx as never,
    )) as { id: string }
    const r = await pool.query<{ delivery_destination: string }>(
      `SELECT delivery_destination FROM purchase_orders WHERE id=$1`,
      [created.id],
    )
    expect(r.rows[0]!.delivery_destination).toBe('jobsite')
  })
})

describe('requires_jobsite_delivery — applyRequisitionEditChanges (edit request)', () => {
  it('skips a delivery_destination change proposed for a locked company, applies every other field', async () => {
    const { id: companyId, userId } = await makeCompany(true)
    const ctx = makeCtx(companyId, userId)
    const created = (await resolvers.Mutation.createRequisition(
      null,
      {
        input: {
          purpose: 'project',
          notes: 'original notes',
          lines: [{ description: 'Cement bags', qty: 10, unit_price: 5 }],
        },
      },
      ctx as never,
    )) as { id: string }

    // applyRequisitionEditChanges isn't exported directly -- go through the
    // real edit-request flow instead. The requisition is still 'draft'
    // (pre-approval), so submitPOEditRequest auto-applies it immediately
    // via the same requisitionId-branch path, no separate approval call
    // needed — see POST_APPROVAL_REQUISITION_STATUSES handling.
    await resolvers.Mutation.submitPOEditRequest(
      null,
      {
        requisitionId: created.id,
        changes: JSON.stringify({
          header: {
            notes: { from: 'original notes', to: 'updated notes' },
            delivery_destination: { from: 'jobsite', to: 'inventory' },
          },
        }),
      },
      ctx as never,
    )

    const r = await pool.query<{ delivery_destination: string; notes: string }>(
      `SELECT delivery_destination, notes FROM requisitions WHERE id=$1`,
      [created.id],
    )
    expect(r.rows[0]!.delivery_destination).toBe('jobsite')
    expect(r.rows[0]!.notes).toBe('updated notes')
  })
})

describe('requires_jobsite_delivery — applyAdminPOCorrection', () => {
  it('refuses to change delivery_destination to inventory for a locked company', async () => {
    const { id: companyId, userId } = await makeCompany(true)
    const ctx = makeCtx(companyId, userId)
    const vendorR = await pool.query<{ id: string }>(
      `INSERT INTO vendors (company_id, name) VALUES ($1,$2) RETURNING id`,
      [companyId, `${NAME_PREFIX}Vendor`],
    )
    const poR = await pool.query<{ id: string }>(
      `INSERT INTO purchase_orders (company_id, po_number, vendor_id, status, currency_code, purpose, delivery_destination, created_by)
       VALUES ($1,$2,$3,'approved','IQD','project','jobsite',$4) RETURNING id`,
      [companyId, `${NAME_PREFIX}PO-${Date.now()}`, vendorR.rows[0]!.id, userId],
    )
    const poId = poR.rows[0]!.id

    await expect(
      resolvers.Mutation.adminCorrectPO(
        null,
        {
          id: poId,
          changes: JSON.stringify({
            header: { delivery_destination: { from: 'jobsite', to: 'inventory' } },
          }),
          reason: 'test correction',
        },
        ctx as never,
      ),
    ).rejects.toThrow(/no inventory of its own/i)

    const r = await pool.query<{ delivery_destination: string }>(
      `SELECT delivery_destination FROM purchase_orders WHERE id=$1`,
      [poId],
    )
    expect(r.rows[0]!.delivery_destination).toBe('jobsite')
  })
})
