// Expense claim numbers follow the company's numbering rule (Settings > Document Numbering > Expense Claim, migration 323):
// prefix, separator, digits, year in the number and the next number are the admin's. Until then the format was hard-coded as
// EXP-<year>-NNNN, so there was nothing to control.
//
// What must hold, whatever the admin types: the number is built from the rule; the counter moves in the submitting
// transaction (a failed submit gives the number back); a number that already exists is never issued again (an admin lowering
// the counter, or older numbers, cannot reproduce the duplicate of playbook #28); and a company with no rule keeps the old
// format. Real Postgres through the real routes (supertest), in the finance fixture company.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { pool, upsertDocumentSequence, formatDocumentNumber, documentNumberPattern } from '@fnc-erp/db'
import { TEST_COMPANY_ID, createTestUser, cleanFinanceData, getAccountId } from './setup.js'

const app = createApp()
const yr = new Date().getFullYear()
const EMP_NUMBER = 'EXP-NUMBERING-RULE-TEST'

let token = ''
let employeeId = ''
let categoryId = ''

async function cleanClaims(): Promise<void> {
  await pool.query(`DELETE FROM expense_claim_lines WHERE company_id=$1`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM expense_claims WHERE company_id=$1`, [TEST_COMPANY_ID])
}

async function cleanFixtures(): Promise<void> {
  await cleanClaims()
  await pool.query(`DELETE FROM expense_categories WHERE company_id=$1`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM employees WHERE employee_number=$1`, [EMP_NUMBER])
  await pool.query(`DELETE FROM document_sequences WHERE company_id=$1 AND doc_type='expense_claim'`, [TEST_COMPANY_ID])
}

// The rule as Settings saves it (the same function the admin route calls).
const setRule = (over: Partial<{ prefix: string; next_number: number; pad_length: number; year_in_number: boolean; separator: string }> = {}) =>
  upsertDocumentSequence(TEST_COMPANY_ID, 'expense_claim', {
    prefix: 'EXP',
    next_number: 1,
    pad_length: 4,
    year_in_number: true,
    separator: '-',
    ...over,
  })

async function counter(): Promise<number | null> {
  const r = await pool.query<{ next_number: number }>(
    `SELECT next_number FROM document_sequences WHERE company_id=$1 AND doc_type='expense_claim'`,
    [TEST_COMPANY_ID],
  )
  return r.rows[0]?.next_number ?? null
}

async function seedClaim(claimNumber: string): Promise<void> {
  await pool.query(
    `INSERT INTO expense_claims (company_id, claim_number, employee_id, employee_name, total_amount, status)
     VALUES ($1,$2,$3,'Rule Tester',1000,'submitted')`,
    [TEST_COMPANY_ID, claimNumber, employeeId],
  )
}

function submit(categoryOverride?: string): Promise<request.Response> {
  return request(app)
    .post('/finance/expense-claims/request-self')
    .set('Authorization', `Bearer ${token}`)
    .send({
      currency_code: 'IQD',
      lines: [{ expense_date: '2026-01-10', category_id: categoryOverride ?? categoryId, description: 'Rule test', amount: 5000 }],
    })
}

beforeAll(async () => {
  const user = await createTestUser()
  token = user.token
  await cleanFixtures()
  const gl = await getAccountId('5700')
  const emp = await pool.query<{ id: string }>(
    `INSERT INTO employees (company_id, user_id, first_name, last_name, hire_date, employee_number)
     VALUES ($1,$2,'Rule','Tester',CURRENT_DATE,$3)
     ON CONFLICT (company_id, employee_number) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING id`,
    [TEST_COMPANY_ID, user.userId, EMP_NUMBER],
  )
  employeeId = emp.rows[0]!.id
  const cat = await pool.query<{ id: string }>(
    `INSERT INTO expense_categories (company_id, name, gl_account_id) VALUES ($1,'Numbering Rule Category',$2) RETURNING id`,
    [TEST_COMPANY_ID, gl],
  )
  categoryId = cat.rows[0]!.id
})

afterAll(async () => {
  await cleanFixtures()
  await cleanFinanceData()
  await pool.end()
})

beforeEach(async () => {
  await cleanClaims()
  await setRule()
})

