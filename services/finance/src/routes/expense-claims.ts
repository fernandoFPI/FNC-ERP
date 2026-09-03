import { Router } from 'express'
import { z } from 'zod'
import { query, withTransaction, type PoolClient } from '@fnc-erp/db'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'
import { logAudit } from '@fnc-erp/audit'

export const expenseClaimsRouter: import('express').Router = Router()

// Thrown for expected, user-actionable setup gaps (missing Settings config,
// a category with no GL account) — caught specifically to return a clear
// 422 instead of a generic 500. Mirrors employee-advances.ts's AdvanceConfigError.
export class ExpenseConfigError extends Error {}

// ─── Account auto-resolution ────────────────────────────────────────────────
//
// Reimbursement account is picked by currency, reusing the same
// company_default_cash_accounts table employee advances resolve their cash
// account from (see migration 197) — conceptually the same question ("which
// cash/bank account does this currency pay out of"), so no separate config
// surface is needed. No longer client-suppliable input on create/update.

async function resolveReimbursementAccount(
  client: PoolClient,
  companyId: string,
  currencyCode: string,
): Promise<string> {
  const res = await client.query(
    `SELECT account_id FROM company_default_cash_accounts WHERE company_id=$1 AND currency_code=$2`,
    [companyId, currencyCode],
  )
  const accountId = res.rows[0]?.account_id as string | undefined
  if (!accountId) {
    throw new ExpenseConfigError(
      `No default cash account configured for ${currencyCode} — set one in Settings → Finance Config → Advance Automation first`,
    )
  }
  return accountId
}

// A line's GL account is either given explicitly or defaulted from its
// expense category (expense_categories.gl_account_id) — resolved and stored
// at creation/update time so every line always carries an account by the
// time a claim reaches approval, closing a prior gap where a line posted
// with no gl_account_id was silently skipped from the approval journal's
// debit side while still counted in the credit total, leaving it unbalanced.
async function resolveLineGlAccount(
  client: PoolClient,
  companyId: string,
  categoryId: string | undefined,
  glAccountId: string | undefined,
): Promise<{ accountId: string; categoryName?: string }> {
  if (!categoryId) {
    if (!glAccountId) {
      throw new ExpenseConfigError('Each expense line needs either a category or a GL account')
    }
    return { accountId: glAccountId }
  }
  const res = await client.query(
    `SELECT gl_account_id, name FROM expense_categories WHERE id=$1 AND company_id=$2`,
    [categoryId, companyId],
  )
  const cat = res.rows[0] as { gl_account_id: string | null; name: string } | undefined
  if (!cat) throw new ExpenseConfigError('Selected expense category not found')
  const accountId = glAccountId ?? cat.gl_account_id
  if (!accountId) {
    throw new ExpenseConfigError(
      `Category "${cat.name}" has no GL account configured — set one in Finance → Expense Categories, or choose an account manually`,
    )
  }
  return { accountId, categoryName: cat.name }
}

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

// Self-service category picker: name only, no GL account codes — an
// employee submitting their own claim shouldn't see chart-of-accounts
// detail. No permission gate beyond requireAuth (mounted ahead of this
// router in app.ts), matching /request-self below.
expenseClaimsRouter.get('/categories/mine', async (req, res) => {
  try {
    const r = await query(
      `SELECT id, name FROM expense_categories WHERE company_id=$1 AND is_active=true ORDER BY name`,
      [req.auth!.companyId],
    )
    sendOk(res, r.rows)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load categories', err)
  }
})

