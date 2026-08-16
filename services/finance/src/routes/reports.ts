import { Router } from 'express'
import type { IRouter } from 'express'
import { query } from '@fnc-erp/db'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const reportsRouter: IRouter = Router()

// All four reports below join journal_lines through a pre-filtered subquery
// (company/status/date/cost-center conditions applied INSIDE the subquery's
// WHERE) rather than putting those conditions in the outer LEFT JOIN's ON
// clause. A LEFT JOIN's ON clause only decides whether a match is found —
// it does not exclude the left-side row when the match fails, so a filter
// placed there (as this file previously did) silently filters nothing: an
// unposted entry, wrong-company entry, or a date/cost-center outside the
// requested range still had its debit/credit summed into the balance. The
// subquery keeps the "show every account, even ones with zero matching
// activity" LEFT JOIN behavior while actually restricting which lines count.

reportsRouter.get(
  '/trial-balance',
  requirePermission('finance.reports.view', 'view'),
  async (req, res) => {
    try {
      const companyId = req.auth!.companyId
      const { as_of_date } = req.query

      const params: unknown[] = [companyId]
      let dateFilter = ''
      if (as_of_date) {
        dateFilter = ` AND je.entry_date <= $${params.length + 1}`
        params.push(as_of_date)
      }

      const result = await query(
        `SELECT
           coa.id, coa.code, coa.name, coa.account_type,
           COALESCE(SUM(jl.debit), 0) AS total_debit,
           COALESCE(SUM(jl.credit), 0) AS total_credit,
           COALESCE(SUM(jl.debit - jl.credit), 0) AS balance
         FROM chart_of_accounts coa
         LEFT JOIN (
           SELECT jl.account_id, jl.debit, jl.credit
           FROM journal_lines jl
           JOIN journal_entries je ON je.id = jl.journal_entry_id
           WHERE je.company_id = $1 AND je.status = 'posted'${dateFilter}
         ) jl ON jl.account_id = coa.id
         WHERE coa.company_id = $1 AND coa.is_active = true
         GROUP BY coa.id, coa.code, coa.name, coa.account_type
         ORDER BY coa.code`,
        params,
      )
      sendOk(res, result.rows)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to generate trial balance', err)
    }
  },
)

reportsRouter.get(
  '/profit-loss',
  requirePermission('finance.reports.view', 'view'),
  async (req, res) => {
    try {
      const companyId = req.auth!.companyId
      const { from_date, to_date, cost_center_id } = req.query

      const params: unknown[] = [companyId]
      let filters = ''
      if (from_date) {
        filters += ` AND je.entry_date >= $${params.length + 1}`
        params.push(from_date)
      }
      if (to_date) {
        filters += ` AND je.entry_date <= $${params.length + 1}`
        params.push(to_date)
      }
      if (cost_center_id) {
        filters += ` AND jl.cost_center_id = $${params.length + 1}`
        params.push(cost_center_id)
      }

      const result = await query(
        `SELECT
           coa.id, coa.code, coa.name, coa.account_type,
           COALESCE(SUM(jl.debit - jl.credit), 0) AS balance
         FROM chart_of_accounts coa
         LEFT JOIN (
           SELECT jl.account_id, jl.debit, jl.credit, jl.cost_center_id
           FROM journal_lines jl
           JOIN journal_entries je ON je.id = jl.journal_entry_id
           WHERE je.company_id = $1 AND je.status = 'posted'${filters}
         ) jl ON jl.account_id = coa.id
         WHERE coa.company_id = $1 AND coa.account_type IN ('revenue','expense')
         GROUP BY coa.id, coa.code, coa.name, coa.account_type
         ORDER BY coa.code`,
        params,
      )
      sendOk(res, result.rows)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to generate P&L', err)
    }
  },
)

reportsRouter.get(
  '/balance-sheet',
  requirePermission('finance.reports.view', 'view'),
  async (req, res) => {
    try {
      const companyId = req.auth!.companyId
      const { as_of_date } = req.query

      const params: unknown[] = [companyId]
      let dateFilter = ''
      if (as_of_date) {
        dateFilter = ` AND je.entry_date <= $${params.length + 1}`
        params.push(as_of_date)
      }

      const result = await query(
        `SELECT
           coa.id, coa.code, coa.name, coa.account_type,
           COALESCE(SUM(jl.debit - jl.credit), 0) AS balance
         FROM chart_of_accounts coa
         LEFT JOIN (
           SELECT jl.account_id, jl.debit, jl.credit
           FROM journal_lines jl
           JOIN journal_entries je ON je.id = jl.journal_entry_id
           WHERE je.company_id = $1 AND je.status = 'posted'${dateFilter}
         ) jl ON jl.account_id = coa.id
         WHERE coa.company_id = $1 AND coa.account_type IN ('asset','liability','equity')
         GROUP BY coa.id, coa.code, coa.name, coa.account_type
         ORDER BY coa.code`,
        params,
      )
      sendOk(res, result.rows)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to generate balance sheet', err)
    }
  },
)

reportsRouter.get(
  '/account-balance',
  requirePermission('finance.reports.view', 'view'),
  async (req, res) => {
    try {
      const companyId = req.auth!.companyId
      const { account_id, as_of_date } = req.query
      if (!account_id) {
        sendError(res, 400, 'MISSING_PARAM', 'account_id is required')
        return
      }

      const params: unknown[] = [account_id, companyId]
      let dateFilter = ''
      if (as_of_date) {
        dateFilter = ` AND je.entry_date <= $${params.length + 1}`
        params.push(as_of_date)
      }

      const result = await query(
        `SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS balance
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl.journal_entry_id
         WHERE jl.account_id = $1 AND je.company_id = $2 AND je.status = 'posted'${dateFilter}`,
        params,
      )
      sendOk(res, {
        account_id,
        balance: result.rows[0] ? (result.rows[0] as { balance: string }).balance : '0',
      })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch account balance', err)
    }
  },
)
