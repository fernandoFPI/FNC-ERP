import { Router } from 'express'
import type { IRouter, Request, Response } from 'express'
import { z } from 'zod'
import { pool, query } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const maintenanceRouter: IRouter = Router({ mergeParams: true })

const ScheduleSchema = z.object({
  name: z.string().min(1).max(255),
  maintenance_type: z.enum([
    'oil_change', 'filter_replacement', 'inspection', 'tyre_service',
    'hydraulic_service', 'electrical_check', 'full_service',
    'annual_certification', 'custom',
  ]),
  trigger_type: z.enum(['hours_based', 'calendar', 'both']).default('hours_based'),
  interval_hours: z.number().positive().optional(),
  interval_days: z.number().int().positive().optional(),
  warn_before_hours: z.number().min(0).default(20),
  warn_before_days: z.number().int().min(0).default(7),
  estimated_cost: z.number().min(0).optional(),
  currency_code: z.string().length(3).default('IQD'),
})

const RecordSchema = z.object({
  schedule_id: z.string().uuid().optional(),
  due_date: z.string().optional(),
  due_at_engine_hours: z.number().min(0).optional(),
  performed_by: z.string().max(255).optional(),
  performed_by_external: z.boolean().default(false),
  estimated_cost: z.number().min(0).optional(),
  currency_code: z.string().length(3).default('IQD'),
  notes: z.string().max(2000).optional(),
})

const CompleteSchema = z.object({
  engine_hours_at_service: z.number().min(0).optional(),
  actual_cost: z.number().min(0).optional(),
  findings: z.string().max(5000).optional(),
  parts_replaced: z.string().max(2000).optional(),
  next_service_notes: z.string().max(2000).optional(),
  downtime_hours: z.number().min(0).optional(),
  service_report_path: z.string().max(500).optional(),
})

// â”€â”€ Schedules â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// GET /rental/assets/:id/maintenance/schedules
maintenanceRouter.get('/schedules', requirePermission('rental.maintenance.view', 'view'), async (req, res) => {
  try {
    const schedules = await query(
      `SELECT ms.*,
              eas.total_hours_operated,
              eas.next_maintenance_due_hours,
              eas.next_maintenance_due_date,
              eas.maintenance_status
       FROM maintenance_schedules ms
       JOIN equipment_asset_stats eas ON eas.asset_id = ms.asset_id
       WHERE ms.asset_id = $1 AND ms.company_id = $2
       ORDER BY ms.name`,
      [(req.params as Record<string, string>)['id']!, req.auth!.companyId],
    )
    sendOk(res, schedules.rows)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch maintenance schedules', err)
  }
})

// POST /rental/assets/:id/maintenance/schedules
maintenanceRouter.post('/schedules', requirePermission('rental.maintenance.edit', 'edit'), async (req, res) => {
  const parsed = ScheduleSchema.safeParse(req.body)
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
    return
  }
  const d = parsed.data

  if (d.trigger_type === 'hours_based' && !d.interval_hours) {
    sendError(res, 400, 'MISSING_INTERVAL', 'interval_hours required for hours_based trigger')
    return
  }
  if (d.trigger_type === 'calendar' && !d.interval_days) {
    sendError(res, 400, 'MISSING_INTERVAL', 'interval_days required for calendar trigger')
    return
  }

  try {
    const result = await query(
      `INSERT INTO maintenance_schedules
         (asset_id, company_id, name, maintenance_type, trigger_type,
          interval_hours, interval_days, warn_before_hours, warn_before_days,
          estimated_cost, currency_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [(req.params as Record<string, string>)['id']!, req.auth!.companyId, d.name, d.maintenance_type,
       d.trigger_type, d.interval_hours ?? null, d.interval_days ?? null,
       d.warn_before_hours, d.warn_before_days, d.estimated_cost ?? null, d.currency_code],
    )

    await logAudit({
      userId: req.auth!.userId,
      companyId: req.auth!.companyId,
      action: 'MAINTENANCE_SCHEDULE_CREATED',
      tableName: 'maintenance_schedules',
      recordId: (result.rows[0] as Record<string, unknown>)['id'] as string,
      newValues: d,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
    })

    sendOk(res, result.rows[0], 201)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create maintenance schedule', err)
  }
})

// â”€â”€ Records â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// GET /rental/assets/:id/maintenance/records
maintenanceRouter.get('/records', requirePermission('rental.maintenance.view', 'view'), async (req, res) => {
  try {
    const status = req.query['status'] as string | undefined
    const page = Math.max(1, parseInt((req.query['page'] as string) ?? '1'))
    const limit = Math.min(100, parseInt((req.query['limit'] as string) ?? '20'))
    const offset = (page - 1) * limit

    const params: unknown[] = [(req.params as Record<string, string>)['id']!, req.auth!.companyId]
    let idx = 3
    const conditions: string[] = []
    if (status) { conditions.push(`mr.status = $${idx++}`); params.push(status) }
    params.push(limit, offset)

    const where = conditions.length ? `AND ${conditions.join(' AND ')}` : ''
    const records = await query(
      `SELECT mr.*,
              ms.name AS schedule_name,
              ms.maintenance_type,
              COALESCE(u.first_name || ' ' || u.last_name, u.email) AS created_by_email
       FROM maintenance_records mr
       LEFT JOIN maintenance_schedules ms ON ms.id = mr.schedule_id
       JOIN users u ON u.id = mr.created_by
       WHERE mr.asset_id = $1 AND mr.company_id = $2 ${where}
       ORDER BY mr.due_date DESC NULLS LAST, mr.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      params,
    )
    sendOk(res, records.rows)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch maintenance records', err)
  }
})

