// An advance request now follows the expense claim flow: the employee asks, a manager APPROVES (one step, nothing is
// paid), then the cashbox handler ISSUES the cash, choosing which cashbox it comes out of; a rejected request can be
// corrected and sent again by whoever filed it (migration 322).
//
// Before this, approving an advance also issued it in one click against the advance's default cash account, so nobody
// chose a cashbox and the manager and the cashier were the same step.
// Real Postgres through the real routes (supertest). The people are plain `user` roles holding only the one permission
// their step needs, which is how the business uses them (the manager has finance.advances.approve and nothing on the
// cashbox; the cashier has finance.petty_cash.edit and nothing on advances).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createHash } from 'crypto'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { pool } from '@fnc-erp/db'
import { hashPassword, signAccessToken } from '@fnc-erp/auth'
import { TEST_COMPANY_ID, createTestUser, cleanFinanceData, getAccountId } from './setup.js'

const app = createApp()
const OTHER_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const REFRESH_HASH = 'test-refresh-hash-finance-advissue'
const PREFIX = 'ADVISSUE-'
const EMAIL = (tag: string) => `adv-issue-${tag}@fnc-erp.local`

let adminToken = ''
let ownerToken = ''
let strangerToken = ''
let managerToken = ''
let cashierToken = ''
let outsiderToken = ''
let cashAccountId = ''
let boxA = '' // IQD, 5,000,000
let boxB = '' // IQD, 5,000,000, its own GL account
let boxBGl = ''
let boxUsd = '' // USD
let boxInactive = ''
let boxNoGl = ''
let boxSmall = '' // IQD, 1,000
let foreignBox = ''
let projectId = ''
let foreignProjectId = ''
let ccActive = ''
let ccInactive = ''
let ccForeign = ''

