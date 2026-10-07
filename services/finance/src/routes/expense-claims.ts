import { Router } from 'express'
import { getAuth } from '@fnc-erp/auth'
import { z } from 'zod'
import { query, withTransaction, nextDocumentNumber, type PoolClient, firstRowOrThrow, asyncHandler } from '@fnc-erp/db'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'
import { logAudit } from '@fnc-erp/audit'

export const expenseClaimsRouter: Router = Router()

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
  const n = String(Number(firstRowOrThrow(res)['n'])).padStart(4, '0')
  return `EXP-${yr}-${n}`
}

// ─── Expense categories CRUD ──────────────────────────────────────────────────

expenseClaimsRouter.get(
  '/categories',
  requirePermission('finance.expenses.view', 'view'),
  asyncHandler(async (req, res) => {
    try {
      const r = await query(
        `SELECT ec.*, a.code AS account_code, a.name AS account_name
       FROM expense_categories ec
       LEFT JOIN chart_of_accounts a ON a.id = ec.gl_account_id
       WHERE ec.company_id=$1 AND ec.is_active=true ORDER BY ec.name`,
        [getAuth(req).companyId],
      )
      sendOk(res, r.rows)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load categories', err)
    }
  }),
)

// Self-service category picker: name only, no GL account codes — an
// employee submitting their own claim shouldn't see chart-of-accounts
// detail. No permission gate beyond requireAuth (mounted ahead of this
// router in app.ts), matching /request-self below.
expenseClaimsRouter.get('/categories/mine', asyncHandler(async (req, res) => {
  try {
    const r = await query(
      `SELECT id, name FROM expense_categories WHERE company_id=$1 AND is_active=true ORDER BY name`,
      [getAuth(req).companyId],
    )
    sendOk(res, r.rows)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load categories', err)
  }
}))

expenseClaimsRouter.post(
  '/categories',
  requirePermission('finance.expenses.edit', 'edit'),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      name: z.string().min(1),
      gl_account_id: z.string().uuid().optional(),
      is_project_related: z.boolean().default(false),
    })
    try {
      const d = schema.parse(req.body)
      const r = await query(
        `INSERT INTO expense_categories (company_id, name, gl_account_id, is_project_related) VALUES ($1,$2,$3,$4) RETURNING *`,
        [getAuth(req).companyId, d.name, d.gl_account_id ?? null, d.is_project_related],
      )
      sendOk(res, r.rows[0], 201)
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        sendError(res, 409, 'DUPLICATE', 'Category already exists')
        return
      }
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create category', err)
    }
  }),
)

expenseClaimsRouter.put(
  '/categories/:id',
  requirePermission('finance.expenses.edit', 'edit'),
  asyncHandler(async (req, res) => {
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
        [d.name, d.gl_account_id ?? null, d.is_active, d.is_project_related, req.params['id'], getAuth(req).companyId],
      )
      if (!r.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Category not found')
        return
      }
      sendOk(res, r.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update category', err)
    }
  }),
)

// ─── List claims ──────────────────────────────────────────────────────────────

expenseClaimsRouter.get(
  '/',
  requirePermission('finance.expenses.view', 'view'),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      status: z.string().optional(),
      employee_id: z.string().uuid().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(100),
      offset: z.coerce.number().int().min(0).default(0),
    })
    try {
      const { status, employee_id, limit, offset } = schema.parse(req.query)
      const conditions: string[] = ['ec.company_id = $1']
      const params: unknown[] = [getAuth(req).companyId]
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
  }),
)

// ─── Summary KPIs ─────────────────────────────────────────────────────────────

expenseClaimsRouter.get(
  '/summary',
  requirePermission('finance.expenses.view', 'view'),
  asyncHandler(async (req, res) => {
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
        [getAuth(req).companyId],
      )
      sendOk(res, r.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load summary', err)
    }
  }),
)

// ─── Self-service: my claims (with lines) ──────────────────────────────────────
//
// No permission gate — resolves the caller's own employee record via
// employees.user_id, same identity pattern as /request-self below. Deliberately
// its own route rather than a client-suppliable employee_id filter on the
// permission-gated list endpoint, so there's no way to request someone else's
// claims by passing a different id.

