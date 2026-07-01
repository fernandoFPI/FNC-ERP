import { query } from '@fnc-erp/db'

interface ProjectAuthContext {
  userId: string
  companyId: string
  projectId: string
}

export async function userIsProjectManager(ctx: ProjectAuthContext): Promise<boolean> {
  const result = await query(`
    SELECT p.id FROM projects p
    JOIN employees e ON e.id = p.project_manager_id
    JOIN users u ON u.id = e.user_id
    WHERE p.id = $1
      AND u.id = $2
      AND p.company_id = $3
    LIMIT 1
  `, [ctx.projectId, ctx.userId, ctx.companyId])
  return result.rows.length > 0
}

export async function userIsProjectMember(ctx: ProjectAuthContext): Promise<boolean> {
  const result = await query(`
    SELECT pm.id FROM project_members pm
    JOIN employees e ON e.id = pm.employee_id
    JOIN users u ON u.id = e.user_id
    WHERE pm.project_id = $1
      AND u.id = $2
      AND pm.is_active = true
    LIMIT 1
  `, [ctx.projectId, ctx.userId])
  return result.rows.length > 0
}

export async function canManageProject(ctx: ProjectAuthContext, role: string): Promise<boolean> {
  if (['system_admin', 'company_admin'].includes(role)) return true
  return userIsProjectManager(ctx)
}

export async function canViewProject(ctx: ProjectAuthContext, role: string): Promise<boolean> {
  if (['system_admin', 'company_admin', 'module_admin'].includes(role)) return true
  const isManager = await userIsProjectManager(ctx)
  if (isManager) return true
  return userIsProjectMember(ctx)
}
