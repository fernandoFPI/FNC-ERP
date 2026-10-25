import { Router } from 'express'
import type { IRouter } from 'express'
import { query } from '@fnc-erp/db'
import { getAuth } from '@fnc-erp/auth'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const entityRouter: IRouter = Router()

// GET /reporting/cash-flow?company_id&from_date&to_date
// Indirect method: Net Income → working capital adjustments → investing → financing
entityRouter.get(
  '/cash-flow',
  requirePermission('reporting.financial.view', 'view'),
  async (req, res) => {
    try {
      // Multi-tenancy: company_id is always the caller's own session company,
      // never a client-supplied value -- a query-string company_id used to
      // be honored ahead of the session's, letting any caller with this
      // route's permission read another company's financial reports.
      const companyId = getAuth(req).companyId
      const fromDate =
        (req.query['from_date'] as string) ??
        new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10)
      const toDate = (req.query['to_date'] as string) ?? new Date().toISOString().slice(0, 10)

      // 0.1 sweep: every sub-query below summed jl.debit/jl.credit straight
      // across every currency_code, and the operating/investing/financing
      // totals (and the activities-vs-cash `validated` cross-check) were
      // built on those blended sums. Resolves which currency to report in
      // (else the company's own) plus every currency with real journal
      // activity, same pattern used across the rest of this sweep.
      const availableCurrenciesRes = await query<{ currency_code: string }>(
        `SELECT DISTINCT jl.currency_code
         FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_entry_id
         WHERE je.company_id=$1 AND je.status='posted' ORDER BY 1`,
        [companyId],
      )
      const availableCurrencies = availableCurrenciesRes.rows.map((r) => r.currency_code)
      let currencyCode = req.query['currency_code'] as string | undefined
      if (!currencyCode) {
        const companyRes = await query<{ currency_code: string }>(`SELECT currency_code FROM companies WHERE id=$1`, [
          companyId,
        ])
        currencyCode = companyRes.rows[0]?.currency_code ?? 'IQD'
      }

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
           AND je.entry_date BETWEEN $2 AND $3
           AND jl.currency_code=$4`,
          [companyId, fromDate, toDate, currencyCode],
        ),

        // Non-cash asset changes: increase in asset = use of cash (negate debit-credit)
        // G1/G2: excluding only code '11%' missed every BANK-categorized
        // account (1220-1225 — Banks, Bank Accounts IQD/USD, Short-term
        // Deposits, Cheques Under Collection all sit under '12%'), so a
        // bank balance movement was double-counted here as a "non-cash
        // asset change" while also being excluded from the cash
        // reconciliation below. account_category is the actual
        // classification (migration 236), not the account code.
        query(
          `SELECT coa.code, coa.name,
                -(COALESCE(SUM(jl.debit-jl.credit),0)) AS cash_impact
         FROM chart_of_accounts coa
         JOIN journal_lines jl ON jl.account_id = coa.id
         JOIN journal_entries je ON je.id = jl.journal_entry_id
         WHERE je.company_id=$1 AND je.status='posted'
           AND coa.account_type='asset'
           AND (coa.account_category IS NULL OR coa.account_category NOT IN ('CASH','BANK'))
           AND je.entry_date BETWEEN $2 AND $3
           AND jl.currency_code=$4
         GROUP BY coa.id, coa.code, coa.name
         HAVING COALESCE(SUM(jl.debit-jl.credit),0) <> 0
         ORDER BY coa.code`,
          [companyId, fromDate, toDate, currencyCode],
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
           AND jl.currency_code=$4
         GROUP BY coa.id, coa.code, coa.name
         HAVING COALESCE(SUM(jl.credit-jl.debit),0) <> 0
         ORDER BY coa.code`,
          [companyId, fromDate, toDate, currencyCode],
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
           AND jl.currency_code=$4
         GROUP BY coa.id, coa.code, coa.name
         HAVING COALESCE(SUM(jl.credit-jl.debit),0) <> 0
         ORDER BY coa.code`,
          [companyId, fromDate, toDate, currencyCode],
        ),

        // Opening and closing cash balances — by account_category, not a
        // code prefix (G1/G2; see note above the non-cash-asset query).
        query(
          `SELECT
           COALESCE(SUM(jl.debit-jl.credit) FILTER (WHERE je.entry_date < $2), 0) AS opening_balance,
           COALESCE(SUM(jl.debit-jl.credit) FILTER (WHERE je.entry_date <= $3), 0) AS closing_balance
         FROM chart_of_accounts coa
         JOIN journal_lines jl ON jl.account_id = coa.id
         JOIN journal_entries je ON je.id = jl.journal_entry_id
         WHERE je.company_id=$1 AND je.status='posted'
           AND coa.account_category IN ('CASH','BANK')
           AND jl.currency_code=$4`,
          [companyId, fromDate, toDate, currencyCode],
        ),
      ])

      const netIncome = Number(netIncomeRes.rows[0]?.['net_income'] ?? 0)
      const openingCash = Number(cashRes.rows[0]?.['opening_balance'] ?? 0)
      const closingCash = Number(cashRes.rows[0]?.['closing_balance'] ?? 0)

      const toLine = (r: Record<string, unknown>) => ({
        code: String(r['code']),
        label: String(r['name']),
        amount: Number(r['cash_impact']),
      })

      const assetLines = (assetRes.rows as Record<string, unknown>[]).map(toLine)
      const liabilityLines = (liabilityRes.rows as Record<string, unknown>[]).map(toLine)
      const equityLines = (equityRes.rows as Record<string, unknown>[]).map(toLine)

      const workingCapitalTotal = [...assetLines, ...liabilityLines].reduce(
        (s, l) => s + l.amount,
        0,
      )
      const operatingTotal = netIncome + workingCapitalTotal
      const financingTotal = equityLines.reduce((s, l) => s + l.amount, 0)
      const netChangeActivities = operatingTotal + financingTotal
      const netChangeCash = closingCash - openingCash

      sendOk(res, {
        period: { from: fromDate, to: toDate },
        currencyCode,
        availableCurrencies,
        operating: {
          label: 'Cash Flows from Operating Activities',
          lines: [
            { code: '', label: 'Net Income', amount: netIncome },
            ...assetLines.map((l) => ({ ...l, label: `Change in ${l.label}` })),
            ...liabilityLines.map((l) => ({ ...l, label: `Change in ${l.label}` })),
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
          lines: equityLines.map((l) => ({ ...l, label: `Change in ${l.label}` })),
          total: financingTotal,
        },
        summary: {
          net_change_from_activities: netChangeActivities,
          opening_cash_balance: openingCash,
          closing_cash_balance: closingCash,
          net_change_in_cash: netChangeCash,
          validated: Math.abs(netChangeActivities - netChangeCash) < 0.01,
        },
      })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to generate cash flow statement', err)
    }
  },
)
