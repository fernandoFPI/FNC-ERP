// Billing method validation in the project contract and invoice resolvers.
// Regression: the resolvers mapped the incoming value through a lookup table with
// `?? 'fixed_lump_sum'` as the fallback, so a form that offered a value the system
// can't store (remeasure, unit_rate, hybrid, ...) saved without error and the
// billing method "never changed". Unknown values are now rejected with a clear
// error and the stored value is left alone. Real-Postgres pattern, nothing mocked,
// so the stored default_billing_method is read back from the table itself.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'
import { resolveBillingMethod, BILLING_METHODS } from '../src/lib/contractBilling.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const EMAIL = 'contract-billing-method-test@fnc-erp.local'
const PROJECT_CODE = 'CBMTEST-PRJ'
const CONTRACT_NAME = 'CBMTEST contract'

let userId: string
let projectId: string
const admin = () =>
  ({
    auth: {
      companyId: TEST_COMPANY_ID,
      userId,
      role: 'company_admin',
      module: 'all',
      sessionId: 'cbm-test',
    },
  }) as never

async function storedMethod(contractId: string): Promise<string> {
  const r = await pool.query<{ default_billing_method: string }>(
    `SELECT default_billing_method FROM project_contracts WHERE id=$1`,
    [contractId],
  )
  return r.rows[0]!.default_billing_method
}

async function createContract(defaultBillingMethod?: string): Promise<string> {
  const c = (await resolvers.Mutation.createProjectContract(
    null,
    {
      projectId,
      input: {
        contractName: CONTRACT_NAME,
        clientName: 'CBMTEST client',
        contractValue: 1000,
        currencyCode: 'USD',
        ...(defaultBillingMethod === undefined ? {} : { defaultBillingMethod }),
      },
    } as never,
    admin(),
  )) as { id: string }
  return c.id
}

async function cleanup(): Promise<void> {
  await pool.query(`DELETE FROM project_contracts WHERE company_id=$1 AND contract_name=$2`, [
    TEST_COMPANY_ID,
    CONTRACT_NAME,
  ])
  await pool.query(`DELETE FROM projects WHERE company_id=$1 AND code=$2`, [
    TEST_COMPANY_ID,
    PROJECT_CODE,
  ])
}

beforeAll(async () => {
  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [EMAIL],
  )
  userId = u.rows[0]!.id
  await cleanup()
  const p = await pool.query<{ id: string }>(
    `INSERT INTO projects (company_id, code, name, status, created_by) VALUES ($1,$2,$2,'ongoing',$3) RETURNING id`,
    [TEST_COMPANY_ID, PROJECT_CODE, userId],
  )
  projectId = p.rows[0]!.id
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email=$1`, [EMAIL])
  await pool.end()
})

describe('resolveBillingMethod', () => {
  it('maps the four stored values and the older UI spellings', () => {
    for (const m of BILLING_METHODS) expect(resolveBillingMethod(m)).toBe(m)
    expect(resolveBillingMethod('fixed')).toBe('fixed_lump_sum')
    expect(resolveBillingMethod('time_material')).toBe('cost_plus')
    expect(resolveBillingMethod('percentage')).toBe('progress')
  })

  it.each(['remeasure', 'unit_rate', 'milestone_based', 'hybrid', 'lump_sum', '', 'undefined'])(
    'rejects %j, naming the allowed values',
    (bad) => {
      expect(() => resolveBillingMethod(bad)).toThrow(/Unknown billing method/)
      expect(() => resolveBillingMethod(bad)).toThrow(
        /fixed_lump_sum, milestone, cost_plus, progress/,
      )
    },
  )

  it('rejects non-string input', () => {
    expect(() => resolveBillingMethod(undefined)).toThrow(/Unknown billing method/)
    expect(() => resolveBillingMethod(42)).toThrow(/Unknown billing method/)
  })
})

describe('updateProjectContract billing method', () => {
  it.each(['milestone', 'cost_plus', 'progress', 'fixed_lump_sum'])('stores %s', async (method) => {
    const id = await createContract('fixed_lump_sum')
    await resolvers.Mutation.updateProjectContract(
      null,
      { id, input: { defaultBillingMethod: method } } as never,
      admin(),
    )
    expect(await storedMethod(id)).toBe(method)
  })

  it('rejects an unknown method and leaves the stored one untouched (no silent fallback)', async () => {
    const id = await createContract('milestone')
    await expect(
      resolvers.Mutation.updateProjectContract(
        null,
        { id, input: { defaultBillingMethod: 'remeasure' } } as never,
        admin(),
      ),
    ).rejects.toThrow(/Unknown billing method "remeasure"/)
    expect(await storedMethod(id)).toBe('milestone')
  })

  it('leaves the stored method alone when none is sent', async () => {
    const id = await createContract('cost_plus')
    await resolvers.Mutation.updateProjectContract(
      null,
      { id, input: { contractName: CONTRACT_NAME } } as never,
      admin(),
    )
    expect(await storedMethod(id)).toBe('cost_plus')
  })
})

describe('createProjectContract billing method', () => {
  it('defaults to fixed_lump_sum when none is sent', async () => {
    expect(await storedMethod(await createContract())).toBe('fixed_lump_sum')
  })

  it('stores the method it was given', async () => {
    expect(await storedMethod(await createContract('progress'))).toBe('progress')
  })

  it('rejects an unknown method instead of storing fixed_lump_sum, and creates nothing', async () => {
    const before = await pool.query(
      `SELECT count(*)::int AS n FROM project_contracts WHERE company_id=$1 AND contract_name=$2`,
      [TEST_COMPANY_ID, CONTRACT_NAME],
    )
    await expect(createContract('hybrid')).rejects.toThrow(/Unknown billing method "hybrid"/)
    const after = await pool.query(
      `SELECT count(*)::int AS n FROM project_contracts WHERE company_id=$1 AND contract_name=$2`,
      [TEST_COMPANY_ID, CONTRACT_NAME],
    )
    expect(after.rows[0].n).toBe(before.rows[0].n)
  })
})

describe('createProjectInvoice billing method', () => {
  it('rejects an unknown method before writing anything', async () => {
    const contractId = await createContract('milestone')
    await expect(
      resolvers.Mutation.createProjectInvoice(
        null,
        { contractId, input: { billingMethod: 'unit_rate', lines: [] } } as never,
        admin(),
      ),
    ).rejects.toThrow(/Unknown billing method "unit_rate"/)
    const inv = await pool.query(
      `SELECT count(*)::int AS n FROM project_invoices WHERE contract_id=$1`,
      [contractId],
    )
    expect(inv.rows[0].n).toBe(0)
  })
})