async function makeUser(email: string, companyId: string, role: string): Promise<{ userId: string; token: string }> {
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

async function grant(userId: string, key: string, level: string): Promise<void> {
  await pool.query(
    `INSERT INTO user_permissions (user_id, company_id, permission_key, access_level) VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, company_id, permission_key) DO UPDATE SET access_level = EXCLUDED.access_level`,
    [userId, TEST_COMPANY_ID, key, level],
  )
}

async function cleanFixtures(): Promise<void> {
  // advances (and the journals / box rows pointing at them) before the boxes and before cleanFinanceData removes journals
  await pool.query(`UPDATE employee_advances SET petty_cash_float_id = NULL, journal_entry_id = NULL WHERE company_id = $1`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM petty_cash_transactions WHERE company_id = $1`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM employee_advances WHERE company_id = $1`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM journal_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE company_id = $1 AND source_type IN ('employee_advance_issuance','cancellation'))`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM journal_entries WHERE company_id = $1 AND source_type IN ('employee_advance_issuance','cancellation')`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM petty_cash_floats WHERE name LIKE $1`, [`${PREFIX}%`])
  await pool.query(`DELETE FROM cost_centers WHERE code LIKE $1`, [`${PREFIX}CC%`])
  await pool.query(`DELETE FROM projects WHERE code LIKE $1`, [`${PREFIX}%`])
  await pool.query(`DELETE FROM employees WHERE employee_number LIKE $1`, [`${PREFIX}%`])
  await pool.query(`DELETE FROM user_permissions WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'adv-issue-%')`)
  await pool.query(`DELETE FROM users WHERE email LIKE 'adv-issue-%'`)
  await pool.query(`DELETE FROM sessions WHERE refresh_token_hash LIKE $1`, [`${REFRESH_HASH}%`])
}

const mkBox = async (
  companyId: string,
  name: string,
  opts: { currency?: string; balance?: number; active?: boolean; gl?: string | null } = {},
): Promise<string> =>
  (
    await pool.query<{ id: string }>(
      `INSERT INTO petty_cash_floats (company_id, name, currency_code, authorized_limit, current_balance, gl_account_id, is_active)
       VALUES ($1,$2,$3,10000000,$4,$5,$6) RETURNING id`,
      [
        companyId,
        `${PREFIX}${name}`,
        opts.currency ?? 'IQD',
        opts.balance ?? 5_000_000,
        opts.gl === undefined ? cashAccountId : opts.gl,
        opts.active ?? true,
      ],
    )
  ).rows[0]!.id

beforeAll(async () => {
  adminToken = (await createTestUser()).token
  await cleanFixtures()

  const owner = await makeUser(EMAIL('owner'), TEST_COMPANY_ID, 'user')
  ownerToken = owner.token
  strangerToken = (await makeUser(EMAIL('stranger'), TEST_COMPANY_ID, 'user')).token
  const manager = await makeUser(EMAIL('manager'), TEST_COMPANY_ID, 'user')
  managerToken = manager.token
  await grant(manager.userId, 'finance.advances.approve', 'approve')
  await grant(manager.userId, 'finance.advances.view', 'view') // granted up front: permissions are cached per user after the first call
  const cashier = await makeUser(EMAIL('cashier'), TEST_COMPANY_ID, 'user')
  cashierToken = cashier.token
  await grant(cashier.userId, 'finance.petty_cash.edit', 'edit')
  outsiderToken = (await makeUser(EMAIL('outsider'), OTHER_COMPANY_ID, 'company_admin')).token

  cashAccountId = await getAccountId('1100')
  // A request needs the company's default cash account for its currency and the employee's own advance account
  // (what Settings > Advance Automation configures); both are set up here so the request itself is not what is tested.
  await pool.query(
    `INSERT INTO company_default_cash_accounts (company_id, currency_code, account_id) VALUES ($1,'IQD',$2)
     ON CONFLICT (company_id, currency_code) DO UPDATE SET account_id = EXCLUDED.account_id`,
    [TEST_COMPANY_ID, cashAccountId],
  )
  // the employee record the owner files through
  await pool.query(
    `INSERT INTO employees (company_id, user_id, first_name, last_name, hire_date, employee_number, status, advance_control_account_id)
     VALUES ($1,$2,'Adv','Owner',CURRENT_DATE,$3,'active',$4)`,
    [TEST_COMPANY_ID, owner.userId, `${PREFIX}EMP`, await getAccountId('1200')],
  )

  boxA = await mkBox(TEST_COMPANY_ID, 'Box A')
  // Box B has its own GL account, different from the company's default cash account the request resolved, so a test can
  // tell "credited the box the handler chose" from "credited the default cash account".
  boxBGl = await getAccountId('5100')
  boxB = await mkBox(TEST_COMPANY_ID, 'Box B', { gl: boxBGl })
  boxUsd = await mkBox(TEST_COMPANY_ID, 'Box USD', { currency: 'USD' })
  boxInactive = await mkBox(TEST_COMPANY_ID, 'Box inactive', { active: false })
  boxNoGl = await mkBox(TEST_COMPANY_ID, 'Box no GL', { gl: null })
  boxSmall = await mkBox(TEST_COMPANY_ID, 'Box small', { balance: 1000 })
  // another company's box that would otherwise be perfectly usable (active, same currency, funded, has a GL account), so
  // the only thing that can stop it is the company scope
  foreignBox = await mkBox(OTHER_COMPANY_ID, 'Foreign box')
  projectId = (
    await pool.query<{ id: string }>(
      `INSERT INTO projects (company_id, code, name, status, budget_currency, created_by)
       VALUES ($1,$2,'Advance project','approved','IQD',$3) RETURNING id`,
      [TEST_COMPANY_ID, `${PREFIX}PRJ`, owner.userId],
    )
  ).rows[0]!.id
  foreignProjectId = (
    await pool.query<{ id: string }>(
      `INSERT INTO projects (company_id, code, name, status, budget_currency, created_by)
       VALUES ($1,$2,'Foreign project','approved','IQD',$3) RETURNING id`,
      [OTHER_COMPANY_ID, `${PREFIX}FPRJ`, owner.userId],
    )
  ).rows[0]!.id
})

beforeAll(async () => {
  const mk = async (companyId: string, code: string, active: boolean): Promise<string> =>
    (
      await pool.query<{ id: string }>(
        `INSERT INTO cost_centers (company_id, code, name, type, is_active) VALUES ($1,$2,$3,'overhead',$4) RETURNING id`,
        [companyId, code, `Cost center ${code}`, active],
      )
    ).rows[0]!.id
  ccActive = await mk(TEST_COMPANY_ID, `${PREFIX}CC1`, true)
  ccInactive = await mk(TEST_COMPANY_ID, `${PREFIX}CC2`, false)
  ccForeign = await mk(OTHER_COMPANY_ID, `${PREFIX}CCF`, true)
})

afterAll(async () => {
  await cleanFixtures()
  await pool.query(`DELETE FROM company_default_cash_accounts WHERE company_id = $1`, [TEST_COMPANY_ID])
  await cleanFinanceData()
  await pool.end()
})

beforeEach(async () => {
  await pool.query(`UPDATE employee_advances SET petty_cash_float_id = NULL, journal_entry_id = NULL WHERE company_id = $1`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM petty_cash_transactions WHERE company_id = $1`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM employee_advances WHERE company_id = $1`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM journal_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE company_id = $1 AND source_type IN ('employee_advance_issuance','cancellation'))`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM journal_entries WHERE company_id = $1 AND source_type IN ('employee_advance_issuance','cancellation')`, [TEST_COMPANY_ID])
  await pool.query(`UPDATE petty_cash_floats SET current_balance = 5000000 WHERE id = ANY($1::uuid[])`, [[boxA, boxB, boxUsd]])
  await pool.query(`UPDATE petty_cash_floats SET current_balance = 1000 WHERE id = $1`, [boxSmall])
})

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` })

