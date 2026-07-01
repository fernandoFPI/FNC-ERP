import { createHash } from 'crypto'
import { pool } from '@fnc-erp/db'
import { hashPassword, signAccessToken } from '@fnc-erp/auth'

export const TEST_COMPANY_A = '00000000-0000-0000-0000-000000000001'
export const TEST_COMPANY_B = '00000000-0000-0000-0000-000000000002'
export const TEST_USER_EMAIL = 'interco-test@fnc-erp.local'

export async function createTestUser(): Promise<{ userId: string; token: string }> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,$2) ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL, await hashPassword('TestPass123!')],
  )
  const userId = result.rows[0]!.id
  for (const cId of [TEST_COMPANY_A, TEST_COMPANY_B]) {
    await pool.query(
      `INSERT INTO user_company_roles (user_id, company_id, role, module) VALUES ($1,$2,'admin','all') ON CONFLICT DO NOTHING`,
      [userId, cId],
    )
  }
  const token = signAccessToken({ userId, companyId: TEST_COMPANY_A, role: 'admin', module: 'all', sessionId: 'test-session' })
  const tokenHash = createHash('sha256').update(token).digest('hex')
  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, refresh_token_hash, expires_at, refresh_expires_at)
     VALUES ($1,$2,'test-refresh-hash-interco',NOW() + INTERVAL '1 hour',NOW() + INTERVAL '7 days')
     ON CONFLICT DO NOTHING`,
    [userId, tokenHash],
  )
  return { userId, token }
}

export async function cleanIntercoData() {
  await pool.query(`DELETE FROM sessions WHERE refresh_token_hash = 'test-refresh-hash-interco'`)
  await pool.query(`DELETE FROM interco_transactions WHERE from_company_id IN ($1,$2) OR to_company_id IN ($1,$2)`, [TEST_COMPANY_A, TEST_COMPANY_B])
  await pool.query(`DELETE FROM journal_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE company_id IN ($1,$2) AND source_type = 'interco')`, [TEST_COMPANY_A, TEST_COMPANY_B])
  await pool.query(`DELETE FROM journal_entries WHERE company_id IN ($1,$2) AND source_type = 'interco'`, [TEST_COMPANY_A, TEST_COMPANY_B])
  await pool.query(`DELETE FROM users WHERE email = $1`, [TEST_USER_EMAIL])
}

export async function getAccountId(companyId: string, code: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM chart_of_accounts WHERE code = $1 AND company_id = $2`,
    [code, companyId],
  )
  if (!result.rows[0]) throw new Error(`Account ${code} not found for company ${companyId} — run seeds first`)
  return result.rows[0].id
}

export async function ensureOpenPeriods(date = '2025-01-15') {
  for (const cId of [TEST_COMPANY_A, TEST_COMPANY_B]) {
    await pool.query(
      `INSERT INTO accounting_periods (company_id, name, start_date, end_date, status) VALUES ($1,'Test Period 2025-01','2025-01-01','2025-01-31','open') ON CONFLICT DO NOTHING`,
      [cId],
    )
  }
}
