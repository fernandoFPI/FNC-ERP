import { Router } from 'express'
import type { IRouter, Request, Response } from 'express'
import { requireAuth } from '@fnc-erp/auth'
import { pool, query } from '@fnc-erp/db'
import { env } from '@fnc-erp/config'
import { logger } from '@fnc-erp/logger'
import type { AuthContext } from '@fnc-erp/types'

export const mobileSyncRouter: IRouter = Router()

const log = logger.child({ module: 'mobile-sync' })

const SUPPORTED_ENTITIES = [
  'profile',
  'attendance',
  'locations',
  'projects',
  'approvals',
  'products',
  'leave',
  'equipment',
] as const
type EntityType = (typeof SUPPORTED_ENTITIES)[number]

// ── GET /api/v1/mobile/sync ──────────────────────────────────
// Delta sync — returns only records changed since sinceDate.
// Device sends its last sync timestamp; server returns only new/changed data.
mobileSyncRouter.get('/sync', requireAuth(), async (req: Request, res: Response) => {
  const { since, entities, device_id } = req.query as Record<string, string>

  if (!device_id) {
    res.status(400).json({
      success: false,
      error: { code: 'MISSING_DEVICE_ID', message: 'device_id is required' },
    })
    return
  }

  const requestedEntities: EntityType[] = entities
    ? (entities
        .split(',')
        .map((e) => e.trim())
        .filter((e) => SUPPORTED_ENTITIES.includes(e as EntityType)) as EntityType[])
    : [...SUPPORTED_ENTITIES]

  const sinceDate = since ? new Date(since) : new Date(0)
  const userId = req.auth!.userId
  const companyId = req.auth!.companyId
  const platform = (req.headers['x-platform'] as string) ?? 'unknown'
  const syncedAt = new Date()

  log.info(
    { userId, deviceId: device_id, entities: requestedEntities, sinceDate },
    'mobile sync requested',
  )

  const changes: Record<string, { updated: Record<string, unknown>[]; deleted: string[] }> = {}

  try {
    await Promise.all(
      requestedEntities.map(async (entityType) => {
        changes[entityType] = await fetchEntityDelta(entityType, userId, companyId, sinceDate)
      }),
    )

    // Update sync cursors per entity
    await Promise.all(
      requestedEntities.map((entityType) =>
        pool.query(
          `INSERT INTO mobile_sync_cursors (device_id, user_id, entity_type, last_synced_at, records_synced)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (device_id, user_id, entity_type) DO UPDATE
           SET last_synced_at=$4, records_synced=mobile_sync_cursors.records_synced+$5, updated_at=NOW()`,
          [device_id, userId, entityType, syncedAt, changes[entityType].updated.length],
        ),
      ),
    )

    // Upsert device registry
    await pool.query(
      `INSERT INTO device_registry (device_id, user_id, platform, last_sync_at, last_seen_at)
       VALUES ($1,$2,$3,NOW(),NOW())
       ON CONFLICT (device_id) DO UPDATE
       SET last_sync_at=NOW(), last_seen_at=NOW(), user_id=$2, updated_at=NOW()`,
      [device_id, userId, platform],
    )

    const totalRecords = Object.values(changes).reduce((s, c) => s + c.updated.length, 0)
    log.info({ userId, deviceId: device_id, totalRecords }, 'sync completed')

    res.json({ success: true, data: { syncedAt: syncedAt.toISOString(), changes } })
  } catch (err) {
    log.error({ err }, 'mobile sync failed')
    res.status(500).json({ success: false, error: { code: 'SYNC_ERROR', message: 'Sync failed' } })
  }
})

