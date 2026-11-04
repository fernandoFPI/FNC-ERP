// A rejected expense claim can be fixed and resubmitted by whoever filed it, lines carry a
// stable "#", and an approver can reject specific lines (migration 312).
//
// Regression background (EXP-2026-0043, Al Watanyia, 19 lines): the claim was rejected with
// "Line 10 has an incorrect price", the approver having counted rows by hand because lines had
// no number, and the employee could not edit a rejected claim at all (rejected was terminal,
// and Edit needed finance.expenses.edit, which the people who file claims do not hold).
//
// Real Postgres through the real routes (supertest), like expense-claims-funding.test.ts. The
// owner is a plain `user` with NO finance.expenses.* permission, which is who files most claims.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createHash } from 'crypto'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { pool } from '@fnc-erp/db'
import { hashPassword, signAccessToken } from '@fnc-erp/auth'
import { TEST_COMPANY_ID, createTestUser, cleanFinanceData, getAccountId } from './setup.js'

const app = createApp()
const OTHER_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const REFRESH_HASH = 'test-refresh-hash-finance-revise'

const OWNER_EMAIL = 'exp-revise-owner@fnc-erp.local'
const STRANGER_EMAIL = 'exp-revise-stranger@fnc-erp.local'
const EDITOR_EMAIL = 'exp-revise-editor@fnc-erp.local'
const OUTSIDER_EMAIL = 'exp-revise-outsider@fnc-erp.local'

let adminToken: string
let ownerToken: string
let ownerId: string
let strangerToken: string
let editorToken: string
let outsiderToken: string
let employeeId: string
let categoryId: string
let otherCategoryId: string
let foreignCategoryId: string
let cashAccountId: string

async function makeUser(
  email: string,
  companyId: string,
  role: string,
): Promise<{ userId: string; token: string }> {
  const passwordHash = await hashPassword('TestPass123!')
  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,$2)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [email, passwordHash],
  )
  const userId = u.rows[0]!.id
  await pool.query(
    `INSERT INTO user_company_roles (user_id, company_id, role, module) VALUES ($1,$2,$3,'all') ON CONFLICT DO NOTHING`,
    [userId, companyId, role],
  )
  const token = signAccessToken({ userId, companyId, role, module: 'all', sessionId: 'test-session' })
  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, refresh_token_hash, expires_at, refresh_expires_at)
     VALUES ($1,$2,$3,NOW() + INTERVAL '1 hour',NOW() + INTERVAL '7 days') ON CONFLICT DO NOTHING`,
    [userId, createHash('sha256').update(token).digest('hex'), `${REFRESH_HASH}-${userId}`],
  )
  return { userId, token }
}

async function cleanFixtures(): Promise<void> {
  await pool.query(
    `DELETE FROM document_attachments WHERE entity_type IN ('expense_claim','expense_claim_line')
       AND uploaded_by IN (SELECT id FROM users WHERE email LIKE 'exp-revise-%')`,
  )
  await pool.query(`DELETE FROM files WHERE company_id=$1 AND file_key LIKE 'revise-test-%'`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM expense_claim_lines WHERE company_id=$1`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM expense_claims WHERE company_id=$1`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM expense_categories WHERE company_id IN ($1,$2) AND name LIKE 'Revise Test%'`, [
    TEST_COMPANY_ID,
    OTHER_COMPANY_ID,
  ])
  await pool.query(`DELETE FROM employees WHERE employee_number='EXP-REVISE-TEST'`)
  await pool.query(`DELETE FROM user_permissions WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'exp-revise-%')`)
  await pool.query(`DELETE FROM users WHERE email LIKE 'exp-revise-%'`)
  await pool.query(`DELETE FROM sessions WHERE refresh_token_hash LIKE $1`, [`${REFRESH_HASH}%`])
}

