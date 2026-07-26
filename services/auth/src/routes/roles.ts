import { Router, type IRouter, type Request, type Response } from 'express'
import { query, withSystemTransaction } from '@fnc-erp/db'
import { requireAuth, requireRole } from '@fnc-erp/auth'
import { logAudit } from '@fnc-erp/audit'
import { sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const rolesRouter: IRouter = Router()

const VALID_ROLES = ['system_admin', 'company_admin', 'module_admin', 'user'] as const
const VALID_MODULES = [
  'finance',
  'procurement',
  'inventory',
  'hr',
  'payroll',
  'projects',
  'manufacturing',
  'rental',
  'reporting',
  'interco',
  'admin',
  'all',
] as const

// ── GET /auth/roles ────────────────────────────────────────────────────────────

rolesRouter.get(
  '/',
  requireAuth(),
  requireRole('system_admin'),
  requirePermission('admin.roles.admin', 'admin'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { user_id, company_id } = req.query as Record<string, string>

      const conditions: string[] = []
      const values: unknown[] = []
      let p = 0

      if (user_id) {
        conditions.push(`ucr.user_id    = $${++p}`)
        values.push(user_id)
      }
      if (company_id) {
        conditions.push(`ucr.company_id = $${++p}`)
        values.push(company_id)
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

      const result = await query(
        `SELECT
           ucr.id, ucr.user_id, ucr.company_id, ucr.role,
           ucr.module, ucr.is_active, ucr.created_at,
           u.email,
           c.name AS company_name
         FROM user_company_roles ucr
         JOIN users     u ON u.id = ucr.user_id
         JOIN companies c ON c.id = ucr.company_id
         ${where}
         ORDER BY c.name, u.email, ucr.role`,
        values,
      )

      res.json({ success: true, data: result.rows })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list role assignments', err)
    }
  },
)

// ── POST /auth/roles ───────────────────────────────────────────────────────────

rolesRouter.post(
  '/',
  requireAuth(),
  requireRole('system_admin'),
  requirePermission('admin.roles.admin', 'admin'),
  async (req: Request, res: Response): Promise<void> => {
    const { user_id, company_id, role, module: roleModule } = req.body as Record<string, string>

    if (!VALID_ROLES.includes(role as (typeof VALID_ROLES)[number])) {
      sendError(res, 400, 'INVALID_ROLE', `Role must be one of: ${VALID_ROLES.join(', ')}`)
      return
    }

    if (roleModule && !VALID_MODULES.includes(roleModule as (typeof VALID_MODULES)[number])) {
      sendError(res, 400, 'INVALID_MODULE', `Module must be one of: ${VALID_MODULES.join(', ')}`)
      return
    }

    if (role === 'module_admin' && !roleModule) {
      sendError(res, 400, 'MODULE_REQUIRED', 'module_admin role requires a module')
      return
    }

    try {
      const [userExists, companyExists] = await Promise.all([
        query(`SELECT id FROM users WHERE id = $1 AND is_active = true`, [user_id]),
        query(`SELECT id FROM companies WHERE id = $1 AND is_active = true`, [company_id]),
      ])

      if (!userExists.rows[0]) {
        sendError(res, 404, 'USER_NOT_FOUND', 'User not found or inactive')
        return
      }
      if (!companyExists.rows[0]) {
        sendError(res, 404, 'COMPANY_NOT_FOUND', 'Company not found or inactive')
        return
      }

      const assignment = await withSystemTransaction(async (client) => {
        const result = await client.query(
          `INSERT INTO user_company_roles (user_id, company_id, role, module, is_active)
           VALUES ($1, $2, $3, $4, true)
           ON CONFLICT ON CONSTRAINT idx_ucr_unique_active
           DO UPDATE SET is_active = true, updated_at = NOW()
           RETURNING *`,
          [user_id, company_id, role, roleModule ?? null],
        )

        await logAudit({
          userId: req.auth!.userId,
          companyId: undefined,
          action: 'ROLE_ASSIGNED',
          tableName: 'user_company_roles',
          recordId: result.rows[0]?.id,
          newValues: { user_id, company_id, role, module: roleModule },
          ipAddress: req.ip ?? undefined,
          userAgent: String(req.headers['user-agent'] ?? ''),
          client,
        })

        return result.rows[0]
      })

      res.status(201).json({ success: true, data: assignment })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to assign role', err)
    }
  },
)

// ── PATCH /auth/roles/:id ──────────────────────────────────────────────────────

rolesRouter.patch(
  '/:id',
  requireAuth(),
  requireRole('system_admin'),
  requirePermission('admin.roles.admin', 'admin'),
  async (req: Request, res: Response): Promise<void> => {
    const { is_active } = req.body as { is_active?: boolean }
    if (is_active === undefined) {
      sendError(res, 400, 'MISSING_FIELDS', 'is_active is required')
      return
    }

    try {
      const existing = await query(`SELECT * FROM user_company_roles WHERE id = $1`, [
        req.params['id'],
      ])
      if (!existing.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Role assignment not found')
        return
      }

      await withSystemTransaction(async (client) => {
        await client.query(
          `UPDATE user_company_roles SET is_active = $1, updated_at = NOW() WHERE id = $2`,
          [is_active, req.params['id']],
        )

        if (!is_active) {
          await client.query(`DELETE FROM sessions WHERE user_id = $1`, [
            existing.rows[0]?.['user_id'],
          ])
        }

        await logAudit({
          userId: req.auth!.userId,
          companyId: undefined,
          action: is_active ? 'ROLE_ACTIVATED' : 'ROLE_DEACTIVATED',
          tableName: 'user_company_roles',
          recordId: req.params['id'],
          newValues: { is_active },
          client,
        })
      })

      res.json({
        success: true,
        data: { message: `Role ${is_active ? 'activated' : 'deactivated'}` },
      })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update role assignment', err)
    }
  },
)

// ── DELETE /auth/roles/:id ─────────────────────────────────────────────────────

rolesRouter.delete(
  '/:id',
  requireAuth(),
  requireRole('system_admin'),
  requirePermission('admin.roles.admin', 'admin'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const existing = await query(`SELECT * FROM user_company_roles WHERE id = $1`, [
        req.params['id'],
      ])
      if (!existing.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Role assignment not found')
        return
      }

      await withSystemTransaction(async (client) => {
        await client.query(`DELETE FROM user_company_roles WHERE id = $1`, [req.params['id']])

        await logAudit({
          userId: req.auth!.userId,
          companyId: undefined,
          action: 'ROLE_REMOVED',
          tableName: 'user_company_roles',
          recordId: req.params['id'],
          oldValues: {
            user_id: existing.rows[0]?.['user_id'],
            company_id: existing.rows[0]?.['company_id'],
            role: existing.rows[0]?.['role'],
            module: existing.rows[0]?.['module'],
          },
          client,
        })
      })

      res.json({ success: true, data: { message: 'Role removed' } })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to remove role assignment', err)
    }
  },
)
