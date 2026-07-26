import { Router } from 'express'
import type { IRouter } from 'express'
import { z } from 'zod'
import { query } from '@fnc-erp/db'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const leaveRouter: IRouter = Router()

const LeaveRequestSchema = z.object({
  employee_id: z.string().uuid(),
  leave_type_id: z.string().uuid(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  total_days: z.number().positive(),
  reason: z.string().optional(),
})

leaveRouter.get('/types', requirePermission('hr.leave.view', 'view'), async (req, res) => {
  try {
    const result = await query(`SELECT * FROM leave_types WHERE company_id = $1 ORDER BY name`, [
      req.auth!.companyId,
    ])
    sendOk(res, result.rows)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch leave types', err)
  }
})

leaveRouter.get('/requests', requirePermission('hr.leave.view', 'view'), async (req, res) => {
  try {
    const { employee_id, status, page = '1', limit = '50' } = req.query
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string)
    let sql = `SELECT lr.*, e.first_name || ' ' || e.last_name AS employee_name, lt.name AS leave_type_name
               FROM leave_requests lr
               JOIN employees e ON e.id = lr.employee_id
               JOIN leave_types lt ON lt.id = lr.leave_type_id
               WHERE lr.company_id = $1`
    const params: unknown[] = [req.auth!.companyId]
    let idx = 2
    if (employee_id) {
      sql += ` AND lr.employee_id = $${idx++}`
      params.push(employee_id)
    }
    if (status) {
      sql += ` AND lr.status = $${idx++}`
      params.push(status)
    }
    sql += ` ORDER BY lr.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`
    params.push(parseInt(limit as string), offset)
    const result = await query(sql, params)
    sendOk(res, result.rows)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch leave requests', err)
  }
})

leaveRouter.post('/requests', requirePermission('hr.leave.edit', 'edit'), async (req, res) => {
  const parsed = LeaveRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
    return
  }
  try {
    const { employee_id, leave_type_id, start_date, end_date, total_days, reason } = parsed.data
    // Verify employee belongs to company
    const emp = await query(`SELECT id FROM employees WHERE id = $1 AND company_id = $2`, [
      employee_id,
      req.auth!.companyId,
    ])
    if (!emp.rows[0]) {
      sendError(res, 404, 'NOT_FOUND', 'Employee not found')
      return
    }
    // Verify leave type belongs to company
    const lt = await query(
      `SELECT id, requires_approval FROM leave_types WHERE id = $1 AND company_id = $2`,
      [leave_type_id, req.auth!.companyId],
    )
    if (!lt.rows[0]) {
      sendError(res, 404, 'NOT_FOUND', 'Leave type not found')
      return
    }
    const requiresApproval = (lt.rows[0] as { requires_approval: boolean }).requires_approval
    const initialStatus = requiresApproval ? 'pending' : 'approved'
    const result = await query(
      `INSERT INTO leave_requests (employee_id, company_id, leave_type_id, start_date, end_date, total_days, reason, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        employee_id,
        req.auth!.companyId,
        leave_type_id,
        start_date,
        end_date,
        total_days,
        reason ?? null,
        initialStatus,
        req.auth!.userId,
      ],
    )
    if (requiresApproval) {
      const companyId = req.auth!.companyId
      ;(async () => {
        const empRes = await query<{ first_name: string; last_name: string }>(
          `SELECT first_name, last_name FROM employees WHERE id=$1`,
          [employee_id],
        )
        const empName =
          `${empRes.rows[0]?.first_name ?? ''} ${empRes.rows[0]?.last_name ?? ''}`.trim()
        const admins = await query(
          `SELECT DISTINCT u.id AS user_id FROM users u
           JOIN user_company_roles ucr ON ucr.user_id = u.id
           WHERE ucr.company_id = $1
             AND (ucr.role IN ('company_admin', 'system_admin')
                  OR (ucr.module = 'hr' AND ucr.role IN ('module_admin', 'module_user')))
             AND u.is_active = true`,
          [companyId],
        )
        for (const u of admins.rows) {
          await query(
            `INSERT INTO service_outbox (service,event_type,payload) VALUES ('notifications','LEAVE_REQUEST_SUBMITTED',$1)`,
            [
              JSON.stringify({
                userId: u['user_id'],
                companyId,
                title: `Leave request: ${empName}`,
                body: `${empName} has submitted a leave request from ${start_date} to ${end_date} (${total_days} days)${reason ? ': ' + reason : ''}`,
                data: {
                  leaveRequestId: result.rows[0]!['id'],
                  employeeName: empName,
                  startDate: start_date,
                  endDate: end_date,
                },
              }),
            ],
          )
        }
      })().catch(() => {})
    }
    sendOk(res, result.rows[0]!, 201)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create leave request', err)
  }
})

leaveRouter.post(
  '/requests/:id/approve',
  requirePermission('hr.leave.approve', 'approve'),
  async (req, res) => {
    try {
      const result = await query(
        `UPDATE leave_requests SET status = 'approved', reviewed_by = $1, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND company_id = $3 AND status = 'pending' RETURNING *`,
        [req.auth!.userId, req.params['id'], req.auth!.companyId],
      )
      if (!result.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Leave request not found or not pending')
        return
      }
      // Notify the requesting employee
      const lr = result.rows[0] as Record<string, unknown>
      ;(async () => {
        const empRes = await query<{ user_id: string | null }>(
          `SELECT user_id FROM employees WHERE id=$1`,
          [lr['employee_id']],
        )
        const userId = empRes.rows[0]?.user_id
        if (userId) {
          await query(
            `INSERT INTO service_outbox (service,event_type,payload) VALUES ('notifications','LEAVE_REQUEST_APPROVED',$1)`,
            [
              JSON.stringify({
                userId,
                companyId: req.auth!.companyId,
                title: 'Leave request approved',
                body: `Your leave request from ${String(lr['start_date'])} to ${String(lr['end_date'])} (${String(lr['total_days'])} days) has been approved`,
                data: {
                  leaveRequestId: req.params['id'],
                  startDate: lr['start_date'],
                  endDate: lr['end_date'],
                },
              }),
            ],
          )
        }
      })().catch(() => {})
      sendOk(res, result.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to approve leave request', err)
    }
  },
)

leaveRouter.post(
  '/requests/:id/reject',
  requirePermission('hr.leave.approve', 'approve'),
  async (req, res) => {
    try {
      const result = await query(
        `UPDATE leave_requests SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND company_id = $3 AND status = 'pending' RETURNING *`,
        [req.auth!.userId, req.params['id'], req.auth!.companyId],
      )
      if (!result.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Leave request not found or not pending')
        return
      }
      // Notify the requesting employee
      const lr = result.rows[0] as Record<string, unknown>
      ;(async () => {
        const empRes = await query<{ user_id: string | null }>(
          `SELECT user_id FROM employees WHERE id=$1`,
          [lr['employee_id']],
        )
        const userId = empRes.rows[0]?.user_id
        if (userId) {
          await query(
            `INSERT INTO service_outbox (service,event_type,payload) VALUES ('notifications','LEAVE_REQUEST_REJECTED',$1)`,
            [
              JSON.stringify({
                userId,
                companyId: req.auth!.companyId,
                title: 'Leave request not approved',
                body: `Your leave request from ${String(lr['start_date'])} to ${String(lr['end_date'])} has not been approved`,
                data: {
                  leaveRequestId: req.params['id'],
                  startDate: lr['start_date'],
                  endDate: lr['end_date'],
                },
              }),
            ],
          )
        }
      })().catch(() => {})
      sendOk(res, result.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to reject leave request', err)
    }
  },
)
