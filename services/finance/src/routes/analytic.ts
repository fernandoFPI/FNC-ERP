import { Router } from 'express'
import type { IRouter } from 'express'
import { z } from 'zod'
import { query } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const analyticRouter: IRouter = Router()

const Schema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(255),
  cost_center_id: z.string().uuid().optional(),
})

analyticRouter.get('/', requirePermission('finance.analytic_accounts.view', 'view'), async (req, res) => {
  try {
    const { is_active, search } = req.query as Record<string, string>
    const conditions = [`aa.company_id = $1`]
    const values: unknown[] = [req.auth!.companyId]
    let p = 1
    if (is_active !== undefined) { conditions.push(`aa.is_active = $${++p}`); values.push(is_active === 'true') }
    if (search) { conditions.push(`(aa.name ILIKE $${++p} OR aa.code ILIKE $${p})`); values.push(`%${search}%`) }
    const result = await query(`
      SELECT aa.*,
        p.id AS project_id,
        p.name AS project_name,
        p.status AS project_status,
        COUNT(DISTINCT jl.id)::integer AS journal_line_count,
        COALESCE(SUM(CASE WHEN jl.debit > 0 THEN jl.amount_company_currency ELSE 0 END), 0) AS total_debits,
        COALESCE(SUM(CASE WHEN jl.credit > 0 THEN jl.amount_company_currency ELSE 0 END), 0) AS total_credits
      FROM analytic_accounts aa
      LEFT JOIN projects p ON p.analytic_account_id = aa.id AND p.company_id = aa.company_id
      LEFT JOIN journal_lines jl ON jl.analytic_account_id = aa.id
      WHERE ${conditions.join(' AND ')}
      GROUP BY aa.id, p.id, p.name, p.status
      ORDER BY aa.code
    `, values)
    sendOk(res, result.rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch analytic accounts', err) }
})

analyticRouter.get('/:id', requirePermission('finance.analytic_accounts.view', 'view'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const aaRes = await query(`
      SELECT aa.*,
        p.id AS project_id, p.name AS project_name, p.status AS project_status,
        p.budget_currency AS project_budget_currency,
        (SELECT rate FROM fx_rates
         WHERE from_currency = p.budget_currency AND to_currency = 'IQD'
         ORDER BY rate_date DESC LIMIT 1) AS project_fx_rate,
        COUNT(DISTINCT jl.id)::integer AS journal_line_count,
        COALESCE(SUM(CASE WHEN jl.debit > 0 THEN jl.amount_company_currency ELSE 0 END), 0) AS total_debits,
        COALESCE(SUM(CASE WHEN jl.credit > 0 THEN jl.amount_company_currency ELSE 0 END), 0) AS total_credits
      FROM analytic_accounts aa
      LEFT JOIN projects p ON p.analytic_account_id = aa.id AND p.company_id = aa.company_id
      LEFT JOIN journal_lines jl ON jl.analytic_account_id = aa.id
      WHERE aa.id = $1 AND aa.company_id = $2
      GROUP BY aa.id, p.id, p.name, p.status, p.budget_currency
    `, [req.params['id'], companyId])
    if (!aaRes.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Analytic account not found')

    const linesRes = await query(`
      SELECT jl.id, jl.description, jl.debit, jl.credit, jl.currency_code,
             jl.fx_rate, jl.amount_company_currency,
             je.reference, je.entry_date AS je_date, je.source_type, je.status AS je_status,
             coa.name AS account_name, coa.code AS account_code
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.journal_entry_id
      JOIN chart_of_accounts coa ON coa.id = jl.account_id
      WHERE jl.analytic_account_id = $1
      ORDER BY je.entry_date DESC, je.reference
      LIMIT 200
    `, [req.params['id']])

    sendOk(res, { ...aaRes.rows[0], lines: linesRes.rows })
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch analytic account', err) }
})

analyticRouter.post('/', requirePermission('finance.analytic_accounts.edit', 'edit'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const parsed = Schema.safeParse(req.body)
    if (!parsed.success) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
    const { code, name, cost_center_id } = parsed.data
    const result = await query(
      `INSERT INTO analytic_accounts (company_id, code, name, cost_center_id) VALUES ($1,$2,$3,$4) RETURNING *`,
      [companyId, code, name, cost_center_id ?? null],
    )
    await logAudit({ companyId, userId: req.auth!.userId, action: 'CREATE', tableName: 'analytic_accounts', recordId: result.rows[0]!['id'] as string })
    sendOk(res, result.rows[0], 201)
  } catch (err: unknown) {
    const e = err as { code?: string }
    if (e.code === '23505') return sendError(res, 409, 'DUPLICATE_CODE', 'Code already exists')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create analytic account', err)
  }
})

analyticRouter.put('/:id', requirePermission('finance.analytic_accounts.edit', 'edit'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const parsed = Schema.partial().safeParse(req.body)
    if (!parsed.success) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
    const result = await query(
      `UPDATE analytic_accounts SET name = COALESCE($1, name), cost_center_id = COALESCE($2, cost_center_id)
       WHERE id = $3 AND company_id = $4 RETURNING *`,
      [parsed.data.name ?? null, parsed.data.cost_center_id ?? null, req.params['id'], companyId],
    )
    if (!result.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Analytic account not found')
    sendOk(res, result.rows[0])
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update analytic account', err) }
})

analyticRouter.delete('/:id', requirePermission('finance.analytic_accounts.edit', 'edit'), async (req, res) => {
  try {
    await query('UPDATE analytic_accounts SET is_active = false WHERE id = $1 AND company_id = $2', [req.params['id'], req.auth!.companyId])
    await logAudit({ companyId: req.auth!.companyId, userId: req.auth!.userId, action: 'DELETE', tableName: 'analytic_accounts', recordId: req.params['id']! })
    sendOk(res, { deleted: true })
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to delete analytic account', err) }
})
