import { Router } from 'express'
import type { IRouter } from 'express'
import { z } from 'zod'
import { pool, query } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { checkRateStaleness } from '@fnc-erp/fx/staleness'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const fxAdminRouter: IRouter = Router()

const TRACKED_PAIRS = [
  { from: 'USD', to: 'IQD' },
  { from: 'EUR', to: 'IQD' },
  { from: 'GBP', to: 'IQD' },
  { from: 'IQD', to: 'USD' },
  { from: 'IQD', to: 'EUR' },
]

// ── POST /finance/fx-rates/sync ───────────────────────────────
// Manual sync trigger — queues FX_SYNC_REQUESTED in outbox.
// Worker processes it within 5 seconds.
fxAdminRouter.post(
  '/sync',
  requirePermission('finance.fx_rates.edit', 'edit'),
  async (req, res) => {
    try {
      await query(
        `INSERT INTO service_outbox (service, event_type, payload)
       VALUES ('worker','FX_SYNC_REQUESTED',$1::jsonb)`,
        [JSON.stringify({ triggeredBy: req.auth!.userId, syncType: 'manual' })],
      )

      sendOk(res, {
        message: 'FX rate sync queued. Results will appear in sync history within 30 seconds.',
      })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to queue FX sync', err)
    }
  },
)

// ── GET /finance/fx-rates/sync-history ───────────────────────
fxAdminRouter.get(
  '/sync-history',
  requirePermission('finance.fx_rates.view', 'view'),
  async (req, res) => {
    try {
      const page = Math.max(1, parseInt((req.query['page'] as string) || '1'))
      const limit = Math.min(100, parseInt((req.query['limit'] as string) || '20'))
      const offset = (page - 1) * limit

      const history = await query(
        `SELECT fsl.*, COALESCE(u.first_name || ' ' || u.last_name, u.email) AS triggered_by_email
       FROM fx_rate_sync_log fsl
       LEFT JOIN users u ON u.id = fsl.triggered_by
       ORDER BY fsl.created_at DESC
       LIMIT $1 OFFSET $2`,
        [limit, offset],
      )

      sendOk(res, history.rows)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch sync history', err)
    }
  },
)

// ── GET /finance/fx-rates/change-log ─────────────────────────
fxAdminRouter.get(
  '/change-log',
  requirePermission('finance.fx_rates.view', 'view'),
  async (req, res) => {
    try {
      const { from_currency, to_currency, days = '30' } = req.query as Record<string, string>
      const daysNum = Math.min(365, Math.max(1, parseInt(days)))

      const conditions: string[] = [`frc.created_at >= NOW() - INTERVAL '${daysNum} days'`]
      const values: unknown[] = []
      let p = 0

      if (from_currency) {
        conditions.push(`frc.from_currency = $${++p}`)
        values.push(from_currency)
      }
      if (to_currency) {
        conditions.push(`frc.to_currency = $${++p}`)
        values.push(to_currency)
      }

      const changes = await query(
        `SELECT frc.*, u.email AS entered_by_email
       FROM fx_rate_changes frc
       LEFT JOIN users u ON u.id = frc.entered_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY frc.rate_date DESC, frc.created_at DESC
       LIMIT 200`,
        values,
      )

      sendOk(res, changes.rows)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch rate change log', err)
    }
  },
)

// ── GET /finance/fx-rates/staleness ──────────────────────────
fxAdminRouter.get(
  '/staleness',
  requirePermission('finance.fx_rates.view', 'view'),
  async (req, res) => {
    try {
      const statuses = await checkRateStaleness(req.auth!.companyId, TRACKED_PAIRS)

      const hasAnyCritical = statuses.some((s) => s.status === 'critical' || s.status === 'missing')
      const hasAnyWarn = statuses.some((s) => s.status === 'warn')

      sendOk(res, {
        overall: hasAnyCritical ? 'critical' : hasAnyWarn ? 'warn' : 'ok',
        pairs: statuses,
      })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch staleness status', err)
    }
  },
)

// ── GET /finance/fx-rates/alert-config ───────────────────────
fxAdminRouter.get(
  '/alert-config',
  requirePermission('finance.fx_rates.view', 'view'),
  async (req, res) => {
    try {
      const result = await query(`SELECT * FROM fx_rate_alert_config WHERE company_id = $1`, [
        req.auth!.companyId,
      ])
      sendOk(res, result.rows[0] ?? null)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch alert config', err)
    }
  },
)

const AlertConfigSchema = z.object({
  warn_after_hours: z.number().int().min(1).max(720),
  critical_after_hours: z.number().int().min(1).max(720),
  large_movement_pct: z.number().min(0.1).max(50),
  notify_finance_admins: z.boolean(),
})

// ── PUT /finance/fx-rates/alert-config ───────────────────────
fxAdminRouter.put(
  '/alert-config',
  requirePermission('finance.fx_rates.edit', 'edit'),
  async (req, res) => {
    if (!['company_admin', 'system_admin', 'module_admin'].includes(req.auth!.role)) {
      sendError(res, 403, 'FORBIDDEN', 'Company admin or finance module admin required')
      return
    }

    const parsed = AlertConfigSchema.safeParse(req.body)
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
      return
    }

    const { warn_after_hours, critical_after_hours, large_movement_pct, notify_finance_admins } =
      parsed.data

    if (critical_after_hours <= warn_after_hours) {
      sendError(
        res,
        400,
        'INVALID_CONFIG',
        'critical_after_hours must be greater than warn_after_hours',
      )
      return
    }

    try {
      await pool.query(
        `INSERT INTO fx_rate_alert_config
         (company_id, warn_after_hours, critical_after_hours,
          large_movement_pct, notify_finance_admins)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (company_id) DO UPDATE
       SET warn_after_hours      = $2,
           critical_after_hours  = $3,
           large_movement_pct    = $4,
           notify_finance_admins = $5,
           updated_at            = NOW()`,
        [
          req.auth!.companyId,
          warn_after_hours,
          critical_after_hours,
          large_movement_pct,
          notify_finance_admins,
        ],
      )

      await logAudit({
        userId: req.auth!.userId,
        companyId: req.auth!.companyId,
        action: 'FX_ALERT_CONFIG_UPDATED',
        tableName: 'fx_rate_alert_config',
        newValues: parsed.data,
        ipAddress: req.auth!.ipAddress,
        userAgent: req.auth!.userAgent,
      })

      sendOk(res, { message: 'Alert configuration updated' })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update alert config', err)
    }
  },
)
