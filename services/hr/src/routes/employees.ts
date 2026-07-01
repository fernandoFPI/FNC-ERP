import { Router } from 'express'
import type { IRouter } from 'express'
import { z } from 'zod'
import { query } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const employeesRouter: IRouter = Router()

const EmployeeSchema = z.object({
  employee_number: z.string().max(50).optional(),
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  national_id: z.string().max(100).optional(),
  job_title: z.string().max(200).optional(),
  department_id: z.string().uuid().optional(),
  work_location_id: z.string().uuid().optional(),
  manager_id: z.string().uuid().optional(),
  employment_type: z.enum(['full_time', 'part_time', 'contract', 'intern']).default('full_time'),
  hire_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  user_id: z.string().uuid().optional(),
})

employeesRouter.get('/', requirePermission('hr.employees.view', 'view'), async (req, res) => {
  try {
    const { status, department_id, page = '1', limit = '50' } = req.query
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string)
    let sql = `SELECT e.*, d.name AS department_name, wl.name AS work_location_name
               FROM employees e
               LEFT JOIN departments d ON d.id = e.department_id
               LEFT JOIN work_locations wl ON wl.id = e.work_location_id
               WHERE e.company_id = $1`
    const params: unknown[] = [req.auth!.companyId]
    let idx = 2
    if (status) { sql += ` AND e.status = $${idx++}`; params.push(status) }
    if (department_id) { sql += ` AND e.department_id = $${idx++}`; params.push(department_id) }
    sql += ` ORDER BY e.last_name, e.first_name LIMIT $${idx++} OFFSET $${idx++}`
    params.push(parseInt(limit as string), offset)
    const result = await query(sql, params)
    sendOk(res, result.rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch employees', err) }
})

employeesRouter.get('/:id', requirePermission('hr.employees.view', 'view'), async (req, res) => {
  try {
    const result = await query(
      `SELECT e.*, d.name AS department_name, wl.name AS work_location_name
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN work_locations wl ON wl.id = e.work_location_id
       WHERE e.id = $1 AND e.company_id = $2`,
      [req.params['id'], req.auth!.companyId],
    )
    const row = result.rows[0]
    if (!row) return sendError(res, 404, 'NOT_FOUND', 'Employee not found')
    sendOk(res, row)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch employee', err) }
})

employeesRouter.post('/', requirePermission('hr.employees.edit', 'edit'), async (req, res) => {
  const parsed = EmployeeSchema.safeParse(req.body)
  if (!parsed.success) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
  try {
    const d = parsed.data
    const result = await query(
      `INSERT INTO employees (company_id, user_id, employee_number, first_name, last_name, email, phone,
       national_id, job_title, department_id, work_location_id, manager_id, employment_type, hire_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [req.auth!.companyId, d.user_id ?? null, d.employee_number ?? null, d.first_name, d.last_name,
       d.email ?? null, d.phone ?? null, d.national_id ?? null, d.job_title ?? null,
       d.department_id ?? null, d.work_location_id ?? null, d.manager_id ?? null,
       d.employment_type, d.hire_date, req.auth!.userId],
    )
    const row = result.rows[0]!
    await logAudit({ companyId: req.auth!.companyId, userId: req.auth!.userId, action: 'CREATE', tableName: 'employees', recordId: row['id'] as string, newValues: { first_name: d.first_name, last_name: d.last_name } })
    sendOk(res, row, 201)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create employee', err) }
})

employeesRouter.put('/:id', requirePermission('hr.employees.edit', 'edit'), async (req, res) => {
  const parsed = EmployeeSchema.partial().safeParse(req.body)
  if (!parsed.success) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
  try {
    const existing = await query(
      `SELECT * FROM employees WHERE id = $1 AND company_id = $2`,
      [req.params['id'], req.auth!.companyId],
    )
    if (!existing.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Employee not found')
    const d = parsed.data
    const result = await query(
      `UPDATE employees SET
       first_name = COALESCE($1, first_name), last_name = COALESCE($2, last_name),
       email = COALESCE($3, email), phone = COALESCE($4, phone),
       job_title = COALESCE($5, job_title), department_id = COALESCE($6, department_id),
       work_location_id = COALESCE($7, work_location_id), manager_id = COALESCE($8, manager_id),
       employment_type = COALESCE($9, employment_type), hire_date = COALESCE($10, hire_date),
       updated_at = NOW()
       WHERE id = $11 AND company_id = $12 RETURNING *`,
      [d.first_name ?? null, d.last_name ?? null, d.email ?? null, d.phone ?? null,
       d.job_title ?? null, d.department_id ?? null, d.work_location_id ?? null,
       d.manager_id ?? null, d.employment_type ?? null, d.hire_date ?? null,
       req.params['id'], req.auth!.companyId],
    )
    sendOk(res, result.rows[0]!)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update employee', err) }
})

// Terminate employee (soft delete via status change)
employeesRouter.post('/:id/terminate', requirePermission('hr.employees.edit', 'edit'), async (req, res) => {
  const { termination_date } = req.body as { termination_date?: string }
  if (!termination_date || !/^\d{4}-\d{2}-\d{2}$/.test(termination_date)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'termination_date (YYYY-MM-DD) is required')
  }
  try {
    const result = await query(
      `UPDATE employees SET status = 'terminated', termination_date = $1, updated_at = NOW()
       WHERE id = $2 AND company_id = $3 AND status != 'terminated' RETURNING *`,
      [termination_date, req.params['id'], req.auth!.companyId],
    )
    if (!result.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Employee not found or already terminated')
    await logAudit({ companyId: req.auth!.companyId, userId: req.auth!.userId, action: 'UPDATE', tableName: 'employees', recordId: req.params['id']!, newValues: { status: 'terminated', termination_date } })
    // Notify HR admins and system admins
    const emp = result.rows[0] as Record<string, unknown>
    const empName = `${String(emp['first_name'] ?? '')} ${String(emp['last_name'] ?? '')}`.trim()
    ;(async () => {
      const admins = await query(`SELECT DISTINCT u.id AS user_id FROM users u JOIN user_company_roles ucr ON ucr.user_id=u.id WHERE ucr.company_id=$1 AND (ucr.role IN ('company_admin','system_admin') OR (ucr.module='hr' AND ucr.role IN ('module_admin'))) AND u.is_active=true`, [req.auth!.companyId])
      for (const u of admins.rows) {
        await query(`INSERT INTO service_outbox (service,event_type,payload) VALUES ('notifications','EMPLOYEE_TERMINATED',$1)`, [JSON.stringify({ userId: u['user_id'], companyId: req.auth!.companyId, title: `Employee terminated: ${empName}`, body: `${empName} has been terminated effective ${termination_date}`, data: { employeeId: req.params['id'], employeeName: empName, terminationDate: termination_date } })])
      }
    })().catch(() => {})
    sendOk(res, result.rows[0]!)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to terminate employee', err) }
})
