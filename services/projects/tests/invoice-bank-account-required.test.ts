// A wire-transfer invoice must have an active bank account before it moves forward (submit for review, approve, issue).
//
// Regression background: nothing sets an invoice's bank account when it is created, so someone has to pick one on the
// invoice page. When nobody did, the "Banking Information" block silently disappeared from the preview and the print while
// "Please transfer payment within 30 days" stayed (NY-INV-2026-0004 went out and was paid without banking details;
// AW-INV-2026-0001 was heading the same way). A cash invoice needs no account.
//
// Real Postgres through the real routes (supertest).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createHash } from 'crypto'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { pool } from '@fnc-erp/db'
import { hashPassword, signAccessToken } from '@fnc-erp/auth'
import { createTestUser, cleanProjectsData, TEST_COMPANY_ID } from './setup.js'

const app = createApp()
const OTHER_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const REFRESH_HASH = 'test-refresh-hash-projects-invbank'
const OUTSIDER_EMAIL = 'inv-bank-outsider@fnc-erp.local'
const BANK_NAME = 'TEST-BANK-RULE'

let adminToken: string
let adminId: string
let outsiderToken: string
let projectId: string
let contractId: string
let bankId: string
let counter = 0

async function makeOutsider(): Promise<string> {
  const passwordHash = await hashPassword('TestPass123!')
  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, first_name, last_name) VALUES ($1,$2,'Out','Sider')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [OUTSIDER_EMAIL, passwordHash],
  )
  const userId = u.rows[0]!.id
  await pool.query(
    `INSERT INTO user_company_roles (user_id, company_id, role, module) VALUES ($1,$2,'company_admin','all') ON CONFLICT DO NOTHING`,
    [userId, OTHER_COMPANY_ID],
  )
  const token = signAccessToken({ userId, companyId: OTHER_COMPANY_ID, role: 'company_admin', module: 'all', sessionId: 'test-session' })
  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, refresh_token_hash, expires_at, refresh_expires_at)
     VALUES ($1,$2,$3,NOW() + INTERVAL '1 hour',NOW() + INTERVAL '7 days') ON CONFLICT DO NOTHING`,
    [userId, createHash('sha256').update(token).digest('hex'), `${REFRESH_HASH}-${userId}`],
  )
  return token
}

async function cleanInvoices(): Promise<void> {
  await pool.query(
    `DELETE FROM project_invoice_lines WHERE invoice_id IN (SELECT id FROM project_invoices WHERE company_id=$1)`,
    [TEST_COMPANY_ID],
  )
  await pool.query(`DELETE FROM project_invoices WHERE company_id=$1`, [TEST_COMPANY_ID])
}

async function cleanAll(): Promise<void> {
  await cleanInvoices()
  await pool.query(`DELETE FROM project_contracts WHERE company_id=$1`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM user_company_roles WHERE user_id IN (SELECT id FROM users WHERE email=$1)`, [OUTSIDER_EMAIL])
  await pool.query(`DELETE FROM sessions WHERE refresh_token_hash LIKE $1`, [`${REFRESH_HASH}%`])
  await pool.query(`DELETE FROM users WHERE email=$1`, [OUTSIDER_EMAIL])
  await cleanProjectsData() // also removes the TEST-BANK-% accounts nothing points at
}

beforeAll(async () => {
  await pool.query(`DELETE FROM sessions WHERE refresh_token_hash = 'test-refresh-hash-projects'`)
  const admin = await createTestUser()
  adminToken = admin.token
  adminId = admin.userId
  outsiderToken = await makeOutsider()

  const p = await request(app)
    .post('/projects')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ code: 'TEST-INVBANK-1', name: 'Bank rule project', project_type: 'construction', budget_amount: 1_000_000, budget_currency: 'IQD' })
  projectId = p.body.data?.id ?? p.body.id
  expect(projectId, JSON.stringify(p.body)).toBeTruthy()
  const c = await request(app)
    .post('/projects/contracts')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      project_id: projectId,
      contract_number: 'CNT-INVBANK-001',
      contract_name: 'Bank rule contract',
      client_name: 'Test Client',
      contract_value: 1_000_000,
      currency_code: 'IQD',
      default_billing_method: 'milestone',
      retention_pct: 0,
      payment_terms_days: 30,
      contract_date: '2026-01-01',
    })
  contractId = c.body.data?.id ?? c.body.id
  expect(contractId, JSON.stringify(c.body)).toBeTruthy()

  await pool.query(`DELETE FROM bank_accounts WHERE account_name = $1`, [BANK_NAME])
  bankId = (
    await pool.query<{ id: string }>(
      `INSERT INTO bank_accounts (account_name, bank_name, currency_code, is_active) VALUES ($1,'Test Bank','IQD',true) RETURNING id`,
      [BANK_NAME],
    )
  ).rows[0]!.id
})

afterAll(async () => {
  await cleanAll()
  await pool.end()
})

beforeEach(async () => {
  await cleanInvoices()
  await pool.query(`UPDATE bank_accounts SET is_active = true WHERE id = $1`, [bankId])
})