async function fileRequest(
  body: Record<string, unknown> = { amount: 200000, currency_code: 'IQD', purpose: 'Site fuel' },
  token = ownerToken,
) {
  const res = await request(app).post('/finance/advances/request-self').set(bearer(token)).send(body)
  expect(res.status).toBe(201)
  return res.body.data as { id: string; status: string }
}

const approve = (id: string, token = managerToken, body: Record<string, unknown> = {}) =>
  request(app).post(`/finance/advances/${id}/approve`).set(bearer(token)).send(body)
const issue = (id: string, boxId: string, token = cashierToken) =>
  request(app).post(`/finance/advances/${id}/issue`).set(bearer(token)).send({ petty_cash_float_id: boxId })
const reject = (id: string, token = managerToken) =>
  request(app).post(`/finance/advances/${id}/reject`).set(bearer(token)).send({ reason: 'Amount is too high' })
const revise = (id: string, body: Record<string, unknown>, token = ownerToken) =>
  request(app).post(`/finance/advances/${id}/revise`).set(bearer(token)).send(body)

async function row(id: string) {
  return (await pool.query(`SELECT * FROM employee_advances WHERE id = $1`, [id])).rows[0]!
}
async function balance(boxId: string): Promise<number> {
  return Number((await pool.query(`SELECT current_balance FROM petty_cash_floats WHERE id = $1`, [boxId])).rows[0]!.current_balance)
}

describe('the request', () => {
  it('lands waiting for the manager and carries the project', async () => {
    const adv = await fileRequest({ amount: 200000, currency_code: 'IQD', purpose: 'Site fuel', project_id: projectId })
    expect(adv.status).toBe('pending_approval')
    expect((await row(adv.id)).project_id).toBe(projectId)
  })

  it("refuses another company's project", async () => {
    const res = await request(app)
      .post('/finance/advances/request-self')
      .set(bearer(ownerToken))
      .send({ amount: 1000, currency_code: 'IQD', project_id: foreignProjectId })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_PROJECT')
    expect((await pool.query(`SELECT 1 FROM employee_advances WHERE project_id = $1`, [foreignProjectId])).rowCount).toBe(0)
  })

  it('shows the owner their own requests with the project and the rejection, and nobody else', async () => {
    const adv = await fileRequest({ amount: 5000, currency_code: 'IQD', purpose: 'Taxi', project_id: projectId })
    await reject(adv.id)
    const mine = await request(app).get('/finance/advances/mine').set(bearer(ownerToken))
    const found = mine.body.data.find((a: { id: string }) => a.id === adv.id)
    expect(found.project_code).toBe(`${PREFIX}PRJ`)
    expect(found.rejection_reason).toBe('Amount is too high')
    expect(found.can_revise).toBe(true)
    const strangers = await request(app).get('/finance/advances/mine').set(bearer(strangerToken))
    expect(strangers.body.data).toEqual([]) // no employee record: nothing of the owner's is shown
  })
})