beforeAll(async () => {
  adminToken = (await createTestUser()).token
  await cleanFixtures()

  const owner = await makeUser(OWNER_EMAIL, TEST_COMPANY_ID, 'user')
  ownerToken = owner.token
  ownerId = owner.userId
  strangerToken = (await makeUser(STRANGER_EMAIL, TEST_COMPANY_ID, 'user')).token
  const editor = await makeUser(EDITOR_EMAIL, TEST_COMPANY_ID, 'user')
  editorToken = editor.token
  outsiderToken = (await makeUser(OUTSIDER_EMAIL, OTHER_COMPANY_ID, 'company_admin')).token
  // The editor may edit drafts (finance.expenses.edit) but is not the claim's owner.
  await pool.query(
    `INSERT INTO user_permissions (user_id, company_id, permission_key, access_level)
     VALUES ($1,$2,'finance.expenses.edit','edit') ON CONFLICT (user_id, company_id, permission_key) DO UPDATE SET access_level='edit'`,
    [editor.userId, TEST_COMPANY_ID],
  )

  const empRes = await pool.query<{ id: string }>(
    `INSERT INTO employees (company_id, user_id, first_name, last_name, hire_date, employee_number)
     VALUES ($1,$2,'Revise','Owner',CURRENT_DATE,'EXP-REVISE-TEST') RETURNING id`,
    [TEST_COMPANY_ID, owner.userId],
  )
  employeeId = empRes.rows[0]!.id

  cashAccountId = await getAccountId('1100')
  const gl = await getAccountId('5700')
  const cat = async (companyId: string, name: string, accountId: string | null): Promise<string> =>
    (
      await pool.query<{ id: string }>(
        `INSERT INTO expense_categories (company_id, name, gl_account_id) VALUES ($1,$2,$3) RETURNING id`,
        [companyId, name, accountId],
      )
    ).rows[0]!.id
  categoryId = await cat(TEST_COMPANY_ID, 'Revise Test Fuel', gl)
  otherCategoryId = await cat(TEST_COMPANY_ID, 'Revise Test Meals', gl)
  foreignCategoryId = await cat(OTHER_COMPANY_ID, 'Revise Test Foreign', null)
})

afterAll(async () => {
  await cleanFixtures()
  await cleanFinanceData()
  await pool.end()
})

beforeEach(async () => {
  await pool.query(`DELETE FROM document_attachments WHERE entity_type='expense_claim_line'
    AND entity_id IN (SELECT id FROM expense_claim_lines WHERE company_id=$1)`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM expense_claim_lines WHERE company_id=$1`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM expense_claims WHERE company_id=$1`, [TEST_COMPANY_ID])
})

interface Line {
  id: string
  line_number: number
  amount: string
  description: string | null
  category_id: string | null
  flag_reason: string | null
  flag_addressed_at: string | null
  flag_resolved_at: string | null
  gl_account_id: string | null
}

// Three lines entered newest-date-first, so entry order differs from date order.
async function fileClaim(token = ownerToken): Promise<{ id: string; lines: Line[] }> {
  const res = await request(app)
    .post('/finance/expense-claims/request-self')
    .set('Authorization', `Bearer ${token}`)
    .send({
      currency_code: 'IQD',
      lines: [
        { expense_date: '2026-03-03', category_id: categoryId, description: 'Taxi', amount: 10000 },
        { expense_date: '2026-03-02', category_id: categoryId, description: 'Fuel', amount: 20000 },
        { expense_date: '2026-03-01', category_id: otherCategoryId, description: 'Lunch', amount: 5000 },
      ],
    })
  expect(res.status).toBe(201)
  return { id: res.body.data.id as string, lines: res.body.data.lines as Line[] }
}

async function getClaim(id: string): Promise<{ status: number; body: Record<string, any> }> {
  const res = await request(app).get(`/finance/expense-claims/${id}`).set('Authorization', `Bearer ${adminToken}`)
  return { status: res.status, body: res.body.data }
}

