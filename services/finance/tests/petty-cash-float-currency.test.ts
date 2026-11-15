// A petty cash float's currency can be chosen when it is created and corrected afterwards, but only while the float has
// no history in its current currency (playbook #89).
//
// Before: the New Float form had no currency box and sent a hard-coded 'IQD', and the edit route ignored the field. Two
// USD floats on production (Nishtimani Yakam "Main Cash USD", Nishtimani Factory "Main Cash Box USD") were stored as IQD
// and nobody could change them. Real Postgres through the real routes (supertest).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createHash } from 'crypto'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { pool } from '@fnc-erp/db'
import { hashPassword, signAccessToken } from '@fnc-erp/auth'
import { TEST_COMPANY_ID, createTestUser, cleanFinanceData, getAccountId } from './setup.js'

const app = createApp()
const OTHER_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const REFRESH_HASH = 'test-refresh-hash-finance-floatcur'
const PREFIX = 'FLTCUR-'
const EMAIL = (tag: string) => `float-currency-${tag}@fnc-erp.local`

let adminToken = ''
let editorToken = ''
let viewerToken = ''
let outsiderToken = ''
let cashAccountId = ''
let foreignCashAccountId = ''
let advanceAccountId = ''
let employeeId = ''
let adminUserId = ''
let seq = 0

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` })

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
  const floats = `(SELECT id FROM petty_cash_floats WHERE name LIKE '${PREFIX}%')`
  await pool.query(`DELETE FROM audit_log WHERE record_id IN ${floats}`)
  await pool.query(`DELETE FROM employee_advances WHERE advance_number LIKE '${PREFIX}%'`)
  await pool.query(`DELETE FROM expense_claims WHERE claim_number LIKE '${PREFIX}%'`)
  await pool.query(`DELETE FROM payment_vouchers WHERE voucher_number LIKE '${PREFIX}%'`)
  await pool.query(`DELETE FROM petty_cash_transactions WHERE float_id IN ${floats}`)
  await pool.query(`DELETE FROM petty_cash_replenishments WHERE float_id IN ${floats}`)
  await pool.query(`DELETE FROM petty_cash_floats WHERE name LIKE '${PREFIX}%'`)
  await pool.query(`DELETE FROM employees WHERE employee_number LIKE '${PREFIX}%'`)
  await pool.query(`DELETE FROM chart_of_accounts WHERE name LIKE '${PREFIX}%'`)
  await pool.query(`DELETE FROM user_permissions WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'float-currency-%')`)
  await pool.query(`DELETE FROM users WHERE email LIKE 'float-currency-%'`)
  await pool.query(`DELETE FROM sessions WHERE refresh_token_hash LIKE $1`, [`${REFRESH_HASH}%`])
}

beforeAll(async () => {
  const admin = await createTestUser()
  adminToken = admin.token
  adminUserId = admin.userId
  await cleanFixtures()

  const editor = await makeUser(EMAIL('editor'), TEST_COMPANY_ID, 'user')
  editorToken = editor.token
  await grant(editor.userId, 'finance.petty_cash.edit', 'edit')
  await grant(editor.userId, 'finance.petty_cash.view', 'view')
  const viewer = await makeUser(EMAIL('viewer'), TEST_COMPANY_ID, 'user')
  viewerToken = viewer.token
  await grant(viewer.userId, 'finance.petty_cash.view', 'view')
  outsiderToken = (await makeUser(EMAIL('outsider'), OTHER_COMPANY_ID, 'company_admin')).token

  // a real, postable CASH account, like production's 1211 (see petty-cash.test.ts for why 1100 is set here)
  cashAccountId = await getAccountId('1100')
  await pool.query(`UPDATE chart_of_accounts SET account_category='CASH' WHERE id=$1`, [cashAccountId])
  advanceAccountId = await getAccountId('1200')
  foreignCashAccountId = (
    await pool.query<{ id: string }>(
      `INSERT INTO chart_of_accounts (company_id, code, name, account_type, account_category, is_postable, is_active)
       VALUES ($1,'9941-07',$2,'asset','CASH',true,true) RETURNING id`,
      // an active account needs a four-digit code (chk_code_format); the name is what cleanup finds it by
      [OTHER_COMPANY_ID, `${PREFIX}Foreign cashbox`],
    )
  ).rows[0]!.id
  employeeId = (
    await pool.query<{ id: string }>(
      `INSERT INTO employees (company_id, user_id, first_name, last_name, hire_date, employee_number)
       VALUES ($1,$2,'Float','Currency',CURRENT_DATE,$3) RETURNING id`,
      [TEST_COMPANY_ID, adminUserId, `${PREFIX}EMP`],
    )
  ).rows[0]!.id
})

afterAll(async () => {
  await cleanFixtures()
  await cleanFinanceData()
  await pool.end()
})

beforeEach(() => {
  seq += 1
})

// a new number on every call: two floats made in one test must not share a name (the name is unique per company)
const floatName = (tag: string) => `${PREFIX}${tag}-${(seq += 1)}`

async function createFloat(
  body: Record<string, unknown> = {},
  token = adminToken,
): Promise<{ id: string; currency_code: string; status: number }> {
  const res = await request(app)
    .post('/finance/petty-cash/floats')
    .set(bearer(token))
    .send({
      name: floatName('F'),
      authorized_limit: 1000,
      opening_balance: 400,
      gl_account_id: cashAccountId,
      ...body,
    })
  return { status: res.status, id: res.body.data?.id as string, currency_code: res.body.data?.currency_code as string }
}

// what the edit form sends: every field, because the route replaces them all
function editBody(f: { id: string }, over: Record<string, unknown> = {}) {
  return { name: `${PREFIX}edited-${f.id.slice(0, 6)}`, authorized_limit: 1000, gl_account_id: cashAccountId, ...over }
}
const put = (id: string, body: Record<string, unknown>, token = adminToken) =>
  request(app).put(`/finance/petty-cash/floats/${id}`).set(bearer(token)).send(body)

async function dbFloat(id: string) {
  return (await pool.query(`SELECT * FROM petty_cash_floats WHERE id = $1`, [id])).rows[0]!
}
async function auditRows(id: string) {
  return (
    await pool.query(
      `SELECT action, old_values, new_values, company_id, user_id FROM audit_log
        WHERE record_id = $1 AND action = 'petty_cash_float_currency_changed'`,
      [id],
    )
  ).rows
}
async function transactionRows(id: string) {
  return (await pool.query(`SELECT transaction_type, amount, balance_after FROM petty_cash_transactions WHERE float_id = $1 ORDER BY created_at`, [id]))
    .rows
}
async function listRow(id: string) {
  const res = await request(app).get('/finance/petty-cash/floats').set(bearer(adminToken))
  return (res.body.data as Array<{ id: string; has_activity: boolean; currency_code: string }>).find((f) => f.id === id)!
}

describe('creating a float', () => {
  it('stores the currency that was chosen', async () => {
    const f = await createFloat({ currency_code: 'USD' })
    expect(f.status).toBe(201)
    expect(f.currency_code).toBe('USD')
    expect((await dbFloat(f.id)).currency_code).toBe('USD')
  })

  it('upper-cases what was typed', async () => {
    const f = await createFloat({ currency_code: 'usd' })
    expect(f.status).toBe(201)
    expect((await dbFloat(f.id)).currency_code).toBe('USD')
  })

  it('still defaults to IQD for a caller that sends no currency', async () => {
    const f = await createFloat()
    expect(f.status).toBe(201)
    expect((await dbFloat(f.id)).currency_code).toBe('IQD')
  })

  it.each(['US', 'U$D', 'USDD', '', '123'])('refuses %j as a currency, and creates nothing', async (bad) => {
    const name = floatName('BAD')
    const res = await request(app)
      .post('/finance/petty-cash/floats')
      .set(bearer(adminToken))
      .send({ name, authorized_limit: 10, gl_account_id: cashAccountId, currency_code: bad })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('VALIDATION')
    expect(res.body.error.message).toMatch(/three-letter/)
    expect((await pool.query(`SELECT 1 FROM petty_cash_floats WHERE name = $1`, [name])).rowCount).toBe(0)
  })
})

describe('correcting the currency of a float that only holds its opening balance', () => {
  it('changes the currency and nothing else: balance, limit, opening row all stay', async () => {
    const f = await createFloat({ currency_code: 'IQD' })
    const res = await put(f.id, editBody(f, { currency_code: 'USD' }))
    expect(res.status).toBe(200)
    expect(res.body.data.currency_code).toBe('USD')

    const row = await dbFloat(f.id)
    expect(row.currency_code).toBe('USD')
    expect(Number(row.current_balance)).toBe(400)
    expect(Number(row.authorized_limit)).toBe(1000)
    expect((await transactionRows(f.id)).map((t) => [t.transaction_type, Number(t.amount), Number(t.balance_after)])).toEqual([
      ['opening', 400, 400],
    ])
  })

  it('writes one audit row with the old and the new currency, the company and the person', async () => {
    const f = await createFloat()
    await put(f.id, editBody(f, { currency_code: 'USD' }))
    const rows = await auditRows(f.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.old_values).toEqual({ currency_code: 'IQD' })
    expect(rows[0]!.new_values).toEqual({ currency_code: 'USD' })
    expect(rows[0]!.company_id).toBe(TEST_COMPANY_ID)
    expect(rows[0]!.user_id).toBe(adminUserId)
  })

  it('also works for a float created with no opening balance', async () => {
    const f = await createFloat({ opening_balance: 0 })
    expect((await transactionRows(f.id)).length).toBe(0)
    const res = await put(f.id, editBody(f, { currency_code: 'EUR' }))
    expect(res.status).toBe(200)
    expect((await dbFloat(f.id)).currency_code).toBe('EUR')
  })

  it('accepts a lower-case code', async () => {
    const f = await createFloat()
    expect((await put(f.id, editBody(f, { currency_code: 'usd' }))).status).toBe(200)
    expect((await dbFloat(f.id)).currency_code).toBe('USD')
  })

  it('refuses a malformed code and leaves the float as it was', async () => {
    const f = await createFloat()
    const res = await put(f.id, editBody(f, { currency_code: 'U$' }))
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('VALIDATION')
    expect((await dbFloat(f.id)).currency_code).toBe('IQD')
    expect(await auditRows(f.id)).toHaveLength(0)
  })

  it('keeps the stored currency when the request does not mention it (an older browser tab), with no audit row', async () => {
    const f = await createFloat({ currency_code: 'USD' })
    const res = await put(f.id, editBody(f, { authorized_limit: 2500 }))
    expect(res.status).toBe(200)
    const row = await dbFloat(f.id)
    expect(row.currency_code).toBe('USD')
    expect(Number(row.authorized_limit)).toBe(2500)
    expect(await auditRows(f.id)).toHaveLength(0)
  })

  it('writes no audit row when the same currency is sent back', async () => {
    const f = await createFloat({ currency_code: 'USD' })
    expect((await put(f.id, editBody(f, { currency_code: 'USD' }))).status).toBe(200)
    expect(await auditRows(f.id)).toHaveLength(0)
  })
})

describe('a float that already has history cannot change currency', () => {
  const expectLocked = async (f: { id: string }, wasCurrency = 'IQD') => {
    const res = await put(f.id, editBody(f, { currency_code: 'USD' }))
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('FLOAT_HAS_ACTIVITY')
    expect(res.body.error.message).toMatch(/Create a new float/)
    expect((await dbFloat(f.id)).currency_code).toBe(wasCurrency)
    expect(await auditRows(f.id)).toHaveLength(0)
  }

  it('after a spend', async () => {
    const f = await createFloat()
    const spend = await request(app)
      .post(`/finance/petty-cash/floats/${f.id}/spend`)
      .set(bearer(adminToken))
      .send({ transaction_date: '2026-11-15', description: 'Tea', amount: 25 })
    expect(spend.status).toBe(201)
    await expectLocked(f)
  })

  it('after a top-up request, even one nobody has approved yet', async () => {
    const f = await createFloat()
    const rep = await request(app)
      .post(`/finance/petty-cash/floats/${f.id}/replenish`)
      .set(bearer(adminToken))
      .send({ requested_amount: 50 })
    expect(rep.status).toBe(201)
    await expectLocked(f)
  })

  it('after an advance was issued from it', async () => {
    const f = await createFloat()
    await pool.query(
      `INSERT INTO employee_advances (company_id, advance_number, employee_id, employee_name, amount, cash_account_id, advance_account_id, petty_cash_float_id)
       VALUES ($1,$2,$3,'Float Currency',100,$4,$5,$6)`,
      [TEST_COMPANY_ID, `${PREFIX}ADV-${seq}`, employeeId, cashAccountId, advanceAccountId, f.id],
    )
    await expectLocked(f)
  })

  it('after an expense claim was paid from it', async () => {
    const f = await createFloat()
    await pool.query(
      `INSERT INTO expense_claims (company_id, claim_number, employee_id, employee_name, petty_cash_float_id)
       VALUES ($1,$2,$3,'Float Currency',$4)`,
      [TEST_COMPANY_ID, `${PREFIX}CLM-${seq}`, employeeId, f.id],
    )
    await expectLocked(f)
  })

  it('after a payment voucher was paid from it', async () => {
    const f = await createFloat()
    await pool.query(
      `INSERT INTO payment_vouchers (company_id, voucher_number, voucher_date, received_from, created_by, petty_cash_float_id)
       VALUES ($1,$2,CURRENT_DATE,'Someone',$3,$4)`,
      [TEST_COMPANY_ID, `${PREFIX}PV-${seq}`, adminUserId, f.id],
    )
    await expectLocked(f)
  })

  it('but everything else about it can still be edited, and the same currency can be sent back', async () => {
    const f = await createFloat({ currency_code: 'USD' })
    await request(app)
      .post(`/finance/petty-cash/floats/${f.id}/spend`)
      .set(bearer(adminToken))
      .send({ transaction_date: '2026-11-15', description: 'Tea', amount: 25 })
    const res = await put(f.id, editBody(f, { currency_code: 'USD', authorized_limit: 3000, notes: 'raised' }))
    expect(res.status).toBe(200)
    const row = await dbFloat(f.id)
    expect(row.currency_code).toBe('USD')
    expect(Number(row.authorized_limit)).toBe(3000)
    expect(row.notes).toBe('raised')
    expect(Number(row.current_balance)).toBe(375)
  })

  it('and a top-up that commits while the edit is waiting for the float is seen, not missed', async () => {
    const f = await createFloat()
    const other = await pool.connect()
    try {
      await other.query('BEGIN')
      await other.query(`SELECT id FROM petty_cash_floats WHERE id = $1 FOR UPDATE`, [f.id])
      let finished = false
      const pending = put(f.id, editBody(f, { currency_code: 'USD' })).then((r) => {
        finished = true
        return r
      })
      await new Promise((r) => setTimeout(r, 400))
      expect(finished).toBe(false) // the edit is waiting for the float's lock
      await other.query(
        `INSERT INTO petty_cash_replenishments (float_id, company_id, replenishment_number, requested_amount)
         VALUES ($1,$2,$3,10)`,
        [f.id, TEST_COMPANY_ID, `${PREFIX}R-${seq}`],
      )
      await other.query('COMMIT')
      const res = await pending
      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('FLOAT_HAS_ACTIVITY')
      expect((await dbFloat(f.id)).currency_code).toBe('IQD')
    } finally {
      await other.query('ROLLBACK').catch(() => undefined)
      other.release()
    }
  })
})

describe('the has_activity flag the screen reads', () => {
  it('is false for a float with only its opening balance and true once anything is recorded, in the list and the detail', async () => {
    const f = await createFloat()
    expect((await listRow(f.id)).has_activity).toBe(false)
    const detailBefore = await request(app).get(`/finance/petty-cash/floats/${f.id}`).set(bearer(adminToken))
    expect(detailBefore.body.data.has_activity).toBe(false)

    await request(app)
      .post(`/finance/petty-cash/floats/${f.id}/spend`)
      .set(bearer(adminToken))
      .send({ transaction_date: '2026-11-15', description: 'Tea', amount: 25 })
    expect((await listRow(f.id)).has_activity).toBe(true)
    const detailAfter = await request(app).get(`/finance/petty-cash/floats/${f.id}`).set(bearer(adminToken))
    expect(detailAfter.body.data.has_activity).toBe(true)
  })

  it('agrees with the edit route: a float flagged false can change currency, one flagged true cannot', async () => {
    const fresh = await createFloat()
    const used = await createFloat()
    await request(app)
      .post(`/finance/petty-cash/floats/${used.id}/replenish`)
      .set(bearer(adminToken))
      .send({ requested_amount: 5 })
    expect((await listRow(fresh.id)).has_activity).toBe(false)
    expect((await listRow(used.id)).has_activity).toBe(true)
    expect((await put(fresh.id, editBody(fresh, { currency_code: 'USD' }))).status).toBe(200)
    expect((await put(used.id, editBody(used, { currency_code: 'USD' }))).status).toBe(409)
  })
})

describe('who may change it', () => {
  it('a user who can only view floats is refused and nothing changes', async () => {
    const f = await createFloat()
    const res = await put(f.id, editBody(f, { currency_code: 'USD' }), viewerToken)
    expect(res.status).toBe(403)
    expect((await dbFloat(f.id)).currency_code).toBe('IQD')
  })

  it('a user holding finance.petty_cash.edit (and nothing else) can', async () => {
    const f = await createFloat()
    const res = await put(f.id, editBody(f, { currency_code: 'USD' }), editorToken)
    expect(res.status).toBe(200)
    expect((await dbFloat(f.id)).currency_code).toBe('USD')
  })

  it("another company's administrator gets Not found, even with a cash account of their own, and nothing changes", async () => {
    const f = await createFloat()
    const res = await put(f.id, editBody(f, { currency_code: 'USD', gl_account_id: foreignCashAccountId }), outsiderToken)
    expect(res.status).toBe(404)
    const row = await dbFloat(f.id)
    expect(row.currency_code).toBe('IQD')
    expect(row.gl_account_id).toBe(cashAccountId)
    expect(await auditRows(f.id)).toHaveLength(0)
  })
})
