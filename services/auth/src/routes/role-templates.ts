import { Router, type IRouter } from 'express'
import { query, withSystemTransaction } from '@fnc-erp/db'
import { requireAuth } from '@fnc-erp/auth'
import { ALL_PERMISSIONS, PERMISSION_REGISTRY, requirePermission } from '@fnc-erp/permissions'

export const roleTemplatesRouter: IRouter = Router()

// ── GET /auth/role-templates ──────────────────────────────────────────────────
roleTemplatesRouter.get(
  '/',
  requireAuth(),
  requirePermission('admin.roles.view', 'view'),
  async (req, res) => {
    try {
      const isAdmin = req.auth!.role === 'system_admin' || req.auth!.role === 'company_admin'
      if (!isAdmin) {
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN' } })
      }

      const templatesResult = await query<Record<string, unknown>>(
        `SELECT id, name, description, is_system, created_at, updated_at
       FROM role_templates
       ORDER BY is_system DESC, name ASC`,
      )

      const permissionsResult = await query<Record<string, string>>(
        `SELECT template_id, permission_key, access_level FROM role_template_permissions`,
      )

      const permsByTemplate: Record<string, { key: string; accessLevel: string }[]> = {}
      for (const row of permissionsResult.rows) {
        const tmplId = row['template_id'] ?? ''
        if (!permsByTemplate[tmplId]) permsByTemplate[tmplId] = []
        permsByTemplate[tmplId].push({
          key: row['permission_key'] ?? '',
          accessLevel: row['access_level'] ?? 'view',
        })
      }

      const templates = templatesResult.rows.map((t) => ({
        id: t['id'],
        name: t['name'],
        description: t['description'],
        isSystem: t['is_system'],
        createdAt: t['created_at'],
        updatedAt: t['updated_at'],
        permissions: permsByTemplate[String(t['id'] ?? '')] ?? [],
      }))

      return res.json({ success: true, data: { templates } })
    } catch (err) {
      console.error('[role-templates] GET list error:', err)
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR' } })
    }
  },
)

// ── GET /auth/role-templates/:id ──────────────────────────────────────────────
roleTemplatesRouter.get(
  '/:id',
  requireAuth(),
  requirePermission('admin.roles.view', 'view'),
  async (req, res) => {
    try {
      const isAdmin = req.auth!.role === 'system_admin' || req.auth!.role === 'company_admin'
      if (!isAdmin) {
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN' } })
      }

      const tmplId = req.params['id'] ?? ''

      const tmplResult = await query<Record<string, unknown>>(
        `SELECT id, name, description, is_system, created_at, updated_at
       FROM role_templates WHERE id = $1`,
        [tmplId],
      )

      if (tmplResult.rowCount === 0) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } })
      }

      const tmpl = tmplResult.rows[0]!

      const permsResult = await query<Record<string, string>>(
        `SELECT permission_key, access_level FROM role_template_permissions WHERE template_id = $1`,
        [tmplId],
      )

      const permMap: Record<string, string> = {}
      for (const row of permsResult.rows) {
        const key = row['permission_key']
        if (key) permMap[key] = row['access_level'] ?? 'view'
      }

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
          })),
        })),
      }))

      return res.json({
        success: true,
        data: {
          id: tmpl['id'],
          name: tmpl['name'],
          description: tmpl['description'],
          isSystem: tmpl['is_system'],
          createdAt: tmpl['created_at'],
          updatedAt: tmpl['updated_at'],
          permissions,
        },
      })
    } catch (err) {
      console.error('[role-templates] GET one error:', err)
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR' } })
    }
  },
)

