import { pool } from '@fnc-erp/db'
import { hashPassword } from '@fnc-erp/auth'
import { encrypt } from '@fnc-erp/auth'
import { generateMFASecret } from '@fnc-erp/auth'

export const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
export const TEST_USER_EMAIL = 'test-user@fnc-erp.local'
export const TEST_USER_PASSWORD = 'TestPass123!'
export const TEST_ADMIN_EMAIL = 'admin@fnc-erp.local'
export const TEST_ADMIN_PASSWORD = 'ChangeMe123!'

export async function cleanTestData() {
  await pool.query(`DELETE FROM sessions WHERE user_id IN (
    SELECT id FROM users WHERE email LIKE '%fnc-erp.local'
  )`)
  await pool.query(`DELETE FROM user_company_roles WHERE user_id IN (
    SELECT id FROM users WHERE email = $1
  )`, [TEST_USER_EMAIL])
  await pool.query(`DELETE FROM users WHERE email = $1`, [TEST_USER_EMAIL])
}

export async function createTestUser(overrides: {
  mfaEnabled?: boolean
  failedAttempts?: number
  lockedUntil?: Date | null
} = {}): Promise<string> {
  const passwordHash = await hashPassword(TEST_USER_PASSWORD)
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, mfa_enabled, failed_login_attempts, locked_until)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      TEST_USER_EMAIL,
      passwordHash,
      overrides.mfaEnabled ?? false,
      overrides.failedAttempts ?? 0,
      overrides.lockedUntil ?? null,
    ],
  )
  const userId = result.rows[0]!.id

  await pool.query(
    `INSERT INTO user_company_roles (user_id, company_id, role, module)
     VALUES ($1, $2, 'user', 'all')`,
    [userId, TEST_COMPANY_ID],
  )

  return userId
}

export async function createTestUserWithMFA(): Promise<{ userId: string; mfaSecret: string }> {
  const passwordHash = await hashPassword(TEST_USER_PASSWORD)
  const { secret } = generateMFASecret(TEST_USER_EMAIL)
  const encryptedSecret = encrypt(secret)

  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, mfa_enabled, mfa_secret)
     VALUES ($1, $2, true, $3)
     RETURNING id`,
    [TEST_USER_EMAIL, passwordHash, encryptedSecret],
  )
  const userId = result.rows[0]!.id

  await pool.query(
    `INSERT INTO user_company_roles (user_id, company_id, role, module)
     VALUES ($1, $2, 'user', 'all')`,
    [userId, TEST_COMPANY_ID],
  )

  return { userId, mfaSecret: secret }
}