// ── Fetch delta per entity ─────────────────────────────────────
async function fetchEntityDelta(
  entityType: EntityType,
  userId: string,
  companyId: string,
  sinceDate: Date,
): Promise<{ updated: Record<string, unknown>[]; deleted: string[] }> {
  const since = sinceDate.getTime() === 0 ? null : sinceDate

  switch (entityType) {
    case 'profile': {
      const result = await query(
        `SELECT e.id, e.employee_number, e.first_name, e.last_name,
                e.job_title, e.contract_type, e.work_location_id,
                e.department_id, e.hire_date, e.is_active, e.updated_at,
                d.name AS department_name,
                sc.base_amount, sc.pay_type, sc.currency_code AS salary_currency
         FROM employees e
         LEFT JOIN departments d ON d.id = e.department_id
         LEFT JOIN salary_configs sc ON sc.employee_id = e.id AND sc.effective_to IS NULL
         WHERE e.user_id=$1 AND e.company_id=$2
         LIMIT 1`,
        [userId, companyId],
      )
      return { updated: result.rows as Record<string, unknown>[], deleted: [] }
    }

    case 'attendance': {
      const empResult = await query(
        `SELECT id FROM employees WHERE user_id=$1 AND company_id=$2 LIMIT 1`,
        [userId, companyId],
      )
      const employeeId = (empResult.rows[0] as Record<string, unknown> | undefined)?.id
      if (!employeeId) return { updated: [], deleted: [] }

      const result = await query(
        `SELECT id, punch_type, gps_lat, gps_lng, is_valid,
                rejection_reason, punched_at, work_location_id
         FROM attendance_logs
         WHERE employee_id=$1
           AND punched_at >= NOW() - INTERVAL '90 days'
           AND ($2::timestamptz IS NULL OR punched_at >= $2)
         ORDER BY punched_at DESC`,
        [employeeId, since],
      )
      return { updated: result.rows as Record<string, unknown>[], deleted: [] }
    }

    case 'locations': {
      const result = await query(
        `SELECT id, name, code, location_type,
                geo_lat, geo_lng, geo_radius_meters, is_active, updated_at
         FROM work_locations
         WHERE company_id=$1
           AND is_active=true
           AND ($2::timestamptz IS NULL OR updated_at >= $2)
         ORDER BY name`,
        [companyId, since],
      )
      return { updated: result.rows as Record<string, unknown>[], deleted: [] }
    }

    case 'projects': {
      const result = await query(
        `SELECT p.id, p.code, p.name, p.project_type, p.status,
                p.planned_start_date, p.planned_end_date,
                p.budget_amount, p.budget_currency,
                p.client_name, p.updated_at,
                COALESCE(
                  json_agg(
                    json_build_object(
                      'id', ps.id, 'name', ps.name, 'sequence', ps.sequence,
                      'status', ps.status, 'completion_pct', ps.completion_pct
                    ) ORDER BY ps.sequence
                  ) FILTER (WHERE ps.id IS NOT NULL),
                  '[]'::json
                ) AS stages
         FROM projects p
         JOIN project_members pm ON pm.project_id = p.id
         JOIN employees e ON e.id = pm.employee_id
         LEFT JOIN project_stages ps ON ps.project_id = p.id
         WHERE e.user_id=$1
           AND p.company_id=$2
           AND p.status IN ('active','on_hold','submitted')
           AND ($3::timestamptz IS NULL OR p.updated_at >= $3)
         GROUP BY p.id
         ORDER BY p.updated_at DESC
         LIMIT 50`,
        [userId, companyId, since],
      )
      return { updated: result.rows as Record<string, unknown>[], deleted: [] }
    }

    case 'approvals': {
      const empResult = await query(
        `SELECT id FROM employees WHERE user_id=$1 AND company_id=$2 LIMIT 1`,
        [userId, companyId],
      )
      const employeeId = (empResult.rows[0] as Record<string, unknown> | undefined)?.id

      const [poRows, otRows, leaveRows] = await Promise.all([
        query(
          `SELECT po.id, po.po_number, po.status, po.total_amount,
                  po.currency_code, po.created_at, po.updated_at,
                  v.name AS vendor_name, 'purchase_order' AS approval_type
           FROM purchase_orders po
           JOIN vendors v ON v.id = po.vendor_id
           WHERE po.assigned_to=$1
             AND po.status IN ('submitted','pending_review','under_review','approved_l1')
             AND ($2::timestamptz IS NULL OR po.updated_at >= $2)`,
          [userId, since],
        ),
        employeeId
          ? query(
              `SELECT otr.id, otr.work_date, otr.regular_hours, otr.overtime_hours,
                      otr.overtime_multiplier, otr.status, otr.created_at,
                      e.first_name || ' ' || e.last_name AS employee_name,
                      'overtime_request' AS approval_type
               FROM overtime_requests otr
               JOIN employees e ON e.id = otr.employee_id
               JOIN departments d ON d.id = e.department_id
               WHERE d.manager_id=$1
                 AND otr.status='pending'
                 AND ($2::timestamptz IS NULL OR otr.created_at >= $2)`,
              [employeeId, since],
            )
          : Promise.resolve({ rows: [] }),
        employeeId
          ? query(
              `SELECT lr.id, lr.start_date, lr.end_date, lr.days_requested,
                      lr.status, lr.reason, lr.created_at,
                      e.first_name || ' ' || e.last_name AS employee_name,
                      lt.name AS leave_type_name, 'leave_request' AS approval_type
               FROM leave_requests lr
               JOIN employees e ON e.id = lr.employee_id
               JOIN leave_types lt ON lt.id = lr.leave_type_id
               JOIN departments d ON d.id = e.department_id
               WHERE d.manager_id=$1
                 AND lr.status='pending'
                 AND ($2::timestamptz IS NULL OR lr.created_at >= $2)`,
              [employeeId, since],
            )
          : Promise.resolve({ rows: [] }),
      ])

      return {
        updated: [
          ...(poRows.rows as Record<string, unknown>[]),
          ...(otRows.rows as Record<string, unknown>[]),
          ...(leaveRows.rows as Record<string, unknown>[]),
        ],
        deleted: [],
      }
    }

    case 'products': {
      const result = await query(
        `SELECT id, sku, name, uom, category, updated_at
         FROM products
         WHERE company_id=$1
           AND is_active=true
           AND ($2::timestamptz IS NULL OR updated_at >= $2)
         ORDER BY name ASC
         LIMIT 2000`,
        [companyId, since],
      )
      return { updated: result.rows as Record<string, unknown>[], deleted: [] }
    }

    case 'leave': {
      const empResult = await query(
        `SELECT id FROM employees WHERE user_id=$1 AND company_id=$2 LIMIT 1`,
        [userId, companyId],
      )
      const employeeId = (empResult.rows[0] as Record<string, unknown> | undefined)?.id
      if (!employeeId) return { updated: [], deleted: [] }

      const result = await query(
        `SELECT lr.id, lr.start_date, lr.end_date, lr.days_requested,
                lr.status, lr.reason, lr.review_notes, lr.updated_at,
                lt.name AS leave_type_name
         FROM leave_requests lr
         JOIN leave_types lt ON lt.id = lr.leave_type_id
         WHERE lr.employee_id=$1
           AND ($2::timestamptz IS NULL OR lr.updated_at >= $2)
         ORDER BY lr.start_date DESC
         LIMIT 50`,
        [employeeId, since],
      )
      return { updated: result.rows as Record<string, unknown>[], deleted: [] }
    }

    case 'equipment': {
      // Assets deployed on the user's assigned projects + their stats
      const result = await query(
        `SELECT DISTINCT ON (ea.id)
           ea.id, ea.asset_number, ea.name, ea.category,
           ea.status, ea.model, ea.updated_at,
           eas.total_hours_operated,
           eas.last_usage_date,
           eas.maintenance_status,
           eas.next_maintenance_due_date,
           eas.next_maintenance_due_hours,
           elh.location_name AS current_location,
           elh.gps_lat, elh.gps_lng,
           p.id AS project_id, p.name AS project_name, p.code AS project_code
         FROM equipment_assets ea
         JOIN equipment_location_history elh ON elh.asset_id = ea.id
         JOIN projects p ON p.id = elh.project_id
         JOIN project_members pm ON pm.project_id = p.id
         JOIN employees e ON e.id = pm.employee_id
         LEFT JOIN equipment_asset_stats eas ON eas.asset_id = ea.id
         WHERE e.user_id = $1
           AND p.company_id = $2
           AND ea.is_active = true
           AND ($3::timestamptz IS NULL OR ea.updated_at >= $3)
         ORDER BY ea.id, elh.effective_at DESC`,
        [userId, companyId, since],
      )
      return { updated: result.rows as Record<string, unknown>[], deleted: [] }
    }

    default:
      return { updated: [], deleted: [] }
  }
}

