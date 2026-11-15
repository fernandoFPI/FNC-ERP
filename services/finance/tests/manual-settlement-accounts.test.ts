// The manual "New Settlement" path and the GL accounts it may post to (playbook #91).
//
// The PO-line settlement was fixed first (po-line-accounting-advance.test.ts). The manual path had the same hole on its own
// routes: the form's dropdown listed the whole chart, `POST /settlements` stored whatever gl_account_id / cost_center_id it was
// sent (another company's too), and `POST /settlements/:id/approve` posted to it and died in the database trigger
// (fn_enforce_postable_account, migration 237) as a bare 500. Now create refuses a header, inactive or foreign account and an
// inactive or foreign cost center, naming the line; approve refuses before posting, naming the line. Real Postgres through the
// real routes (supertest), in the finance fixture company.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { pool } from '@fnc-erp/db'
import { TEST_COMPANY_ID, createTestUser, getAccountId } from './setup.js'
import { manualLinesRefusal, postedLinesRefusal, advanceAccountRefusal } from '../src/lib/settlementLineAccounts.js'

const app = createApp()
const OTHER_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const PREFIX = 'F-MANSET-'

let token = ''
let advOk = ''
let advHdr = '' // its own account is a header account
let goodAccount = ''
let goodAccount2 = ''
let headerAccount = ''
let nonPostableAccount = ''
let inactiveAccount = ''
let foreignAccount = ''
let goodCc = ''
let inactiveCc = ''
let foreignCc = ''
let employeeId = ''
let seq = 0

const auth = () => ({ Authorization: `Bearer ${token}` })

async function account(code: string, name: string, o: { header?: boolean; postable?: boolean; active?: boolean; company?: string } = {}) {
  const header = o.header ?? false
  return (
    await pool.query<{ id: string }>(
      `INSERT INTO chart_of_accounts (company_id, code, name, account_type, is_header, is_postable, is_active)
       VALUES ($1,$2,$3,'expense',$4,$5,$6) RETURNING id`,
      [o.company ?? TEST_COMPANY_ID, code, `${PREFIX}${name}`, header, header ? false : (o.postable ?? true), o.active ?? true],
    )
  ).rows[0]!.id
}
async function costCenter(code: string, o: { active?: boolean; company?: string } = {}) {
  return (
    await pool.query<{ id: string }>(
      `INSERT INTO cost_centers (company_id, code, name, type, is_active) VALUES ($1,$2,$3,'overhead',$4) RETURNING id`,
      [o.company ?? TEST_COMPANY_ID, `${PREFIX}${code}`, `Manual settlement cc ${code}`, o.active ?? true],
    )
  ).rows[0]!.id
}

async function cleanup(): Promise<void> {
  const settlements = (
    await pool.query<{ id: string; journal_entry_id: string | null }>(
      `SELECT s.id, s.journal_entry_id FROM advance_settlements s JOIN employee_advances a ON a.id = s.advance_id WHERE a.advance_number LIKE $1`,
      [`${PREFIX}%`],
    )
  ).rows
  const sids = settlements.map((s) => s.id)
  const journalIds = settlements.map((s) => s.journal_entry_id).filter((x): x is string => !!x)
  await pool.query(`DELETE FROM advance_settlement_lines WHERE settlement_id = ANY($1::uuid[])`, [sids])
  await pool.query(`DELETE FROM advance_settlements WHERE id = ANY($1::uuid[])`, [sids])
  if (journalIds.length) {
    await pool.query(`DELETE FROM journal_lines WHERE journal_entry_id = ANY($1::uuid[])`, [journalIds])
    await pool.query(`DELETE FROM journal_entries WHERE id = ANY($1::uuid[])`, [journalIds])
  }
  await pool.query(`DELETE FROM employee_advances WHERE advance_number LIKE $1`, [`${PREFIX}%`])
  await pool.query(`DELETE FROM cost_centers WHERE code LIKE $1`, [`${PREFIX}%`])
  await pool.query(`DELETE FROM chart_of_accounts WHERE name LIKE $1`, [`${PREFIX}%`])
  await pool.query(`DELETE FROM employees WHERE employee_number LIKE $1`, [`${PREFIX}%`])
}