const reject = (id: string, body: unknown, token = adminToken) =>
  request(app).post(`/finance/expense-claims/${id}/reject`).set('Authorization', `Bearer ${token}`).send(body as object)

const revise = (id: string, body: unknown, token = ownerToken) =>
  request(app).post(`/finance/expense-claims/${id}/revise`).set('Authorization', `Bearer ${token}`).send(body as object)

// Each of the claim's current lines, unchanged, ready to send back to /revise.
function same(lines: Line[]): Record<string, unknown>[] {
  const dates: Record<string, string> = { Taxi: '2026-03-03', Fuel: '2026-03-02', Lunch: '2026-03-01' }
  return lines.map((l) => ({
    id: l.id,
    expense_date: dates[l.description ?? 'Taxi'],
    description: l.description,
    amount: Number(l.amount),
  }))
}

describe('line numbers', () => {
  it('numbers lines 1..n in the order they were entered, not by date', async () => {
    const { id, lines } = await fileClaim()
    expect(lines.map((l) => [l.line_number, l.description])).toEqual([
      [1, 'Taxi'],
      [2, 'Fuel'],
      [3, 'Lunch'],
    ])
    const got = await getClaim(id)
    // Dates run backwards, so a date sort would put Lunch first.
    expect(got.body.lines.map((l: Line) => l.description)).toEqual(['Taxi', 'Fuel', 'Lunch'])
  })

  it('numbers a line inserted by hand without a number (no insert path can forget it)', async () => {
    const { id } = await fileClaim()
    const r = await pool.query<{ line_number: number }>(
      `INSERT INTO expense_claim_lines (claim_id, company_id, expense_date, amount) VALUES ($1,$2,'2026-03-05',1) RETURNING line_number`,
      [id, TEST_COMPANY_ID],
    )
    expect(r.rows[0]!.line_number).toBe(4)
  })

  it('never reuses the number of a removed line', async () => {
    const { id, lines } = await fileClaim()
    // Remove the highest line (3), then add a new one.
    const res = await revise(id, { lines: same(lines.slice(0, 2)) })
    // Not editable yet (status submitted): so reject it first.
    expect(res.status).toBe(409)
    await reject(id, { reason: 'fix it' })
    const removed = await revise(id, { lines: same(lines.slice(0, 2)) })
    expect(removed.status).toBe(200)
    const added = await revise(id, {
      lines: [...same(lines.slice(0, 2)), { expense_date: '2026-03-06', category_id: categoryId, description: 'New', amount: 1000 }],
    })
    expect(added.status).toBe(200)
    expect(added.body.data.lines.map((l: Line) => l.line_number)).toEqual([1, 2, 4])
  })
})

