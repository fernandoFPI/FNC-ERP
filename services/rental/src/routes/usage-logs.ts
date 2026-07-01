import { Router } from 'express'
import type { IRouter } from 'express'
import { z } from 'zod'
import { pool, query } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { logger } from '@fnc-erp/logger'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const usageLogsRouter: IRouter = Router({ mergeParams: true })

const log = logger.child({ module: 'usage-logs' })

const UsageLogSchema = z.object({
  log_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'log_date must be YYYY-MM-DD'),
  hours_operated: z.number().min(0).max(24),
  fuel_consumed_liters: z.number().min(0).optional(),
  odometer_km: z.number().min(0).optional(),
  engine_hours: z.number().min(0).optional(),
  contract_id: z.string().uuid().optional(),
  project_id: z.string().uuid().optional(),
  notes: z.string().max(2000).optional(),
  recorded_via: z.enum(['mobile', 'web', 'import']).default('mobile'),
})

// GET /rental/assets/:id/usage
usageLogsRouter.get('/', requirePermission('rental.assets.view', 'view'), async (req, res) => {
  try {
    const { from_date, to_date } = req.query as Record<string, string>
    const page = Math.max(1, parseInt((req.query['page'] as string) ?? '1'))
    const limit = Math.min(100, parseInt((req.query['limit'] as string) ?? '30'))
    const offset = (page - 1) * limit

    const params: unknown[] = [(req.params as Record<string, string>)['id']!]
    const conditions: string[] = []
    let idx = 2
    if (from_date) { conditions.push(`eul.log_date >= $${idx++}`); params.push(from_date) }
    if (to_date) { conditions.push(`eul.log_date <= $${idx++}`); params.push(to_date) }
    params.push(limit, offset)

    const where = conditions.length ? `AND ${conditions.join(' AND ')}` : ''
    const logs = await query(
      `SELECT eul.*,
              u.email  AS recorded_by_email,
              v.email  AS verified_by_email,
              p.name   AS project_name
       FROM equipment_usage_logs eul
       JOIN users u ON u.id = eul.recorded_by
       LEFT JOIN users v ON v.id = eul.verified_by
       LEFT JOIN projects p ON p.id = eul.project_id
       WHERE eul.asset_id = $1 ${where}
       ORDER BY eul.log_date DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      params,
    )

    const stats = await query(
      `SELECT * FROM equipment_asset_stats WHERE asset_id = $1`,
      [(req.params as Record<string, string>)['id']!],
    )

    sendOk(res, { logs: logs.rows, stats: stats.rows[0] ?? null })
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch usage logs', err)
  }
})

// GET /rental/assets/:id/usage/summary
usageLogsRouter.get('/summary', requirePermission('rental.assets.view', 'view'), async (req, res) => {
  try {
    const { from_date, to_date } = req.query as Record<string, string>

    const params: unknown[] = [(req.params as Record<string, string>)['id']!]
    const conditions: string[] = []
    let idx = 2
    if (from_date) { conditions.push(`log_date >= $${idx++}`); params.push(from_date) }
    if (to_date) { conditions.push(`log_date <= $${idx++}`); params.push(to_date) }

    const where = conditions.length ? `AND ${conditions.join(' AND ')}` : ''
    const summary = await query(
      `SELECT
         COUNT(*)                                          AS days_logged,
         SUM(hours_operated)                              AS total_hours,
         AVG(hours_operated)                              AS avg_hours_per_day,
         SUM(fuel_consumed_liters)                        AS total_fuel,
         MIN(log_date)                                    AS first_log_date,
         MAX(log_date)                                    AS last_log_date,
         COUNT(*) FILTER (WHERE is_verified = true)       AS verified_days,
         COUNT(*) FILTER (WHERE is_verified = false)      AS unverified_days
       FROM equipment_usage_logs
       WHERE asset_id = $1 ${where}`,
      params,
    )

    sendOk(res, summary.rows[0] ?? null)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch usage summary', err)
  }
})

// POST /rental/assets/:id/usage
usageLogsRouter.post('/', requirePermission('rental.assets.edit', 'edit'), async (req, res) => {
  const parsed = UsageLogSchema.safeParse(req.body)
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
    return
  }

  const { log_date, hours_operated, fuel_consumed_liters, odometer_km,
          engine_hours, contract_id, project_id, notes, recorded_via } = parsed.data
  const assetId = (req.params as Record<string, string>)['id']!!

  try {
    const assetRes = await query(
      `SELECT id, status FROM equipment_assets WHERE id = $1 AND company_id = $2`,
      [assetId, req.auth!.companyId],
    )
    if (!assetRes.rows[0]) {
      sendError(res, 404, 'ASSET_NOT_FOUND', 'Asset not found')
      return
    }
    if ((assetRes.rows[0] as Record<string, unknown>)['status'] === 'disposed') {
      sendError(res, 400, 'ASSET_DISPOSED', 'Cannot log usage for a disposed asset')
      return
    }
    if (new Date(log_date) > new Date()) {
      sendError(res, 400, 'FUTURE_DATE', 'Cannot log usage for a future date')
      return
    }

    const client = await pool.connect()
    let usageLog: Record<string, unknown>
    try {
      await client.query('BEGIN')

      const result = await client.query(
        `INSERT INTO equipment_usage_logs
           (asset_id, contract_id, project_id, log_date,
            hours_operated, fuel_consumed_liters, odometer_km,
            engine_hours, recorded_by, recorded_via, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (asset_id, log_date) DO UPDATE SET
           hours_operated       = EXCLUDED.hours_operated,
           fuel_consumed_liters = EXCLUDED.fuel_consumed_liters,
           odometer_km          = EXCLUDED.odometer_km,
           engine_hours         = EXCLUDED.engine_hours,
           notes                = EXCLUDED.notes,
           recorded_by          = EXCLUDED.recorded_by,
           updated_at           = NOW()
         RETURNING *`,
        [assetId, contract_id ?? null, project_id ?? null, log_date,
         hours_operated, fuel_consumed_liters ?? null, odometer_km ?? null,
         engine_hours ?? null, req.auth!.userId, recorded_via, notes ?? null],
      )
      usageLog = result.rows[0] as Record<string, unknown>

      await logAudit({
        userId: req.auth!.userId,
        companyId: req.auth!.companyId,
        action: 'USAGE_LOG_SUBMITTED',
        tableName: 'equipment_usage_logs',
        recordId: usageLog['id'] as string,
        newValues: { asset_id: assetId, log_date, hours_operated },
        client,
      })

      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    // Check if usage triggered a maintenance warning
    const statsRes = await query(
      `SELECT * FROM equipment_asset_stats WHERE asset_id = $1`,
      [assetId],
    )
    const stat = statsRes.rows[0] as Record<string, unknown> | undefined
    let maintenanceWarning = null
    if (stat?.['next_maintenance_due_hours']) {
      const hoursRemaining =
        Number(stat['next_maintenance_due_hours']) - Number(stat['total_hours_operated'])
      if (hoursRemaining <= 0) {
        maintenanceWarning = {
          type: 'overdue',
          message: `Maintenance overdue by ${Math.abs(hoursRemaining).toFixed(1)} hours`,
        }
      } else if (hoursRemaining <= 20) {
        maintenanceWarning = {
          type: 'due_soon',
          message: `Maintenance due in ${hoursRemaining.toFixed(1)} hours`,
        }
      }
    }

    res.status(201).json({
      success: true,
      data: usageLog,
      ...(maintenanceWarning ? { warnings: [maintenanceWarning] } : {}),
    })
  } catch (err) {
    log.error({ err, assetId }, 'failed to submit usage log')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to submit usage log', err)
  }
})

// POST /rental/assets/:id/usage/:logId/verify
usageLogsRouter.post('/:logId/verify', requirePermission('rental.assets.edit', 'edit'), async (req, res) => {
  const role = req.auth!.role
  if (!['module_admin', 'company_admin', 'system_admin'].includes(role)) {
    sendError(res, 403, 'FORBIDDEN', 'Module admin or above required to verify usage logs')
    return
  }

  try {
    await query(
      `UPDATE equipment_usage_logs
       SET is_verified = true, verified_by = $1, verified_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND asset_id = $3`,
      [req.auth!.userId, req.params['logId'], (req.params as Record<string, string>)['id']!],
    )
    sendOk(res, { message: 'Usage log verified' })
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to verify usage log', err)
  }
})

