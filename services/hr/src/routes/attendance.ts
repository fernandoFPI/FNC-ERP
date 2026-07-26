import { Router } from 'express'
import type { IRouter } from 'express'
import { z } from 'zod'
import { query } from '@fnc-erp/db'
import { isWithinGeofence } from '../lib/geofence.js'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const attendanceRouter: IRouter = Router()

const PunchSchema = z.object({
  employee_id: z.string().uuid(),
  punch_type: z.enum(['in', 'out']),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  notes: z.string().optional(),
})

attendanceRouter.get('/', requirePermission('attendance.view', 'view'), async (req, res) => {
  try {
    const { employee_id, from, to, page = '1', limit = '100' } = req.query
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string)
    let sql = `SELECT al.*, e.first_name || ' ' || e.last_name AS employee_name
               FROM attendance_logs al
               JOIN employees e ON e.id = al.employee_id
               WHERE al.company_id = $1`
    const params: unknown[] = [req.auth!.companyId]
    let idx = 2
    if (employee_id) {
      sql += ` AND al.employee_id = $${idx++}`
      params.push(employee_id)
    }
    if (from) {
      sql += ` AND al.punched_at >= $${idx++}`
      params.push(from)
    }
    if (to) {
      sql += ` AND al.punched_at <= $${idx++}`
      params.push(to)
    }
    sql += ` ORDER BY al.punched_at DESC LIMIT $${idx++} OFFSET $${idx++}`
    params.push(parseInt(limit as string), offset)
    const result = await query(sql, params)
    sendOk(res, result.rows)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch attendance', err)
  }
})

// POST /attendance/punch — geofenced punch-in/out
attendanceRouter.post('/punch', requirePermission('attendance.edit', 'edit'), async (req, res) => {
  const parsed = PunchSchema.safeParse(req.body)
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
    return
  }

  const { employee_id, punch_type, latitude, longitude, notes } = parsed.data
  const companyId = req.auth!.companyId

  try {
    // Verify employee belongs to company
    const empResult = await query(
      `SELECT id, work_location_id FROM employees WHERE id = $1 AND company_id = $2 AND status = 'active'`,
      [employee_id, companyId],
    )
    const emp = empResult.rows[0] as { id: string; work_location_id: string | null } | undefined
    if (!emp) {
      sendError(res, 404, 'NOT_FOUND', 'Active employee not found')
      return
    }

    let geofenceValid: boolean | null = null
    let distanceM: number | null = null
    let workLocationId = emp.work_location_id

    // Validate geofence if coordinates provided and employee has a work location
    if (latitude != null && longitude != null && workLocationId) {
      const locResult = await query(
        `SELECT latitude, longitude, geofence_radius_m FROM work_locations WHERE id = $1`,
        [workLocationId],
      )
      const loc = locResult.rows[0] as
        | {
            latitude: string | null
            longitude: string | null
            geofence_radius_m: number
          }
        | undefined

      if (loc?.latitude != null && loc.longitude != null) {
        const { valid, distanceMeters } = isWithinGeofence(
          latitude,
          longitude,
          parseFloat(loc.latitude),
          parseFloat(loc.longitude),
          loc.geofence_radius_m,
        )
        geofenceValid = valid
        distanceM = Math.round(distanceMeters * 100) / 100
      }
    } else if (latitude != null && longitude != null) {
      // No assigned location — find nearest active location for this company
      const nearestResult = await query(
        `SELECT id, latitude, longitude, geofence_radius_m FROM work_locations
         WHERE company_id = $1 AND is_active = TRUE AND latitude IS NOT NULL AND longitude IS NOT NULL`,
        [companyId],
      )
      let minDist = Infinity
      for (const loc of nearestResult.rows as {
        id: string
        latitude: string
        longitude: string
        geofence_radius_m: number
      }[]) {
        const { valid, distanceMeters } = isWithinGeofence(
          latitude,
          longitude,
          parseFloat(loc.latitude),
          parseFloat(loc.longitude),
          loc.geofence_radius_m,
        )
        if (distanceMeters < minDist) {
          minDist = distanceMeters
          workLocationId = loc.id
          geofenceValid = valid
          distanceM = Math.round(distanceMeters * 100) / 100
        }
      }
    }

    const result = await query(
      `INSERT INTO attendance_logs (employee_id, company_id, punch_type, latitude, longitude,
       distance_from_location_m, work_location_id, geofence_valid, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        employee_id,
        companyId,
        punch_type,
        latitude ?? null,
        longitude ?? null,
        distanceM,
        workLocationId ?? null,
        geofenceValid,
        notes ?? null,
        req.auth!.userId,
      ],
    )
    sendOk(res, result.rows[0]!, 201)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to record punch', err)
  }
})