describe('approve is the manager step and pays nothing', () => {
  it('moves to pending_issue, records who approved, makes no journal and moves no cash', async () => {
    const adv = await fileRequest()
    const res = await approve(adv.id)
    expect(res.status).toBe(200)
    const r = await row(adv.id)
    expect(r.status).toBe('pending_issue')
    expect(r.approved_by).not.toBeNull()
    expect(r.journal_entry_id).toBeNull()
    expect(r.issued_at).toBeNull()
    expect(r.petty_cash_float_id).toBeNull()
    expect(await balance(boxA)).toBe(5_000_000)
    expect((await pool.query(`SELECT 1 FROM petty_cash_transactions WHERE company_id = $1`, [TEST_COMPANY_ID])).rowCount).toBe(0)
  })

  it('is refused for someone without the approve permission, and for a request that is not pending', async () => {
    const adv = await fileRequest()
    expect((await approve(adv.id, ownerToken)).status).toBe(403)
    expect((await approve(adv.id, cashierToken)).status).toBe(403) // the cashier cannot approve
    expect((await row(adv.id)).status).toBe('pending_approval')
    expect((await approve(adv.id)).status).toBe(200)
    const again = await approve(adv.id)
    expect(again.status).toBe(409)
    expect(again.body.error.code).toBe('INVALID_STATUS')
  })

  it("does not approve another company's request", async () => {
    const adv = await fileRequest()
    const res = await approve(adv.id, outsiderToken)
    expect(res.status).toBe(409)
    expect((await row(adv.id)).status).toBe('pending_approval')
  })

  it('two managers clicking together approve it once', async () => {
    const adv = await fileRequest()
    const [a, b] = await Promise.all([approve(adv.id), approve(adv.id)])
    expect([a.status, b.status].sort()).toEqual([200, 409])
  })
})

describe('issue is the cashbox handler step', () => {
  it('pays from the chosen cashbox: balance down, a spend logged, a draft journal against that box, advance open', async () => {
    const adv = await fileRequest({ amount: 200000, currency_code: 'IQD', purpose: 'Site fuel' })
    await approve(adv.id)
    const res = await issue(adv.id, boxB)
    expect(res.status).toBe(200)

    const r = await row(adv.id)
    expect(r.status).toBe('approved') // issued and open for settlement: every settlement query still finds it
    expect(r.petty_cash_float_id).toBe(boxB)
    expect(r.issued_by).not.toBeNull()
    expect(r.issued_at).not.toBeNull()
    expect(r.cash_account_id).toBe(boxBGl) // the box's account, not the default cash account the request resolved
    expect(await balance(boxB)).toBe(4_800_000)
    expect(await balance(boxA)).toBe(5_000_000) // only the chosen box moved

    const tx = (await pool.query(`SELECT * FROM petty_cash_transactions WHERE float_id = $1`, [boxB])).rows
    expect(tx).toHaveLength(1)
    expect(tx[0].transaction_type).toBe('spend')
    expect(Number(tx[0].amount)).toBe(200000)
    expect(Number(tx[0].balance_after)).toBe(4_800_000)
    expect(tx[0].journal_entry_id).toBe(r.journal_entry_id)

    const je = (await pool.query(`SELECT * FROM journal_entries WHERE id = $1`, [r.journal_entry_id])).rows[0]
    expect(je.status).toBe('draft')
    expect(je.source_type).toBe('employee_advance_issuance')
    const lines = (await pool.query(`SELECT account_id, debit, credit, amount_company_currency FROM journal_lines WHERE journal_entry_id = $1 ORDER BY debit DESC`, [r.journal_entry_id])).rows
    expect(lines).toHaveLength(2)
    expect(Number(lines[0].debit)).toBe(200000)
    expect(lines[0].account_id).toBe(r.advance_account_id)
    expect(Number(lines[1].credit)).toBe(200000)
    expect(lines[1].account_id).toBe(boxBGl) // the chosen cashbox's GL account
  })

  it('does not tag the issuance with a project: handing out cash is not a project cost', async () => {
    const adv = await fileRequest({ amount: 1000, currency_code: 'IQD', project_id: projectId })
    await approve(adv.id)
    await issue(adv.id, boxA)
    const r = await row(adv.id)
    const tagged = await pool.query(`SELECT 1 FROM journal_lines WHERE journal_entry_id = $1 AND analytic_account_id IS NOT NULL`, [r.journal_entry_id])
    expect(tagged.rowCount).toBe(0)
  })

  it('writes an audit row for the issue', async () => {
    const adv = await fileRequest()
    await approve(adv.id)
    await issue(adv.id, boxA)
    const audit = await pool.query(
      `SELECT new_values FROM audit_log WHERE record_id = $1 AND table_name = 'employee_advances' ORDER BY created_at DESC`,
      [adv.id],
    )
    expect(audit.rows.some((a) => a.new_values?.issued === true && a.new_values?.petty_cash_float_id === boxA)).toBe(true)
  })

  it('is refused unless the advance is waiting to be issued', async () => {
    const adv = await fileRequest()
    const early = await issue(adv.id, boxA) // still pending approval: the manager has not said yes
    expect(early.status).toBe(409)
    expect(early.body.error.code).toBe('INVALID_STATUS')
    await approve(adv.id)
    expect((await issue(adv.id, boxA)).status).toBe(200)
    expect((await issue(adv.id, boxA)).status).toBe(409) // never twice
    expect(await balance(boxA)).toBe(4_800_000)
  })

  it('needs finance.petty_cash.edit: the manager and the owner cannot issue', async () => {
    const adv = await fileRequest()
    await approve(adv.id)
    expect((await issue(adv.id, boxA, managerToken)).status).toBe(403)
    expect((await issue(adv.id, boxA, ownerToken)).status).toBe(403)
    expect((await row(adv.id)).status).toBe('pending_issue')
    expect(await balance(boxA)).toBe(5_000_000)
  })

  it('an admin can issue too', async () => {
    const adv = await fileRequest()
    await approve(adv.id)
    expect((await issue(adv.id, boxA, adminToken)).status).toBe(200)
  })

  it.each([
    ['inactive', () => boxInactive, 422, 'CASHBOX_INACTIVE'],
    ['another currency', () => boxUsd, 422, 'CURRENCY_MISMATCH'],
    ['without a GL account', () => boxNoGl, 422, 'NO_GL_ACCOUNT'],
    ['holding less than the amount', () => boxSmall, 422, 'INSUFFICIENT_BALANCE'],
    ["another company's", () => foreignBox, 404, 'CASHBOX_NOT_FOUND'],
  ])('refuses a cashbox that is %s, and nothing moves', async (_label, box, status, code) => {
    const adv = await fileRequest()
    await approve(adv.id)
    const res = await issue(adv.id, box())
    expect(res.status).toBe(status)
    expect(res.body.error.code).toBe(code)
    const r = await row(adv.id)
    expect(r.status).toBe('pending_issue')
    expect(r.journal_entry_id).toBeNull()
    expect((await pool.query(`SELECT 1 FROM petty_cash_transactions WHERE company_id = $1`, [TEST_COMPANY_ID])).rowCount).toBe(0)
  })

  it('a box holding exactly the amount can pay it (the limit is "less than", not "at most")', async () => {
    await pool.query(`UPDATE petty_cash_floats SET current_balance = 200000 WHERE id = $1`, [boxA])
    const adv = await fileRequest({ amount: 200000, currency_code: 'IQD' })
    await approve(adv.id)
    expect((await issue(adv.id, boxA)).status).toBe(200)
    expect(await balance(boxA)).toBe(0)
  })

  it('two cashiers issuing the same advance together pay it once', async () => {
    const adv = await fileRequest()
    await approve(adv.id)
    const [a, b] = await Promise.all([issue(adv.id, boxA), issue(adv.id, boxB)])
    expect([a.status, b.status].sort()).toEqual([200, 409])
    const paid = (await balance(boxA)) + (await balance(boxB))
    expect(paid).toBe(10_000_000 - 200000)
  })

  it('a stranger from another company cannot issue', async () => {
    const adv = await fileRequest()
    await approve(adv.id)
    const res = await issue(adv.id, boxA, outsiderToken)
    expect(res.status).toBe(409)
    expect((await row(adv.id)).status).toBe('pending_issue')
  })
})

