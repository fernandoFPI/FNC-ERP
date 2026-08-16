import { query } from '@fnc-erp/db'

interface ProjectAuthContext {
  userId: string
  companyId: string
  projectId: string
}

export async function userIsProjectManager(ctx: ProjectAuthContext): Promise<boolean> {
  const result = await query(
    `
    SELECT p.id FROM projects p
    JOIN employees e ON e.id = p.project_manager_id
    JOIN users u ON u.id = e.user_id
    WHERE p.id = $1
      AND u.id = $2
      AND p.company_id = $3
    LIMIT 1
  `,
    [ctx.projectId, ctx.userId, ctx.companyId],
  )
  return result.rows.length > 0
}

export async function userIsProjectMember(ctx: ProjectAuthContext): Promise<boolean> {
  const result = await query(
    `
    SELECT pm.id FROM project_members pm
    JOIN employees e ON e.id = pm.employee_id
    JOIN users u ON u.id = e.user_id
    WHERE pm.project_id = $1
      AND u.id = $2
      AND pm.is_active = true
    LIMIT 1
  `,
    [ctx.projectId, ctx.userId],
  )
  return result.rows.length > 0
}

// The user who created the project. project_manager_id is a separate,
// optional field the creator picks on the create form (defaults to unset) —
// without this check, a project owner who didn't explicitly name a manager
// (possibly themselves) has no way to manage anything about their own
// project, including fixing project_manager_id itself, since PUT /:id is
// also gated by canManageProject.
export async function userIsProjectCreator(ctx: ProjectAuthContext): Promise<boolean> {
  const result = await query(
    `
    SELECT id FROM projects
    WHERE id = $1 AND created_by = $2 AND company_id = $3
    LIMIT 1
  `,
    [ctx.projectId, ctx.userId, ctx.companyId],
  )
  return result.rows.length > 0
}

export async function canManageProject(ctx: ProjectAuthContext, role: string): Promise<boolean> {
  if (['system_admin', 'company_admin'].includes(role)) return true
  if (await userIsProjectManager(ctx)) return true
  return userIsProjectCreator(ctx)
}

export async function canViewProject(ctx: ProjectAuthContext, role: string): Promise<boolean> {
  if (['system_admin', 'company_admin', 'module_admin'].includes(role)) return true
  const isManager = await userIsProjectManager(ctx)
  if (isManager) return true
  const isMember = await userIsProjectMember(ctx)
  if (isMember) return true
  return userIsProjectCreator(ctx)
}