// ── POST /api/v1/mobile/actions ──────────────────────────────
// Process offline actions submitted after connectivity restored.
// Actions are sorted by action_taken_at and processed in order.
mobileSyncRouter.post('/actions', requireAuth(), async (req: Request, res: Response) => {
  const { actions, device_id } = req.body as {
    actions: OfflineAction[]
    device_id: string
  }

  if (!Array.isArray(actions) || actions.length === 0) {
    res
      .status(400)
      .json({ success: false, error: { code: 'NO_ACTIONS', message: 'No actions provided' } })
    return
  }

  if (actions.length > 50) {
    res.status(400).json({
      success: false,
      error: { code: 'TOO_MANY_ACTIONS', message: 'Maximum 50 offline actions per submission' },
    })
    return
  }

  const sorted = [...actions].sort(
    (a, b) => new Date(a.action_taken_at).getTime() - new Date(b.action_taken_at).getTime(),
  )

  const results: ActionResult[] = []

  for (const action of sorted) {
    const result = await processOfflineAction(action, req.auth!, device_id)
    results.push(result)

    await pool.query(
      `INSERT INTO offline_action_log
         (device_id, user_id, action_type, payload, action_taken_at,
          offline_duration_seconds, status, result_record_id, rejection_reason, processed_at)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,NOW())`,
      [
        device_id,
        req.auth!.userId,
        action.action_type,
        JSON.stringify(action.payload),
        new Date(action.action_taken_at),
        action.offline_duration_seconds ?? null,
        result.status,
        result.record_id ?? null,
        result.rejection_reason ?? null,
      ],
    )
  }

  const succeeded = results.filter((r) => r.status === 'processed').length
  const failed = results.length - succeeded

  log.info(
    { userId: req.auth!.userId, deviceId: device_id, succeeded, failed },
    'offline actions processed',
  )
  res.json({ success: true, data: { results, succeeded, failed } })
})

