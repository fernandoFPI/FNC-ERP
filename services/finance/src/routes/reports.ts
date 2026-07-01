import { Router } from 'express'
import type { IRouter } from 'express'
import { query } from '@fnc-erp/db'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const reportsRouter: IRouter = Router()

reportsRouter.get('/trial-balance', requirePermission('finance.reports.view', 'view'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const { as_of_date } = req.query
    const dateFilter = as_of_date ? `AND je.entry_date <= '${as_of_date as string}'` : ''

    const result = await query(
      `SELECT
         coa.id, coa.code, coa.name, coa.account_type,
         COALESCE(SUM(jl.debit), 0) AS total_debit,
         COALESCE(SUM(jl.credit), 0) AS total_credit,
         COALESCE(SUM(jl.debit - jl.credit), 0) AS balance
       FROM chart_of_accounts coa
       LEFT JOIN journal_lines jl ON jl.account_id = coa.id
       LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
         AND je.company_id = $1 AND je.status = 'posted' ${dateFilter}
       WHERE coa.company_id = $1 AND coa.is_active = true
       GROUP BY coa.id, coa.code, coa.name, coa.account_type
       ORDER BY coa.code`,
      [companyId],
    )
    sendOk(res, result.rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to generate trial balance', err) }
})

reportsRouter.get('/profit-loss', requirePermission('finance.reports.view', 'view'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const { from_date, to_date, cost_center_id } = req.query

    let sql = `
      SELECT
        coa.id, coa.code, coa.name, coa.account_type,
        COALESCE(SUM(jl.debit - jl.credit), 0) AS balance
      FROM chart_of_accounts coa
      LEFT JOIN journal_lines jl ON jl.account_id = coa.id
      LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
        AND je.company_id = $1 AND je.status = 'posted'`
    const params: unknown[] = [companyId]
    let idx = 2

    if (from_date) { sql += ` AND je.entry_date >= $${idx++}`; params.push(from_date) }
    if (to_date) { sql += ` AND je.entry_date <= $${idx++}`; params.push(to_date) }
    if (cost_center_id) { sql += ` AND jl.cost_center_id = $${idx++}`; params.push(cost_center_id) }

    sql += ` WHERE coa.company_id = $1 AND coa.account_type IN ('revenue','expense')
             GROUP BY coa.id, coa.code, coa.name, coa.account_type ORDER BY coa.code`

    const result = await query(sql, params)
    sendOk(res, result.rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to generate P&L', err) }
})

reportsRouter.get('/balance-sheet', requirePermission('finance.reports.view', 'view'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const { as_of_date } = req.query
    const dateFilter = as_of_date ? `AND je.entry_date <= '${as_of_date as string}'` : ''

    const result = await query(
      `SELECT
         coa.id, coa.code, coa.name, coa.account_type,
         COALESCE(SUM(jl.debit - jl.credit), 0) AS balance
       FROM chart_of_accounts coa
       LEFT JOIN journal_lines jl ON jl.account_id = coa.id
       LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
         AND je.company_id = $1 AND je.status = 'posted' ${dateFilter}
       WHERE coa.company_id = $1 AND coa.account_type IN ('asset','liability','equity')
       GROUP BY coa.id, coa.code, coa.name, coa.account_type ORDER BY coa.code`,
      [companyId],
    )
    sendOk(res, result.rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to generate balance sheet', err) }
})

reportsRouter.get('/account-balance', requirePermission('finance.reports.view', 'view'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const { account_id, as_of_date } = req.query
    if (!account_id) return sendError(res, 400, 'MISSING_PARAM', 'account_id is required')

    const dateFilter = as_of_date ? `AND je.entry_date <= '${as_of_date as string}'` : ''
    const result = await query(
      `SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS balance
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.journal_entry_id
       WHERE jl.account_id = $1 AND je.company_id = $2 AND je.status = 'posted' ${dateFilter}`,
      [account_id, companyId],
    )
    sendOk(res, { account_id, balance: result.rows[0] ? (result.rows[0] as { balance: string }).balance : '0' })
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch account balance', err) }
})
