import { Router } from 'express'
import type { IRouter, Request, Response } from 'express'
import { requireAuth, requireRole } from '@fnc-erp/auth'
import { pool, withTransaction } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { logger } from '@fnc-erp/logger'

export const adminOutboxRouter: IRouter = Router()

const log = logger.child({ module: 'admin-outbox' })

// All routes require system_admin
const requireSysAdmin = [requireAuth(), requireRole('system_admin')]

// ── GET /api/v1/admin/outbox/monitor ─────────────────────────
// Overall outbox health — powers the monitoring dashboard
adminOutboxRouter.get('/monitor', ...requireSysAdmin, async (_req: Request, res: Response) => {
  try {
    const [summary, byEventType, pendingDLQ, stuckEvents] = await Promise.all([
      pool.query(`
        SELECT status, COUNT(*) AS count, MIN(created_at) AS oldest_event
        FROM service_outbox
        GROUP BY status
      `),
      pool.query(`
        SELECT event_type, service, status,
               COUNT(*) AS count,
               MAX(attempts) AS max_attempts_seen,
               MIN(created_at) AS oldest
        FROM service_outbox
        WHERE status IN ('pending','failed','processing')
        GROUP BY event_type, service, status
        ORDER BY count DESC
      `),
      pool.query(`
        SELECT id, event_type, service, priority, status,
               total_attempts, last_error, last_attempted_at, created_at
        FROM outbox_dead_letters
        WHERE status = 'pending'
        ORDER BY
          CASE priority
            WHEN 'critical' THEN 1
            WHEN 'high'     THEN 2
            WHEN 'normal'   THEN 3
            WHEN 'low'      THEN 4
          END,
          created_at DESC
        LIMIT 20
      `),
      pool.query(`
        SELECT id, event_type, service, attempts, created_at
        FROM service_outbox
        WHERE status = 'processing'
          AND updated_at < NOW() - INTERVAL '5 minutes'
      `),
    ])

    const pendingCount = Number(
      summary.rows.find((r: Record<string, unknown>) => r['status'] === 'pending')?.['count'] ?? 0,
    )
    const failedCount = Number(
      summary.rows.find((r: Record<string, unknown>) => r['status'] === 'failed')?.['count'] ?? 0,
    )
    const dlqCount = pendingDLQ.rows.length
    const stuckCount = stuckEvents.rows.length

    const health =
      dlqCount > 0 || stuckCount > 0 ? 'degraded' : failedCount > 10 ? 'degraded' : 'ok'

    res.json({
      success: true,
      data: {
        health,
        summary: summary.rows,
        byEventType: byEventType.rows,
        pendingDLQ: pendingDLQ.rows,
        stuckEvents: stuckEvents.rows,
        counts: { pending: pendingCount, failed: failedCount, dlq: dlqCount, stuck: stuckCount },
        generatedAt: new Date().toISOString(),
      },
    })
  } catch (err) {
    log.error({ err }, 'failed to build outbox monitor summary')
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch monitor data' } })
  }
})

// ── GET /api/v1/admin/outbox/events ──────────────────────────
adminOutboxRouter.get('/events', ...requireSysAdmin, async (req: Request, res: Response) => {
  try {
    const { status, service, event_type, page = '1', limit = '50' } = req.query as Record<string, string>
    const pageNum = Math.max(1, parseInt(page))
    const limitNum = Math.min(200, parseInt(limit))
    const offset = (pageNum - 1) * limitNum

    const conditions: string[] = []
    const values: unknown[] = []
    let p = 0

    if (status) { conditions.push(`status = $${++p}`); values.push(status) }
    if (service) { conditions.push(`service = $${++p}`); values.push(service) }
    if (event_type) { conditions.push(`event_type = $${++p}`); values.push(event_type) }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const countValues = [...values]
    values.push(limitNum, offset)

    const [events, countResult] = await Promise.all([
      pool.query(
        `SELECT id, service, event_type, status, attempts, max_attempts,
                last_error, next_retry_at, created_at, processed_at,
                first_attempted_at, event_priority
         FROM service_outbox
         ${where}
         ORDER BY created_at DESC
         LIMIT $${p + 1} OFFSET $${p + 2}`,
        values,
      ),
      pool.query(`SELECT COUNT(*) AS total FROM service_outbox ${where}`, countValues),
    ])

    res.json({
      success: true,
      data: events.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: parseInt(String(countResult.rows[0]?.['total'] ?? '0')),
        totalPages: Math.ceil(parseInt(String(countResult.rows[0]?.['total'] ?? '0')) / limitNum),
      },
    })
  } catch (err) {
    log.error({ err }, 'failed to list outbox events')
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list events' } })
  }
})

