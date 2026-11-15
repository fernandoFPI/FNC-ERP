// The GL account of a PO line that is waiting to be settled against an advance (playbook #91).
//
// A line carrying the header account `1000 Assets` made the first settlement on production die in the database trigger
// (fn_enforce_postable_account) as a bare "Failed to create settlement", and the PO was already closed so the account could not
// be changed. Now: the pending list says which lines cannot be posted, the settlement refuses them by name BEFORE anything is
// written, and Finance can change a line's account and cost center from the advance (PUT .../po-lines/:lineId/accounting).
// Real Postgres through the real routes (supertest), in the finance fixture company.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createHash } from 'crypto'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { pool } from '@fnc-erp/db'
import { hashPassword, signAccessToken } from '@fnc-erp/auth'
import { TEST_COMPANY_ID, createTestUser, getAccountId } from './setup.js'
import { blockedLinesMessage, type BlockedLineRow } from '../src/lib/poLineAccounting.js'

const app = createApp()
const OTHER_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const PREFIX = 'F-LINEACC-'
const REFRESH_HASH = 'test-refresh-hash-finance-lineacc'
const EMAIL = (tag: string) => `line-acc-${tag}@fnc-erp.local`

let adminToken = ''
let approverToken = '' // role user + finance.ap.approve only
let editorToken = '' // role user + finance.advances.edit only (can settle, cannot classify)
let viewerToken = '' // role user + finance.ap.view only
let outsiderToken = '' // company_admin of ANOTHER company
let userId = ''
let advIqd = '' // pays most lines
let advOther = '' // pays "OTHERADV"
let advHeaderAcct = '' // its own account is a header account
let goodAccount = '' // postable, active
let goodAccount2 = ''
let headerAccount = '' // is_header, not postable
let nonPostableAccount = '' // not a header, but not postable
let inactiveAccount = '' // postable but inactive
let foreignAccount = '' // another company's account
let goodCc = ''
let goodCc2 = ''
let inactiveCc = ''
let foreignCc = ''
let employeeId = ''
let cashId = ''
const L: Record<string, string> = {} // line ids by key
let poSeq = 0

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` })

async function makeUser(email: string, companyId: string, role: string): Promise<{ userId: string; token: string }> {
  const passwordHash = await hashPassword('TestPass123!')
  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,$2)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [email, passwordHash],
  )
  const id = u.rows[0]!.id
  await pool.query(`INSERT INTO user_company_roles (user_id, company_id, role, module) VALUES ($1,$2,$3,'all') ON CONFLICT DO NOTHING`, [
    id,
    companyId,
    role,
  ])
  const token = signAccessToken({ userId: id, companyId, role, module: 'all', sessionId: 'test-session' })
  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, refresh_token_hash, expires_at, refresh_expires_at)
     VALUES ($1,$2,$3,NOW() + INTERVAL '1 hour',NOW() + INTERVAL '7 days') ON CONFLICT DO NOTHING`,
    [id, createHash('sha256').update(token).digest('hex'), `${REFRESH_HASH}-${id}`],
  )
  return { userId: id, token }
}

async function grant(id: string, key: string, level: string): Promise<void> {
  await pool.query(
    `INSERT INTO user_permissions (user_id, company_id, permission_key, access_level) VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, company_id, permission_key) DO UPDATE SET access_level = EXCLUDED.access_level`,
    [id, TEST_COMPANY_ID, key, level],
  )
}

async function account(
  code: string,
  name: string,
  o: { header?: boolean; postable?: boolean; active?: boolean; company?: string } = {},
): Promise<string> {
  const header = o.header ?? false
  return (
    await pool.query<{ id: string }>(
      `INSERT INTO chart_of_accounts (company_id, code, name, account_type, is_header, is_postable, is_active)
       VALUES ($1,$2,$3,'expense',$4,$5,$6) RETURNING id`,
      [o.company ?? TEST_COMPANY_ID, code, `${PREFIX}${name}`, header, header ? false : (o.postable ?? true), o.active ?? true],
    )
  ).rows[0]!.id
}

