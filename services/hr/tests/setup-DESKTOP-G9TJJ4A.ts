import { createHash } from 'crypto'
import { pool } from '@fnc-erp/db'
import { hashPassword, signAccessToken } from '@fnc-erp/auth'

export const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
export const TEST_USER_EMAIL = 'hr-test@fnc-erp.local'
export const TEST_WORK_LOCATION_ID = '10000000-0000-0000-0000-000000000001'

export async function createTestUser(): Promise<{ userId: string; token: string }> {
  const passwordHash = await hashPassword('TestPass123!')
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL, passwordHash],
  )
  const userId = result.rows[0]!['id']
  await pool.query(
    `INSERT INTO user_company_roles (user_id, company_id, role, module) VALUES ($1,$2,'admin','all') ON CONFLICT DO NOTHING`,
    [userId, TEST_COMPANY_ID],
  )
  const token = signAccessToken({ userId, companyId: TEST_COMPANY_ID, role: 'admin', module: 'all', sessionId: 'test-session' })
  const tokenHash = createHash('sha256').update(token).digest('hex')
  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, refresh_token_hash, expires_at, refresh_expires_at)
     VALUES ($1,$2,'test-refresh-hash-hr',NOW() + INTERVAL '1 hour',NOW() + INTERVAL '7 days')
     ON CONFLICT DO NOTHING`,
    [userId, tokenHash],
  )
  return { userId, token }
}

export async function createTestEmployee(userId: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO employees (company_id, first_name, last_name, hire_date, work_location_id, created_by)
     VALUES ($1,'Test','Employee','2024-01-01',$2,$3)
     ON CONFLICT DO NOTHING RETURNING id`,
    [TEST_COMPANY_ID, TEST_WORK_LOCATION_ID, userId],
  )
  // If conflict (shouldn't happen with new UUIDs), fetch existing
  if (!result.rows[0]) {
    const existing = await pool.query<{ id: string }>(
      `SELECT id FROM employees WHERE first_name = 'Test' AND last_name = 'Employee' AND company_id = $1 LIMIT 1`,
      [TEST_COMPANY_ID],
    )
    return existing.rows[0]!['id']
  }
  return result.rows[0]!['id']
}

export async function cleanHRData(employeeId: string): Promise<void> {
  await pool.query(`DELETE FROM sessions WHERE refresh_token_hash = 'test-refresh-hash-hr'`)
  await pool.query(`DELETE FROM payslips WHERE employee_id = $1`, [employeeId])
  await pool.query(`DELETE FROM payroll_runs WHERE company_id = $1 AND period_name LIKE 'TEST-%'`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM overtime_logs WHERE employee_id = $1`, [employeeId])
  await pool.query(`DELETE FROM attendance_logs WHERE employee_id = $1`, [employeeId])
  await pool.query(`DELETE FROM leave_requests WHERE employee_id = $1`, [employeeId])
  await pool.query(`DELETE FROM salary_configs WHERE employee_id = $1`, [employeeId])
  await pool.query(`DELETE FROM employees WHERE id = $1`, [employeeId])
  await pool.query(`DELETE FROM users WHERE email = $1`, [TEST_USER_EMAIL])
}
