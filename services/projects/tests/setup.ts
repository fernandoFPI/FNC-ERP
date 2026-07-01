import { createHash } from 'crypto'
import { pool } from '@fnc-erp/db'
import { hashPassword, signAccessToken } from '@fnc-erp/auth'

export const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
export const TEST_USER_EMAIL = 'projects-test@fnc-erp.local'

export async function createTestUser(): Promise<{ userId: string; token: string }> {
  const passwordHash = await hashPassword('TestPass123!')
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,$2)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL, passwordHash],
  )
  const userId = result.rows[0]!['id']
  await pool.query(
    `INSERT INTO user_company_roles (user_id, company_id, role, module) VALUES ($1,$2,'company_admin','all') ON CONFLICT DO NOTHING`,
    [userId, TEST_COMPANY_ID],
  )
  const token = signAccessToken({ userId, companyId: TEST_COMPANY_ID, role: 'company_admin', module: 'all', sessionId: 'test-session-projects' })
  const tokenHash = createHash('sha256').update(token).digest('hex')
  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, refresh_token_hash, expires_at, refresh_expires_at)
     VALUES ($1,$2,'test-refresh-hash-projects',NOW() + INTERVAL '1 hour',NOW() + INTERVAL '7 days')
     ON CONFLICT DO NOTHING`,
    [userId, tokenHash],
  )
  return { userId, token }
}

export async function cleanProjectsData(): Promise<void> {
  await pool.query(`DELETE FROM sessions WHERE refresh_token_hash = 'test-refresh-hash-projects'`)
  await pool.query(`DELETE FROM project_cost_actuals WHERE project_id IN (SELECT id FROM projects WHERE company_id=$1 AND code LIKE 'TEST-%')`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM project_members WHERE project_id IN (SELECT id FROM projects WHERE company_id=$1 AND code LIKE 'TEST-%')`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM project_stages WHERE project_id IN (SELECT id FROM projects WHERE company_id=$1 AND code LIKE 'TEST-%')`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM project_budget_lines WHERE project_id IN (SELECT id FROM projects WHERE company_id=$1 AND code LIKE 'TEST-%')`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM analytic_accounts WHERE company_id=$1 AND code LIKE 'PRJ-TEST-%'`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM projects WHERE company_id=$1 AND code LIKE 'TEST-%'`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
}
