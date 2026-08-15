import { Router } from 'express'
import { z } from 'zod'
import { query, withTransaction, nextDocumentNumber } from '@fnc-erp/db'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'
import { logAudit } from '@fnc-erp/audit'

export const employeeAdvancesRouter: import('express').Router = Router()

// ─── Create advance ────────────────────────────────────────────────────────

const advanceSchema = z.object({
  employee_id: z.string().uuid(),
  employee_name: z.string().min(1),
  purpose: z.string().optional(),
  project_id: z.string().uuid().optional(),
  cost_center_id: z.string().uuid().optional(),
  currency_code: z.string().length(3).default('IQD'),
  fx_rate: z.coerce.number().positive().default(1),
  amount: z.coerce.number().positive(),
  cash_account_id: z.string().uuid(),
  advance_account_id: z.string().uuid(),
  notes: z.string().optional(),
})

// ─── List advances ─────────────────────────────────────────────────────────

employeeAdvancesRouter.get(
  '/',
  requirePermission('finance.advances.view', 'view'),
  async (req, res) => {
    const schema = z.object({
      status: z.string().optional(),
      employee_id: z.string().uuid().optional(),
      project_id: z.string().uuid().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(100),
      offset: z.coerce.number().int().min(0).default(0),
    })
    try {
      const { status, employee_id, project_id, limit, offset } = schema.parse(req.query)
      const conditions: string[] = ['a.company_id = $1']
      const params: unknown[] = [req.auth!.companyId]
      let p = 2
      if (status) {
        conditions.push(`a.status = $${p++}`)
        params.push(status)
      }
      if (employee_id) {
        conditions.push(`a.employee_id = $${p++}`)
        params.push(employee_id)
      }
      if (project_id) {
        conditions.push(`a.project_id = $${p++}`)
        params.push(project_id)
      }

      const r = await query(
        `SELECT a.* FROM employee_advances a
         WHERE ${conditions.join(' AND ')}
         ORDER BY a.created_at DESC
         LIMIT $${p} OFFSET $${p + 1}`,
        [...params, limit, offset],
      )
      sendOk(res, r.rows)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load advances', err)
    }
  },
)

// ─── Summary KPIs ───────────────────────────────────────────────────────────