// ── POST /auth/role-templates ─────────────────────────────────────────────────
roleTemplatesRouter.post(
  '/',
  requireAuth(),
  requirePermission('admin.roles.admin', 'admin'),
  async (req, res) => {
    try {
      if (req.auth!.role !== 'system_admin') {
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN' } })
      }

      const { name, description, permissions } = req.body as {
        name: string
        description?: string
        permissions?: { key: string; accessLevel: string }[]
      }

      if (!name.trim()) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'name is required' },
        })
      }

      const validKeys = new Set(ALL_PERMISSIONS.map((p) => p.key))
      const validLevels = new Set(['view', 'edit', 'approve', 'admin'])

      for (const p of permissions ?? []) {
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

      let newTemplateId: string | undefined

      await withSystemTransaction(async (client) => {
        const result = await client.query<Record<string, unknown>>(
          `INSERT INTO role_templates (name, description, is_system, created_by)
         VALUES ($1, $2, false, $3)
         RETURNING id`,
          [name.trim(), description ?? null, req.auth!.userId],
        )
        newTemplateId = String(result.rows[0]!['id'] ?? '')

        for (const perm of permissions ?? []) {
          await client.query(
            `INSERT INTO role_template_permissions (template_id, permission_key, access_level)
           VALUES ($1, $2, $3)`,
            [newTemplateId, perm.key, perm.accessLevel],
          )
        }
      })

      return res.status(201).json({
        success: true,
        data: { id: newTemplateId, message: 'Template created' },
      })
    } catch (err: unknown) {
      if ((err as { code?: string }).code === '23505') {
        return res.status(409).json({
          success: false,
          error: { code: 'CONFLICT', message: 'A template with that name already exists' },
        })
      }
      console.error('[role-templates] POST error:', err)
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR' } })
    }
  },
)

// ── PUT /auth/role-templates/:id ──────────────────────────────────────────────
roleTemplatesRouter.put(
  '/:id',
  requireAuth(),
  requirePermission('admin.roles.admin', 'admin'),
  async (req, res) => {
    try {
      if (req.auth!.role !== 'system_admin') {
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN' } })
      }

      const tmplId = req.params['id'] ?? ''

      const { name, description, permissions } = req.body as {
        name?: string
        description?: string
        permissions?: { key: string; accessLevel: string }[]
      }

      const validKeys = new Set(ALL_PERMISSIONS.map((p) => p.key))
      const validLevels = new Set(['view', 'edit', 'approve', 'admin'])

      for (const p of permissions ?? []) {
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

      await withSystemTransaction(async (client) => {
        if (name !== undefined || description !== undefined) {
          const updates: string[] = []
          const params: unknown[] = []
          let i = 1

          if (name !== undefined) {
            updates.push(`name = $${i++}`)
            params.push(name.trim())
          }
          if (description !== undefined) {
            updates.push(`description = $${i++}`)
            params.push(description)
          }
          updates.push(`updated_at = NOW()`)
          params.push(tmplId)

          await client.query(
            `UPDATE role_templates SET ${updates.join(', ')} WHERE id = $${i}`,
            params,
          )
        }

        if (permissions !== undefined) {
          await client.query(`DELETE FROM role_template_permissions WHERE template_id = $1`, [
            tmplId,
          ])
          for (const perm of permissions) {
            await client.query(
              `INSERT INTO role_template_permissions (template_id, permission_key, access_level)
             VALUES ($1, $2, $3)`,
              [tmplId, perm.key, perm.accessLevel],
            )
          }
        }
      })

      return res.json({ success: true, data: { message: 'Template updated' } })
    } catch (err) {
      console.error('[role-templates] PUT error:', err)
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR' } })
    }
  },
)

// ── DELETE /auth/role-templates/:id ──────────────────────────────────────────
roleTemplatesRouter.delete(
  '/:id',
  requireAuth(),
  requirePermission('admin.roles.admin', 'admin'),
  async (req, res) => {
    try {
      if (req.auth!.role !== 'system_admin') {
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN' } })
      }

      const tmplId = req.params['id'] ?? ''

      const tmpl = await query<Record<string, unknown>>(
        `SELECT is_system, name FROM role_templates WHERE id = $1`,
        [tmplId],
      )
      if (tmpl.rowCount === 0) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } })
      }
      if (tmpl.rows[0]!['is_system'] === true) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Cannot delete a system template' },
        })
      }

      await query(`DELETE FROM role_templates WHERE id = $1`, [tmplId])

      return res.json({ success: true, data: { message: 'Template deleted' } })
    } catch (err) {
      console.error('[role-templates] DELETE error:', err)
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR' } })
    }
  },
)