// An invoice with one manual line, in the given status; wire transfer with no account unless told otherwise.
async function makeInvoice(opts: { status?: string; paymentType?: string; bank?: boolean } = {}): Promise<string> {
  counter += 1
  const inv = await pool.query<{ id: string }>(
    `INSERT INTO project_invoices (contract_id, project_id, company_id, invoice_number, billing_method, invoice_date, due_date,
                                   created_by, status, payment_type, bank_account_id)
     VALUES ($1,$2,$3,$4,'milestone','2026-03-01','2026-04-01',$5,$6,$7,$8) RETURNING id`,
    [
      contractId,
      projectId,
      TEST_COMPANY_ID,
      `INV-BANK-${Date.now()}-${counter}`,
      adminId,
      opts.status ?? 'draft',
      opts.paymentType ?? 'wire_transfer',
      opts.bank ? bankId : null,
    ],
  )
  const id = inv.rows[0]!.id
  await pool.query(
    `INSERT INTO project_invoice_lines (invoice_id, line_number, description, source_type, qty, unit_cost, subtotal, line_total)
     VALUES ($1,1,'Cement','manual',1,100,100,100)`,
    [id],
  )
  return id
}

const post = (path: string, token = adminToken) =>
  request(app).post(`/projects/invoices${path}`).set('Authorization', `Bearer ${token}`).send({})
const statusOf = async (id: string) =>
  (await pool.query<{ status: string }>(`SELECT status FROM project_invoices WHERE id=$1`, [id])).rows[0]!.status

describe('submit for review', () => {
  it('refuses a wire-transfer invoice with no bank account, says why, and leaves it a draft', async () => {
    const id = await makeInvoice()
    const res = await post(`/${id}/submit-for-review`)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('BANK_ACCOUNT_REQUIRED')
    expect(res.body.error.message).toMatch(/Choose a bank account for this invoice/)
    expect(await statusOf(id)).toBe('draft')
  })

  it('lets it through once an active account is chosen', async () => {
    const id = await makeInvoice({ bank: true })
    const res = await post(`/${id}/submit-for-review`)
    expect(res.status).toBe(200)
    expect(await statusOf(id)).toBe('review')
  })

  it('needs no account for a cash invoice', async () => {
    const id = await makeInvoice({ paymentType: 'cash' })
    expect((await post(`/${id}/submit-for-review`)).status).toBe(200)
    expect(await statusOf(id)).toBe('review')
  })

  it('refuses an account that has been deactivated, with its own message', async () => {
    const id = await makeInvoice({ bank: true })
    await pool.query(`UPDATE bank_accounts SET is_active = false WHERE id = $1`, [bankId])
    const res = await post(`/${id}/submit-for-review`)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('BANK_ACCOUNT_REQUIRED')
    expect(res.body.error.message).toMatch(/no longer active/)
    expect(await statusOf(id)).toBe('draft')
  })

  it('still gives the wrong-status answer first for an invoice that is not a draft', async () => {
    const id = await makeInvoice({ status: 'review' })
    const res = await post(`/${id}/submit-for-review`)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('INVALID_STATUS')
  })

  it("does not leak another company's invoice: the answer is the ordinary not-a-draft one", async () => {
    const id = await makeInvoice()
    const res = await post(`/${id}/submit-for-review`, outsiderToken)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('INVALID_STATUS')
    expect(await statusOf(id)).toBe('draft')
  })
})

describe('approve', () => {
  it('refuses an invoice in review whose account was cleared after it was submitted', async () => {
    const id = await makeInvoice({ status: 'review' })
    const res = await post(`/${id}/approve`)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('BANK_ACCOUNT_REQUIRED')
    expect(await statusOf(id)).toBe('review')
  })

  it('approves it once the account is back', async () => {
    const id = await makeInvoice({ status: 'review', bank: true })
    expect((await post(`/${id}/approve`)).status).toBe(200)
    expect(await statusOf(id)).toBe('approved')
  })

  it('needs no account for a cash invoice', async () => {
    const id = await makeInvoice({ status: 'review', paymentType: 'cash' })
    expect((await post(`/${id}/approve`)).status).toBe(200)
  })

  it('still gives the wrong-status answer first for a draft', async () => {
    const id = await makeInvoice()
    const res = await post(`/${id}/approve`)
    expect(res.body.error.code).toBe('INVALID_STATUS')
  })
})

describe('issue', () => {
  it('refuses an approved invoice with no usable account, and leaves it approved', async () => {
    const none = await makeInvoice({ status: 'approved' })
    const res = await post(`/${none}/issue`)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('BANK_ACCOUNT_REQUIRED')
    expect(await statusOf(none)).toBe('approved')

    const inactive = await makeInvoice({ status: 'approved', bank: true })
    await pool.query(`UPDATE bank_accounts SET is_active = false WHERE id = $1`, [bankId])
    const res2 = await post(`/${inactive}/issue`)
    expect(res2.status).toBe(409)
    expect(res2.body.error.code).toBe('BANK_ACCOUNT_REQUIRED')
    expect(await statusOf(inactive)).toBe('approved')
  })

  it('still gives the wrong-status answer first for an invoice that is not approved', async () => {
    const id = await makeInvoice({ status: 'review' })
    const res = await post(`/${id}/issue`)
    expect(res.body.error.code).not.toBe('BANK_ACCOUNT_REQUIRED')
  })
})