// ── Offline action types ──────────────────────────────────────
interface OfflineAction {
  client_id: string
  action_type: string
  payload: Record<string, unknown>
  action_taken_at: string
  offline_duration_seconds?: number
}

interface ActionResult {
  client_id: string
  status: 'processed' | 'rejected' | 'conflict' | 'duplicate'
  record_id?: string | undefined
  rejection_reason?: string | undefined
}

async function processOfflineAction(
  action: OfflineAction,
  auth: AuthContext,
  deviceId: string,
): Promise<ActionResult> {
  // Deduplication — prevent replaying the same action
  const existing = await pool.query(
    `SELECT id FROM offline_action_log
     WHERE device_id=$1 AND payload->>'client_id'=$2
     LIMIT 1`,
    [deviceId, action.client_id],
  )
  if (existing.rows[0]) {
    return { client_id: action.client_id, status: 'duplicate' }
  }

  switch (action.action_type) {
    case 'punch_in':
    case 'punch_out':
      return processPunchAction(action, auth)
    case 'approve_overtime':
    case 'reject_overtime':
      return processOTAction(action, auth)
    case 'approve_leave':
    case 'reject_leave':
      return processLeaveAction(action, auth)
    case 'create_material_issue':
      return processMaterialIssueAction(action, auth)
    default:
      return {
        client_id: action.client_id,
        status: 'rejected',
        rejection_reason: `Unknown action type: ${action.action_type}`,
      }
  }
}