describe('expense claim number from the company rule', () => {
  it('uses the prefix, separator, digits and next number the admin set, then counts on', async () => {
    await setRule({ prefix: 'XC', separator: '/', pad_length: 5, year_in_number: false, next_number: 7 })
    const first = await submit()
    expect(first.status).toBe(201)
    expect(first.body.data.claim_number).toBe('XC/00007')
    expect(await counter()).toBe(8)
    const second = await submit()
    expect(second.body.data.claim_number).toBe('XC/00008')
    expect(await counter()).toBe(9)
  })

  it('puts the year in the number when the rule says so', async () => {
    await setRule({ year_in_number: true, next_number: 12 })
    const res = await submit()
    expect(res.body.data.claim_number).toBe(`EXP-${yr}-0012`)
  })

  it('the rule migration 323 seeds gives exactly the format used before it was configurable', async () => {
    await setRule({ prefix: 'EXP', separator: '-', pad_length: 4, year_in_number: true, next_number: 1 })
    const res = await submit()
    expect(res.body.data.claim_number).toBe(`EXP-${yr}-0001`)
  })

  it('a change saved in Settings applies to the very next claim', async () => {
    const a = await submit()
    expect(a.body.data.claim_number).toBe(`EXP-${yr}-0001`)
    await setRule({ prefix: 'NY-EXP', next_number: 100 })
    const b = await submit()
    expect(b.body.data.claim_number).toBe(`NY-EXP-${yr}-0100`)
  })

  it('goes past the highest number in use when the counter was set lower, and the counter follows', async () => {
    await setRule({ prefix: 'XC', separator: '/', pad_length: 5, year_in_number: false, next_number: 3 })
    await seedClaim('XC/00003')
    await seedClaim('XC/00009')
    const res = await submit()
    expect(res.status).toBe(201)
    expect(res.body.data.claim_number).toBe('XC/00010')
    expect(await counter()).toBe(11)
  })

  it('with the year in the number, an existing number of this year is seen as in use', async () => {
    await setRule({ prefix: 'EXP', year_in_number: true, next_number: 2 })
    await seedClaim(`EXP-${yr}-0010`)
    const res = await submit()
    expect(res.status).toBe(201)
    expect(res.body.data.claim_number).toBe(`EXP-${yr}-0011`)
    expect(await counter()).toBe(12)
  })

  it('does not count numbers of another year or another prefix as "in use"', async () => {
    await setRule({ next_number: 2 })
    await seedClaim(`EXP-${yr - 1}-0099`) // last year's: the same prefix, a different year
    await seedClaim(`OTHER-${yr}-0050`) // another prefix
    const res = await submit()
    expect(res.body.data.claim_number).toBe(`EXP-${yr}-0002`)
  })

  it('a prefix with characters that mean something in a pattern is matched literally', async () => {
    await setRule({ prefix: 'A.B', separator: '-', year_in_number: false, pad_length: 4, next_number: 1 })
    await seedClaim('AxB-0005') // looks like A.B-NNNN if the dot were a wildcard
    const res = await submit()
    expect(res.status).toBe(201)
    expect(res.body.data.claim_number).toBe('A.B-0001')
  })

  it('simultaneous submits get distinct consecutive numbers and the counter advances by that many', async () => {
    await setRule({ next_number: 5 })
    const results = await Promise.all([submit(), submit(), submit()])
    for (const r of results) expect(r.status).toBe(201)
    const numbers = results.map((r) => r.body.data.claim_number as string).sort()
    expect(numbers).toEqual([`EXP-${yr}-0005`, `EXP-${yr}-0006`, `EXP-${yr}-0007`])
    expect(await counter()).toBe(8)
  })

  it('a submit that fails after the number was taken gives it back', async () => {
    await setRule({ next_number: 20 })
    const failed = await submit('00000000-0000-0000-0000-00000000dead') // no such category: refused after the number is taken
    expect(failed.status).not.toBe(201)
    expect(await counter()).toBe(20)
    const ok = await submit()
    expect(ok.body.data.claim_number).toBe(`EXP-${yr}-0020`)
  })

  it('one running count: a claim from last year does not restart it in January', async () => {
    await setRule({ next_number: 54 })
    await seedClaim(`EXP-${yr - 1}-0053`)
    const res = await submit()
    expect(res.body.data.claim_number).toBe(`EXP-${yr}-0054`)
  })

  it('a company with no rule keeps the original EXP-YYYY-NNNN, and no rule is created behind its back', async () => {
    await pool.query(`DELETE FROM document_sequences WHERE company_id=$1 AND doc_type='expense_claim'`, [TEST_COMPANY_ID])
    await seedClaim(`EXP-${yr}-0004`)
    const res = await submit()
    expect(res.status).toBe(201)
    expect(res.body.data.claim_number).toBe(`EXP-${yr}-0005`)
    expect(await counter()).toBeNull()
  })

  it("another company's rule and claims do not affect this company's number", async () => {
    const OTHER = '00000000-0000-0000-0000-000000000001'
    const had = await pool.query<{ next_number: number }>(
      `SELECT next_number FROM document_sequences WHERE company_id=$1 AND doc_type='expense_claim'`,
      [OTHER],
    )
    // the other company's counter is far ahead and it holds a claim with a high number in the SAME shape; neither may leak in
    await pool.query(
      `INSERT INTO document_sequences (company_id, doc_type, prefix, next_number, pad_length, year_in_number, separator)
       VALUES ($1,'expense_claim','EXP',900,4,true,'-')
       ON CONFLICT (company_id, doc_type) DO UPDATE SET next_number = 900`,
      [OTHER],
    )
    const otherEmp = await pool.query<{ id: string }>(
      `INSERT INTO employees (company_id, first_name, last_name, hire_date, employee_number)
       VALUES ($1,'Other','Co',CURRENT_DATE,'EXP-NUMBERING-RULE-OTHER') RETURNING id`,
      [OTHER],
    )
    await pool.query(
      `INSERT INTO expense_claims (company_id, claim_number, employee_id, employee_name, total_amount, status)
       VALUES ($1,$2,$3,'Other Co',1,'submitted')`,
      [OTHER, `EXP-${yr}-0500`, otherEmp.rows[0]!.id],
    )
    try {
      await setRule({ next_number: 1 })
      const res = await submit()
      expect(res.body.data.claim_number).toBe(`EXP-${yr}-0001`)
      const other = await pool.query<{ next_number: number }>(
        `SELECT next_number FROM document_sequences WHERE company_id=$1 AND doc_type='expense_claim'`,
        [OTHER],
      )
      expect(other.rows[0]!.next_number).toBe(900)
    } finally {
      await pool.query(`DELETE FROM expense_claims WHERE company_id=$1 AND claim_number=$2`, [OTHER, `EXP-${yr}-0500`])
      await pool.query(`DELETE FROM employees WHERE id=$1`, [otherEmp.rows[0]!.id])
      if (had.rows.length === 0) {
        await pool.query(`DELETE FROM document_sequences WHERE company_id=$1 AND doc_type='expense_claim'`, [OTHER])
      } else {
        await pool.query(`UPDATE document_sequences SET next_number=$2 WHERE company_id=$1 AND doc_type='expense_claim'`, [OTHER, had.rows[0]!.next_number])
      }
    }
  })
})