describe('what the cashbox handler sees', () => {
  it('awaiting-issue lists only the advances waiting to be paid out, only for this company', async () => {
    const waiting = await fileRequest({ amount: 1111, currency_code: 'IQD' })
    const notApproved = await fileRequest({ amount: 2222, currency_code: 'IQD' })
    const issued = await fileRequest({ amount: 3333, currency_code: 'IQD' })
    await approve(waiting.id)
    await approve(issued.id)
    await issue(issued.id, boxA)
    const res = await request(app).get('/finance/advances/awaiting-issue').set(bearer(cashierToken))
    expect(res.status).toBe(200)
    const ids = res.body.data.map((a: { id: string }) => a.id)
    expect(ids).toContain(waiting.id)
    expect(ids).not.toContain(notApproved.id)
    expect(ids).not.toContain(issued.id)
    expect((await request(app).get('/finance/advances/awaiting-issue').set(bearer(managerToken))).status).toBe(403)
    const other = await request(app).get('/finance/advances/awaiting-issue').set(bearer(outsiderToken))
    expect(other.body.data.map((a: { id: string }) => a.id)).not.toContain(waiting.id)
  })

  it('issue-options lists active cashboxes and says why one cannot pay this advance', async () => {
    const adv = await fileRequest({ amount: 200000, currency_code: 'IQD' })
    await approve(adv.id)
    const res = await request(app).get(`/finance/advances/${adv.id}/issue-options`).set(bearer(cashierToken))
    expect(res.status).toBe(200)
    expect(res.body.data.advance.id).toBe(adv.id)
    const byId = Object.fromEntries(res.body.data.cashboxes.map((b: { id: string; problem: string | null }) => [b.id, b.problem]))
    expect(byId[boxA]).toBeNull()
    expect(byId[boxUsd]).toBe('CURRENCY_MISMATCH')
    expect(byId[boxNoGl]).toBe('NO_GL_ACCOUNT')
    expect(byId[boxSmall]).toBe('INSUFFICIENT_BALANCE')
    expect(byId[boxInactive]).toBeUndefined() // inactive boxes are not offered
    expect(byId[foreignBox]).toBeUndefined() // nor another company's
  })

  it('issue-options for an advance that is not waiting is a 409', async () => {
    const adv = await fileRequest()
    const res = await request(app).get(`/finance/advances/${adv.id}/issue-options`).set(bearer(cashierToken))
    expect(res.status).toBe(409)
  })
})

