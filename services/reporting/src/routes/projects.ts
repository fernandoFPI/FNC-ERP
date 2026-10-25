import { Router } from 'express'
import type { IRouter } from 'express'
import { query } from '@fnc-erp/db'
import { getAuth } from '@fnc-erp/auth'
import { sendOk, sendError, requireParam } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const projectsReportRouter: IRouter = Router()

// GET /reporting/projects/profitability?company_id&status&project_type&from_date&to_date
projectsReportRouter.get(
  '/profitability',
  requirePermission('reporting.operational.view', 'view'),
  async (req, res) => {
    try {
      const { company_id, status, project_type } = req.query
      const companyId = (company_id as string) || getAuth(req).companyId
      let sql = `SELECT * FROM v_project_profitability WHERE company_id = $1`
      const params: unknown[] = [companyId]
      let idx = 2
      if (status) {
        sql += ` AND status = $${idx++}`
        params.push(status)
      }
      if (project_type) {
        sql += ` AND project_type = $${idx++}`
        params.push(project_type)
      }
      sql += ' ORDER BY gross_margin ASC'
      sendOk(res, (await query(sql, params)).rows)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to generate project profitability', err)
    }
  },
)

// GET /reporting/projects/:id/detail
projectsReportRouter.get(
  '/:id/detail',
  requirePermission('reporting.operational.view', 'view'),
  async (req, res) => {
    try {
      const companyId = getAuth(req).companyId
      const id = requireParam(req, 'id')

      // No caller found for this route (ProjectProfitabilityReport.tsx uses
      // the GraphQL projectProfitabilityReport query instead) -- fixed
      // anyway, same as every other currency-blind site in this audit.
      // budgetVsActual and costTimeline both grouped by currency_code now
      // (previously one blind SUM(pca.amount) each); project is no longer
      // assumed to be exactly one row (migration 305 -- one per currency).
      const [project, budgetVsActual, costTimeline, mos, rentalContracts] = await Promise.all([
        query('SELECT * FROM v_project_profitability WHERE project_id=$1 AND company_id=$2', [
          id,
          companyId,
        ]),
        query(
          `SELECT bl.category, bl.budgeted_amount, pca.currency_code,
                COALESCE(SUM(CASE WHEN pca.amount>0 THEN pca.amount ELSE 0 END),0) AS actual_costs
         FROM project_budget_lines bl
         LEFT JOIN v_project_cost_by_currency pca ON pca.project_id=bl.project_id AND pca.cost_category=bl.category
         WHERE bl.project_id=$1 GROUP BY bl.id, bl.category, bl.budgeted_amount, pca.currency_code`,
          [id],
        ),
        query(
          `SELECT DATE_TRUNC('month', entry_date) AS month, source_type, currency_code,
                SUM(CASE WHEN amount>0 THEN amount ELSE 0 END) AS costs
         FROM v_project_cost_by_currency WHERE project_id=$1
         GROUP BY month, source_type, currency_code ORDER BY month`,
          [id],
        ),
        query(
          'SELECT mo_number, status, planned_cost, actual_cost, qty_planned, qty_produced FROM manufacturing_orders WHERE project_id=$1',
          [id],
        ),
        query(
          'SELECT contract_number, rental_type, status, rate_amount, billing_cycle FROM rental_contracts WHERE project_id=$1',
          [id],
        ),
      ])

      if (project.rows.length === 0) return sendError(res, 404, 'NOT_FOUND', 'Project not found')
      sendOk(res, {
        profitability: project.rows,
        budget_vs_actual: budgetVsActual.rows,
        cost_timeline: costTimeline.rows,
        manufacturing_orders: mos.rows,
        rental_contracts: rentalContracts.rows,
      })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to generate project detail report', err)
    }
  },
)