employeeAdvancesRouter.get(
  '/summary',
  requirePermission('finance.advances.view', 'view'),
  async (req, res) => {
    try {
      const r = await query(
        `SELECT
           COUNT(*) FILTER (WHERE status='pending_approval') AS pending_count,
           COALESCE(SUM(amount) FILTER (WHERE status='pending_approval'), 0) AS pending_amount,
           COUNT(*) FILTER (WHERE status IN ('approved','partially_settled')) AS active_count,
           COALESCE(SUM(outstanding_amount) FILTER (WHERE status IN ('approved','partially_settled')), 0) AS total_outstanding,
           COUNT(*) FILTER (WHERE status='settled') AS settled_count
         FROM employee_advances WHERE company_id=$1`,
        [req.auth!.companyId],
      )
      sendOk(res, r.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load summary', err)
    }
  },
)

// ─── Get advance with settlements + returns ────────────────────────────────
//
// Constrained to a UUID shape (not bare '/:id') because Express matches
// routes in registration order, not by specificity — an unconstrained
// '/:id' registered this early would swallow every later single-segment
// literal route (e.g. GET /dashboard, /settlements, /returns) for this
// same HTTP method, since 'dashboard' matches ':id' just as well as a
// real UUID does.

employeeAdvancesRouter.get(
  '/:id([0-9a-fA-F-]{36})',
  requirePermission('finance.advances.view', 'view'),
  async (req, res) => {
    try {
      const a = await query(`SELECT * FROM employee_advances WHERE id=$1 AND company_id=$2`, [
        req.params['id'],
        req.auth!.companyId,
      ])
      if (!a.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Advance not found')
        return
      }
      const settlements = await query(
        `SELECT s.*, COUNT(sl.id)::INT AS line_count
         FROM advance_settlements s
         LEFT JOIN advance_settlement_lines sl ON sl.settlement_id = s.id
         WHERE s.advance_id=$1
         GROUP BY s.id ORDER BY s.created_at DESC`,
        [req.params['id']],
      )
      const returns = await query(
        `SELECT * FROM advance_returns WHERE advance_id=$1 ORDER BY created_at DESC`,
        [req.params['id']],
      )
      sendOk(res, { ...a.rows[0], settlements: settlements.rows, returns: returns.rows })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load advance', err)
    }
  },
)

// ─── Create advance (draft) ─────────────────────────────────────────────────

employeeAdvancesRouter.post(
  '/',
  requirePermission('finance.advances.edit', 'edit'),
  async (req, res) => {
    try {
      const d = advanceSchema.parse(req.body)
      const advanceNumber = await nextDocumentNumber(req.auth!.companyId, 'employee_advance', 'ADV')
      const r = await query(
        `INSERT INTO employee_advances
           (company_id, advance_number, employee_id, employee_name, purpose, project_id, cost_center_id,
            currency_code, fx_rate, amount, cash_account_id, advance_account_id, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [
          req.auth!.companyId,
          advanceNumber,
          d.employee_id,
          d.employee_name,
          d.purpose ?? null,
          d.project_id ?? null,
          d.cost_center_id ?? null,
          d.currency_code,
          d.fx_rate,
          d.amount,
          d.cash_account_id,
          d.advance_account_id,
          d.notes ?? null,
          req.auth!.userId,
        ],
      )
      await logAudit({
        companyId: req.auth!.companyId,
        userId: req.auth!.userId,
        action: 'INSERT',
        tableName: 'employee_advances',
        recordId: r.rows[0]!['id'] as string,
        newValues: { advance_number: advanceNumber, amount: d.amount },
      })
      sendOk(res, r.rows[0], 201)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create advance', err)
    }
  },
)

// ─── Update advance (draft only) ────────────────────────────────────────────

employeeAdvancesRouter.put(
  '/:id',
  requirePermission('finance.advances.edit', 'edit'),
  async (req, res) => {
    try {
      const existing = await query(
        `SELECT status FROM employee_advances WHERE id=$1 AND company_id=$2`,
        [req.params['id'], req.auth!.companyId],
      )
      if (!existing.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Advance not found')
        return
      }
      if (existing.rows[0]['status'] !== 'draft') {
        sendError(res, 409, 'INVALID_STATUS', 'Only draft advances can be edited')
        return
      }
      const d = advanceSchema.parse(req.body)
      const r = await query(
        `UPDATE employee_advances SET
           employee_id=$1, employee_name=$2, purpose=$3, project_id=$4, cost_center_id=$5,
           currency_code=$6, fx_rate=$7, amount=$8, cash_account_id=$9, advance_account_id=$10,
           notes=$11, updated_at=NOW()
         WHERE id=$12 RETURNING *`,
        [
          d.employee_id,
          d.employee_name,
          d.purpose ?? null,
          d.project_id ?? null,
          d.cost_center_id ?? null,
          d.currency_code,
          d.fx_rate,
          d.amount,
          d.cash_account_id,
          d.advance_account_id,
          d.notes ?? null,
          req.params['id'],
        ],
      )
      sendOk(res, r.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update advance', err)
    }
  },
)

// ─── Submit advance ─────────────────────────────────────────────────────────

employeeAdvancesRouter.post(
  '/:id/submit',
  requirePermission('finance.advances.edit', 'edit'),
  async (req, res) => {
    try {
      const r = await query(
        `UPDATE employee_advances SET status='pending_approval', submitted_at=NOW(), updated_at=NOW()
         WHERE id=$1 AND company_id=$2 AND status='draft' RETURNING *`,
        [req.params['id'], req.auth!.companyId],
      )
      if (!r.rows[0]) {
        sendError(res, 409, 'INVALID_STATUS', 'Advance is not in draft status')
        return
      }
      sendOk(res, r.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to submit advance', err)
    }
  },
)

// ─── Approve advance (issues cash, posts journal) ───────────────────────────
//
// Single-step: approving an advance immediately disburses it and posts the
// issuance journal — no separate "pay" step, matching how vendor-invoice
// approval and journal posting already work in this system. Issuance lines
// deliberately carry no analytic_account_id/cost_center_id: journal_lines'
// trg_sync_project_costs trigger auto-inserts into project_cost_actuals for
// any line with a resolvable analytic_account_id, and issuance must NOT
// create project cost — only settlement does. Tagging the issuance line
// would double-count the same money as project cost twice.

employeeAdvancesRouter.post(
  '/:id/approve',
  requirePermission('finance.advances.approve', 'approve'),
  async (req, res) => {
    try {
      const result = await withTransaction(
        { companyId: req.auth!.companyId, userId: req.auth!.userId, role: req.auth!.role },
        async (client) => {
          const advRes = await client.query(
            `SELECT * FROM employee_advances WHERE id=$1 AND company_id=$2 AND status='pending_approval' FOR UPDATE`,
            [req.params['id'], req.auth!.companyId],
          )
          if (!advRes.rows[0]) return null
          const adv = advRes.rows[0] as Record<string, unknown>

          const jeRes = await client.query(
            `INSERT INTO journal_entries (company_id, entry_date, reference, description, status, source_type, source_id, created_by, posted_at, posted_by)
             VALUES ($1, CURRENT_DATE, $2, $3, 'posted', 'employee_advance_issuance', $4, $5, NOW(), $5)
             RETURNING id`,
            [
              req.auth!.companyId,
              adv['advance_number'],
              `Employee advance issued: ${adv['employee_name'] as string}`,
              adv['id'],
              req.auth!.userId,
            ],
          )
          const jeId = jeRes.rows[0]!.id as string
          const amountCompanyCurrency = (adv['amount'] as number) * (adv['fx_rate'] as number)

          await client.query(
            `INSERT INTO journal_lines (journal_entry_id, account_id, description, debit, credit, currency_code, fx_rate, amount_company_currency)
             VALUES ($1,$2,$3,$4,0,$5,$6,$7)`,
            [
              jeId,
              adv['advance_account_id'],
              `Advance ${adv['advance_number'] as string}`,
              adv['amount'],
              adv['currency_code'],
              adv['fx_rate'],
              amountCompanyCurrency,
            ],
          )
          await client.query(
            `INSERT INTO journal_lines (journal_entry_id, account_id, description, debit, credit, currency_code, fx_rate, amount_company_currency)
             VALUES ($1,$2,$3,0,$4,$5,$6,$7)`,
            [
              jeId,
              adv['cash_account_id'],
              `Advance ${adv['advance_number'] as string}`,
              adv['amount'],
              adv['currency_code'],
              adv['fx_rate'],
              amountCompanyCurrency,
            ],
          )

          const updated = await client.query(
            `UPDATE employee_advances SET status='approved', approved_by=$1, approved_at=NOW(), journal_entry_id=$2, updated_at=NOW()
             WHERE id=$3 RETURNING *`,
            [req.auth!.userId, jeId, req.params['id']],
          )
          return updated.rows[0]
        },
      )
      if (!result) {
        sendError(res, 409, 'INVALID_STATUS', 'Advance is not pending approval')
        return
      }
      await logAudit({
        companyId: req.auth!.companyId,
        userId: req.auth!.userId,
        action: 'UPDATE',
        tableName: 'employee_advances',
        recordId: req.params['id'],
        newValues: { status: 'approved' },
      })
      sendOk(res, result)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to approve advance', err)
    }
  },
)

// ─── Reject advance ─────────────────────────────────────────────────────────

employeeAdvancesRouter.post(
  '/:id/reject',
  requirePermission('finance.advances.approve', 'approve'),
  async (req, res) => {
    const schema = z.object({ reason: z.string().min(1) })
    try {
      const { reason } = schema.parse(req.body)
      const r = await query(
        `UPDATE employee_advances SET status='rejected', rejected_by=$1, rejected_at=NOW(), rejection_reason=$2, updated_at=NOW()
         WHERE id=$3 AND company_id=$4 AND status='pending_approval' RETURNING *`,
        [req.auth!.userId, reason, req.params['id'], req.auth!.companyId],
      )
      if (!r.rows[0]) {
        sendError(res, 409, 'INVALID_STATUS', 'Advance is not pending approval')
        return
      }
      sendOk(res, r.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to reject advance', err)
    }
  },
)

// ─── Void advance (reverses issuance journal, only if untouched) ───────────
//
// Only reachable from 'approved' with nothing settled or returned yet —
// once any money has moved against the advance, correcting it means a
// return or a settlement adjustment, not erasing the issuance. Posts a
// compensating reversal entry (debit/credit swapped, source_type
// 'cancellation') rather than editing or deleting the original journal,
// matching journals.ts's generic /:id/cancel reversal pattern.

employeeAdvancesRouter.post(
  '/:id/void',
  requirePermission('finance.advances.approve', 'approve'),
  async (req, res) => {
    const schema = z.object({ reason: z.string().min(1) })
    try {
      const { reason } = schema.parse(req.body)
      const result = await withTransaction(
        { companyId: req.auth!.companyId, userId: req.auth!.userId, role: req.auth!.role },
        async (client) => {
          const advRes = await client.query(
            `SELECT * FROM employee_advances WHERE id=$1 AND company_id=$2 AND status='approved' FOR UPDATE`,
            [req.params['id'], req.auth!.companyId],
          )
          if (!advRes.rows[0]) return { error: 'INVALID_STATUS' as const }
          const adv = advRes.rows[0] as Record<string, unknown>

          if (
            parseFloat(String(adv['settled_amount'])) > 0 ||
            parseFloat(String(adv['returned_amount'])) > 0
          ) {
            return { error: 'HAS_ACTIVITY' as const }
          }
          if (!adv['journal_entry_id']) return { error: 'INVALID_STATUS' as const }

          const origLines = await client.query(
            `SELECT * FROM journal_lines WHERE journal_entry_id=$1`,
            [adv['journal_entry_id']],
          )

          const revRes = await client.query(
            `INSERT INTO journal_entries (company_id, entry_date, reference, description, status, source_type, source_id, created_by, posted_at, posted_by)
             VALUES ($1, CURRENT_DATE, $2, $3, 'posted', 'cancellation', $4, $5, NOW(), $5)
             RETURNING id`,
            [
              req.auth!.companyId,
              `REV-${adv['advance_number'] as string}`,
              `Void of advance ${adv['advance_number'] as string}: ${reason}`,
              adv['journal_entry_id'],
              req.auth!.userId,
            ],
          )
          const revId = revRes.rows[0]!.id as string

          for (const line of origLines.rows as Record<string, unknown>[]) {
            await client.query(
              `INSERT INTO journal_lines (journal_entry_id, account_id, analytic_account_id, cost_center_id, description, debit, credit, currency_code, fx_rate, amount_company_currency)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
              [
                revId,
                line['account_id'],
                line['analytic_account_id'],
                line['cost_center_id'],
                line['description'],
                line['credit'],
                line['debit'],
                line['currency_code'],
                line['fx_rate'],
                line['amount_company_currency'],
              ],
            )
          }

          await client.query(`UPDATE journal_entries SET status='cancelled', updated_at=NOW() WHERE id=$1`, [
            adv['journal_entry_id'],
          ])

          const updated = await client.query(
            `UPDATE employee_advances SET status='cancelled', voided_by=$1, voided_at=NOW(), void_reason=$2, updated_at=NOW()
             WHERE id=$3 RETURNING *`,
            [req.auth!.userId, reason, req.params['id']],
          )
          return { advance: updated.rows[0] }
        },
      )
      if ('error' in result) {
        const messages: Record<string, string> = {
          INVALID_STATUS: 'Advance is not in a voidable state',
          HAS_ACTIVITY: 'Cannot void an advance that already has settlements or returns',
        }
        sendError(res, result.error === 'INVALID_STATUS' ? 409 : 422, result.error, messages[result.error]!)
        return
      }
      await logAudit({
        companyId: req.auth!.companyId,
        userId: req.auth!.userId,
        action: 'UPDATE',
        tableName: 'employee_advances',
        recordId: req.params['id'],
        newValues: { status: 'cancelled', void_reason: reason },
      })
      sendOk(res, result.advance)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to void advance', err)
    }
  },
)

