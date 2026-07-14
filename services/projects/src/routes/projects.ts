import { Router } from 'express'
import type { IRouter } from 'express'
import { pool, query, withTransaction } from '@fnc-erp/db'
import type { PoolClient } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { projectStateMachine } from '@fnc-erp/workflow'
import { logger } from '@fnc-erp/logger'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'
import {
  canManageProject,
  canViewProject,
} from '../lib/project-authorization.js'

export const projectsRouter: IRouter = Router()

const log = logger.child({ module: 'projects' })

// ── Helpers ────────────────────────────────────────────────────

async function recordStatusChange(
  client: PoolClient,
  projectId: string,
  fromStatus: string | null,
  toStatus: string,
  userId: string,
  reason?: string,
) {
  await client.query(
    `INSERT INTO project_status_history
       (project_id, from_status, to_status, changed_by, reason)
     VALUES ($1, $2, $3, $4, $5)`,
    [projectId, fromStatus, toStatus, userId, reason ?? null],
  )
}

async function transitionProject(
  projectId: string,
  companyId: string,
  userId: string,
  role: string,
  action: string,
  toStatus: string,
  extras: {
    reason?: string
    hold_reason?: string
    cancel_reason?: string
    submitted_at?: string
    approved_at?: string
    completed_at?: string
    cancelled_at?: string
  } = {},
) {
  await withTransaction({ companyId, userId, role }, async (client) => {
    const current = await client.query(
      `SELECT status FROM projects WHERE id = $1 FOR UPDATE`,
      [projectId],
    )
    if (!current.rows[0]) throw { status: 404, code: 'NOT_FOUND', message: 'Project not found' }

    const fromStatus = current.rows[0].status as string

    // Validate transition
    await projectStateMachine.transition(fromStatus as never, action as never)

    // Build update
    const fields: Array<[string, unknown]> = [['status', toStatus]]
    if (extras.hold_reason !== undefined)  fields.push(['hold_reason',   extras.hold_reason])
    if (extras.cancel_reason !== undefined) fields.push(['cancel_reason', extras.cancel_reason])
    if (extras.submitted_at !== undefined)  fields.push(['submitted_at',  extras.submitted_at])
    if (extras.approved_at !== undefined)   fields.push(['approved_at',   extras.approved_at])
    if (extras.completed_at !== undefined)  fields.push(['completed_at',  extras.completed_at])
    if (extras.cancelled_at !== undefined)  fields.push(['cancelled_at',  extras.cancelled_at])

    const setClause = [...fields.map(([k], i) => `${k} = $${i + 2}`), 'updated_at = NOW()'].join(', ')
    const values = [projectId, ...fields.map(([, v]) => v)]

    await client.query(`UPDATE projects SET ${setClause} WHERE id = $1`, values)

    await recordStatusChange(client, projectId, fromStatus, toStatus, userId, extras.reason)

    await logAudit({
      userId,
      companyId,
      action: `PROJECT_${action.toUpperCase()}`,
      tableName: 'projects',
      recordId: projectId,
      oldValues: { status: fromStatus },
      newValues: { status: toStatus, ...extras },
      client,
    })
  })
}

async function generateProjectCode(client: PoolClient, companyId: string): Promise<string> {
  const company = await client.query(`SELECT name FROM companies WHERE id = $1`, [companyId])
  const prefix = (company.rows[0]?.name as string | undefined)
    ?.split(' ')
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 3) ?? 'PRJ'

  const year = new Date().getFullYear()
  const count = await client.query(
    `SELECT COUNT(*) FROM projects WHERE company_id = $1 AND EXTRACT(YEAR FROM created_at) = $2`,
    [companyId, year],
  )
  const seq = String(parseInt(count.rows[0].count as string) + 1).padStart(3, '0')
  return `${prefix}-${year}-${seq}`
}

async function getNextStageSequence(projectId: string): Promise<number> {
  const result = await query(
    `SELECT COALESCE(MAX(sequence), 0) + 1 AS next_seq FROM project_stages WHERE project_id = $1`,
    [projectId],
  )
  return result.rows[0]?.['next_seq'] as number ?? 1
}

async function checkCompletionBlockers(projectId: string): Promise<string[]> {
  const blockers: string[] = []

  const [openPOs, activeMOs, incompleteStages] = await Promise.all([
    query(
      `SELECT COUNT(*) FROM purchase_orders WHERE project_id = $1 AND status NOT IN ('completed','deleted')`,
      [projectId],
    ),
    query(
      `SELECT COUNT(*) FROM manufacturing_orders WHERE project_id = $1 AND status NOT IN ('completed','cancelled')`,
      [projectId],
    ),
    query(
      `SELECT COUNT(*) FROM project_stages WHERE project_id = $1 AND status NOT IN ('completed','cancelled')`,
      [projectId],
    ),
  ])

  const poCount = parseInt(openPOs.rows[0]?.['count'] as string ?? '0')
  const moCount = parseInt(activeMOs.rows[0]?.['count'] as string ?? '0')
  const stageCount = parseInt(incompleteStages.rows[0]?.['count'] as string ?? '0')

  if (poCount > 0) blockers.push(`${poCount} open purchase order(s) must be completed first`)
  if (moCount > 0) blockers.push(`${moCount} active manufacturing order(s) must be completed first`)
  if (stageCount > 0) blockers.push(`${stageCount} stage(s) are not yet completed`)

  return blockers
}

async function notifyProjectTeam(
  projectId: string,
  notification: { type: string; title: string; body: string },
): Promise<void> {
  try {
    const members = await query(
      `SELECT DISTINCT u.id AS user_id
       FROM project_members pm
       JOIN employees e ON e.id = pm.employee_id
       JOIN users u ON u.id = e.user_id
       WHERE pm.project_id = $1 AND pm.is_active = true
       UNION
       SELECT u.id AS user_id
       FROM projects p
       JOIN employees e ON e.id = p.project_manager_id
       JOIN users u ON u.id = e.user_id
       WHERE p.id = $1`,
      [projectId],
    )
    for (const member of members.rows) {
      await query(
        `INSERT INTO service_outbox (service, event_type, payload) VALUES ('notifications', $1, $2)`,
        [notification.type, JSON.stringify({ userId: member['user_id'], projectId, ...notification })],
      )
    }
  } catch {
    // Notification failure must never break the main operation
  }
}