expenseClaimsRouter.get('/mine', asyncHandler(async (req, res) => {
  try {
    const empRes = await query(
      `SELECT id FROM employees WHERE user_id=$1 AND company_id=$2`,
      [getAuth(req).userId, getAuth(req).companyId],
    )
    const emp = empRes.rows[0] as { id: string } | undefined
    if (!emp) {
      sendOk(res, [])
      return
    }
    const r = await query(
      `SELECT ec.*, p.code AS project_code, p.name AS project_name, COALESCE(
          json_agg(
            json_build_object(
              'id', ecl.id, 'expense_date', ecl.expense_date, 'category_name', ecl.category_name,
              'description', ecl.description, 'amount', ecl.amount, 'currency_code', ecl.currency_code
            ) ORDER BY ecl.expense_date
          ) FILTER (WHERE ecl.id IS NOT NULL), '[]'
        ) AS lines
       FROM expense_claims ec
       LEFT JOIN projects p ON p.id = ec.project_id
       LEFT JOIN expense_claim_lines ecl ON ecl.claim_id = ec.id
       WHERE ec.company_id=$1 AND ec.employee_id=$2
       GROUP BY ec.id, p.code, p.name
       ORDER BY ec.created_at DESC`,
      [getAuth(req).companyId, emp.id],
    )
    sendOk(res, r.rows)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load your claims', err)
  }
}))

// ─── Company-wide claims dashboard ──────────────────────────────────────────
//
// Every claim, every status — a full overview rather than just the
// posted-but-unpaid "outstanding" slice it used to be scoped to. Each
// claim's own status badge (below) still shows what's actually owed vs.
// paid vs. rejected vs. still pending; this view's job is just to roll
// all of it up by employee.

expenseClaimsRouter.get(
  '/dashboard',
  requirePermission('finance.expenses.view', 'view'),
  asyncHandler(async (req, res) => {
    try {
      const [claims, byEmployee] = await Promise.all([
        query(
          `SELECT id, claim_number, employee_id, employee_name, total_amount, currency_code, status, created_at, approved_at
           FROM expense_claims
           WHERE company_id=$1
           ORDER BY created_at DESC`,
          [getAuth(req).companyId],
        ),
        query(
          `SELECT employee_id, employee_name,
                  COUNT(*)::INT AS claim_count,
                  COALESCE(SUM(total_amount),0) AS total_amount
           FROM expense_claims
           WHERE company_id=$1
           GROUP BY employee_id, employee_name
           ORDER BY total_amount DESC`,
          [getAuth(req).companyId],
        ),
      ])
      sendOk(res, { claims: claims.rows, by_employee: byEmployee.rows })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load dashboard', err)
    }
  }),
)

// ─── Get claim with lines ─────────────────────────────────────────────────────

expenseClaimsRouter.get(
  '/:id',
  requirePermission('finance.expenses.view', 'view'),
  asyncHandler(async (req, res) => {
    try {
      const ec = await query(
        `SELECT ec.*, proj.code AS project_code, proj.name AS project_name,
                COALESCE(cu.first_name || ' ' || cu.last_name, cu.email) AS created_by_name,
                COALESCE(au.first_name || ' ' || au.last_name, au.email) AS approved_by_name,
                COALESCE(ru.first_name || ' ' || ru.last_name, ru.email) AS rejected_by_name,
                COALESCE(pu.first_name || ' ' || pu.last_name, pu.email) AS paid_by_name,
                pcf.name AS petty_cash_float_name,
                aset.settlement_number, adv.advance_number
         FROM expense_claims ec
         LEFT JOIN projects proj ON proj.id = ec.project_id
         LEFT JOIN users cu ON cu.id = ec.created_by
         LEFT JOIN users au ON au.id = ec.approved_by
         LEFT JOIN users ru ON ru.id = ec.rejected_by
         LEFT JOIN users pu ON pu.id = ec.paid_by
         LEFT JOIN petty_cash_floats pcf ON pcf.id = ec.petty_cash_float_id
         LEFT JOIN advance_settlements aset ON aset.id = ec.settled_via_settlement_id
         LEFT JOIN employee_advances adv ON adv.id = aset.advance_id
         WHERE ec.id=$1 AND ec.company_id=$2`,
        [req.params['id'], getAuth(req).companyId],
      )
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
  }),
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
  project_id: z.string().uuid().optional(),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(1),
})

