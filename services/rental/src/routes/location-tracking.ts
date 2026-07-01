import { Router } from 'express'
import type { IRouter, Request, Response } from 'express'
import { z } from 'zod'
import { pool, query } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const locationRouter: IRouter = Router({ mergeParams: true })

const LocationSchema = z.object({
  movement_type: z.enum(['deployed', 'returned', 'relocated', 'maintenance_in', 'maintenance_out']),
  stock_location_id: z.string().uuid().optional(),
  project_id: z.string().uuid().optional(),
  gps_lat: z.number().min(-90).max(90).optional(),
  gps_lng: z.number().min(-180).max(180).optional(),
  gps_accuracy_meters: z.number().int().min(0).optional(),
  location_name: z.string().max(255).optional(),
  notes: z.string().max(2000).optional(),
  recorded_via: z.enum(['web', 'mobile', 'system']).default('web'),
})

// GET /rental/assets/:id/location
locationRouter.get('/', requirePermission('rental.assets.view', 'view'), async (req, res) => {
  try {
    const current = await query(
      `SELECT elh.*,
              sl.name AS stock_location_name, sl.type AS stock_location_type,
              p.name  AS project_name,         p.code AS project_code,
              u.email AS recorded_by_email
       FROM equipment_location_history elh
       LEFT JOIN stock_locations sl ON sl.id = elh.stock_location_id
       LEFT JOIN projects p ON p.id = elh.project_id
       JOIN users u ON u.id = elh.recorded_by
       WHERE elh.asset_id = $1
       ORDER BY elh.effective_at DESC
       LIMIT 1`,
      [(req.params as Record<string, string>)['id']!],
    )
    sendOk(res, current.rows[0] ?? null)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch asset location', err)
  }
})

// GET /rental/assets/:id/location/history
locationRouter.get('/history', requirePermission('rental.assets.view', 'view'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt((req.query['page'] as string) ?? '1'))
    const limit = Math.min(100, parseInt((req.query['limit'] as string) ?? '50'))
    const offset = (page - 1) * limit

    const history = await query(
      `SELECT elh.*,
              sl.name AS stock_location_name,
              p.name  AS project_name,
              u.email AS recorded_by_email
       FROM equipment_location_history elh
       LEFT JOIN stock_locations sl ON sl.id = elh.stock_location_id
       LEFT JOIN projects p ON p.id = elh.project_id
       JOIN users u ON u.id = elh.recorded_by
       WHERE elh.asset_id = $1
       ORDER BY elh.effective_at DESC
       LIMIT $2 OFFSET $3`,
      [(req.params as Record<string, string>)['id']!, limit, offset],
    )
    sendOk(res, history.rows)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch location history', err)
  }
})

// POST /rental/assets/:id/location
locationRouter.post('/', requirePermission('rental.assets.edit', 'edit'), async (req, res) => {
  const parsed = LocationSchema.safeParse(req.body)
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
    return
  }
  const d = parsed.data

  try {
    const assetRes = await query(
      `SELECT id FROM equipment_assets WHERE id = $1 AND company_id = $2`,
      [(req.params as Record<string, string>)['id']!, req.auth!.companyId],
    )
    if (!assetRes.rows[0]) {
      sendError(res, 404, 'ASSET_NOT_FOUND', 'Asset not found')
      return
    }

    const client = await pool.connect()
    let locationRecord: Record<string, unknown>
    try {
      await client.query('BEGIN')

      const result = await client.query(
        `INSERT INTO equipment_location_history
           (asset_id, stock_location_id, project_id,
            gps_lat, gps_lng, gps_accuracy_meters,
            location_name, movement_type, recorded_by, recorded_via, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [(req.params as Record<string, string>)['id']!, d.stock_location_id ?? null, d.project_id ?? null,
         d.gps_lat ?? null, d.gps_lng ?? null, d.gps_accuracy_meters ?? null,
         d.location_name ?? null, d.movement_type,
         req.auth!.userId, d.recorded_via, d.notes ?? null],
      )
      locationRecord = result.rows[0] as Record<string, unknown>

      if (d.stock_location_id) {
        await client.query(
          `UPDATE equipment_assets SET current_location_id = $1, updated_at = NOW() WHERE id = $2`,
          [d.stock_location_id, (req.params as Record<string, string>)['id']!],
        )
      }

      await client.query(
        `UPDATE equipment_asset_stats
         SET last_location_update = NOW(), updated_at = NOW()
         WHERE asset_id = $1`,
        [(req.params as Record<string, string>)['id']!],
      )

      await logAudit({
        userId: req.auth!.userId,
        companyId: req.auth!.companyId,
        action: 'ASSET_LOCATION_UPDATED',
        tableName: 'equipment_location_history',
        recordId: locationRecord['id'] as string,
        newValues: { movement_type: d.movement_type, location_name: d.location_name, project_id: d.project_id },
        client,
      })

      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    sendOk(res, locationRecord, 201)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to record location update', err)
  }
})

// GET /rental/assets/locations â€” fleet overview (registered at root level)
export async function getFleetLocations(req: Request, res: Response): Promise<void> {
  try {
    const locations = await query(
      `SELECT DISTINCT ON (ea.id)
         ea.id AS asset_id, ea.asset_number, ea.name AS asset_name,
         ea.category, ea.status,
         elh.movement_type, elh.location_name,
         elh.gps_lat, elh.gps_lng,
         elh.effective_at AS location_since,
         p.name AS project_name, p.code AS project_code,
         sl.name AS stock_location_name
       FROM equipment_assets ea
       LEFT JOIN equipment_location_history elh ON elh.asset_id = ea.id
       LEFT JOIN projects p ON p.id = elh.project_id
       LEFT JOIN stock_locations sl ON sl.id = elh.stock_location_id
       WHERE ea.company_id = $1 AND ea.is_active = true
       ORDER BY ea.id, elh.effective_at DESC NULLS LAST`,
      [req.auth!.companyId],
    )
    sendOk(res, locations.rows)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch fleet locations', err)
  }
}