async function notifyProjectAdmins(
  projectId: string,
  companyId: string,
  notification: { type: string; title: string; body: string },
): Promise<void> {
  try {
    const admins = await query(
      `SELECT DISTINCT u.id AS user_id
       FROM users u
       JOIN user_company_roles ucr ON ucr.user_id = u.id
       WHERE ucr.company_id = $1
         AND (ucr.role IN ('company_admin', 'system_admin')
              OR (ucr.module = 'projects' AND ucr.role = 'module_admin'))
         AND u.is_active = true`,
      [companyId],
    )
    for (const admin of admins.rows) {
      await query(
        `INSERT INTO service_outbox (service, event_type, payload) VALUES ('notifications', $1, $2)`,
        [notification.type, JSON.stringify({ userId: admin['user_id'], companyId, projectId, ...notification })],
      )
    }
  } catch {
    // Notification failure must never break the main operation
  }
}

// ── GET /projects ──────────────────────────────────────────────

projectsRouter.get('/', requirePermission('projects.view', 'view'), async (req, res) => {
  try {
    const {
      status, project_type, project_manager_id, search,
    } = req.query as Record<string, string>
    const page = Math.max(1, parseInt(req.query['page'] as string || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(req.query['limit'] as string || '20')))
    const offset = (page - 1) * limit

    const conditions = [`p.company_id = $1`]
    const values: unknown[] = [req.auth!.companyId]
    let p = 1

    if (status) {
      const statuses = status.split(',').map((s) => s.trim())
      conditions.push(`p.status = ANY($${++p}::text[])`)
      values.push(statuses)
    }
    if (project_type) { conditions.push(`p.project_type = $${++p}`); values.push(project_type) }
    if (project_manager_id) { conditions.push(`p.project_manager_id = $${++p}`); values.push(project_manager_id) }
    if (search) {
      conditions.push(`(p.name ILIKE $${++p} OR p.code ILIKE $${p} OR p.rfq_number ILIKE $${p} OR p.project_location ILIKE $${p})`)
      values.push(`%${search}%`)
    }

    const where = `WHERE ${conditions.join(' AND ')}`
    values.push(limit, offset)

    const [projects, total] = await Promise.all([
      query(
        `SELECT
          p.*,
          e.first_name || ' ' || e.last_name AS manager_name,
          COALESCE(ROUND(AVG(ps.completion_pct))::integer, 0) AS overall_completion_pct,
          COUNT(ps.id) FILTER (WHERE ps.status = 'completed') AS stages_completed,
          COUNT(ps.id) AS stages_total,
          (
            SELECT ps2.name FROM project_stages ps2
            WHERE ps2.project_id = p.id AND ps2.status = 'active'
            ORDER BY ps2.sequence LIMIT 1
          ) AS current_stage_name,
          COUNT(DISTINCT pm.id) FILTER (WHERE pm.is_active = true) AS team_count,
          COUNT(DISTINCT po.id) FILTER (WHERE po.status NOT IN ('completed','deleted')) AS open_po_count,
          COALESCE(SUM(pca.amount), 0) AS total_costs
        FROM projects p
        LEFT JOIN employees e ON e.id = p.project_manager_id
        LEFT JOIN project_stages ps ON ps.project_id = p.id
        LEFT JOIN project_members pm ON pm.project_id = p.id
        LEFT JOIN purchase_orders po ON po.project_id = p.id
        LEFT JOIN project_cost_actuals pca ON pca.project_id = p.id
        ${where}
        GROUP BY p.id, e.first_name, e.last_name
        ORDER BY p.created_at DESC
        LIMIT $${p + 1} OFFSET $${p + 2}`,
        values,
      ),
      query(
        `SELECT COUNT(*) FROM projects p ${where}`,
        values.slice(0, p),
      ),
    ])

    sendOk(res, {
      data: projects.rows,
      pagination: {
        page,
        limit,
        total: parseInt(total.rows[0]?.['count'] as string ?? '0'),
        totalPages: Math.ceil(parseInt(total.rows[0]?.['count'] as string ?? '0') / limit),
      },
    })
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch projects', err)
  }
})

// ── GET /projects/:id ──────────────────────────────────────────

