import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { pool } from '@fnc-erp/db'
import {
  TEST_COMPANY_A, TEST_COMPANY_B, createTestUser, cleanIntercoData, getAccountId, ensureOpenPeriods,
} from './setup.js'

const app = createApp()
let token: string
let fromDebitAcct: string
let fromCreditAcct: string
let toDebitAcct: string
let toCreditAcct: string

beforeAll(async () => {
  const user = await createTestUser()
  token = user.token
  await ensureOpenPeriods()
  fromDebitAcct = await getAccountId(TEST_COMPANY_A, '5200')
  fromCreditAcct = await getAccountId(TEST_COMPANY_A, '2100')
  toDebitAcct = await getAccountId(TEST_COMPANY_B, '1100')
  toCreditAcct = await getAccountId(TEST_COMPANY_B, '4100')
})

afterAll(async () => {
  await cleanIntercoData()
  await pool.end()
})

beforeEach(async () => {
  await pool.query(`DELETE FROM interco_transactions WHERE from_company_id = $1 OR to_company_id = $1`, [TEST_COMPANY_A])
  await pool.query(`DELETE FROM journal_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE company_id IN ($1,$2) AND source_type = 'interco')`, [TEST_COMPANY_A, TEST_COMPANY_B])
  await pool.query(`DELETE FROM journal_entries WHERE company_id IN ($1,$2) AND source_type = 'interco'`, [TEST_COMPANY_A, TEST_COMPANY_B])
})

// ── Health ─────────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.service).toBe('interco')
  })
})

// ── Interco Transactions ───────────────────────────────────────────────────────

describe('POST /interco/transactions', () => {
  const txPayload = () => ({
    to_company_id: TEST_COMPANY_B,
    transaction_type: 'service_charge',
    amount: 100000,
    currency_code: 'IQD',
    description: 'Management fee Q1 2025',
    entry_date: '2025-01-15',
    from_debit_account_id: fromDebitAcct,
    from_credit_account_id: fromCreditAcct,
    to_debit_account_id: toDebitAcct,
    to_credit_account_id: toCreditAcct,
  })

  it('creates interco transaction and posts dual journal entries atomically', async () => {
    const res = await request(app)
      .post('/interco/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send(txPayload())
    expect(res.status).toBe(201)
    expect(res.body.data.status).toBe('posted')
    expect(res.body.data.from_journal_entry_id).toBeTruthy()
    expect(res.body.data.to_journal_entry_id).toBeTruthy()

    // Verify both journal entries were posted in the DB
    const fromJE = await pool.query(
      `SELECT status FROM journal_entries WHERE id = $1`,
      [res.body.data.from_journal_entry_id],
    )
    const toJE = await pool.query(
      `SELECT status FROM journal_entries WHERE id = $1`,
      [res.body.data.to_journal_entry_id],
    )
    expect((fromJE.rows[0] as { status: string }).status).toBe('posted')
    expect((toJE.rows[0] as { status: string }).status).toBe('posted')
  })

  it('rejects same-company transaction', async () => {
    const res = await request(app)
      .post('/interco/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...txPayload(), to_company_id: TEST_COMPANY_A })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('SAME_COMPANY')
  })

  it('rejects when no open period exists', async () => {
    await pool.query(`DELETE FROM accounting_periods WHERE company_id = $1`, [TEST_COMPANY_B])
    const res = await request(app)
      .post('/interco/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send(txPayload())
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('NO_OPEN_PERIOD')
    // Restore period
    await pool.query(
      `INSERT INTO accounting_periods (company_id, name, start_date, end_date, status) VALUES ($1,'Test Period 2025-01','2025-01-01','2025-01-31','open') ON CONFLICT DO NOTHING`,
      [TEST_COMPANY_B],
    )
  })

  it('GET /interco/transactions — returns own transactions', async () => {
    await request(app)
      .post('/interco/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send(txPayload())
    const res = await request(app)
      .get('/interco/transactions')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.length).toBeGreaterThan(0)
  })

  it('POST /interco/transactions/:id/cancel — cancels both journal entries', async () => {
    const createRes = await request(app)
      .post('/interco/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send(txPayload())
    const txId = (createRes.body.data as { id: string }).id
    const fromJEId = (createRes.body.data as { from_journal_entry_id: string }).from_journal_entry_id

    const cancelRes = await request(app)
      .post(`/interco/transactions/${txId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
    expect(cancelRes.status).toBe(200)
    expect(cancelRes.body.data.status).toBe('cancelled')

    const je = await pool.query(`SELECT status FROM journal_entries WHERE id = $1`, [fromJEId])
    expect((je.rows[0] as { status: string }).status).toBe('cancelled')
  })
})