async function processPunchAction(action: OfflineAction, auth: AuthContext): Promise<ActionResult> {
  const p = action.payload
  try {
    const response = await fetch(`${env.HR_SERVICE_URL}/hr/attendance/punch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.SERVICE_TOKEN}`,
        'x-user-id': auth.userId,
        'x-company-id': auth.companyId,
        'x-role': auth.role,
        'x-module': auth.module,
        'x-session-id': 'mobile-sync',
      },
      body: JSON.stringify({
        punch_type: p.punch_type,
        gps_lat: p.gps_lat ?? null,
        gps_lng: p.gps_lng ?? null,
        gps_accuracy_meters: p.gps_accuracy_meters ?? null,
        punched_at: action.action_taken_at,
        offline_submission: true,
      }),
    })

    const result = (await response.json()) as {
      data?: { id?: string }
      error?: { code: string; message: string }
    }

    if (!response.ok) {
      return {
        client_id: action.client_id,
        status: result.error?.code === 'SHIFT_ALREADY_OPEN' ? 'conflict' : 'rejected',
        rejection_reason: result.error?.message,
      }
    }

    return { client_id: action.client_id, status: 'processed', record_id: result.data?.id }
  } catch (err: unknown) {
    return {
      client_id: action.client_id,
      status: 'rejected',
      rejection_reason: `Internal error: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

async function processOTAction(action: OfflineAction, auth: AuthContext): Promise<ActionResult> {
  const p = action.payload
  const requestId = String(p.overtime_request_id)

  const otResult = await pool.query<{ id: string; status: string }>(
    `SELECT id, status FROM overtime_requests WHERE id=$1`,
    [requestId],
  )

  if (!otResult.rows[0]) {
    return {
      client_id: action.client_id,
      status: 'rejected',
      rejection_reason: 'Overtime request not found',
    }
  }

  if (otResult.rows[0].status !== 'pending') {
    return {
      client_id: action.client_id,
      status: 'conflict',
      rejection_reason: `Overtime request was already ${otResult.rows[0].status} — server state preserved`,
    }
  }

  const newStatus = action.action_type === 'approve_overtime' ? 'approved' : 'rejected'
  await pool.query(
    `UPDATE overtime_requests
     SET status=$1, reviewed_by=$2, reviewed_at=$3, review_notes=$4
     WHERE id=$5`,
    [newStatus, auth.userId, new Date(action.action_taken_at), p.review_notes ?? null, requestId],
  )

  return { client_id: action.client_id, status: 'processed', record_id: requestId }
}

async function processLeaveAction(action: OfflineAction, auth: AuthContext): Promise<ActionResult> {
  const p = action.payload
  const requestId = String(p.leave_request_id)

  const leaveResult = await pool.query<{ id: string; status: string }>(
    `SELECT id, status FROM leave_requests WHERE id=$1`,
    [requestId],
  )

  if (!leaveResult.rows[0]) {
    return {
      client_id: action.client_id,
      status: 'rejected',
      rejection_reason: 'Leave request not found',
    }
  }

  if (leaveResult.rows[0].status !== 'pending') {
    return {
      client_id: action.client_id,
      status: 'conflict',
      rejection_reason: `Leave request was already ${leaveResult.rows[0].status} — server state preserved`,
    }
  }

  const newStatus = action.action_type === 'approve_leave' ? 'approved' : 'rejected'
  await pool.query(
    `UPDATE leave_requests
     SET status=$1, reviewed_by=$2, reviewed_at=$3, review_notes=$4, updated_at=NOW()
     WHERE id=$5`,
    [newStatus, auth.userId, new Date(action.action_taken_at), p.review_notes ?? null, requestId],
  )

  return { client_id: action.client_id, status: 'processed', record_id: requestId }
}

async function processMaterialIssueAction(
  action: OfflineAction,
  auth: AuthContext,
): Promise<ActionResult> {
  const p = action.payload
  const lines = p.lines as { product_id: string; from_location_id: string; qty_issued: number }[]

  // Validate stock availability
  for (const line of lines ?? []) {
    const balance = await pool.query<{ qty_on_hand: string }>(
      `SELECT qty_on_hand FROM stock_balances WHERE product_id=$1 AND location_id=$2`,
      [line.product_id, line.from_location_id],
    )
    const available = parseFloat(balance.rows[0]?.qty_on_hand ?? '0')
    if (available < line.qty_issued) {
      return {
        client_id: action.client_id,
        status: 'rejected',
        rejection_reason: `Insufficient stock for product ${line.product_id}. Available: ${available}, Requested: ${line.qty_issued}`,
      }
    }
  }

  try {
    const response = await fetch(
      `${env.PROJECTS_SERVICE_URL}/projects/${String(p.project_id)}/material-issues`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.SERVICE_TOKEN}`,
          'x-user-id': auth.userId,
          'x-company-id': auth.companyId,
          'x-role': auth.role,
          'x-module': auth.module,
          'x-session-id': 'mobile-sync',
        },
        body: JSON.stringify({ issue_date: p.issue_date, notes: p.notes, lines }),
      },
    )

    const result = (await response.json()) as {
      data?: { id?: string }
      error?: { message: string }
    }
    if (!response.ok) {
      return {
        client_id: action.client_id,
        status: 'rejected',
        rejection_reason: result.error?.message,
      }
    }

    const issueId = result.data?.id ?? ''
    // Auto-issue for offline submissions
    await fetch(`${env.PROJECTS_SERVICE_URL}/projects/material-issues/${issueId}/issue`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.SERVICE_TOKEN}`,
        'x-user-id': auth.userId,
        'x-company-id': auth.companyId,
        'x-role': auth.role,
        'x-module': auth.module,
        'x-session-id': 'mobile-sync',
      },
    })

    return { client_id: action.client_id, status: 'processed', record_id: issueId }
  } catch (err: unknown) {
    return {
      client_id: action.client_id,
      status: 'rejected',
      rejection_reason: `Internal error: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

// ── GET /api/v1/mobile/device-info ──────────────────────────
mobileSyncRouter.get('/device-info', requireAuth(), async (req: Request, res: Response) => {
  const { device_id } = req.query as Record<string, string>
  if (!device_id) {
    res.status(400).json({
      success: false,
      error: { code: 'MISSING_DEVICE_ID', message: 'device_id is required' },
    })
    return
  }

  try {
    const [device, cursors] = await Promise.all([
      query(`SELECT * FROM device_registry WHERE device_id=$1`, [device_id]),
      query(
        `SELECT entity_type, last_synced_at, records_synced
         FROM mobile_sync_cursors
         WHERE device_id=$1 AND user_id=$2`,
        [device_id, req.auth!.userId],
      ),
    ])

    res.json({
      success: true,
      data: {
        device: device.rows[0] ?? null,
        syncCursors: cursors.rows,
      },
    })
  } catch (err) {
    log.error({ err }, 'failed to fetch device info')
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch device info' },
    })
  }
})