projectsRouter.get('/:id', requirePermission('projects.view', 'view'), async (req, res) => {
  try {
    const ctx = {
      userId: req.auth!.userId,
      companyId: req.auth!.companyId,
      projectId: req.params['id']!,
    }

    const canView = await canViewProject(ctx, req.auth!.role)
    if (!canView) {
      return sendError(res, 403, 'FORBIDDEN', 'Access denied to this project')
    }

    const result = await query(
      `SELECT
        p.*,
        e.first_name || ' ' || e.last_name AS manager_name,
        e.id AS manager_employee_id,
        c.name AS company_name,
        aa.name AS analytic_account_name,
        cc.name AS cost_center_name,
        COALESCE(ROUND(AVG(ps.completion_pct))::integer, 0) AS overall_completion_pct,
        COALESCE(
          json_agg(
            json_build_object(
              'id', ps.id,
              'name', ps.name,
              'sequence', ps.sequence,
              'status', ps.status,
              'completionPct', ps.completion_pct,
              'plannedStartDate', ps.planned_start_date,
              'plannedEndDate', ps.planned_end_date,
              'actualStartDate', ps.actual_start_date,
              'actualEndDate', ps.actual_end_date,
              'notes', ps.notes
            ) ORDER BY ps.sequence
          ) FILTER (WHERE ps.id IS NOT NULL),
          '[]'
        ) AS stages,
        COALESCE(
          (SELECT json_agg(json_build_object(
            'id', pm.id,
            'employeeId', em.id,
            'name', em.first_name || ' ' || em.last_name,
            'role', pm.role,
            'allocatedHours', pm.allocated_hours,
            'startDate', pm.start_date,
            'endDate', pm.end_date,
            'isActive', pm.is_active
          ))
          FROM project_members pm
          JOIN employees em ON em.id = pm.employee_id
          WHERE pm.project_id = p.id AND pm.is_active = true),
          '[]'
        ) AS team,
        COALESCE(
          (SELECT json_build_object('total', SUM(amount))
           FROM project_cost_actuals WHERE project_id = p.id),
          '{"total":0}'::json
        ) AS cost_summary,
        COALESCE(
          (SELECT json_agg(po_data) FROM (
            SELECT json_build_object(
              'id', po.id, 'poNumber', po.po_number,
              'vendorName', v.name, 'totalAmount', po.total_amount,
              'currency', po.currency_code, 'status', po.status
            ) AS po_data
            FROM purchase_orders po LEFT JOIN vendors v ON v.id = po.vendor_id
            WHERE po.project_id = p.id AND po.status != 'deleted'
            ORDER BY po.created_at DESC LIMIT 5
          ) rp),
          '[]'
        ) AS recent_pos,
        (SELECT COUNT(*) FROM purchase_orders WHERE project_id = p.id AND status NOT IN ('completed','deleted'))
          AS open_po_count,
        CASE WHEN p.submission_date IS NOT NULL
          THEN (p.submission_date - CURRENT_DATE)::integer
          ELSE NULL
        END AS days_to_submission,
        COALESCE(
          (SELECT json_agg(h_data)
           FROM (SELECT json_build_object(
             'id', h.id, 'fromStatus', h.from_status, 'toStatus', h.to_status,
             'changedBy', u.email, 'reason', h.reason, 'createdAt', h.created_at
           ) AS h_data
           FROM project_status_history h JOIN users u ON u.id = h.changed_by
           WHERE h.project_id = p.id ORDER BY h.created_at DESC LIMIT 10) h),
          '[]'
        ) AS status_history,
        COALESCE(
          (SELECT json_agg(json_build_object(
            'id', pbl.id, 'category', pbl.category,
            'budgetedAmount', pbl.budgeted_amount
          ) ORDER BY pbl.category)
          FROM project_budget_lines pbl WHERE pbl.project_id = p.id),
          '[]'
        ) AS budget_lines
      FROM projects p
      LEFT JOIN employees e ON e.id = p.project_manager_id
      LEFT JOIN companies c ON c.id = p.company_id
      LEFT JOIN analytic_accounts aa ON aa.id = p.analytic_account_id
      LEFT JOIN cost_centers cc ON cc.id = p.cost_center_id
      LEFT JOIN project_stages ps ON ps.project_id = p.id
      WHERE p.id = $1 AND p.company_id = $2
      GROUP BY p.id, e.first_name, e.last_name, e.id, c.name, aa.name, cc.name`,
      [req.params['id'], req.auth!.companyId],
    )

    if (!result.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Project not found')
    sendOk(res, result.rows[0])
  } catch (err: unknown) {
    const e = err as { status?: number; code?: string; message?: string }
    if (e.status) return sendError(res, e.status, e.code ?? 'ERROR', e.message ?? 'Error')
    log.error(err, 'Failed to get project')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to get project', err)
  }
})

// ── POST /projects ─────────────────────────────────────────────

projectsRouter.post('/', requirePermission('projects.edit', 'edit'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const userId = req.auth!.userId
    const role = req.auth!.role
    const b = req.body as Record<string, unknown>

    if (!b['name']) return sendError(res, 400, 'MISSING_NAME', 'Project name is required')

    await withTransaction({ companyId, userId, role }, async (client) => {
      const projectCode = (b['code'] as string | undefined) ?? await generateProjectCode(client, companyId)

      const analyticAccount = await client.query(
        `INSERT INTO analytic_accounts (company_id, name, code, is_active) VALUES ($1,$2,$3,true) RETURNING id`,
        [companyId, `Project: ${b['name']}`, `PRJ-${projectCode}`],
      )

      const project = await client.query(
        `INSERT INTO projects (
          company_id, name, code, description, project_type,
          client_name, client_contact,
          rfq_number, contract_name, project_location,
          receiving_date, submission_date,
          project_value, project_value_currency,
          planned_start_date, planned_end_date,
          budget_amount, budget_currency,
          project_manager_id, cost_center_id,
          analytic_account_id, remarks, status, created_by
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          $11,$12,$13,$14,$15,$16,$17,$18,
          $19,$20,$21,$22,'pending',$23
        ) RETURNING *`,
        [
          companyId, b['name'], projectCode,
          b['description'] ?? null, b['project_type'] ?? 'construction',
          b['client_name'] ?? null, b['client_contact'] ?? null,
          b['rfq_number'] ?? null, b['contract_name'] ?? null, b['project_location'] ?? null,
          b['receiving_date'] ?? null, b['submission_date'] ?? null,
          b['project_value'] ?? null, b['project_value_currency'] ?? 'IQD',
          b['planned_start_date'] ?? null, b['planned_end_date'] ?? null,
          b['budget_amount'] ?? 0, b['budget_currency'] ?? 'IQD',
          b['project_manager_id'] ?? null, b['cost_center_id'] ?? null,
          analyticAccount.rows[0].id,
          b['remarks'] ?? null, userId,
        ],
      )

      const row = project.rows[0] as Record<string, unknown>

      // Insert inline budget lines if provided
      const budgetLines = b['budget_lines'] as Array<Record<string, unknown>> | undefined
      if (Array.isArray(budgetLines) && budgetLines.length > 0) {
        for (const bl of budgetLines) {
          await client.query(
            `INSERT INTO project_budget_lines (project_id, category, description, account_id, budgeted_amount, currency_code)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [row['id'], bl['category'], bl['description'] ?? null, bl['account_id'] ?? null,
             bl['budgeted_amount'] ?? 0, bl['currency_code'] ?? b['budget_currency'] ?? 'IQD'],
          )
        }
      }

      await recordStatusChange(client, row['id'] as string, null, 'pending', userId)

      await logAudit({
        userId, companyId,
        action: 'PROJECT_CREATED', tableName: 'projects', recordId: row['id'] as string,
        newValues: { name: b['name'], code: projectCode, status: 'pending' },
        client,
      })

      sendOk(res, row, 201)
    })
  } catch (err) {
    log.error(err, 'Failed to create project')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create project', err)
  }
})

// ── PUT /projects/:id ──────────────────────────────────────────

projectsRouter.put('/:id', requirePermission('projects.edit', 'edit'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const userId = req.auth!.userId
    const id = req.params['id']!
    const ctx = { userId, companyId, projectId: id }

    const canManage = await canManageProject(ctx, req.auth!.role)
    if (!canManage) return sendError(res, 403, 'FORBIDDEN', 'Project manager or admin required')

    const b = req.body as Record<string, unknown>

    await query(
      `UPDATE projects SET
        name                   = COALESCE($1,  name),
        description            = COALESCE($2,  description),
        project_type           = COALESCE($3,  project_type),
        client_name            = COALESCE($4,  client_name),
        client_contact         = COALESCE($5,  client_contact),
        rfq_number             = COALESCE($6,  rfq_number),
        contract_name          = COALESCE($7,  contract_name),
        project_location       = COALESCE($8,  project_location),
        receiving_date         = COALESCE($9,  receiving_date),
        submission_date        = COALESCE($10, submission_date),
        project_value          = COALESCE($11, project_value),
        project_value_currency = COALESCE($12, project_value_currency),
        planned_start_date     = COALESCE($13, planned_start_date),
        planned_end_date       = COALESCE($14, planned_end_date),
        budget_amount          = COALESCE($15, budget_amount),
        budget_currency        = COALESCE($16, budget_currency),
        project_manager_id     = COALESCE($17, project_manager_id),
        cost_center_id         = COALESCE($18, cost_center_id),
        remarks                = COALESCE($19, remarks),
        updated_at             = NOW()
      WHERE id = $20 AND company_id = $21`,
      [
        b['name'] ?? null, b['description'] ?? null, b['project_type'] ?? null,
        b['client_name'] ?? null, b['client_contact'] ?? null,
        b['rfq_number'] ?? null, b['contract_name'] ?? null, b['project_location'] ?? null,
        b['receiving_date'] ?? null, b['submission_date'] ?? null,
        b['project_value'] ?? null, b['project_value_currency'] ?? null,
        b['planned_start_date'] ?? null, b['planned_end_date'] ?? null,
        b['budget_amount'] ?? null, b['budget_currency'] ?? null,
        b['project_manager_id'] ?? null, b['cost_center_id'] ?? null,
        b['remarks'] ?? null,
        id, companyId,
      ],
    )

    await logAudit({ userId, companyId, action: 'PROJECT_UPDATED', tableName: 'projects', recordId: id, newValues: b })
    sendOk(res, { message: 'Project updated' })
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update project', err)
  }
})

// ── STATUS TRANSITION ROUTES ───────────────────────────────────

projectsRouter.post('/:id/start', requirePermission('projects.approve', 'approve'), async (req, res) => {
  try {
    const id = req.params['id']!
    const { userId, companyId, role } = req.auth!
    const canManage = await canManageProject({ userId, companyId, projectId: id }, role)
    if (!canManage) return sendError(res, 403, 'FORBIDDEN', 'Project manager or admin required')

    await transitionProject(id, companyId, userId, role, 'start', 'ongoing')
    await notifyProjectTeam(id, { type: 'PROJECT_STARTED', title: 'Project started', body: 'Your project has moved to ongoing status' })
    sendOk(res, { message: 'Project started' })
  } catch (err: unknown) {
    const e = err as { status?: number; name?: string; message?: string; code?: string }
    if (e.name === 'WorkflowError') return sendError(res, 409, 'INVALID_TRANSITION', e.message ?? 'Invalid transition')
    if (e.status) return sendError(res, e.status, e.code ?? 'ERROR', e.message ?? 'Error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Action failed', err)
  }
})

projectsRouter.post('/:id/hold', requirePermission('projects.approve', 'approve'), async (req, res) => {
  try {
    const id = req.params['id']!
    const { userId, companyId, role } = req.auth!
    const { reason } = req.body as { reason?: string }
    if (!reason?.trim()) return sendError(res, 400, 'REASON_REQUIRED', 'Hold reason is required')

    const canManage = await canManageProject({ userId, companyId, projectId: id }, role)
    if (!canManage) return sendError(res, 403, 'FORBIDDEN', 'Project manager or admin required')

    await transitionProject(id, companyId, userId, role, 'hold', 'on_hold', { hold_reason: reason, reason })
    await notifyProjectTeam(id, { type: 'PROJECT_ON_HOLD', title: 'Project placed on hold', body: `Project on hold: ${reason}` })
    sendOk(res, { message: 'Project placed on hold' })
  } catch (err: unknown) {
    const e = err as { status?: number; name?: string; message?: string; code?: string }
    if (e.name === 'WorkflowError') return sendError(res, 409, 'INVALID_TRANSITION', e.message ?? 'Invalid transition')
    if (e.status) return sendError(res, e.status, e.code ?? 'ERROR', e.message ?? 'Error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Action failed', err)
  }
})

projectsRouter.post('/:id/resume', requirePermission('projects.approve', 'approve'), async (req, res) => {
  try {
    const id = req.params['id']!
    const { userId, companyId, role } = req.auth!
    const canManage = await canManageProject({ userId, companyId, projectId: id }, role)
    if (!canManage) return sendError(res, 403, 'FORBIDDEN', 'Project manager or admin required')

    await transitionProject(id, companyId, userId, role, 'resume', 'ongoing')
    await notifyProjectTeam(id, { type: 'PROJECT_RESUMED', title: 'Project resumed', body: 'Project has resumed from on hold' })
    sendOk(res, { message: 'Project resumed' })
  } catch (err: unknown) {
    const e = err as { status?: number; name?: string; message?: string; code?: string }
    if (e.name === 'WorkflowError') return sendError(res, 409, 'INVALID_TRANSITION', e.message ?? 'Invalid transition')
    if (e.status) return sendError(res, e.status, e.code ?? 'ERROR', e.message ?? 'Error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Action failed', err)
  }
})

projectsRouter.post('/:id/submit', requirePermission('projects.edit', 'edit'), async (req, res) => {
  try {
    const id = req.params['id']!
    const { userId, companyId, role } = req.auth!
    const canManage = await canManageProject({ userId, companyId, projectId: id }, role)
    if (!canManage) return sendError(res, 403, 'FORBIDDEN', 'Project manager or admin required')

    await transitionProject(id, companyId, userId, role, 'submit', 'submitted', { submitted_at: new Date().toISOString() })
    await notifyProjectAdmins(id, companyId, { type: 'PROJECT_SUBMITTED', title: 'Project submitted for approval', body: 'A project has been submitted and requires your approval' })
    sendOk(res, { message: 'Project submitted to client' })
  } catch (err: unknown) {
    const e = err as { status?: number; name?: string; message?: string; code?: string }
    if (e.name === 'WorkflowError') return sendError(res, 409, 'INVALID_TRANSITION', e.message ?? 'Invalid transition')
    if (e.status) return sendError(res, e.status, e.code ?? 'ERROR', e.message ?? 'Error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Action failed', err)
  }
})

projectsRouter.post('/:id/approve', requirePermission('projects.approve', 'approve'), async (req, res) => {
  try {
    const id = req.params['id']!
    const { userId, companyId, role } = req.auth!
    const canManage = await canManageProject({ userId, companyId, projectId: id }, role)
    if (!canManage) return sendError(res, 403, 'FORBIDDEN', 'Project manager or admin required')

    await transitionProject(id, companyId, userId, role, 'approve', 'approved', { approved_at: new Date().toISOString() })
    await notifyProjectTeam(id, { type: 'PROJECT_APPROVED', title: 'Project approved', body: 'Your project has been approved' })
    sendOk(res, { message: 'Project approved' })
  } catch (err: unknown) {
    const e = err as { status?: number; name?: string; message?: string; code?: string }
    if (e.name === 'WorkflowError') return sendError(res, 409, 'INVALID_TRANSITION', e.message ?? 'Invalid transition')
    if (e.status) return sendError(res, e.status, e.code ?? 'ERROR', e.message ?? 'Error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Action failed', err)
  }
})

projectsRouter.post('/:id/reject-back', requirePermission('projects.approve', 'approve'), async (req, res) => {
  try {
    const id = req.params['id']!
    const { userId, companyId, role } = req.auth!
    const { reason } = req.body as { reason?: string }
    if (!reason?.trim()) return sendError(res, 400, 'REASON_REQUIRED', 'Rejection reason is required')

    const canManage = await canManageProject({ userId, companyId, projectId: id }, role)
    if (!canManage) return sendError(res, 403, 'FORBIDDEN', 'Project manager or admin required')

    await transitionProject(id, companyId, userId, role, 'reject_back', 'ongoing', { reason })
    await notifyProjectTeam(id, { type: 'PROJECT_REJECTED_BACK', title: 'Project returned for rework', body: `Client rejected submission: ${reason}` })
    sendOk(res, { message: 'Project returned to ongoing' })
  } catch (err: unknown) {
    const e = err as { status?: number; name?: string; message?: string; code?: string }
    if (e.name === 'WorkflowError') return sendError(res, 409, 'INVALID_TRANSITION', e.message ?? 'Invalid transition')
    if (e.status) return sendError(res, e.status, e.code ?? 'ERROR', e.message ?? 'Error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Action failed', err)
  }
})

projectsRouter.post('/:id/complete', requirePermission('projects.approve', 'approve'), async (req, res) => {
  try {
    const id = req.params['id']!
    const { userId, companyId, role } = req.auth!
    const canManage = await canManageProject({ userId, companyId, projectId: id }, role)
    if (!canManage) return sendError(res, 403, 'FORBIDDEN', 'Project manager or admin required')

    const blockers = await checkCompletionBlockers(id)
    if (blockers.length > 0) {
      return sendError(res, 400, 'COMPLETION_BLOCKED', 'Project cannot be completed — resolve blockers first', { blockers })
    }

    await transitionProject(id, companyId, userId, role, 'complete', 'completed', { completed_at: new Date().toISOString() })
    await notifyProjectTeam(id, { type: 'PROJECT_COMPLETED', title: 'Project completed', body: 'The project has been marked as complete' })
    sendOk(res, { message: 'Project completed' })
  } catch (err: unknown) {
    const e = err as { status?: number; name?: string; message?: string; code?: string }
    if (e.name === 'WorkflowError') return sendError(res, 409, 'INVALID_TRANSITION', e.message ?? 'Invalid transition')
    if (e.status) return sendError(res, e.status, e.code ?? 'ERROR', e.message ?? 'Error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Action failed', err)
  }
})

projectsRouter.post('/:id/cancel', requirePermission('projects.approve', 'approve'), async (req, res) => {
  try {
    const id = req.params['id']!
    const { userId, companyId, role } = req.auth!
    const { reason } = req.body as { reason?: string }
    if (!reason?.trim()) return sendError(res, 400, 'REASON_REQUIRED', 'Cancellation reason is required')

    const canManage = await canManageProject({ userId, companyId, projectId: id }, role)
    if (!canManage) return sendError(res, 403, 'FORBIDDEN', 'Project manager or admin required')

    const existing = await query('SELECT status FROM projects WHERE id = $1 AND company_id = $2', [id, companyId])
    if (!existing.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Project not found')
    const finalStatuses = ['completed', 'cancelled', 'cancelled_after_approval']
    if (finalStatuses.includes(existing.rows[0]?.['status'] as string)) {
      return sendError(res, 400, 'ALREADY_FINAL', `Cannot cancel a project in ${existing.rows[0]?.['status']} status`)
    }

    await transitionProject(id, companyId, userId, role, 'cancel', 'cancelled', { cancel_reason: reason, reason, cancelled_at: new Date().toISOString() })
    await notifyProjectTeam(id, { type: 'PROJECT_CANCELLED', title: 'Project cancelled', body: `Project has been cancelled: ${reason}` })
    sendOk(res, { message: 'Project cancelled' })
  } catch (err: unknown) {
    const e = err as { status?: number; name?: string; message?: string; code?: string }
    if (e.name === 'WorkflowError') return sendError(res, 409, 'INVALID_TRANSITION', e.message ?? 'Invalid transition')
    if (e.status) return sendError(res, e.status, e.code ?? 'ERROR', e.message ?? 'Error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Action failed', err)
  }
})

projectsRouter.post('/:id/cancel-after-approval', requirePermission('projects.approve', 'approve'), async (req, res) => {
  try {
    const id = req.params['id']!
    const { userId, companyId, role } = req.auth!
    const { reason } = req.body as { reason?: string }
    if (!reason?.trim()) return sendError(res, 400, 'REASON_REQUIRED', 'Reason is required')

    const canManage = await canManageProject({ userId, companyId, projectId: id }, role)
    if (!canManage) return sendError(res, 403, 'FORBIDDEN', 'Project manager or admin required')

    await transitionProject(id, companyId, userId, role, 'cancel_after_approval', 'cancelled_after_approval', { cancel_reason: reason, reason, cancelled_at: new Date().toISOString() })
    await notifyProjectTeam(id, { type: 'PROJECT_CANCELLED_AFTER_APPROVAL', title: 'Project cancelled', body: `Project has been cancelled after approval: ${reason}` })
    sendOk(res, { message: 'Project cancelled after approval' })
  } catch (err: unknown) {
    const e = err as { status?: number; name?: string; message?: string; code?: string }
    if (e.name === 'WorkflowError') return sendError(res, 409, 'INVALID_TRANSITION', e.message ?? 'Invalid transition')
    if (e.status) return sendError(res, e.status, e.code ?? 'ERROR', e.message ?? 'Error')
    sendError(res, 500, 'INTERNAL_ERROR', 'Action failed', err)
  }
})

// ── STAGE ROUTES ───────────────────────────────────────────────

projectsRouter.get('/:id/stages', requirePermission('projects.view', 'view'), async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM project_stages WHERE project_id = $1 ORDER BY sequence`,
      [req.params['id']],
    )
    sendOk(res, result.rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch stages', err) }
})

projectsRouter.post('/:id/stages', requirePermission('projects.edit', 'edit'), async (req, res) => {
  try {
    const id = req.params['id']!
    const { userId, companyId, role } = req.auth!
    const canManage = await canManageProject({ userId, companyId, projectId: id }, role)
    if (!canManage) return sendError(res, 403, 'FORBIDDEN', 'Project manager or admin required')

    const b = req.body as Record<string, unknown>
    const seq = (b['sequence'] as number | undefined) ?? await getNextStageSequence(id)

    const result = await query(
      `INSERT INTO project_stages
         (project_id, name, sequence, status, completion_pct, planned_start_date, planned_end_date, notes, assigned_to)
       VALUES ($1,$2,$3,'pending',0,$4,$5,$6,$7) RETURNING *`,
      [id, b['name'], seq, b['planned_start_date'] ?? null, b['planned_end_date'] ?? null, b['notes'] ?? null, b['assigned_to'] ?? null],
    )
    sendOk(res, result.rows[0], 201)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create stage', err) }
})

projectsRouter.patch('/:id/stages/:stageId', requirePermission('projects.edit', 'edit'), async (req, res) => {
  try {
    const { id, stageId } = req.params as { id: string; stageId: string }
    const { userId, companyId, role } = req.auth!
    const canManage = await canManageProject({ userId, companyId, projectId: id }, role)
    if (!canManage) return sendError(res, 403, 'FORBIDDEN', 'Project manager or admin required')

    const b = req.body as Record<string, unknown>

    // Auto-set actual dates based on status changes
    const actualStart = b['status'] === 'active' && b['actual_start_date'] === undefined
      ? new Date().toISOString().split('T')[0]
      : (b['actual_start_date'] ?? null)
    const actualEnd = b['status'] === 'completed' && b['actual_end_date'] === undefined
      ? new Date().toISOString().split('T')[0]
      : (b['actual_end_date'] ?? null)

    const result = await query(
      `UPDATE project_stages SET
        name               = COALESCE($1, name),
        completion_pct     = COALESCE($2, completion_pct),
        status             = COALESCE($3, status),
        planned_start_date = COALESCE($4, planned_start_date),
        planned_end_date   = COALESCE($5, planned_end_date),
        actual_start_date  = COALESCE($6, actual_start_date),
        actual_end_date    = COALESCE($7, actual_end_date),
        notes              = COALESCE($8, notes),
        updated_at         = NOW()
      WHERE id = $9 AND project_id = $10 RETURNING *`,
      [
        b['name'] ?? null, b['completion_pct'] ?? null, b['status'] ?? null,
        b['planned_start_date'] ?? null, b['planned_end_date'] ?? null,
        actualStart, actualEnd, b['notes'] ?? null,
        stageId, id,
      ],
    )
    if (!result.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Stage not found')

    await logAudit({ userId, companyId, action: 'PROJECT_STAGE_UPDATED', tableName: 'project_stages', recordId: stageId, newValues: b })
    sendOk(res, result.rows[0])
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update stage', err) }
})

// Keep backward-compat PUT alias
projectsRouter.put('/:id/stages/:stageId', requirePermission('projects.edit', 'edit'), async (req, res) => {
  try {
    const { id, stageId } = req.params as { id: string; stageId: string }
    const { userId, companyId, role } = req.auth!
    const canManage = await canManageProject({ userId, companyId, projectId: id }, role)
    if (!canManage) return sendError(res, 403, 'FORBIDDEN', 'Project manager or admin required')

    const b = req.body as Record<string, unknown>
    const result = await query(
      `UPDATE project_stages SET
        name           = COALESCE($1, name),
        sequence       = COALESCE($2, sequence),
        completion_pct = COALESCE($3, completion_pct),
        updated_at     = NOW()
      WHERE id = $4 AND project_id = $5 RETURNING *`,
      [b['name'] ?? null, b['sequence'] ?? null, b['completion_pct'] ?? null, stageId, id],
    )
    if (!result.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Stage not found')
    sendOk(res, result.rows[0])
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update stage', err) }
})

projectsRouter.post('/:id/stages/:stageId/complete', requirePermission('projects.approve', 'approve'), async (req, res) => {
  try {
    const { id, stageId } = req.params as { id: string; stageId: string }
    const stageResult = await query(
      `UPDATE project_stages SET status='completed', completion_pct=100, actual_end_date=NOW()::date, updated_at=NOW() WHERE id=$1 AND project_id=$2 RETURNING name`,
      [stageId, id],
    )
    const stageName = String((stageResult.rows[0] as Record<string, unknown> | undefined)?.['name'] ?? '')
    await notifyProjectTeam(id, { type: 'PROJECT_STAGE_COMPLETED', title: `Stage completed: ${stageName}`, body: `The stage "${stageName}" has been marked as complete` })
    sendOk(res, { id: stageId, status: 'completed' })
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to complete stage', err) }
})

// ── TEAM ROUTES ────────────────────────────────────────────────

projectsRouter.get('/:id/members', requirePermission('projects.view', 'view'), async (req, res) => {
  try {
    const projectId = req.params['id']!
    const membersResult = await query(
      `SELECT pm.*, e.first_name || ' ' || e.last_name AS employee_name, e.job_title, e.employee_number
       FROM project_members pm JOIN employees e ON e.id = pm.employee_id
       WHERE pm.project_id = $1 AND pm.is_active = true ORDER BY e.first_name`,
      [projectId],
    )
    const members = membersResult.rows as Array<Record<string, unknown>>
    if (members.length === 0) return sendOk(res, [])

    // Attach per-member permission overrides
    const memberIds = members.map(m => m['id'] as string)
    const permsResult = await query(
      `SELECT member_id, tab_key, access_level FROM project_member_permissions WHERE member_id = ANY($1)`,
      [memberIds],
    )
    const permsMap: Record<string, Record<string, string>> = {}
    for (const row of permsResult.rows as Array<{ member_id: string; tab_key: string; access_level: string }>) {
      if (!permsMap[row.member_id]) permsMap[row.member_id] = {}
      permsMap[row.member_id]![row.tab_key] = row.access_level
    }
    const enriched = members.map(m => ({ ...m, permissions: permsMap[m['id'] as string] ?? {} }))
    sendOk(res, enriched)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch members', err) }
})

projectsRouter.put('/:id/members/:memberId/permissions', requirePermission('projects.edit', 'edit'), async (req, res) => {
  try {
    const { id, memberId } = req.params as { id: string; memberId: string }
    const { userId, companyId, role } = req.auth!
    const canManage = await canManageProject({ userId, companyId, projectId: id }, role)
    if (!canManage) return sendError(res, 403, 'FORBIDDEN', 'Project manager or admin required')

    // Verify member belongs to this project
    const check = await query(`SELECT id FROM project_members WHERE id=$1 AND project_id=$2`, [memberId, id])
    if (check.rows.length === 0) return sendError(res, 404, 'NOT_FOUND', 'Member not found')

    const perms = req.body as Record<string, string>
    const validTabs = ['overview','client_documents','rfq_lines','bidding','team','execution','procurement','cost_control','variation_orders','meetings','planning','attachments']
    const validLevels = ['none','view','edit']

    // Delete existing overrides then re-insert
    await query(`DELETE FROM project_member_permissions WHERE member_id=$1`, [memberId])
    for (const [tab, level] of Object.entries(perms)) {
      if (!validTabs.includes(tab) || !validLevels.includes(level)) continue
      await query(
        `INSERT INTO project_member_permissions (member_id, tab_key, access_level) VALUES ($1,$2,$3)`,
        [memberId, tab, level],
      )
    }

    const updated = await query(
      `SELECT tab_key, access_level FROM project_member_permissions WHERE member_id=$1`,
      [memberId],
    )
    const result: Record<string, string> = {}
    for (const row of updated.rows as Array<{ tab_key: string; access_level: string }>) {
      result[row.tab_key] = row.access_level
    }
    sendOk(res, result)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update member permissions', err) }
})

projectsRouter.post('/:id/members', requirePermission('projects.edit', 'edit'), async (req, res) => {
  try {
    const id = req.params['id']!
    const { userId, companyId, role } = req.auth!
    const canManage = await canManageProject({ userId, companyId, projectId: id }, role)
    if (!canManage) return sendError(res, 403, 'FORBIDDEN', 'Project manager or admin required')

    const b = req.body as Record<string, unknown>
    const memberType = (['technical', 'commercial', 'both'] as const).includes(b['member_type'] as 'technical' | 'commercial' | 'both')
      ? (b['member_type'] as string)
      : 'technical'
    const result = await query(
      `INSERT INTO project_members (project_id, employee_id, role, member_type, allocated_hours, start_date, end_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (project_id, employee_id) DO UPDATE SET is_active = true, role = EXCLUDED.role, member_type = EXCLUDED.member_type, updated_at = NOW()
       RETURNING *`,
      [id, b['employee_id'], b['role'] ?? null, memberType, b['allocated_hours'] ?? null, b['start_date'] ?? null, b['end_date'] ?? null],
    )
    const empRow = await query(`SELECT first_name||' '||last_name AS name FROM employees WHERE id=$1`, [b['employee_id']])
    const empName = (empRow.rows[0] as Record<string, unknown>)?.['name'] ?? 'Unknown'
    await query(
      `INSERT INTO project_activity_log (project_id, actor_id, event_type, summary) VALUES ($1,$2,$3,$4)`,
      [id, userId ?? null, 'team_add', `Team member added: ${String(empName)}`],
    ).catch(() => {})
    ;(async () => {
      const uRes = await query<{ user_id: string | null }>(
        `SELECT user_id FROM employees WHERE id=$1`, [b['employee_id']],
      )
      const assignedUserId = uRes.rows[0]?.user_id
      if (assignedUserId) {
        const projRes = await query<{ name: string }>(`SELECT name FROM projects WHERE id=$1`, [id])
        const projName = String(projRes.rows[0]?.name ?? id)
        await query(
          `INSERT INTO service_outbox (service,event_type,payload) VALUES ('notifications','PROJECT_MEMBER_ADDED',$1)`,
          [JSON.stringify({ userId: assignedUserId, companyId, title: `Added to project: ${projName}`,
            body: `You have been added to the project "${projName}" as ${String(b['role'] ?? 'member')}`,
            data: { projectId: id, projectName: projName, role: b['role'] ?? null } })],
        )
      }
    })().catch(() => {})
    sendOk(res, result.rows[0], 201)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to add member', err) }
})

projectsRouter.delete('/:id/members/:memberId', requirePermission('projects.cancel', 'approve'), async (req, res) => {
  try {
    const { id, memberId } = req.params as { id: string; memberId: string }
    const { userId, companyId, role } = req.auth!
    const canManage = await canManageProject({ userId, companyId, projectId: id }, role)
    if (!canManage) return sendError(res, 403, 'FORBIDDEN', 'Project manager or admin required')

    const empRow = await query(
      `SELECT e.first_name||' '||e.last_name AS name, e.user_id FROM project_members pm JOIN employees e ON e.id = pm.employee_id WHERE pm.id=$1`,
      [memberId],
    )
    const empData = empRow.rows[0] as Record<string, unknown> | undefined
    const empName = empData?.['name'] ?? 'Unknown'
    const empUserId = empData?.['user_id'] as string | null | undefined
    await query(`UPDATE project_members SET is_active = false, updated_at = NOW() WHERE id = $1 AND project_id = $2`, [memberId, id])
    await query(
      `INSERT INTO project_activity_log (project_id, actor_id, event_type, summary) VALUES ($1,$2,$3,$4)`,
      [id, userId ?? null, 'team_remove', `Team member removed: ${String(empName)}`],
    ).catch(() => {})
    if (empUserId) {
      ;(async () => {
        const projRes = await query<{ name: string }>(`SELECT name FROM projects WHERE id=$1`, [id])
        const projName = String(projRes.rows[0]?.name ?? id)
        await query(
          `INSERT INTO service_outbox (service,event_type,payload) VALUES ('notifications','PROJECT_MEMBER_REMOVED',$1)`,
          [JSON.stringify({ userId: empUserId, companyId, title: `Removed from project: ${projName}`,
            body: `You have been removed from the project "${projName}"`,
            data: { projectId: id, projectName: projName } })],
        )
      })().catch(() => {})
    }
    sendOk(res, { deleted: true })
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to remove member', err) }
})

// ── BUDGET ROUTES (preserved) ──────────────────────────────────

projectsRouter.get('/:id/budget', requirePermission('projects.view', 'view'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const id = req.params['id']!
    const proj = await query('SELECT id FROM projects WHERE id = $1 AND company_id = $2', [id, companyId])
    if (!proj.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Project not found')
    const result = await query(
      `SELECT bl.category, bl.budgeted_amount,
              COALESCE(SUM(pca.amount),0) AS actual_amount,
              bl.budgeted_amount - COALESCE(SUM(pca.amount),0) AS variance
       FROM project_budget_lines bl
       LEFT JOIN project_cost_actuals pca ON pca.project_id = bl.project_id AND pca.cost_category = bl.category
       WHERE bl.project_id = $1 GROUP BY bl.id, bl.category, bl.budgeted_amount ORDER BY bl.category`,
      [id],
    )
    sendOk(res, result.rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch budget', err) }
})

projectsRouter.post('/:id/budget-lines', requirePermission('projects.edit', 'edit'), async (req, res) => {
  try {
    const id = req.params['id']!
    const b = req.body as Record<string, unknown>
    const result = await query(
      `INSERT INTO project_budget_lines (project_id, category, description, account_id, budgeted_amount, currency_code)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [id, b['category'], b['description'] ?? null, b['account_id'] ?? null, b['budgeted_amount'], b['currency_code'] ?? 'IQD'],
    )
    sendOk(res, result.rows[0], 201)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to add budget line', err) }
})

projectsRouter.delete('/:id/budget-lines/:lineId', requirePermission('projects.cancel', 'approve'), async (req, res) => {
  try {
    const { id, lineId } = req.params as { id: string; lineId: string }
    await query('DELETE FROM project_budget_lines WHERE id = $1 AND project_id = $2', [lineId, id])
    sendOk(res, { deleted: true })
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to delete budget line', err) }
})

projectsRouter.get('/:id/profitability', requirePermission('projects.view', 'view'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const id = req.params['id']!
    const result = await query(`SELECT * FROM v_project_profitability WHERE project_id = $1 AND company_id = $2`, [id, companyId])
    if (!result.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Project not found')
    sendOk(res, result.rows[0])
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch profitability', err) }
})

projectsRouter.get('/:id/costs', requirePermission('projects.view', 'view'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const id = req.params['id']!
    const { source_type, from_date, to_date } = req.query as Record<string, string>
    const proj = await query('SELECT id FROM projects WHERE id = $1 AND company_id = $2', [id, companyId])
    if (!proj.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Project not found')
    let sql = `SELECT * FROM project_cost_actuals WHERE project_id = $1`
    const params: unknown[] = [id]
    let idx = 2
    if (source_type) { sql += ` AND source_type = $${idx++}`; params.push(source_type) }
    if (from_date) { sql += ` AND entry_date >= $${idx++}`; params.push(from_date) }
    if (to_date) { sql += ` AND entry_date <= $${idx++}`; params.push(to_date) }
    sql += ' ORDER BY entry_date DESC LIMIT 500'
    sendOk(res, (await query(sql, params)).rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch costs', err) }
})

projectsRouter.get('/:id/manufacturing-orders', requirePermission('projects.view', 'view'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const id = req.params['id']!
    const result = await query(
      'SELECT * FROM manufacturing_orders WHERE project_id = $1 AND company_id = $2 ORDER BY created_at DESC',
      [id, companyId],
    )
    sendOk(res, result.rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch MOs', err) }
})
