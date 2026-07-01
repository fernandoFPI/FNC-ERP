import { Router } from 'express'
import type { IRouter } from 'express'
import { z } from 'zod'
import { query } from '@fnc-erp/db'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const locationsRouter: IRouter = Router()

const LocationSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  geofence_radius_m: z.number().int().positive().default(200),
})

locationsRouter.get('/', requirePermission('hr.departments.view', 'view'), async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM work_locations WHERE company_id = $1 AND is_active = TRUE ORDER BY name`,
      [req.auth!.companyId],
    )
    sendOk(res, result.rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch locations', err) }
})

locationsRouter.get('/:id', requirePermission('hr.departments.view', 'view'), async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM work_locations WHERE id = $1 AND company_id = $2`,
      [req.params['id'], req.auth!.companyId],
    )
    const row = result.rows[0]
    if (!row) return sendError(res, 404, 'NOT_FOUND', 'Location not found')
    sendOk(res, row)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch location', err) }
})

locationsRouter.post('/', requirePermission('hr.departments.edit', 'edit'), async (req, res) => {
  const parsed = LocationSchema.safeParse(req.body)
  if (!parsed.success) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
  try {
    const { name, address, latitude, longitude, geofence_radius_m } = parsed.data
    const result = await query(
      `INSERT INTO work_locations (company_id, name, address, latitude, longitude, geofence_radius_m)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.auth!.companyId, name, address ?? null, latitude ?? null, longitude ?? null, geofence_radius_m],
    )
    sendOk(res, result.rows[0]!, 201)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create location', err) }
})

locationsRouter.put('/:id', requirePermission('hr.departments.edit', 'edit'), async (req, res) => {
  const parsed = LocationSchema.partial().safeParse(req.body)
  if (!parsed.success) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
  try {
    const existing = await query(
      `SELECT id FROM work_locations WHERE id = $1 AND company_id = $2`,
      [req.params['id'], req.auth!.companyId],
    )
    if (!existing.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Location not found')
    const result = await query(
      `UPDATE work_locations SET name = COALESCE($1, name), address = COALESCE($2, address),
       latitude = COALESCE($3, latitude), longitude = COALESCE($4, longitude),
       geofence_radius_m = COALESCE($5, geofence_radius_m), updated_at = NOW()
       WHERE id = $6 AND company_id = $7 RETURNING *`,
      [parsed.data.name ?? null, parsed.data.address ?? null, parsed.data.latitude ?? null,
       parsed.data.longitude ?? null, parsed.data.geofence_radius_m ?? null,
       req.params['id'], req.auth!.companyId],
    )
    sendOk(res, result.rows[0]!)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update location', err) }
})

locationsRouter.delete('/:id', requirePermission('hr.departments.edit', 'edit'), async (req, res) => {
  try {
    const result = await query(
      `UPDATE work_locations SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1 AND company_id = $2 RETURNING id`,
      [req.params['id'], req.auth!.companyId],
    )
    if (!result.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Location not found')
    sendOk(res, { deleted: true })
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to delete location', err) }
})
