// PO positions on a user's Roles tab act on the company the tab SHOWS, not the admin's session company.
//
// Regression background: the tab has a company switcher, but listPOPositions/assign/remove used the admin's session
// company. An admin logged into Company B who looked at a user in Company A and added a "Buyer" position silently gave it
// to Company B, and the Add Position modal sent the employee of the user's FIRST position (an empty string for a user with
// none, which could never work). Nothing checked that the employee or the project/department/branch belonged to the
// company the position was created in.
//
// Real Postgres, real mutations and queries. Users: a system admin, a PO admin (of the test company only), a stranger.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const EMAIL_PREFIX = 'po-pos-company-'
const EMP_PREFIX = 'PPC-EMP-'
const DEPT_PREFIX = 'PPCTEST-'

type Who = 'sysadmin' | 'poadmin' | 'stranger' | 'target' | 'fresh'
const userIds = {} as Record<Who, string>
let otherCompanyId: string | null = null
const empId = {} as Record<string, string> // `${who}@test` / `${who}@other`
let deptTest: string
let deptOther: string
let branchOther: string

const ctxFor = (who: Who, companyId = TEST_COMPANY_ID) =>
  ({
    auth: {
      companyId,
      userId: userIds[who],
      role: who === 'sysadmin' ? 'system_admin' : 'user',
      module: 'all',
      sessionId: 'ppc-test',
    },
  }) as never

async function makeUser(key: Who): Promise<void> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, first_name, last_name) VALUES ($1,'test-hash-not-used',$2,'Tester')
     ON CONFLICT (email) DO UPDATE SET first_name=EXCLUDED.first_name RETURNING id`,
    [`${EMAIL_PREFIX}${key}@fnc-erp.local`, key],
  )
  userIds[key] = r.rows[0]!.id
}

async function makeEmployee(who: Who, companyId: string, tag: string): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO employees (company_id, user_id, first_name, last_name, hire_date, employee_number)
     VALUES ($1,$2,$3,'Tester',CURRENT_DATE,$4)
     ON CONFLICT (company_id, employee_number) DO UPDATE SET user_id=EXCLUDED.user_id RETURNING id`,
    [companyId, userIds[who], who, `${EMP_PREFIX}${who}-${tag}`],
  )
  return r.rows[0]!.id
}

const seedPosition = async (employeeId: string, companyId: string, position: string, deptId: string | null = null) =>
  pool.query(
    `INSERT INTO po_position_assignments (company_id, employee_id, position, department_id, branch_id, is_active, assigned_by)
     VALUES ($1,$2,$3,$4,NULL,true,$5)`,
    [companyId, employeeId, position, deptId, userIds.sysadmin],
  )

const list = (who: Who, target: Who, companyId?: string) =>
  resolvers.Query.userPOPositions(null, { userId: userIds[target], companyId } as never, ctxFor(who)) as Promise<
    { id: string; employeeId: string; position: string }[]
  >
const assign = (who: Who, input: Record<string, unknown>) =>
  resolvers.Mutation.assignPOPosition(null, { input } as never, ctxFor(who)) as Promise<{ id: string; employeeId: string }>
const remove = (who: Who, id: string) => resolvers.Mutation.removePOPosition(null, { id } as never, ctxFor(who))
const rowOf = async (id: string) =>
  (await pool.query<{ company_id: string; employee_id: string; is_active: boolean }>(
    `SELECT company_id, employee_id, is_active FROM po_position_assignments WHERE id=$1`,
    [id],
  )).rows[0]
const countFor = async (who: Who) =>
  (await pool.query(
    `SELECT 1 FROM po_position_assignments WHERE employee_id IN (SELECT id FROM employees WHERE user_id=$1)`,
    [userIds[who]],
  )).rows.length

async function cleanup(): Promise<void> {
  await pool.query(
    `DELETE FROM po_position_assignments WHERE employee_id IN (SELECT id FROM employees WHERE employee_number LIKE $1)`,
    [`${EMP_PREFIX}%`],
  )
  await pool.query(`DELETE FROM employees WHERE employee_number LIKE $1`, [`${EMP_PREFIX}%`])
  await pool.query(`DELETE FROM departments WHERE name LIKE $1`, [`${DEPT_PREFIX}%`])
  await pool.query(`DELETE FROM company_branches WHERE name LIKE $1`, [`${DEPT_PREFIX}%`])
}

