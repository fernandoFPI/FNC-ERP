// Playbook #6 ("money total recomputed in several places"): the
// directCostTotal SQL query + overhead/margin/discount/contingency math
// was copy-pasted into 6 separate resolvers (updateBidCommercialSummary,
// submitBidForApproval, approveBid, rejectBid, reviseBid,
// bidCommercialSummary). Consolidated into one getBidDirectCostTotalGW
// helper + the existing computeBidPricing helper; this test proves the
// refactor preserves the exact same numbers across all of them.
import { describe, it, expect, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const NAME_PREFIX = 'G-BID-TEST-'
const TEST_USER_EMAIL = 'g-bid-commercial-test@fnc-erp.local'

async function makeCompany(): Promise<{ companyId: string; userId: string; projectId: string }> {
  const companyRes = await pool.query<{ id: string }>(
    `INSERT INTO companies (name, legal_name, country_code, currency_code)
     VALUES ($1,$1,'IQ','IQD') RETURNING id`,
    [`${NAME_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`],
  )
  const companyId = companyRes.rows[0]!.id
  const userR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  const userId = userR.rows[0]!.id
  await pool.query(
    `INSERT INTO user_company_roles (user_id, company_id, role, module) VALUES ($1,$2,'company_admin','all') ON CONFLICT DO NOTHING`,
    [userId, companyId],
  )
  const projRes = await pool.query<{ id: string }>(
    `INSERT INTO projects (company_id, code, name, status, created_by)
     VALUES ($1,$2,'Bid Commercial Test Project','ongoing',$3) RETURNING id`,
    [companyId, `${NAME_PREFIX}${Date.now()}`, userId],
  )
  const projectId = projRes.rows[0]!.id
  await pool.query(
    `INSERT INTO bid_cost_items (project_id, cost_type, description, quantity, unit_cost, total_cost, currency_code)
     VALUES ($1,'material','Item A',1,100000,100000,'IQD'), ($1,'labour','Item B',1,50000,50000,'IQD')`,
    [projectId],
  )
  return { companyId, userId, projectId }
}

function ctxFor(companyId: string, userId: string) {
  return { auth: { companyId, userId, role: 'company_admin', module: 'all', sessionId: 'bid-commercial-test' } }
}

async function cleanup(companyId: string, projectId: string): Promise<void> {
  await pool.query(`DELETE FROM project_bid_revisions WHERE project_id=$1`, [projectId])
  await pool.query(`DELETE FROM bid_commercial_summary WHERE project_id=$1`, [projectId])
  await pool.query(`DELETE FROM bid_cost_items WHERE project_id=$1`, [projectId])
  await pool.query(`DELETE FROM project_activity_log WHERE project_id=$1`, [projectId])
  await pool.query(`DELETE FROM notifications WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM projects WHERE id=$1`, [projectId])
  await pool.query(`DELETE FROM user_company_roles WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId])
}

afterAll(async () => {
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('Bid commercial summary — directCostTotal/bidPrice consistency across all 6 call sites', () => {
  it('produces the same numbers through update, submit, approve, reject, revise and the plain query', async () => {
    const { companyId, userId, projectId } = await makeCompany()
    try {
      const ctx = ctxFor(companyId, userId) as never
      // direct cost = 150000; overhead 10% = 15000; contingency 5% = 7500;
      // subtotal = 172500; margin 20% = 34500; pre-discount = 207000;
      // discount 2% = 4140; bidPrice = 172500 + 34500 - 4140 = 202860.
      const updated = (await resolvers.Mutation.updateBidCommercialSummary(
        null,
        { projectId, overheadPct: 10, marginPct: 20, discountPct: 2, contingencyPct: 5, currencyCode: 'IQD' },
        ctx,
      )) as { directCostTotal: number; bidPrice: number }
      expect(updated.directCostTotal).toBe(150000)
      expect(updated.bidPrice).toBeCloseTo(202860, 2)

      const submitted = (await resolvers.Mutation.submitBidForApproval(null, { projectId }, ctx)) as {
        directCostTotal: number
        bidPrice: number
        approvalStatus: string
      }
      expect(submitted.directCostTotal).toBe(150000)
      expect(submitted.bidPrice).toBeCloseTo(202860, 2)
      expect(submitted.approvalStatus).toBe('submitted')

      const approved = (await resolvers.Mutation.approveBid(null, { projectId }, ctx)) as {
        directCostTotal: number
        bidPrice: number
      }
      expect(approved.directCostTotal).toBe(150000)
      expect(approved.bidPrice).toBeCloseTo(202860, 2)

      const queried = (await resolvers.Query.bidCommercialSummary(null, { projectId }, ctx)) as {
        directCostTotal: number
        bidPrice: number
      }
      expect(queried.directCostTotal).toBe(150000)
      expect(queried.bidPrice).toBeCloseTo(202860, 2)

      const revised = (await resolvers.Mutation.reviseBid(
        null,
        { projectId, changeSummary: 'test revision' },
        ctx,
      )) as { directCostTotal: number; bidPrice: number }
      expect(revised.directCostTotal).toBe(150000)
      expect(revised.bidPrice).toBeCloseTo(202860, 2)

      const rejected = (await resolvers.Mutation.rejectBid(
        null,
        { projectId, reason: 'test rejection' },
        ctx,
      )) as { directCostTotal: number; bidPrice: number }
      expect(rejected.directCostTotal).toBe(150000)
      expect(rejected.bidPrice).toBeCloseTo(202860, 2)
    } finally {
      await cleanup(companyId, projectId)
    }
  })
})
