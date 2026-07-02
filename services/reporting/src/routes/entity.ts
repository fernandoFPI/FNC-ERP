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
// Indirect method: Net Income → working capital adjustments → investing → financing
entityRouter.get('/cash-flow', requirePermission('reporting.financial.view', 'view'), async (req, res) => {
  try {
    const companyId = (req.query['company_id'] as string) || req.auth!.companyId
    const fromDate = (req.query['from_date'] as string) ?? new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]!
    const toDate = (req.query['to_date'] as string) ?? new Date().toISOString().split('T')[0]!

    const [netIncomeRes, assetRes, liabilityRes, equityRes, cashRes] = await Promise.all([
      // Net income for the period
      query(
        `SELECT
           COALESCE(SUM(CASE WHEN coa.account_type='revenue' THEN jl.credit-jl.debit ELSE 0 END),0) -
           COALESCE(SUM(CASE WHEN coa.account_type='expense' THEN jl.debit-jl.credit ELSE 0 END),0)
             AS net_income
         FROM chart_of_accounts coa
         JOIN journal_lines jl ON jl.account_id = coa.id
         JOIN journal_entries je ON je.id = jl.journal_entry_id
         WHERE je.company_id=$1 AND je.status='posted'
           AND coa.account_type IN ('revenue','expense')
           AND je.entry_date BETWEEN $2 AND $3`,
        [companyId, fromDate, toDate],
      ),

      // Non-cash asset changes: increase in asset = use of cash (negate debit-credit)
      query(
        `SELECT coa.code, coa.name,
                -(COALESCE(SUM(jl.debit-jl.credit),0)) AS cash_impact
         FROM chart_of_accounts coa
         JOIN journal_lines jl ON jl.account_id = coa.id
         JOIN journal_entries je ON je.id = jl.journal_entry_id
         WHERE je.company_id=$1 AND je.status='posted'
           AND coa.account_type='asset'
           AND coa.code NOT LIKE '11%'
           AND je.entry_date BETWEEN $2 AND $3
         GROUP BY coa.id, coa.code, coa.name
         HAVING COALESCE(SUM(jl.debit-jl.credit),0) <> 0
         ORDER BY coa.code`,
        [companyId, fromDate, toDate],
      ),

      // Liability changes: increase in liability = source of cash
      query(
        `SELECT coa.code, coa.name,
                COALESCE(SUM(jl.credit-jl.debit),0) AS cash_impact
         FROM chart_of_accounts coa
         JOIN journal_lines jl ON jl.account_id = coa.id
         JOIN journal_entries je ON je.id = jl.journal_entry_id
         WHERE je.company_id=$1 AND je.status='posted'
           AND coa.account_type='liability'
           AND je.entry_date BETWEEN $2 AND $3
         GROUP BY coa.id, coa.code, coa.name
         HAVING COALESCE(SUM(jl.credit-jl.debit),0) <> 0
         ORDER BY coa.code`,
        [companyId, fromDate, toDate],
      ),

      // Equity changes (financing activities)
      query(
        `SELECT coa.code, coa.name,
                COALESCE(SUM(jl.credit-jl.debit),0) AS cash_impact
         FROM chart_of_accounts coa
         JOIN journal_lines jl ON jl.account_id = coa.id
         JOIN journal_entries je ON je.id = jl.journal_entry_id
         WHERE je.company_id=$1 AND je.status='posted'
           AND coa.account_type='equity'
           AND je.entry_date BETWEEN $2 AND $3
         GROUP BY coa.id, coa.code, coa.name
         HAVING COALESCE(SUM(jl.credit-jl.debit),0) <> 0
         ORDER BY coa.code`,
        [companyId, fromDate, toDate],
      ),

      // Opening and closing cash balances (accounts with code 11*)
      query(
        `SELECT
           COALESCE(SUM(jl.debit-jl.credit) FILTER (WHERE je.entry_date < $2), 0) AS opening_balance,
           COALESCE(SUM(jl.debit-jl.credit) FILTER (WHERE je.entry_date <= $3), 0) AS closing_balance
         FROM chart_of_accounts coa
         JOIN journal_lines jl ON jl.account_id = coa.id
         JOIN journal_entries je ON je.id = jl.journal_entry_id
         WHERE je.company_id=$1 AND je.status='posted'
           AND coa.code LIKE '11%'`,
        [companyId, fromDate, toDate],
      ),
    ])

    const netIncome   = Number(netIncomeRes.rows[0]?.['net_income'] ?? 0)
    const openingCash = Number(cashRes.rows[0]?.['opening_balance'] ?? 0)
    const closingCash = Number(cashRes.rows[0]?.['closing_balance'] ?? 0)

    const toLine = (r: Record<string, unknown>) => ({
      code:   String(r['code']),
      label:  String(r['name']),
      amount: Number(r['cash_impact']),
    })

    const assetLines     = (assetRes.rows     as Record<string, unknown>[]).map(toLine)
    const liabilityLines = (liabilityRes.rows as Record<string, unknown>[]).map(toLine)
    const equityLines    = (equityRes.rows    as Record<string, unknown>[]).map(toLine)

    const workingCapitalTotal = [...assetLines, ...liabilityLines].reduce((s, l) => s + l.amount, 0)
    const operatingTotal      = netIncome + workingCapitalTotal
    const financingTotal      = equityLines.reduce((s, l) => s + l.amount, 0)
    const netChangeActivities = operatingTotal + financingTotal
    const netChangeCash       = closingCash - openingCash

    sendOk(res, {
      period: { from: fromDate, to: toDate },
      operating: {
        label: 'Cash Flows from Operating Activities',
        lines: [
          { code: '', label: 'Net Income', amount: netIncome },
          ...assetLines.map(l => ({ ...l, label: `Change in ${l.label}` })),
          ...liabilityLines.map(l => ({ ...l, label: `Change in ${l.label}` })),
        ],
        total: operatingTotal,
      },
      investing: {
        label: 'Cash Flows from Investing Activities',
        lines: [],
        total: 0,
        note: 'Fixed asset module not yet configured — investing activities will appear here once enabled',
      },
      financing: {
        label: 'Cash Flows from Financing Activities',
        lines: equityLines.map(l => ({ ...l, label: `Change in ${l.label}` })),
        total: financingTotal,
      },
      summary: {
        net_change_from_activities: netChangeActivities,
        opening_cash_balance:       openingCash,
        closing_cash_balance:       closingCash,
        net_change_in_cash:         netChangeCash,
        validated:                  Math.abs(netChangeActivities - netChangeCash) < 0.01,
      },
    })
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to generate cash flow statement', err) }
})
