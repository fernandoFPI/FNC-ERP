import { Router } from 'express'
import type { IRouter } from 'express'
import { query } from '@fnc-erp/db'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const arRouter: IRouter = Router()

// ── GET /finance/ar/summary ───────────────────────────────────
// Unified AR: project invoices + rental invoices combined
// rental_invoices has no due_date/amount_paid/company_id — proxied via join + billing_period_end
arRouter.get('/summary', requirePermission('finance.ar.view', 'view'), async (req, res) => {
  try {
    const result = await query(
      `
      WITH all_inv AS (
        -- Project invoices
        SELECT
          pi.net_payable                                                    AS total_amount,
          COALESCE(SUM(pip.amount), 0)                                      AS amount_paid,
          COALESCE(SUM(pip.amount) FILTER (
            WHERE pip.payment_date >= date_trunc('month', CURRENT_DATE)
          ), 0)                                                             AS paid_this_month,
          pi.due_date,
          pi.status,
          pi.currency_code
        FROM project_invoices pi
        LEFT JOIN project_invoice_payments pip ON pip.invoice_id = pi.id
        WHERE pi.company_id = $1
          AND pi.status NOT IN ('draft','cancelled')
        GROUP BY pi.id

        UNION ALL

        -- Rental invoices (billing_period_end as due_date proxy; amount_paid inferred from status)
        SELECT
          ri.amount                                                          AS total_amount,
          CASE WHEN ri.status = 'paid' THEN ri.amount ELSE 0 END            AS amount_paid,
          CASE WHEN ri.status = 'paid'
               AND ri.created_at >= date_trunc('month', CURRENT_DATE)
               THEN ri.amount ELSE 0 END                                    AS paid_this_month,
          ri.billing_period_end                                              AS due_date,
          ri.status,
          ri.currency_code
        FROM rental_invoices ri
        JOIN rental_contracts rc ON rc.id = ri.contract_id
        WHERE rc.company_id = $1
          AND ri.status NOT IN ('draft','cancelled')
      )
      SELECT
        COALESCE(SUM(total_amount - amount_paid), 0)                        AS total_outstanding,
        COALESCE(SUM(total_amount), 0)                                      AS total_invoiced,
        COALESCE(SUM(amount_paid), 0)                                       AS total_collected,
        COALESCE(SUM(paid_this_month), 0)                                   AS collected_this_month,
        COALESCE(SUM(total_amount - amount_paid) FILTER (
          WHERE status != 'paid' AND CURRENT_DATE - due_date BETWEEN 0 AND 30
        ), 0) AS bucket_0_30,
        COALESCE(SUM(total_amount - amount_paid) FILTER (
          WHERE status != 'paid' AND CURRENT_DATE - due_date BETWEEN 31 AND 60
        ), 0) AS bucket_31_60,
        COALESCE(SUM(total_amount - amount_paid) FILTER (
          WHERE status != 'paid' AND CURRENT_DATE - due_date BETWEEN 61 AND 90
        ), 0) AS bucket_61_90,
        COALESCE(SUM(total_amount - amount_paid) FILTER (
          WHERE status != 'paid' AND CURRENT_DATE - due_date > 90
        ), 0) AS bucket_over_90,
        COUNT(*) FILTER (WHERE status != 'paid')::integer                  AS open_count,
        COUNT(*) FILTER (
          WHERE due_date < CURRENT_DATE AND status != 'paid'
        )::integer                                                           AS overdue_count
      FROM all_inv
    `,
      [req.auth!.companyId],
    )

    sendOk(res, result.rows[0])
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to get AR summary', err)
  }
})

// ── GET /finance/ar/wht-recoverable ──────────────────────────
// WHT withheld by clients from FNC invoices (client_withholds scenario) YTD
arRouter.get('/wht-recoverable', requirePermission('finance.ar.view', 'view'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const year = new Date().getFullYear()
    const result = await query(
      `SELECT
         COALESCE(
           (SELECT SUM(pi.wht_amount)
            FROM project_invoices pi
            WHERE pi.company_id = $1
              AND pi.wht_scenario = 'client_withholds'
              AND EXTRACT(YEAR FROM pi.invoice_date) = $2)
           +
           (SELECT COALESCE(SUM(ri.wht_amount), 0)
            FROM rental_invoices ri
            JOIN rental_contracts rc ON rc.id = ri.contract_id
            WHERE rc.company_id = $1
              AND ri.wht_scenario = 'client_withholds'
              AND EXTRACT(YEAR FROM ri.created_at) = $2)
         , 0) AS wht_recoverable`,
      [companyId, year],
    )
    sendOk(res, {
      wht_recoverable: parseFloat((result.rows[0] as { wht_recoverable: string }).wht_recoverable),
    })
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to get WHT recoverable', err)
  }
})

