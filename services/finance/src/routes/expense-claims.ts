import { Router } from 'express'
import { getAuth } from '@fnc-erp/auth'
import { z } from 'zod'
import { query, withTransaction, nextDocumentNumber, nextDocumentNumberInTransaction, type PoolClient, firstRowOrThrow, asyncHandler } from '@fnc-erp/db'
import { sendOk, sendError } from '../lib/errors.js'
import {
  requirePermission,
  loadPermissions,
  meetsLevel,
  type UserPermissions,
} from '@fnc-erp/permissions'
import { logAudit } from '@fnc-erp/audit'

export const expenseClaimsRouter: Router = Router()

// Thrown for expected, user-actionable setup gaps (missing Settings config,
// a category with no GL account) — caught specifically to return a clear
// 422 instead of a generic 500. Mirrors employee-advances.ts's AdvanceConfigError.
export class ExpenseConfigError extends Error {}

// 0.1 sweep: /summary used to sum expense_claims straight across every
// currency_code, unlike its own sibling /dashboard below (which already
// groups by currency_code). Resolves which currency to report in
// (explicit ?currency_code, else the company's own) plus every currency
// with real claim activity.
async function resolveExpenseClaimsCurrency(
  companyId: string,
  requested: string | undefined,
): Promise<{ currencyCode: string; availableCurrencies: string[] }> {
  const availableRes = await query<{ currency_code: string }>(
    `SELECT DISTINCT currency_code FROM expense_claims WHERE company_id=$1 ORDER BY 1`,
    [companyId],
  )
  const availableCurrencies = availableRes.rows.map((r) => r.currency_code)
  if (requested) return { currencyCode: requested, availableCurrencies }
  const companyRes = await query<{ currency_code: string }>(`SELECT currency_code FROM companies WHERE id=$1`, [
    companyId,
  ])
  return { currencyCode: companyRes.rows[0]?.currency_code ?? 'IQD', availableCurrencies }
}

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

// The highest existing EXP-YYYY-NNNN for this company and year, plus one —
// deliberately not COUNT(*)+1. A count breaks as soon as rows leave the set
// (claims moved to another company, deleted by hand): the count drops below
// the highest number, count+1 lands on a number that already exists, and every
// submit then fails on the (company_id, claim_number) unique key until the code
// changes (Al Watanyia, Oct 2026: 25 claims, highest 0028, next 0026 taken).
// Must run on the caller's transaction client: the advisory lock serialises
// concurrent submits for one company and releases at COMMIT/ROLLBACK, so two
// simultaneous submits can't both read the same maximum.
//
// The format is the company's own numbering rule (Settings > Document Numbering > Expense Claim: prefix, separator,
// digits, year, next number), read and advanced in this same transaction; it still goes past the highest number in use,
// so an admin lowering the counter cannot cause the duplicate described above. A company with no rule keeps the
// original EXP-YYYY-NNNN (highest of the year plus one).
async function nextClaimNumber(client: PoolClient, companyId: string): Promise<string> {
  const yr = new Date().getFullYear()
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
    `expense_claim_number:${companyId}`,
  ])
  const fromRule = await nextDocumentNumberInTransaction(
    client,
    companyId,
    'expense_claim',
    async (pattern) => {
      const highest = await client.query<{ n: string | null }>(
        `SELECT MAX(substring(claim_number FROM '[0-9]+$')::bigint) AS n
           FROM expense_claims WHERE company_id=$1 AND claim_number ~ $2`,
        [companyId, pattern],
      )
      return Number(highest.rows[0]?.n ?? 0)
    },
  )
  if (fromRule) return fromRule
  const res = await client.query<{ n: number }>(
    `SELECT COALESCE(MAX(substring(claim_number FROM '[0-9]+$')::int), 0) + 1 AS n
     FROM expense_claims
     WHERE company_id=$1 AND claim_number ~ $2`,
    [companyId, `^EXP-${yr}-[0-9]+$`],
  )
  const n = String(firstRowOrThrow(res).n).padStart(4, '0')
  return `EXP-${yr}-${n}`
}

// ─── Lines, numbers and who may revise a claim ──────────────────────────────

