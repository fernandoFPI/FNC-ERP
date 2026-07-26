import { Router } from 'express'
import { z } from 'zod'
import { query, withTransaction } from '@fnc-erp/db'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'
import { logAudit } from '@fnc-erp/audit'

export const expenseClaimsRouter: import('express').Router = Router()

// ─── Next claim number ────────────────────────────────────────────────────────

async function nextClaimNumber(companyId: string): Promise<string> {
  const yr = new Date().getFullYear()
  const res = await query(
    `SELECT COUNT(*)+1 AS n FROM expense_claims
     WHERE company_id=$1 AND claim_number LIKE $2`,
    [companyId, `EXP-${yr}-%`],
  )
  const n = String(Number(res.rows[0]!['n'])).padStart(4, '0')
  return `EXP-${yr}-${n}`
}

// ─── Expense categories CRUD ──────────────────────────────────────────────────

expenseClaimsRouter.get(
  '/categories',
  requirePermission('finance.expenses.view', 'view'),
  async (req, res) => {
    try {
      const r = await query(
        `SELECT ec.*, a.code AS account_code, a.name AS account_name
       FROM expense_categories ec
       LEFT JOIN chart_of_accounts a ON a.id = ec.gl_account_id
       WHERE ec.company_id=$1 AND ec.is_active=true ORDER BY ec.name`,
        [req.auth!.companyId],
      )
      sendOk(res, r.rows)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load categories', err)
    }
  },
)

expenseClaimsRouter.post(
  '/categories',
  requirePermission('finance.expenses.edit', 'edit'),
  async (req, res) => {
    const schema = z.object({
      name: z.string().min(1),
      gl_account_id: z.string().uuid().optional(),
    })
    try {
      const d = schema.parse(req.body)
      const r = await query(
        `INSERT INTO expense_categories (company_id, name, gl_account_id) VALUES ($1,$2,$3) RETURNING *`,
        [req.auth!.companyId, d.name, d.gl_account_id ?? null],
      )
      sendOk(res, r.rows[0], 201)
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        sendError(res, 409, 'DUPLICATE', 'Category already exists')
        return
      }
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create category', err)
    }
  },
)