describe('rejecting with line flags', () => {
  it('flags only the ticked lines, composes the overall reason, and records who flagged', async () => {
    const { id, lines } = await fileClaim()
    const res = await reject(id, { lineFlags: [{ lineId: lines[1]!.id, reason: 'Price is wrong' }] })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('rejected')
    expect(res.body.data.rejection_reason).toBe('• Line 2 (Fuel): Price is wrong')

    const got = await getClaim(id)
    const byNumber = Object.fromEntries(got.body.lines.map((l: Line & { flagged_by_name: string }) => [l.line_number, l]))
    expect(byNumber[1].flag_reason).toBeNull()
    expect(byNumber[3].flag_reason).toBeNull()
    expect(byNumber[2].flag_reason).toBe('Price is wrong')
    expect(byNumber[2].flagged_by_name).toBeTruthy()
    expect(byNumber[2].flag_addressed_at).toBeNull()
  })

  it('keeps an overall reason above the flagged lines when both are given', async () => {
    const { id, lines } = await fileClaim()
    const res = await reject(id, { reason: 'Please recheck', lineFlags: [{ lineId: lines[0]!.id, reason: 'No receipt' }] })
    expect(res.status).toBe(200)
    expect(res.body.data.rejection_reason).toBe('Please recheck\n\n• Line 1 (Taxi): No receipt')
  })

  it('still rejects a whole claim with only an overall reason (the old behaviour)', async () => {
    const { id } = await fileClaim()
    const res = await reject(id, { reason: 'Wrong company' })
    expect(res.status).toBe(200)
    expect(res.body.data.rejection_reason).toBe('Wrong company')
    const got = await getClaim(id)
    expect(got.body.lines.every((l: Line) => l.flag_reason === null)).toBe(true)
  })

  it('refuses a rejection with neither a reason nor a flagged line', async () => {
    const { id } = await fileClaim()
    expect((await reject(id, {})).status).toBe(422)
    expect((await reject(id, { reason: '   ' })).status).toBe(422)
    expect((await reject(id, { lineFlags: [] })).status).toBe(422)
    expect((await getClaim(id)).body.status).toBe('submitted')
  })

  it('refuses a flag with no reason, and the same line twice', async () => {
    const { id, lines } = await fileClaim()
    expect((await reject(id, { lineFlags: [{ lineId: lines[0]!.id, reason: ' ' }] })).status).toBe(422)
    const twice = await reject(id, {
      lineFlags: [
        { lineId: lines[0]!.id, reason: 'a' },
        { lineId: lines[0]!.id, reason: 'b' },
      ],
    })
    expect(twice.status).toBe(422)
  })

  it("refuses another claim's line, and leaves both claims untouched", async () => {
    const a = await fileClaim()
    const b = await fileClaim()
    const res = await reject(a.id, { lineFlags: [{ lineId: b.lines[0]!.id, reason: 'not yours' }] })
    expect(res.status).toBe(422)
    expect((await getClaim(a.id)).body.status).toBe('submitted')
    const flagged = await pool.query(`SELECT 1 FROM expense_claim_lines WHERE claim_id=$1 AND flagged_at IS NOT NULL`, [b.id])
    expect(flagged.rowCount).toBe(0)
  })

  it("does not let another company's approver reject it", async () => {
    const { id, lines } = await fileClaim()
    const res = await reject(id, { lineFlags: [{ lineId: lines[0]!.id, reason: 'x' }] }, outsiderToken)
    expect(res.status).toBe(409)
    expect((await getClaim(id)).body.status).toBe('submitted')
    const flagged = await pool.query(`SELECT 1 FROM expense_claim_lines WHERE claim_id=$1 AND flagged_at IS NOT NULL`, [id])
    expect(flagged.rowCount).toBe(0)
  })

  it('writes an audit row for the rejection', async () => {
    const { id, lines } = await fileClaim()
    await reject(id, { lineFlags: [{ lineId: lines[0]!.id, reason: 'x' }] })
    const a = await pool.query(
      `SELECT new_values FROM audit_log WHERE table_name='expense_claims' AND record_id=$1 AND new_values->>'status'='rejected'`,
      [id],
    )
    expect(a.rowCount).toBeGreaterThan(0)
    expect(a.rows[0].new_values.lines_flagged).toBe(1)
  })
})