// A claim's lines in the order everyone reads them: by line_number (migration 312),
// the stable "#" an approver quotes when flagging a line. One query for every
// place that returns a claim's lines, so a field added to it appears everywhere.
const CLAIM_LINES_SQL = `SELECT ecl.*, a.code AS account_code, a.name AS account_name,
       COALESCE(fu.first_name || ' ' || fu.last_name, fu.email) AS flagged_by_name
     FROM expense_claim_lines ecl
     LEFT JOIN chart_of_accounts a ON a.id = ecl.gl_account_id
     LEFT JOIN users fu ON fu.id = ecl.flagged_by
     WHERE ecl.claim_id=$1 ORDER BY ecl.line_number`

// The person who filed a claim: whoever created it, or the employee it is for.
// Expects the claim as alias `ec` and the caller's user id as $3.
const OWNER_CHECK_SQL = `(ec.created_by = $3 OR EXISTS (
  SELECT 1 FROM employees e
  WHERE e.id = ec.employee_id AND e.company_id = ec.company_id AND e.user_id = $3))`

// The claim columns the revise route reads, plus whether the caller filed it.
interface ReviseClaimRow {
  status: string
  is_owner: boolean
  description: string | null
  notes: string | null
  currency_code: string
}

// A row from GET /mine is the caller's own claim, so the owner check is already true: it can be
// revised exactly when it is a draft or has been rejected.
function withCanRevise(row: Record<string, unknown>): Record<string, unknown> {
  return { ...row, can_revise: row['status'] === 'draft' || row['status'] === 'rejected' }
}

// Trimmed text, or null for nothing (an emptied field is stored as NULL, not as '').
function textOrNull(s: string | undefined): string | null {
  const v = s?.trim()
  return v ? v : null
}

