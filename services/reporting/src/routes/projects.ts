import { Router } from 'express'
import type { IRouter } from 'express'
import { query } from '@fnc-erp/db'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const projectsReportRouter: IRouter = Router()

// GET /reporting/projects/profitability?company_id&status&project_type&from_date&to_date
projectsReportRouter.get('/profitability', requirePermission('reporting.operational.view', 'view'), async (req, res) => {
  try {
    const { company_id, status, project_type } = req.query
    const companyId = (company_id as string) || req.auth!.companyId
    let sql = `SELECT * FROM v_project_profitability WHERE company_id = $1`
    const params: unknown[] = [companyId]
    let idx = 2
    if (status) { sql += ` AND status = $${idx++}`; params.push(status) }
    if (project_type) { sql += ` AND project_type = $${idx++}`; params.push(project_type) }
    sql += ' ORDER BY gross_margin ASC'
    sendOk(res, (await query(sql, params)).rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to generate project profitability', err) }
})

// GET /reporting/projects/:id/detail
projectsReportRouter.get('/:id/detail', requirePermission('reporting.operational.view', 'view'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const id = req.params['id']!

    const [project, budgetVsActual, costTimeline, mos, rentalContracts] = await Promise.all([
      query('SELECT * FROM v_project_profitability WHERE project_id=$1 AND company_id=$2', [id, companyId]),
      query(
        `SELECT bl.category, bl.budgeted_amount,
                COALESCE(SUM(CASE WHEN pca.amount>0 THEN pca.amount ELSE 0 END),0) AS actual_costs
         FROM project_budget_lines bl
         LEFT JOIN project_cost_actuals pca ON pca.project_id=bl.project_id AND pca.cost_category=bl.category
         WHERE bl.project_id=$1 GROUP BY bl.id, bl.category, bl.budgeted_amount`, [id],
      ),
      query(
        `SELECT DATE_TRUNC('month', entry_date) AS month, source_type,
                SUM(CASE WHEN amount>0 THEN amount ELSE 0 END) AS costs
         FROM project_cost_actuals WHERE project_id=$1
         GROUP BY month, source_type ORDER BY month`, [id],
      ),
      query('SELECT mo_number, status, planned_cost, actual_cost, qty_planned, qty_produced FROM manufacturing_orders WHERE project_id=$1', [id]),
      query('SELECT contract_number, rental_type, status, rate_amount, billing_cycle FROM rental_contracts WHERE project_id=$1', [id]),
    ])

    if (!project.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Project not found')
    sendOk(res, {
      ...project.rows[0],
      budget_vs_actual: budgetVsActual.rows,
      cost_timeline: costTimeline.rows,
      manufacturing_orders: mos.rows,
      rental_contracts: rentalContracts.rows,
    })
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to generate project detail report', err) }
})