expenseClaimsRouter.post(
  '/categories',
  requirePermission('finance.expenses.edit', 'edit'),
  async (req, res) => {
    const schema = z.object({
      name: z.string().min(1),
      gl_account_id: z.string().uuid().optional(),
      is_project_related: z.boolean().default(false),
    })
    try {
      const d = schema.parse(req.body)
      const r = await query(
        `INSERT INTO expense_categories (company_id, name, gl_account_id, is_project_related) VALUES ($1,$2,$3,$4) RETURNING *`,
        [req.auth!.companyId, d.name, d.gl_account_id ?? null, d.is_project_related],
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
      is_project_related: z.boolean().default(false),
    })
    try {
      const d = schema.parse(req.body)
      const r = await query(
        `UPDATE expense_categories SET name=$1, gl_account_id=$2, is_active=$3, is_project_related=$4 WHERE id=$5 AND company_id=$6 RETURNING *`,
        [d.name, d.gl_account_id ?? null, d.is_active, d.is_project_related, req.params['id'], req.auth!.companyId],
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
         COUNT(*) FILTER (WHERE status='posted')                AS posted_count,
         COALESCE(SUM(total_amount) FILTER (WHERE status='submitted'),0) AS pending_amount,
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

// ─── Self-service: my claims (with lines) ──────────────────────────────────────
//
// No permission gate — resolves the caller's own employee record via
// employees.user_id, same identity pattern as /request-self below. Deliberately
// its own route rather than a client-suppliable employee_id filter on the
// permission-gated list endpoint, so there's no way to request someone else's
// claims by passing a different id.

expenseClaimsRouter.get('/mine', async (req, res) => {
  try {
    const empRes = await query(
      `SELECT id FROM employees WHERE user_id=$1 AND company_id=$2`,
      [req.auth!.userId, req.auth!.companyId],
    )
    const emp = empRes.rows[0] as { id: string } | undefined
    if (!emp) {
      sendOk(res, [])
      return
    }
    const r = await query(
      `SELECT ec.*, COALESCE(
          json_agg(
            json_build_object(
              'id', ecl.id, 'expense_date', ecl.expense_date, 'category_name', ecl.category_name,
              'description', ecl.description, 'amount', ecl.amount, 'currency_code', ecl.currency_code
            ) ORDER BY ecl.expense_date
          ) FILTER (WHERE ecl.id IS NOT NULL), '[]'
        ) AS lines
       FROM expense_claims ec
       LEFT JOIN expense_claim_lines ecl ON ecl.claim_id = ec.id
       WHERE ec.company_id=$1 AND ec.employee_id=$2
       GROUP BY ec.id
       ORDER BY ec.created_at DESC`,
      [req.auth!.companyId, emp.id],
    )
    sendOk(res, r.rows)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load your claims', err)
  }
})

// ─── Company-wide outstanding dashboard ─────────────────────────────────────
//
// "Outstanding" = posted (journal booked, reimbursement owed) but not yet
// paid. Mirrors employee-advances.ts's /dashboard shape.

expenseClaimsRouter.get(
  '/dashboard',
  requirePermission('finance.expenses.view', 'view'),
  async (req, res) => {
    try {
      const [claims, byEmployee] = await Promise.all([
        query(
          `SELECT id, claim_number, employee_id, employee_name, total_amount, currency_code, status, approved_at
           FROM expense_claims
           WHERE company_id=$1 AND status='posted'
           ORDER BY approved_at DESC`,
          [req.auth!.companyId],
        ),
        query(
          `SELECT employee_id, employee_name,
                  COUNT(*)::INT AS claim_count,
                  COALESCE(SUM(total_amount),0) AS total_outstanding
           FROM expense_claims
           WHERE company_id=$1 AND status='posted'
           GROUP BY employee_id, employee_name
           ORDER BY total_outstanding DESC`,
          [req.auth!.companyId],
        ),
      ])
      sendOk(res, { claims: claims.rows, by_employee: byEmployee.rows })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load dashboard', err)
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
          const reimbursementAccountId = await resolveReimbursementAccount(
            client,
            req.auth!.companyId,
            d.currency_code,
          )
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
              reimbursementAccountId,
              d.notes ?? null,
              req.auth!.userId,
            ],
          )
          const claim = ecRes.rows[0]!
          const lines = []
          for (const line of d.lines) {
            const { accountId, categoryName } = await resolveLineGlAccount(
              client,
              req.auth!.companyId,
              line.category_id,
              line.gl_account_id,
            )
            const lr = await client.query(
              `INSERT INTO expense_claim_lines
              (claim_id, company_id, expense_date, category_id, category_name, gl_account_id, description, amount, currency_code, receipt_url, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
              [
                claim.id,
                req.auth!.companyId,
                line.expense_date,
                line.category_id ?? null,
                line.category_name ?? categoryName ?? null,
                accountId,
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
      if (err instanceof ExpenseConfigError) {
        sendError(res, 422, 'EXPENSE_CONFIG_MISSING', err.message)
        return
      }
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create claim', err)
    }
  },
)

// ─── Employee self-service request ──────────────────────────────────────────
//
// Mirrors employee-advances.ts's /request-self: resolves the caller's own
// employee record from the auth token via employees.user_id, no
// finance.expenses.* permission required — the requireAuth() middleware
// mounted ahead of this router in app.ts is the only gate. Lands directly
// as 'submitted' (skips draft), matching request-self advances landing
// directly in pending_approval.

const selfLineSchema = z.object({
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category_id: z.string().uuid(),
  description: z.string().optional(),
  amount: z.coerce.number().positive(),
})

const selfClaimSchema = z.object({
  description: z.string().optional(),
  currency_code: z.string().length(3).default('IQD'),
  notes: z.string().optional(),
  lines: z.array(selfLineSchema).min(1),
})

expenseClaimsRouter.post('/request-self', async (req, res) => {
  try {
    const d = selfClaimSchema.parse(req.body)
    const claimNumber = await nextClaimNumber(req.auth!.companyId)
    const result = await withTransaction(
      { companyId: req.auth!.companyId, userId: req.auth!.userId, role: req.auth!.role },
      async (client) => {
        const empRes = await client.query(
          `SELECT id, first_name, last_name FROM employees WHERE user_id=$1 AND company_id=$2`,
          [req.auth!.userId, req.auth!.companyId],
        )
        const emp = empRes.rows[0] as Record<string, unknown> | undefined
        if (!emp) return { error: 'NO_EMPLOYEE_LINK' as const }

        const reimbursementAccountId = await resolveReimbursementAccount(
          client,
          req.auth!.companyId,
          d.currency_code,
        )
        const totalAmount = d.lines.reduce((s, l) => s + l.amount, 0)
        const employeeName = `${emp['first_name'] as string} ${emp['last_name'] as string}`
        const ecRes = await client.query(
          `INSERT INTO expense_claims
             (company_id, claim_number, employee_id, employee_name, description, currency_code,
              total_amount, reimbursement_account_id, notes, status, submitted_at, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'submitted',NOW(),$10) RETURNING *`,
          [
            req.auth!.companyId,
            claimNumber,
            emp['id'],
            employeeName,
            d.description ?? null,
            d.currency_code,
            totalAmount,
            reimbursementAccountId,
            d.notes ?? null,
            req.auth!.userId,
          ],
        )
        const claim = ecRes.rows[0]!
        const lines = []
        for (const line of d.lines) {
          const { accountId, categoryName } = await resolveLineGlAccount(
            client,
            req.auth!.companyId,
            line.category_id,
            undefined,
          )
          const lr = await client.query(
            `INSERT INTO expense_claim_lines
               (claim_id, company_id, expense_date, category_id, category_name, gl_account_id, description, amount, currency_code)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [
              claim.id,
              req.auth!.companyId,
              line.expense_date,
              line.category_id,
              categoryName ?? null,
              accountId,
              line.description ?? null,
              line.amount,
              d.currency_code,
            ],
          )
          lines.push(lr.rows[0])
        }
        return { claim: { ...claim, lines } }
      },
    )
    if ('error' in result) {
      sendError(res, 403, 'NO_EMPLOYEE_LINK', 'No employee record linked to your account')
      return
    }
    const claim = result.claim as Record<string, unknown>
    await logAudit({
      companyId: req.auth!.companyId,
      userId: req.auth!.userId,
      action: 'INSERT',
      tableName: 'expense_claims',
      recordId: claim['id'] as string,
      newValues: {
        claim_number: claim['claim_number'],
        total_amount: claim['total_amount'],
        self_service: true,
      },
    })
    sendOk(res, claim, 201)
  } catch (err) {
    if (err instanceof ExpenseConfigError) {
      sendError(res, 422, 'EXPENSE_CONFIG_MISSING', err.message)
      return
    }
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to submit expense claim', err)
  }
})

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
          const reimbursementAccountId = await resolveReimbursementAccount(
            client,
            req.auth!.companyId,
            d.currency_code,
          )
          const ecRes = await client.query(
            `UPDATE expense_claims SET employee_name=$1, description=$2, currency_code=$3, total_amount=$4, reimbursement_account_id=$5, notes=$6, updated_at=NOW()
           WHERE id=$7 RETURNING *`,
            [
              d.employee_name,
              d.description ?? null,
              d.currency_code,
              totalAmount,
              reimbursementAccountId,
              d.notes ?? null,
              req.params['id'],
            ],
          )
          await client.query(`DELETE FROM expense_claim_lines WHERE claim_id=$1`, [
            req.params['id'],
          ])
          const lines = []
          for (const line of d.lines) {
            const { accountId, categoryName } = await resolveLineGlAccount(
              client,
              req.auth!.companyId,
              line.category_id,
              line.gl_account_id,
            )
            const lr = await client.query(
              `INSERT INTO expense_claim_lines
              (claim_id, company_id, expense_date, category_id, category_name, gl_account_id, description, amount, currency_code, receipt_url, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
              [
                req.params['id'],
                req.auth!.companyId,
                line.expense_date,
                line.category_id ?? null,
                line.category_name ?? categoryName ?? null,
                accountId,
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
      if (err instanceof ExpenseConfigError) {
        sendError(res, 422, 'EXPENSE_CONFIG_MISSING', err.message)
        return
      }
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

// ─── Approve claim (posts journal immediately) ──────────────────────────────
//
// Single-step, matching how employee-advances.ts's approve immediately
// disburses and posts: approving a submitted claim posts the reimbursement
// journal right away instead of resting in a separate 'approved' state
// awaiting a manual "post" click. Every line's gl_account_id is guaranteed
// resolved by creation/update time (resolveLineGlAccount), and the
// reimbursement account is resolved the same way — so nothing here can be
// missing config at approval time; that's caught earlier, when the claim
// is created or edited.
//
// Deliberately NOT collapsed further into mark-paid: unlike an advance
// (where approval literally IS the cash movement), an expense claim's
// approval recognizes the expense/liability, while actual disbursement is a
// separate accounting event — mark-paid stays its own step.

expenseClaimsRouter.post(
  '/:id/approve',
  requirePermission('finance.expenses.approve', 'approve'),
  async (req, res) => {
    try {
      const result = await withTransaction(
        { companyId: req.auth!.companyId, userId: req.auth!.userId, role: req.auth!.role },
        async (client) => {
          // Split into a plain row lock + a separate lines fetch — Postgres
          // rejects FOR UPDATE combined with GROUP BY/aggregates (json_agg
          // here), so the single-query aggregate+lock shape used elsewhere
          // in this file (e.g. GET /:id) doesn't work once locking is added.
          // Lines can't change once a claim leaves 'draft' (PUT /:id only
          // allows edits in draft), so locking just the header is enough.
          const claimRes = await client.query(
            `SELECT * FROM expense_claims WHERE id=$1 AND company_id=$2 AND status='submitted' FOR UPDATE`,
            [req.params['id'], req.auth!.companyId],
          )
          if (!claimRes.rows[0]) return null
          const claim = claimRes.rows[0] as Record<string, unknown>
          const linesRes = await client.query(
            `SELECT * FROM expense_claim_lines WHERE claim_id=$1 ORDER BY expense_date`,
            [req.params['id']],
          )
          const lines = linesRes.rows as {
            gl_account_id: string
            amount: number
            description: string | null
          }[]

          const jeRes = await client.query(
            `INSERT INTO journal_entries (company_id, entry_date, reference, description, status, source_type, source_id, created_by, posted_at, posted_by)
             VALUES ($1, CURRENT_DATE, $2, $3, 'posted', 'expense_claim', $4, $5, NOW(), $5)
             RETURNING id`,
            [
              req.auth!.companyId,
              claim['claim_number'],
              `Expense claim: ${claim['employee_name'] as string}`,
              claim['id'],
              req.auth!.userId,
            ],
          )
          const jeId = jeRes.rows[0]!.id as string

          // DR each expense account, CR Accrued Reimbursement
          for (const line of lines) {
            await client.query(
              `INSERT INTO journal_lines (journal_entry_id, account_id, currency_code, debit, credit, description, amount_company_currency)
             VALUES ($1,$2,$3,$4,0,$5,$4)`,
              [
                jeId,
                line.gl_account_id,
                claim['currency_code'],
                line.amount,
                line.description ?? (claim['claim_number'] as string),
              ],
            )
          }
          await client.query(
            `INSERT INTO journal_lines (journal_entry_id, account_id, currency_code, debit, credit, description, amount_company_currency)
           VALUES ($1,$2,$3,0,$4,$5,$4)`,
            [
              jeId,
              claim['reimbursement_account_id'],
              claim['currency_code'],
              claim['total_amount'],
              `Reimbursable: ${claim['employee_name'] as string}`,
            ],
          )

          const updated = await client.query(
            `UPDATE expense_claims SET status='posted', approved_by=$1, approved_at=NOW(), journal_entry_id=$2, updated_at=NOW()
             WHERE id=$3 RETURNING *`,
            [req.auth!.userId, jeId, req.params['id']],
          )
          return updated.rows[0]
        },
      )
      if (!result) {
        sendError(res, 409, 'INVALID_STATUS', 'Claim is not in submitted status')
        return
      }
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