// The single answer to "may this caller edit this claim?", used by the revise route
// and by `can_revise` on the claim reads, so the button and the server cannot drift.
// A rejected claim: its owner, or an admin. A draft: the same, plus anyone who could
// already edit drafts (finance.expenses.edit).
async function canReviseClaim(
  auth: { userId: string; companyId: string; role: string },
  status: string,
  isOwner: boolean,
): Promise<boolean> {
  if (status !== 'draft' && status !== 'rejected') return false
  if (auth.role === 'system_admin' || auth.role === 'company_admin') return true
  if (isOwner) return true
  if (status !== 'draft') return false
  const perms = await loadPermissions(auth.userId, auth.companyId).catch(
    () => ({}) as UserPermissions,
  )
  return meetsLevel(perms['finance.expenses.edit'], 'edit')
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
      const companyId = getAuth(req).companyId
      const { currencyCode, availableCurrencies } = await resolveExpenseClaimsCurrency(
        companyId,
        req.query['currency_code'] as string | undefined,
      )
      const r = await query(
        `SELECT
         COUNT(*) FILTER (WHERE status='draft')                AS draft_count,
         COUNT(*) FILTER (WHERE status='submitted')            AS pending_count,
         COUNT(*) FILTER (WHERE status='posted')                AS posted_count,
         COALESCE(SUM(total_amount) FILTER (WHERE status='submitted'),0) AS pending_amount,
         COALESCE(SUM(total_amount) FILTER (WHERE status='posted'),0)    AS posted_amount,
         COALESCE(SUM(total_amount) FILTER (WHERE status='paid'),0)      AS paid_amount
       FROM expense_claims WHERE company_id=$1 AND currency_code=$2`,
        [companyId, currencyCode],
      )
      sendOk(res, { ...r.rows[0], currencyCode, availableCurrencies })
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
              'description', ecl.description, 'amount', ecl.amount, 'currency_code', ecl.currency_code,
              'line_number', ecl.line_number, 'category_id', ecl.category_id,
              'flag_reason', ecl.flag_reason, 'flagged_at', ecl.flagged_at,
              'flagged_by_name', (SELECT COALESCE(fu.first_name || ' ' || fu.last_name, fu.email) FROM users fu WHERE fu.id = ecl.flagged_by),
              'flag_addressed_at', ecl.flag_addressed_at, 'flag_resolved_at', ecl.flag_resolved_at
            ) ORDER BY ecl.line_number
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
    sendOk(res, r.rows.map(withCanRevise))
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
        // Grouped by currency_code too, not just employee — summing
        // total_amount across an employee's claims regardless of currency
        // would silently blend e.g. USD and IQD into one meaningless number.
        // One row per employee per currency; the frontend re-groups these
        // into one visual row per employee with a per-currency breakdown.
        query(
          `SELECT employee_id, employee_name, currency_code,
                  COUNT(*)::INT AS claim_count,
                  COALESCE(SUM(total_amount),0) AS total_amount
           FROM expense_claims
           WHERE company_id=$1
           GROUP BY employee_id, employee_name, currency_code
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
                COALESCE(du.first_name || ' ' || du.last_name, du.email) AS audited_by_name,
                COALESCE(pu.first_name || ' ' || pu.last_name, pu.email) AS paid_by_name,
                pcf.name AS petty_cash_float_name,
                aset.settlement_number, adv.advance_number,
                EXISTS (
                  SELECT 1 FROM document_attachments da
                  WHERE (da.entity_type='expense_claim' AND da.entity_id=ec.id)
                     OR (da.entity_type='expense_claim_line' AND da.entity_id IN (
                           SELECT id FROM expense_claim_lines WHERE claim_id=ec.id))
                ) AS has_receipt,
                ${OWNER_CHECK_SQL} AS is_owner
         FROM expense_claims ec
         LEFT JOIN projects proj ON proj.id = ec.project_id
         LEFT JOIN users cu ON cu.id = ec.created_by
         LEFT JOIN users au ON au.id = ec.approved_by
         LEFT JOIN users ru ON ru.id = ec.rejected_by
         LEFT JOIN users du ON du.id = ec.audited_by
         LEFT JOIN users pu ON pu.id = ec.paid_by
         LEFT JOIN petty_cash_floats pcf ON pcf.id = ec.petty_cash_float_id
         LEFT JOIN advance_settlements aset ON aset.id = ec.settled_via_settlement_id
         LEFT JOIN employee_advances adv ON adv.id = aset.advance_id
         WHERE ec.id=$1 AND ec.company_id=$2`,
        [req.params['id'], getAuth(req).companyId, getAuth(req).userId],
      )
      if (!ec.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Claim not found')
        return
      }
      const lines = await query(CLAIM_LINES_SQL, [req.params['id']])
      const { is_owner: isOwner, ...claimRow } = ec.rows[0] as Record<string, unknown>
      const canRevise = await canReviseClaim(
        getAuth(req),
        claimRow['status'] as string,
        isOwner === true,
      )
      sendOk(res, { ...claimRow, can_revise: canRevise, lines: lines.rows })
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
      const totalAmount = d.lines.reduce((s, l) => s + l.amount, 0)

      const result = await withTransaction(
        { companyId: getAuth(req).companyId, userId: getAuth(req).userId, role: getAuth(req).role },
        async (client) => {
          const reimbursementAccountId = await resolveReimbursementAccount(
            client,
            getAuth(req).companyId,
            d.currency_code,
          )
          const claimNumber = await nextClaimNumber(client, getAuth(req).companyId)
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
        newValues: { claim_number: result.claim_number, total_amount: totalAmount },
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
  // True when the organizer hasn't spent the money yet — approve first,
  // receipt comes later. Enforced at pass-audit, not here.
  receipt_pending: z.boolean().default(false),
})

