// G1/G2 producer-level coverage for createPayrollJournal (the single most
// severe confirmed-on-prod case: prefix 26 matches nothing under the new
// chart, so every payroll run currently fails to post). Deliberately does
// NOT mock @fnc-erp/db — this runs against a real Postgres test DB
// (playbook #14: a mocked DB proves nothing about the SQL a producer
// actually runs). Calls the producer directly (exported for this reason)
// rather than through the shared, priority-ordered service_outbox poll,
// which in this environment has a large accumulated backlog from other
// services' tests and isn't a reliable way to target one specific row.
import { describe, it, expect, afterAll } from 'vitest'
import { pool, upsertCompanyPostingAccount, PostingAccountNotConfiguredError } from '@fnc-erp/db'
import { createPayrollJournal } from '../src/jobs/outbox-processor.js'

const NAME_PREFIX = 'G1G2-PAYROLL-TEST-'
const TEST_USER_EMAIL = 'g1g2-payroll-journal-test@fnc-erp.local'

async function makeCompanyWithLeafAccounts(): Promise<{ companyId: string; leafAccountIds: string[] }> {
  const companyRes = await pool.query<{ id: string }>(
    `INSERT INTO companies (name, legal_name, country_code, currency_code)
     VALUES ($1,$1,'IQ','IQD') RETURNING id`,
    [`${NAME_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`],
  )
  const companyId = companyRes.rows[0]!.id
  const accountsRes = await pool.query<{ id: string }>(
    `INSERT INTO chart_of_accounts (company_id, code, name, account_type, is_postable, is_active)
     VALUES
       ($1,'5600','Salaries and Wages','expense',true,true),
       ($1,'2600','Accrued Salaries Payable','liability',true,true),
       ($1,'2500','Payroll Tax Payable','liability',true,true)
     RETURNING id`,
    [companyId],
  )
  return { companyId, leafAccountIds: accountsRes.rows.map((r) => r.id) }
}

async function makeUser(): Promise<string> {
  const userR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  return userR.rows[0]!.id
}

async function makePayrollRun(companyId: string, createdBy: string): Promise<string> {
  const runRes = await pool.query<{ id: string }>(
    `INSERT INTO payroll_runs (company_id, period_name, start_date, end_date, status, created_by)
     VALUES ($1,$2,'2031-06-01','2031-06-30','approved',$3) RETURNING id`,
    [companyId, `${NAME_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, createdBy],
  )
  return runRes.rows[0]!.id
}

async function cleanupCompany(companyId: string): Promise<void> {
  await pool.query(
    `DELETE FROM journal_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE company_id=$1)`,
    [companyId],
  )
  await pool.query(`DELETE FROM journal_entries WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM payroll_runs WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM company_posting_accounts WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM chart_of_accounts WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId])
}

afterAll(async () => {
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('createPayrollJournal', () => {
  it('posts a balanced journal to the configured leaf accounts once the map is set', async () => {
    const { companyId, leafAccountIds } = await makeCompanyWithLeafAccounts()
    const userId = await makeUser()
    try {
      await upsertCompanyPostingAccount(companyId, 'expense_default', null, leafAccountIds[0]!, userId)
      await upsertCompanyPostingAccount(companyId, 'salaries_payable', null, leafAccountIds[1]!, userId)
      await upsertCompanyPostingAccount(companyId, 'payroll_tax_payable', null, leafAccountIds[2]!, userId)

      const runId = await makePayrollRun(companyId, userId)
      await createPayrollJournal({
        payroll_run_id: runId,
        company_id: companyId,
        period_name: 'G1G2 test period',
        total_gross: 1000000,
        total_net: 800000,
        total_deductions: 200000,
        end_date: '2031-06-30',
      })

      const run = await pool.query<{ journal_entry_id: string | null }>(
        `SELECT journal_entry_id FROM payroll_runs WHERE id=$1`,
        [runId],
      )
      const jeId = run.rows[0]?.journal_entry_id
      expect(jeId).toBeTruthy()

      const lines = await pool.query<{ account_id: string; debit: string; credit: string }>(
        `SELECT account_id, debit, credit FROM journal_lines WHERE journal_entry_id=$1 ORDER BY debit DESC`,
        [jeId],
      )
      expect(lines.rows).toHaveLength(3)
      const totalDebit = lines.rows.reduce((s, l) => s + parseFloat(l.debit), 0)
      const totalCredit = lines.rows.reduce((s, l) => s + parseFloat(l.credit), 0)
      expect(totalDebit).toBe(totalCredit)
      expect(totalDebit).toBe(1000000)

      const expenseLine = lines.rows.find((l) => l.account_id === leafAccountIds[0])
      expect(parseFloat(expenseLine!.debit)).toBe(1000000)
      const payableLine = lines.rows.find((l) => l.account_id === leafAccountIds[1])
      expect(parseFloat(payableLine!.credit)).toBe(800000)
      const taxLine = lines.rows.find((l) => l.account_id === leafAccountIds[2])
      expect(parseFloat(taxLine!.credit)).toBe(200000)
    } finally {
      await cleanupCompany(companyId)
    }
  })

  it('throws PostingAccountNotConfiguredError instead of a prefix-match "missing GL accounts" error when nothing is set up', async () => {
    const { companyId } = await makeCompanyWithLeafAccounts()
    const userId = await makeUser()
    try {
      const runId = await makePayrollRun(companyId, userId)
      await expect(
        createPayrollJournal({
          payroll_run_id: runId,
          company_id: companyId,
          period_name: 'G1G2 test period',
          total_gross: 1000000,
          total_net: 800000,
          total_deductions: 200000,
          end_date: '2031-06-30',
        }),
      ).rejects.toThrow(PostingAccountNotConfiguredError)

      const run = await pool.query<{ journal_entry_id: string | null }>(
        `SELECT journal_entry_id FROM payroll_runs WHERE id=$1`,
        [runId],
      )
      expect(run.rows[0]?.journal_entry_id).toBeFalsy()
    } finally {
      await cleanupCompany(companyId)
    }
  })
})
