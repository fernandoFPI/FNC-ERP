import { query, pool } from '@fnc-erp/db'
import type { PoolClient } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { poStateMachine } from '@fnc-erp/workflow'
import type { POStatus, POAction } from '@fnc-erp/workflow'

interface AuthContext {
  userId: string
  companyId: string
  role: string
}

// ── PO number generation ────────────────────────────────────────────────────

export async function generatePONumber(client: PoolClient, companyId: string): Promise<string> {
  const year = new Date().getFullYear()
  const result = await client.query(
    `SELECT COUNT(*) + 1 AS seq FROM purchase_orders WHERE company_id = $1`,
    [companyId],
  )
  const seq = String(Number(result.rows[0].seq)).padStart(5, '0')
  return `PO-${year}-${seq}`
}

// ── Status transitions ──────────────────────────────────────────────────────

// Core transition logic — must be called inside an existing transaction.
export async function transitionPOInClient(
  client: PoolClient,
  poId: string,
  fromStatus: POStatus,
  toStatus: POStatus,
  action: POAction,
  auth: AuthContext,
  notes?: string,
  auditNewValues?: Record<string, unknown>,
): Promise<void> {
  const current = await client.query(
    `SELECT status FROM purchase_orders WHERE id = $1 FOR UPDATE`,
    [poId],
  )
  if (!current.rows[0])
    throw Object.assign(new Error('PO not found'), { statusCode: 404, code: 'NOT_FOUND' })

  const currentStatus = current.rows[0].status as POStatus
  if (currentStatus !== fromStatus) {
    throw Object.assign(new Error(`Expected status '${fromStatus}', got '${currentStatus}'`), {
      statusCode: 422,
      code: 'INVALID_STATUS',
    })
  }

  if (!poStateMachine.canTransition(currentStatus, action)) {
    throw Object.assign(new Error(`Action '${action}' not allowed from '${currentStatus}'`), {
      statusCode: 422,
      code: 'INVALID_TRANSITION',
    })
  }

  await client.query(`UPDATE purchase_orders SET status = $1, updated_at = NOW() WHERE id = $2`, [
    toStatus,
    poId,
  ])

  await client.query(
    `INSERT INTO po_approval_log (po_id, from_status, to_status, action, actor_id, notes)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [poId, fromStatus, toStatus, action, auth.userId, notes ?? null],
  )

  await logAudit({
    userId: auth.userId,
    companyId: auth.companyId,
    action,
    tableName: 'purchase_orders',
    recordId: poId,
    oldValues: { status: fromStatus },
    newValues: { status: toStatus, ...auditNewValues },
    client,
  })
}

// Convenience wrapper that opens its own transaction.
export async function transitionPO(
  poId: string,
  fromStatus: POStatus,
  toStatus: POStatus,
  action: POAction,
  auth: AuthContext,
  notes?: string,
  auditNewValues?: Record<string, unknown>,
): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await transitionPOInClient(
      client,
      poId,
      fromStatus,
      toStatus,
      action,
      auth,
      notes,
      auditNewValues,
    )
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// ── PO totals recalculation ─────────────────────────────────────────────────

export async function recalculatePOTotals(client: PoolClient, poId: string): Promise<void> {
  await client.query(
    `UPDATE purchase_orders po
     SET subtotal     = COALESCE(lines.total, 0),
         total_amount = COALESCE(lines.total, 0),
         updated_at   = NOW()
     FROM (
       SELECT SUM(total_price) AS total FROM po_lines WHERE po_id = $1
     ) lines
     WHERE po.id = $1`,
    [poId],
  )
}

// ── Notification helpers ────────────────────────────────────────────────────

interface NotificationPayload {
  type: string
  title: string
  body: string
}

// Enqueues outbox notifications for every active holder of `position` on the PO's scope.
export async function notifyPositionHolders(
  poId: string,
  position: string,
  notification: NotificationPayload,
): Promise<void> {
  const poResult = await query(
    `SELECT po.project_id, ou.id AS organizer_user_id
     FROM purchase_orders po
     LEFT JOIN users ou ON ou.id = po.organizer_id
     WHERE po.id = $1`,
    [poId],
  )
  const po = poResult.rows[0]
  if (!po) return

  const deptResult = await query(
    `SELECT e.department_id FROM employees e WHERE e.user_id = $1 LIMIT 1`,
    [po['organizer_user_id']],
  )
  const departmentId = (deptResult.rows[0]?.['department_id'] as string | null) ?? null

  const holders = await query(
    `SELECT DISTINCT u.id AS user_id
     FROM po_position_assignments ppa
     JOIN employees e ON e.id  = ppa.employee_id
     JOIN users     u ON u.id  = e.user_id
     WHERE ppa.position  = $1
       AND ppa.is_active  = true
       AND (
         ($2::uuid IS NOT NULL AND ppa.project_id    = $2)
         OR
         ($3::uuid IS NOT NULL AND ppa.department_id = $3)
       )`,
    [position, (po['project_id'] as string | null) ?? null, departmentId],
  )

  for (const holder of holders.rows) {
    await query(
      `INSERT INTO service_outbox (service, event_type, payload)
       VALUES ('notifications', $1, $2)`,
      [notification.type, JSON.stringify({ userId: holder['user_id'], poId, ...notification })],
    )
  }
}

// Enqueues a single in-app notification outbox row for one specific user.
export async function notifyUser(
  userId: string,
  companyId: string,
  notification: NotificationPayload & { poId?: string; poNumber?: string },
): Promise<void> {
  await query(
    `INSERT INTO service_outbox (service, event_type, payload) VALUES ('notifications', $1, $2)`,
    [notification.type, JSON.stringify({ userId, companyId, ...notification })],
  )
}

// Enqueues notifications to all finance-module users and admins in the company.
export async function notifyFinanceTeam(
  companyId: string,
  notification: NotificationPayload & { poId?: string; poNumber?: string },
): Promise<void> {
  const users = await query(
    `SELECT DISTINCT u.id AS user_id
     FROM users u
     JOIN user_company_roles ucr ON ucr.user_id = u.id
     WHERE ucr.company_id = $1
       AND (ucr.role IN ('company_admin', 'system_admin')
            OR (ucr.module = 'finance' AND ucr.role IN ('module_admin', 'module_user')))
       AND u.is_active = true`,
    [companyId],
  )
  for (const user of users.rows) {
    await query(
      `INSERT INTO service_outbox (service, event_type, payload) VALUES ('notifications', $1, $2)`,
      [notification.type, JSON.stringify({ userId: user['user_id'], companyId, ...notification })],
    )
  }
}

// Enqueues notifications for the organizer's dept head and all system admins.
export async function notifyDeptHeadsAndAdmins(
  poId: string,
  notification: NotificationPayload,
): Promise<void> {
  const poResult = await query(`SELECT po.organizer_id FROM purchase_orders po WHERE po.id = $1`, [
    poId,
  ])
  const organizerId = poResult.rows[0]?.['organizer_id'] as string | undefined
  if (!organizerId) return

  // Department head of organizer's department
  const deptHeads = await query(
    `SELECT DISTINCT u.id AS user_id
     FROM departments d
     JOIN employees mgr ON mgr.id = d.manager_id
     JOIN users     u   ON u.id   = mgr.user_id
     WHERE d.id = (
       SELECT e.department_id FROM employees e WHERE e.user_id = $1 LIMIT 1
     )`,
    [organizerId],
  )

  // All system admins
  const admins = await query(
    `SELECT DISTINCT u.id AS user_id
     FROM users u
     JOIN user_company_roles ucr ON ucr.user_id = u.id
     WHERE ucr.role = 'system_admin' AND u.is_active = true`,
    [],
  )

  const recipients = [...deptHeads.rows, ...admins.rows]
  for (const r of recipients) {
    await query(
      `INSERT INTO service_outbox (service, event_type, payload)
       VALUES ('notifications', $1, $2)`,
      [notification.type, JSON.stringify({ userId: r['user_id'], poId, ...notification })],
    )
  }
}
