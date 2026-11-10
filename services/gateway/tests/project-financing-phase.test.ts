// The Financing phase (migration 319): Execution ends, the finance team issues and collects the
// project's invoices, and only then does the project close out.
//
//   End Execution  = advancePhase(targetPhase: 'financing')  Execution -> Financing, status stays 'approved'
//   Close Project  = completeProject                         Financing -> Closeout, status 'completed'
//
// Who: the project's own manager, or anyone holding projects.approve (admins pass). The invoice rule:
// an unpaid invoice blocks everyone, administrators included; a project with no invoices blocks
// everyone except an administrator.
//
// Real Postgres through the real resolvers; one test goes through the real ApolloServer schema.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { ApolloServer } from '@apollo/server'
import {
  pool,
  getProjectCloseoutInvoiceState,
  summariseInvoiceStatusCounts,
  projectCloseoutBlocker,
  OPEN_INVOICE_STATUSES,
  PAID_INVOICE_STATUS,
  DEAD_INVOICE_STATUSES,
} from '@fnc-erp/db'
import { invalidatePermissionCache } from '@fnc-erp/permissions'
import { typeDefs } from '../src/graphql/schema.js'
import { resolvers } from '../src/graphql/resolvers.js'
import { PROJECT_LIFECYCLE_PHASE_KEYS } from '../src/lib/projectLifecycle.js'

const COMPANY_ID = 'f0000000-0000-0000-0000-000000000009'
const OTHER_COMPANY_ID = 'f0000000-0000-0000-0000-000000000010'
const EMAIL_PREFIX = 'project-financing-test-'
const CODE_PREFIX = 'PFINTEST-'

type Who = 'sysadmin' | 'moduleAdmin' | 'approver' | 'approveViewOnly' | 'pm' | 'plain' | 'otherCompanyApprover'
const ROLE: Record<Who, string> = {
  sysadmin: 'system_admin',
  moduleAdmin: 'user',
  approver: 'user',
  approveViewOnly: 'user',
  pm: 'user',
  plain: 'user',
  otherCompanyApprover: 'user',
}
const userIds = {} as Record<Who, string>
let pmEmployeeId: string

type Ctx = { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }
const ctxFor = (who: Who, companyId = COMPANY_ID): Ctx => ({
  auth: { companyId, userId: userIds[who], role: ROLE[who], module: 'all', sessionId: `pfin-${who}` },
})

const server = new ApolloServer<Ctx>({ typeDefs, resolvers })

let seq = 0
const uniq = () => `${Date.now()}-${++seq}-${Math.random().toString(36).slice(2, 6)}`

async function makeProject(opts: {
  status?: string
  phase?: string
  pm?: boolean
  companyId?: string
}): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO projects (company_id, code, name, status, lifecycle_phase, project_manager_id, created_by)
     VALUES ($1,$2,$2,$3,$4,$5,$6) RETURNING id`,
    [
      opts.companyId ?? COMPANY_ID,
      `${CODE_PREFIX}${uniq()}`,
      opts.status ?? 'approved',
      opts.phase ?? 'financing',
      opts.pm ? pmEmployeeId : null,
      userIds.sysadmin,
    ],
  )
  return r.rows[0]!.id
}

async function ensureContract(projectId: string, companyId = COMPANY_ID): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO project_contracts
       (project_id, company_id, contract_number, contract_name, client_name, contract_value, currency_code, contract_date, created_by)
     VALUES ($1,$2,$3,'Financing Test Contract','Financing Test Client',1000,'USD','2031-01-01',$4) RETURNING id`,
    [projectId, companyId, `${CODE_PREFIX}C-${uniq()}`, userIds.sysadmin],
  )
  return r.rows[0]!.id
}

async function addInvoice(projectId: string, status: string, companyId = COMPANY_ID): Promise<void> {
  const cid = await ensureContract(projectId, companyId)
  await pool.query(
    `INSERT INTO project_invoices
       (contract_id, project_id, company_id, invoice_number, billing_method, net_payable, currency_code, status,
        invoice_date, due_date, created_by)
     VALUES ($1,$2,$3,$4,'milestone',100,'USD',$5,CURRENT_DATE,CURRENT_DATE + 30,$6)`,
    [cid, projectId, companyId, `${CODE_PREFIX}I-${uniq()}`, status, userIds.sysadmin],
  )
}

