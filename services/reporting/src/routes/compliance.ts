import { Router } from 'express'
import type { IRouter } from 'express'
import { query } from '@fnc-erp/db'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const complianceRouter: IRouter = Router()

// GET /reporting/compliance/withholding-tax?company_id&from_date&to_date
complianceRouter.get('/withholding-tax', requirePermission('reporting.compliance.view', 'view'), async (req, res) => {
  try {
    const companyId = (req.query['company_id'] as string) || req.auth!.companyId
    const { from_date, to_date } = req.query
    const params: unknown[] = [companyId]
    let idx = 2
    let dateClause = `vi.company_id = $1`
    if (from_date) { dateClause += ` AND vi.invoice_date >= $${idx++}`; params.push(from_date) }
    if (to_date) { dateClause += ` AND vi.invoice_date <= $${idx++}`; params.push(to_date) }
    const result = await query(
      `SELECT v.name AS vendor_name, v.withholding_tax_type, v.withholding_tax_rate,
              vi.invoice_number, vi.total_amount, vi.currency_code, vi.wht_amount,
              vi.invoice_date AS transaction_date
       FROM vendor_invoices vi
       JOIN vendors v ON v.id = vi.vendor_id
       WHERE ${dateClause} AND vi.wht_amount > 0
       ORDER BY v.name, vi.invoice_date`,
      params,
    )
    sendOk(res, result.rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to generate WHT report', err) }
})

// GET /reporting/compliance/wht-payable?company_id
complianceRouter.get('/wht-payable', requirePermission('finance.ap.view', 'view'), async (req, res) => {
  try {
    const companyId = (req.query['company_id'] as string) || req.auth!.companyId
    const year = new Date().getFullYear()

    const [summaryRes, monthlyRes, vendorRes] = await Promise.all([
      query(
        `SELECT
           COALESCE(SUM(vi.wht_amount), 0)         AS total_wht_payable,
           COUNT(DISTINCT vi.vendor_id)::int        AS vendor_count,
           COUNT(*)::int                            AS invoice_count
         FROM vendor_invoices vi
         WHERE vi.company_id = $1
           AND EXTRACT(YEAR FROM vi.invoice_date) = $2
           AND vi.wht_amount > 0`,
        [companyId, year],
      ),
      query(
        `SELECT
           EXTRACT(MONTH FROM vi.invoice_date)::int  AS month,
           COALESCE(SUM(vi.total_amount), 0)         AS payments_subject_to_wht,
           COALESCE(SUM(vi.wht_amount), 0)           AS wht_amount
         FROM vendor_invoices vi
         WHERE vi.company_id = $1
           AND EXTRACT(YEAR FROM vi.invoice_date) = $2
           AND vi.wht_amount > 0
         GROUP BY month
         ORDER BY month`,
        [companyId, year],
      ),
      query(
        `SELECT
           v.name                                    AS vendor_name,
           COUNT(*)::int                             AS invoice_count,
           COALESCE(SUM(vi.wht_amount), 0)           AS total_wht,
           COALESCE(SUM(vi.total_amount), 0)         AS total_payments
         FROM vendor_invoices vi
         JOIN vendors v ON v.id = vi.vendor_id
         WHERE vi.company_id = $1
           AND EXTRACT(YEAR FROM vi.invoice_date) = $2
           AND vi.wht_amount > 0
         GROUP BY v.id, v.name
         ORDER BY total_wht DESC
         LIMIT 10`,
        [companyId, year],
      ),
    ])

    const s = summaryRes.rows[0] as { total_wht_payable: string; vendor_count: number; invoice_count: number }
    sendOk(res, {
      year,
      total_wht_payable: parseFloat(s.total_wht_payable),
      vendor_count: s.vendor_count,
      invoice_count: s.invoice_count,
      monthly: monthlyRes.rows,
      top_vendors: vendorRes.rows,
    })
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load WHT payable summary', err) }
})

// GET /reporting/compliance/fx-exposure?company_id&as_of_date
complianceRouter.get('/fx-exposure', requirePermission('reporting.compliance.view', 'view'), async (req, res) => {
  try {
    const companyId = (req.query['company_id'] as string) || req.auth!.companyId
    const asOfDate = req.query['as_of_date'] as string | undefined
    const dateClause = asOfDate ? `AND je.entry_date <= '${asOfDate}'` : ''
    const result = await query(
      `SELECT jl.currency_code,
              SUM(CASE WHEN coa.account_type='asset' THEN jl.debit-jl.credit ELSE 0 END) AS ar_foreign,
              SUM(CASE WHEN coa.account_type='liability' THEN jl.credit-jl.debit ELSE 0 END) AS ap_foreign,
              SUM(CASE WHEN coa.account_type='asset' THEN jl.debit-jl.credit ELSE 0 END) -
              SUM(CASE WHEN coa.account_type='liability' THEN jl.credit-jl.debit ELSE 0 END) AS net_exposure,
              MAX(fr.rate) AS current_rate,
              (SUM(CASE WHEN coa.account_type='asset' THEN jl.debit-jl.credit ELSE 0 END) -
               SUM(CASE WHEN coa.account_type='liability' THEN jl.credit-jl.debit ELSE 0 END))
              * MAX(fr.rate) AS net_exposure_iqd
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.journal_entry_id
       JOIN chart_of_accounts coa ON coa.id = jl.account_id
       LEFT JOIN fx_rates fr ON fr.from_currency = jl.currency_code AND fr.to_currency = 'IQD'
         AND fr.rate_date = (SELECT MAX(rate_date) FROM fx_rates WHERE from_currency = jl.currency_code AND to_currency = 'IQD')
       WHERE je.company_id = $1 AND je.status = 'posted' ${dateClause}
         AND jl.currency_code != 'IQD'
       GROUP BY jl.currency_code
       ORDER BY jl.currency_code`,
      [companyId],
    )
    sendOk(res, result.rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to generate FX exposure', err) }
})

// GET /reporting/compliance/payroll-tax?company_id&from_date&to_date
complianceRouter.get('/payroll-tax', requirePermission('reporting.compliance.view', 'view'), async (req, res) => {
  try {
    const companyId = (req.query['company_id'] as string) || req.auth!.companyId
    const { from_date, to_date } = req.query
    const params: unknown[] = [companyId]
    let idx = 2
    let dateClause = `ps.company_id = $1`
    if (from_date) { dateClause += ` AND pr.start_date >= $${idx++}`; params.push(from_date) }
    if (to_date) { dateClause += ` AND pr.end_date <= $${idx++}`; params.push(to_date) }
    const result = await query(
      `SELECT e.first_name || ' ' || e.last_name AS employee_name,
              pr.period_name, ps.gross_salary, ps.income_tax, ps.social_security,
              ps.net_salary, ps.currency_code
       FROM payslips ps
       JOIN payroll_runs pr ON pr.id = ps.payroll_run_id
       JOIN employees e ON e.id = ps.employee_id
       WHERE ${dateClause} AND pr.status = 'posted'
       ORDER BY pr.start_date, e.last_name`,
      params,
    )
    sendOk(res, result.rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to generate payroll tax report', err) }
})

// GET /reporting/inventory/valuation?company_id&as_of_date
complianceRouter.get('/inventory-valuation', requirePermission('reporting.compliance.view', 'view'), async (req, res) => {
  try {
    const companyId = (req.query['company_id'] as string) || req.auth!.companyId
    const result = await query(
      `SELECT p.sku, p.name AS product_name, sl.name AS location_name,
              sb.qty_on_hand, sb.average_cost,
              sb.qty_on_hand * sb.average_cost AS total_value,
              p.uom
       FROM stock_balances sb
       JOIN products p ON p.id = sb.product_id
       JOIN stock_locations sl ON sl.id = sb.location_id
       WHERE sl.company_id = $1 AND sb.qty_on_hand > 0
       ORDER BY p.sku, sl.name`,
      [companyId],
    )
    const totalValue = (result.rows as Array<{ total_value: string }>)
      .reduce((sum, r) => sum + parseFloat(r.total_value ?? '0'), 0)
    sendOk(res, { items: result.rows, total_inventory_value: totalValue })
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to generate inventory valuation', err) }
})
