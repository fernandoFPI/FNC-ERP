import { createHash } from 'crypto'
import { pool } from '@fnc-erp/db'
import { hashPassword, signAccessToken } from '@fnc-erp/auth'

export const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000002' // Nishtimani Factory
export const TEST_USER_EMAIL = 'mfg-test@fnc-erp.local'

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
  const token = signAccessToken({ userId, companyId: TEST_COMPANY_ID, role: 'company_admin', module: 'all', sessionId: 'test-session-mfg' })
  const tokenHash = createHash('sha256').update(token).digest('hex')
  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, refresh_token_hash, expires_at, refresh_expires_at)
     VALUES ($1,$2,'test-refresh-hash-mfg',NOW() + INTERVAL '1 hour',NOW() + INTERVAL '7 days')
     ON CONFLICT DO NOTHING`,
    [userId, tokenHash],
  )
  return { userId, token }
}

/** Delete ALL test data in safe FK order */
export async function cleanMfgData(): Promise<void> {
  // Get all test bom ids
  const testBoms = await pool.query<{ id: string }>(
    `SELECT id FROM boms WHERE company_id=$1 AND name LIKE 'TEST-%'`, [TEST_COMPANY_ID],
  )
  for (const b of testBoms.rows) {
    // Delete in FK order: wc_time → consumptions → orders → bom_lines → bom
    await pool.query(`DELETE FROM mo_work_center_time WHERE mo_id IN (SELECT id FROM manufacturing_orders WHERE bom_id=$1)`, [b['id']])
    await pool.query(`DELETE FROM mo_consumptions WHERE mo_id IN (SELECT id FROM manufacturing_orders WHERE bom_id=$1)`, [b['id']])
    await pool.query(`DELETE FROM manufacturing_orders WHERE bom_id=$1`, [b['id']])
    await pool.query(`DELETE FROM bom_lines WHERE bom_id=$1`, [b['id']])
    await pool.query(`DELETE FROM boms WHERE id=$1`, [b['id']])
  }
  // Now safe to delete work centers (bom_lines referencing them are gone)
  await pool.query(`DELETE FROM work_centers WHERE company_id=$1 AND code LIKE 'TEST-%'`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM sessions WHERE refresh_token_hash = 'test-refresh-hash-mfg'`)
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
}

export async function getOrCreateTestProduct(sku: string, avgCost: number): Promise<string> {
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM products WHERE company_id=$1 AND sku=$2`, [TEST_COMPANY_ID, sku],
  )
  if (existing.rows[0]) return existing.rows[0]['id']
  const p = await pool.query<{ id: string }>(
    `INSERT INTO products (company_id, sku, name, uom, valuation_method, average_cost)
     VALUES ($1,$2,$3,'unit','avco',$4) RETURNING id`,
    [TEST_COMPANY_ID, sku, `Test Product ${sku}`, avgCost],
  )
  return p.rows[0]!['id']
}
