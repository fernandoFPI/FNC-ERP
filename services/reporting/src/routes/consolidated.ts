import { Router } from 'express'
import type { IRouter } from 'express'
import { query } from '@fnc-erp/db'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const consolidatedRouter: IRouter = Router()

// GET /reporting/consolidated/trial-balance?as_of_date
consolidatedRouter.get('/trial-balance', requirePermission('reporting.consolidated.view', 'view'), async (req, res) => {
  try {
    if (!['system_admin','company_admin'].includes(req.auth!.role)) {
      return sendError(res, 403, 'FORBIDDEN', 'Consolidated reports require system_admin or company_admin role')
    }
    const asOfDate = req.query['as_of_date'] as string | undefined
    // Query the consolidated view and apply interco eliminations
    let sql = `SELECT * FROM v_consolidated_trial_balance`
    if (asOfDate) {
      // The view doesn't filter by date; we re-query with date filter
      sql = `SELECT coa.account_type, coa.code AS account_code, coa.name AS account_name,
                    c.id AS company_id, c.name AS company_name,
                    SUM(jl.debit * jl.fx_rate) AS total_debit_iqd,
                    SUM(jl.credit * jl.fx_rate) AS total_credit_iqd,
                    SUM((jl.debit - jl.credit) * jl.fx_rate) AS balance_iqd
             FROM journal_lines jl
             JOIN journal_entries je ON je.id = jl.journal_entry_id
             JOIN chart_of_accounts coa ON coa.id = jl.account_id
             JOIN companies c ON c.id = je.company_id
             WHERE je.status = 'posted' AND je.entry_date <= $1
             GROUP BY coa.account_type, coa.code, coa.name, c.id, c.name`
    }
    const params = asOfDate ? [asOfDate] : []
    const result = await query(sql, params)
    sendOk(res, result.rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to generate consolidated trial balance', err) }
})

// GET /reporting/consolidated/profit-loss?from_date&to_date
consolidatedRouter.get('/profit-loss', requirePermission('reporting.consolidated.view', 'view'), async (req, res) => {
  try {
    if (!['system_admin','company_admin'].includes(req.auth!.role)) {
      return sendError(res, 403, 'FORBIDDEN', 'Consolidated reports require system_admin or company_admin role')
    }
    const { from_date, to_date } = req.query
    const params: unknown[] = []
    let dateClause = `je.status = 'posted'`
    let idx = 1
    if (from_date) { dateClause += ` AND je.entry_date >= $${idx++}`; params.push(from_date) }
    if (to_date) { dateClause += ` AND je.entry_date <= $${idx++}`; params.push(to_date) }
    const result = await query(
      `SELECT coa.account_type, coa.code, coa.name,
              c.name AS company_name,
              SUM(CASE WHEN coa.account_type='revenue' THEN (jl.credit-jl.debit)*jl.fx_rate
                       ELSE (jl.debit-jl.credit)*jl.fx_rate END) AS net_iqd
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.journal_entry_id
       JOIN chart_of_accounts coa ON coa.id = jl.account_id
       JOIN companies c ON c.id = je.company_id
       WHERE ${dateClause} AND coa.account_type IN ('revenue','expense')
       GROUP BY coa.account_type, coa.code, coa.name, c.name
       ORDER BY coa.account_type, coa.code, c.name`,
      params,
    )
    sendOk(res, result.rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to generate consolidated P&L', err) }
})

// GET /reporting/consolidated/balance-sheet?as_of_date
consolidatedRouter.get('/balance-sheet', requirePermission('reporting.consolidated.view', 'view'), async (req, res) => {
  try {
    if (!['system_admin','company_admin'].includes(req.auth!.role)) {
      return sendError(res, 403, 'FORBIDDEN', 'Consolidated reports require system_admin or company_admin role')
    }
    const asOfDate = req.query['as_of_date'] as string | undefined
    const params: unknown[] = []
    let dateClause = `je.status = 'posted'`
    if (asOfDate) { dateClause += ` AND je.entry_date <= $1`; params.push(asOfDate) }
    const result = await query(
      `SELECT coa.account_type, coa.code, coa.name,
              c.name AS company_name,
              SUM((jl.debit-jl.credit)*jl.fx_rate) AS balance_iqd
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.journal_entry_id
       JOIN chart_of_accounts coa ON coa.id = jl.account_id
       JOIN companies c ON c.id = je.company_id
       WHERE ${dateClause} AND coa.account_type IN ('asset','liability','equity')
       GROUP BY coa.account_type, coa.code, coa.name, c.name
       ORDER BY coa.account_type, coa.code, c.name`,
      params,
    )
    // Fetch interco eliminations
    const eliminations = await query('SELECT * FROM v_interco_eliminations')
    sendOk(res, { balances: result.rows, interco_eliminations: eliminations.rows })
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to generate consolidated balance sheet', err) }
})
