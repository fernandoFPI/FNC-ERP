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
import { resolvers } from '../src/graphql/resolvers.js'

const COMPANY_A = 'f0000000-0000-0000-0000-000000000009'
const COMPANY_B = 'f0000000-0000-0000-0000-000000000010'
const TEST_USER_EMAIL = 'posting-accounts-resolver-test@fnc-erp.local'

let userId: string
let leafAccountA1: string
let leafAccountA2: string
let headerAccountA: string
let leafAccountB: string
// Set only when this suite had to create its own header account (see beforeAll).
let createdHeaderAccountId: string | null = null

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

  // The v1.0 chart's header accounts only exist where migrations 244/248 ran
  // against existing companies. A database built fresh from migrations + seeds
  // (CI) has leaf accounts only, so create a throwaway header in that case.
  const headerA = await pool.query<{ id: string }>(
    `SELECT id FROM chart_of_accounts WHERE company_id=$1 AND is_header=true LIMIT 1`,
    [COMPANY_A],
  )
  if (headerA.rows[0]) {
    headerAccountA = headerA.rows[0].id
  } else {
    const made = await pool.query<{ id: string }>(
      `INSERT INTO chart_of_accounts (company_id, code, name, account_type, is_header, is_postable)
       VALUES ($1,'9990','Posting accounts test header','asset',true,false) RETURNING id`,
      [COMPANY_A],
    )
    headerAccountA = made.rows[0]!.id
    createdHeaderAccountId = headerAccountA
  }

  const leafB = await pool.query<{ id: string }>(
    `SELECT id FROM chart_of_accounts WHERE company_id=$1 AND is_postable=true AND is_active=true LIMIT 1`,
    [COMPANY_B],
  )
  leafAccountB = leafB.rows[0]!.id

  await cleanup()
})

afterAll(async () => {
  await cleanup()
  if (createdHeaderAccountId) {
    await pool.query(`DELETE FROM chart_of_accounts WHERE id=$1`, [createdHeaderAccountId])
  }
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

// Settings screen plumbing: the GraphQL layer on top of the same db
// functions above. Scoping (never a client-supplied company id),
// permission gating, and the readiness summary are resolver-only concerns
// not exercised by the db-level tests above.
describe('GraphQL: companyPostingAccounts / upsertCompanyPostingAccount / deleteCompanyPostingAccount / postingAccountReadiness', () => {
  const adminCtx = () =>
    ({
      auth: { companyId: COMPANY_A, userId, role: 'company_admin', module: 'all', sessionId: 'pa-resolver-test' },
    }) as never
  const noPermCtx = () =>
    ({
      auth: { companyId: COMPANY_A, userId, role: 'employee', module: 'finance', sessionId: 'pa-resolver-test-noperm' },
    }) as never

  it('set then list: upsertCompanyPostingAccount followed by companyPostingAccounts shows it', async () => {
    const set = (await resolvers.Mutation.upsertCompanyPostingAccount(
      null,
      { role: 'ar', currencyCode: null, accountId: leafAccountA1 },
      adminCtx(),
    )) as { role: string; accountId: string; currencyCode: string | null }
    expect(set.role).toBe('ar')
    expect(set.accountId).toBe(leafAccountA1)
    expect(set.currencyCode).toBeNull()

    const list = (await resolvers.Query.companyPostingAccounts(null, {}, adminCtx())) as {
      role: string
      accountId: string
    }[]
    expect(list.find((r) => r.role === 'ar')?.accountId).toBe(leafAccountA1)
  })

  it('clear: deleteCompanyPostingAccount removes it, resolvePostingAccount then throws', async () => {
    await resolvers.Mutation.upsertCompanyPostingAccount(
      null,
      { role: 'inventory', currencyCode: null, accountId: leafAccountA1 },
      adminCtx(),
    )
    const removed = await resolvers.Mutation.deleteCompanyPostingAccount(
      null,
      { role: 'inventory', currencyCode: null },
      adminCtx(),
    )
    expect(removed).toBe(true)
    await expect(resolvePostingAccount(COMPANY_A, 'inventory')).rejects.toThrow(
      PostingAccountNotConfiguredError,
    )
  })

  it('rejects an invalid account the same way the db layer does (not company A, or a header)', async () => {
    await expect(
      resolvers.Mutation.upsertCompanyPostingAccount(
        null,
        { role: 'ap', currencyCode: null, accountId: leafAccountB },
        adminCtx(),
      ),
    ).rejects.toThrow(/belong to this company/)

    await expect(
      resolvers.Mutation.upsertCompanyPostingAccount(
        null,
        { role: 'ap', currencyCode: null, accountId: headerAccountA },
        adminCtx(),
      ),
    ).rejects.toThrow(/postable/)
  })

  it('wrong company: a mutation run as company B never touches company A\'s rows', async () => {
    const companyBCtx = () =>
      ({
        auth: { companyId: COMPANY_B, userId, role: 'company_admin', module: 'all', sessionId: 'pa-resolver-test-b' },
      }) as never
    await resolvers.Mutation.upsertCompanyPostingAccount(
      null,
      { role: 'grni', currencyCode: null, accountId: leafAccountB },
      companyBCtx(),
    )
    // Company A's own GRNI role is untouched -- still not configured.
    await expect(resolvePostingAccount(COMPANY_A, 'grni')).rejects.toThrow(
      PostingAccountNotConfiguredError,
    )
    const listA = (await resolvers.Query.companyPostingAccounts(null, {}, adminCtx())) as { role: string }[]
    expect(listA.find((r) => r.role === 'grni')).toBeUndefined()
  })

  it('permission denied without finance.accounts.edit', async () => {
    await expect(
      resolvers.Mutation.upsertCompanyPostingAccount(
        null,
        { role: 'cash', currencyCode: null, accountId: leafAccountA1 },
        noPermCtx(),
      ),
    ).rejects.toThrow(/Requires 'edit' access/)

    await expect(
      resolvers.Mutation.deleteCompanyPostingAccount(null, { role: 'cash', currencyCode: null }, noPermCtx()),
    ).rejects.toThrow(/Requires 'edit' access/)
  })

  it('postingAccountReadiness reports hasDefault vs currency-only coverage, and the missing list', async () => {
    await resolvers.Mutation.upsertCompanyPostingAccount(
      null,
      { role: 'wht_recoverable', currencyCode: null, accountId: leafAccountA1 },
      adminCtx(),
    )
    await resolvers.Mutation.upsertCompanyPostingAccount(
      null,
      { role: 'salaries_payable', currencyCode: 'USD', accountId: leafAccountA2 },
      adminCtx(),
    )
    const readiness = (await resolvers.Query.postingAccountReadiness(null, {}, adminCtx())) as {
      roles: { role: string; hasDefault: boolean; currencies: string[]; configured: boolean }[]
      missingRoles: string[]
      allConfigured: boolean
    }
    const whtRow = readiness.roles.find((r) => r.role === 'wht_recoverable')!
    expect(whtRow.hasDefault).toBe(true)
    expect(whtRow.configured).toBe(true)

    const salariesRow = readiness.roles.find((r) => r.role === 'salaries_payable')!
    expect(salariesRow.hasDefault).toBe(false)
    expect(salariesRow.currencies).toContain('USD')
    expect(salariesRow.configured).toBe(true)
    expect(readiness.missingRoles).toContain('salaries_payable')

    const neverConfiguredRow = readiness.roles.find((r) => r.role === 'retention_payable')!
    expect(neverConfiguredRow.configured).toBe(false)
    expect(readiness.missingRoles).toContain('retention_payable')
    expect(readiness.allConfigured).toBe(false)
  })
})