expenseClaimsRouter.post(
  '/',
  requirePermission('finance.expenses.edit', 'edit'),
  asyncHandler(async (req, res) => {
    try {
      const d = claimSchema.parse(req.body)
      const claimNumber = await nextClaimNumber(getAuth(req).companyId)
      const totalAmount = d.lines.reduce((s, l) => s + l.amount, 0)

      const result = await withTransaction(
        { companyId: getAuth(req).companyId, userId: getAuth(req).userId, role: getAuth(req).role },
        async (client) => {
          const reimbursementAccountId = await resolveReimbursementAccount(
            client,
            getAuth(req).companyId,
            d.currency_code,
          )
          const ecRes = await client.query(
            `INSERT INTO expense_claims
            (company_id, claim_number, employee_id, employee_name, description, currency_code, total_amount, reimbursement_account_id, project_id, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
            [
              getAuth(req).companyId,
              claimNumber,
              d.employee_id,
              d.employee_name,
              d.description ?? null,
              d.currency_code,
              totalAmount,
              reimbursementAccountId,
              d.project_id ?? null,
              d.notes ?? null,
              getAuth(req).userId,
            ],
          )
          const claim = firstRowOrThrow(ecRes)
          const lines = []
          for (const line of d.lines) {
            const { accountId, categoryName } = await resolveLineGlAccount(
              client,
              getAuth(req).companyId,
              line.category_id,
              line.gl_account_id,
            )
            const lr = await client.query(
              `INSERT INTO expense_claim_lines
              (claim_id, company_id, expense_date, category_id, category_name, gl_account_id, description, amount, currency_code, receipt_url, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
              [
                claim.id,
                getAuth(req).companyId,
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
        companyId: getAuth(req).companyId,
        userId: getAuth(req).userId,
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
  }),
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
  project_id: z.string().uuid().optional(),
  notes: z.string().optional(),
  lines: z.array(selfLineSchema).min(1),
})

expenseClaimsRouter.post('/request-self', asyncHandler(async (req, res) => {
  try {
    const d = selfClaimSchema.parse(req.body)
    const claimNumber = await nextClaimNumber(getAuth(req).companyId)
    const result = await withTransaction(
      { companyId: getAuth(req).companyId, userId: getAuth(req).userId, role: getAuth(req).role },
      async (client) => {
        const empRes = await client.query(
          `SELECT id, first_name, last_name FROM employees WHERE user_id=$1 AND company_id=$2`,
          [getAuth(req).userId, getAuth(req).companyId],
        )
        const emp = empRes.rows[0] as Record<string, unknown> | undefined
        if (!emp) return { error: 'NO_EMPLOYEE_LINK' as const }

        // No reimbursement_account_id resolved here any more — Finance picks
        // how this gets funded (reimburse / advance / petty cash) later, at
        // the Post Payment step, after approving the claim's legitimacy. See
        // POST /:id/post-payment.
        const totalAmount = d.lines.reduce((s, l) => s + l.amount, 0)
        const employeeName = `${emp['first_name'] as string} ${emp['last_name'] as string}`
        const ecRes = await client.query(
          `INSERT INTO expense_claims
             (company_id, claim_number, employee_id, employee_name, description, currency_code,
              total_amount, project_id, notes, status, submitted_at, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'submitted',NOW(),$10) RETURNING *`,
          [
            getAuth(req).companyId,
            claimNumber,
            emp['id'],
            employeeName,
            d.description ?? null,
            d.currency_code,
            totalAmount,
            d.project_id ?? null,
            d.notes ?? null,
            getAuth(req).userId,
          ],
        )
        const claim = firstRowOrThrow(ecRes)
        const lines = []
        for (const line of d.lines) {
          const { accountId, categoryName } = await resolveLineGlAccount(
            client,
            getAuth(req).companyId,
            line.category_id,
            undefined,
          )
          const lr = await client.query(
            `INSERT INTO expense_claim_lines
               (claim_id, company_id, expense_date, category_id, category_name, gl_account_id, description, amount, currency_code)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [
              claim.id,
              getAuth(req).companyId,
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
      companyId: getAuth(req).companyId,
      userId: getAuth(req).userId,
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
}))

// ─── Update claim (only draft) ────────────────────────────────────────────────

expenseClaimsRouter.put(
  '/:id',
  requirePermission('finance.expenses.edit', 'edit'),
  asyncHandler(async (req, res) => {
    try {
      const existing = await query(
        `SELECT status FROM expense_claims WHERE id=$1 AND company_id=$2`,
        [req.params['id'], getAuth(req).companyId],
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
        { companyId: getAuth(req).companyId, userId: getAuth(req).userId, role: getAuth(req).role },
        async (client) => {
          const reimbursementAccountId = await resolveReimbursementAccount(
            client,
            getAuth(req).companyId,
            d.currency_code,
          )
          const ecRes = await client.query(
            `UPDATE expense_claims SET employee_name=$1, description=$2, currency_code=$3, total_amount=$4, reimbursement_account_id=$5, project_id=$6, notes=$7, updated_at=NOW()
           WHERE id=$8 RETURNING *`,
            [
              d.employee_name,
              d.description ?? null,
              d.currency_code,
              totalAmount,
              reimbursementAccountId,
              d.project_id ?? null,
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
              getAuth(req).companyId,
              line.category_id,
              line.gl_account_id,
            )
            const lr = await client.query(
              `INSERT INTO expense_claim_lines
              (claim_id, company_id, expense_date, category_id, category_name, gl_account_id, description, amount, currency_code, receipt_url, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
              [
                req.params['id'],
                getAuth(req).companyId,
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
  }),
)

// ─── Submit claim ─────────────────────────────────────────────────────────────

expenseClaimsRouter.post(
  '/:id/submit',
  requirePermission('finance.expenses.edit', 'edit'),
  asyncHandler(async (req, res) => {
    try {
      const r = await query(
        `UPDATE expense_claims SET status='submitted', submitted_at=NOW(), updated_at=NOW()
       WHERE id=$1 AND company_id=$2 AND status='draft' RETURNING *`,
        [req.params['id'], getAuth(req).companyId],
      )
      if (!r.rows[0]) {
        sendError(res, 409, 'INVALID_STATUS', 'Claim is not in draft status')
        return
      }
      sendOk(res, r.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to submit claim', err)
    }
  }),
)

// ─── Approve claim (legitimacy only — no funding decision, no posting) ─────
//
// Used to post the reimbursement journal in the same step as this approval.
// Split in two: this just confirms the claim is legitimate (submitted ->
// approved). Which account actually pays it — reimburse, an employee's
// advance, or a petty cash float — is Finance's call, made afterward via
// POST /:id/post-payment. That's also why reimbursement_account_id is no
// longer resolved at submission (/request-self) — it may never be needed if
// Finance routes the claim to an advance or a petty cash float instead.

expenseClaimsRouter.post(
  '/:id/approve',
  requirePermission('finance.expenses.approve', 'approve'),
  asyncHandler(async (req, res) => {
    try {
      const r = await query(
        `UPDATE expense_claims SET status='approved', approved_by=$1, approved_at=NOW(), updated_at=NOW()
         WHERE id=$2 AND company_id=$3 AND status='submitted' RETURNING *`,
        [getAuth(req).userId, req.params['id'], getAuth(req).companyId],
      )
      if (!r.rows[0]) {
        sendError(res, 409, 'INVALID_STATUS', 'Claim is not in submitted status')
        return
      }
      await logAudit({
        companyId: getAuth(req).companyId,
        userId: getAuth(req).userId,
        action: 'UPDATE',
        tableName: 'expense_claims',
        recordId: req.params['id'],
        newValues: { status: 'approved' },
      })
      sendOk(res, r.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to approve claim', err)
    }
  }),
)

// ─── Funding options (for the Post Payment picker) ─────────────────────────
//
// Gated by the same finance.expenses.approve permission as the claim itself
// — not finance.advances.view/finance.petty_cash.view — so acting on a claim
// never silently requires a second, unrelated permission grant.

expenseClaimsRouter.get(
  '/:id/funding-options',
  requirePermission('finance.expenses.approve', 'approve'),
  asyncHandler(async (req, res) => {
    try {
      const claimRes = await query(
        `SELECT employee_id FROM expense_claims WHERE id=$1 AND company_id=$2`,
        [req.params['id'], getAuth(req).companyId],
      )
      if (!claimRes.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Claim not found')
        return
      }
      const [floats, advances] = await Promise.all([
        query(
          `SELECT id, name, currency_code, current_balance FROM petty_cash_floats
           WHERE company_id=$1 AND is_active=true ORDER BY name`,
          [getAuth(req).companyId],
        ),
        query(
          `SELECT id, advance_number, purpose, outstanding_amount, currency_code
           FROM employee_advances
           WHERE company_id=$1 AND employee_id=$2 AND status IN ('approved','partially_settled')
           ORDER BY created_at DESC`,
          [getAuth(req).companyId, claimRes.rows[0]['employee_id']],
        ),
      ])
      sendOk(res, { petty_cash_floats: floats.rows, advances: advances.rows })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load funding options', err)
    }
  }),
)

// ─── Post payment (Finance decides the funding source) ──────────────────────
//
// Only reachable from 'approved' — the legitimacy check above. Branches on
// funding_source:
//  - reimburse: exactly the old /:id/approve posting logic (DR each line's
//    GL, CR the default cash/bank account for the claim's currency).
//  - petty_cash: mirrors petty-cash.ts's POST /floats/:id/spend — locks the
//    float, checks current_balance, credits the float's own GL account,
//    decrements its balance, and logs a petty_cash_transactions row so it
//    reconciles identically to a spend Finance records directly there.
//  - advance: creates a real advance_settlements + advance_settlement_lines
//    record (so Employee Advance Detail needs no changes), posts its usual
//    DR category / CR Employee Advances JE, and links back via
//    settled_via_settlement_id — the claim itself carries no second JE.

const postPaymentSchema = z.object({
  funding_source: z.enum(['reimburse', 'advance', 'petty_cash']),
  petty_cash_float_id: z.string().uuid().optional(),
  advance_id: z.string().uuid().optional(),
})

expenseClaimsRouter.post(
  '/:id/post-payment',
  requirePermission('finance.expenses.approve', 'approve'),
  asyncHandler(async (req, res) => {
    try {
      const d = postPaymentSchema.parse(req.body)
      if (d.funding_source === 'petty_cash' && !d.petty_cash_float_id) {
        sendError(res, 422, 'VALIDATION', 'Select a petty cash float')
        return
      }
      if (d.funding_source === 'advance' && !d.advance_id) {
        sendError(res, 422, 'VALIDATION', 'Select an advance to settle against')
        return
      }

      const result = await withTransaction(
        { companyId: getAuth(req).companyId, userId: getAuth(req).userId, role: getAuth(req).role },
        async (client) => {
          // Split into a plain row lock + a separate lines fetch — Postgres
          // rejects FOR UPDATE combined with GROUP BY/aggregates (json_agg
          // here), so the single-query aggregate+lock shape used elsewhere
          // in this file (e.g. GET /:id) doesn't work once locking is added.
          // Lines can't change once a claim leaves 'draft' (PUT /:id only
          // allows edits in draft), so locking just the header is enough.
          const claimRes = await client.query(
            `SELECT ec.*, aa.id AS project_analytic_account_id
             FROM expense_claims ec
             LEFT JOIN projects p ON p.id = ec.project_id
             LEFT JOIN analytic_accounts aa ON aa.id = p.analytic_account_id
             WHERE ec.id=$1 AND ec.company_id=$2 AND ec.status='approved' FOR UPDATE OF ec`,
            [req.params['id'], getAuth(req).companyId],
          )
          if (!claimRes.rows[0]) return null
          const claim = claimRes.rows[0] as Record<string, unknown>
          // project_analytic_account_id comes from the analytic_accounts JOIN
          // itself, not a straight passthrough of projects.analytic_account_id
          // — a dangling reference must fail here, not reach the journal_lines
          // INSERT and crash on its FK constraint instead. Mirrors
          // employee-advances.ts's identical settlement-time check.
          if (claim['project_id'] && !claim['project_analytic_account_id']) {
            return { error: 'PROJECT_MISSING_ANALYTIC_ACCOUNT' as const }
          }
          const linesRes = await client.query(
            `SELECT * FROM expense_claim_lines WHERE claim_id=$1 ORDER BY expense_date`,
            [req.params['id']],
          )
          const lines = linesRes.rows as {
            expense_date: string
            gl_account_id: string
            category_id: string | null
            category_name: string | null
            amount: number
            description: string | null
          }[]
          const totalAmount = parseFloat(String(claim['total_amount']))

          if (d.funding_source === 'reimburse') {
            // Only resolve+store a fresh default when the claim doesn't
            // already carry one — an admin-created claim (POST /) still
            // picks its reimbursement account at creation time; that choice
            // must not be silently overridden here.
            const reimbursementAccountId =
              (claim['reimbursement_account_id'] as string | null) ??
              (await resolveReimbursementAccount(
                client,
                getAuth(req).companyId,
                claim['currency_code'] as string,
              ))

            const jeRes = await client.query(
              `INSERT INTO journal_entries (company_id, entry_date, reference, description, status, source_type, source_id, created_by)
               VALUES ($1, CURRENT_DATE, $2, $3, 'draft', 'expense_claim', $4, $5)
               RETURNING id`,
              [
                getAuth(req).companyId,
                claim['claim_number'],
                `Expense claim: ${claim['employee_name'] as string}`,
                claim['id'],
                getAuth(req).userId,
              ],
            )
            const jeId = firstRowOrThrow(jeRes).id as string

            for (const line of lines) {
              await client.query(
                `INSERT INTO journal_lines (journal_entry_id, account_id, analytic_account_id, currency_code, debit, credit, description, amount_company_currency)
                 VALUES ($1,$2,$3,$4,$5,0,$6,$5)`,
                [
                  jeId,
                  line.gl_account_id,
                  claim['project_analytic_account_id'] ?? null,
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
                reimbursementAccountId,
                claim['currency_code'],
                totalAmount,
                `Reimbursable: ${claim['employee_name'] as string}`,
              ],
            )
            const updated = await client.query(
              `UPDATE expense_claims SET status='posted', funding_source='reimburse', reimbursement_account_id=$1, journal_entry_id=$2, updated_at=NOW()
               WHERE id=$3 RETURNING *`,
              [reimbursementAccountId, jeId, req.params['id']],
            )
            return { claim: updated.rows[0] }
          }

          if (d.funding_source === 'petty_cash') {
            const floatRes = await client.query(
              `SELECT * FROM petty_cash_floats WHERE id=$1 AND company_id=$2 AND is_active=true FOR UPDATE`,
              [d.petty_cash_float_id, getAuth(req).companyId],
            )
            if (!floatRes.rows[0]) return { error: 'FLOAT_NOT_FOUND' as const }
            const float_ = floatRes.rows[0] as Record<string, unknown>
            if (Number(float_['current_balance']) < totalAmount) {
              return { error: 'INSUFFICIENT_BALANCE' as const }
            }
            const newBalance = Math.round((Number(float_['current_balance']) - totalAmount) * 100) / 100

            const jeRes = await client.query(
              `INSERT INTO journal_entries (company_id, entry_date, reference, description, status, source_type, source_id, created_by)
               VALUES ($1, CURRENT_DATE, $2, $3, 'draft', 'expense_claim', $4, $5)
               RETURNING id`,
              [
                getAuth(req).companyId,
                claim['claim_number'],
                `Expense claim (petty cash): ${claim['employee_name'] as string}`,
                claim['id'],
                getAuth(req).userId,
              ],
            )
            const jeId = firstRowOrThrow(jeRes).id as string

            for (const line of lines) {
              await client.query(
                `INSERT INTO journal_lines (journal_entry_id, account_id, analytic_account_id, currency_code, debit, credit, description, amount_company_currency)
                 VALUES ($1,$2,$3,$4,$5,0,$6,$5)`,
                [
                  jeId,
                  line.gl_account_id,
                  claim['project_analytic_account_id'] ?? null,
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
                float_['gl_account_id'],
                claim['currency_code'],
                totalAmount,
                `Petty cash spend: ${claim['employee_name'] as string}`,
              ],
            )
            await client.query(
              `UPDATE petty_cash_floats SET current_balance=$1, updated_at=NOW() WHERE id=$2`,
              [newBalance, d.petty_cash_float_id],
            )
            await client.query(
              `INSERT INTO petty_cash_transactions (float_id, company_id, transaction_date, description, amount, transaction_type, balance_after, journal_entry_id, created_by)
               VALUES ($1,$2,CURRENT_DATE,$3,$4,'spend',$5,$6,$7)`,
              [
                d.petty_cash_float_id,
                getAuth(req).companyId,
                `Expense claim ${claim['claim_number'] as string} — ${claim['employee_name'] as string}`,
                totalAmount,
                newBalance,
                jeId,
                getAuth(req).userId,
              ],
            )
            const updated = await client.query(
              `UPDATE expense_claims SET status='posted', funding_source='petty_cash', petty_cash_float_id=$1, journal_entry_id=$2, updated_at=NOW()
               WHERE id=$3 RETURNING *`,
              [d.petty_cash_float_id, jeId, req.params['id']],
            )
            return { claim: updated.rows[0] }
          }

          // funding_source === 'advance'
          const advRes = await client.query(
            `SELECT * FROM employee_advances
             WHERE id=$1 AND company_id=$2 AND employee_id=$3 AND status IN ('approved','partially_settled') FOR UPDATE`,
            [d.advance_id, getAuth(req).companyId, claim['employee_id']],
          )
          if (!advRes.rows[0]) return { error: 'ADVANCE_NOT_FOUND' as const }
          const advance = advRes.rows[0] as Record<string, unknown>
          if (totalAmount > parseFloat(String(advance['outstanding_amount'])) + 0.0001) {
            return { error: 'EXCEEDS_OUTSTANDING' as const }
          }
          if (!advance['cost_center_id']) {
            return { error: 'NO_COST_CENTER' as const }
          }
          let advanceProjectAnalyticAccountId: string | null = null
          if (advance['project_id']) {
            const paa = await client.query(
              `SELECT aa.id FROM projects p JOIN analytic_accounts aa ON aa.id = p.analytic_account_id WHERE p.id=$1`,
              [advance['project_id']],
            )
            advanceProjectAnalyticAccountId = (paa.rows[0]?.['id'] as string) ?? null
            if (!advanceProjectAnalyticAccountId) {
              return { error: 'PROJECT_MISSING_ANALYTIC_ACCOUNT' as const }
            }
          }

          const settlementNumber = await nextDocumentNumber(
            getAuth(req).companyId,
            'advance_settlement',
            'SET',
          )
          const sRes = await client.query(
            `INSERT INTO advance_settlements
               (company_id, settlement_number, advance_id, employee_id, employee_name, settlement_date,
                description, currency_code, total_amount, status, submitted_at, approved_by, approved_at, created_by)
             VALUES ($1,$2,$3,$4,$5,CURRENT_DATE,$6,$7,$8,'approved',NOW(),$9,NOW(),$9) RETURNING *`,
            [
              getAuth(req).companyId,
              settlementNumber,
              d.advance_id,
              claim['employee_id'],
              claim['employee_name'],
              `Settled from expense claim ${claim['claim_number'] as string}`,
              claim['currency_code'],
              totalAmount,
              getAuth(req).userId,
            ],
          )
          const settlement = firstRowOrThrow(sRes)

          const jeRes = await client.query(
            `INSERT INTO journal_entries (company_id, entry_date, reference, description, status, source_type, source_id, created_by)
             VALUES ($1, CURRENT_DATE, $2, $3, 'draft', 'advance_settlement', $4, $5)
             RETURNING id`,
            [
              getAuth(req).companyId,
              settlementNumber,
              `Advance settlement: ${claim['employee_name'] as string}`,
              settlement['id'],
              getAuth(req).userId,
            ],
          )
          const jeId = firstRowOrThrow(jeRes).id as string

          for (const line of lines) {
            await client.query(
              `INSERT INTO advance_settlement_lines
                 (settlement_id, company_id, line_date, gl_account_id, category_id, category_name, project_id, cost_center_id, description, amount, currency_code)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
              [
                settlement['id'],
                getAuth(req).companyId,
                line.expense_date,
                line.gl_account_id,
                line.category_id,
                line.category_name,
                advance['project_id'] ?? null,
                advance['cost_center_id'],
                line.description ?? (claim['claim_number'] as string),
                line.amount,
                claim['currency_code'],
              ],
            )
            await client.query(
              `INSERT INTO journal_lines (journal_entry_id, account_id, analytic_account_id, cost_center_id, currency_code, debit, credit, description, amount_company_currency)
               VALUES ($1,$2,$3,$4,$5,$6,0,$7,$6)`,
              [
                jeId,
                line.gl_account_id,
                advanceProjectAnalyticAccountId,
                advance['cost_center_id'],
                claim['currency_code'],
                line.amount,
                line.description ?? (claim['claim_number'] as string),
              ],
            )
          }
          await client.query(
            `INSERT INTO journal_lines (journal_entry_id, account_id, currency_code, debit, credit, description, amount_company_currency)
             VALUES ($1,$2,$3,0,$4,$5,$4)`,
            [jeId, advance['advance_account_id'], claim['currency_code'], totalAmount, `Settlement ${settlementNumber}`],
          )
          await client.query(`UPDATE advance_settlements SET journal_entry_id=$1 WHERE id=$2`, [
            jeId,
            settlement['id'],
          ])

          const newSettled = parseFloat(String(advance['settled_amount'])) + totalAmount
          const newReturned = parseFloat(String(advance['returned_amount']))
          const advanceAmount = parseFloat(String(advance['amount']))
          const newAdvStatus =
            newSettled + newReturned >= advanceAmount ? 'settled' : 'partially_settled'
          await client.query(
            `UPDATE employee_advances SET settled_amount=$1, status=$2, updated_at=NOW() WHERE id=$3`,
            [newSettled, newAdvStatus, d.advance_id],
          )

          const updated = await client.query(
            `UPDATE expense_claims SET status='posted', funding_source='advance', settled_via_settlement_id=$1, journal_entry_id=$2, updated_at=NOW()
             WHERE id=$3 RETURNING *`,
            [settlement['id'], jeId, req.params['id']],
          )
          return { claim: updated.rows[0] }
        },
      )
      if (!result) {
        sendError(res, 409, 'INVALID_STATUS', 'Claim is not in approved status')
        return
      }
      if ('error' in result) {
        const messages: Record<string, string> = {
          PROJECT_MISSING_ANALYTIC_ACCOUNT:
            'This claim’s linked project has no analytic account configured — set one before it can be posted',
          FLOAT_NOT_FOUND: 'Petty cash float not found or inactive',
          INSUFFICIENT_BALANCE: 'That petty cash float doesn’t have enough balance for this amount',
          ADVANCE_NOT_FOUND: 'Advance not found, not this employee’s, or not in a settleable status',
          EXCEEDS_OUTSTANDING: 'This claim’s total exceeds the advance’s outstanding balance',
          NO_COST_CENTER: 'That advance has no cost center set — it can’t be self-settled this way',
        }
        sendError(res, 422, result.error, messages[result.error] ?? 'Could not post payment')
        return
      }
      await logAudit({
        companyId: getAuth(req).companyId,
        userId: getAuth(req).userId,
        action: 'UPDATE',
        tableName: 'expense_claims',
        recordId: req.params['id'],
        newValues: { status: 'posted', funding_source: d.funding_source },
      })
      sendOk(res, result.claim)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to post payment', err)
    }
  }),
)

// ─── Reject claim ─────────────────────────────────────────────────────────────

expenseClaimsRouter.post(
  '/:id/reject',
  requirePermission('finance.expenses.approve', 'approve'),
  asyncHandler(async (req, res) => {
    const schema = z.object({ reason: z.string().min(1) })
    try {
      const { reason } = schema.parse(req.body)
      const r = await query(
        `UPDATE expense_claims SET status='rejected', rejected_by=$1, rejected_at=NOW(), rejection_reason=$2, updated_at=NOW()
       WHERE id=$3 AND company_id=$4 AND status IN ('submitted','approved') RETURNING *`,
        [getAuth(req).userId, reason, req.params['id'], getAuth(req).companyId],
      )
      if (!r.rows[0]) {
        sendError(res, 409, 'INVALID_STATUS', 'Claim is not in submitted or approved status')
        return
      }
      sendOk(res, r.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to reject claim', err)
    }
  }),
)

// ─── Mark as paid ─────────────────────────────────────────────────────────────

expenseClaimsRouter.post(
  '/:id/mark-paid',
  requirePermission('finance.expenses.edit', 'edit'),
  asyncHandler(async (req, res) => {
    try {
      const r = await query(
        `UPDATE expense_claims SET status='paid', paid_by=$1, paid_at=NOW(), updated_at=NOW()
       WHERE id=$2 AND company_id=$3 AND status='posted' RETURNING *`,
        [getAuth(req).userId, req.params['id'], getAuth(req).companyId],
      )
      if (!r.rows[0]) {
        sendError(res, 409, 'INVALID_STATUS', 'Claim must be posted first')
        return
      }
      sendOk(res, r.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to mark as paid', err)
    }
  }),
)
