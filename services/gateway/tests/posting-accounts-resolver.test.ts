// G1/G2: the shared posting-account resolver (packages/db/src/posting-accounts.ts)
// that replaces every "guess a GL account by prefix/code/name" producer.
// Real-Postgres pattern — the uniqueness/validation guarantees live in
// migration 303's indexes and trigger, which a mocked DB can't exercise.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import {
  resolvePostingAccount,
  upsertCompanyPostingAccount,
  deleteCompanyPostingAccount,
  listCompanyPostingAccounts,
  PostingAccountNotConfiguredError,
} from '@fnc-erp/db'

const COMPANY_A = '00000000-0000-0000-0000-000000000001'
const COMPANY_B = '00000000-0000-0000-0000-000000000002'
const TEST_USER_EMAIL = 'posting-accounts-resolver-test@fnc-erp.local'

let userId: string
let leafAccountA1: string
let leafAccountA2: string
let headerAccountA: string
let leafAccountB: string

async function cleanup(): Promise<void> {
  await pool.query(`DELETE FROM company_posting_accounts WHERE company_id IN ($1,$2)`, [
    COMPANY_A,
    COMPANY_B,
  ])
}

beforeAll(async () => {
  const userR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [TEST_USER_EMAIL],
  )
  userId = userR.rows[0]!.id

  const leafA = await pool.query<{ id: string }>(
    `SELECT id FROM chart_of_accounts WHERE company_id=$1 AND is_postable=true AND is_active=true ORDER BY code LIMIT 2`,
    [COMPANY_A],
  )
  leafAccountA1 = leafA.rows[0]!.id
  leafAccountA2 = leafA.rows[1]!.id

  const headerA = await pool.query<{ id: string }>(
    `SELECT id FROM chart_of_accounts WHERE company_id=$1 AND is_header=true LIMIT 1`,
    [COMPANY_A],
  )
  headerAccountA = headerA.rows[0]!.id

  const leafB = await pool.query<{ id: string }>(
    `SELECT id FROM chart_of_accounts WHERE company_id=$1 AND is_postable=true AND is_active=true LIMIT 1`,
    [COMPANY_B],
  )
  leafAccountB = leafB.rows[0]!.id

  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email=$1`, [TEST_USER_EMAIL])
  await pool.end()
})

describe('resolvePostingAccount', () => {
  it('throws PostingAccountNotConfiguredError when nothing is configured and no override given', async () => {
    await expect(resolvePostingAccount(COMPANY_A, 'grni')).rejects.toThrow(
      PostingAccountNotConfiguredError,
    )
    await expect(resolvePostingAccount(COMPANY_A, 'grni')).rejects.toThrow(
      'POSTING_ACCOUNT_NOT_CONFIGURED: grni',
    )
  })

  it('returns a lineOverrideAccountId immediately, without needing any configured role', async () => {
    const result = await resolvePostingAccount(COMPANY_A, 'grni', {
      lineOverrideAccountId: leafAccountA1,
    })
    expect(result).toBe(leafAccountA1)
  })

  it('returns a categoryAccountId when no line override is given', async () => {
    const result = await resolvePostingAccount(COMPANY_A, 'grni', {
      categoryAccountId: leafAccountA2,
    })
    expect(result).toBe(leafAccountA2)
  })

  it('returns the configured company default once set', async () => {
    await upsertCompanyPostingAccount(COMPANY_A, 'cash', null, leafAccountA1, userId)
    const result = await resolvePostingAccount(COMPANY_A, 'cash')
    expect(result).toBe(leafAccountA1)
  })

  it('prefers a currency-specific override over the company default', async () => {
    await upsertCompanyPostingAccount(COMPANY_A, 'cash', null, leafAccountA1, userId)
    await upsertCompanyPostingAccount(COMPANY_A, 'cash', 'USD', leafAccountA2, userId)

    const defaultResult = await resolvePostingAccount(COMPANY_A, 'cash', { currencyCode: 'IQD' })
    expect(defaultResult).toBe(leafAccountA1)

    const usdResult = await resolvePostingAccount(COMPANY_A, 'cash', { currencyCode: 'USD' })
    expect(usdResult).toBe(leafAccountA2)
  })

  it('never crosses companies — a role configured for company A is not seen by company B', async () => {
    await upsertCompanyPostingAccount(COMPANY_A, 'ap', null, leafAccountA1, userId)
    await expect(resolvePostingAccount(COMPANY_B, 'ap')).rejects.toThrow(
      PostingAccountNotConfiguredError,
    )
  })
})

describe('upsertCompanyPostingAccount validation', () => {
  it('refuses an account that belongs to a different company', async () => {
    await expect(
      upsertCompanyPostingAccount(COMPANY_A, 'ar', null, leafAccountB, userId),
    ).rejects.toThrow(/belong to this company/)
  })

  it('refuses a header (non-postable) account', async () => {
    await expect(
      upsertCompanyPostingAccount(COMPANY_A, 'ar', null, headerAccountA, userId),
    ).rejects.toThrow(/postable/)
  })

  it('upserts in place on a second call for the same role+currency', async () => {
    await upsertCompanyPostingAccount(COMPANY_A, 'wht_payable', null, leafAccountA1, userId)
    await upsertCompanyPostingAccount(COMPANY_A, 'wht_payable', null, leafAccountA2, userId)
    const result = await resolvePostingAccount(COMPANY_A, 'wht_payable')
    expect(result).toBe(leafAccountA2)

    const rows = await pool.query(
      `SELECT count(*) AS n FROM company_posting_accounts WHERE company_id=$1 AND role='wht_payable'`,
      [COMPANY_A],
    )
    expect(Number(rows.rows[0]!.n)).toBe(1)
  })
})

describe('listCompanyPostingAccounts / deleteCompanyPostingAccount', () => {
  it('lists configured roles with the account code and name joined in', async () => {
    await upsertCompanyPostingAccount(COMPANY_A, 'interco_receivable', null, leafAccountA1, userId)
    const list = await listCompanyPostingAccounts(COMPANY_A)
    const row = list.find((r) => r.role === 'interco_receivable')
    expect(row).toBeTruthy()
    expect(row!.account_id).toBe(leafAccountA1)
    expect(row!.account_code).toBeTruthy()
  })

  it('removes a configured role', async () => {
    await upsertCompanyPostingAccount(COMPANY_A, 'stock_variance', null, leafAccountA1, userId)
    await deleteCompanyPostingAccount(COMPANY_A, 'stock_variance', null)
    await expect(resolvePostingAccount(COMPANY_A, 'stock_variance')).rejects.toThrow(
      PostingAccountNotConfiguredError,
    )
  })
})