expenseClaimsRouter.post('/request-self', asyncHandler(async (req, res) => {
  try {
    const d = selfClaimSchema.parse(req.body)
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
        const claimNumber = await nextClaimNumber(client, getAuth(req).companyId)
        const ecRes = await client.query(
          `INSERT INTO expense_claims
             (company_id, claim_number, employee_id, employee_name, description, currency_code,
              total_amount, project_id, notes, receipt_pending, status, submitted_at, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'submitted',NOW(),$11) RETURNING *`,
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
            d.receipt_pending,
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

// ─── Revise claim (edit lines in place, optionally resubmit) ─────────────────
//
// The one edit path for the two states a claim can be fixed in: 'rejected' (an
// approver sent it back, optionally flagging lines) and 'draft' (a new claim, or
// one Finance sent back from audit). It replaced PUT /:id, which deleted and
// re-inserted every line: each edit gave every line a new id, so the receipts
// attached to a line (document_attachments, entity_type 'expense_claim_line';
// 109 of them on production) were left pointing at rows that no longer existed,
// and a line's number and review flag could not survive. Here lines are matched
// by id: sent with an id they are updated in place, sent without one they are
// new, left out they are removed together with their receipts.
//
// Who may call it is decided by canReviseClaim (also exposed as `can_revise` on
// GET /:id), not by a route permission, because the people who file claims are
// mostly plain users with no finance.expenses.* key at all.
//
// The claim's own total is summed in SQL after the writes, never in JS. The
// reimbursement account is not resolved here (self-service claims have none by
// design, Finance picks the funding at Post Payment); it is only cleared when
// the currency changes, so Post Payment re-resolves it for the new currency.

const reviseLineSchema = z.object({
  id: z.string().uuid().optional(),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // Optional on a line that already has one (keeps its category and account);
  // required for a new line, checked below.
  category_id: z.string().uuid().optional(),
  description: z.string().max(2000).optional(),
  amount: z.coerce.number().positive(),
})

const reviseSchema = z.object({
  description: z.string().max(2000).optional(),
  notes: z.string().max(2000).optional(),
  currency_code: z.string().length(3).optional(),
  lines: z.array(reviseLineSchema).min(1).max(500),
  resubmit: z.boolean().default(false),
})

expenseClaimsRouter.post(
  '/:id/revise',
  asyncHandler(async (req, res) => {
    try {
      const d = reviseSchema.parse(req.body)
      const auth = getAuth(req)
      const claimId = req.params['id'] ?? ''

      const result = await withTransaction(
        { companyId: auth.companyId, userId: auth.userId, role: auth.role },
        async (client) => {
          const cRes = await client.query<ReviseClaimRow>(
            `SELECT ec.*, ${OWNER_CHECK_SQL} AS is_owner
             FROM expense_claims ec
             WHERE ec.id=$1 AND ec.company_id=$2 FOR UPDATE OF ec`,
            [claimId, auth.companyId, auth.userId],
          )
          const claim = cRes.rows[0]
          if (!claim) return { error: 'NOT_FOUND' as const }
          if (claim.status !== 'draft' && claim.status !== 'rejected') {
            return { error: 'INVALID_STATUS' as const }
          }
          if (!(await canReviseClaim(auth, claim.status, claim.is_owner))) {
            return { error: 'FORBIDDEN' as const }
          }

          const existingRes = await client.query<{ id: string; category_id: string | null }>(
            `SELECT id, category_id FROM expense_claim_lines WHERE claim_id=$1 AND company_id=$2`,
            [claimId, auth.companyId],
          )
          const existing = new Map(existingRes.rows.map((r) => [r.id, r]))
          const sentIds = d.lines.map((l) => l.id).filter((x): x is string => !!x)
          if (
            sentIds.some((lid) => !existing.has(lid)) ||
            new Set(sentIds).size !== sentIds.length
          ) {
            return { error: 'BAD_LINES' as const }
          }

          const currency = d.currency_code ?? claim.currency_code

          // Removed lines go first, receipts with them, so a new line can never
          // be confused with a removed one and no attachment is left dangling.
          const removedIds = [...existing.keys()].filter((lid) => !sentIds.includes(lid))
          if (removedIds.length > 0) {
            const gone = await client.query<{ file_id: string }>(
              `DELETE FROM document_attachments
               WHERE entity_type='expense_claim_line' AND entity_id = ANY($1::uuid[]) RETURNING file_id`,
              [removedIds],
            )
            if (gone.rows.length > 0) {
              // Same bookkeeping as removeAttachment: a file nothing refers to
              // any more goes back to 'uploaded'.
              await client.query(
                `UPDATE files SET status='uploaded'
                 WHERE id = ANY($1::uuid[])
                   AND NOT EXISTS (SELECT 1 FROM document_attachments da WHERE da.file_id = files.id)`,
                [gone.rows.map((r) => r.file_id)],
              )
            }
            await client.query(
              `DELETE FROM expense_claim_lines WHERE claim_id=$1 AND id = ANY($2::uuid[])`,
              [claimId, removedIds],
            )
          }

          for (const line of d.lines) {
            if (line.id) {
              // A changed category re-resolves the GL account; an unchanged (or
              // absent) one keeps the line's category and account exactly as is.
              const before = existing.get(line.id)
              if (line.category_id && line.category_id !== before?.category_id) {
                const { accountId, categoryName } = await resolveLineGlAccount(
                  client,
                  auth.companyId,
                  line.category_id,
                  undefined,
                )
                await client.query(
                  `UPDATE expense_claim_lines
                   SET expense_date=$1, description=$2, amount=$3, currency_code=$4,
                       category_id=$5, category_name=$6, gl_account_id=$7
                   WHERE id=$8 AND claim_id=$9`,
                  [
                    line.expense_date,
                    textOrNull(line.description),
                    line.amount,
                    currency,
                    line.category_id,
                    categoryName ?? null,
                    accountId,
                    line.id,
                    claimId,
                  ],
                )
              } else {
                await client.query(
                  `UPDATE expense_claim_lines
                   SET expense_date=$1, description=$2, amount=$3, currency_code=$4
                   WHERE id=$5 AND claim_id=$6`,
                  [
                    line.expense_date,
                    textOrNull(line.description),
                    line.amount,
                    currency,
                    line.id,
                    claimId,
                  ],
                )
              }
            } else {
              const { accountId, categoryName } = await resolveLineGlAccount(
                client,
                auth.companyId,
                line.category_id,
                undefined,
              )
              // line_number is handed out by the database (trigger, migration 312).
              await client.query(
                `INSERT INTO expense_claim_lines
                   (claim_id, company_id, expense_date, category_id, category_name, gl_account_id, description, amount, currency_code)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
                [
                  claimId,
                  auth.companyId,
                  line.expense_date,
                  line.category_id ?? null,
                  categoryName ?? null,
                  accountId,
                  textOrNull(line.description),
                  line.amount,
                  currency,
                ],
              )
            }
          }

          if (d.resubmit) {
            // The act of resubmitting is what "addresses" every open flag; the
            // approver still confirms each one (resolve-flag below).
            await client.query(
              `UPDATE expense_claim_lines SET flag_addressed_at=NOW()
               WHERE claim_id=$1 AND flagged_at IS NOT NULL
                 AND flag_resolved_at IS NULL AND flag_addressed_at IS NULL`,
              [claimId],
            )
          }

          const description =
            d.description === undefined ? claim.description : textOrNull(d.description)
          const notes = d.notes === undefined ? claim.notes : textOrNull(d.notes)
          const updated = await client.query<Record<string, unknown>>(
            `UPDATE expense_claims SET
               description=$3, notes=$4, currency_code=$5::varchar(3),
               total_amount=(SELECT COALESCE(SUM(amount),0) FROM expense_claim_lines WHERE claim_id=$1),
               reimbursement_account_id = CASE WHEN currency_code <> $5::varchar(3) THEN NULL ELSE reimbursement_account_id END,
               status = CASE WHEN $6::boolean THEN 'submitted' ELSE status END,
               submitted_at = CASE WHEN $6::boolean THEN NOW() ELSE submitted_at END,
               approved_by = CASE WHEN $6::boolean THEN NULL ELSE approved_by END,
               approved_at = CASE WHEN $6::boolean THEN NULL ELSE approved_at END,
               updated_at=NOW()
             WHERE id=$1 AND company_id=$2 RETURNING *`,
            [claimId, auth.companyId, description, notes, currency, d.resubmit],
          )
          const lines = await client.query<Record<string, unknown>>(CLAIM_LINES_SQL, [claimId])
          const revised: Record<string, unknown> = {
            ...firstRowOrThrow(updated),
            lines: lines.rows,
          }
          return {
            claim: revised,
            wasStatus: claim.status,
            removed: removedIds.length,
            added: d.lines.filter((l) => !l.id).length,
          }
        },
      )

      if ('error' in result) {
        const errors = {
          NOT_FOUND: [404, 'NOT_FOUND', 'Claim not found'],
          FORBIDDEN: [403, 'FORBIDDEN', 'Only the person who filed this claim can edit it'],
          INVALID_STATUS: [409, 'INVALID_STATUS', 'Only draft or rejected claims can be edited'],
          BAD_LINES: [422, 'VALIDATION', 'One of the lines does not belong to this claim'],
        } as const
        const [status, code, message] = errors[result.error]
        sendError(res, status, code, message)
        return
      }
      await logAudit({
        companyId: auth.companyId,
        userId: auth.userId,
        action: 'UPDATE',
        tableName: 'expense_claims',
        recordId: claimId,
        oldValues: { status: result.wasStatus },
        newValues: {
          revised: true,
          status: result.claim['status'],
          total_amount: result.claim['total_amount'],
          lines_added: result.added,
          lines_removed: result.removed,
        },
      })
      sendOk(res, result.claim)
    } catch (err) {
      if (err instanceof ExpenseConfigError) {
        sendError(res, 422, 'EXPENSE_CONFIG_MISSING', err.message)
        return
      }
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update claim', err)
    }
  }),
)

// ─── Confirm a fixed line (approver) ─────────────────────────────────────────
//
// Mirrors resolveLineFlag on requisitions: a flag is raised by the reject, marked
// "addressed" when the employee resubmits, and cleared only here, by someone who
// could have raised it. Only an addressed flag can be resolved: an open one is
// still waiting for the employee, and resolving it would hide the reason from them.

expenseClaimsRouter.post(
  '/:id/lines/:lineId/resolve-flag',
  requirePermission('finance.expenses.approve', 'approve'),
  asyncHandler(async (req, res) => {
    try {
      const r = await query(
        `UPDATE expense_claim_lines ecl SET flag_resolved_at=NOW(), flag_resolved_by=$1
         FROM expense_claims ec
         WHERE ecl.id=$2 AND ecl.claim_id=$3 AND ec.id = ecl.claim_id AND ec.company_id=$4
           AND ecl.flagged_at IS NOT NULL AND ecl.flag_addressed_at IS NOT NULL
           AND ecl.flag_resolved_at IS NULL
         RETURNING ecl.*`,
        [getAuth(req).userId, req.params['lineId'], req.params['id'], getAuth(req).companyId],
      )
      if (!r.rows[0]) {
        sendError(res, 409, 'INVALID_STATUS', 'This line has no fixed flag waiting to be confirmed')
        return
      }
      await logAudit({
        companyId: getAuth(req).companyId,
        userId: getAuth(req).userId,
        action: 'UPDATE',
        tableName: 'expense_claim_lines',
        recordId: req.params['lineId'],
        newValues: { flag_resolved: true },
      })
      sendOk(res, r.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to resolve flag', err)
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

// ─── Audit (Finance reviews an already-approved claim) ──────────────────────
//
// Sits between the legitimacy approval above and Post Payment below — a
// separate finance.expenses.audit permission, not .approve, so audit rights
// can be granted independently even though today the same people likely
// hold both. Pass moves the claim on to 'audited' (what Post Payment now
// requires, see below); Fail sends it back to 'draft' instead of the
// 'rejected' used by /reject — a draft claim is editable via POST /:id/revise
// and goes through the normal draft -> submitted -> approved -> audited path
// again once resubmitted, no special-casing needed.

expenseClaimsRouter.post(
  '/:id/pass-audit',
  requirePermission('finance.expenses.audit', 'approve'),
  asyncHandler(async (req, res) => {
    try {
      // receipt_pending (set at request-self: "approve first, I'll upload
      // the receipt after") must actually have one attached before it can
      // pass audit — otherwise a claim could complete with no proof of
      // spend at all. Checked here, not at approve, since approving is
      // exactly the point where none exists yet by design.
      const pending = await query<{ receipt_pending: boolean; has_receipt: boolean }>(
        `SELECT ec.receipt_pending,
                EXISTS (
                  SELECT 1 FROM document_attachments da
                  WHERE (da.entity_type='expense_claim' AND da.entity_id=ec.id)
                     OR (da.entity_type='expense_claim_line' AND da.entity_id IN (
                           SELECT id FROM expense_claim_lines WHERE claim_id=ec.id))
                ) AS has_receipt
         FROM expense_claims ec WHERE ec.id=$1 AND ec.company_id=$2`,
        [req.params['id'], getAuth(req).companyId],
      )
      if (!pending.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Claim not found')
        return
      }
      if (pending.rows[0].receipt_pending && !pending.rows[0].has_receipt) {
        sendError(
          res,
          422,
          'RECEIPT_REQUIRED',
          'This claim was submitted without a receipt — attach one before it can pass audit',
        )
        return
      }
      const r = await query(
        `UPDATE expense_claims SET status='audited', audited_by=$1, audited_at=NOW(), updated_at=NOW()
         WHERE id=$2 AND company_id=$3 AND status='approved' RETURNING *`,
        [getAuth(req).userId, req.params['id'], getAuth(req).companyId],
      )
      if (!r.rows[0]) {
        sendError(res, 409, 'INVALID_STATUS', 'Claim is not in approved status')
        return
      }
      await logAudit({
        companyId: getAuth(req).companyId,
        userId: getAuth(req).userId,
        action: 'UPDATE',
        tableName: 'expense_claims',
        recordId: req.params['id'],
        newValues: { status: 'audited' },
      })
      sendOk(res, r.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to pass audit', err)
    }
  }),
)

expenseClaimsRouter.post(
  '/:id/fail-audit',
  requirePermission('finance.expenses.audit', 'approve'),
  asyncHandler(async (req, res) => {
    const schema = z.object({ reason: z.string().min(1) })
    try {
      const { reason } = schema.parse(req.body)
      const r = await query(
        `UPDATE expense_claims SET status='draft', audited_by=$1, audited_at=NOW(), audit_fail_reason=$2, updated_at=NOW()
         WHERE id=$3 AND company_id=$4 AND status='approved' RETURNING *`,
        [getAuth(req).userId, reason, req.params['id'], getAuth(req).companyId],
      )
      if (!r.rows[0]) {
        sendError(res, 409, 'INVALID_STATUS', 'Claim is not in approved status')
        return
      }
      await logAudit({
        companyId: getAuth(req).companyId,
        userId: getAuth(req).userId,
        action: 'UPDATE',
        tableName: 'expense_claims',
        recordId: req.params['id'],
        newValues: { status: 'draft', audit_fail_reason: reason },
      })
      sendOk(res, r.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fail audit', err)
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
// Only reachable from 'audited' — the legitimacy approval plus the audit
// pass/fail above it both have to have happened first. Branches on
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
          // Lines can't change once a claim leaves 'draft' (POST /:id/revise
          // only edits a draft or rejected claim), so locking just the
          // header is enough.
          const claimRes = await client.query(
            `SELECT ec.*, aa.id AS project_analytic_account_id
             FROM expense_claims ec
             LEFT JOIN projects p ON p.id = ec.project_id
             LEFT JOIN analytic_accounts aa ON aa.id = p.analytic_account_id
             WHERE ec.id=$1 AND ec.company_id=$2 AND ec.status='audited' FOR UPDATE OF ec`,
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
        sendError(res, 409, 'INVALID_STATUS', 'Claim is not in audited status')
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
//
// An approver can tick the lines that are wrong and give each its own reason
// (lineFlags), the same way a requisition is rejected, and/or give an overall
// reason. At least one of the two is required; with only line flags the overall
// reason is composed from them, so a rejected claim always has a reason to show.
// Unlike requisitions the flags are optional: roughly half of the rejections on
// record are about the whole claim ("wrong company", "not an expense").
// 'rejected' stays editable by whoever filed the claim (POST /:id/revise).

const rejectSchema = z
  .object({
    reason: z.string().trim().max(2000).optional(),
    lineFlags: z
      .array(z.object({ lineId: z.string().uuid(), reason: z.string().trim().min(1).max(1000) }))
      .max(500)
      .optional(),
  })
  .refine((d) => !!d.reason || (d.lineFlags?.length ?? 0) > 0, {
    message: 'Give an overall reason or flag at least one line with a reason',
  })

expenseClaimsRouter.post(
  '/:id/reject',
  requirePermission('finance.expenses.approve', 'approve'),
  asyncHandler(async (req, res) => {
    try {
      const parsed = rejectSchema.safeParse(req.body)
      if (!parsed.success) {
        sendError(res, 422, 'VALIDATION', parsed.error.issues[0]?.message ?? 'Invalid request')
        return
      }
      const { reason, lineFlags = [] } = parsed.data
      const lineIds = lineFlags.map((f) => f.lineId)
      const reasonByLine = new Map(lineFlags.map((f) => [f.lineId, f.reason]))
      if (new Set(lineIds).size !== lineIds.length) {
        sendError(res, 422, 'VALIDATION', 'A line can only be flagged once')
        return
      }

      const result = await withTransaction(
        { companyId: getAuth(req).companyId, userId: getAuth(req).userId, role: getAuth(req).role },
        async (client) => {
          const cRes = await client.query(
            `SELECT id FROM expense_claims
             WHERE id=$1 AND company_id=$2 AND status IN ('submitted','approved') FOR UPDATE`,
            [req.params['id'], getAuth(req).companyId],
          )
          if (!cRes.rows[0]) return { error: 'INVALID_STATUS' as const }

          const flagged: { lineNumber: number; label: string; reason: string }[] = []
          if (lineFlags.length > 0) {
            const owned = await client.query<{
              id: string
              line_number: number
              description: string | null
              category_name: string | null
            }>(
              `SELECT id, line_number, description, category_name FROM expense_claim_lines
               WHERE claim_id=$1 AND company_id=$2 AND id = ANY($3::uuid[]) ORDER BY line_number`,
              [req.params['id'], getAuth(req).companyId, lineIds],
            )
            if (owned.rows.length !== lineIds.length) return { error: 'BAD_LINES' as const }
            for (const row of owned.rows) {
              const flagReason = reasonByLine.get(row.id) ?? ''
              // Re-flagging a line starts a fresh cycle: clears whatever addressed/
              // resolved state an earlier flag on it had.
              await client.query(
                `UPDATE expense_claim_lines
                 SET flag_reason=$1, flagged_at=NOW(), flagged_by=$2,
                     flag_addressed_at=NULL, flag_resolved_at=NULL, flag_resolved_by=NULL
                 WHERE id=$3 AND claim_id=$4`,
                [flagReason, getAuth(req).userId, row.id, req.params['id']],
              )
              flagged.push({
                lineNumber: row.line_number,
                label: [row.description?.trim(), row.category_name].find((v) => !!v) ?? '',
                reason: flagReason,
              })
            }
          }

          const composed = flagged
            .map((f) => `• Line ${f.lineNumber}${f.label ? ` (${f.label})` : ''}: ${f.reason}`)
            .join('\n')
          // The overall reason first, then the flagged lines, with a blank line between.
          const fullReason = [reason, composed].filter((part) => !!part).join('\n\n')
          const upd = await client.query<Record<string, unknown>>(
            `UPDATE expense_claims SET status='rejected', rejected_by=$1, rejected_at=NOW(), rejection_reason=$2, updated_at=NOW()
             WHERE id=$3 AND company_id=$4 RETURNING *`,
            [getAuth(req).userId, fullReason, req.params['id'], getAuth(req).companyId],
          )
          return { claim: firstRowOrThrow(upd), flaggedCount: flagged.length }
        },
      )
      if ('error' in result) {
        if (result.error === 'BAD_LINES') {
          sendError(
            res,
            422,
            'VALIDATION',
            'One of the flagged lines does not belong to this claim',
          )
          return
        }
        sendError(res, 409, 'INVALID_STATUS', 'Claim is not in submitted or approved status')
        return
      }
      await logAudit({
        companyId: getAuth(req).companyId,
        userId: getAuth(req).userId,
        action: 'UPDATE',
        tableName: 'expense_claims',
        recordId: req.params['id'],
        newValues: {
          status: 'rejected',
          rejection_reason: result.claim['rejection_reason'],
          lines_flagged: result.flaggedCount,
        },
      })
      sendOk(res, result.claim)
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