async function row(projectId: string): Promise<{ status: string; lifecycle_phase: string; completed_at: string | null }> {
  const r = await pool.query(`SELECT status, lifecycle_phase, completed_at FROM projects WHERE id=$1`, [projectId])
  return r.rows[0] as { status: string; lifecycle_phase: string; completed_at: string | null }
}

const endExecution = (id: string, who: Who, companyId = COMPANY_ID) =>
  resolvers.Mutation.advancePhase(null, { id, targetPhase: 'financing' }, ctxFor(who, companyId) as never)
const closeProject = (id: string, who: Who, companyId = COMPANY_ID) =>
  resolvers.Mutation.completeProject(null, { id }, ctxFor(who, companyId) as never)

async function cleanup(): Promise<void> {
  const users = `SELECT id FROM users WHERE email LIKE $1`
  const like = [`${EMAIL_PREFIX}%`]
  await pool.query(`DELETE FROM project_invoices WHERE invoice_number LIKE $1`, [`${CODE_PREFIX}%`])
  await pool.query(`DELETE FROM project_contracts WHERE contract_number LIKE $1`, [`${CODE_PREFIX}%`])
  await pool.query(`DELETE FROM projects WHERE code LIKE $1`, [`${CODE_PREFIX}%`])
  await pool.query(`DELETE FROM employees WHERE user_id IN (${users})`, like)
  await pool.query(`DELETE FROM user_permissions WHERE user_id IN (${users})`, like)
  await pool.query(`DELETE FROM user_company_roles WHERE user_id IN (${users})`, like)
}