async function costCenter(code: string, o: { active?: boolean; company?: string } = {}): Promise<string> {
  return (
    await pool.query<{ id: string }>(
      `INSERT INTO cost_centers (company_id, code, name, type, is_active) VALUES ($1,$2,$3,'overhead',$4) RETURNING id`,
      [o.company ?? TEST_COMPANY_ID, `${PREFIX}${code}`, `Line accounting cc ${code}`, o.active ?? true],
    )
  ).rows[0]!.id
}

interface LineSpec {
  key: string
  amount?: number
  account?: string | null // undefined = a good one; null = none
  cc?: string | null // undefined = a good one; null = none
}

// One closed PO funded by `advance` for IQD, with the given lines.
async function makePO(key: string, lines: LineSpec[], opts: { advance?: string; status?: string } = {}): Promise<string> {
  poSeq += 1
  const advance = opts.advance ?? advIqd
  const po = await pool.query<{ id: string }>(
    `INSERT INTO purchase_orders (company_id, po_number, currency_code, base_currency_code, status, purpose, created_by,
                                  funding_source, funding_decided, funding_advance_id)
     VALUES ($1,$2,'IQD','IQD',$3,'stock',$4,'employee_advance',true,$5) RETURNING id`,
    [TEST_COMPANY_ID, `${PREFIX}${key}-${poSeq}`, opts.status ?? 'closed', userId, advance],
  )
  await pool.query(`INSERT INTO po_funding_advances (po_id, currency_code, advance_id, company_id) VALUES ($1,'IQD',$2,$3)`, [
    po.rows[0]!.id,
    advance,
    TEST_COMPANY_ID,
  ])
  let n = 0
  for (const l of lines) {
    n += 1
    const r = await pool.query<{ id: string }>(
      `INSERT INTO po_lines (po_id, line_number, description, qty_ordered, unit_price, total_price, currency_code, account_id, cost_center_id)
       VALUES ($1,$2,$3,1,$4,$4,'IQD',$5,$6) RETURNING id`,
      [
        po.rows[0]!.id,
        n,
        `${key} ${l.key}`,
        l.amount ?? 1000,
        l.account === undefined ? goodAccount : l.account,
        l.cc === undefined ? goodCc : l.cc,
      ],
    )
    L[`${key}.${l.key}`] = r.rows[0]!.id
  }
  return po.rows[0]!.id
}

async function cleanup(): Promise<void> {
  const settlements = (
    await pool.query<{ id: string; journal_entry_id: string | null }>(
      `SELECT s.id, s.journal_entry_id FROM advance_settlements s JOIN employee_advances a ON a.id = s.advance_id WHERE a.advance_number LIKE $1`,
      [`${PREFIX}%`],
    )
  ).rows
  await pool.query(`UPDATE po_lines SET advance_settlement_id = NULL WHERE po_id IN (SELECT id FROM purchase_orders WHERE po_number LIKE $1)`, [
    `${PREFIX}%`,
  ])
  await pool.query(`DELETE FROM audit_log WHERE table_name = 'po_lines' AND action = 'po_line_accounting_changed' AND company_id = $1`, [TEST_COMPANY_ID])
  const journalIds = settlements.map((s) => s.journal_entry_id).filter((x): x is string => !!x)
  await pool.query(`DELETE FROM advance_settlements WHERE id = ANY($1::uuid[])`, [settlements.map((s) => s.id)])
  if (journalIds.length) {
    await pool.query(`DELETE FROM journal_lines WHERE journal_entry_id = ANY($1::uuid[])`, [journalIds])
    await pool.query(`DELETE FROM journal_entries WHERE id = ANY($1::uuid[])`, [journalIds])
  }
  await pool.query(`DELETE FROM po_lines WHERE po_id IN (SELECT id FROM purchase_orders WHERE po_number LIKE $1)`, [`${PREFIX}%`])
  await pool.query(`DELETE FROM purchase_orders WHERE po_number LIKE $1`, [`${PREFIX}%`])
  await pool.query(`DELETE FROM employee_advances WHERE advance_number LIKE $1`, [`${PREFIX}%`])
  await pool.query(`DELETE FROM cost_centers WHERE code LIKE $1`, [`${PREFIX}%`])
  await pool.query(`DELETE FROM chart_of_accounts WHERE name LIKE $1`, [`${PREFIX}%`])
  await pool.query(`DELETE FROM employees WHERE employee_number LIKE $1`, [`${PREFIX}%`])
  await pool.query(`DELETE FROM user_permissions WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'line-acc-%')`)
  await pool.query(`DELETE FROM users WHERE email LIKE 'line-acc-%'`)
  await pool.query(`DELETE FROM sessions WHERE refresh_token_hash LIKE $1`, [`${REFRESH_HASH}%`])
}