beforeAll(async () => {
  for (const who of ['sysadmin', 'poadmin', 'stranger', 'target', 'fresh'] as Who[]) await makeUser(who)
  await cleanup()
  const other = await pool.query<{ id: string }>(`SELECT id FROM companies WHERE id <> $1 LIMIT 1`, [TEST_COMPANY_ID])
  otherCompanyId = other.rows[0]?.id ?? null
  if (!otherCompanyId) return

  deptTest = (await pool.query<{ id: string }>(`INSERT INTO departments (company_id, name) VALUES ($1,$2) RETURNING id`, [TEST_COMPANY_ID, `${DEPT_PREFIX}A`])).rows[0]!.id
  deptOther = (await pool.query<{ id: string }>(`INSERT INTO departments (company_id, name) VALUES ($1,$2) RETURNING id`, [otherCompanyId, `${DEPT_PREFIX}B`])).rows[0]!.id
  branchOther = (await pool.query<{ id: string }>(`INSERT INTO company_branches (company_id, name) VALUES ($1,$2) RETURNING id`, [otherCompanyId, `${DEPT_PREFIX}Branch`])).rows[0]!.id

  empId['poadmin@test'] = await makeEmployee('poadmin', TEST_COMPANY_ID, 'test')
  await seedPosition(empId['poadmin@test']!, TEST_COMPANY_ID, 'po_admin') // a PO admin of the test company only
  for (const who of ['target', 'fresh'] as Who[]) {
    empId[`${who}@test`] = await makeEmployee(who, TEST_COMPANY_ID, 'test')
    empId[`${who}@other`] = await makeEmployee(who, otherCompanyId, 'other')
  }
  // the target already holds one position in each company
  await seedPosition(empId['target@test']!, TEST_COMPANY_ID, 'store_keeper', deptTest)
  await seedPosition(empId['target@other']!, otherCompanyId, 'buyer', deptOther)
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`]).catch(() => undefined)
  await pool.end()
})

describe('listing a user’s positions', () => {
  it('with a company, returns only that company’s positions, with that company’s employee', async () => {
    if (!otherCompanyId) return
    const mine = await list('sysadmin', 'target', TEST_COMPANY_ID)
    expect(mine.map((p) => p.position)).toEqual(['store_keeper'])
    expect(mine[0]!.employeeId).toBe(empId['target@test'])
    const theirs = await list('sysadmin', 'target', otherCompanyId)
    expect(theirs.map((p) => p.position)).toEqual(['buyer'])
    expect(theirs[0]!.employeeId).toBe(empId['target@other'])
  })

  it('without a company, still returns every company’s positions (the Stock Adjustment and Pending Catalog screens rely on it)', async () => {
    if (!otherCompanyId) return
    const all = await list('stranger', 'target')
    expect(all.map((p) => p.position).sort()).toEqual(['buyer', 'store_keeper'])
  })

  it('a PO admin can name his own company, but not another', async () => {
    if (!otherCompanyId) return
    expect(await list('poadmin', 'target', TEST_COMPANY_ID)).toHaveLength(1)
    await expect(list('poadmin', 'target', otherCompanyId)).rejects.toThrow(/system_admin role required to manage another company/)
  })
})

describe('assigning a position', () => {
  it('to a user, in the company shown: the server finds the user’s employee there', async () => {
    if (!otherCompanyId) return
    const r = await assign('sysadmin', { userId: userIds.target, companyId: otherCompanyId, position: 'store_keeper', departmentId: deptOther })
    const row = await rowOf(r.id)
    expect(row!.company_id).toBe(otherCompanyId) // not the admin's session company
    expect(row!.employee_id).toBe(empId['target@other'])
  })

  it('works for a user who has no position yet (the old modal sent an empty employee id)', async () => {
    if (!otherCompanyId) return
    expect(await countFor('fresh')).toBe(0)
    const r = await assign('sysadmin', { userId: userIds.fresh, companyId: otherCompanyId, position: 'buyer', departmentId: deptOther })
    expect((await rowOf(r.id))!.employee_id).toBe(empId['fresh@other'])
  })

  it('says so when the user has no employee record in that company', async () => {
    await expect(assign('sysadmin', { userId: userIds.stranger, position: 'buyer' })).rejects.toThrow(
      /This user has no employee record in this company/,
    )
  })

  it('needs either an employee or a user', async () => {
    await expect(assign('sysadmin', { position: 'buyer' })).rejects.toThrow(/employeeId or userId is required/)
  })

  it('still works the old way: an employee of the admin’s own company, no company named (the Positions page)', async () => {
    const before = await countFor('fresh')
    const r = await assign('poadmin', { employeeId: empId['fresh@test'], position: 'store_pricing', departmentId: deptTest })
    const row = await rowOf(r.id)
    expect(row!.company_id).toBe(TEST_COMPANY_ID)
    expect(row!.employee_id).toBe(empId['fresh@test'])
    expect(await countFor('fresh')).toBe(before + 1)
  })

  it('refuses an employee of another company, and creates nothing', async () => {
    if (!otherCompanyId) return
    const before = await countFor('target')
    await expect(assign('poadmin', { employeeId: empId['target@other'], position: 'buyer', departmentId: deptTest })).rejects.toThrow(
      /Employee not found in this company/,
    )
    expect(await countFor('target')).toBe(before)
  })

  it('a PO admin cannot give a position in another company', async () => {
    if (!otherCompanyId) return
    const before = await countFor('target')
    await expect(
      assign('poadmin', { userId: userIds.target, companyId: otherCompanyId, position: 'buyer', departmentId: deptOther }),
    ).rejects.toThrow(/system_admin role required to manage another company/)
    expect(await countFor('target')).toBe(before)
  })

  it('refuses a department, branch or project that belongs to another company (or does not exist)', async () => {
    if (!otherCompanyId) return
    const before = await countFor('fresh')
    await expect(assign('poadmin', { userId: userIds.fresh, position: 'buyer', departmentId: deptOther })).rejects.toThrow(
      /Department not found in this company/,
    )
    await expect(assign('poadmin', { userId: userIds.fresh, position: 'buyer', branchId: branchOther })).rejects.toThrow(
      /Branch not found in this company/,
    )
    await expect(
      assign('poadmin', { userId: userIds.fresh, position: 'buyer', projectId: '00000000-0000-0000-0000-00000000dead' }),
    ).rejects.toThrow(/Project not found in this company/)
    expect(await countFor('fresh')).toBe(before)
  })

  it('accepts a department of the company the position is created in', async () => {
    const r = await assign('poadmin', { userId: userIds.fresh, position: 'procurement_officer', departmentId: deptTest })
    expect((await rowOf(r.id))!.company_id).toBe(TEST_COMPANY_ID)
  })

  it('is still only for system admins and PO admins', async () => {
    await expect(assign('stranger', { userId: userIds.fresh, position: 'buyer', departmentId: deptTest })).rejects.toThrow(
      /system_admin role or PO Admin position required/,
    )
  })
})

describe('removing a position', () => {
  const positionIn = async (companyId: string, who: Who, position: string, dept: string) => {
    const e = who === 'target' ? empId[companyId === TEST_COMPANY_ID ? 'target@test' : 'target@other']! : empId[`${who}@test`]!
    const r = await pool.query<{ id: string }>(
      `INSERT INTO po_position_assignments (company_id, employee_id, position, department_id, is_active, assigned_by)
       VALUES ($1,$2,$3,$4,true,$5) RETURNING id`,
      [companyId, e, position, dept, userIds.sysadmin],
    )
    return r.rows[0]!.id
  }

  it('a PO admin removes a position of his own company', async () => {
    const id = await positionIn(TEST_COMPANY_ID, 'target', 'store_pricing', deptTest)
    expect(await remove('poadmin', id)).toBe(true)
    expect((await rowOf(id))!.is_active).toBe(false)
  })

  it('a PO admin cannot reach a position of another company: it is simply not found, and stays active', async () => {
    if (!otherCompanyId) return
    const id = await positionIn(otherCompanyId, 'target', 'store_pricing', deptOther)
    await expect(remove('poadmin', id)).rejects.toThrow(/Position assignment not found/)
    expect((await rowOf(id))!.is_active).toBe(true)
  })

  it('a system admin removes a position of the company shown, whatever his session company', async () => {
    if (!otherCompanyId) return
    const id = await positionIn(otherCompanyId, 'target', 'procurement_2nd', deptOther)
    expect(await remove('sysadmin', id)).toBe(true)
    const row = await rowOf(id)
    expect(row!.is_active).toBe(false)
    expect(row!.company_id).toBe(otherCompanyId)
  })

  it('an unknown id is not found, and a stranger is turned away at the door', async () => {
    await expect(remove('sysadmin', '00000000-0000-0000-0000-00000000beef')).rejects.toThrow(/Position assignment not found/)
    const id = await positionIn(TEST_COMPANY_ID, 'target', 'procurement_officer', deptTest)
    await expect(remove('stranger', id)).rejects.toThrow(/system_admin role or PO Admin position required/)
    expect((await rowOf(id))!.is_active).toBe(true)
  })
})