// ─── Per-advance ledger (chronological running balance) ────────────────────
//
// Unions the issuance itself with every approved settlement/return, ordered
// by approved_at. Not journal_lines-based like AccountLedger.tsx's GL
// ledger — there's no per-employee analytic dimension in this schema to key
// that off, so this reads straight from the three advance tables instead,
// reusing only the window-function running-balance technique.

employeeAdvancesRouter.get(
  '/:id/ledger',
  requirePermission('finance.advances.view', 'view'),
  async (req, res) => {
    try {
      const adv = await query(`SELECT id FROM employee_advances WHERE id=$1 AND company_id=$2`, [
        req.params['id'],
        req.auth!.companyId,
      ])
      if (!adv.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Advance not found')
        return
      }
      const r = await query(
        `WITH events AS (
           SELECT 'issuance' AS type, a.id AS ref_id, a.advance_number AS reference,
                  a.approved_at AS date, a.amount AS amount, NULL::TEXT AS description
           FROM employee_advances a WHERE a.id=$1 AND a.approved_at IS NOT NULL
           UNION ALL
           SELECT 'settlement', s.id, s.settlement_number, s.approved_at, -s.total_amount, s.description
           FROM advance_settlements s WHERE s.advance_id=$1 AND s.status='approved'
           UNION ALL
           SELECT 'return', ret.id, ret.return_number, ret.approved_at, -ret.amount, ret.description
           FROM advance_returns ret WHERE ret.advance_id=$1 AND ret.status='approved'
         )
         SELECT *, SUM(amount) OVER (ORDER BY date, ref_id ROWS UNBOUNDED PRECEDING) AS running_balance
         FROM events ORDER BY date, ref_id`,
        [req.params['id']],
      )
      sendOk(res, r.rows)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load ledger', err)
    }
  },
)

