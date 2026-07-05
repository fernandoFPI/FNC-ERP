import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { pool } from '@fnc-erp/db'
import {
  TEST_COMPANY_ID, createTestUser, cleanFinanceData, createOpenPeriod, getAccountId,
} from './setup.js'

const app = createApp()
let token: string
let testUserId: string

beforeAll(async () => {
  const user = await createTestUser()
  token = user.token
  testUserId = user.userId
})

afterAll(async () => {
  await cleanFinanceData()
  await pool.end()
})

// ── Health ────────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.service).toBe('finance')
  })
})

// ── Auth guard ────────────────────────────────────────────────────────────────

describe('Auth guard', () => {
  it('rejects requests without token', async () => {
    const res = await request(app).get('/finance/accounts')
    expect(res.status).toBe(401)
  })
})

// ── Chart of Accounts ─────────────────────────────────────────────────────────

describe('GET /finance/accounts', () => {
  it('returns seeded accounts for company', async () => {
    const res = await request(app)
      .get('/finance/accounts')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.length).toBeGreaterThan(0)
  })

  it('filters by account_type', async () => {
    const res = await request(app)
      .get('/finance/accounts?type=asset')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.every((a: { account_type: string }) => a.account_type === 'asset')).toBe(true)
  })
})

describe('GET /finance/accounts/:id', () => {
  it('returns 404 for unknown account', async () => {
    const res = await request(app)
      .get('/finance/accounts/00000000-0000-0000-0000-000000000099')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(404)
  })
})

// ── Accounting Periods ────────────────────────────────────────────────────────

describe('POST /finance/periods', () => {
  beforeEach(async () => {
    await pool.query(`DELETE FROM accounting_periods WHERE company_id = $1`, [TEST_COMPANY_ID])
  })

  it('creates a period', async () => {
    const res = await request(app)
      .post('/finance/periods')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Jan 2025', start_date: '2025-01-01', end_date: '2025-01-31' })
    expect(res.status).toBe(201)
    expect(res.body.data.status).toBe('open')
  })

  it('rejects start_date >= end_date', async () => {
    const res = await request(app)
      .post('/finance/periods')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Bad Period', start_date: '2025-01-31', end_date: '2025-01-01' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_DATES')
  })

  it('cannot close period with draft journals', async () => {
    const period = await pool.query<{ id: string }>(
      `INSERT INTO accounting_periods (company_id, name, start_date, end_date) VALUES ($1,'Test','2025-01-01','2025-01-31') RETURNING id`,
      [TEST_COMPANY_ID],
    )
    const periodId = period.rows[0]!.id

    // Create a draft journal in this period
    const acctId = await getAccountId('1100')
    const acctId2 = await getAccountId('3100')
    await pool.query(
      `INSERT INTO journal_entries (company_id, reference, entry_date, status, created_by) VALUES ($1,'TEST-001','2025-01-15','draft',$2)`,
      [TEST_COMPANY_ID, testUserId],
    )
    const je = await pool.query<{ id: string }>(
      `SELECT id FROM journal_entries WHERE company_id = $1 AND reference = 'TEST-001'`,
      [TEST_COMPANY_ID],
    )
    await pool.query(
      `INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, amount_company_currency) VALUES ($1,$2,1000,0,1000),($1,$3,0,1000,1000)`,
      [je.rows[0]!.id, acctId, acctId2],
    )

    const res = await request(app)
      .post(`/finance/periods/${periodId}/close`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('DRAFT_JOURNALS_EXIST')
  })
})

// ── Journal Entries ───────────────────────────────────────────────────────────