describe('editing a rejected claim', () => {
  it('lets the person who filed it (no finance permissions) edit it in place and resubmit', async () => {
    const { id, lines } = await fileClaim()
    await reject(id, { lineFlags: [{ lineId: lines[1]!.id, reason: 'Price is wrong' }] })

    const res = await revise(id, {
      resubmit: true,
      lines: same(lines).map((l) => (l['id'] === lines[1]!.id ? { ...l, amount: 15000 } : l)),
    })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('submitted')
    // Summed by the database: 10000 + 15000 + 5000.
    expect(res.body.data.total_amount).toBe('30000.00')
    // Same rows, same numbers: the edit did not recreate them.
    expect(res.body.data.lines.map((l: Line) => [l.id, l.line_number])).toEqual(lines.map((l) => [l.id, l.line_number]))
    // Resubmitting addressed the open flag but did not clear it.
    const fixed = res.body.data.lines.find((l: Line) => l.id === lines[1]!.id) as Line
    expect(fixed.flag_reason).toBe('Price is wrong')
    expect(fixed.flag_addressed_at).not.toBeNull()
    expect(fixed.flag_resolved_at).toBeNull()
    // The last rejection stays on the claim as history.
    expect(res.body.data.rejection_reason).toBe('• Line 2 (Fuel): Price is wrong')
  })

  it('a claim rejected after approval comes back clean: approval is cleared on resubmit', async () => {
    const { id, lines } = await fileClaim()
    await request(app).post(`/finance/expense-claims/${id}/approve`).set('Authorization', `Bearer ${adminToken}`)
    await reject(id, { reason: 'Wrong amount' })
    const res = await revise(id, { resubmit: true, lines: same(lines) })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('submitted')
    expect(res.body.data.approved_by).toBeNull()
    expect(res.body.data.approved_at).toBeNull()
  })

  it('saves without resubmitting when resubmit is false, leaving flags open', async () => {
    const { id, lines } = await fileClaim()
    await reject(id, { lineFlags: [{ lineId: lines[0]!.id, reason: 'x' }] })
    const res = await revise(id, { lines: same(lines), description: 'Updated note' })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('rejected')
    expect(res.body.data.description).toBe('Updated note')
    expect((res.body.data.lines as Line[])[0]!.flag_addressed_at).toBeNull()
  })

  it('keeps each unchanged line category and GL account without the category being sent again', async () => {
    const { id, lines } = await fileClaim()
    await reject(id, { reason: 'x' })
    const res = await revise(id, { lines: same(lines) })
    expect(res.status).toBe(200)
    for (const [i, l] of (res.body.data.lines as Line[]).entries()) {
      expect(l.category_id).toBe(lines[i]!.category_id)
      expect(l.gl_account_id).toBe(lines[i]!.gl_account_id)
    }
  })

  it('re-resolves the GL account when a line moves to another category, and refuses a foreign one', async () => {
    const { id, lines } = await fileClaim()
    await reject(id, { reason: 'x' })
    const moved = await revise(id, {
      lines: same(lines).map((l, i) => (i === 0 ? { ...l, category_id: otherCategoryId } : l)),
    })
    expect(moved.status).toBe(200)
    expect((moved.body.data.lines as Line[])[0]!.category_id).toBe(otherCategoryId)

    const foreign = await revise(id, {
      lines: same(lines).map((l, i) => (i === 0 ? { ...l, category_id: foreignCategoryId } : l)),
    })
    expect(foreign.status).toBe(422)
  })

  it('requires a category on a new line, and refuses a line id from another claim', async () => {
    const a = await fileClaim()
    const b = await fileClaim()
    await reject(a.id, { reason: 'x' })
    const noCategory = await revise(a.id, {
      lines: [...same(a.lines), { expense_date: '2026-03-06', description: 'New', amount: 1 }],
    })
    expect(noCategory.status).toBe(422)
    const foreignLine = await revise(a.id, { lines: [...same(a.lines), { ...same(b.lines)[0]! }] })
    expect(foreignLine.status).toBe(422)
    // Nothing changed.
    const n = await pool.query(`SELECT COUNT(*)::int AS n FROM expense_claim_lines WHERE claim_id=$1`, [a.id])
    expect(n.rows[0].n).toBe(3)
  })

  it('refuses the same line sent twice, and changes nothing', async () => {
    const { id, lines } = await fileClaim()
    await reject(id, { reason: 'x' })
    const res = await revise(id, { lines: [...same(lines), same(lines)[0]!] })
    expect(res.status).toBe(422)
    const n = await pool.query(`SELECT COUNT(*)::int AS n FROM expense_claim_lines WHERE claim_id=$1`, [id])
    expect(n.rows[0].n).toBe(3)
  })

  it('removes a line together with its receipt, and keeps the receipts of the lines that stay', async () => {
    const { id, lines } = await fileClaim()
    await reject(id, { reason: 'x' })
    const attach = async (lineId: string, key: string): Promise<string> => {
      const f = await pool.query<{ id: string }>(
        `INSERT INTO files (company_id, uploaded_by, file_key, original_filename, mime_type, size_bytes, category, status)
         VALUES ($1,$2,$3,'r.jpg','image/jpeg',10,'attachment','attached') RETURNING id`,
        [TEST_COMPANY_ID, ownerId, `revise-test-${key}`],
      )
      await pool.query(
        `INSERT INTO document_attachments (file_id, entity_type, entity_id, uploaded_by) VALUES ($1,'expense_claim_line',$2,$3)`,
        [f.rows[0]!.id, lineId, ownerId],
      )
      return f.rows[0]!.id
    }
    const keptFile = await attach(lines[0]!.id, 'kept')
    const goneFile = await attach(lines[2]!.id, 'gone')

    const res = await revise(id, { lines: same(lines.slice(0, 2)) })
    expect(res.status).toBe(200)
    expect(res.body.data.lines).toHaveLength(2)

    const kept = await pool.query(`SELECT 1 FROM document_attachments WHERE entity_type='expense_claim_line' AND entity_id=$1`, [lines[0]!.id])
    expect(kept.rowCount).toBe(1)
    const gone = await pool.query(`SELECT 1 FROM document_attachments WHERE entity_type='expense_claim_line' AND entity_id=$1`, [lines[2]!.id])
    expect(gone.rowCount).toBe(0)
    const status = await pool.query<{ id: string; status: string }>(`SELECT id, status FROM files WHERE id = ANY($1)`, [[keptFile, goneFile]])
    const byId = Object.fromEntries(status.rows.map((r) => [r.id, r.status]))
    expect(byId[keptFile]).toBe('attached')
    expect(byId[goneFile]).toBe('uploaded')
  })

  it('clears the reimbursement account when the currency changes, so Post Payment resolves it again', async () => {
    const { id, lines } = await fileClaim()
    await pool.query(`UPDATE expense_claims SET reimbursement_account_id=$2 WHERE id=$1`, [id, cashAccountId])
    await reject(id, { reason: 'x' })
    const same_ = await revise(id, { lines: same(lines) })
    expect(same_.body.data.reimbursement_account_id).toBe(cashAccountId)
    const changed = await revise(id, { currency_code: 'USD', lines: same(lines) })
    expect(changed.status).toBe(200)
    expect(changed.body.data.currency_code).toBe('USD')
    expect(changed.body.data.reimbursement_account_id).toBeNull()
    expect((changed.body.data.lines as { currency_code: string }[]).every((l) => l.currency_code === 'USD')).toBe(true)
  })

  it('also works on a draft that Finance sent back from audit', async () => {
    const { id, lines } = await fileClaim()
    await request(app).post(`/finance/expense-claims/${id}/approve`).set('Authorization', `Bearer ${adminToken}`)
    const fail = await request(app)
      .post(`/finance/expense-claims/${id}/fail-audit`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Wrong category' })
    expect(fail.body.data.status).toBe('draft')
    const res = await revise(id, { resubmit: true, lines: same(lines) })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('submitted')
  })
})

describe('who may edit', () => {
  it('refuses a colleague who did not file the claim', async () => {
    const { id, lines } = await fileClaim()
    await reject(id, { reason: 'x' })
    const res = await revise(id, { lines: same(lines) }, strangerToken)
    expect(res.status).toBe(403)
  })

  it('does not extend a rejected claim to holders of finance.expenses.edit who are not the owner', async () => {
    const { id, lines } = await fileClaim()
    await reject(id, { reason: 'x' })
    expect((await revise(id, { lines: same(lines) }, editorToken)).status).toBe(403)
  })

  it('keeps today’s rule for a draft: a finance.expenses.edit holder may still edit it', async () => {
    const { id, lines } = await fileClaim()
    await request(app).post(`/finance/expense-claims/${id}/approve`).set('Authorization', `Bearer ${adminToken}`)
    await request(app)
      .post(`/finance/expense-claims/${id}/fail-audit`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Wrong category' })
    expect((await revise(id, { lines: same(lines) }, editorToken)).status).toBe(200)
    expect((await revise(id, { lines: same(lines) }, strangerToken)).status).toBe(403)
  })

  it('lets an admin edit a rejected claim', async () => {
    const { id, lines } = await fileClaim()
    await reject(id, { reason: 'x' })
    expect((await revise(id, { lines: same(lines) }, adminToken)).status).toBe(200)
  })

  it("never reaches another company's claim", async () => {
    const { id, lines } = await fileClaim()
    await reject(id, { reason: 'x' })
    expect((await revise(id, { lines: same(lines) }, outsiderToken)).status).toBe(404)
  })

  it('only drafts and rejected claims can be edited', async () => {
    const { id, lines } = await fileClaim()
    expect((await revise(id, { lines: same(lines) })).status).toBe(409)
    await request(app).post(`/finance/expense-claims/${id}/approve`).set('Authorization', `Bearer ${adminToken}`)
    expect((await revise(id, { lines: same(lines) }, adminToken)).status).toBe(409)
  })

  it('exposes can_revise on the claim read and on /mine, from the same rule', async () => {
    const { id } = await fileClaim()
    expect((await getClaim(id)).body.can_revise).toBe(false) // submitted
    await reject(id, { reason: 'x' })
    expect((await getClaim(id)).body.can_revise).toBe(true) // admin, rejected

    const mine = await request(app).get('/finance/expense-claims/mine').set('Authorization', `Bearer ${ownerToken}`)
    expect(mine.status).toBe(200)
    const row = (mine.body.data as Record<string, any>[]).find((c) => c.id === id)!
    expect(row.can_revise).toBe(true)
    expect(row.rejection_reason).toBe('x')
    expect(row.lines.map((l: Line) => l.line_number)).toEqual([1, 2, 3])
    expect(row.lines[0]).toHaveProperty('flag_reason')
    expect(row.lines[0]).toHaveProperty('category_id')
  })
})

describe('confirming a fixed line', () => {
  it('lets an approver resolve a flag only after it was addressed by a resubmit', async () => {
    const { id, lines } = await fileClaim()
    await reject(id, { lineFlags: [{ lineId: lines[0]!.id, reason: 'No receipt' }] })
    const resolve = (token = adminToken) =>
      request(app)
        .post(`/finance/expense-claims/${id}/lines/${lines[0]!.id}/resolve-flag`)
        .set('Authorization', `Bearer ${token}`)

    // Still waiting for the employee: nothing to confirm yet.
    expect((await resolve()).status).toBe(409)

    await revise(id, { resubmit: true, lines: same(lines) })
    // Another company's approver cannot.
    expect((await resolve(outsiderToken)).status).toBe(409)
    // A plain user without the approve permission cannot.
    expect((await resolve(ownerToken)).status).toBe(403)

    const ok = await resolve()
    expect(ok.status).toBe(200)
    expect(ok.body.data.flag_resolved_at).not.toBeNull()
    // Once only.
    expect((await resolve()).status).toBe(409)
  })

  it('a new rejection of a line starts the flag cycle again', async () => {
    const { id, lines } = await fileClaim()
    await reject(id, { lineFlags: [{ lineId: lines[0]!.id, reason: 'first' }] })
    await revise(id, { resubmit: true, lines: same(lines) })
    await reject(id, { lineFlags: [{ lineId: lines[0]!.id, reason: 'second' }] })
    const got = await getClaim(id)
    const l = got.body.lines[0] as Line
    expect(l.flag_reason).toBe('second')
    expect(l.flag_addressed_at).toBeNull()
    expect(l.flag_resolved_at).toBeNull()
  })
})
