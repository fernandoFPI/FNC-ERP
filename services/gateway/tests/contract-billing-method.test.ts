// Billing method and status handling in the project contract and invoice resolvers.
//
// Regression 1: the resolvers mapped the incoming billing method through a lookup
// table with `?? 'fixed_lump_sum'` as the fallback, so a form that offered a value
// the system can't store saved without error and the billing method "never
// changed". Unknown values are now rejected with a clear error and the stored value
// is left alone.
//
// Contracts may also be tagged remeasure / unit_rate / hybrid (migration 306);
// invoices may not, because the invoicing engine can only bill four methods.
//
// Real-Postgres pattern, nothing mocked, so the stored values are read back from
// the table itself. Needs migration 306 applied to the test database.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'
import {
  resolveContractBillingMethod,
  resolveInvoiceBillingMethod,
  CONTRACT_BILLING_METHODS,
  INVOICE_BILLING_METHODS,
} from '../src/lib/contractBilling.js'

const TEST_COMPANY_ID = 'f0000000-0000-0000-0000-000000000009'
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

async function stored(contractId: string): Promise<{ method: string; status: string }> {
  const r = await pool.query<{ default_billing_method: string; status: string }>(
    `SELECT default_billing_method, status FROM project_contracts WHERE id=$1`,
    [contractId],
  )
  return { method: r.rows[0]!.default_billing_method, status: r.rows[0]!.status }
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

const update = (id: string, input: Record<string, unknown>) =>
  resolvers.Mutation.updateProjectContract(null, { id, input } as never, admin())

async function countContracts(): Promise<number> {
  const r = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM project_contracts WHERE company_id=$1 AND contract_name=$2`,
    [TEST_COMPANY_ID, CONTRACT_NAME],
  )
  return r.rows[0]!.n
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

describe('resolveContractBillingMethod', () => {
  it('accepts the seven contract methods and maps the older UI spellings', () => {
    expect([...CONTRACT_BILLING_METHODS].sort()).toEqual([
      'cost_plus',
      'fixed_lump_sum',
      'hybrid',
      'milestone',
      'progress',
      'remeasure',
      'unit_rate',
    ])
    for (const m of CONTRACT_BILLING_METHODS) expect(resolveContractBillingMethod(m)).toBe(m)
    expect(resolveContractBillingMethod('fixed')).toBe('fixed_lump_sum')
    expect(resolveContractBillingMethod('time_material')).toBe('cost_plus')
    expect(resolveContractBillingMethod('percentage')).toBe('progress')
  })

  it.each(['lump_sum', 'milestone_based', 'Hybrid', '', 'undefined'])(
    'rejects %j, naming the allowed values',
    (bad) => {
      expect(() => resolveContractBillingMethod(bad)).toThrow(/Unknown billing method/)
      expect(() => resolveContractBillingMethod(bad)).toThrow(/remeasure, unit_rate, hybrid/)
    },
  )

  it('rejects non-string input', () => {
    expect(() => resolveContractBillingMethod(undefined)).toThrow(/Unknown billing method/)
    expect(() => resolveContractBillingMethod(42)).toThrow(/Unknown billing method/)
  })
})

describe('resolveInvoiceBillingMethod', () => {
  it('accepts only the four invoice methods and maps the older UI spellings', () => {
    for (const m of INVOICE_BILLING_METHODS) expect(resolveInvoiceBillingMethod(m)).toBe(m)
    expect(resolveInvoiceBillingMethod('fixed')).toBe('fixed_lump_sum')
    expect(resolveInvoiceBillingMethod('time_material')).toBe('cost_plus')
    expect(resolveInvoiceBillingMethod('percentage')).toBe('progress')
  })

  it.each(['remeasure', 'unit_rate', 'hybrid', 'lump_sum'])(
    'rejects %j: it is not something the invoicing engine can bill',
    (bad) => {
      expect(() => resolveInvoiceBillingMethod(bad)).toThrow(/Unknown billing method/)
      expect(() => resolveInvoiceBillingMethod(bad)).toThrow(
        /fixed_lump_sum, milestone, cost_plus, progress\./,
      )
    },
  )
})

describe('updateProjectContract', () => {
  it.each([...CONTRACT_BILLING_METHODS])('stores billing method %s', async (method) => {
    const id = await createContract('fixed_lump_sum')
    await update(id, { defaultBillingMethod: method })
    expect((await stored(id)).method).toBe(method)
  })

  it('rejects an unknown method and leaves the stored one untouched (no silent fallback)', async () => {
    const id = await createContract('unit_rate')
    await expect(update(id, { defaultBillingMethod: 'milestone_based' })).rejects.toThrow(
      /Unknown billing method "milestone_based"/,
    )
    expect((await stored(id)).method).toBe('unit_rate')
  })

  it('leaves the stored method alone when none is sent', async () => {
    const id = await createContract('hybrid')
    await update(id, { contractName: CONTRACT_NAME })
    expect((await stored(id)).method).toBe('hybrid')
  })

  it.each(['draft', 'active', 'completed', 'cancelled'])(
    'stores contract status %s (the four the database allows)',
    async (status) => {
      const id = await createContract('milestone')
      await update(id, { status })
      expect((await stored(id)).status).toBe(status)
    },
  )
})

describe('createProjectContract', () => {
  it('defaults to fixed_lump_sum when no method is sent', async () => {
    expect((await stored(await createContract())).method).toBe('fixed_lump_sum')
  })

  it.each(['progress', 'remeasure', 'unit_rate', 'hybrid'])(
    'stores the method it was given: %s',
    async (m) => {
      expect((await stored(await createContract(m))).method).toBe(m)
    },
  )

  it('rejects an unknown method instead of storing fixed_lump_sum, and creates nothing', async () => {
    const before = await countContracts()
    await expect(createContract('lump_sum')).rejects.toThrow(/Unknown billing method "lump_sum"/)
    expect(await countContracts()).toBe(before)
  })
})

describe('createProjectInvoice', () => {
  it.each(['unit_rate', 'hybrid', 'remeasure'])(
    'rejects %s before writing anything: contract-level types cannot be invoiced as such',
    async (method) => {
      const contractId = await createContract('milestone')
      await expect(
        resolvers.Mutation.createProjectInvoice(
          null,
          { contractId, input: { billingMethod: method, lines: [] } } as never,
          admin(),
        ),
      ).rejects.toThrow(new RegExp(`Unknown billing method "${method}"`))
      const inv = await pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM project_invoices WHERE contract_id=$1`,
        [contractId],
      )
      expect(inv.rows[0]!.n).toBe(0)
    },
  )
})
