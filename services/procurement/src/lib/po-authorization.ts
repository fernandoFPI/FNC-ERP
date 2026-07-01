import { query } from '@fnc-erp/db'

export interface POAuthContext {
  userId: string
  companyId: string
  poId: string
}

// Returns the PO's project_id and the organizer's department_id.
async function getPOScope(poId: string): Promise<{ project_id: string | null; department_id: string | null } | null> {
  const result = await query(
    `SELECT po.project_id,
            e.department_id
     FROM purchase_orders po
     LEFT JOIN users ou ON ou.id = po.organizer_id
     LEFT JOIN employees e ON e.user_id = ou.id
     WHERE po.id = $1
     LIMIT 1`,
    [poId],
  )
  if (!result.rows[0]) return null
  return {
    project_id: result.rows[0]['project_id'] as string | null,
    department_id: result.rows[0]['department_id'] as string | null,
  }
}

// Returns the employee id for the given user/company, or null.
async function getEmployeeId(userId: string, companyId: string): Promise<string | null> {
  const result = await query(
    `SELECT id FROM employees WHERE user_id = $1 AND company_id = $2 LIMIT 1`,
    [userId, companyId],
  )
  return result.rows[0]?.['id'] as string | null ?? null
}

// True if the user holds the given position on the PO's project or organizer's department.
export async function userHasPosition(ctx: POAuthContext, position: string): Promise<boolean> {
  const scope = await getPOScope(ctx.poId)
  if (!scope) return false

  const employeeId = await getEmployeeId(ctx.userId, ctx.companyId)
  if (!employeeId) return false

  const result = await query(
    `SELECT id FROM po_position_assignments
     WHERE employee_id   = $1
       AND position      = $2
       AND is_active     = true
       AND company_id    = $3
       AND (
         ($4::uuid IS NOT NULL AND project_id    = $4)
         OR
         ($5::uuid IS NOT NULL AND department_id = $5)
       )
     LIMIT 1`,
    [employeeId, position, ctx.companyId, scope.project_id ?? null, scope.department_id ?? null],
  )
  return result.rows.length > 0
}

// True if the user is the department manager of the organizer's department.
export async function userIsDeptHead(ctx: POAuthContext): Promise<boolean> {
  const result = await query(
    `SELECT 1
     FROM departments d
     JOIN employees mgr  ON mgr.id    = d.manager_id
     JOIN users     mu   ON mu.id     = mgr.user_id
     WHERE mu.id = $1
       AND d.id = (
         SELECT e.department_id
         FROM employees e
         JOIN users ou ON ou.id = e.user_id
         JOIN purchase_orders po ON po.organizer_id = ou.id
         WHERE po.id = $2
         LIMIT 1
       )
     LIMIT 1`,
    [ctx.userId, ctx.poId],
  )
  return result.rows.length > 0
}

// True if the user is the explicitly assigned approver for this PO.
export async function userIsAssignedApprover(ctx: POAuthContext): Promise<boolean> {
  const result = await query(
    `SELECT 1
     FROM purchase_orders po
     JOIN employees e ON e.id  = po.assigned_approver_id
     JOIN users     u ON u.id  = e.user_id
     WHERE po.id = $1 AND u.id = $2
     LIMIT 1`,
    [ctx.poId, ctx.userId],
  )
  return result.rows.length > 0
}

// True if the user is the organizer (creator) of this PO.
export async function userIsOrganizer(ctx: POAuthContext): Promise<boolean> {
  const result = await query(
    `SELECT id FROM purchase_orders WHERE id = $1 AND organizer_id = $2 LIMIT 1`,
    [ctx.poId, ctx.userId],
  )
  return result.rows.length > 0
}