// ── GET /api/v1/admin/outbox/events/:id ──────────────────────
adminOutboxRouter.get('/events/:id', ...requireSysAdmin, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM service_outbox WHERE id=$1`,
      [req.params['id']],
    )
    if (!result.rows[0]) {
      res.status(404).json({ success: false, error: { code: 'EVENT_NOT_FOUND', message: 'Outbox event not found' } })
      return
    }
    res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    log.error({ err }, 'failed to fetch outbox event')
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch event' } })
  }
})

// ── POST /api/v1/admin/outbox/events/:id/retry ───────────────
adminOutboxRouter.post('/events/:id/retry', ...requireSysAdmin, async (req: Request, res: Response) => {
  try {
    const event = await pool.query(
      `SELECT id, status FROM service_outbox WHERE id=$1`,
      [req.params['id']],
    )

    if (!event.rows[0]) {
      res.status(404).json({ success: false, error: { code: 'EVENT_NOT_FOUND', message: 'Outbox event not found' } })
      return
    }

    const currentStatus = String((event.rows[0] as Record<string, unknown>)['status'])
    if (!['failed', 'processing'].includes(currentStatus)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_STATUS', message: `Cannot retry event with status '${currentStatus}'` },
      })
      return
    }

    await pool.query(
      `UPDATE service_outbox
       SET status='pending', attempts=0, last_error=NULL,
           error_history='[]'::jsonb, next_retry_at=NOW(), processed_at=NULL
       WHERE id=$1`,
      [req.params['id']],
    )

    await logAudit({
      userId: req.auth!.userId,
      companyId: req.auth!.companyId,
      action: 'OUTBOX_EVENT_RETRIED',
      tableName: 'service_outbox',
      recordId: req.params['id'],
      newValues: { retriedBy: req.auth!.userId },
      ipAddress: req.auth!.ipAddress,
      userAgent: req.auth!.userAgent,
    })

    log.info({ eventId: req.params['id'], retriedBy: req.auth!.userId }, 'outbox event manually retried')
    res.json({ success: true, data: { message: 'Event reset for immediate retry' } })
  } catch (err) {
    log.error({ err }, 'failed to retry outbox event')
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to retry event' } })
  }
})

// ── POST /api/v1/admin/outbox/stuck/reset ────────────────────
adminOutboxRouter.post('/stuck/reset', ...requireSysAdmin, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `UPDATE service_outbox
       SET status='pending', next_retry_at=NOW(), attempts=GREATEST(0, attempts-1)
       WHERE status='processing'
         AND updated_at < NOW() - INTERVAL '5 minutes'
       RETURNING id, event_type`,
    )

    log.warn(
      { count: result.rows.length, resetBy: req.auth!.userId },
      'stuck processing events reset by admin',
    )

    res.json({ success: true, data: { resetCount: result.rows.length, events: result.rows } })
  } catch (err) {
    log.error({ err }, 'failed to reset stuck events')
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to reset stuck events' } })
  }
})

// ── GET /api/v1/admin/outbox/dlq ─────────────────────────────
adminOutboxRouter.get('/dlq', ...requireSysAdmin, async (req: Request, res: Response) => {
  try {
    const { status = 'pending', priority, event_type, page = '1', limit = '50' } =
      req.query as Record<string, string>
    const pageNum = Math.max(1, parseInt(page))
    const limitNum = Math.min(200, parseInt(limit))
    const offset = (pageNum - 1) * limitNum

    const conditions: string[] = [`status=$1`]
    const values: unknown[] = [status]
    let p = 1

    if (priority) { conditions.push(`priority=$${++p}`); values.push(priority) }
    if (event_type) { conditions.push(`event_type=$${++p}`); values.push(event_type) }

    values.push(limitNum, offset)

    const entries = await pool.query(
      `SELECT dl.*, COALESCE(u.first_name || ' ' || u.last_name, u.email) AS reviewed_by_email
       FROM outbox_dead_letters dl
       LEFT JOIN users u ON u.id = dl.reviewed_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY
         CASE priority
           WHEN 'critical' THEN 1
           WHEN 'high'     THEN 2
           WHEN 'normal'   THEN 3
           WHEN 'low'      THEN 4
         END,
         created_at DESC
       LIMIT $${p + 1} OFFSET $${p + 2}`,
      values,
    )

    res.json({ success: true, data: entries.rows })
  } catch (err) {
    log.error({ err }, 'failed to list DLQ')
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list DLQ' } })
  }
})

// ── GET /api/v1/admin/outbox/dlq/:id ─────────────────────────
adminOutboxRouter.get('/dlq/:id', ...requireSysAdmin, async (req: Request, res: Response) => {
  try {
    const entry = await pool.query(
      `SELECT dl.*, COALESCE(u.first_name || ' ' || u.last_name, u.email) AS reviewed_by_email
       FROM outbox_dead_letters dl
       LEFT JOIN users u ON u.id = dl.reviewed_by
       WHERE dl.id=$1`,
      [req.params['id']],
    )
    if (!entry.rows[0]) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'DLQ entry not found' } })
      return
    }
    res.json({ success: true, data: entry.rows[0] })
  } catch (err) {
    log.error({ err }, 'failed to fetch DLQ entry')
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch DLQ entry' } })
  }
})

// ── POST /api/v1/admin/outbox/dlq/:id/retry ──────────────────
adminOutboxRouter.post('/dlq/:id/retry', ...requireSysAdmin, async (req: Request, res: Response) => {
  try {
    const entry = await pool.query(
      `SELECT * FROM outbox_dead_letters WHERE id=$1 AND status='pending'`,
      [req.params['id']],
    )

    if (!entry.rows[0]) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'DLQ entry not found or already processed' },
      })
      return
    }

    const dlqEntry = entry.rows[0] as Record<string, unknown>
    let newEventId: string | null = null

    await withTransaction(
      { companyId: req.auth!.companyId, userId: req.auth!.userId, role: 'system_admin' },
      async (client) => {
        const newEvent = await client.query<{ id: string }>(
          `INSERT INTO service_outbox
             (service, event_type, payload, status, attempts, next_retry_at)
           VALUES ($1,$2,$3,'pending',0,NOW())
           RETURNING id`,
          [dlqEntry['service'], dlqEntry['event_type'], JSON.stringify(dlqEntry['payload'])],
        )
        newEventId = newEvent.rows[0]!['id']

        await client.query(
          `UPDATE outbox_dead_letters
           SET status='retried',
               reviewed_by=$1,
               reviewed_at=NOW(),
               review_notes=$2,
               retry_outbox_id=$3,
               retried_at=NOW()
           WHERE id=$4`,
          [
            req.auth!.userId,
            String((req.body as Record<string, unknown>)['notes'] ?? `Retried by ${req.auth!.userId}`),
            newEventId,
            req.params['id'],
          ],
        )

        await logAudit({
          userId: req.auth!.userId,
          companyId: req.auth!.companyId,
          action: 'DLQ_ENTRY_RETRIED',
          tableName: 'outbox_dead_letters',
          recordId: req.params['id'],
          newValues: { newOutboxEventId: newEventId, notes: (req.body as Record<string, unknown>)['notes'] },
          client,
        })
      },
    )

    log.info(
      { dlqId: req.params['id'], eventType: dlqEntry['event_type'], newEventId, retriedBy: req.auth!.userId },
      'DLQ entry retried — new outbox event created',
    )
    res.json({ success: true, data: { message: 'DLQ entry queued for retry', newEventId } })
  } catch (err) {
    log.error({ err }, 'failed to retry DLQ entry')
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to retry DLQ entry' } })
  }
})

// ── POST /api/v1/admin/outbox/dlq/:id/dismiss ────────────────
adminOutboxRouter.post('/dlq/:id/dismiss', ...requireSysAdmin, async (req: Request, res: Response) => {
  try {
    const { notes } = req.body as Record<string, unknown>

    if (!notes || String(notes).trim().length < 10) {
      res.status(400).json({
        success: false,
        error: {
          code: 'NOTES_REQUIRED',
          message: 'Dismissal notes required (minimum 10 characters) for audit purposes',
        },
      })
      return
    }

    const result = await pool.query(
      `UPDATE outbox_dead_letters
       SET status='dismissed',
           reviewed_by=$1,
           reviewed_at=NOW(),
           review_notes=$2
       WHERE id=$3 AND status='pending'
       RETURNING id, event_type`,
      [req.auth!.userId, String(notes), req.params['id']],
    )

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'DLQ entry not found or already processed' },
      })
      return
    }

    const r = result.rows[0] as Record<string, unknown>

    await logAudit({
      userId: req.auth!.userId,
      companyId: req.auth!.companyId,
      action: 'DLQ_ENTRY_DISMISSED',
      tableName: 'outbox_dead_letters',
      recordId: String(r['id']),
      newValues: { notes: String(notes) },
      ipAddress: req.auth!.ipAddress,
      userAgent: req.auth!.userAgent,
    })

    log.warn(
      { dlqId: req.params['id'], eventType: r['event_type'], dismissedBy: req.auth!.userId },
      'DLQ entry dismissed by admin',
    )
    res.json({ success: true, data: { message: 'DLQ entry dismissed' } })
  } catch (err) {
    log.error({ err }, 'failed to dismiss DLQ entry')
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to dismiss DLQ entry' } })
  }
})

// ── GET /api/v1/admin/outbox/event-configs ───────────────────
adminOutboxRouter.get('/event-configs', ...requireSysAdmin, async (_req: Request, res: Response) => {
  try {
    const configs = await pool.query(`
      SELECT * FROM outbox_event_configs ORDER BY dlq_priority, event_type
    `)
    res.json({ success: true, data: configs.rows })
  } catch (err) {
    log.error({ err }, 'failed to list event configs')
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list event configs' } })
  }
})

// ── PUT /api/v1/admin/outbox/event-configs/:eventType ────────
adminOutboxRouter.put('/event-configs/:eventType', ...requireSysAdmin, async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>
    const {
      max_attempts,
      initial_retry_delay_seconds,
      backoff_multiplier,
      max_retry_delay_seconds,
      dlq_priority,
      alert_on_dlq,
    } = body

    const result = await pool.query(
      `UPDATE outbox_event_configs
       SET max_attempts                  = COALESCE($1, max_attempts),
           initial_retry_delay_seconds   = COALESCE($2, initial_retry_delay_seconds),
           backoff_multiplier            = COALESCE($3, backoff_multiplier),
           max_retry_delay_seconds       = COALESCE($4, max_retry_delay_seconds),
           dlq_priority                  = COALESCE($5, dlq_priority),
           alert_on_dlq                  = COALESCE($6, alert_on_dlq),
           updated_at                    = NOW()
       WHERE event_type = $7
       RETURNING *`,
      [
        max_attempts ?? null,
        initial_retry_delay_seconds ?? null,
        backoff_multiplier ?? null,
        max_retry_delay_seconds ?? null,
        dlq_priority ?? null,
        alert_on_dlq ?? null,
        req.params['eventType'],
      ],
    )

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Event type config not found' },
      })
      return
    }

    await logAudit({
      userId: req.auth!.userId,
      companyId: req.auth!.companyId,
      action: 'OUTBOX_EVENT_CONFIG_UPDATED',
      tableName: 'outbox_event_configs',
      recordId: String((result.rows[0] as Record<string, unknown>)['id']),
      newValues: body,
      ipAddress: req.auth!.ipAddress,
      userAgent: req.auth!.userAgent,
    })

    // Config changes take effect within 5 minutes when the worker refreshes its cache
    res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    log.error({ err }, 'failed to update event config')
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update event config' } })
  }
})