// ── GET /finance/ar/invoices ──────────────────────────────────
// All outstanding AR invoices unified, oldest overdue first
arRouter.get('/invoices', requirePermission('finance.ar.view', 'view'), async (req, res) => {
  try {
    const {
      source_type,
      overdue,
      client_name,
      page = '1',
      limit = '20',
    } = req.query as Record<string, string>
    const offset = (parseInt(page) - 1) * parseInt(limit)

    const conditions: string[] = []
    if (source_type === 'project' || source_type === 'rental')
      conditions.push(`source_type = '${source_type}'`)
    if (overdue === 'true') conditions.push(`due_date < CURRENT_DATE AND status != 'paid'`)
    if (client_name) conditions.push(`client_name ILIKE '%${client_name.replace(/'/g, "''")}%'`)
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const result = await query(
      `
      WITH all_inv AS (
        SELECT
          pi.id,
          pi.invoice_number,
          pi.net_payable                              AS total_amount,
          COALESCE(SUM(pip.amount), 0)                AS amount_paid,
          pi.net_payable - COALESCE(SUM(pip.amount),0) AS outstanding,
          pi.due_date,
          pi.status,
          pi.currency_code,
          'project'                                   AS source_type,
          p.client_name,
          p.name                                      AS source_name,
          p.id                                        AS source_id,
          (CURRENT_DATE - pi.due_date)::integer       AS days_overdue,
          pi.created_at
        FROM project_invoices pi
        JOIN projects p ON p.id = pi.project_id
        LEFT JOIN project_invoice_payments pip ON pip.invoice_id = pi.id
        WHERE pi.company_id = $1 AND pi.status NOT IN ('draft','cancelled')
        GROUP BY pi.id, p.client_name, p.name, p.id

        UNION ALL

        SELECT
          ri.id,
          ri.invoice_number,
          ri.amount                                   AS total_amount,
          CASE WHEN ri.status = 'paid' THEN ri.amount ELSE 0 END AS amount_paid,
          CASE WHEN ri.status = 'paid' THEN 0 ELSE ri.amount END AS outstanding,
          ri.billing_period_end                       AS due_date,
          ri.status,
          ri.currency_code,
          'rental'                                    AS source_type,
          rc.client_name,
          rc.contract_number                          AS source_name,
          rc.id                                       AS source_id,
          (CURRENT_DATE - ri.billing_period_end)::integer AS days_overdue,
          ri.created_at
        FROM rental_invoices ri
        JOIN rental_contracts rc ON rc.id = ri.contract_id
        WHERE rc.company_id = $1 AND ri.status NOT IN ('draft','cancelled')
      )
      SELECT * FROM all_inv
      ${whereClause}
      ORDER BY
        CASE WHEN days_overdue > 0 AND status != 'paid' THEN 0 ELSE 1 END,
        days_overdue DESC, due_date ASC
      LIMIT $2 OFFSET $3
    `,
      [req.auth!.companyId, parseInt(limit), offset],
    )

    sendOk(res, result.rows)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list AR invoices', err)
  }
})

// ── GET /finance/ar/by-client ─────────────────────────────────
// Outstanding AR grouped by client, highest balance first
arRouter.get('/by-client', requirePermission('finance.ar.view', 'view'), async (req, res) => {
  try {
    const result = await query(
      `
      WITH all_inv AS (
        SELECT
          p.client_name,
          pi.net_payable - COALESCE(SUM(pip.amount), 0) AS outstanding,
          pi.due_date,
          pi.currency_code
        FROM project_invoices pi
        JOIN projects p ON p.id = pi.project_id
        LEFT JOIN project_invoice_payments pip ON pip.invoice_id = pi.id
        WHERE pi.company_id = $1
          AND pi.status NOT IN ('draft','cancelled','paid')
        GROUP BY pi.id, p.client_name

        UNION ALL

        SELECT
          rc.client_name,
          ri.amount AS outstanding,
          ri.billing_period_end AS due_date,
          ri.currency_code
        FROM rental_invoices ri
        JOIN rental_contracts rc ON rc.id = ri.contract_id
        WHERE rc.company_id = $1
          AND ri.status NOT IN ('draft','cancelled','paid')
      )
      SELECT
        client_name,
        COUNT(*)::integer                                            AS invoice_count,
        COALESCE(SUM(outstanding), 0)                               AS total_outstanding,
        MIN(due_date)                                                AS oldest_due_date,
        COUNT(*) FILTER (WHERE due_date < CURRENT_DATE)::integer     AS overdue_count,
        COALESCE(SUM(outstanding) FILTER (WHERE due_date < CURRENT_DATE), 0) AS overdue_amount
      FROM all_inv
      WHERE client_name IS NOT NULL
      GROUP BY client_name
      ORDER BY total_outstanding DESC
    `,
      [req.auth!.companyId],
    )

    sendOk(res, result.rows)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to get AR by client', err)
  }
})
