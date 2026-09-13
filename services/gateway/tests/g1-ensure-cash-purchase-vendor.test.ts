// G1 Phase 3 Milestone A screen 3 — ensureCashPurchaseVendor's find-or-create
// semantics (idempotent, safe under the migration 268 partial unique index).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const TEST_USER_EMAIL = 'g1-cash-vendor-test@fnc-erp.local'

let userId: string
let ctx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }

async function cleanup(): Promise<void> {
  await pool.query(`DELETE FROM vendors WHERE company_id=$1 AND is_cash_purchase=true`, [TEST_COMPANY_ID])
}

beforeAll(async () => {
  const userR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  userId = userR.rows[0]!.id
  ctx = {
    auth: { companyId: TEST_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'g1-cash-vendor-test' },
  }
  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('ensureCashPurchaseVendor', () => {
  it('creates a Cash Purchase vendor on first call', async () => {
    const vendor = (await resolvers.Mutation.ensureCashPurchaseVendor(null, {}, ctx as never)) as {
      id: string
      name: string
      is_cash_purchase: boolean
      company_id: string
    }
    expect(vendor.name).toBe('Cash Purchase')
    expect(vendor.is_cash_purchase).toBe(true)
    expect(vendor.company_id).toBe(TEST_COMPANY_ID)
  })

  it('returns the same vendor on a second call, not a duplicate', async () => {
    const first = (await resolvers.Mutation.ensureCashPurchaseVendor(null, {}, ctx as never)) as { id: string }
    const second = (await resolvers.Mutation.ensureCashPurchaseVendor(null, {}, ctx as never)) as { id: string }
    expect(second.id).toBe(first.id)

    const count = await pool.query<{ c: string }>(
      `SELECT COUNT(*) AS c FROM vendors WHERE company_id=$1 AND is_cash_purchase=true`,
      [TEST_COMPANY_ID],
    )
    expect(parseInt(count.rows[0]!.c, 10)).toBe(1)
  })

  it('stays safe under concurrent first-use (the partial unique index actually holds)', async () => {
    await cleanup()
    const results = await Promise.all([
      resolvers.Mutation.ensureCashPurchaseVendor(null, {}, ctx as never),
      resolvers.Mutation.ensureCashPurchaseVendor(null, {}, ctx as never),
      resolvers.Mutation.ensureCashPurchaseVendor(null, {}, ctx as never),
    ])
    const ids = new Set(results.map((r) => (r as { id: string }).id))
    expect(ids.size).toBe(1)
    const count = await pool.query<{ c: string }>(
      `SELECT COUNT(*) AS c FROM vendors WHERE company_id=$1 AND is_cash_purchase=true`,
      [TEST_COMPANY_ID],
    )
    expect(parseInt(count.rows[0]!.c, 10)).toBe(1)
  })
})