describe('a rejected request is edited and sent again, like an expense claim', () => {
  it('the owner changes it and it goes back to the manager; the reason stays as history', async () => {
    const adv = await fileRequest({ amount: 900000, currency_code: 'IQD', purpose: 'Site fuel' })
    await reject(adv.id)
    const res = await revise(adv.id, { amount: 300000, purpose: 'Site fuel, 2 weeks' })
    expect(res.status).toBe(200)
    const r = await row(adv.id)
    expect(r.status).toBe('pending_approval')
    expect(Number(r.amount)).toBe(300000)
    expect(r.purpose).toBe('Site fuel, 2 weeks')
    expect(r.rejection_reason).toBe('Amount is too high')
    // and it can now be approved and issued for the new amount
    expect((await approve(adv.id)).status).toBe(200)
    expect((await issue(adv.id, boxA)).status).toBe(200)
    expect(await balance(boxA)).toBe(4_700_000)
  })

  it('an admin may revise on the owner\'s behalf; a stranger and a manager may not', async () => {
    const adv = await fileRequest()
    await reject(adv.id)
    expect((await revise(adv.id, { amount: 1 }, strangerToken)).status).toBe(403)
    expect((await revise(adv.id, { amount: 1 }, managerToken)).status).toBe(403)
    expect((await row(adv.id)).status).toBe('rejected')
    expect((await revise(adv.id, { amount: 150000 }, adminToken)).status).toBe(200)
  })

  it('only a rejected request can be revised', async () => {
    const adv = await fileRequest()
    const res = await revise(adv.id, { amount: 1 })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('INVALID_STATUS')
    await approve(adv.id)
    expect((await revise(adv.id, { amount: 1 })).status).toBe(409)
  })

  it('sending it again unchanged is refused: something must change', async () => {
    const adv = await fileRequest({ amount: 500, currency_code: 'IQD', purpose: 'Taxi' })
    await reject(adv.id)
    const res = await revise(adv.id, { amount: 500, purpose: 'Taxi' })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('NO_CHANGES')
    expect((await row(adv.id)).status).toBe('rejected')
  })

  it("refuses another company's project", async () => {
    const adv = await fileRequest()
    await reject(adv.id)
    const res = await revise(adv.id, { project_id: foreignProjectId })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_PROJECT')
    expect((await row(adv.id)).project_id).toBeNull()
  })

  it("another company cannot reach it", async () => {
    const adv = await fileRequest()
    await reject(adv.id)
    expect((await revise(adv.id, { amount: 1 }, outsiderToken)).status).toBe(404)
  })

  it('writes an audit row with the old and the new values', async () => {
    const adv = await fileRequest({ amount: 900000, currency_code: 'IQD' })
    await reject(adv.id)
    await revise(adv.id, { amount: 100000 })
    const audit = await pool.query(`SELECT old_values, new_values FROM audit_log WHERE record_id = $1 AND table_name = 'employee_advances'`, [adv.id])
    const revised = audit.rows.find((a) => a.new_values?.revised === true)
    expect(revised).toBeTruthy()
    expect(Number(revised.old_values.amount)).toBe(900000)
    expect(Number(revised.new_values.amount)).toBe(100000)
  })

  it('can_revise is true for the owner and an admin, false for others, on the detail read', async () => {
    const adv = await fileRequest()
    await reject(adv.id)
    const get = (t: string, id = adv.id) => request(app).get(`/finance/advances/${id}`).set(bearer(t))
    const pending = await fileRequest({ amount: 7, currency_code: 'IQD' }) // not rejected: nobody can revise it
    expect((await get(adminToken)).body.data.can_revise).toBe(true)
    expect((await get(adminToken, pending.id)).body.data.can_revise).toBe(false)
    expect((await get(managerToken)).body.data.can_revise).toBe(false) // a manager who did not file it cannot revise it
    // the list read answers the same, for the same people
    const listed = async (t: string) => {
      const res = await request(app).get('/finance/advances').set(bearer(t))
      return Object.fromEntries(res.body.data.map((a: { id: string; can_revise: boolean }) => [a.id, a.can_revise]))
    }
    const asAdmin = await listed(adminToken)
    expect(asAdmin[adv.id]).toBe(true)
    expect(asAdmin[pending.id]).toBe(false)
    expect((await listed(managerToken))[adv.id]).toBe(false)
    expect((await get(ownerToken)).status).toBe(403) // the owner has no view permission: they read it through /mine
  })
})

