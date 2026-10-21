// The projectContracts list query feeds the project's Contract Management tab. It
// used to return `milestones: []` and `invoices: []` without ever reading the
// tables, so that tab never showed a milestone or an invoice even though they were
// saved (production had 2 milestones and 5 invoices it could not display). It now
// loads both for every contract it returns.
// Real-Postgres pattern, nothing mocked: rows are written to the tables and read back
// through the real resolvers.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const COMPANY = '00000000-0000-0000-0000-000000000001'
const OTHER_COMPANY = '00000000-0000-0000-0000-000000000002'
const EMAIL = 'project-contracts-list-test@fnc-erp.local'
const PROJECT_CODE = 'PCLTEST-PRJ'
const OTHER_PROJECT_CODE = 'PCLTEST-PRJ-OTHER'
const CONTRACT_PREFIX = 'PCLTEST contract'

let userId: string
let projectId: string
let otherProjectId: string

const ctx = () =>
  ({
    auth: {
      companyId: COMPANY,
      userId,
      role: 'company_admin',
      module: 'all',
      sessionId: 'pcl-test',
    },
  }) as never

interface Milestone {
  id: string
  name: string
  sequence: number
  billableAmount: number
  currencyCode: string
  status: string
}
interface Invoice {
  id: string
  invoiceNumber: string
  grossTotal: number
  netPayable: number
  status: string
}
interface Contract {
  id: string
  contractName: string
  milestones: Milestone[]
  invoices: Invoice[]
}

const listContracts = (args: { projectId?: string } = {}) =>
  resolvers.Query.projectContracts(null, args as never, ctx()) as Promise<Contract[]>

async function makeContract(
  name: string,
  forProject = projectId,
  company = COMPANY,
): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO project_contracts (company_id, project_id, contract_number, contract_name, client_name, contract_value, currency_code, contract_date, created_by)
     VALUES ($1,$2,$3,$4,'PCLTEST client',1000,'USD',CURRENT_DATE,$5) RETURNING id`,
    [
      company,
      forProject,
      `PCL-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      `${CONTRACT_PREFIX} ${name}`,
      userId,
    ],
  )
  return r.rows[0]!.id
}

async function addMilestone(
  contractId: string,
  projId: string,
  name: string,
  sequence: number,
  amount: number,
) {
  await pool.query(
    `INSERT INTO project_milestones (contract_id, project_id, name, sequence, billable_amount, currency_code)
     VALUES ($1,$2,$3,$4,$5,'USD')`,
    [contractId, projId, name, sequence, amount],
  )
}

async function addInvoice(
  contractId: string,
  projId: string,
  company: string,
  number: string,
  gross: number,
  createdAt: string,
) {
  await pool.query(
    `INSERT INTO project_invoices (contract_id, project_id, company_id, invoice_number, billing_method, invoice_date, due_date, gross_total, retention_amount, net_payable, currency_code, status, created_by, created_at)
     VALUES ($1,$2,$3,$4,'fixed_lump_sum','2026-10-01','2026-10-31',$5,$6,$7,'USD','issued',$8,$9)`,
    [contractId, projId, company, number, gross, gross * 0.1, gross * 0.9, userId, createdAt],
  )
}