expenseClaimsRouter.put(
  '/categories/:id',
  requirePermission('finance.expenses.edit', 'edit'),
  async (req, res) => {
    const schema = z.object({
      name: z.string().min(1),
      gl_account_id: z.string().uuid().optional(),
      is_active: z.boolean().default(true),
    })
    try {
      const d = schema.parse(req.body)
      const r = await query(
        `UPDATE expense_categories SET name=$1, gl_account_id=$2, is_active=$3 WHERE id=$4 AND company_id=$5 RETURNING *`,
        [d.name, d.gl_account_id ?? null, d.is_active, req.params['id'], req.auth!.companyId],
      )
      if (!r.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Category not found')
        return
      }
      sendOk(res, r.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update category', err)
    }
  },
)

// ─── List claims ──────────────────────────────────────────────────────────────

expenseClaimsRouter.get(
  '/',
  requirePermission('finance.expenses.view', 'view'),
  async (req, res) => {
    const schema = z.object({
      status: z.string().optional(),
      employee_id: z.string().uuid().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(100),
      offset: z.coerce.number().int().min(0).default(0),
    })
    try {
      const { status, employee_id, limit, offset } = schema.parse(req.query)
      const conditions: string[] = ['ec.company_id = $1']
      const params: unknown[] = [req.auth!.companyId]
      let p = 2
      if (status) {
        conditions.push(`ec.status = $${p++}`)
        params.push(status)
      }
      if (employee_id) {
        conditions.push(`ec.employee_id = $${p++}`)
        params.push(employee_id)
      }

      const r = await query(
        `SELECT ec.*, COUNT(ecl.id)::INT AS line_count
       FROM expense_claims ec
       LEFT JOIN expense_claim_lines ecl ON ecl.claim_id = ec.id
       WHERE ${conditions.join(' AND ')}
       GROUP BY ec.id
       ORDER BY ec.created_at DESC
       LIMIT $${p} OFFSET $${p + 1}`,
        [...params, limit, offset],
      )
      sendOk(res, r.rows)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load claims', err)
    }
  },
)

// ─── Summary KPIs ─────────────────────────────────────────────────────────────

expenseClaimsRouter.get(
  '/summary',
  requirePermission('finance.expenses.view', 'view'),
  async (req, res) => {
    try {
      const r = await query(
        `SELECT
         COUNT(*) FILTER (WHERE status='draft')                AS draft_count,
         COUNT(*) FILTER (WHERE status='submitted')            AS pending_count,
         COUNT(*) FILTER (WHERE status='approved')             AS approved_count,
         COALESCE(SUM(total_amount) FILTER (WHERE status='submitted'),0) AS pending_amount,
         COALESCE(SUM(total_amount) FILTER (WHERE status='approved'),0)  AS approved_amount,
         COALESCE(SUM(total_amount) FILTER (WHERE status='posted'),0)    AS posted_amount,
         COALESCE(SUM(total_amount) FILTER (WHERE status='paid'),0)      AS paid_amount
       FROM expense_claims WHERE company_id=$1`,
        [req.auth!.companyId],
      )
      sendOk(res, r.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load summary', err)
    }
  },
)

// ─── Get claim with lines ─────────────────────────────────────────────────────

expenseClaimsRouter.get(
  '/:id',
  requirePermission('finance.expenses.view', 'view'),
  async (req, res) => {
    try {
      const ec = await query(`SELECT * FROM expense_claims WHERE id=$1 AND company_id=$2`, [
        req.params['id'],
        req.auth!.companyId,
      ])
      if (!ec.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Claim not found')
        return
      }
      const lines = await query(
        `SELECT ecl.*, a.code AS account_code, a.name AS account_name
       FROM expense_claim_lines ecl
       LEFT JOIN chart_of_accounts a ON a.id = ecl.gl_account_id
       WHERE ecl.claim_id=$1 ORDER BY ecl.expense_date, ecl.id`,
        [req.params['id']],
      )
      sendOk(res, { ...ec.rows[0], lines: lines.rows })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load claim', err)
    }
  },
)

// ─── Create claim ─────────────────────────────────────────────────────────────

const lineSchema = z.object({
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category_id: z.string().uuid().optional(),
  category_name: z.string().optional(),
  gl_account_id: z.string().uuid().optional(),
  description: z.string().optional(),
  amount: z.coerce.number().positive(),
  currency_code: z.string().length(3).default('IQD'),
  receipt_url: z.string().url().optional(),
  notes: z.string().optional(),
})

const claimSchema = z.object({
  employee_id: z.string().uuid(),
  employee_name: z.string().min(1),
  description: z.string().optional(),
  currency_code: z.string().length(3).default('IQD'),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(1),
  reimbursement_account_id: z.string().uuid().optional(),
})

expenseClaimsRouter.post(
  '/',
  requirePermission('finance.expenses.edit', 'edit'),
  async (req, res) => {
    try {
      const d = claimSchema.parse(req.body)
      const claimNumber = await nextClaimNumber(req.auth!.companyId)
      const totalAmount = d.lines.reduce((s, l) => s + l.amount, 0)

      const result = await withTransaction(
        { companyId: req.auth!.companyId, userId: req.auth!.userId, role: req.auth!.role },
        async (client) => {
          const ecRes = await client.query(
            `INSERT INTO expense_claims
            (company_id, claim_number, employee_id, employee_name, description, currency_code, total_amount, reimbursement_account_id, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
            [
              req.auth!.companyId,
              claimNumber,
              d.employee_id,
              d.employee_name,
              d.description ?? null,
              d.currency_code,
              totalAmount,
              d.reimbursement_account_id ?? null,
              d.notes ?? null,
              req.auth!.userId,
            ],
          )
          const claim = ecRes.rows[0]!
          const lines = []
          for (const line of d.lines) {
            const lr = await client.query(
              `INSERT INTO expense_claim_lines
              (claim_id, company_id, expense_date, category_id, category_name, gl_account_id, description, amount, currency_code, receipt_url, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
              [
                claim.id,
                req.auth!.companyId,
                line.expense_date,
                line.category_id ?? null,
                line.category_name ?? null,
                line.gl_account_id ?? null,
                line.description ?? null,
                line.amount,
                line.currency_code,
                line.receipt_url ?? null,
                line.notes ?? null,
              ],
            )
            lines.push(lr.rows[0])
          }
          return { ...claim, lines }
        },
      )
      await logAudit({
        companyId: req.auth!.companyId,
        userId: req.auth!.userId,
        action: 'INSERT',
        tableName: 'expense_claims',
        recordId: result.id as string,
        newValues: { claim_number: claimNumber, total_amount: totalAmount },
      })
      sendOk(res, result, 201)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create claim', err)
    }
  },
)

// ─── Update claim (only draft) ────────────────────────────────────────────────

expenseClaimsRouter.put(
  '/:id',
  requirePermission('finance.expenses.edit', 'edit'),
  async (req, res) => {
    try {
      const existing = await query(
        `SELECT status FROM expense_claims WHERE id=$1 AND company_id=$2`,
        [req.params['id'], req.auth!.companyId],
      )
      if (!existing.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Claim not found')
        return
      }
      if (existing.rows[0]['status'] !== 'draft') {
        sendError(res, 409, 'INVALID_STATUS', 'Only draft claims can be edited')
        return
      }

      const d = claimSchema.parse(req.body)
      const totalAmount = d.lines.reduce((s, l) => s + l.amount, 0)

      const result = await withTransaction(
        { companyId: req.auth!.companyId, userId: req.auth!.userId, role: req.auth!.role },
        async (client) => {
          const ecRes = await client.query(
            `UPDATE expense_claims SET employee_name=$1, description=$2, currency_code=$3, total_amount=$4, reimbursement_account_id=$5, notes=$6, updated_at=NOW()
           WHERE id=$7 RETURNING *`,
            [
              d.employee_name,
              d.description ?? null,
              d.currency_code,
              totalAmount,
              d.reimbursement_account_id ?? null,
              d.notes ?? null,
              req.params['id'],
            ],
          )
          await client.query(`DELETE FROM expense_claim_lines WHERE claim_id=$1`, [
            req.params['id'],
          ])
          const lines = []
          for (const line of d.lines) {
            const lr = await client.query(
              `INSERT INTO expense_claim_lines
              (claim_id, company_id, expense_date, category_id, category_name, gl_account_id, description, amount, currency_code, receipt_url, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
              [
                req.params['id'],
                req.auth!.companyId,
                line.expense_date,
                line.category_id ?? null,
                line.category_name ?? null,
                line.gl_account_id ?? null,
                line.description ?? null,
                line.amount,
                line.currency_code,
                line.receipt_url ?? null,
                line.notes ?? null,
              ],
            )
            lines.push(lr.rows[0])
          }
          return { ...ecRes.rows[0], lines }
        },
      )
      sendOk(res, result)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update claim', err)
    }
  },
)

// ─── Submit claim ─────────────────────────────────────────────────────────────

expenseClaimsRouter.post(
  '/:id/submit',
  requirePermission('finance.expenses.edit', 'edit'),
  async (req, res) => {
    try {
      const r = await query(
        `UPDATE expense_claims SET status='submitted', submitted_at=NOW(), updated_at=NOW()
       WHERE id=$1 AND company_id=$2 AND status='draft' RETURNING *`,
        [req.params['id'], req.auth!.companyId],
      )
      if (!r.rows[0]) {
        sendError(res, 409, 'INVALID_STATUS', 'Claim is not in draft status')
        return
      }
      sendOk(res, r.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to submit claim', err)
    }
  },
)

// ─── Approve claim ────────────────────────────────────────────────────────────

expenseClaimsRouter.post(
  '/:id/approve',
  requirePermission('finance.expenses.approve', 'approve'),
  async (req, res) => {
    try {
      const r = await query(
        `UPDATE expense_claims SET status='approved', approved_by=$1, approved_at=NOW(), updated_at=NOW()
       WHERE id=$2 AND company_id=$3 AND status='submitted' RETURNING *`,
        [req.auth!.userId, req.params['id'], req.auth!.companyId],
      )
      if (!r.rows[0]) {
        sendError(res, 409, 'INVALID_STATUS', 'Claim is not in submitted status')
        return
      }
      await logAudit({
        companyId: req.auth!.companyId,
        userId: req.auth!.userId,
        action: 'UPDATE',
        tableName: 'expense_claims',
        recordId: req.params['id'],
        newValues: { status: 'approved' },
      })
      sendOk(res, r.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to approve claim', err)
    }
  },
)

// ─── Reject claim ─────────────────────────────────────────────────────────────

expenseClaimsRouter.post(
  '/:id/reject',
  requirePermission('finance.expenses.approve', 'approve'),
  async (req, res) => {
    const schema = z.object({ reason: z.string().min(1) })
    try {
      const { reason } = schema.parse(req.body)
      const r = await query(
        `UPDATE expense_claims SET status='rejected', rejected_by=$1, rejected_at=NOW(), rejection_reason=$2, updated_at=NOW()
       WHERE id=$3 AND company_id=$4 AND status='submitted' RETURNING *`,
        [req.auth!.userId, reason, req.params['id'], req.auth!.companyId],
      )
      if (!r.rows[0]) {
        sendError(res, 409, 'INVALID_STATUS', 'Claim is not in submitted status')
        return
      }
      sendOk(res, r.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to reject claim', err)
    }
  },
)

// ─── Post claim (create JE) ───────────────────────────────────────────────────

expenseClaimsRouter.post(
  '/:id/post',
  requirePermission('finance.expenses.edit', 'edit'),
  async (req, res) => {
    const schema = z.object({ reimbursement_account_id: z.string().uuid().optional() })
    try {
      const { reimbursement_account_id } = schema.parse(req.body)
      const claimRes = await query(
        `SELECT ec.*, json_agg(row_to_json(ecl) ORDER BY ecl.expense_date) AS lines
       FROM expense_claims ec
       JOIN expense_claim_lines ecl ON ecl.claim_id = ec.id
       WHERE ec.id=$1 AND ec.company_id=$2 AND ec.status='approved'
       GROUP BY ec.id`,
        [req.params['id'], req.auth!.companyId],
      )
      if (!claimRes.rows[0]) {
        sendError(res, 409, 'INVALID_STATUS', 'Claim must be approved before posting')
        return
      }
      const claim = claimRes.rows[0]
      const lines = claim['lines'] as {
        gl_account_id: string | null
        amount: number
        description: string | null
        expense_date: string
      }[]
      const reimbAccId =
        reimbursement_account_id ?? (claim['reimbursement_account_id'] as string | null)
      if (!reimbAccId) {
        sendError(res, 422, 'MISSING_ACCOUNT', 'Reimbursement account is required to post')
        return
      }

      const result = await withTransaction(
        { companyId: req.auth!.companyId, userId: req.auth!.userId, role: req.auth!.role },
        async (client) => {
          const jeRes = await client.query(
            `INSERT INTO journal_entries (company_id, entry_date, reference, description, currency_code, status, created_by)
           VALUES ($1,NOW(),$2,$3,$4,'posted',$5) RETURNING id`,
            [
              req.auth!.companyId,
              claim['claim_number'],
              `Expense claim: ${claim['employee_name']}`,
              claim['currency_code'],
              req.auth!.userId,
            ],
          )
          const jeId = jeRes.rows[0]!.id as string

          // DR each expense account, CR Accrued Reimbursement
          for (const line of lines) {
            if (!line.gl_account_id) continue
            await client.query(
              `INSERT INTO journal_lines (journal_entry_id, company_id, account_id, currency_code, debit, credit, description)
             VALUES ($1,$2,$3,$4,$5,0,$6)`,
              [
                jeId,
                req.auth!.companyId,
                line.gl_account_id,
                claim['currency_code'],
                line.amount,
                line.description ?? claim['claim_number'],
              ],
            )
          }
          // CR Accrued Reimbursement (total)
          await client.query(
            `INSERT INTO journal_lines (journal_entry_id, company_id, account_id, currency_code, debit, credit, description)
           VALUES ($1,$2,$3,$4,0,$5,$6)`,
            [
              jeId,
              req.auth!.companyId,
              reimbAccId,
              claim['currency_code'],
              claim['total_amount'],
              `Reimbursable: ${claim['employee_name']}`,
            ],
          )

          await client.query(
            `UPDATE expense_claims SET status='posted', journal_entry_id=$1, reimbursement_account_id=$2, updated_at=NOW() WHERE id=$3`,
            [jeId, reimbAccId, req.params['id']],
          )
          return { journal_entry_id: jeId }
        },
      )
      await logAudit({
        companyId: req.auth!.companyId,
        userId: req.auth!.userId,
        action: 'UPDATE',
        tableName: 'expense_claims',
        recordId: req.params['id'],
        newValues: { status: 'posted' },
      })
      sendOk(res, result)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to post claim', err)
    }
  },
)

// ─── Mark as paid ─────────────────────────────────────────────────────────────

expenseClaimsRouter.post(
  '/:id/mark-paid',
  requirePermission('finance.expenses.edit', 'edit'),
  async (req, res) => {
    try {
      const r = await query(
        `UPDATE expense_claims SET status='paid', updated_at=NOW() WHERE id=$1 AND company_id=$2 AND status='posted' RETURNING *`,
        [req.params['id'], req.auth!.companyId],
      )
      if (!r.rows[0]) {
        sendError(res, 409, 'INVALID_STATUS', 'Claim must be posted first')
        return
      }
      sendOk(res, r.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to mark as paid', err)
    }
  },
)