describe('number format and pattern (the pattern is checked by Postgres itself)', () => {
  const rule = (over: Partial<{ prefix: string; pad_length: number; year_in_number: boolean; separator: string }> = {}) => ({
    prefix: 'EXP',
    pad_length: 4,
    year_in_number: true,
    separator: '-',
    ...over,
  })
  const matches = async (pattern: string, candidate: string): Promise<boolean> =>
    (await pool.query<{ m: boolean }>(`SELECT $1::text ~ $2::text AS m`, [candidate, pattern])).rows[0]!.m

  it('formats with and without the year, with the chosen padding and separator', () => {
    expect(formatDocumentNumber(rule(), 7, 2026)).toBe('EXP-2026-0007')
    expect(formatDocumentNumber(rule({ year_in_number: false }), 7, 2026)).toBe('EXP-0007')
    expect(formatDocumentNumber(rule({ prefix: 'NY/X', separator: '/', pad_length: 6 }), 12345, 2026)).toBe('NY/X/2026/012345')
    expect(formatDocumentNumber(rule({ pad_length: 2 }), 123, 2026)).toBe('EXP-2026-123') // never truncated
  })

  it('matches its own numbers of that year and nothing else', async () => {
    const p = documentNumberPattern(rule(), 2026)
    expect(await matches(p, 'EXP-2026-0001')).toBe(true)
    expect(await matches(p, 'EXP-2026-123456')).toBe(true)
    expect(await matches(p, 'EXP-2025-0001')).toBe(false)
    expect(await matches(p, 'EXP-0001')).toBe(false)
    expect(await matches(p, 'XEXP-2026-0001')).toBe(false)
    expect(await matches(p, 'EXP-2026-0001-X')).toBe(false)
    expect(await matches(p, 'EXP-2026-')).toBe(false)
  })

  it.each(['A.B', 'A+B', 'A*B', 'A(B)', 'A[B]', 'A|B', 'A^B$', 'A\\B', 'A?B', 'A{2}', 'A/B', 'A-B'])(
    'a prefix of "%s" matches only itself',
    async (prefix) => {
      const p = documentNumberPattern(rule({ prefix, year_in_number: false }), 2026)
      expect(await matches(p, `${prefix}-0001`)).toBe(true)
      expect(await matches(p, 'AxB-0001')).toBe(false)
      expect(await matches(p, 'AAB-0001')).toBe(false)
      expect(await matches(p, 'A-0001')).toBe(false)
    },
  )
})
