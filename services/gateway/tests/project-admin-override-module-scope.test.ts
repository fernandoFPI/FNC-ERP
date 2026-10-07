// Regression test for a real bug: adminSetProjectStatus/adminSetPhase (the
// "Admin Override" section on Project Detail) only ever allowed
// role==='system_admin'|'company_admin' — a projects module_admin satisfies
// the frontend's own visibility check (can('projects.edit'), granted at
// 'admin' level by applyModuleAdminPermissions) and so sees the button, but
// was then rejected by the backend with "Forbidden: admin only". Fixed by
// also accepting isProjectsModuleAdminGW, mirroring the already-correct
// pattern used for project visibility and for procurement's own equivalent
// (adminSetPOStatus / hasProcurementAuthorityGW).
//
// Same real-production-path pattern as procurement-authority-module-scope.test.ts:
// addUserRole (the real admin-UI mutation) grants the role and triggers
// applyModuleAdminPermissions, not a hand-inserted permissions row.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { pool } from '@fnc-erp/db'
import { resolvers } from '../src/graphql/resolvers.js'

const TEST_COMPANY_ID = '00000000-0000-0000-0000-000000000001'
const ADMIN_EMAIL = 'project-admin-override-admin-test@fnc-erp.local'
const MODADMIN_EMAIL = 'project-admin-override-modadmin-test@fnc-erp.local'
const PROJECT_CODE_PREFIX = 'PAOTEST-'

let adminUserId: string
let modAdminUserId: string
let adminCtx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }
let modAdminCtx: { auth: { companyId: string; userId: string; role: string; module: string; sessionId: string } }

async function makeProject(): Promise<string> {
  const code = `${PROJECT_CODE_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const r = await pool.query<{ id: string }>(
    `INSERT INTO projects (company_id, code, name, status, created_by) VALUES ($1,$2,$3,'pending',$4) RETURNING id`,
    [TEST_COMPANY_ID, code, code, adminUserId],
  )
  return r.rows[0]!.id
}

async function setModAdminModule(module: string): Promise<void> {
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM user_company_roles WHERE user_id=$1 AND company_id=$2`,
    [modAdminUserId, TEST_COMPANY_ID],
  )
  if (existing.rows[0]) {
    await resolvers.Mutation.updateUserRole(
      null,
      { roleId: existing.rows[0].id, input: { module } },
      adminCtx as never,
    )
  } else {
    await resolvers.Mutation.addUserRole(
      null,
      { userId: modAdminUserId, input: { companyId: TEST_COMPANY_ID, module, role: 'module_admin' } },
      adminCtx as never,
    )
  }
}

async function cleanup(): Promise<void> {
  await pool.query(`DELETE FROM projects WHERE company_id=$1 AND code LIKE $2`, [
    TEST_COMPANY_ID,
    `${PROJECT_CODE_PREFIX}%`,
  ])
}

beforeAll(async () => {
  const adminR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [ADMIN_EMAIL],
  )
  adminUserId = adminR.rows[0]!.id
  adminCtx = {
    auth: { companyId: TEST_COMPANY_ID, userId: adminUserId, role: 'system_admin', module: 'all', sessionId: 'pao-test-admin' },
  }

  const modAdminR = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1,'test-hash-not-used')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
    [MODADMIN_EMAIL],
  )
  modAdminUserId = modAdminR.rows[0]!.id
  modAdminCtx = {
    auth: { companyId: TEST_COMPANY_ID, userId: modAdminUserId, role: 'module_admin', module: 'projects', sessionId: 'pao-test-modadmin' },
  }

  await cleanup()
})

afterAll(async () => {
  await cleanup()
  await pool.query(`DELETE FROM user_permissions WHERE user_id=$1 AND company_id=$2`, [modAdminUserId, TEST_COMPANY_ID])
  await pool.query(`DELETE FROM user_company_roles WHERE user_id=$1 AND company_id=$2`, [modAdminUserId, TEST_COMPANY_ID])
  await pool.query(`DELETE FROM users WHERE email=$1`, [MODADMIN_EMAIL])
  await pool.query(`DELETE FROM users WHERE email=$1`, [ADMIN_EMAIL])
  await pool.end()
})

describe('Admin Override (adminSetProjectStatus/adminSetPhase) authority scope', () => {
  it('a projects module_admin (real grant via addUserRole) CAN use adminSetProjectStatus', async () => {
    await setModAdminModule('projects')
    const projectId = await makeProject()

    const result = await resolvers.Mutation.adminSetProjectStatus(
      null,
      { id: projectId, status: 'on_hold' },
      modAdminCtx as never,
    )
    expect((result as { status: string }).status).toBe('on_hold')
  })

  it('a projects module_admin (real grant via addUserRole) CAN use adminSetPhase', async () => {
    await setModAdminModule('projects')
    const projectId = await makeProject()

    const result = await resolvers.Mutation.adminSetPhase(
      null,
      { id: projectId, phase: 'scope_review' },
      modAdminCtx as never,
    )
    expect((result as { lifecyclePhase: string }).lifecyclePhase).toBe('scope_review')
  })

  it('a module_admin for an unrelated module (finance) is still blocked from both', async () => {
    await setModAdminModule('finance')
    const projectId = await makeProject()
    const financeCtx = { auth: { ...modAdminCtx.auth, module: 'finance' } }

    await expect(
      resolvers.Mutation.adminSetProjectStatus(null, { id: projectId, status: 'on_hold' }, financeCtx as never),
    ).rejects.toThrow(/forbidden/i)
    await expect(
      resolvers.Mutation.adminSetPhase(null, { id: projectId, phase: 'scope_review' }, financeCtx as never),
    ).rejects.toThrow(/forbidden/i)
  })
})
