import { Router } from 'express'
import type { IRouter } from 'express'
import { query } from '@fnc-erp/db'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const entityRouter: IRouter = Router()

// GET /reporting/trial-balance?company_id&as_of_date
entityRouter.get('/trial-balance', requirePermission('reporting.financial.view', 'view'), async (req, res) => {
  try {
    const companyId = (req.query['company_id'] as string) || req.auth!.companyId
    const asOfDate = req.query['as_of_date'] as string | undefined
    const dateClause = asOfDate ? `AND je.entry_date <= '${asOfDate}'` : ''
    const result = await query(
      `SELECT coa.id, coa.code, coa.name, coa.account_type,
              COALESCE(SUM(jl.debit),0) AS total_debit,
              COALESCE(SUM(jl.credit),0) AS total_credit,
              COALESCE(SUM(jl.debit-jl.credit),0) AS balance
       FROM chart_of_accounts coa
       LEFT JOIN journal_lines jl ON jl.account_id = coa.id
       LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
         AND je.company_id = $1 AND je.status = 'posted' ${dateClause}
       WHERE coa.company_id = $1 AND coa.is_active = true
       GROUP BY coa.id, coa.code, coa.name, coa.account_type
       ORDER BY coa.code`,
      [companyId],
    )
    sendOk(res, result.rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to generate trial balance', err) }
})

// GET /reporting/profit-loss?company_id&from_date&to_date
entityRouter.get('/profit-loss', requirePermission('reporting.financial.view', 'view'), async (req, res) => {
  try {
    const companyId = (req.query['company_id'] as string) || req.auth!.companyId
    const { from_date, to_date } = req.query
    let dateClause = `je.company_id = $1 AND je.status = 'posted'`
    const params: unknown[] = [companyId]
    let idx = 2
    if (from_date) { dateClause += ` AND je.entry_date >= $${idx++}`; params.push(from_date) }
    if (to_date) { dateClause += ` AND je.entry_date <= $${idx++}`; params.push(to_date) }
    const result = await query(
      `SELECT coa.code, coa.name, coa.account_type,
              COALESCE(SUM(jl.debit),0) AS total_debit,
              COALESCE(SUM(jl.credit),0) AS total_credit,
              CASE WHEN coa.account_type='revenue' THEN COALESCE(SUM(jl.credit-jl.debit),0)
                   ELSE COALESCE(SUM(jl.debit-jl.credit),0) END AS net_amount
       FROM chart_of_accounts coa
       JOIN journal_lines jl ON jl.account_id = coa.id
       JOIN journal_entries je ON je.id = jl.journal_entry_id
       WHERE ${dateClause} AND coa.account_type IN ('revenue','expense')
       GROUP BY coa.id, coa.code, coa.name, coa.account_type
       ORDER BY coa.account_type, coa.code`,
      params,
    )
    sendOk(res, result.rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to generate P&L', err) }
})

// GET /reporting/balance-sheet?company_id&as_of_date
entityRouter.get('/balance-sheet', requirePermission('reporting.financial.view', 'view'), async (req, res) => {
  try {
    const companyId = (req.query['company_id'] as string) || req.auth!.companyId
    const asOfDate = req.query['as_of_date'] as string | undefined
    const dateClause = asOfDate ? `AND je.entry_date <= '${asOfDate}'` : ''
    const result = await query(
      `SELECT coa.code, coa.name, coa.account_type,
              COALESCE(SUM(jl.debit-jl.credit),0) AS balance
       FROM chart_of_accounts coa
       LEFT JOIN journal_lines jl ON jl.account_id = coa.id
       LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
         AND je.company_id = $1 AND je.status = 'posted' ${dateClause}
       WHERE coa.company_id = $1 AND coa.account_type IN ('asset','liability','equity')
       GROUP BY coa.id, coa.code, coa.name, coa.account_type
       ORDER BY coa.account_type, coa.code`,
      [companyId],
    )
    sendOk(res, result.rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to generate balance sheet', err) }
})

// GET /reporting/cash-flow?company_id&from_date&to_date
entityRouter.get('/cash-flow', requirePermission('reporting.financial.view', 'view'), async (req, res) => {
  try {
    const companyId = (req.query['company_id'] as string) || req.auth!.companyId
    const { from_date, to_date } = req.query
    const params: unknown[] = [companyId]
    let idx = 2
    let dateClause = `je.company_id = $1 AND je.status = 'posted'`
    if (from_date) { dateClause += ` AND je.entry_date >= $${idx++}`; params.push(from_date) }
    if (to_date) { dateClause += ` AND je.entry_date <= $${idx++}`; params.push(to_date) }
    // Simplified: operating = net movement in cash/bank accounts
    const result = await query(
      `SELECT coa.code, coa.name, coa.account_type,
              COALESCE(SUM(jl.debit-jl.credit),0) AS net_movement
       FROM chart_of_accounts coa
       JOIN journal_lines jl ON jl.account_id = coa.id
       JOIN journal_entries je ON je.id = jl.journal_entry_id
       WHERE ${dateClause} AND coa.code LIKE '11%'
       GROUP BY coa.id, coa.code, coa.name, coa.account_type
       ORDER BY coa.code`,
      params,
    )
    sendOk(res, result.rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to generate cash flow', err) }
})