describe('cancelling', () => {
  it('an approved request not yet paid out can be cancelled with nothing to reverse', async () => {
    const adv = await fileRequest()
    await approve(adv.id)
    const res = await request(app).post(`/finance/advances/${adv.id}/void`).set(bearer(managerToken)).send({ reason: 'Not needed any more' })
    expect(res.status).toBe(200)
    const r = await row(adv.id)
    expect(r.status).toBe('cancelled')
    expect(r.journal_entry_id).toBeNull()
    expect(await balance(boxA)).toBe(5_000_000)
    expect((await issue(adv.id, boxA)).status).toBe(409) // and it can no longer be issued
  })

  it('an issued advance is reversed by the void and the cash goes back into the box it came from', async () => {
    const adv = await fileRequest()
    await approve(adv.id)
    await issue(adv.id, boxA)
    expect(await balance(boxA)).toBe(4_800_000)
    const res = await request(app).post(`/finance/advances/${adv.id}/void`).set(bearer(managerToken)).send({ reason: 'Wrong person' })
    expect(res.status).toBe(200)
    expect((await row(adv.id)).status).toBe('cancelled')
    // without this the box would stay 200,000 short of its GL account for ever
    expect(await balance(boxA)).toBe(5_000_000)
    const back = (await pool.query(`SELECT * FROM petty_cash_transactions WHERE float_id = $1 AND transaction_type = 'adjustment'`, [boxA])).rows
    expect(back).toHaveLength(1)
    expect(Number(back[0].amount)).toBe(200000)
    expect(Number(back[0].balance_after)).toBe(5_000_000)
  })

  it('a void of an advance that already has settlements is refused and the box is untouched', async () => {
    const adv = await fileRequest()
    await approve(adv.id)
    await issue(adv.id, boxA)
    await pool.query(`UPDATE employee_advances SET settled_amount = 1000 WHERE id = $1`, [adv.id])
    const res = await request(app).post(`/finance/advances/${adv.id}/void`).set(bearer(managerToken)).send({ reason: 'x' })
    expect(res.status).toBe(422)
    expect(await balance(boxA)).toBe(4_800_000)
  })
})