describe('Journal entries', () => {
  beforeEach(async () => {
    await pool.query(`DELETE FROM journal_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE company_id = $1)`, [TEST_COMPANY_ID])
    await pool.query(`DELETE FROM journal_entries WHERE company_id = $1`, [TEST_COMPANY_ID])
    await pool.query(`DELETE FROM accounting_periods WHERE company_id = $1`, [TEST_COMPANY_ID])
    await createOpenPeriod()
  })

  it('POST /finance/journals — creates balanced draft entry', async () => {
    const debitAcct = await getAccountId('5200')
    const creditAcct = await getAccountId('2100')

    const res = await request(app)
      .post('/finance/journals')
      .set('Authorization', `Bearer ${token}`)
      .send({
        reference: 'TEST-JE-001',
        entry_date: '2025-01-15',
        lines: [
          { account_id: debitAcct, debit: 500, credit: 0 },
          { account_id: creditAcct, debit: 0, credit: 500 },
        ],
      })
    expect(res.status).toBe(201)
    expect(res.body.data.status).toBe('draft')
    expect(res.body.data.lines).toHaveLength(2)
  })

  it('POST /finance/journals — rejects unbalanced entry', async () => {
    const debitAcct = await getAccountId('5200')
    const creditAcct = await getAccountId('2100')

    const res = await request(app)
      .post('/finance/journals')
      .set('Authorization', `Bearer ${token}`)
      .send({
        reference: 'TEST-JE-BAD',
        entry_date: '2025-01-15',
        lines: [
          { account_id: debitAcct, debit: 600, credit: 0 },
          { account_id: creditAcct, debit: 0, credit: 500 },
        ],
      })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('UNBALANCED_ENTRY')
  })

  it('POST /finance/journals — rejects when no open period', async () => {
    await pool.query(`DELETE FROM accounting_periods WHERE company_id = $1`, [TEST_COMPANY_ID])
    const debitAcct = await getAccountId('5200')
    const creditAcct = await getAccountId('2100')

    const res = await request(app)
      .post('/finance/journals')
      .set('Authorization', `Bearer ${token}`)
      .send({
        reference: 'TEST-JE-NOPERIOD',
        entry_date: '2025-01-15',
        lines: [
          { account_id: debitAcct, debit: 100, credit: 0 },
          { account_id: creditAcct, debit: 0, credit: 100 },
        ],
      })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('NO_OPEN_PERIOD')
  })

  it('POST /finance/journals/:id/post — posts a draft entry', async () => {
    const debitAcct = await getAccountId('5200')
    const creditAcct = await getAccountId('2100')

    const createRes = await request(app)
      .post('/finance/journals')
      .set('Authorization', `Bearer ${token}`)
      .send({
        reference: 'TEST-POST-001',
        entry_date: '2025-01-15',
        lines: [
          { account_id: debitAcct, debit: 250, credit: 0 },
          { account_id: creditAcct, debit: 0, credit: 250 },
        ],
      })
    const jeId = (createRes.body.data as { id: string }).id

    const postRes = await request(app)
      .post(`/finance/journals/${jeId}/post`)
      .set('Authorization', `Bearer ${token}`)
    expect(postRes.status).toBe(200)
    expect(postRes.body.data.status).toBe('posted')
  })

  it('POST /finance/journals/:id/cancel — creates reversal for posted entry', async () => {
    const debitAcct = await getAccountId('5200')
    const creditAcct = await getAccountId('2100')

    const createRes = await request(app)
      .post('/finance/journals')
      .set('Authorization', `Bearer ${token}`)
      .send({
        reference: 'TEST-CANCEL-001',
        entry_date: '2025-01-15',
        lines: [
          { account_id: debitAcct, debit: 100, credit: 0 },
          { account_id: creditAcct, debit: 0, credit: 100 },
        ],
      })
    const jeId = (createRes.body.data as { id: string }).id

    await request(app).post(`/finance/journals/${jeId}/post`).set('Authorization', `Bearer ${token}`)
    const cancelRes = await request(app).post(`/finance/journals/${jeId}/cancel`).set('Authorization', `Bearer ${token}`)
    expect(cancelRes.status).toBe(200)
    expect(cancelRes.body.data.status).toBe('cancelled')

    // Verify reversal entry was created
    const reversals = await pool.query(
      `SELECT * FROM journal_entries WHERE source_type = 'cancellation' AND source_id = $1`,
      [jeId],
    )
    expect(reversals.rows).toHaveLength(1)
  })
})

// ── Reports ───────────────────────────────────────────────────────────────────

describe('GET /finance/reports/trial-balance', () => {
  it('returns trial balance data', async () => {
    const res = await request(app)
      .get('/finance/reports/trial-balance')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})
