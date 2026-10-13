// Coverage for a real gap found while building the cost-change-approval
// feature: migration 259 backfilled company_price_tolerance onto every
// company that already existed then, but nothing seeds it for a company
// created since — leaving both the purchase-side over_tolerance check and
// recordProductCostChange's approval gate silently inert for it (no
// tolerance row means "nothing to compare against, never flag", not an
// error). createCompany now seeds the same provisional default. Real-
// Postgres pattern, same as product-cost-history.test.ts.
import { describe, it, expect, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const NAME_PREFIX = 'COMPANYTOLERANCETEST-'
const TEST_USER_EMAIL = 'create-company-tolerance-test@fnc-erp.local'

async function cleanup(): Promise<void> {
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

describe('createCompany — seeds a default price tolerance', () => {
  it('gives a newly created company the same provisional IQD/USD tolerance migration 259 backfilled onto existing ones', async () => {
    const userR = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
      [TEST_USER_EMAIL],
    )
    const userId = userR.rows[0]!.id
    const ctx = {
      auth: { companyId: '', userId, role: 'system_admin', module: 'all', sessionId: 'create-company-test' },
    }

    const name = `${NAME_PREFIX}${Date.now()}`
    const company = (await resolvers.Mutation.createCompany(
      null,
      { input: { name, country_code: 'IQ', interco_transfer_pricing_method: 'last_cost' } },
      ctx as never,
    )) as { id: string }

    const tol = await pool.query<{ currency_code: string; tolerance_pct: string; tolerance_abs: string }>(
      `SELECT currency_code, tolerance_pct, tolerance_abs FROM company_price_tolerance WHERE company_id=$1 ORDER BY currency_code`,
      [company.id],
    )
    expect(tol.rows).toEqual([
      { currency_code: 'IQD', tolerance_pct: '5.00', tolerance_abs: '25000.0000' },
      { currency_code: 'USD', tolerance_pct: '5.00', tolerance_abs: '20.0000' },
    ])
  })
})