async function cleanup(): Promise<void> {
  // projects cascade to their contracts, milestones and invoices
  await pool.query(`DELETE FROM projects WHERE code IN ($1,$2)`, [PROJECT_CODE, OTHER_PROJECT_CODE])
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
    [COMPANY, PROJECT_CODE, userId],
  )
  projectId = p.rows[0]!.id
  const o = await pool.query<{ id: string }>(
    `INSERT INTO projects (company_id, code, name, status, created_by) VALUES ($1,$2,$2,'ongoing',$3) RETURNING id`,
    [OTHER_COMPANY, OTHER_PROJECT_CODE, userId],
  )
  otherProjectId = o.rows[0]!.id
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email=$1`, [EMAIL]).catch(() => undefined)
  await pool.end()
})

describe('projectContracts list: milestones and invoices', () => {
  it("returns a contract's milestones in numeric order, with decimal sequences as numbers", async () => {
    const id = await makeContract('milestones')
    await addMilestone(id, projectId, 'third', 2.25, 30.5)
    await addMilestone(id, projectId, 'first', 1, 10381.05)
    await addMilestone(id, projectId, 'second', 1.5, 20)
    await addMilestone(id, projectId, 'tenth', 10, 5) // would sort before 2.25 as text

    const c = (await listContracts({ projectId })).find((x) => x.id === id)!
    expect(c.milestones.map((m) => m.name)).toEqual(['first', 'second', 'third', 'tenth'])
    expect(c.milestones.map((m) => m.sequence)).toEqual([1, 1.5, 2.25, 10])
    expect(c.milestones[0]!.billableAmount).toBe(10381.05)
    expect(c.milestones[0]!.currencyCode).toBe('USD')
    expect(c.milestones[0]!.status).toBe('pending')
    for (const m of c.milestones) {
      expect(typeof m.sequence).toBe('number')
      expect(typeof m.billableAmount).toBe('number')
    }
  })

  it("returns a contract's invoices, newest first, with numeric amounts", async () => {
    const id = await makeContract('invoices')
    await addInvoice(
      id,
      projectId,
      COMPANY,
      `PCLTEST-INV-${Date.now()}-A`,
      100,
      '2026-10-01T08:00:00Z',
    )
    await addInvoice(
      id,
      projectId,
      COMPANY,
      `PCLTEST-INV-${Date.now()}-B`,
      250.5,
      '2026-10-05T08:00:00Z',
    )

    const c = (await listContracts({ projectId })).find((x) => x.id === id)!
    expect(c.invoices).toHaveLength(2)
    expect(c.invoices.map((i) => i.grossTotal)).toEqual([250.5, 100]) // newest first
    expect(c.invoices[0]!.netPayable).toBe(225.45)
    expect(typeof c.invoices[0]!.grossTotal).toBe('number')
    expect(c.invoices[0]!.status).toBe('issued')
  })

  it('gives a contract with none empty arrays, not missing fields', async () => {
    const id = await makeContract('empty')
    const c = (await listContracts({ projectId })).find((x) => x.id === id)!
    expect(c.milestones).toEqual([])
    expect(c.invoices).toEqual([])
  })

  it("keeps each contract's rows with that contract when several are returned together", async () => {
    const a = await makeContract('multi A')
    const b = await makeContract('multi B')
    await addMilestone(a, projectId, 'A-only', 1, 1)
    await addMilestone(b, projectId, 'B-only', 1, 2)
    await addInvoice(
      b,
      projectId,
      COMPANY,
      `PCLTEST-INV-${Date.now()}-M`,
      7,
      '2026-10-02T08:00:00Z',
    )

    const all = await listContracts({ projectId })
    const ca = all.find((x) => x.id === a)!
    const cb = all.find((x) => x.id === b)!
    expect(ca.milestones.map((m) => m.name)).toEqual(['A-only'])
    expect(ca.invoices).toEqual([])
    expect(cb.milestones.map((m) => m.name)).toEqual(['B-only'])
    expect(cb.invoices).toHaveLength(1)
  })

  it("does not return another company's contracts, milestones or invoices", async () => {
    const other = await makeContract('other company', otherProjectId, OTHER_COMPANY)
    await addMilestone(other, otherProjectId, 'OTHER-COMPANY-MILESTONE', 1, 999)
    await addInvoice(
      other,
      otherProjectId,
      OTHER_COMPANY,
      `PCLTEST-INV-${Date.now()}-O`,
      999,
      '2026-10-03T08:00:00Z',
    )

    const all = await listContracts() // every contract this company can see, no project filter
    expect(all.find((x) => x.id === other)).toBeUndefined()
    expect(JSON.stringify(all)).not.toContain('OTHER-COMPANY-MILESTONE')
  })

  it('returns the same milestone and invoice shape as the single-contract query', async () => {
    const id = await makeContract('parity')
    await addMilestone(id, projectId, 'm1', 1.5, 12.34)
    await addInvoice(
      id,
      projectId,
      COMPANY,
      `PCLTEST-INV-${Date.now()}-P`,
      80,
      '2026-10-04T08:00:00Z',
    )

    const fromList = (await listContracts({ projectId })).find((x) => x.id === id)!
    const fromDetail = (await resolvers.Query.projectContract(
      null,
      { id } as never,
      ctx(),
    )) as Contract
    expect(fromList.milestones).toEqual(fromDetail.milestones)
    expect(fromList.invoices).toEqual(fromDetail.invoices)
  })
})
