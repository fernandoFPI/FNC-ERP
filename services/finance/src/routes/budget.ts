import { Router } from 'express'
import { z } from 'zod'
import { query, withTransaction } from '@fnc-erp/db'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'
import { logAudit } from '@fnc-erp/audit'

export const budgetRouter: import('express').Router = Router()

const budgetSchema = z.object({
  name: z.string().min(1),
  fiscal_year: z.coerce.number().int().min(2000).max(2100),
  currency_code: z.string().length(3).default('IQD'),
  notes: z.string().optional(),
})

// ─── List budgets ─────────────────────────────────────────────────────────────

budgetRouter.get('/', requirePermission('finance.budget.view', 'view'), async (req, res) => {
  try {
    const r = await query(
      `SELECT b.*,
              COUNT(bl.id)::INT AS line_count,
              COALESCE(SUM(bl.amount),0) AS total_budget
       FROM gl_budgets b
       LEFT JOIN gl_budget_lines bl ON bl.budget_id = b.id
       WHERE b.company_id = $1
       GROUP BY b.id
       ORDER BY b.fiscal_year DESC, b.name`,
      [req.auth!.companyId],
    )
    sendOk(res, r.rows)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load budgets', err)
  }
})

// ─── Get budget with lines ────────────────────────────────────────────────────

budgetRouter.get('/:id', requirePermission('finance.budget.view', 'view'), async (req, res) => {
  try {
    const b = await query(`SELECT * FROM gl_budgets WHERE id=$1 AND company_id=$2`, [
      req.params['id'],
      req.auth!.companyId,
    ])
    if (!b.rows[0]) {
      sendError(res, 404, 'NOT_FOUND', 'Budget not found')
      return
    }
    const lines = await query(
      `SELECT bl.*, a.code AS account_code, a.name AS account_name, a.account_type
       FROM gl_budget_lines bl
       JOIN chart_of_accounts a ON a.id = bl.account_id
       WHERE bl.budget_id=$1
       ORDER BY a.code, bl.period`,
      [req.params['id']],
    )
    sendOk(res, { ...b.rows[0], lines: lines.rows })
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load budget', err)
  }
})

// ─── Create budget ────────────────────────────────────────────────────────────