beforeAll(async () => {
  await cleanup()
  for (const who of Object.keys(ROLE) as Who[]) {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
      [`${EMAIL_PREFIX}${who}@fnc-erp.local`],
    )
    userIds[who] = r.rows[0]!.id
  }
  const grant = async (who: Who, key: string, level: string, companyId = COMPANY_ID) => {
    await pool.query(
      `INSERT INTO user_permissions (user_id, company_id, permission_key, access_level) VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, company_id, permission_key) DO UPDATE SET access_level = EXCLUDED.access_level`,
      [userIds[who], companyId, key, level],
    )
  }
  await grant('approver', 'projects.approve', 'approve')
  await grant('approveViewOnly', 'projects.approve', 'view')
  // A projects module admin holds every projects.* key at 'admin'; these two are the ones that matter here.
  await grant('moduleAdmin', 'projects.view', 'admin')
  await grant('moduleAdmin', 'projects.approve', 'admin')
  await grant('otherCompanyApprover', 'projects.approve', 'approve', OTHER_COMPANY_ID)
  for (const id of Object.values(userIds)) {
    await invalidatePermissionCache(id, COMPANY_ID)
    await invalidatePermissionCache(id, OTHER_COMPANY_ID)
  }
  // The project manager: an employee record linked to a user who holds NO project permission at all.
  const e = await pool.query<{ id: string }>(
    `INSERT INTO employees (company_id, user_id, first_name, last_name, hire_date, employee_number)
     VALUES ($1,$2,'Fin','Manager',CURRENT_DATE,$3)
     ON CONFLICT (company_id, employee_number) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING id`,
    [COMPANY_ID, userIds.pm, `${CODE_PREFIX}EMP`],
  )
  pmEmployeeId = e.rows[0]!.id
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`])
  await pool.end()
})

describe('End Execution (Execution -> Financing)', () => {
  it('moves the phase only: status stays approved', async () => {
    const id = await makeProject({ phase: 'execution' })
    const res = (await endExecution(id, 'approver')) as { lifecyclePhase: string; status: string }
    expect(res.lifecyclePhase).toBe('financing')
    expect(res.status).toBe('approved')
    expect(await row(id)).toMatchObject({ status: 'approved', lifecycle_phase: 'financing' })
  })

  it("the project's own manager can, with no project permission at all", async () => {
    const id = await makeProject({ phase: 'execution', pm: true })
    await endExecution(id, 'pm')
    expect((await row(id)).lifecycle_phase).toBe('financing')
  })

  it('a system admin can', async () => {
    const id = await makeProject({ phase: 'execution' })
    await endExecution(id, 'sysadmin')
    expect((await row(id)).lifecycle_phase).toBe('financing')
  })

  it('a user who is neither the manager nor a projects.approve holder is refused, project untouched', async () => {
    const id = await makeProject({ phase: 'execution' })
    await expect(endExecution(id, 'plain')).rejects.toThrow(/projects\.approve/)
    expect((await row(id)).lifecycle_phase).toBe('execution')
  })

  it("someone else's project manager is not enough, nor is projects.approve held only at view", async () => {
    const id = await makeProject({ phase: 'execution', pm: true })
    await expect(endExecution(id, 'plain')).rejects.toThrow(/projects\.approve/)
    await expect(endExecution(id, 'approveViewOnly')).rejects.toThrow(/projects\.approve/)
    expect((await row(id)).lifecycle_phase).toBe('execution')
  })

  it('only from Execution: a project in Bidding, or already in Financing, is refused', async () => {
    const bidding = await makeProject({ phase: 'bidding' })
    await expect(endExecution(bidding, 'approver')).rejects.toThrow(/must be in execution/)
    const already = await makeProject({ phase: 'financing' })
    await expect(endExecution(already, 'approver')).rejects.toThrow(/must be in execution/)
    expect((await row(bidding)).lifecycle_phase).toBe('bidding')
  })

  it('a project cancelled after approval (it keeps phase execution) cannot enter Financing', async () => {
    const id = await makeProject({ status: 'cancelled_after_approval', phase: 'execution' })
    await expect(endExecution(id, 'approver')).rejects.toThrow(/Only an approved project/)
    expect((await row(id)).lifecycle_phase).toBe('execution')
  })

  it("another company's project is not found, even for a system admin of this company's session", async () => {
    const id = await makeProject({ phase: 'execution', companyId: OTHER_COMPANY_ID })
    await expect(endExecution(id, 'sysadmin')).rejects.toThrow(/not found/i)
    await expect(endExecution(id, 'approver')).rejects.toThrow()
    expect((await row(id)).lifecycle_phase).toBe('execution')
  })

  it('advancing to Bidding is unchanged: still projects.edit, and a project manager does not gain it', async () => {
    const id = await makeProject({ phase: 'scope_review', pm: true })
    await expect(
      resolvers.Mutation.advancePhase(null, { id, targetPhase: 'bidding' }, ctxFor('pm') as never),
    ).rejects.toThrow(/projects\.edit/)
    const res = (await resolvers.Mutation.advancePhase(
      null,
      { id, targetPhase: 'bidding' },
      ctxFor('sysadmin') as never,
    )) as { lifecyclePhase: string }
    expect(res.lifecyclePhase).toBe('bidding')
  })
})

describe('Close Project (Financing -> Closeout)', () => {
  it('only from Financing, however well paid the invoices are', async () => {
    const id = await makeProject({ phase: 'execution' })
    await addInvoice(id, 'paid')
    await expect(closeProject(id, 'sysadmin')).rejects.toThrow(/not in Financing/)
    expect(await row(id)).toMatchObject({ status: 'approved', lifecycle_phase: 'execution' })
  })

  it("the project's own manager can close it once the invoices are paid", async () => {
    const id = await makeProject({ pm: true })
    await addInvoice(id, 'paid')
    await addInvoice(id, 'paid')
    const res = (await closeProject(id, 'pm')) as { status: string; lifecyclePhase: string }
    expect(res).toMatchObject({ status: 'completed', lifecyclePhase: 'closeout' })
    const r = await row(id)
    expect(r).toMatchObject({ status: 'completed', lifecycle_phase: 'closeout' })
    expect(r.completed_at).not.toBeNull()
  })

  it('a projects.approve holder can; cancelled and void invoices do not count against it', async () => {
    const id = await makeProject({})
    await addInvoice(id, 'paid')
    await addInvoice(id, 'cancelled')
    await addInvoice(id, 'void')
    await closeProject(id, 'approver')
    expect((await row(id)).lifecycle_phase).toBe('closeout')
  })

  it('a user who is neither the manager nor an approver is refused in Financing', async () => {
    const id = await makeProject({})
    await addInvoice(id, 'paid')
    await expect(closeProject(id, 'plain')).rejects.toThrow(/projects\.approve/)
    await expect(closeProject(id, 'approveViewOnly')).rejects.toThrow(/projects\.approve/)
    expect((await row(id)).status).toBe('approved')
  })

  for (const status of OPEN_INVOICE_STATUSES) {
    it(`an invoice that is ${status} blocks the close for everyone, a system admin included`, async () => {
      const id = await makeProject({ pm: true })
      await addInvoice(id, 'paid')
      await addInvoice(id, status)
      for (const who of ['pm', 'approver', 'sysadmin', 'moduleAdmin'] as Who[]) {
        await expect(closeProject(id, who)).rejects.toThrow(/not fully paid/)
      }
      expect(await row(id)).toMatchObject({ status: 'approved', lifecycle_phase: 'financing' })
    })
  }

  it('says how many are open and in what state', async () => {
    const id = await makeProject({})
    await addInvoice(id, 'paid')
    await addInvoice(id, 'issued')
    await addInvoice(id, 'issued')
    await addInvoice(id, 'partial')
    await expect(closeProject(id, 'approver')).rejects.toThrow(
      /3 invoices are not fully paid yet \(2 issued, unpaid, 1 partly paid\)/,
    )
  })

  it('no invoices at all: refused for the manager and for an approver, allowed for admins', async () => {
    const asPm = await makeProject({ pm: true })
    await expect(closeProject(asPm, 'pm')).rejects.toThrow(/no invoices/)
    await expect(closeProject(asPm, 'approver')).rejects.toThrow(/no invoices/)
    expect((await row(asPm)).status).toBe('approved')

    const bySys = await makeProject({})
    await closeProject(bySys, 'sysadmin')
    expect((await row(bySys)).lifecycle_phase).toBe('closeout')

    const byModuleAdmin = await makeProject({})
    await closeProject(byModuleAdmin, 'moduleAdmin')
    expect((await row(byModuleAdmin)).lifecycle_phase).toBe('closeout')
  })

  it('only cancelled or void invoices counts as no invoices', async () => {
    const id = await makeProject({ pm: true })
    await addInvoice(id, 'cancelled')
    await addInvoice(id, 'void')
    await expect(closeProject(id, 'pm')).rejects.toThrow(/no invoices/)
    await closeProject(id, 'sysadmin')
    expect((await row(id)).lifecycle_phase).toBe('closeout')
  })

  it("another project's unpaid invoice does not block this one", async () => {
    const other = await makeProject({})
    await addInvoice(other, 'issued')
    const id = await makeProject({})
    await addInvoice(id, 'paid')
    await closeProject(id, 'approver')
    expect((await row(id)).lifecycle_phase).toBe('closeout')
    expect((await row(other)).lifecycle_phase).toBe('financing')
  })

  it("another company's user cannot close this project even holding projects.approve in their own company", async () => {
    const id = await makeProject({})
    await addInvoice(id, 'paid')
    await expect(closeProject(id, 'otherCompanyApprover', OTHER_COMPANY_ID)).rejects.toThrow(/not found/i)
    expect((await row(id)).status).toBe('approved')
  })
})

describe('the same steps through the real GraphQL schema', () => {
  const run = async (query: string, variables: Record<string, unknown>, who: Who) => {
    const res = await server.executeOperation({ query, variables }, { contextValue: ctxFor(who) })
    if (res.body.kind !== 'single') throw new Error('unexpected response kind')
    return res.body.singleResult
  }
  const FIELDS = 'id status lifecyclePhase allowedActions'

  it('End Execution, a refused Close Project (unpaid invoice), then Close Project once paid', async () => {
    const id = await makeProject({ phase: 'execution', pm: true })
    await addInvoice(id, 'issued')

    const a = await run(
      `mutation ($id: ID!) { advancePhase(id: $id, targetPhase: "financing") { ${FIELDS} } }`,
      { id },
      'pm',
    )
    expect(a.errors).toBeUndefined()
    expect(a.data).toMatchObject({ advancePhase: { status: 'approved', lifecyclePhase: 'financing' } })

    const blocked = await run(`mutation ($id: ID!) { completeProject(id: $id) { ${FIELDS} } }`, { id }, 'pm')
    expect(blocked.errors?.[0]?.message).toMatch(/1 invoice is not fully paid yet \(1 issued, unpaid\)/)

    await pool.query(`UPDATE project_invoices SET status='paid' WHERE project_id=$1`, [id])
    const done = await run(`mutation ($id: ID!) { completeProject(id: $id) { ${FIELDS} } }`, { id }, 'pm')
    expect(done.errors).toBeUndefined()
    expect(done.data).toMatchObject({ completeProject: { status: 'completed', lifecyclePhase: 'closeout' } })
  })
})

describe('Admin override', () => {
  it('adminSetPhase accepts financing and still rejects an unknown phase', async () => {
    const id = await makeProject({ phase: 'execution' })
    const res = (await resolvers.Mutation.adminSetPhase(
      null,
      { id, phase: 'financing' },
      ctxFor('sysadmin') as never,
    )) as { lifecyclePhase: string }
    expect(res.lifecyclePhase).toBe('financing')
    await expect(
      resolvers.Mutation.adminSetPhase(null, { id, phase: 'financing2' }, ctxFor('sysadmin') as never),
    ).rejects.toThrow(/Invalid lifecycle phase/)
  })
})

describe('the rule itself (packages/db projectCloseout)', () => {
  it('a status nobody classified blocks the close; it never lets one through', () => {
    // The database constraint will not let a test insert an unknown status, so feed the counting function one.
    const state = summariseInvoiceStatusCounts([
      { status: 'paid', n: 3 },
      { status: 'quarantined', n: '1' },
      { status: 'cancelled', n: 2 },
    ])
    expect(state).toEqual({ live: 4, openByStatus: { quarantined: 1 }, open: 1 })
    expect(projectCloseoutBlocker(state, true)).toMatch(/1 invoice is not fully paid yet \(1 quarantined\)/)
  })

  it('paid and dead invoices settle; a project of only those is closable, with no invoices it is not (non-admin)', () => {
    const settled = summariseInvoiceStatusCounts([{ status: 'paid', n: 2 }, { status: 'void', n: 1 }])
    expect(projectCloseoutBlocker(settled, false)).toBeNull()
    expect(projectCloseoutBlocker(summariseInvoiceStatusCounts([]), false)).toMatch(/no invoices/)
    expect(projectCloseoutBlocker(summariseInvoiceStatusCounts([]), true)).toBeNull()
  })

  it('counts only this company\'s invoices', async () => {
    const id = await makeProject({})
    await addInvoice(id, 'issued')
    expect((await getProjectCloseoutInvoiceState(id, COMPANY_ID)).open).toBe(1)
    expect(await getProjectCloseoutInvoiceState(id, OTHER_COMPANY_ID)).toEqual({ live: 0, openByStatus: {}, open: 0 })
  })

  it('every status the database allows on an invoice is classified: paid, dead, or a known open one', async () => {
    const r = await pool.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'project_invoices_status_check'`,
    )
    const statuses = [...r.rows[0]!.def.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!).sort()
    const known = [...OPEN_INVOICE_STATUSES, PAID_INVOICE_STATUS, ...DEAD_INVOICE_STATUSES].sort()
    expect(statuses).toEqual(known)
  })
})

