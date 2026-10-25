// A contract milestone's sequence can be a decimal (1.5, 2.25), so a milestone
// can be slotted between two others without renumbering them.
// Regression: sequence was a whole number at every layer (web input step 1,
// GraphQL Int, project_milestones.sequence INTEGER, REST .int()), so typing 1.5
// was rejected. Billable amount already took decimals (NUMERIC(20,4)); it is
// asserted here too so a change to one can't quietly regress the other.
// Real-Postgres pattern, nothing mocked. Needs migration 307 on the test database.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { graphqlSync, buildASTSchema, parse } from 'graphql'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'
import { typeDefs } from '../src/graphql/schema.js'

const TEST_COMPANY_ID = 'f0000000-0000-0000-0000-000000000009'
const EMAIL = 'contract-milestone-sequence-test@fnc-erp.local'
const PROJECT_CODE = 'CMSTEST-PRJ'
const CONTRACT_NAME = 'CMSTEST contract'

let userId: string
let projectId: string
const admin = () =>
  ({
    auth: {
      companyId: TEST_COMPANY_ID,
      userId,
      role: 'company_admin',
      module: 'all',
      sessionId: 'cms-test',
    },
  }) as never

interface Milestone {
  id: string
  name: string
  sequence: number
  billableAmount: number
}

async function newContract(): Promise<string> {
  const c = (await resolvers.Mutation.createProjectContract(
    null,
    {
      projectId,
      input: {
        contractName: CONTRACT_NAME,
        clientName: 'CMSTEST client',
        contractValue: 1000,
        currencyCode: 'USD',
        defaultBillingMethod: 'milestone',
      },
    } as never,
    admin(),
  )) as { id: string }
  return c.id
}

const addMilestone = (
  contractId: string,
  name: string,
  sequence: number | undefined,
  billableAmount = 10,
) =>
  resolvers.Mutation.createContractMilestone(
    null,
    { contractId, input: { name, sequence, billableAmount, currencyCode: 'USD' } } as never,
    admin(),
  ) as Promise<Milestone>

async function listed(contractId: string): Promise<Milestone[]> {
  const c = (await resolvers.Query.projectContract(null, { id: contractId } as never, admin())) as {
    milestones: Milestone[]
  }
  return c.milestones
}

async function cleanup(): Promise<void> {
  await pool.query(
    `DELETE FROM project_milestones WHERE contract_id IN
       (SELECT id FROM project_contracts WHERE company_id=$1 AND contract_name=$2)`,
    [TEST_COMPANY_ID, CONTRACT_NAME],
  )
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

describe('milestone sequence', () => {
  it('stores a decimal sequence and hands it back as a number', async () => {
    const id = await newContract()
    const m = await addMilestone(id, 'between one and two', 1.5)
    expect(m.sequence).toBe(1.5)
    expect(typeof m.sequence).toBe('number')
  })

  it('still stores whole numbers, and defaults to 0 when none is sent', async () => {
    const id = await newContract()
    expect((await addMilestone(id, 'whole', 3)).sequence).toBe(3)
    expect((await addMilestone(id, 'none', undefined)).sequence).toBe(0)
  })

  it('lists milestones in numeric order, with a decimal slotted between two whole numbers', async () => {
    const id = await newContract()
    await addMilestone(id, 'third', 2.25)
    await addMilestone(id, 'first', 1)
    await addMilestone(id, 'second', 1.5)
    await addMilestone(id, 'tenth', 10) // would sort before 2.25 if it were compared as text
    const list = await listed(id)
    expect(list.map((m) => m.name)).toEqual(['first', 'second', 'third', 'tenth'])
    expect(list.map((m) => m.sequence)).toEqual([1, 1.5, 2.25, 10])
    for (const m of list) expect(typeof m.sequence).toBe('number')
  })

  it('moves a milestone by updating its sequence to a decimal', async () => {
    const id = await newContract()
    await addMilestone(id, 'one', 1)
    const two = await addMilestone(id, 'two', 2)
    const moved = (await resolvers.Mutation.updateContractMilestone(
      null,
      {
        id: two.id,
        input: { name: 'two', sequence: 0.5, billableAmount: 10, currencyCode: 'USD' },
      } as never,
      admin(),
    )) as Milestone
    expect(moved.sequence).toBe(0.5)
    expect((await listed(id)).map((m) => m.name)).toEqual(['two', 'one'])
  })

  it('leaves billable amount decimals working (unchanged)', async () => {
    const id = await newContract()
    const m = await addMilestone(id, 'amount', 1, 1.125)
    expect(m.billableAmount).toBe(1.125)
    expect((await listed(id))[0]!.billableAmount).toBe(1.125)
  })
})

describe('GraphQL schema', () => {
  const schema = buildASTSchema(parse(typeDefs), { assumeValidSDL: true })
  const mutation = `mutation($i: MilestoneInput!) {
    createContractMilestone(contractId: "00000000-0000-0000-0000-000000000000", input: $i) { id sequence }
  }`
  const coercionErrors = (sequence: unknown) =>
    (
      graphqlSync({
        schema,
        source: mutation,
        variableValues: { i: { name: 'm', sequence, billableAmount: 1 } },
      }).errors ?? []
    )
      .map((e) => e.message)
      // execution itself fails (no resolvers in this bare schema); only variable
      // coercion errors matter here
      .filter((msg) => /Variable "\$i" got invalid value/.test(msg))

  it('accepts a decimal sequence in MilestoneInput', () => {
    expect(coercionErrors(1.5)).toEqual([])
    expect(coercionErrors(2)).toEqual([])
  })

  it('still rejects a non-number sequence', () => {
    expect(coercionErrors('abc').length).toBe(1)
  })

  it('declares the returned sequence as Float', () => {
    const type = schema.getType('ProjectMilestone') as unknown as {
      getFields(): Record<string, { type: { toString(): string } }>
    }
    expect(type.getFields()['sequence']!.type.toString()).toBe('Float!')
  })
})