// ─── Company-wide outstanding dashboard ─────────────────────────────────────

employeeAdvancesRouter.get(
  '/dashboard',
  requirePermission('finance.advances.view', 'view'),
  async (req, res) => {
    try {
      const [advances, byEmployee] = await Promise.all([
        query(
          `SELECT id, advance_number, employee_id, employee_name, amount, settled_amount,
                  returned_amount, outstanding_amount, currency_code, status, approved_at
           FROM employee_advances
           WHERE company_id=$1 AND status IN ('approved','partially_settled')
           ORDER BY outstanding_amount DESC`,
          [req.auth!.companyId],
        ),
        query(
          `SELECT employee_id, employee_name,
                  COUNT(*)::INT AS advance_count,
                  COALESCE(SUM(amount),0) AS total_issued,
                  COALESCE(SUM(settled_amount),0) AS total_settled,
                  COALESCE(SUM(returned_amount),0) AS total_returned,
                  COALESCE(SUM(outstanding_amount),0) AS total_outstanding
           FROM employee_advances
           WHERE company_id=$1 AND status IN ('approved','partially_settled')
           GROUP BY employee_id, employee_name
           ORDER BY total_outstanding DESC`,
          [req.auth!.companyId],
        ),
      ])
      sendOk(res, { advances: advances.rows, by_employee: byEmployee.rows })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load dashboard', err)
    }
  },
)

// ═════════════════════════════════════════════════════════════════════════
// Settlements
// ═════════════════════════════════════════════════════════════════════════

const settlementLineSchema = z.object({
  line_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gl_account_id: z.string().uuid(),
  category_id: z.string().uuid().optional(),
  category_name: z.string().optional(),
  project_id: z.string().uuid().optional(),
  cost_center_id: z.string().uuid(),
  supplier_id: z.string().uuid().optional(),
  description: z.string().min(1),
  amount: z.coerce.number().positive(),
  receipt_url: z.string().url().optional(),
  notes: z.string().optional(),
})
// Settlement lines are NOT given their own currency_code/fx_rate input —
// Phase 1 constrains every line to the parent advance's currency (copied
// server-side at insert time). Cross-currency settlement lines are a real
// but narrow edge case not worth the complexity until there's an actual need.

const settlementSchema = z.object({
  advance_id: z.string().uuid(),
  settlement_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(settlementLineSchema).min(1),
})

// ─── List settlements ───────────────────────────────────────────────────────

employeeAdvancesRouter.get(
  '/settlements',
  requirePermission('finance.advances.view', 'view'),
  async (req, res) => {
    const schema = z.object({
      advance_id: z.string().uuid().optional(),
      status: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(100),
      offset: z.coerce.number().int().min(0).default(0),
    })
    try {
      const { advance_id, status, limit, offset } = schema.parse(req.query)
      const conditions: string[] = ['s.company_id = $1']
      const params: unknown[] = [req.auth!.companyId]
      let p = 2
      if (advance_id) {
        conditions.push(`s.advance_id = $${p++}`)
        params.push(advance_id)
      }
      if (status) {
        conditions.push(`s.status = $${p++}`)
        params.push(status)
      }
      const r = await query(
        `SELECT s.*, a.advance_number
         FROM advance_settlements s
         JOIN employee_advances a ON a.id = s.advance_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY s.created_at DESC
         LIMIT $${p} OFFSET $${p + 1}`,
        [...params, limit, offset],
      )
      sendOk(res, r.rows)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load settlements', err)
    }
  },
)

// ─── Get settlement with lines ──────────────────────────────────────────────

employeeAdvancesRouter.get(
  '/settlements/:id',
  requirePermission('finance.advances.view', 'view'),
  async (req, res) => {
    try {
      const s = await query(
        `SELECT s.*, a.advance_number, a.currency_code AS advance_currency_code
         FROM advance_settlements s
         JOIN employee_advances a ON a.id = s.advance_id
         WHERE s.id=$1 AND s.company_id=$2`,
        [req.params['id'], req.auth!.companyId],
      )
      if (!s.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Settlement not found')
        return
      }
      const lines = await query(
        `SELECT sl.*, coa.code AS account_code, coa.name AS account_name,
                p.name AS project_name, cc.name AS cost_center_name, v.name AS supplier_name
         FROM advance_settlement_lines sl
         LEFT JOIN chart_of_accounts coa ON coa.id = sl.gl_account_id
         LEFT JOIN projects p ON p.id = sl.project_id
         LEFT JOIN cost_centers cc ON cc.id = sl.cost_center_id
         LEFT JOIN vendors v ON v.id = sl.supplier_id
         WHERE sl.settlement_id=$1 ORDER BY sl.line_date, sl.id`,
        [req.params['id']],
      )
      sendOk(res, { ...s.rows[0], lines: lines.rows })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load settlement', err)
    }
  },
)

// ─── Create settlement (draft) ──────────────────────────────────────────────

