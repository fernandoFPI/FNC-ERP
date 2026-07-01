import { createHash } from 'crypto'
import { pool } from '@fnc-erp/db'
import { hashPassword, signAccessToken } from '@fnc-erp/auth'

export const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
export const TEST_USER_EMAIL = 'rental-test@fnc-erp.local'

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
  const token = signAccessToken({ userId, companyId: TEST_COMPANY_ID, role: 'company_admin', module: 'all', sessionId: 'test-session-rental' })
  const tokenHash = createHash('sha256').update(token).digest('hex')
  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, refresh_token_hash, expires_at, refresh_expires_at)
     VALUES ($1,$2,'test-refresh-hash-rental',NOW() + INTERVAL '1 hour',NOW() + INTERVAL '7 days')
     ON CONFLICT DO NOTHING`,
    [userId, tokenHash],
  )
  return { userId, token }
}

export async function cleanRentalData(): Promise<void> {
  await pool.query(`DELETE FROM sessions WHERE refresh_token_hash = 'test-refresh-hash-rental'`)
  // FK order: invoices → contract_lines → contracts → assets
  await pool.query(`DELETE FROM rental_invoices WHERE contract_id IN (SELECT id FROM rental_contracts WHERE company_id=$1)`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM rental_contract_lines WHERE contract_id IN (SELECT id FROM rental_contracts WHERE company_id=$1)`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM rental_contracts WHERE company_id=$1`, [TEST_COMPANY_ID])
  await pool.query(`UPDATE equipment_assets SET status='available' WHERE company_id=$1 AND asset_number LIKE 'TEST-%'`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM equipment_assets WHERE company_id=$1 AND asset_number LIKE 'TEST-%'`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
}
