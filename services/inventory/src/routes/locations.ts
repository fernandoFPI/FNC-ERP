import { Router } from 'express'
import type { IRouter } from 'express'
import { z } from 'zod'
import { query } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const locationsRouter: IRouter = Router()

const Schema = z.object({
  name: z.string().min(1).max(255),
  code: z.string().max(50).optional(),
  type: z.enum(['warehouse', 'site', 'transit', 'virtual_in', 'virtual_out']),
  parent_id: z.string().uuid().optional(),
  address: z.string().optional(),
})

locationsRouter.get(
  '/',
  requirePermission('inventory.locations.view', 'view'),
  async (req, res) => {
    try {
      const result = await query(
        'SELECT * FROM stock_locations WHERE company_id = $1 ORDER BY code NULLS LAST, name',
        [req.auth!.companyId],
      )
      sendOk(res, result.rows)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch locations', err)
    }
  },
)

locationsRouter.post(
  '/',
  requirePermission('inventory.locations.admin', 'admin'),
  async (req, res) => {
    try {
      const companyId = req.auth!.companyId
      const parsed = Schema.safeParse(req.body)
      if (!parsed.success) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
        return
      }
      const { name, code, type, parent_id, address } = parsed.data
      const result = await query(
        `INSERT INTO stock_locations (company_id, name, code, type, parent_id, address) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [companyId, name, code ?? null, type, parent_id ?? null, address ?? null],
      )
      await logAudit({
        companyId,
        userId: req.auth!.userId,
        action: 'CREATE',
        tableName: 'stock_locations',
        recordId: result.rows[0]!['id'] as string,
      })
      sendOk(res, result.rows[0], 201)
    } catch (err: unknown) {
      const e = err as { code?: string }
      if (e.code === '23505') {
        sendError(res, 409, 'DUPLICATE_CODE', 'Location code already exists')
        return
      }
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create location', err)
    }
  },
)

locationsRouter.put(
  '/:id',
  requirePermission('inventory.locations.admin', 'admin'),
  async (req, res) => {
    try {
      const companyId = req.auth!.companyId
      const parsed = Schema.partial().safeParse(req.body)
      if (!parsed.success) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
        return
      }
      const d = parsed.data
      const updates: string[] = []
      const params: unknown[] = []
      let idx = 1
      if (d.name !== undefined) {
        updates.push(`name = $${idx++}`)
        params.push(d.name)
      }
      if (d.type !== undefined) {
        updates.push(`type = $${idx++}`)
        params.push(d.type)
      }
      if (d.address !== undefined) {
        updates.push(`address = $${idx++}`)
        params.push(d.address)
      }
      if (updates.length === 0) {
        sendError(res, 400, 'NO_CHANGES', 'No fields to update')
        return
      }
      params.push(req.params['id'], companyId)
      const result = await query(
        `UPDATE stock_locations SET ${updates.join(', ')} WHERE id = $${idx++} AND company_id = $${idx++} RETURNING *`,
        params,
      )
      if (!result.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Location not found')
        return
      }
      sendOk(res, result.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update location', err)
    }
  },
)

locationsRouter.delete(
  '/:id',
  requirePermission('inventory.locations.admin', 'admin'),
  async (req, res) => {
    try {
      const companyId = req.auth!.companyId
      await query(
        'UPDATE stock_locations SET is_active = false WHERE id = $1 AND company_id = $2',
        [req.params['id'], companyId],
      )
      await logAudit({
        companyId,
        userId: req.auth!.userId,
        action: 'DELETE',
        tableName: 'stock_locations',
        recordId: req.params['id']!,
      })
      sendOk(res, { deleted: true })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to delete location', err)
    }
  },
)