employeeAdvancesRouter.post(
  '/settlements',
  requirePermission('finance.advances.edit', 'edit'),
  async (req, res) => {
    try {
      const d = settlementSchema.parse(req.body)
      const adv = await query(
        `SELECT id, employee_id, employee_name, currency_code, fx_rate, status FROM employee_advances WHERE id=$1 AND company_id=$2`,
        [d.advance_id, req.auth!.companyId],
      )
      if (!adv.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Advance not found')
        return
      }
      const advance = adv.rows[0] as Record<string, unknown>
      if (!['approved', 'partially_settled'].includes(advance['status'] as string)) {
        sendError(res, 409, 'INVALID_STATUS', 'Advance must be approved before it can be settled')
        return
      }

      const totalAmount = d.lines.reduce((sum, l) => sum + l.amount, 0)
      const settlementNumber = await nextDocumentNumber(
        req.auth!.companyId,
        'advance_settlement',
        'SET',
      )

      const result = await withTransaction(
        { companyId: req.auth!.companyId, userId: req.auth!.userId, role: req.auth!.role },
        async (client) => {
          const sRes = await client.query(
            `INSERT INTO advance_settlements
               (company_id, settlement_number, advance_id, employee_id, employee_name, settlement_date,
                description, currency_code, total_amount, notes, created_by)
             VALUES ($1,$2,$3,$4,$5,COALESCE($6,CURRENT_DATE),$7,$8,$9,$10,$11) RETURNING *`,
            [
              req.auth!.companyId,
              settlementNumber,
              d.advance_id,
              advance['employee_id'],
              advance['employee_name'],
              d.settlement_date ?? null,
              d.description ?? null,
              advance['currency_code'],
              totalAmount,
              d.notes ?? null,
              req.auth!.userId,
            ],
          )
          const settlement = sRes.rows[0]!
          const lines = []
          for (const line of d.lines) {
            const lr = await client.query(
              `INSERT INTO advance_settlement_lines
                 (settlement_id, company_id, line_date, gl_account_id, category_id, category_name,
                  project_id, cost_center_id, supplier_id, description, amount, currency_code, fx_rate,
                  receipt_url, notes)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
              [
                settlement.id,
                req.auth!.companyId,
                line.line_date,
                line.gl_account_id,
                line.category_id ?? null,
                line.category_name ?? null,
                line.project_id ?? null,
                line.cost_center_id,
                line.supplier_id ?? null,
                line.description,
                line.amount,
                advance['currency_code'],
                advance['fx_rate'],
                line.receipt_url ?? null,
                line.notes ?? null,
              ],
            )
            lines.push(lr.rows[0])
          }
          return { ...settlement, lines }
        },
      )
      await logAudit({
        companyId: req.auth!.companyId,
        userId: req.auth!.userId,
        action: 'INSERT',
        tableName: 'advance_settlements',
        recordId: result.id as string,
        newValues: { settlement_number: settlementNumber, total_amount: totalAmount },
      })
      sendOk(res, result, 201)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create settlement', err)
    }
  },
)

// ─── Update settlement (draft only) ─────────────────────────────────────────

employeeAdvancesRouter.put(
  '/settlements/:id',
  requirePermission('finance.advances.edit', 'edit'),
  async (req, res) => {
    try {
      const existing = await query(
        `SELECT s.status, a.currency_code AS advance_currency_code, a.fx_rate AS advance_fx_rate
         FROM advance_settlements s JOIN employee_advances a ON a.id = s.advance_id
         WHERE s.id=$1 AND s.company_id=$2`,
        [req.params['id'], req.auth!.companyId],
      )
      if (!existing.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Settlement not found')
        return
      }
      if (existing.rows[0]['status'] !== 'draft') {
        sendError(res, 409, 'INVALID_STATUS', 'Only draft settlements can be edited')
        return
      }
      const advanceCurrency = existing.rows[0]['advance_currency_code']
      const advanceFxRate = existing.rows[0]['advance_fx_rate']

      const d = settlementSchema.parse(req.body)
      const totalAmount = d.lines.reduce((sum, l) => sum + l.amount, 0)

      const result = await withTransaction(
        { companyId: req.auth!.companyId, userId: req.auth!.userId, role: req.auth!.role },
        async (client) => {
          const sRes = await client.query(
            `UPDATE advance_settlements SET
               settlement_date=COALESCE($1, settlement_date), description=$2, total_amount=$3, notes=$4, updated_at=NOW()
             WHERE id=$5 RETURNING *`,
            [
              d.settlement_date ?? null,
              d.description ?? null,
              totalAmount,
              d.notes ?? null,
              req.params['id'],
            ],
          )
          await client.query(`DELETE FROM advance_settlement_lines WHERE settlement_id=$1`, [
            req.params['id'],
          ])
          const lines = []
          for (const line of d.lines) {
            const lr = await client.query(
              `INSERT INTO advance_settlement_lines
                 (settlement_id, company_id, line_date, gl_account_id, category_id, category_name,
                  project_id, cost_center_id, supplier_id, description, amount, currency_code, fx_rate,
                  receipt_url, notes)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
              [
                req.params['id'],
                req.auth!.companyId,
                line.line_date,
                line.gl_account_id,
                line.category_id ?? null,
                line.category_name ?? null,
                line.project_id ?? null,
                line.cost_center_id,
                line.supplier_id ?? null,
                line.description,
                line.amount,
                advanceCurrency,
                advanceFxRate,
                line.receipt_url ?? null,
                line.notes ?? null,
              ],
            )
            lines.push(lr.rows[0])
          }
          return { ...sRes.rows[0], lines }
        },
      )
      sendOk(res, result)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update settlement', err)
    }
  },
)

// ─── Submit settlement ───────────────────────────────────────────────────────