beforeAll(async () => {
  await cleanup()
  const admin = await createTestUser()
  adminToken = admin.token
  userId = admin.userId
  const approver = await makeUser(EMAIL('approver'), TEST_COMPANY_ID, 'user')
  approverToken = approver.token
  await grant(approver.userId, 'finance.ap.approve', 'approve')
  const editor = await makeUser(EMAIL('editor'), TEST_COMPANY_ID, 'user')
  editorToken = editor.token
  await grant(editor.userId, 'finance.advances.edit', 'edit')
  await grant(editor.userId, 'finance.advances.view', 'view')
  const viewer = await makeUser(EMAIL('viewer'), TEST_COMPANY_ID, 'user')
  viewerToken = viewer.token
  await grant(viewer.userId, 'finance.ap.view', 'view')
  outsiderToken = (await makeUser(EMAIL('outsider'), OTHER_COMPANY_ID, 'company_admin')).token

  cashId = await getAccountId('1100')
  const advanceAssetId = await getAccountId('1200')
  goodAccount = await account('9811', 'good account')
  goodAccount2 = await account('9814', 'second good account')
  headerAccount = await account('9810', 'Assets-like header', { header: true })
  nonPostableAccount = await account('9815', 'non-postable detail account', { postable: false })
  inactiveAccount = await account('9812', 'inactive account', { active: false })
  foreignAccount = await account('9813', 'foreign account', { company: OTHER_COMPANY_ID })
  goodCc = await costCenter('CC1')
  goodCc2 = await costCenter('CC2')
  inactiveCc = await costCenter('CCI', { active: false })
  foreignCc = await costCenter('CCF', { company: OTHER_COMPANY_ID })
  employeeId = (
    await pool.query<{ id: string }>(
      `INSERT INTO employees (company_id, first_name, last_name, hire_date, employee_number, status) VALUES ($1,'Line','Acct',CURRENT_DATE,$2,'active') RETURNING id`,
      [TEST_COMPANY_ID, `${PREFIX}${Date.now()}`],
    )
  ).rows[0]!.id
  const mkAdvance = async (tag: string, advanceAccount: string) =>
    (
      await pool.query<{ id: string }>(
        `INSERT INTO employee_advances (company_id, advance_number, employee_id, employee_name, currency_code, amount, cash_account_id, advance_account_id, status)
         VALUES ($1,$2,$3,'Line Acct','IQD',10000000,$4,$5,'approved') RETURNING id`,
        [TEST_COMPANY_ID, `${PREFIX}${tag}-${Date.now()}`, employeeId, cashId, advanceAccount],
      )
    ).rows[0]!.id
  advIqd = await mkAdvance('A', advanceAssetId)
  advOther = await mkAdvance('B', advanceAssetId)
  advHeaderAcct = await mkAdvance('H', headerAccount)
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM sessions WHERE refresh_token_hash = 'test-refresh-hash-finance'`)
  await pool.query(`DELETE FROM users WHERE email = 'finance-test@fnc-erp.local'`)
  await pool.end()
})

const queue = async (advance: string, token = adminToken) => {
  const res = await request(app).get(`/finance/advances/${advance}/pending-po-lines`).set(bearer(token))
  expect(res.status).toBe(200)
  return res.body.data as {
    id: string
    gl_account_id: string | null
    cost_center_id: string | null
    account_code: string | null
    account_problem: string | null
    cost_center_problem: string | null
  }[]
}
const settle = (advance: string, lines: string[], token = adminToken) =>
  request(app).post('/finance/advances/settlements').set(bearer(token)).send({ advance_id: advance, po_line_ids: lines })
const putAccounting = (advance: string, line: string, body: Record<string, unknown>, token = adminToken) =>
  request(app).put(`/finance/advances/${advance}/po-lines/${line}/accounting`).set(bearer(token)).send(body)
const lineRow = async (id: string) =>
  (await pool.query<{ account_id: string | null; cost_center_id: string | null; advance_settlement_id: string | null }>(
    `SELECT account_id, cost_center_id, advance_settlement_id FROM po_lines WHERE id = $1`,
    [id],
  )).rows[0]!
const claimed = async (ids: string[]) =>
  (await pool.query(`SELECT 1 FROM po_lines WHERE id = ANY($1::uuid[]) AND advance_settlement_id IS NOT NULL`, [ids])).rowCount
const settlementsOf = async (advance: string) =>
  (await pool.query(`SELECT 1 FROM advance_settlements WHERE advance_id = $1`, [advance])).rowCount
const auditRows = async (lineId: string) =>
  (await pool.query<{ old_values: Record<string, unknown>; new_values: Record<string, unknown>; user_id: string; company_id: string }>(
    `SELECT old_values, new_values, user_id, company_id FROM audit_log WHERE record_id = $1 AND action = 'po_line_accounting_changed'`,
    [lineId],
  )).rows

describe('the message that names the lines (pure)', () => {
  const row = (over: Partial<BlockedLineRow> = {}): BlockedLineRow => ({
    po_number: 'NY-PO-2026-0063',
    line_number: 1,
    description: 'Plastering',
    account_code: '1000',
    account_name: 'Assets',
    account_problem: null,
    cost_center_problem: null,
    ...over,
  })

  it('is null when every line can be posted', () => {
    expect(blockedLinesMessage([])).toBeNull()
    expect(blockedLinesMessage([row(), row({ line_number: 2 })])).toBeNull()
  })

  it('names the PO, the line, the item and why, for a header account', () => {
    const m = blockedLinesMessage([row({ account_problem: 'not_postable' })])
    expect(m).toMatch(/^1 selected line cannot be settled yet: NY-PO-2026-0063 line 1 \(Plastering\): GL account 1000 · Assets is a header account and cannot be posted to\./)
    expect(m).toMatch(/Change the account on the line in the pending list/)
  })

  it('says each other reason in words', () => {
    expect(blockedLinesMessage([row({ account_problem: 'missing' })])).toMatch(/has no GL account/)
    expect(blockedLinesMessage([row({ account_problem: 'not_found' })])).toMatch(/not one of this company's accounts/)
    expect(blockedLinesMessage([row({ cost_center_problem: 'missing' })])).toMatch(/has no cost center/)
    expect(blockedLinesMessage([row({ cost_center_problem: 'not_found' })])).toMatch(/not one of this company's cost centers/)
  })

  it('puts both problems of one line in one entry', () => {
    const m = blockedLinesMessage([row({ account_problem: 'missing', cost_center_problem: 'missing' })])
    expect(m).toMatch(/has no GL account, has no cost center/)
  })

  it('counts the lines, names five, and says how many more', () => {
    const rows = Array.from({ length: 8 }, (_, i) => row({ line_number: i + 1, account_problem: 'not_postable' }))
    const m = blockedLinesMessage(rows)!
    expect(m).toMatch(/^8 selected lines cannot be settled yet/)
    expect(m).toMatch(/line 5 /)
    expect(m).not.toMatch(/line 6 /)
    expect(m).toMatch(/; and 3 more\./)
  })

  it('shortens a long item name and copes with none', () => {
    const long = 'x'.repeat(80)
    expect(blockedLinesMessage([row({ account_problem: 'missing', description: long })])).toMatch(new RegExp(`\\(${'x'.repeat(37)}\\.\\.\\.\\)`))
    expect(blockedLinesMessage([row({ account_problem: 'missing', description: null })])).toMatch(/line 1: has no GL account/)
  })
})

describe('the pending list says what is wrong with a line', () => {
  it('flags a header account, a missing account, a missing cost center and another company’s account; a good line has none', async () => {
    await makePO('FLAGS', [
      { key: 'ok' },
      { key: 'hdr', account: headerAccount },
      { key: 'noacct', account: null },
      { key: 'nocc', cc: null },
      { key: 'foreign', account: foreignAccount },
      { key: 'nonpost', account: nonPostableAccount },
    ])
    const rows = await queue(advIqd)
    const by = (k: string) => rows.find((r) => r.id === L[`FLAGS.${k}`])!
    expect([by('ok').account_problem, by('ok').cost_center_problem]).toEqual([null, null])
    expect(by('hdr').account_problem).toBe('not_postable')
    expect(by('hdr').account_code).toBe('9810')
    expect(by('noacct').account_problem).toBe('missing')
    expect(by('nocc').cost_center_problem).toBe('missing')
    expect(by('foreign').account_problem).toBe('not_found')
    expect(by('foreign').account_code).toBeNull() // another company's account is not read back
    expect(by('nonpost').account_problem).toBe('not_postable')
    expect(by('hdr').gl_account_id).toBe(headerAccount) // the id is still there, for the editor
  })

  it("flags another company's cost center as not found and does not read its name back", async () => {
    await makePO('FLAGCC', [{ key: 'foreigncc', cc: foreignCc }])
    const row = (await queue(advIqd)).find((r) => r.id === L['FLAGCC.foreigncc'])! as { cost_center_problem: string | null; cost_center_code: string | null }
    expect(row.cost_center_problem).toBe('not_found')
    expect(row.cost_center_code).toBeNull()
  })
})

describe('a settlement says what is wrong instead of failing in the database', () => {
  it('refuses a header account with 422, naming the PO, the line and the account, and writes nothing', async () => {
    await makePO('HDR', [{ key: 'one', account: headerAccount, amount: 5000 }])
    const before = await settlementsOf(advIqd)
    const res = await settle(advIqd, [L['HDR.one']!])
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('LINES_NEED_ACCOUNTING')
    expect(res.body.error.message).toMatch(/1 selected line cannot be settled yet/)
    expect(res.body.error.message).toMatch(/F-LINEACC-HDR-\d+ line 1/)
    expect(res.body.error.message).toMatch(/GL account 9810 · F-LINEACC-Assets-like header is a header account/)
    expect(await claimed([L['HDR.one']!])).toBe(0)
    expect(await settlementsOf(advIqd)).toBe(before)
    const adv = await pool.query<{ settled_amount: string }>(`SELECT settled_amount FROM employee_advances WHERE id=$1`, [advIqd])
    expect(Number(adv.rows[0]!.settled_amount)).toBe(0)
  })

  it('a non-postable account that is not a header is refused the same way', async () => {
    await makePO('NONPOST', [{ key: 'one', account: nonPostableAccount }])
    const res = await settle(advIqd, [L['NONPOST.one']!])
    expect(res.status).toBe(422)
    expect(res.body.error.message).toMatch(/9815/)
  })

  it('refuses a line with no account, and one with no cost center', async () => {
    await makePO('MISSING', [{ key: 'noacct', account: null }, { key: 'nocc', cc: null }])
    const a = await settle(advIqd, [L['MISSING.noacct']!])
    expect(a.status).toBe(422)
    expect(a.body.error.code).toBe('LINES_NEED_ACCOUNTING')
    expect(a.body.error.message).toMatch(/has no GL account/)
    const c = await settle(advIqd, [L['MISSING.nocc']!])
    expect(c.status).toBe(422)
    expect(c.body.error.message).toMatch(/has no cost center/)
  })

  it('refuses another company’s account with the plain reason', async () => {
    await makePO('FOREIGN', [{ key: 'one', account: foreignAccount }])
    const res = await settle(advIqd, [L['FOREIGN.one']!])
    expect(res.status).toBe(422)
    expect(res.body.error.message).toMatch(/not one of this company's accounts/)
  })

  it("refuses another company's cost center with the plain reason", async () => {
    await makePO('FOREIGNCC', [{ key: 'one', cc: foreignCc }])
    const res = await settle(advIqd, [L['FOREIGNCC.one']!])
    expect(res.status).toBe(422)
    expect(res.body.error.message).toMatch(/not one of this company's cost centers/)
    expect(await claimed([L['FOREIGNCC.one']!])).toBe(0)
  })

  it('names every offending line of a bundle in one answer, and refuses the whole bundle', async () => {
    await makePO('MIX', [
      { key: 'good' },
      { key: 'bad1', account: headerAccount },
      { key: 'bad2', account: null },
      { key: 'bad3', cc: null },
    ])
    const ids = ['good', 'bad1', 'bad2', 'bad3'].map((k) => L[`MIX.${k}`]!)
    const res = await settle(advIqd, ids)
    expect(res.status).toBe(422)
    expect(res.body.error.message).toMatch(/3 selected lines cannot be settled yet/)
    for (const n of ['line 2', 'line 3', 'line 4']) expect(res.body.error.message).toContain(n)
    expect(res.body.error.message).not.toContain('line 1 ') // the good one is not named
    expect(await claimed(ids)).toBe(0) // not even the good line
  })

  it('refuses when the advance’s OWN account is a header account', async () => {
    await makePO('ADVHDR', [{ key: 'one' }], { advance: advHeaderAcct })
    const res = await settle(advHeaderAcct, [L['ADVHDR.one']!])
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('ADVANCE_ACCOUNT_NOT_POSTABLE')
    expect(res.body.error.message).toMatch(/advance's own account cannot be posted to/)
    expect(res.body.error.message).toMatch(/9810/)
    expect(await claimed([L['ADVHDR.one']!])).toBe(0)
  })

  it('still settles good lines (nothing else changed)', async () => {
    await makePO('GOOD', [{ key: 'a', amount: 2000 }, { key: 'b', amount: 3000 }])
    const res = await settle(advIqd, [L['GOOD.a']!, L['GOOD.b']!])
    expect(res.status).toBe(201)
    expect(await claimed([L['GOOD.a']!, L['GOOD.b']!])).toBe(2)
  })
})

describe('Finance can change the account and cost center of a pending line from the advance', () => {
  it('fixes a header-account line, records old and new, and the line then settles on the new account', async () => {
    await makePO('FIX', [{ key: 'one', account: headerAccount, amount: 7000 }])
    expect((await settle(advIqd, [L['FIX.one']!])).status).toBe(422)

    const res = await putAccounting(advIqd, L['FIX.one']!, { gl_account_id: goodAccount2, cost_center_id: goodCc2 })
    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe(L['FIX.one'])
    expect(res.body.data.gl_account_id).toBe(goodAccount2)
    expect(res.body.data.cost_center_id).toBe(goodCc2)
    expect(res.body.data.account_code).toBe('9814')
    expect(res.body.data.account_problem).toBeNull()
    expect(res.body.data.cost_center_problem).toBeNull()

    const row = await lineRow(L['FIX.one']!)
    expect([row.account_id, row.cost_center_id]).toEqual([goodAccount2, goodCc2])
    const audit = await auditRows(L['FIX.one']!)
    expect(audit).toHaveLength(1)
    expect(audit[0]!.old_values).toEqual({ account_id: headerAccount, cost_center_id: goodCc })
    expect(audit[0]!.new_values).toMatchObject({ account_id: goodAccount2, cost_center_id: goodCc2, advance_id: advIqd })
    expect(audit[0]!.user_id).toBe(userId)
    expect(audit[0]!.company_id).toBe(TEST_COMPANY_ID)

    const settled = await settle(advIqd, [L['FIX.one']!])
    expect(settled.status).toBe(201)
    const debit = await pool.query<{ account_id: string }>(
      `SELECT jl.account_id FROM journal_lines jl JOIN advance_settlements s ON s.journal_entry_id = jl.journal_entry_id WHERE s.id=$1 AND jl.debit > 0`,
      [settled.body.data.id],
    )
    expect(debit.rows.map((r) => r.account_id)).toEqual([goodAccount2])
  })

  it('fills in a line that had no account or cost center at all', async () => {
    await makePO('FILL', [{ key: 'one', account: null, cc: null }])
    const res = await putAccounting(advIqd, L['FILL.one']!, { gl_account_id: goodAccount, cost_center_id: goodCc })
    expect(res.status).toBe(200)
    expect(res.body.data.account_problem).toBeNull()
    expect((await auditRows(L['FILL.one']!))[0]!.old_values).toEqual({ account_id: null, cost_center_id: null })
  })

  it('answers with the line that was changed, not the first line of the queue', async () => {
    // A PO whose number sorts after every other test PO, and the line changed is its SECOND line, so a reply that returned
    // "the first row of the queue" (or the first line of its PO) would be someone else's line.
    await makePO('ZZLAST', [{ key: 'first' }, { key: 'second', account: headerAccount }])
    const res = await putAccounting(advIqd, L['ZZLAST.second']!, { gl_account_id: goodAccount2, cost_center_id: goodCc2 })
    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe(L['ZZLAST.second'])
    expect(res.body.data.id).not.toBe(L['ZZLAST.first'])
    expect(res.body.data.account_code).toBe('9814')
  })

  it('the refreshed list shows the line fixed', async () => {
    await makePO('LIST', [{ key: 'one', account: headerAccount }])
    await putAccounting(advIqd, L['LIST.one']!, { gl_account_id: goodAccount, cost_center_id: goodCc })
    const row = (await queue(advIqd)).find((r) => r.id === L['LIST.one'])!
    expect([row.account_problem, row.account_code]).toEqual([null, '9811'])
  })
})

describe('what the change refuses, leaving the line exactly as it was', () => {
  const unchanged = async (key: string, account: string, cc: string) => {
    const row = await lineRow(L[key]!)
    expect([row.account_id, row.cost_center_id]).toEqual([account, cc])
    expect(await auditRows(L[key]!)).toHaveLength(0)
  }

  it('a header account (422), the same one the PO page used to offer', async () => {
    await makePO('R1', [{ key: 'one', account: goodAccount }])
    const res = await putAccounting(advIqd, L['R1.one']!, { gl_account_id: headerAccount, cost_center_id: goodCc })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('ACCOUNT_NOT_POSTABLE')
    expect(res.body.error.message).toMatch(/9810 .* is a header account and cannot be posted to: choose a postable account/)
    await unchanged('R1.one', goodAccount, goodCc)
  })

  it('a non-postable account that is not a header (422)', async () => {
    await makePO('R1B', [{ key: 'one' }])
    const res = await putAccounting(advIqd, L['R1B.one']!, { gl_account_id: nonPostableAccount, cost_center_id: goodCc })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('ACCOUNT_NOT_POSTABLE')
    await unchanged('R1B.one', goodAccount, goodCc)
  })

  it('an inactive account (400)', async () => {
    await makePO('R2', [{ key: 'one' }])
    const res = await putAccounting(advIqd, L['R2.one']!, { gl_account_id: inactiveAccount, cost_center_id: goodCc })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('ACCOUNT_INACTIVE')
    await unchanged('R2.one', goodAccount, goodCc)
  })

  it('another company’s account, and an account that does not exist (400)', async () => {
    await makePO('R3', [{ key: 'one' }])
    for (const id of [foreignAccount, '00000000-0000-0000-0000-00000000dead']) {
      const res = await putAccounting(advIqd, L['R3.one']!, { gl_account_id: id, cost_center_id: goodCc })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('INVALID_ACCOUNT')
    }
    await unchanged('R3.one', goodAccount, goodCc)
  })

  it('another company’s cost center, an inactive one, and one that does not exist (400)', async () => {
    await makePO('R4', [{ key: 'one' }])
    const foreign = await putAccounting(advIqd, L['R4.one']!, { gl_account_id: goodAccount2, cost_center_id: foreignCc })
    expect([foreign.status, foreign.body.error.code]).toEqual([400, 'INVALID_COST_CENTER'])
    const inactive = await putAccounting(advIqd, L['R4.one']!, { gl_account_id: goodAccount2, cost_center_id: inactiveCc })
    expect([inactive.status, inactive.body.error.code]).toEqual([400, 'COST_CENTER_INACTIVE'])
    const missing = await putAccounting(advIqd, L['R4.one']!, {
      gl_account_id: goodAccount2,
      cost_center_id: '00000000-0000-0000-0000-00000000dead',
    })
    expect([missing.status, missing.body.error.code]).toEqual([400, 'INVALID_COST_CENTER'])
    await unchanged('R4.one', goodAccount, goodCc) // not even the valid account of the same request was kept
  })

  it('a body without both fields (400)', async () => {
    await makePO('R5', [{ key: 'one' }])
    for (const body of [{}, { gl_account_id: goodAccount2 }, { cost_center_id: goodCc2 }, { gl_account_id: 'nope', cost_center_id: goodCc2 }]) {
      const res = await putAccounting(advIqd, L['R5.one']!, body)
      expect([res.status, res.body.error.code]).toEqual([400, 'VALIDATION'])
    }
    await unchanged('R5.one', goodAccount, goodCc)
  })

  it('a line that is not in THIS advance’s queue: another advance’s line, a PO still waiting for payment, a settled line (404)', async () => {
    await makePO('R6a', [{ key: 'one' }], { advance: advOther })
    await makePO('R6b', [{ key: 'one' }], { status: 'payment_pending' })
    await makePO('R6c', [{ key: 'one' }])
    const s = await settle(advIqd, [L['R6c.one']!])
    expect(s.status).toBe(201)
    for (const key of ['R6a.one', 'R6b.one', 'R6c.one']) {
      const res = await putAccounting(advIqd, L[key]!, { gl_account_id: goodAccount2, cost_center_id: goodCc2 })
      expect([res.status, res.body.error.code], key).toEqual([404, 'LINE_NOT_PENDING'])
      const row = await lineRow(L[key]!)
      expect([row.account_id, row.cost_center_id], key).toEqual([goodAccount, goodCc])
    }
  })

  it('a line claimed by a settlement while the change is waiting is not overwritten', async () => {
    await makePO('RACE', [{ key: 'one' }])
    const other = await pool.connect()
    try {
      await other.query('BEGIN')
      await other.query(`SELECT id FROM po_lines WHERE id = $1 FOR UPDATE`, [L['RACE.one']])
      let finished = false
      const pending = putAccounting(advIqd, L['RACE.one']!, { gl_account_id: goodAccount2, cost_center_id: goodCc2 }).then((r) => {
        finished = true
        return r
      })
      await new Promise((r) => setTimeout(r, 500))
      expect(finished).toBe(false) // the change waits for the line
      const settlement = await other.query<{ id: string }>(
        `INSERT INTO advance_settlements (company_id, settlement_number, advance_id, employee_id, employee_name, currency_code, total_amount, status)
         VALUES ($1,$2,$3,$4,'Line Acct','IQD',1000,'approved') RETURNING id`,
        [TEST_COMPANY_ID, `${PREFIX}RACE-SET`, advIqd, employeeId],
      )
      await other.query(`UPDATE po_lines SET advance_settlement_id = $1 WHERE id = $2`, [settlement.rows[0]!.id, L['RACE.one']])
      await other.query('COMMIT')
      const res = await pending
      expect([res.status, res.body.error.code]).toEqual([404, 'LINE_NOT_PENDING'])
    } finally {
      await other.query('ROLLBACK').catch(() => undefined)
      other.release()
    }
    const row = await lineRow(L['RACE.one']!)
    expect([row.account_id, row.cost_center_id]).toEqual([goodAccount, goodCc])
    expect(await auditRows(L['RACE.one']!)).toHaveLength(0)
  })
})

describe('who may change it', () => {
  it('someone holding finance.ap.approve (the gate of the PO page’s own account picker) can, and nothing else is needed', async () => {
    await makePO('P1', [{ key: 'one', account: headerAccount }])
    const res = await putAccounting(advIqd, L['P1.one']!, { gl_account_id: goodAccount, cost_center_id: goodCc }, approverToken)
    expect(res.status).toBe(200)
    expect((await lineRow(L['P1.one']!)).account_id).toBe(goodAccount)
  })

  it('an advances editor who can settle but does not hold finance.ap.approve cannot (403), nor can a viewer', async () => {
    await makePO('P2', [{ key: 'one', account: headerAccount }])
    for (const token of [editorToken, viewerToken]) {
      const res = await putAccounting(advIqd, L['P2.one']!, { gl_account_id: goodAccount, cost_center_id: goodCc }, token)
      expect(res.status).toBe(403)
    }
    expect((await lineRow(L['P2.one']!)).account_id).toBe(headerAccount)
    expect(await auditRows(L['P2.one']!)).toHaveLength(0)
  })

  it('another company’s administrator gets Not found, even with accounts of their own, and nothing changes', async () => {
    await makePO('P3', [{ key: 'one', account: headerAccount }])
    const res = await putAccounting(advIqd, L['P3.one']!, { gl_account_id: foreignAccount, cost_center_id: foreignCc }, outsiderToken)
    expect(res.status).toBe(404)
    const row = await lineRow(L['P3.one']!)
    expect([row.account_id, row.cost_center_id]).toEqual([headerAccount, goodCc])
  })
})