describe('the phase list is one list', () => {
  const root = path.resolve(__dirname, '../../..')
  const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8')

  it('the keys adminSetPhase accepts are the keys the migrations and the new-company seed create, in order', () => {
    // Rows of the form ('key', 'Label', 7, false) in a VALUES list.
    const seedRows = (src: string) =>
      [...src.matchAll(/\(\s*'([a-z_]+)',\s*'[^']+',\s*(\d+),\s*(?:true|false)\s*\)/g)].map((m) => ({
        key: m[1]!,
        seq: Number(m[2]),
      }))
    const company = seedRows(read('services/auth/src/routes/company-management.ts'))
    expect(company.sort((a, b) => a.seq - b.seq).map((r) => r.key)).toEqual([...PROJECT_LIFECYCLE_PHASE_KEYS])
    expect(company.map((r) => r.seq).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7])

    const m166 = seedRows(read('packages/db/migrations/166_lifecycle_config.sql')).map((r) => r.key)
    const m175 = seedRows(read('packages/db/migrations/175_lifecycle_config_backfill.sql')).map((r) => r.key)
    expect(m175).toEqual(m166)
    // 166/175 create the original six; 319 adds financing.
    const withFinancing = [...m166]
    withFinancing.splice(withFinancing.indexOf('closeout'), 0, 'financing')
    expect(withFinancing).toEqual([...PROJECT_LIFECYCLE_PHASE_KEYS])
    expect(read('packages/db/migrations/319_lifecycle_financing_phase.sql')).toContain("'financing'")
  })
})
