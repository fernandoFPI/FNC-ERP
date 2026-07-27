import { createHash } from 'crypto'
import { pool } from '@fnc-erp/db'
import { hashPassword, signAccessToken } from '@fnc-erp/auth'

export const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
export const TEST_USER_EMAIL = 'inventory-test@fnc-erp.local'

export async function createTestUser(): Promise<{ userId: string; token: string }> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL, await hashPassword('TestPass123!')],
  )
  const userId = result.rows[0]!.id
  await pool.query(
    `INSERT INTO user_company_roles (user_id, company_id, role, module) VALUES ($1,$2,'company_admin','all') ON CONFLICT DO NOTHING`,
    [userId, TEST_COMPANY_ID],
  )
  const token = signAccessToken({ userId, companyId: TEST_COMPANY_ID, role: 'company_admin', module: 'all', sessionId: 'test-session' })
  const tokenHash = createHash('sha256').update(token).digest('hex')
  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, refresh_token_hash, expires_at, refresh_expires_at)
     VALUES ($1,$2,'test-refresh-hash-inv',NOW() + INTERVAL '1 hour',NOW() + INTERVAL '7 days')
     ON CONFLICT DO NOTHING`,
    [userId, tokenHash],
  )
  return { userId, token }
}

export async function cleanInventoryData() {
  await pool.query(`DELETE FROM sessions WHERE refresh_token_hash = 'test-refresh-hash-inv'`)
  await pool.query(`DELETE FROM stock_moves WHERE company_id = $1`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM stock_balances WHERE product_id IN (SELECT id FROM products WHERE company_id = $1)`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM stock_lots WHERE product_id IN (SELECT id FROM products WHERE company_id = $1)`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM interco_stock_transfer_lines WHERE product_id IN (SELECT id FROM products WHERE company_id = $1)`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM project_material_issue_lines WHERE product_id IN (SELECT id FROM products WHERE company_id = $1)`, [TEST_COMPANY_ID])
  await pool.query(`UPDATE manufacturing_requests SET product_id = NULL WHERE product_id IN (SELECT id FROM products WHERE company_id = $1)`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM products WHERE company_id = $1`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM users WHERE email = $1`, [TEST_USER_EMAIL])
}

export async function getWarehouseLocationId(): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id = $1 AND type = 'warehouse' LIMIT 1`,
    [TEST_COMPANY_ID],
  )
  if (!result.rows[0]) throw new Error('No warehouse location found — run seeds first')
  return result.rows[0].id
}

export async function getVirtualInLocationId(): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id = $1 AND type = 'virtual_in' LIMIT 1`,
    [TEST_COMPANY_ID],
  )
  if (!result.rows[0]) throw new Error('No virtual_in location found — run seeds first')
  return result.rows[0].id
}
