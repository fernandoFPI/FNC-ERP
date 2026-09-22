// Integration test for RechargeRequest.companyName — added so the detail
// panel can show which company a recharge request belongs to (previously
// missing entirely; see RECHARGE_REQUEST_SELECT's new companies join).
// Deliberately NOT mocking @fnc-erp/db, same reasoning as the other
// resolver integration tests in this directory.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const TEST_USER_EMAIL = 'recharge-company-name-test@fnc-erp.local'
const CC_PREFIX = 'RCCTEST-CC-'
const BUNDLE_PREFIX = 'RCCTEST-BUNDLE-'

let userId: string
let costCenterId: string
let bundleId: string
let requestId: string
let companyName: string
let ctx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }

async function cleanup(): Promise<void> {
  await pool.query(
    `DELETE FROM recharge_requests WHERE company_id=$1 AND cost_center_id IN (SELECT id FROM cost_centers WHERE company_id=$1 AND name LIKE $2)`,
    [TEST_COMPANY_ID, `${CC_PREFIX}%`],
  )
  await pool.query(`DELETE FROM recharge_bundles WHERE company_id=$1 AND name LIKE $2`, [
    TEST_COMPANY_ID,
    `${BUNDLE_PREFIX}%`,
  ])
  await pool.query(`DELETE FROM cost_centers WHERE company_id=$1 AND name LIKE $2`, [TEST_COMPANY_ID, `${CC_PREFIX}%`])
}

beforeAll(async () => {
  const userR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  userId = userR.rows[0]!.id
  ctx = {
    auth: { companyId: TEST_COMPANY_ID, userId, role: 'system_admin', module: 'all', sessionId: 'recharge-cc-test' },
  }

  const companyR = await pool.query<{ name: string }>(`SELECT name FROM companies WHERE id=$1`, [TEST_COMPANY_ID])
  if (!companyR.rows[0]) throw new Error('Test company not seeded')
  companyName = companyR.rows[0].name

  await cleanup()

  const ccR = await pool.query<{ id: string }>(
    `INSERT INTO cost_centers (company_id, name, code, type) VALUES ($1,$2,$3,'overhead') RETURNING id`,
    [TEST_COMPANY_ID, `${CC_PREFIX}${Date.now()}`, `RCC${Date.now()}`.slice(0, 20)],
  )
  costCenterId = ccR.rows[0]!.id

  const bundleR = await pool.query<{ id: string }>(
    `INSERT INTO recharge_bundles (company_id, name, amount, currency_code) VALUES ($1,$2,10000,'IQD') RETURNING id`,
    [TEST_COMPANY_ID, `${BUNDLE_PREFIX}${Date.now()}`],
  )
  bundleId = bundleR.rows[0]!.id

  const reqR = await pool.query<{ id: string }>(
    `INSERT INTO recharge_requests (company_id, requested_by, created_by, cost_center_id, bundle_id, phone_number)
     VALUES ($1,$2,$2,$3,$4,'0770-000-0000') RETURNING id`,
    [TEST_COMPANY_ID, userId, costCenterId, bundleId],
  )
  requestId = reqR.rows[0]!.id
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('RechargeRequest.companyName', () => {
  it('rechargeRequest(id) includes the owning company\'s name', async () => {
    const result = (await resolvers.Query.rechargeRequest(null, { id: requestId }, ctx as never)) as {
      companyName: string | null
    }
    expect(result.companyName).toBe(companyName)
  })

  it('rechargeRequests(scope: "mine") includes the owning company\'s name on every row', async () => {
    const result = (await resolvers.Query.rechargeRequests(
      null,
      { scope: 'mine' },
      ctx as never,
    )) as { id: string; companyName: string | null }[]
    const row = result.find((r) => r.id === requestId)
    expect(row?.companyName).toBe(companyName)
  })
})