// POST /rental/assets/:id/maintenance/records
maintenanceRouter.post('/records', requirePermission('rental.maintenance.edit', 'edit'), async (req, res) => {
  const parsed = RecordSchema.safeParse(req.body)
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
    return
  }
  const d = parsed.data

  try {
    const result = await query(
      `INSERT INTO maintenance_records
         (asset_id, schedule_id, company_id, status, due_date,
          due_at_engine_hours, performed_by, performed_by_external,
          actual_cost, currency_code, findings, created_by)
       VALUES ($1,$2,$3,'scheduled',$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [(req.params as Record<string, string>)['id']!, d.schedule_id ?? null, req.auth!.companyId,
       d.due_date ?? null, d.due_at_engine_hours ?? null,
       d.performed_by ?? null, d.performed_by_external,
       d.estimated_cost ?? null, d.currency_code,
       d.notes ?? null, req.auth!.userId],
    )

    await logAudit({
      userId: req.auth!.userId,
      companyId: req.auth!.companyId,
      action: 'MAINTENANCE_SCHEDULED',
      tableName: 'maintenance_records',
      recordId: (result.rows[0] as Record<string, unknown>)['id'] as string,
      newValues: d,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
    })

    sendOk(res, result.rows[0], 201)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to schedule maintenance', err)
  }
})

// POST /rental/assets/:id/maintenance/records/:recordId/start
maintenanceRouter.post('/records/:recordId/start', requirePermission('rental.maintenance.edit', 'edit'), async (req, res) => {
  try {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      await client.query(
        `UPDATE maintenance_records
         SET status = 'in_progress', started_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND asset_id = $2 AND status = 'scheduled'`,
        [req.params['recordId'], (req.params as Record<string, string>)['id']!],
      )
      await client.query(
        `UPDATE equipment_assets SET status = 'maintenance', updated_at = NOW() WHERE id = $1`,
        [(req.params as Record<string, string>)['id']!],
      )
      await client.query(
        `INSERT INTO equipment_location_history
           (asset_id, movement_type, recorded_by, recorded_via, notes)
         VALUES ($1,'maintenance_in',$2,'web',$3)`,
        [(req.params as Record<string, string>)['id']!, req.auth!.userId, (req.body as Record<string, unknown>)['notes'] ?? 'Taken offline for maintenance'],
      )
      await client.query(
        `UPDATE equipment_asset_stats
         SET maintenance_status = 'in_maintenance', updated_at = NOW()
         WHERE asset_id = $1`,
        [(req.params as Record<string, string>)['id']!],
      )
      await logAudit({
        userId: req.auth!.userId,
        companyId: req.auth!.companyId,
        action: 'MAINTENANCE_STARTED',
        tableName: 'maintenance_records',
        recordId: req.params['recordId']!,
        client,
      })
      const assetId = (req.params as Record<string, string>)['id']!
      const assetRes = await client.query<{ name: string; asset_number: string }>(
        `SELECT name, asset_number FROM equipment_assets WHERE id=$1`, [assetId]
      )
      const assetLabel = assetRes.rows[0] ? `${assetRes.rows[0].asset_number} - ${assetRes.rows[0].name}` : assetId
      const fuRes = await client.query(`SELECT DISTINCT u.id AS user_id FROM users u JOIN user_company_roles ucr ON ucr.user_id=u.id WHERE ucr.company_id=$1 AND (ucr.role IN ('company_admin','system_admin') OR (ucr.module='finance' AND ucr.role IN ('module_admin','module_user'))) AND u.is_active=true`, [req.auth!.companyId])
      for (const u of fuRes.rows) {
        await client.query(`INSERT INTO service_outbox (service,event_type,payload) VALUES ('notifications','MAINTENANCE_STARTED',$1)`, [JSON.stringify({ userId: u['user_id'], companyId: req.auth!.companyId, title: `Maintenance started: ${assetLabel}`, body: `Asset ${assetLabel} has been taken offline for maintenance`, data: { assetId, recordId: req.params['recordId'] } })])
      }
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
    sendOk(res, { message: 'Maintenance started â€” asset set to maintenance status' })
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to start maintenance', err)
  }
})

// POST /rental/assets/:id/maintenance/records/:recordId/complete
maintenanceRouter.post('/records/:recordId/complete', requirePermission('rental.maintenance.edit', 'edit'), async (req, res) => {
  const parsed = CompleteSchema.safeParse(req.body)
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
    return
  }
  const d = parsed.data

  try {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      await client.query(
        `UPDATE maintenance_records
         SET status = 'completed', completed_at = NOW(),
             engine_hours_at_service = $1, actual_cost = $2,
             findings = $3, parts_replaced = $4,
             next_service_notes = $5, downtime_hours = $6,
             service_report_path = $7, updated_at = NOW()
         WHERE id = $8 AND asset_id = $9`,
        [d.engine_hours_at_service ?? null, d.actual_cost ?? null,
         d.findings ?? null, d.parts_replaced ?? null,
         d.next_service_notes ?? null, d.downtime_hours ?? null,
         d.service_report_path ?? null,
         req.params['recordId'], (req.params as Record<string, string>)['id']!],
      )
      await client.query(
        `UPDATE equipment_asset_stats
         SET last_maintenance_at = NOW(),
             last_maintenance_engine_hours = $1,
             maintenance_status = 'ok',
             updated_at = NOW()
         WHERE asset_id = $2`,
        [d.engine_hours_at_service ?? null, (req.params as Record<string, string>)['id']!],
      )
      await client.query(
        `UPDATE equipment_assets SET status = 'available', updated_at = NOW() WHERE id = $1`,
        [(req.params as Record<string, string>)['id']!],
      )
      await client.query(
        `INSERT INTO equipment_location_history
           (asset_id, movement_type, recorded_by, recorded_via, notes)
         VALUES ($1,'maintenance_out',$2,'web','Returned from maintenance')`,
        [(req.params as Record<string, string>)['id']!, req.auth!.userId],
      )
      await logAudit({
        userId: req.auth!.userId,
        companyId: req.auth!.companyId,
        action: 'MAINTENANCE_COMPLETED',
        tableName: 'maintenance_records',
        recordId: req.params['recordId']!,
        newValues: { actual_cost: d.actual_cost, findings: d.findings },
        client,
      })
      const assetId2 = (req.params as Record<string, string>)['id']!
      const assetRes2 = await client.query<{ name: string; asset_number: string }>(
        `SELECT name, asset_number FROM equipment_assets WHERE id=$1`, [assetId2]
      )
      const assetLabel2 = assetRes2.rows[0] ? `${assetRes2.rows[0].asset_number} - ${assetRes2.rows[0].name}` : assetId2
      const fuRes2 = await client.query(`SELECT DISTINCT u.id AS user_id FROM users u JOIN user_company_roles ucr ON ucr.user_id=u.id WHERE ucr.company_id=$1 AND (ucr.role IN ('company_admin','system_admin') OR (ucr.module='finance' AND ucr.role IN ('module_admin','module_user'))) AND u.is_active=true`, [req.auth!.companyId])
      for (const u of fuRes2.rows) {
        await client.query(`INSERT INTO service_outbox (service,event_type,payload) VALUES ('notifications','MAINTENANCE_COMPLETED',$1)`, [JSON.stringify({ userId: u['user_id'], companyId: req.auth!.companyId, title: `Maintenance completed: ${assetLabel2}`, body: `Asset ${assetLabel2} has been returned to service${d.actual_cost != null ? `. Cost: ${d.actual_cost} IQD` : ''}`, data: { assetId: assetId2, recordId: req.params['recordId'], actualCost: d.actual_cost } })])
      }
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
    sendOk(res, { message: 'Maintenance completed â€” asset returned to available' })
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to complete maintenance', err)
  }
})

// GET /rental/maintenance/upcoming  (registered at root rental level)
export async function getUpcomingMaintenance(req: Request, res: Response): Promise<void> {
  const daysAhead = Math.min(365, parseInt((req.query['days_ahead'] as string) ?? '30'))
  try {
    const upcoming = await query(
      `SELECT mr.*,
              ea.name AS asset_name, ea.asset_number, ea.category,
              ms.name AS schedule_name, ms.maintenance_type,
              eas.total_hours_operated, eas.next_maintenance_due_hours,
              CASE
                WHEN mr.due_date < NOW()::DATE                 THEN 'overdue'
                WHEN mr.due_date <= NOW()::DATE + $1::INTEGER  THEN 'upcoming'
                ELSE 'future'
              END AS urgency
       FROM maintenance_records mr
       JOIN equipment_assets ea ON ea.id = mr.asset_id
       JOIN equipment_asset_stats eas ON eas.asset_id = mr.asset_id
       LEFT JOIN maintenance_schedules ms ON ms.id = mr.schedule_id
       WHERE ea.company_id = $2
         AND mr.status IN ('scheduled','overdue')
       ORDER BY
         CASE WHEN mr.due_date < NOW()::DATE THEN 0 ELSE 1 END,
         mr.due_date ASC NULLS LAST
       LIMIT 100`,
      [daysAhead, req.auth!.companyId],
    )
    sendOk(res, upcoming.rows)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch upcoming maintenance', err)
  }
}