beforeAll(async () => {
  await cleanup()
  token = (await createTestUser()).token
  const cashId = await getAccountId('1100')
  const advanceAssetId = await getAccountId('1200')
  goodAccount = await account('9821', 'good account')
  goodAccount2 = await account('9824', 'second good account')
  headerAccount = await account('9820', 'Assets-like header', { header: true })
  nonPostableAccount = await account('9825', 'non-postable detail', { postable: false })
  inactiveAccount = await account('9822', 'inactive account', { active: false })
  foreignAccount = await account('9823', 'foreign account', { company: OTHER_COMPANY_ID })
  goodCc = await costCenter('CC1')
  inactiveCc = await costCenter('CCI', { active: false })
  foreignCc = await costCenter('CCF', { company: OTHER_COMPANY_ID })
  employeeId = (
    await pool.query<{ id: string }>(
      `INSERT INTO employees (company_id, first_name, last_name, hire_date, employee_number, status) VALUES ($1,'Man','Settle',CURRENT_DATE,$2,'active') RETURNING id`,
      [TEST_COMPANY_ID, `${PREFIX}${Date.now()}`],
    )
  ).rows[0]!.id
  const mkAdvance = async (tag: string, advanceAccount: string) =>
    (
      await pool.query<{ id: string }>(
        `INSERT INTO employee_advances (company_id, advance_number, employee_id, employee_name, currency_code, amount, cash_account_id, advance_account_id, status)
         VALUES ($1,$2,$3,'Man Settle','IQD',10000000,$4,$5,'approved') RETURNING id`,
        [TEST_COMPANY_ID, `${PREFIX}${tag}-${Date.now()}`, employeeId, cashId, advanceAccount],
      )
    ).rows[0]!.id
  advOk = await mkAdvance('OK', advanceAssetId)
  advHdr = await mkAdvance('HDR', headerAccount)
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM sessions WHERE refresh_token_hash = 'test-refresh-hash-finance'`)
  await pool.query(`DELETE FROM users WHERE email = 'finance-test@fnc-erp.local'`)
  await pool.end()
})

interface LineSpec {
  account?: string
  cc?: string
  description?: string
  amount?: number
}
const lineBody = (l: LineSpec) => ({
  line_date: '2026-11-15',
  gl_account_id: l.account ?? goodAccount,
  cost_center_id: l.cc ?? goodCc,
  description: l.description ?? 'Diesel',
  amount: l.amount ?? 1000,
})
const create = (lines: LineSpec[], advance = advOk) =>
  request(app).post('/finance/advances/settlements').set(auth()).send({ advance_id: advance, lines: lines.map(lineBody) })
const submit = (id: string) => request(app).post(`/finance/advances/settlements/${id}/submit`).set(auth()).send({})
const approve = (id: string) => request(app).post(`/finance/advances/settlements/${id}/approve`).set(auth()).send({})
const settlementsOf = async (advance: string) => (await pool.query(`SELECT 1 FROM advance_settlements WHERE advance_id = $1`, [advance])).rowCount

// A settlement made the way old data was: a submitted draft whose lines hold whatever account they held.
async function submittedDraft(lines: { account: string; cc?: string; description?: string; amount?: number }[], advance = advOk): Promise<string> {
  seq += 1
  const total = lines.reduce((s, l) => s + (l.amount ?? 1000), 0)
  const s = await pool.query<{ id: string }>(
    `INSERT INTO advance_settlements (company_id, settlement_number, advance_id, employee_id, employee_name, currency_code, total_amount, status)
     VALUES ($1,$2,$3,$4,'Man Settle','IQD',$5,'submitted') RETURNING id`,
    [TEST_COMPANY_ID, `${PREFIX}SET-${seq}`, advance, employeeId, total],
  )
  for (const l of lines) {
    await pool.query(
      `INSERT INTO advance_settlement_lines (settlement_id, company_id, line_date, gl_account_id, cost_center_id, description, amount, currency_code, fx_rate)
       VALUES ($1,$2,'2026-11-15',$3,$4,$5,$6,'IQD',1)`,
      [s.rows[0]!.id, TEST_COMPANY_ID, l.account, l.cc ?? goodCc, l.description ?? 'Diesel', l.amount ?? 1000],
    )
  }
  return s.rows[0]!.id
}
const statusOf = async (id: string) => (await pool.query<{ status: string }>(`SELECT status FROM advance_settlements WHERE id=$1`, [id])).rows[0]!.status
const journalsOf = async (id: string) => (await pool.query(`SELECT 1 FROM journal_entries WHERE source_type='advance_settlement' AND source_id=$1`, [id])).rowCount

describe('the rules, on their own', () => {
  const run = (rows: Record<string, unknown>[]) => () => Promise.resolve({ rows })
  it('a postable account passes the posting check, a header account and another company’s do not', async () => {
    const ok = [{ gl_account_id: 'a1', cost_center_id: 'c', description: 'x' }]
    expect(await postedLinesRefusal(run([{ id: 'a1', code: '3211', name: 'M', is_postable: true, is_active: true }]), 'co', ok)).toBeNull()
    expect((await postedLinesRefusal(run([{ id: 'a1', code: '1000', name: 'Assets', is_postable: false, is_active: true }]), 'co', ok))?.message).toMatch(
      /^1 line cannot be posted: Line 1 \(x\): GL account 1000 · Assets is a header account and cannot be posted to\./,
    )
    expect((await postedLinesRefusal(run([]), 'co', ok))?.message).toMatch(/not one of this company's accounts/)
  })

  it('the posting check does not judge an inactive account (old drafts stay postable), the choice check does', async () => {
    const ok = [{ gl_account_id: 'a1', cost_center_id: 'c', description: 'x' }]
    const inactive = { id: 'a1', code: '3211', name: 'M', is_postable: true, is_active: false }
    expect(await postedLinesRefusal(run([inactive]), 'co', ok)).toBeNull()
    const choice = await manualLinesRefusal(
      (sql) => Promise.resolve({ rows: sql.includes('chart_of_accounts') ? [inactive] : [{ id: 'c', code: 'CC', name: 'cc', is_active: true }] }),
      'co',
      ok,
    )
    expect(choice?.code).toBe('ACCOUNT_INACTIVE')
  })

  it('names five lines then counts the rest, with the status of the first', async () => {
    const lines = Array.from({ length: 8 }, (_, i) => ({ gl_account_id: 'bad', cost_center_id: 'c', description: `item ${i + 1}` }))
    const r = await manualLinesRefusal(
      (sql) => Promise.resolve({ rows: sql.includes('chart_of_accounts') ? [{ id: 'bad', code: '1000', name: 'Assets', is_postable: false, is_active: true }] : [{ id: 'c', code: 'CC', name: 'cc', is_active: true }] }),
      'co',
      lines,
    )
    expect(r?.status).toBe(422)
    expect(r?.message).toMatch(/^8 lines cannot be used: Line 1 \(item 1\)/)
    expect(r?.message).toMatch(/Line 5 \(item 5\)/)
    expect(r?.message).not.toMatch(/Line 6 /)
    expect(r?.message).toMatch(/; and 3 more$/)
  })

  it('the advance’s own account: a header account is refused, a missing one too, a postable one passes', () => {
    expect(advanceAccountRefusal({ code: '1200', name: 'Employee advances', is_postable: true })).toBeNull()
    expect(advanceAccountRefusal({ code: '1000', name: 'Assets', is_postable: false })?.message).toMatch(/1000 · Assets is a header account/)
    expect(advanceAccountRefusal(undefined)?.message).toMatch(/not one of this company's accounts/)
  })
})

describe('creating a manual settlement', () => {
  it('a postable account and an active cost center are saved, as before', async () => {
    const res = await create([{ account: goodAccount2, description: 'Tea', amount: 2500 }])
    expect(res.status).toBe(201)
    expect(res.body.data.lines).toHaveLength(1)
    expect(res.body.data.lines[0].gl_account_id).toBe(goodAccount2)
    expect(await statusOf(res.body.data.id)).toBe('draft')
  })

  it('a header account is refused with 422, naming the line, and nothing is written', async () => {
    const before = await settlementsOf(advOk)
    const res = await create([{ account: headerAccount, description: 'Diesel' }])
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('ACCOUNT_NOT_POSTABLE')
    expect(res.body.error.message).toMatch(/^Line 1 \(Diesel\): 9820 · .*Assets-like header is a header account and cannot be posted to/)
    expect(await settlementsOf(advOk)).toBe(before)
  })

  it('a non-postable account that is not a header is refused the same way', async () => {
    const res = await create([{ account: nonPostableAccount }])
    expect([res.status, res.body.error.code]).toEqual([422, 'ACCOUNT_NOT_POSTABLE'])
  })

  it('an inactive account (400), another company’s account (400)', async () => {
    const inactive = await create([{ account: inactiveAccount }])
    expect([inactive.status, inactive.body.error.code]).toEqual([400, 'ACCOUNT_INACTIVE'])
    const foreign = await create([{ account: foreignAccount }])
    expect([foreign.status, foreign.body.error.code]).toEqual([400, 'INVALID_ACCOUNT'])
  })

  it('an inactive cost center (400), another company’s cost center (400)', async () => {
    const inactive = await create([{ cc: inactiveCc }])
    expect([inactive.status, inactive.body.error.code]).toEqual([400, 'COST_CENTER_INACTIVE'])
    const foreign = await create([{ cc: foreignCc }])
    expect([foreign.status, foreign.body.error.code]).toEqual([400, 'INVALID_COST_CENTER'])
  })

  it('names every bad line of one settlement, leaves the good one out of the message, and writes none of them', async () => {
    const before = await settlementsOf(advOk)
    const res = await create([
      { description: 'fine' },
      { account: headerAccount, description: 'second' },
      { cc: foreignCc, description: 'third' },
    ])
    expect(res.status).toBe(422) // the first problem decides the status
    expect(res.body.error.message).toMatch(/^2 lines cannot be used: Line 2 \(second\): .*; Line 3 \(third\): Cost center not found in this company/)
    expect(res.body.error.message).not.toMatch(/Line 1 /)
    expect(await settlementsOf(advOk)).toBe(before)
  })

  it('more than five bad lines: five named, the rest counted', async () => {
    const res = await create(Array.from({ length: 7 }, (_, i) => ({ account: headerAccount, description: `row ${i + 1}` })))
    expect(res.status).toBe(422)
    expect(res.body.error.message).toMatch(/^7 lines cannot be used:/)
    expect(res.body.error.message).toMatch(/; and 2 more$/)
  })
})

describe('approving a manual settlement', () => {
  it('a valid one goes create, submit, approve, and posts to the chosen account', async () => {
    const created = await create([{ account: goodAccount, amount: 4000 }])
    expect(created.status).toBe(201)
    expect((await submit(created.body.data.id)).status).toBe(200)
    const res = await approve(created.body.data.id)
    expect(res.status).toBe(200)
    expect(await statusOf(created.body.data.id)).toBe('approved')
    const debit = await pool.query<{ account_id: string }>(
      `SELECT jl.account_id FROM journal_lines jl JOIN advance_settlements s ON s.journal_entry_id = jl.journal_entry_id WHERE s.id=$1 AND jl.debit > 0`,
      [created.body.data.id],
    )
    expect(debit.rows.map((r) => r.account_id)).toEqual([goodAccount])
  })

  it('a submitted draft that already holds a header account is refused with 422 and the line named, and nothing is posted', async () => {
    const id = await submittedDraft([{ account: headerAccount, description: 'Old diesel' }])
    const res = await approve(id)
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('LINES_NEED_ACCOUNTING')
    expect(res.body.error.message).toMatch(/^1 line cannot be posted: Line 1 \(Old diesel\): GL account 9820 · .*header account and cannot be posted to/)
    expect(res.body.error.message).toMatch(/Reject this settlement and create it again/)
    expect(await statusOf(id)).toBe('submitted')
    expect(await journalsOf(id)).toBe(0)
  })

  it('names every bad line of the draft, good lines included in the refusal', async () => {
    const id = await submittedDraft([
      { account: goodAccount, description: 'fine' },
      { account: headerAccount, description: 'bad one' },
      { account: foreignAccount, description: 'bad two' },
    ])
    const res = await approve(id)
    expect(res.status).toBe(422)
    expect(res.body.error.message).toMatch(/^2 lines cannot be posted: Line 2 \(bad one\): .*header account.*; Line 3 \(bad two\): its GL account is not one of this company's accounts/)
    expect(await statusOf(id)).toBe('submitted')
    expect(await journalsOf(id)).toBe(0)
  })

  it('an account that was deactivated after the draft was made still posts (the database accepts it)', async () => {
    const id = await submittedDraft([{ account: inactiveAccount, description: 'Legacy' }])
    const res = await approve(id)
    expect(res.status).toBe(200)
    expect(await statusOf(id)).toBe('approved')
  })

  it('refuses when the advance’s own account is a header account, naming it', async () => {
    const id = await submittedDraft([{ account: goodAccount }], advHdr)
    const res = await approve(id)
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('ADVANCE_ACCOUNT_NOT_POSTABLE')
    expect(res.body.error.message).toMatch(/9820 · .*header account/)
    expect(await statusOf(id)).toBe('submitted')
    expect(await journalsOf(id)).toBe(0)
  })

  it('the advance balance does not move when an approval is refused', async () => {
    const before = await pool.query<{ settled_amount: string }>(`SELECT settled_amount FROM employee_advances WHERE id=$1`, [advHdr])
    const id = await submittedDraft([{ account: headerAccount }], advHdr)
    expect((await approve(id)).status).toBe(422)
    const after = await pool.query<{ settled_amount: string }>(`SELECT settled_amount FROM employee_advances WHERE id=$1`, [advHdr])
    expect(after.rows[0]!.settled_amount).toBe(before.rows[0]!.settled_amount)
  })
})
