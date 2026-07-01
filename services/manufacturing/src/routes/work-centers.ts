import { Router } from 'express'
import type { IRouter } from 'express'
import { z } from 'zod'
import { query } from '@fnc-erp/db'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const workCentersRouter: IRouter = Router()

const Schema = z.object({
  name: z.string().min(1).max(255),
  code: z.string().max(50).optional(),
  cost_per_hour: z.number().min(0),
  currency_code: z.string().length(3).default('IQD'),
  capacity_hours_per_day: z.number().min(0).default(8),
})

workCentersRouter.get('/', requirePermission('manufacturing.work_centers.view', 'view'), async (req, res) => {
  try {
    const result = await query('SELECT * FROM work_centers WHERE company_id = $1 AND is_active = true ORDER BY name', [req.auth!.companyId])
    sendOk(res, result.rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch work centers', err) }
})

workCentersRouter.get('/:id', requirePermission('manufacturing.work_centers.view', 'view'), async (req, res) => {
  try {
    const result = await query('SELECT * FROM work_centers WHERE id = $1 AND company_id = $2', [req.params['id'], req.auth!.companyId])
    if (!result.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Work center not found')
    sendOk(res, result.rows[0])
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch work center', err) }
})

workCentersRouter.post('/', requirePermission('manufacturing.work_centers.edit', 'edit'), async (req, res) => {
  try {
    const parsed = Schema.safeParse(req.body)
    if (!parsed.success) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
    const d = parsed.data
    const result = await query(
      `INSERT INTO work_centers (company_id, name, code, cost_per_hour, currency_code, capacity_hours_per_day)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.auth!.companyId, d.name, d.code ?? null, d.cost_per_hour, d.currency_code, d.capacity_hours_per_day],
    )
    sendOk(res, result.rows[0], 201)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create work center', err) }
})

workCentersRouter.put('/:id', requirePermission('manufacturing.work_centers.edit', 'edit'), async (req, res) => {
  try {
    const parsed = Schema.partial().safeParse(req.body)
    if (!parsed.success) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
    const d = parsed.data
    const updates: string[] = []
    const params: unknown[] = []
    let idx = 1
    if (d.name !== undefined) { updates.push(`name = $${idx++}`); params.push(d.name) }
    if (d.cost_per_hour !== undefined) { updates.push(`cost_per_hour = $${idx++}`); params.push(d.cost_per_hour) }
    if (d.capacity_hours_per_day !== undefined) { updates.push(`capacity_hours_per_day = $${idx++}`); params.push(d.capacity_hours_per_day) }
    if (updates.length === 0) return sendError(res, 400, 'NO_CHANGES', 'No fields to update')
    params.push(req.params['id'], req.auth!.companyId)
    const result = await query(
      `UPDATE work_centers SET ${updates.join(', ')} WHERE id = $${idx++} AND company_id = $${idx++} RETURNING *`,
      params,
    )
    if (!result.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Work center not found')
    sendOk(res, result.rows[0])
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update work center', err) }
})

workCentersRouter.delete('/:id', requirePermission('manufacturing.work_centers.edit', 'edit'), async (req, res) => {
  try {
    const active = await query(
      `SELECT COUNT(*) AS cnt FROM manufacturing_orders WHERE company_id = $1 AND status IN ('confirmed','in_progress')
       AND bom_id IN (SELECT bom_id FROM bom_lines WHERE work_center_id = $2)`,
      [req.auth!.companyId, req.params['id']],
    )
    if (parseInt(active.rows[0]?.['cnt'] ?? '0') > 0) {
      return sendError(res, 409, 'HAS_ACTIVE_MOS', 'Cannot delete work center with active manufacturing orders')
    }
    await query('UPDATE work_centers SET is_active = false WHERE id = $1 AND company_id = $2', [req.params['id'], req.auth!.companyId])
    sendOk(res, { deleted: true })
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to delete work center', err) }
})
