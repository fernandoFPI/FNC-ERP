// Expense claim numbers follow a numbering rule an admin edits at Settings > Document Numbering > Expense Claim (migration 323
// seeded it for the companies that existed then). A company created afterwards must get the same rule, or it would silently
// use the fallback while the Settings page showed an unconfigured Expense Claim. Real-Postgres pattern, same as
// create-company-price-tolerance.test.ts.
import { describe, it, expect, afterAll } from 'vitest'
import { pool, DOC_TYPES } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const NAME_PREFIX = 'COMPANYEXPNUMTEST-'
const TEST_USER_EMAIL = 'create-company-expnum-test@fnc-erp.local'

async function cleanup(): Promise<void> {
  const ids = `SELECT id FROM companies WHERE name LIKE $1`
  await pool.query(`DELETE FROM company_price_tolerance WHERE company_id IN (${ids})`, [`${NAME_PREFIX}%`])
  await pool.query(`DELETE FROM document_sequences WHERE company_id IN (${ids})`, [`${NAME_PREFIX}%`])
  await pool.query(`DELETE FROM system_configuration WHERE company_id IN (${ids})`, [`${NAME_PREFIX}%`])
  await pool.query(`DELETE FROM companies WHERE name LIKE $1`, [`${NAME_PREFIX}%`])
}

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('expense claim numbering rule', () => {
  it('Expense Claim is a document type the Settings page lists', () => {
    const type = DOC_TYPES.find((d) => d.key === 'expense_claim')
    expect(type).toEqual({ key: 'expense_claim', label: 'Expense Claim', defaultPrefix: 'EXP' })
  })

  it('a newly created company gets the rule that reproduces EXP-<year>-NNNN, starting at 1', async () => {
    const userR = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
      [TEST_USER_EMAIL],
    )
    const ctx = {
      auth: { companyId: '', userId: userR.rows[0]!.id, role: 'system_admin', module: 'all', sessionId: 'create-company-expnum-test' },
    }
    const company = (await resolvers.Mutation.createCompany(
      null,
      { input: { name: `${NAME_PREFIX}${Date.now()}`, country_code: 'IQ', interco_transfer_pricing_method: 'last_cost' } },
      ctx as never,
    )) as { id: string }

    const rule = await pool.query(
      `SELECT prefix, next_number, pad_length, year_in_number, separator FROM document_sequences WHERE company_id=$1 AND doc_type='expense_claim'`,
      [company.id],
    )
    expect(rule.rows).toEqual([{ prefix: 'EXP', next_number: 1, pad_length: 4, year_in_number: true, separator: '-' }])
  })

  it("migration 323's rule for an existing company continues from its highest claim number of the year", async () => {
    // The statement the migration runs, applied to a company with a known set of claims (the migration file itself is the only copy).
    const sql = (await import('node:fs')).readFileSync(
      new URL('../../../packages/db/migrations/323_expense_claim_numbering_rule.sql', import.meta.url),
      'utf8',
    )
    const yr = new Date().getFullYear()
    const co = await pool.query<{ id: string }>(
      `INSERT INTO companies (name, legal_name, country_code) VALUES ($1,$1,'IQ') RETURNING id`,
      [`${NAME_PREFIX}MIG-${Date.now()}`],
    )
    const id = co.rows[0]!.id
    const emp = await pool.query<{ id: string }>(
      `INSERT INTO employees (company_id, first_name, last_name, hire_date, employee_number) VALUES ($1,'M','G',CURRENT_DATE,'MIG-1') RETURNING id`,
      [id],
    )
    try {
      for (const n of [`EXP-${yr}-0003`, `EXP-${yr}-0041`, `EXP-${yr - 1}-0099`, 'OTHER-0500']) {
        await pool.query(
          `INSERT INTO expense_claims (company_id, claim_number, employee_id, employee_name, total_amount, status)
           VALUES ($1,$2,$3,'M G',1,'submitted')`,
          [id, n, emp.rows[0]!.id],
        )
      }
      await pool.query(`DELETE FROM document_sequences WHERE company_id=$1 AND doc_type='expense_claim'`, [id])
      await pool.query(sql)
      const rule = await pool.query(
        `SELECT prefix, next_number, pad_length, year_in_number, separator FROM document_sequences WHERE company_id=$1 AND doc_type='expense_claim'`,
        [id],
      )
      expect(rule.rows).toEqual([{ prefix: 'EXP', next_number: 42, pad_length: 4, year_in_number: true, separator: '-' }])
      // running it again changes nothing (an admin's edit is never overwritten)
      await pool.query(`UPDATE document_sequences SET prefix='NY-EXP', next_number=7 WHERE company_id=$1 AND doc_type='expense_claim'`, [id])
      await pool.query(sql)
      const again = await pool.query(`SELECT prefix, next_number FROM document_sequences WHERE company_id=$1 AND doc_type='expense_claim'`, [id])
      expect(again.rows).toEqual([{ prefix: 'NY-EXP', next_number: 7 }])
    } finally {
      await pool.query(`DELETE FROM expense_claims WHERE company_id=$1`, [id])
      await pool.query(`DELETE FROM employees WHERE company_id=$1`, [id])
      await pool.query(`DELETE FROM document_sequences WHERE company_id=$1`, [id])
      await pool.query(`DELETE FROM companies WHERE id=$1`, [id])
    }
  })
})
