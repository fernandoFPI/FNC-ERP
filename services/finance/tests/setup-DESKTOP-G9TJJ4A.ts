import { createHash } from 'crypto'
import { pool } from '@fnc-erp/db'
import { hashPassword, signAccessToken } from '@fnc-erp/auth'

export const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
export const TEST_USER_EMAIL = 'finance-test@fnc-erp.local'
export const TEST_USER_PASSWORD = 'TestPass123!'

export async function createTestUser(): Promise<{ userId: string; token: string }> {
  const passwordHash = await hashPassword(TEST_USER_PASSWORD)
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL, passwordHash],
  )
  const userId = result.rows[0]!.id
  await pool.query(
    `INSERT INTO user_company_roles (user_id, company_id, role, module) VALUES ($1,$2,'admin','all') ON CONFLICT DO NOTHING`,
    [userId, TEST_COMPANY_ID],
  )
  const token = signAccessToken({ userId, companyId: TEST_COMPANY_ID, role: 'admin', module: 'all', sessionId: 'test-session' })
  const tokenHash = createHash('sha256').update(token).digest('hex')
  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, refresh_token_hash, expires_at, refresh_expires_at)
     VALUES ($1,$2,'test-refresh-hash-finance',NOW() + INTERVAL '1 hour',NOW() + INTERVAL '7 days')
     ON CONFLICT DO NOTHING`,
    [userId, tokenHash],
  )
  return { userId, token }
}

export async function cleanFinanceData() {
  await pool.query(`DELETE FROM sessions WHERE refresh_token_hash = 'test-refresh-hash-finance'`)
  await pool.query(`DELETE FROM journal_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE company_id = $1)`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM journal_entries WHERE company_id = $1`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM accounting_periods WHERE company_id = $1`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM analytic_accounts WHERE company_id = $1`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM cost_centers WHERE company_id = $1`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM users WHERE email = $1`, [TEST_USER_EMAIL])
}

export async function createOpenPeriod(date = '2025-01-15'): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO accounting_periods (company_id, name, start_date, end_date, status) VALUES ($1,'Test Period 2025-01','2025-01-01','2025-01-31','open') ON CONFLICT DO NOTHING RETURNING id`,
    [TEST_COMPANY_ID],
  )
  return result.rows[0]?.id ?? ''
}

export async function getAccountId(code: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM chart_of_accounts WHERE code = $1 AND company_id = $2`,
    [code, TEST_COMPANY_ID],
  )
  if (!result.rows[0]) throw new Error(`Account ${code} not found — run seeds first`)
  return result.rows[0].id
}
