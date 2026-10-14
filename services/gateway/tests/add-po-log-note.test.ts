// Coverage for the "add a note to the PO's Log tab" feature — a free-text
// entry any viewer of the PO can leave, reusing canViewPurchaseOrderGW (the
// same gate purchaseOrder(id) uses to decide viewerRestricted) rather than a
// hand-copied authorization check that could drift from it (playbook rule
// 24). Real-Postgres pattern, setup mirrors po-buyer-visibility-all-stages.test.ts.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const ORGANIZER_EMAIL = 'add-po-log-note-organizer@fnc-erp.local'
const UNAUTHORIZED_EMAIL = 'add-po-log-note-unauth@fnc-erp.local'
const PO_PREFIX = 'ADDLOGNOTETEST-PO-'

let organizerId: string
let unauthorizedId: string

async function makePO(): Promise<string> {
  const poNumber = `${PO_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO purchase_orders (company_id, po_number, created_by, organizer_id, status, currency_code, base_currency_code, purpose)
     VALUES ($1,$2,$3,$3,'draft','IQD','IQD','stock') RETURNING id`,
    [TEST_COMPANY_ID, poNumber, organizerId],
  )
  return r.rows[0]!.id
}

function ctxFor(userId: string) {
  return {
    auth: { companyId: TEST_COMPANY_ID, userId, role: 'user', module: 'all', sessionId: 'add-po-log-note-test' },
  }
}

async function cleanup(): Promise<void> {
  await pool.query(`DELETE FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2`, [
    TEST_COMPANY_ID,
    `${PO_PREFIX}%`,
  ])
}

beforeAll(async () => {
  const organizerR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [ORGANIZER_EMAIL],
  )
  organizerId = organizerR.rows[0]!.id
  const unauthorizedR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [UNAUTHORIZED_EMAIL],
  )
  unauthorizedId = unauthorizedR.rows[0]!.id
  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email IN ($1,$2)`, [ORGANIZER_EMAIL, UNAUTHORIZED_EMAIL])
  await pool.end()
})

describe('addPOLogNote', () => {
  it('lets the organizer add a note that shows up in the log, newest query included', async () => {
    const poId = await makePO()
    const entry = (await resolvers.Mutation.addPOLogNote(
      null,
      { poId, note: '  Called the vendor, confirmed delivery for Thursday.  ' },
      ctxFor(organizerId) as never,
    )) as { id: string; action: string; notes: string; user_email: string | null }

    expect(entry.action).toBe('note')
    // Trimmed, not stored with the surrounding whitespace.
    expect(entry.notes).toBe('Called the vendor, confirmed delivery for Thursday.')
    expect(entry.user_email).toBeTruthy()

    const po = (await resolvers.Query.purchaseOrder(null, { id: poId }, ctxFor(organizerId) as never)) as {
      approval_log: { id: string; action: string; notes: string }[]
    }
    const logged = po.approval_log.find((e) => e.id === entry.id)
    expect(logged).toBeTruthy()
    expect(logged!.action).toBe('note')
    expect(logged!.notes).toBe('Called the vendor, confirmed delivery for Thursday.')
  })

  it('refuses a caller who cannot view this PO (not organizer/admin/buyer/stage position)', async () => {
    const poId = await makePO()
    await expect(
      resolvers.Mutation.addPOLogNote(null, { poId, note: 'should not land' }, ctxFor(unauthorizedId) as never),
    ).rejects.toThrow(/not authorized/i)

    const check = await pool.query(`SELECT 1 FROM po_approval_log WHERE po_id=$1 AND notes='should not land'`, [
      poId,
    ])
    expect(check.rows.length).toBe(0)
  })

  it('refuses an empty or whitespace-only note', async () => {
    const poId = await makePO()
    await expect(
      resolvers.Mutation.addPOLogNote(null, { poId, note: '   ' }, ctxFor(organizerId) as never),
    ).rejects.toThrow(/required/i)
  })
})