budgetRouter.post('/', requirePermission('finance.budget.edit', 'edit'), async (req, res) => {
  try {
    const d = budgetSchema.parse(req.body)
    const r = await query(
      `INSERT INTO gl_budgets (company_id, name, fiscal_year, currency_code, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        req.auth!.companyId,
        d.name,
        d.fiscal_year,
        d.currency_code,
        d.notes ?? null,
        req.auth!.userId,
      ],
    )
    await logAudit({
      companyId: req.auth!.companyId,
      userId: req.auth!.userId,
      action: 'INSERT',
      tableName: 'gl_budgets',
      recordId: r.rows[0]!['id'] as string,
      newValues: { name: d.name, fiscal_year: d.fiscal_year },
    })
    sendOk(res, r.rows[0], 201)
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      sendError(res, 409, 'DUPLICATE', 'Budget name already exists for this year')
      return
    }
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create budget', err)
  }
})

// ─── Update budget header ─────────────────────────────────────────────────────

budgetRouter.put('/:id', requirePermission('finance.budget.edit', 'edit'), async (req, res) => {
  try {
    const d = budgetSchema.parse(req.body)
    const existing = await query(`SELECT status FROM gl_budgets WHERE id=$1 AND company_id=$2`, [
      req.params['id'],
      req.auth!.companyId,
    ])
    if (!existing.rows[0]) {
      sendError(res, 404, 'NOT_FOUND', 'Budget not found')
      return
    }
    if (existing.rows[0]['status'] === 'locked') {
      sendError(res, 409, 'LOCKED', 'Budget is locked and cannot be modified')
      return
    }
    const r = await query(
      `UPDATE gl_budgets SET name=$1, fiscal_year=$2, currency_code=$3, notes=$4, updated_at=NOW() WHERE id=$5 RETURNING *`,
      [d.name, d.fiscal_year, d.currency_code, d.notes ?? null, req.params['id']],
    )
    sendOk(res, r.rows[0])
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update budget', err)
  }
})

// ─── Change status (activate / lock) ─────────────────────────────────────────

budgetRouter.patch(
  '/:id/status',
  requirePermission('finance.budget.edit', 'edit'),
  async (req, res) => {
    const schema = z.object({ status: z.enum(['draft', 'active', 'locked']) })
    try {
      const { status } = schema.parse(req.body)
      const r = await query(
        `UPDATE gl_budgets SET status=$1, updated_at=NOW() WHERE id=$2 AND company_id=$3 RETURNING *`,
        [status, req.params['id'], req.auth!.companyId],
      )
      if (!r.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Budget not found')
        return
      }
      sendOk(res, r.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update budget status', err)
    }
  },
)

// ─── Delete budget ────────────────────────────────────────────────────────────

budgetRouter.delete('/:id', requirePermission('finance.budget.edit', 'edit'), async (req, res) => {
  try {
    const existing = await query(`SELECT status FROM gl_budgets WHERE id=$1 AND company_id=$2`, [
      req.params['id'],
      req.auth!.companyId,
    ])
    if (!existing.rows[0]) {
      sendError(res, 404, 'NOT_FOUND', 'Budget not found')
      return
    }
    if (existing.rows[0]['status'] === 'locked') {
      sendError(res, 409, 'LOCKED', 'Cannot delete a locked budget')
      return
    }
    await query(`DELETE FROM gl_budgets WHERE id=$1`, [req.params['id']])
    sendOk(res, { deleted: true })
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to delete budget', err)
  }
})

// ─── Upsert budget lines (bulk) ───────────────────────────────────────────────

budgetRouter.post(
  '/:id/lines',
  requirePermission('finance.budget.edit', 'edit'),
  async (req, res) => {
    const schema = z.object({
      lines: z
        .array(
          z.object({
            account_id: z.string().uuid(),
            period: z.string().regex(/^\d{4}-\d{2}$/),
            amount: z.coerce.number(),
            notes: z.string().optional(),
          }),
        )
        .min(1),
    })
    try {
      const budget = await query(`SELECT status FROM gl_budgets WHERE id=$1 AND company_id=$2`, [
        req.params['id'],
        req.auth!.companyId,
      ])
      if (!budget.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Budget not found')
        return
      }
      if (budget.rows[0]['status'] === 'locked') {
        sendError(res, 409, 'LOCKED', 'Budget is locked')
        return
      }

      const { lines } = schema.parse(req.body)
      const result = await withTransaction(
        { companyId: req.auth!.companyId, userId: req.auth!.userId, role: req.auth!.role },
        async (client) => {
          const saved = []
          for (const line of lines) {
            const r = await client.query(
              `INSERT INTO gl_budget_lines (budget_id, company_id, account_id, period, amount, notes)
             VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (budget_id, account_id, period)
             DO UPDATE SET amount=EXCLUDED.amount, notes=EXCLUDED.notes
             RETURNING *`,
              [
                req.params['id'],
                req.auth!.companyId,
                line.account_id,
                line.period,
                line.amount,
                line.notes ?? null,
              ],
            )
            saved.push(r.rows[0])
          }
          return saved
        },
      )
      sendOk(res, result)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to save budget lines', err)
    }
  },
)

// ─── Delete a single budget line ──────────────────────────────────────────────

budgetRouter.delete(
  '/:budgetId/lines/:lineId',
  requirePermission('finance.budget.edit', 'edit'),
  async (req, res) => {
    try {
      const r = await query(
        `DELETE FROM gl_budget_lines WHERE id=$1 AND budget_id=$2 RETURNING id`,
        [req.params['lineId'], req.params['budgetId']],
      )
      if (!r.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Line not found')
        return
      }
      sendOk(res, { deleted: true })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to delete line', err)
    }
  },
)

// ─── Budget vs Actual report ──────────────────────────────────────────────────

budgetRouter.get(
  '/:id/vs-actual',
  requirePermission('finance.budget.view', 'view'),
  async (req, res) => {
    const schema = z.object({
      period_from: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .optional(),
      period_to: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .optional(),
    })
    try {
      const b = await query(`SELECT * FROM gl_budgets WHERE id=$1 AND company_id=$2`, [
        req.params['id'],
        req.auth!.companyId,
      ])
      if (!b.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Budget not found')
        return
      }
      const budget = b.rows[0]
      const { period_from, period_to } = schema.parse(req.query)

      const yearStr = String(budget['fiscal_year'])
      const pFrom = period_from ?? `${yearStr}-01`
      const pTo = period_to ?? `${yearStr}-12`

      const r = await query(
        `SELECT
         a.id          AS account_id,
         a.code        AS account_code,
         a.name        AS account_name,
         a.account_type,
         COALESCE(SUM(bl.amount), 0) AS budget_amount,
         COALESCE(SUM(
           CASE WHEN jl.currency_code = $5
                THEN jl.debit - jl.credit
                ELSE (jl.debit - jl.credit) * COALESCE(fr.rate, 1) END
         ), 0) AS actual_amount
       FROM gl_budget_lines bl
       JOIN chart_of_accounts a ON a.id = bl.account_id
       LEFT JOIN journal_lines jl
              ON jl.account_id = bl.account_id
             AND jl.company_id = $1
             AND TO_CHAR(jl.created_at, 'YYYY-MM') BETWEEN $3 AND $4
       LEFT JOIN fx_rates fr
              ON fr.from_currency = jl.currency_code
             AND fr.to_currency   = $5
             AND fr.rate_date = (
               SELECT MAX(rate_date) FROM fx_rates
               WHERE from_currency = jl.currency_code
                 AND to_currency   = $5
                 AND rate_date    <= DATE_TRUNC('month', jl.created_at) + INTERVAL '1 month - 1 day'
             )
       WHERE bl.budget_id = $2
         AND bl.period BETWEEN $3 AND $4
         AND bl.company_id = $1
       GROUP BY a.id, a.code, a.name, a.account_type
       ORDER BY a.code`,
        [req.auth!.companyId, req.params['id'], pFrom, pTo, budget['currency_code']],
      )

      const rows = r.rows.map((row) => ({
        ...row,
        budget_amount: Number(row['budget_amount']),
        actual_amount: Number(row['actual_amount']),
        variance: Number(row['budget_amount']) - Number(row['actual_amount']),
        variance_pct:
          Number(row['budget_amount']) !== 0
            ? Math.round(
                ((Number(row['budget_amount']) - Number(row['actual_amount'])) /
                  Math.abs(Number(row['budget_amount']))) *
                  10000,
              ) / 100
            : null,
      }))

      sendOk(res, {
        budget: {
          id: budget['id'],
          name: budget['name'],
          fiscal_year: budget['fiscal_year'],
          currency_code: budget['currency_code'],
          status: budget['status'],
        },
        period_from: pFrom,
        period_to: pTo,
        rows,
        totals: {
          budget: rows.reduce((s, r) => s + r.budget_amount, 0),
          actual: rows.reduce((s, r) => s + r.actual_amount, 0),
          variance: rows.reduce((s, r) => s + r.variance, 0),
        },
      })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to compute budget vs actual', err)
    }
  },
)
