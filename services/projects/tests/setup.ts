import { createHash } from 'crypto'
import { pool } from '@fnc-erp/db'
import { hashPassword, signAccessToken } from '@fnc-erp/auth'

// Dedicated to projects' own tests — see packages/db/seeds/seed-test-fixtures.ts
// (fixes the shared-fixture race: every service used to share company
// 00000000-0000-0000-0000-000000000001, racing under full parallel `pnpm test`).
export const TEST_COMPANY_ID = 'f0000000-0000-0000-0000-000000000006'
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

// A wire-transfer invoice needs an active bank account before it can be submitted, approved or issued
// (src/lib/invoiceBankAccount.ts), and invoice creation does not choose one. Tests that push an invoice forward call this
// right after creating it. bank_accounts has no company column; one named test account is reused.
export async function attachTestBankAccount(invoiceId: string): Promise<string> {
  const found = await pool.query<{ id: string }>(`SELECT id FROM bank_accounts WHERE account_name = 'TEST-BANK-PRJ' LIMIT 1`)
  const bankId =
    found.rows[0]?.id ??
    (
      await pool.query<{ id: string }>(
        `INSERT INTO bank_accounts (account_name, bank_name, currency_code) VALUES ('TEST-BANK-PRJ', 'Test Bank', 'IQD') RETURNING id`,
      )
    ).rows[0]!.id
  await pool.query(`UPDATE project_invoices SET bank_account_id = $2 WHERE id = $1`, [invoiceId, bankId])
  return bankId
}

export async function cleanProjectsData(): Promise<void> {
  // Only an account no invoice still points at (the invoices are deleted by each test file before this runs).
  await pool.query(
    `DELETE FROM bank_accounts b WHERE b.account_name LIKE 'TEST-BANK-%'
       AND NOT EXISTS (SELECT 1 FROM project_invoices pi WHERE pi.bank_account_id = b.id)`,
  )
  await pool.query(`DELETE FROM sessions WHERE refresh_token_hash = 'test-refresh-hash-projects'`)
  await pool.query(`DELETE FROM project_cost_actuals WHERE project_id IN (SELECT id FROM projects WHERE company_id=$1 AND code LIKE 'TEST-%')`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM project_members WHERE project_id IN (SELECT id FROM projects WHERE company_id=$1 AND code LIKE 'TEST-%')`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM project_stages WHERE project_id IN (SELECT id FROM projects WHERE company_id=$1 AND code LIKE 'TEST-%')`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM project_budget_lines WHERE project_id IN (SELECT id FROM projects WHERE company_id=$1 AND code LIKE 'TEST-%')`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM project_status_history WHERE project_id IN (SELECT id FROM projects WHERE company_id=$1 AND code LIKE 'TEST-%')`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM project_status_history WHERE changed_by IN (SELECT id FROM users WHERE email=$1)`, [TEST_USER_EMAIL])
  await pool.query(`DELETE FROM analytic_accounts WHERE company_id=$1 AND code LIKE 'PRJ-TEST-%'`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM projects WHERE company_id=$1 AND code LIKE 'TEST-%'`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
}
