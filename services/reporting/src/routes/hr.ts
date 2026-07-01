import { Router } from 'express'
import type { IRouter } from 'express'
import { query } from '@fnc-erp/db'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const hrReportRouter: IRouter = Router()

// GET /reporting/payroll/summary?company_id&from_date&to_date
hrReportRouter.get('/payroll/summary', requirePermission('reporting.operational.view', 'view'), async (req, res) => {
  try {
    const companyId = (req.query['company_id'] as string) || req.auth!.companyId
    const { from_date, to_date } = req.query
    const params: unknown[] = [companyId]
    let idx = 2
    let dateClause = `ps.company_id = $1 AND pr.status = 'posted'`
    if (from_date) { dateClause += ` AND pr.start_date >= $${idx++}`; params.push(from_date) }
    if (to_date) { dateClause += ` AND pr.end_date <= $${idx++}`; params.push(to_date) }
    const result = await query(
      `SELECT pr.period_name, pr.start_date, pr.end_date,
              SUM(ps.gross_salary) AS total_gross,
              SUM(ps.net_salary) AS total_net,
              SUM(ps.income_tax) AS total_income_tax,
              SUM(ps.social_security) AS total_social_security,
              COUNT(ps.employee_id) AS headcount
       FROM payslips ps
       JOIN payroll_runs pr ON pr.id = ps.payroll_run_id
       WHERE ${dateClause}
       GROUP BY pr.id, pr.period_name, pr.start_date, pr.end_date
       ORDER BY pr.start_date DESC`,
      params,
    )
    sendOk(res, result.rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to generate payroll summary', err) }
})

// GET /reporting/hr/attendance-summary?company_id&from_date&to_date&department_id
hrReportRouter.get('/hr/attendance-summary', requirePermission('reporting.operational.view', 'view'), async (req, res) => {
  try {
    const companyId = (req.query['company_id'] as string) || req.auth!.companyId
    const { from_date, to_date, department_id } = req.query
    const params: unknown[] = [companyId]
    let idx = 2
    let dateClause = `e.company_id = $1`
    if (from_date) { dateClause += ` AND al.punched_at::date >= $${idx++}`; params.push(from_date) }
    if (to_date) { dateClause += ` AND al.punched_at::date <= $${idx++}`; params.push(to_date) }
    if (department_id) { dateClause += ` AND e.department_id = $${idx++}`; params.push(department_id) }
    const result = await query(
      `SELECT e.id AS employee_id, e.first_name || ' ' || e.last_name AS employee_name,
              COUNT(CASE WHEN al.punch_type='in' THEN 1 END) AS punch_in_count,
              COUNT(CASE WHEN al.geofence_valid=false THEN 1 END) AS geofence_violations
       FROM employees e
       LEFT JOIN attendance_logs al ON al.employee_id = e.id
       WHERE ${dateClause}
       GROUP BY e.id, e.first_name, e.last_name
       ORDER BY e.last_name, e.first_name`,
      params,
    )
    sendOk(res, result.rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to generate attendance summary', err) }
})

// GET /reporting/hr/headcount?company_id&as_of_date
hrReportRouter.get('/hr/headcount', requirePermission('reporting.operational.view', 'view'), async (req, res) => {
  try {
    const companyId = (req.query['company_id'] as string) || req.auth!.companyId
    const asOfDate = req.query['as_of_date'] as string | undefined
    const dateClause = asOfDate ? `AND e.hire_date <= '${asOfDate}'` : ''
    const result = await query(
      `SELECT d.name AS department, e.employment_type, e.status,
              COUNT(e.id) AS headcount
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE e.company_id = $1 AND e.status = 'active' ${dateClause}
       GROUP BY d.name, e.employment_type, e.status
       ORDER BY d.name, e.employment_type`,
      [companyId],
    )
    sendOk(res, result.rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to generate headcount', err) }
})
