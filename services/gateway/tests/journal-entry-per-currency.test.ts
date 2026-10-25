// amount_company_currency is retired. journalEntry/journalEntries used to
// sum jl.debit/jl.credit with no currency grouping (journalEntries also
// picked payment_currency as "whichever currency had the biggest debit
// line" -- an arbitrary label, same shape as the pre-D10 PO header-currency
// gap). Both now return total_debit/total_credit/payment_currency only
// when every line of the entry shares one currency_code, NULL otherwise --
// same convention as recalcPOTotalsGW. The per-line breakdown (lines.rows)
// always has the real currency_code/debit/credit regardless. Real-Postgres
// pattern, isolated company.
import { describe, it, expect, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const NAME_PREFIX = 'G-JECUR-TEST-'
const TEST_USER_EMAIL = 'g-journal-entry-currency-test@fnc-erp.local'

async function makeCompany(): Promise<{ companyId: string; userId: string; accountId: string }> {
  const companyRes = await pool.query<{ id: string }>(
    `INSERT INTO companies (name, legal_name, country_code, currency_code)
     VALUES ($1,$1,'IQ','IQD') RETURNING id`,
    [`${NAME_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`],
  )
  const companyId = companyRes.rows[0]!.id
  const acctCode = String(9000 + Math.floor(Math.random() * 999))
  const acctRes = await pool.query<{ id: string }>(
    `INSERT INTO chart_of_accounts (company_id, code, name, account_type, is_postable, is_active)
     VALUES ($1,$2,'Test Expense','expense',true,true) RETURNING id`,
    [companyId, acctCode],
  )
  const accountId = acctRes.rows[0]!.id
  const userR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  const userId = userR.rows[0]!.id
  await pool.query(
    `INSERT INTO user_company_roles (user_id, company_id, role, module) VALUES ($1,$2,'system_admin','all') ON CONFLICT DO NOTHING`,
    [userId, companyId],
  )
  return { companyId, userId, accountId }
}

function ctxFor(companyId: string, userId: string) {
  return { auth: { companyId, userId, role: 'system_admin', module: 'all', sessionId: 'je-currency-test' } }
}

async function makeEntry(
  companyId: string,
  accountId: string,
  userId: string,
  lines: { debit: number; credit: number; currency_code: string }[],
): Promise<string> {
  const jeRes = await pool.query<{ id: string }>(
    `INSERT INTO journal_entries (company_id, reference, description, entry_date, status, created_by)
     VALUES ($1,$2,'test entry',CURRENT_DATE,'posted',$3) RETURNING id`,
    [companyId, `${NAME_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, userId],
  )
  const jeId = jeRes.rows[0]!.id
  for (const l of lines) {
    await pool.query(
      `INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, currency_code, amount_company_currency)
       VALUES ($1,$2,$3,$4,$5,999999)`,
      [jeId, accountId, l.debit, l.credit, l.currency_code],
    )
  }
  return jeId
}

async function cleanup(companyId: string): Promise<void> {
  await pool.query(
    `DELETE FROM journal_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE company_id=$1)`,
    [companyId],
  )
  await pool.query(`DELETE FROM journal_entries WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM chart_of_accounts WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM user_company_roles WHERE company_id=$1`, [companyId])
  await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId])
}

afterAll(async () => {
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('createJournalEntry — per-currency balance, no conversion', () => {
  it('accepts an entry whose currencies each balance on their own', async () => {
    const { companyId, userId, accountId } = await makeCompany()
    try {
      const created = (await resolvers.Mutation.createJournalEntry(
        null,
        {
          input: {
            entry_date: '2031-01-01',
            lines: [
              { account_id: accountId, debit: 1000, credit: 0, currency_code: 'IQD' },
              { account_id: accountId, debit: 0, credit: 1000, currency_code: 'IQD' },
              { account_id: accountId, debit: 30, credit: 0, currency_code: 'USD' },
              { account_id: accountId, debit: 0, credit: 30, currency_code: 'USD' },
            ],
          },
        },
        ctxFor(companyId, userId) as never,
      )) as { id: string }

      const lines = await pool.query<{ debit: string; credit: string; currency_code: string; amount_company_currency: string }>(
        `SELECT debit, credit, currency_code, amount_company_currency FROM journal_lines WHERE journal_entry_id=$1 ORDER BY currency_code`,
        [created.id],
      )
      expect(lines.rows).toHaveLength(4)
      // No conversion: amount_company_currency equals the line's own amount.
      for (const l of lines.rows) {
        const amt = Math.max(parseFloat(l.debit), parseFloat(l.credit))
        expect(parseFloat(l.amount_company_currency)).toBe(amt)
      }
    } finally {
      await cleanup(companyId)
    }
  })

  it('rejects an entry where one currency is unbalanced, even if the cross-currency sum looks balanced', async () => {
    const { companyId, userId, accountId } = await makeCompany()
    try {
      // IQD: 100 debit only (unbalanced). USD: 100 credit only (unbalanced).
      // A blind cross-currency sum (100 debit vs 100 credit) would wrongly
      // look balanced -- per-currency validation must still reject it.
      await expect(
        resolvers.Mutation.createJournalEntry(
          null,
          {
            input: {
              entry_date: '2031-01-01',
              lines: [
                { account_id: accountId, debit: 100, credit: 0, currency_code: 'IQD' },
                { account_id: accountId, debit: 0, credit: 100, currency_code: 'USD' },
              ],
            },
          },
          ctxFor(companyId, userId) as never,
        ),
      ).rejects.toThrow(/not balanced/i)
    } finally {
      await cleanup(companyId)
    }
  })
})

describe('journalEntry / journalEntries — per currency, ignores amount_company_currency', () => {
  it('journalEntry: single-currency entry reports the real debit/credit', async () => {
    const { companyId, userId, accountId } = await makeCompany()
    try {
      const jeId = await makeEntry(companyId, accountId, userId, [
        { debit: 500, credit: 0, currency_code: 'USD' },
        { debit: 0, credit: 500, currency_code: 'USD' },
      ])
      const result = (await resolvers.Query.journalEntry(
        null,
        { id: jeId },
        ctxFor(companyId, userId) as never,
      )) as { total_debit: string; total_credit: string; lines: unknown[] }
      expect(parseFloat(result.total_debit)).toBe(500)
      expect(parseFloat(result.total_credit)).toBe(500)
      expect(result.lines).toHaveLength(2)
    } finally {
      await cleanup(companyId)
    }
  })

  it('journalEntry: mixed-currency entry returns NULL totals, never a blended number', async () => {
    const { companyId, userId, accountId } = await makeCompany()
    try {
      const jeId = await makeEntry(companyId, accountId, userId, [
        { debit: 200000, credit: 0, currency_code: 'IQD' },
        { debit: 0, credit: 30, currency_code: 'USD' },
      ])
      const result = (await resolvers.Query.journalEntry(
        null,
        { id: jeId },
        ctxFor(companyId, userId) as never,
      )) as { total_debit: string | null; total_credit: string | null; lines: { currency_code: string }[] }
      expect(result.total_debit).toBeNull()
      expect(result.total_credit).toBeNull()
      // The real per-currency breakdown is still visible line by line.
      expect(result.lines.map((l) => l.currency_code).sort()).toEqual(['IQD', 'USD'])
    } finally {
      await cleanup(companyId)
    }
  })

  it('journalEntries: keeps a mixed-currency entry\'s totals/payment_currency NULL among single-currency ones', async () => {
    const { companyId, userId, accountId } = await makeCompany()
    try {
      const singleId = await makeEntry(companyId, accountId, userId, [
        { debit: 1000, credit: 0, currency_code: 'IQD' },
        { debit: 0, credit: 1000, currency_code: 'IQD' },
      ])
      const mixedId = await makeEntry(companyId, accountId, userId, [
        { debit: 400, credit: 0, currency_code: 'IQD' },
        { debit: 0, credit: 7, currency_code: 'USD' },
      ])
      const rows = (await resolvers.Query.journalEntries(
        null,
        {},
        ctxFor(companyId, userId) as never,
      )) as { id: string; total_debit: string | null; payment_currency: string | null }[]
      const single = rows.find((r) => r.id === singleId)!
      const mixed = rows.find((r) => r.id === mixedId)!
      expect(parseFloat(single.total_debit!)).toBe(1000)
      expect(single.payment_currency).toBe('IQD')
      expect(mixed.total_debit).toBeNull()
      expect(mixed.payment_currency).toBeNull()
    } finally {
      await cleanup(companyId)
    }
  })
})