employeeAdvancesRouter.post(
  '/settlements/:id/submit',
  requirePermission('finance.advances.edit', 'edit'),
  async (req, res) => {
    try {
      const existing = await query(
        `SELECT s.total_amount, a.outstanding_amount
         FROM advance_settlements s JOIN employee_advances a ON a.id = s.advance_id
         WHERE s.id=$1 AND s.company_id=$2 AND s.status='draft'`,
        [req.params['id'], req.auth!.companyId],
      )
      if (!existing.rows[0]) {
        sendError(res, 409, 'INVALID_STATUS', 'Settlement is not in draft status')
        return
      }
      // Advisory check — the authoritative, race-safe check happens again
      // under a row lock at approval time.
      if (
        parseFloat(existing.rows[0]['total_amount']) >
        parseFloat(existing.rows[0]['outstanding_amount'])
      ) {
        sendError(
          res,
          422,
          'OVER_SETTLEMENT',
          'Settlement total exceeds the advance’s outstanding balance',
        )
        return
      }
      const r = await query(
        `UPDATE advance_settlements SET status='submitted', submitted_at=NOW(), updated_at=NOW()
         WHERE id=$1 AND company_id=$2 AND status='draft' RETURNING *`,
        [req.params['id'], req.auth!.companyId],
      )
      sendOk(res, r.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to submit settlement', err)
    }
  },
)

// ─── Approve settlement (posts journal, reduces outstanding) ───────────────
//
// Locks the parent advance for the duration of the transaction so two
// settlements submitted near-simultaneously against the same advance can't
// both pass the outstanding-balance check before either commits.

employeeAdvancesRouter.post(
  '/settlements/:id/approve',
  requirePermission('finance.advances.approve', 'approve'),
  async (req, res) => {
    try {
      const result = await withTransaction(
        { companyId: req.auth!.companyId, userId: req.auth!.userId, role: req.auth!.role },
        async (client) => {
          const sRes = await client.query(
            `SELECT s.*, a.advance_account_id, a.currency_code AS advance_currency_code,
                    a.fx_rate AS advance_fx_rate, a.amount AS advance_amount,
                    a.settled_amount, a.returned_amount, a.outstanding_amount, a.id AS adv_id
             FROM advance_settlements s
             JOIN employee_advances a ON a.id = s.advance_id
             WHERE s.id=$1 AND s.company_id=$2 AND s.status='submitted' AND a.status IN ('approved','partially_settled')
             FOR UPDATE OF a`,
            [req.params['id'], req.auth!.companyId],
          )
          if (!sRes.rows[0]) return { error: 'INVALID_STATUS' as const }
          const s = sRes.rows[0] as Record<string, unknown>

          if (parseFloat(String(s['total_amount'])) > parseFloat(String(s['outstanding_amount']))) {
            return { error: 'OVER_SETTLEMENT' as const }
          }

          const lines = await client.query(
            `SELECT sl.*, p.analytic_account_id AS project_analytic_account_id
             FROM advance_settlement_lines sl
             LEFT JOIN projects p ON p.id = sl.project_id
             WHERE sl.settlement_id=$1`,
            [req.params['id']],
          )
          for (const line of lines.rows as Record<string, unknown>[]) {
            if (line['project_id'] && !line['project_analytic_account_id']) {
              return { error: 'PROJECT_MISSING_ANALYTIC_ACCOUNT' as const, lineId: line['id'] }
            }
          }

          const jeRes = await client.query(
            `INSERT INTO journal_entries (company_id, entry_date, reference, description, status, source_type, source_id, created_by, posted_at, posted_by)
             VALUES ($1, CURRENT_DATE, $2, $3, 'posted', 'advance_settlement', $4, $5, NOW(), $5)
             RETURNING id`,
            [
              req.auth!.companyId,
              s['settlement_number'],
              `Advance settlement: ${s['employee_name'] as string}`,
              s['id'],
              req.auth!.userId,
            ],
          )
          const jeId = jeRes.rows[0]!.id as string

          for (const line of lines.rows as Record<string, unknown>[]) {
            const amt = parseFloat(String(line['amount']))
            const fxRate = parseFloat(String(line['fx_rate']))
            await client.query(
              `INSERT INTO journal_lines (journal_entry_id, account_id, analytic_account_id, cost_center_id, description, debit, credit, currency_code, fx_rate, amount_company_currency)
               VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,$9)`,
              [
                jeId,
                line['gl_account_id'],
                line['project_analytic_account_id'] ?? null,
                line['cost_center_id'],
                line['description'],
                amt,
                line['currency_code'],
                fxRate,
                amt * fxRate,
              ],
            )
          }

          const totalAmount = parseFloat(String(s['total_amount']))
          const advFxRate = parseFloat(String(s['advance_fx_rate']))
          await client.query(
            `INSERT INTO journal_lines (journal_entry_id, account_id, description, debit, credit, currency_code, fx_rate, amount_company_currency)
             VALUES ($1,$2,$3,0,$4,$5,$6,$7)`,
            [
              jeId,
              s['advance_account_id'],
              `Settlement ${s['settlement_number'] as string}`,
              totalAmount,
              s['advance_currency_code'],
              advFxRate,
              totalAmount * advFxRate,
            ],
          )

          const updatedSettlement = await client.query(
            `UPDATE advance_settlements SET status='approved', approved_by=$1, approved_at=NOW(), journal_entry_id=$2, updated_at=NOW()
             WHERE id=$3 RETURNING *`,
            [req.auth!.userId, jeId, req.params['id']],
          )

          const newSettled = parseFloat(String(s['settled_amount'])) + totalAmount
          const newReturned = parseFloat(String(s['returned_amount']))
          const advanceAmount = parseFloat(String(s['advance_amount']))
          const newStatus = newSettled + newReturned >= advanceAmount ? 'settled' : 'partially_settled'
          await client.query(
            `UPDATE employee_advances SET settled_amount=$1, status=$2, updated_at=NOW() WHERE id=$3`,
            [newSettled, newStatus, s['adv_id']],
          )

          return { settlement: updatedSettlement.rows[0] }
        },
      )
      if ('error' in result) {
        const messages: Record<string, string> = {
          INVALID_STATUS: 'Settlement is not in submitted status',
          OVER_SETTLEMENT: 'Settlement total exceeds the advance’s outstanding balance',
          PROJECT_MISSING_ANALYTIC_ACCOUNT:
            'A project-tagged line references a project with no analytic account configured — set one before this line can post',
        }
        const statusCode = result.error === 'INVALID_STATUS' ? 409 : 422
        sendError(res, statusCode, result.error, messages[result.error]!)
        return
      }
      await logAudit({
        companyId: req.auth!.companyId,
        userId: req.auth!.userId,
        action: 'UPDATE',
        tableName: 'advance_settlements',
        recordId: req.params['id'],
        newValues: { status: 'approved' },
      })
      sendOk(res, result.settlement)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to approve settlement', err)
    }
  },
)

// ─── Reject settlement ───────────────────────────────────────────────────────

employeeAdvancesRouter.post(
  '/settlements/:id/reject',
  requirePermission('finance.advances.approve', 'approve'),
  async (req, res) => {
    const schema = z.object({ reason: z.string().min(1) })
    try {
      const { reason } = schema.parse(req.body)
      const r = await query(
        `UPDATE advance_settlements SET status='rejected', rejected_by=$1, rejected_at=NOW(), rejection_reason=$2, updated_at=NOW()
         WHERE id=$3 AND company_id=$4 AND status='submitted' RETURNING *`,
        [req.auth!.userId, reason, req.params['id'], req.auth!.companyId],
      )
      if (!r.rows[0]) {
        sendError(res, 409, 'INVALID_STATUS', 'Settlement is not in submitted status')
        return
      }
      sendOk(res, r.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to reject settlement', err)
    }
  },
)

// ═════════════════════════════════════════════════════════════════════════
// Returns
// ═════════════════════════════════════════════════════════════════════════
//
// Simpler lifecycle than settlements: draft -> approved (posts journal) or
// cancelled, no intermediate 'submitted' state — advance_returns.status's
// CHECK constraint only allows those three values. A return has no line
// items either: it's a single amount going back to a single cash account.

const returnSchema = z.object({
  advance_id: z.string().uuid(),
  return_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  amount: z.coerce.number().positive(),
  cash_account_id: z.string().uuid().optional(),
  description: z.string().optional(),
})

// ─── List returns ────────────────────────────────────────────────────────

employeeAdvancesRouter.get(
  '/returns',
  requirePermission('finance.advances.view', 'view'),
  async (req, res) => {
    const schema = z.object({
      advance_id: z.string().uuid().optional(),
      status: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(100),
      offset: z.coerce.number().int().min(0).default(0),
    })
    try {
      const { advance_id, status, limit, offset } = schema.parse(req.query)
      const conditions: string[] = ['r.company_id = $1']
      const params: unknown[] = [req.auth!.companyId]
      let p = 2
      if (advance_id) {
        conditions.push(`r.advance_id = $${p++}`)
        params.push(advance_id)
      }
      if (status) {
        conditions.push(`r.status = $${p++}`)
        params.push(status)
      }
      const r = await query(
        `SELECT r.*, a.advance_number, a.employee_name
         FROM advance_returns r
         JOIN employee_advances a ON a.id = r.advance_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY r.created_at DESC
         LIMIT $${p} OFFSET $${p + 1}`,
        [...params, limit, offset],
      )
      sendOk(res, r.rows)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load returns', err)
    }
  },
)

// ─── Get return ──────────────────────────────────────────────────────────

employeeAdvancesRouter.get(
  '/returns/:id',
  requirePermission('finance.advances.view', 'view'),
  async (req, res) => {
    try {
      const r = await query(
        `SELECT r.*, a.advance_number, a.employee_name
         FROM advance_returns r
         JOIN employee_advances a ON a.id = r.advance_id
         WHERE r.id=$1 AND r.company_id=$2`,
        [req.params['id'], req.auth!.companyId],
      )
      if (!r.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Return not found')
        return
      }
      sendOk(res, r.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load return', err)
    }
  },
)

// ─── Create return (draft) ──────────────────────────────────────────────

employeeAdvancesRouter.post(
  '/returns',
  requirePermission('finance.advances.edit', 'edit'),
  async (req, res) => {
    try {
      const d = returnSchema.parse(req.body)
      const adv = await query(
        `SELECT id, cash_account_id, status, outstanding_amount FROM employee_advances WHERE id=$1 AND company_id=$2`,
        [d.advance_id, req.auth!.companyId],
      )
      if (!adv.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Advance not found')
        return
      }
      const advance = adv.rows[0] as Record<string, unknown>
      if (!['approved', 'partially_settled'].includes(advance['status'] as string)) {
        sendError(res, 409, 'INVALID_STATUS', 'Advance must be approved before it can be returned against')
        return
      }
      // Advisory check — the authoritative, race-safe check happens again
      // under a row lock at approval time.
      if (d.amount > parseFloat(String(advance['outstanding_amount']))) {
        sendError(res, 422, 'OVER_RETURN', 'Return amount exceeds the advance’s outstanding balance')
        return
      }

      const returnNumber = await nextDocumentNumber(req.auth!.companyId, 'advance_return', 'RET')
      const r = await query(
        `INSERT INTO advance_returns
           (company_id, return_number, advance_id, return_date, amount, cash_account_id, description, created_by)
         VALUES ($1,$2,$3,COALESCE($4,CURRENT_DATE),$5,$6,$7,$8) RETURNING *`,
        [
          req.auth!.companyId,
          returnNumber,
          d.advance_id,
          d.return_date ?? null,
          d.amount,
          d.cash_account_id ?? advance['cash_account_id'],
          d.description ?? null,
          req.auth!.userId,
        ],
      )
      await logAudit({
        companyId: req.auth!.companyId,
        userId: req.auth!.userId,
        action: 'INSERT',
        tableName: 'advance_returns',
        recordId: r.rows[0]!['id'] as string,
        newValues: { return_number: returnNumber, amount: d.amount },
      })
      sendOk(res, r.rows[0], 201)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create return', err)
    }
  },
)

// ─── Update return (draft only) ─────────────────────────────────────────

employeeAdvancesRouter.put(
  '/returns/:id',
  requirePermission('finance.advances.edit', 'edit'),
  async (req, res) => {
    try {
      const existing = await query(
        `SELECT r.status, a.cash_account_id AS advance_cash_account_id, a.outstanding_amount
         FROM advance_returns r JOIN employee_advances a ON a.id = r.advance_id
         WHERE r.id=$1 AND r.company_id=$2`,
        [req.params['id'], req.auth!.companyId],
      )
      if (!existing.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Return not found')
        return
      }
      if (existing.rows[0]['status'] !== 'draft') {
        sendError(res, 409, 'INVALID_STATUS', 'Only draft returns can be edited')
        return
      }
      const d = returnSchema.parse(req.body)
      if (d.amount > parseFloat(existing.rows[0]['outstanding_amount'])) {
        sendError(res, 422, 'OVER_RETURN', 'Return amount exceeds the advance’s outstanding balance')
        return
      }
      const r = await query(
        `UPDATE advance_returns SET
           return_date=COALESCE($1, return_date), amount=$2, cash_account_id=$3, description=$4, updated_at=NOW()
         WHERE id=$5 RETURNING *`,
        [
          d.return_date ?? null,
          d.amount,
          d.cash_account_id ?? existing.rows[0]['advance_cash_account_id'],
          d.description ?? null,
          req.params['id'],
        ],
      )
      sendOk(res, r.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update return', err)
    }
  },
)

// ─── Approve return (posts journal, reduces outstanding) ───────────────────

employeeAdvancesRouter.post(
  '/returns/:id/approve',
  requirePermission('finance.advances.approve', 'approve'),
  async (req, res) => {
    try {
      const result = await withTransaction(
        { companyId: req.auth!.companyId, userId: req.auth!.userId, role: req.auth!.role },
        async (client) => {
          const rRes = await client.query(
            `SELECT ret.*, a.advance_account_id, a.currency_code AS advance_currency_code,
                    a.fx_rate AS advance_fx_rate, a.amount AS advance_amount,
                    a.settled_amount, a.returned_amount, a.outstanding_amount, a.id AS adv_id
             FROM advance_returns ret
             JOIN employee_advances a ON a.id = ret.advance_id
             WHERE ret.id=$1 AND ret.company_id=$2 AND ret.status='draft' AND a.status IN ('approved','partially_settled')
             FOR UPDATE OF a`,
            [req.params['id'], req.auth!.companyId],
          )
          if (!rRes.rows[0]) return { error: 'INVALID_STATUS' as const }
          const ret = rRes.rows[0] as Record<string, unknown>

          const amt = parseFloat(String(ret['amount']))
          if (amt > parseFloat(String(ret['outstanding_amount']))) {
            return { error: 'OVER_RETURN' as const }
          }

          const jeRes = await client.query(
            `INSERT INTO journal_entries (company_id, entry_date, reference, description, status, source_type, source_id, created_by, posted_at, posted_by)
             VALUES ($1, CURRENT_DATE, $2, $3, 'posted', 'advance_return', $4, $5, NOW(), $5)
             RETURNING id`,
            [
              req.auth!.companyId,
              ret['return_number'],
              `Advance return: ${ret['return_number'] as string}`,
              ret['id'],
              req.auth!.userId,
            ],
          )
          const jeId = jeRes.rows[0]!.id as string
          const fxRate = parseFloat(String(ret['advance_fx_rate']))
          const amountCompanyCurrency = amt * fxRate

          await client.query(
            `INSERT INTO journal_lines (journal_entry_id, account_id, description, debit, credit, currency_code, fx_rate, amount_company_currency)
             VALUES ($1,$2,$3,$4,0,$5,$6,$7)`,
            [
              jeId,
              ret['cash_account_id'],
              `Return ${ret['return_number'] as string}`,
              amt,
              ret['advance_currency_code'],
              fxRate,
              amountCompanyCurrency,
            ],
          )
          await client.query(
            `INSERT INTO journal_lines (journal_entry_id, account_id, description, debit, credit, currency_code, fx_rate, amount_company_currency)
             VALUES ($1,$2,$3,0,$4,$5,$6,$7)`,
            [
              jeId,
              ret['advance_account_id'],
              `Return ${ret['return_number'] as string}`,
              amt,
              ret['advance_currency_code'],
              fxRate,
              amountCompanyCurrency,
            ],
          )

          const updatedReturn = await client.query(
            `UPDATE advance_returns SET status='approved', approved_by=$1, approved_at=NOW(), journal_entry_id=$2, updated_at=NOW()
             WHERE id=$3 RETURNING *`,
            [req.auth!.userId, jeId, req.params['id']],
          )

          const newReturned = parseFloat(String(ret['returned_amount'])) + amt
          const newSettled = parseFloat(String(ret['settled_amount']))
          const advanceAmount = parseFloat(String(ret['advance_amount']))
          const newStatus = newSettled + newReturned >= advanceAmount ? 'settled' : 'partially_settled'
          await client.query(
            `UPDATE employee_advances SET returned_amount=$1, status=$2, updated_at=NOW() WHERE id=$3`,
            [newReturned, newStatus, ret['adv_id']],
          )

          return { ret: updatedReturn.rows[0] }
        },
      )
      if ('error' in result) {
        const messages: Record<string, string> = {
          INVALID_STATUS: 'Return is not in draft status',
          OVER_RETURN: 'Return amount exceeds the advance’s outstanding balance',
        }
        sendError(res, result.error === 'INVALID_STATUS' ? 409 : 422, result.error, messages[result.error]!)
        return
      }
      await logAudit({
        companyId: req.auth!.companyId,
        userId: req.auth!.userId,
        action: 'UPDATE',
        tableName: 'advance_returns',
        recordId: req.params['id'],
        newValues: { status: 'approved' },
      })
      sendOk(res, result.ret)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to approve return', err)
    }
  },
)

// ─── Cancel return (draft only) ─────────────────────────────────────────

employeeAdvancesRouter.post(
  '/returns/:id/cancel',
  requirePermission('finance.advances.edit', 'edit'),
  async (req, res) => {
    try {
      const r = await query(
        `UPDATE advance_returns SET status='cancelled', updated_at=NOW()
         WHERE id=$1 AND company_id=$2 AND status='draft' RETURNING *`,
        [req.params['id'], req.auth!.companyId],
      )
      if (!r.rows[0]) {
        sendError(res, 409, 'INVALID_STATUS', 'Return is not in draft status')
        return
      }
      sendOk(res, r.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to cancel return', err)
    }
  },
)
