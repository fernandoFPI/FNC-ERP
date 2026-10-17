// G1/G2 settings screen backend: /finance/posting-accounts (list/upsert/delete
// the company_posting_accounts map). Real-Postgres, real-HTTP pattern,
// same as the rest of services/finance/tests.
import request from 'supertest'
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { pool } from '@fnc-erp/db'
import { createApp } from '../src/app.js'
import { createTestUser, TEST_COMPANY_ID } from './setup.js'

const app = createApp()
let token: string
let leafAccountId: string
let otherLeafAccountId: string

beforeAll(async () => {
  const user = await createTestUser()
  token = user.token

  const accounts = await pool.query<{ id: string }>(
    `SELECT id FROM chart_of_accounts WHERE company_id=$1 AND is_postable=true AND is_active=true ORDER BY code LIMIT 2`,
    [TEST_COMPANY_ID],
  )
  leafAccountId = accounts.rows[0]!.id
  otherLeafAccountId = accounts.rows[1]!.id
})

afterAll(async () => {
  await pool.query(`DELETE FROM company_posting_accounts WHERE company_id=$1`, [TEST_COMPANY_ID])
  await pool.query(`DELETE FROM sessions WHERE refresh_token_hash='test-refresh-hash-finance'`)
  await pool.query(`DELETE FROM users WHERE email='finance-test@fnc-erp.local'`)
})

describe('GET /finance/posting-accounts/roles', () => {
  it('lists the fixed role vocabulary', async () => {
    const res = await request(app)
      .get('/finance/posting-accounts/roles')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toContain('cash')
    expect(res.body.data).toContain('wht_payable')
  })
})

describe('PUT /finance/posting-accounts', () => {
  it('configures a role and it is then listed with the account code/name joined in', async () => {
    const putRes = await request(app)
      .put('/finance/posting-accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'ar', account_id: leafAccountId })
    expect(putRes.status).toBe(200)
    expect(putRes.body.data.role).toBe('ar')
    expect(putRes.body.data.account_id).toBe(leafAccountId)

    const listRes = await request(app)
      .get('/finance/posting-accounts')
      .set('Authorization', `Bearer ${token}`)
    const row = (listRes.body.data as { role: string; account_code: string }[]).find(
      (r) => r.role === 'ar',
    )
    expect(row).toBeTruthy()
    expect(row!.account_code).toBeTruthy()
  })

  it('upserts in place for the same role+currency rather than duplicating', async () => {
    await request(app)
      .put('/finance/posting-accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'cash', currency_code: 'usd', account_id: leafAccountId })
    await request(app)
      .put('/finance/posting-accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'cash', currency_code: 'USD', account_id: otherLeafAccountId })

    const count = await pool.query(
      `SELECT count(*) AS n FROM company_posting_accounts WHERE company_id=$1 AND role='cash' AND currency_code='USD'`,
      [TEST_COMPANY_ID],
    )
    expect(Number(count.rows[0]!.n)).toBe(1)

    const listRes = await request(app)
      .get('/finance/posting-accounts')
      .set('Authorization', `Bearer ${token}`)
    const row = (listRes.body.data as { role: string; currency_code: string | null; account_id: string }[]).find(
      (r) => r.role === 'cash' && r.currency_code === 'USD',
    )
    expect(row!.account_id).toBe(otherLeafAccountId)
  })

  it('rejects an unknown role', async () => {
    const res = await request(app)
      .put('/finance/posting-accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'not_a_real_role', account_id: leafAccountId })
    expect(res.status).toBe(400)
  })

  it('rejects an account from a different company', async () => {
    const otherCompany = await pool.query<{ id: string }>(
      `SELECT id FROM chart_of_accounts WHERE company_id <> $1 AND is_postable=true LIMIT 1`,
      [TEST_COMPANY_ID],
    )
    const res = await request(app)
      .put('/finance/posting-accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'ap', account_id: otherCompany.rows[0]!.id })
    expect(res.status).toBe(400)
  })
})

describe('DELETE /finance/posting-accounts/:role', () => {
  it('removes a configured role', async () => {
    await request(app)
      .put('/finance/posting-accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'grni', account_id: leafAccountId })

    const delRes = await request(app)
      .delete('/finance/posting-accounts/grni')
      .set('Authorization', `Bearer ${token}`)
    expect(delRes.status).toBe(200)

    const listRes = await request(app)
      .get('/finance/posting-accounts')
      .set('Authorization', `Bearer ${token}`)
    expect(
      (listRes.body.data as { role: string }[]).some((r) => r.role === 'grni'),
    ).toBe(false)
  })
})