describe('the cost center is chosen when the advance is paid out, not when the manager approves', () => {
  const advanceCc = async (id: string): Promise<string | null> =>
    ((await row(id)).cost_center_id as string | null) ?? null
  const issueWith = (id: string, body: Record<string, unknown>, token = cashierToken) =>
    request(app).post(`/finance/advances/${id}/issue`).set(bearer(token)).send(body)

  it('approving neither asks for nor sets a cost center', async () => {
    const adv = await fileRequest()
    await approve(adv.id)
    expect(await advanceCc(adv.id)).toBeNull()
  })

  it('issuing with a cost center stores it on the advance and in the audit row', async () => {
    const adv = await fileRequest()
    await approve(adv.id)
    const res = await issueWith(adv.id, { petty_cash_float_id: boxA, cost_center_id: ccActive })
    expect(res.status).toBe(200)
    expect(await advanceCc(adv.id)).toBe(ccActive)
    const audit = await pool.query(
      `SELECT new_values FROM audit_log WHERE record_id=$1 AND table_name='employee_advances' ORDER BY created_at DESC`,
      [adv.id],
    )
    expect(audit.rows.some((a) => a.new_values?.issued === true && a.new_values?.cost_center_id === ccActive)).toBe(true)
  })

  it('without one the advance keeps whatever it had, and stays empty if it had none', async () => {
    const bare = await fileRequest()
    await approve(bare.id)
    expect((await issueWith(bare.id, { petty_cash_float_id: boxA })).status).toBe(200)
    expect(await advanceCc(bare.id)).toBeNull()

    const had = await fileRequest()
    await pool.query(`UPDATE employee_advances SET cost_center_id = $2 WHERE id = $1`, [had.id, ccActive])
    await approve(had.id)
    expect((await issueWith(had.id, { petty_cash_float_id: boxA })).status).toBe(200)
    expect(await advanceCc(had.id)).toBe(ccActive)
  })

  it("the handler's choice replaces the one the advance had", async () => {
    const adv = await fileRequest()
    await pool.query(`INSERT INTO cost_centers (company_id, code, name, type) VALUES ($1,$2,'Other cc','overhead')`, [TEST_COMPANY_ID, `${PREFIX}CC3`])
    const other = (await pool.query<{ id: string }>(`SELECT id FROM cost_centers WHERE code=$1`, [`${PREFIX}CC3`])).rows[0]!.id
    await pool.query(`UPDATE employee_advances SET cost_center_id = $2 WHERE id = $1`, [adv.id, other])
    await approve(adv.id)
    expect((await issueWith(adv.id, { petty_cash_float_id: boxA, cost_center_id: ccActive })).status).toBe(200)
    expect(await advanceCc(adv.id)).toBe(ccActive)
  })

  it.each([
    ["another company's", () => ccForeign],
    ['an inactive', () => ccInactive],
    ['a made-up', () => '00000000-0000-0000-0000-00000000dead'],
  ])('refuses %s cost center (400) and nothing moves', async (_label, pick) => {
    const adv = await fileRequest()
    await approve(adv.id)
    const res = await issueWith(adv.id, { petty_cash_float_id: boxA, cost_center_id: pick() })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_COST_CENTER')
    const r = await row(adv.id)
    expect(r.status).toBe('pending_issue')
    expect(r.cost_center_id).toBeNull()
    expect(r.journal_entry_id).toBeNull()
    expect(await balance(boxA)).toBe(5_000_000)
  })

  it('issue-options lists this company\'s active cost centers (not inactive, not another company\'s) and the advance\'s current one', async () => {
    const adv = await fileRequest()
    await pool.query(`UPDATE employee_advances SET cost_center_id = $2 WHERE id = $1`, [adv.id, ccActive])
    await approve(adv.id)
    const res = await request(app).get(`/finance/advances/${adv.id}/issue-options`).set(bearer(cashierToken))
    expect(res.status).toBe(200)
    const ids = res.body.data.cost_centers.map((c: { id: string }) => c.id)
    expect(ids).toContain(ccActive)
    expect(ids).not.toContain(ccInactive)
    expect(ids).not.toContain(ccForeign)
    expect(res.body.data.advance.cost_center_id).toBe(ccActive)
    expect(res.body.data.cost_centers[0]).toEqual(expect.objectContaining({ code: expect.any(String), name: expect.any(String) }))
  })

  it("never shows the name of another company's cost center, even if an old advance points at one", async () => {
    const adv = await fileRequest()
    await pool.query(`UPDATE employee_advances SET cost_center_id = $2 WHERE id = $1`, [adv.id, ccForeign])
    const res = await request(app).get(`/finance/advances/${adv.id}`).set(bearer(adminToken))
    expect(res.status).toBe(200)
    expect(res.body.data.cost_center_name).toBeNull()
    expect(res.body.data.cost_center_code).toBeNull()
  })

  it('the advance page read names the cost center, and none when there is none', async () => {
    const adv = await fileRequest()
    await approve(adv.id)
    const before = await request(app).get(`/finance/advances/${adv.id}`).set(bearer(adminToken))
    expect(before.body.data.cost_center_name).toBeNull()
    await issueWith(adv.id, { petty_cash_float_id: boxA, cost_center_id: ccActive })
    const after = await request(app).get(`/finance/advances/${adv.id}`).set(bearer(adminToken))
    expect(after.body.data.cost_center_code).toBe(`${PREFIX}CC1`)
    expect(after.body.data.cost_center_name).toBe(`Cost center ${PREFIX}CC1`)
  })
})
