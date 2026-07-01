import { Router, type IRouter } from 'express'
import { query, withSystemTransaction } from '@fnc-erp/db'
import { requireAuth } from '@fnc-erp/auth'
import {
  PERMISSION_REGISTRY,
  ALL_PERMISSIONS,
  loadPermissions,
  invalidatePermissionCache,
  requirePermission,
} from '@fnc-erp/permissions'

export const userPermissionsRouter: IRouter = Router()

// ── GET /auth/users/:id/permissions ──────────────────────────────────────────
// Returns the user's current permission map for their company.
// system_admin and company_admin see full registry with current levels.
userPermissionsRouter.get('/:id/permissions', requireAuth(), requirePermission('admin.users.view', 'view'), async (req, res) => {
  try {
    const id = req.params['id'] ?? ''

    const isSelf = req.auth!.userId === id
    const isAdmin = req.auth!.role === 'system_admin' || req.auth!.role === 'company_admin'

    if (!isSelf && !isAdmin) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN' } })
    }

    const userResult = await query<{ [k: string]: string }>(
      `SELECT id, name, email, role, company_id FROM users WHERE id = $1`,
      [id],
    )

    if (userResult.rowCount === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } })
    }

    const user = userResult.rows[0]!
    const companyId = user['company_id'] ?? ''
    const userRole = user['role'] ?? ''
    const userId = user['id'] ?? ''

    // system_admin / company_admin bypass — return all at 'admin' level
    if (userRole === 'system_admin' || userRole === 'company_admin') {
      const permissions = PERMISSION_REGISTRY.map((mod) => ({
        module: mod.key,
        moduleLabel: mod.label,
        submodules: mod.submodules.map((sub) => ({
          submodule: sub.key,
          submoduleLabel: sub.label,
          permissions: sub.permissions.map((perm) => ({
            key: perm.key,
            label: perm.label,
            accessLevel: 'admin',
            isInherited: true,
          })),
        })),
      }))
      return res.json({
        success: true,
        data: { userId, companyId, role: userRole, isBypass: true, permissions },
      })
    }

    const permMap = await loadPermissions(id, companyId)

    const permissions = PERMISSION_REGISTRY.map((mod) => ({
      module: mod.key,
      moduleLabel: mod.label,
      submodules: mod.submodules.map((sub) => ({
        submodule: sub.key,
        submoduleLabel: sub.label,
        permissions: sub.permissions.map((perm) => ({
          key: perm.key,
          label: perm.label,
          accessLevel: permMap[perm.key] ?? 'none',
          isInherited: false,
        })),
      })),
    }))

    return res.json({
      success: true,
      data: { userId, companyId, role: userRole, isBypass: false, permissions },
    })
  } catch (err) {
    console.error('[user-permissions] GET error:', err)
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR' } })
  }
})

// ── PUT /auth/users/:id/permissions ──────────────────────────────────────────
// Replaces the user's permission set. Caller must be system_admin or company_admin.
// Body: { permissions: Array<{ key: string; accessLevel: string }> }
userPermissionsRouter.put('/:id/permissions', requireAuth(), requirePermission('admin.users.edit', 'edit'), async (req, res) => {
  try {
    if (req.auth!.role !== 'system_admin' && req.auth!.role !== 'company_admin') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN' } })
    }

    const id = req.params['id'] ?? ''
    const { permissions } = req.body as {
      permissions: Array<{ key: string; accessLevel: string }>
    }

    if (!Array.isArray(permissions)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'permissions must be an array' },
      })
    }

    const validKeys = new Set(ALL_PERMISSIONS.map((p) => p.key))
    const validLevels = new Set(['none', 'view', 'edit', 'approve', 'admin'])

    for (const p of permissions) {
      if (!validKeys.has(p.key)) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: `Unknown permission key: ${p.key}` },
        })
      }
      if (!validLevels.has(p.accessLevel)) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: `Invalid access level: ${p.accessLevel}` },
        })
      }
    }

    const userResult = await query<{ [k: string]: string }>(
      `SELECT company_id, role FROM users WHERE id = $1`,
      [id],
    )
    if (userResult.rowCount === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } })
    }

    const targetUser = userResult.rows[0]!
    const companyId = targetUser['company_id'] ?? ''
    const targetRole = targetUser['role'] ?? ''

    if (targetRole === 'system_admin' || targetRole === 'company_admin') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Cannot set permissions for admin roles — they have implicit full access',
        },
      })
    }

    await withSystemTransaction(async (client) => {
      await client.query(
        `DELETE FROM user_permissions WHERE user_id = $1 AND company_id = $2`,
        [id, companyId],
      )

      for (const perm of permissions) {
        if (perm.accessLevel === 'none') continue

        await client.query(
          `INSERT INTO user_permissions
             (user_id, company_id, permission_key, access_level, granted_by)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (user_id, company_id, permission_key) DO UPDATE
             SET access_level = EXCLUDED.access_level,
                 granted_by = EXCLUDED.granted_by,
                 updated_at = NOW()`,
          [id, companyId, perm.key, perm.accessLevel, req.auth!.userId],
        )
      }
    })

    await invalidatePermissionCache(id, companyId)

    return res.json({ success: true, data: { message: 'Permissions updated' } })
  } catch (err) {
    console.error('[user-permissions] PUT error:', err)
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR' } })
  }
})
