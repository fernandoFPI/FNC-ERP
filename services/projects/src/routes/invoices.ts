import { Router } from 'express'
import type { IRouter } from 'express'
import { z } from 'zod'
import { pool, query, firstRowOrThrow, asyncHandler } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { getAuth } from '@fnc-erp/auth'
import {
  buildInvoiceLines,
  calculateLineAmounts,
  calculateInvoiceTotals,
  markSourcesInvoiced,
  BillingError,
  type BillingParams,
} from '@fnc-erp/billing'
import { sendOk, sendError, requireParam } from '../lib/errors.js'
import {
  INVOICE_HEADER_FLAG_FIELDS,
  INVOICE_HEADER_FLAG_LABELS,
  type InvoiceHeaderFlagField,
} from '../lib/invoiceHeaderFlags.js'
import { requirePermission } from '@fnc-erp/permissions'

export const invoicesRouter: IRouter = Router()

const COMPANY_PREFIXES: Record<string, string> = {
  '00000000-0000-0000-0000-000000000001': 'NYK',
  '00000000-0000-0000-0000-000000000002': 'NF',
  '00000000-0000-0000-0000-000000000003': 'AWC',
}

async function generateInvoiceNumber(companyId: string): Promise<string> {
  const prefix = COMPANY_PREFIXES[companyId] ?? 'GEN'
  const year = new Date().getFullYear()
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM project_invoices WHERE company_id=$1 AND invoice_number LIKE $2`,
    [companyId, `INV-${prefix}-${year}-%`],
  )
  const seq = parseInt(result.rows[0]?.['count'] ?? '0') + 1
  return `INV-${prefix}-${year}-${String(seq).padStart(4, '0')}`
}

function parseBillingParams(body: Record<string, unknown>): BillingParams {
  const p: BillingParams = {
    billing_method: body['billing_method'] as BillingParams['billing_method'],
  }
  if (body['display_mode'] !== undefined)
    p.display_mode = body['display_mode'] as 'summarised' | 'detailed'
  if (body['milestone_ids'] !== undefined) p.milestone_ids = body['milestone_ids'] as string[]
  if (body['progress_pct'] !== undefined) p.progress_pct = body['progress_pct'] as number
  if (body['previous_progress_pct'] !== undefined)
    p.previous_progress_pct = body['previous_progress_pct'] as number
  if (body['include_mos'] !== undefined) p.include_mos = body['include_mos'] as boolean
  if (body['include_pos'] !== undefined) p.include_pos = body['include_pos'] as boolean
  if (body['include_stock_issues'] !== undefined)
    p.include_stock_issues = body['include_stock_issues'] as boolean
  if (body['include_rental'] !== undefined) p.include_rental = body['include_rental'] as boolean
  if (body['default_margin_pct'] !== undefined)
    p.default_margin_pct = body['default_margin_pct'] as number
  return p
}

// GET /projects/invoices
invoicesRouter.get('/', requirePermission('projects.invoices.view', 'view'), async (req, res) => {
  try {
    const { project_id, contract_id, status } = req.query
    const page = Math.max(1, parseInt((req.query['page'] as string) || '1'))
    const limit = Math.min(100, parseInt((req.query['limit'] as string) || '20'))
    const offset = (page - 1) * limit
    let sql = `-- currency-safe: scoped to one invoice, which has one currency_code
               SELECT pi.*,
                      COALESCE((SELECT SUM(pip.amount) FROM project_invoice_payments pip WHERE pip.invoice_id=pi.id),0) AS total_paid
               FROM project_invoices pi WHERE pi.company_id=$1`
    const params: unknown[] = [getAuth(req).companyId]
    let idx = 2
    if (project_id) {
      sql += ` AND pi.project_id=$${idx++}`
      params.push(project_id)
    }
    if (contract_id) {
      sql += ` AND pi.contract_id=$${idx++}`
      params.push(contract_id)
    }
    if (status) {
      sql += ` AND pi.status=$${idx++}`
      params.push(status)
    }
    sql += ` ORDER BY pi.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`
    params.push(limit, offset)
    sendOk(res, (await query(sql, params)).rows)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch invoices', err)
  }
})

// GET /projects/invoices/:id
invoicesRouter.get(
  '/:id',
  requirePermission('projects.invoices.view', 'view'),
  async (req, res) => {
    try {
      const companyId = getAuth(req).companyId
      const id = requireParam(req, 'id')
      const invoice = await query('SELECT * FROM project_invoices WHERE id=$1 AND company_id=$2', [
        id,
        companyId,
      ])
      if (!invoice.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Invoice not found')
      const [lines, payments] = await Promise.all([
        query('SELECT * FROM project_invoice_lines WHERE invoice_id=$1 ORDER BY line_number', [id]),
        query('SELECT * FROM project_invoice_payments WHERE invoice_id=$1 ORDER BY payment_date', [
          id,
        ]),
      ])
      sendOk(res, { ...invoice.rows[0], lines: lines.rows, payments: payments.rows })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch invoice', err)
    }
  },
)

// POST /projects/invoices/preview — no DB writes
invoicesRouter.post(
  '/preview',
  requirePermission('projects.invoices.edit', 'edit'),
  async (req, res) => {
    try {
      const companyId = getAuth(req).companyId
      const body = req.body as Record<string, unknown>
      const contractId = body['contract_id'] as string

      const contract = await query(
        'SELECT * FROM project_contracts WHERE id=$1 AND company_id=$2',
        [contractId, companyId],
      )
      if (!contract.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Contract not found')
      const c = contract.rows[0] as Record<string, unknown>

      const client = await pool.connect()
      try {
        const ctx = {
          client,
          contractId,
          companyId,
          projectId: c['project_id'] as string,
          userId: getAuth(req).userId,
        }
        const params = parseBillingParams(body)
        const rawLines = await buildInvoiceLines(ctx, params)
        const calculatedLines = rawLines.map((l) => ({ ...l, ...calculateLineAmounts(l) }))
        const totals = calculateInvoiceTotals(
          calculatedLines,
          parseFloat(c['retention_pct'] as string),
        )
        sendOk(res, { lines: calculatedLines, totals })
      } finally {
        client.release()
      }
    } catch (err) {
      if (err instanceof BillingError) return sendError(res, 409, err.code, err.message)
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to preview invoice', err)
    }
  },
)

// POST /projects/invoices — create invoice
invoicesRouter.post('/', requirePermission('projects.invoices.edit', 'edit'), async (req, res) => {
  try {
    const companyId = getAuth(req).companyId
    const userId = getAuth(req).userId
    const body = req.body as Record<string, unknown>
    const contractId = body['contract_id'] as string
    const invoiceDate = body['invoice_date'] as string
    const displayMode = (body['display_mode'] as 'summarised' | 'detailed') ?? 'summarised'
    const lineOverrides =
      (body['line_overrides'] as Array<{
        source_type: string
        source_id?: string
        margin_pct?: number
        description?: string
      }>) ?? []

    const contract = await query('SELECT * FROM project_contracts WHERE id=$1 AND company_id=$2', [
      contractId,
      companyId,
    ])
    if (!contract.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Contract not found')
    const c = contract.rows[0] as Record<string, unknown>
    const paymentTermsDays = parseInt(c['payment_terms_days'] as string)
    const retentionPct = parseFloat(c['retention_pct'] as string)

    const dueDate = new Date(invoiceDate)
    dueDate.setDate(dueDate.getDate() + paymentTermsDays)

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const ctx = {
        client,
        contractId,
        companyId,
        projectId: c['project_id'] as string,
        userId,
      }
      const params = parseBillingParams(body)
      let rawLines = await buildInvoiceLines(ctx, params)

      // Apply user overrides
      rawLines = rawLines.map((line) => {
        const override = lineOverrides.find(
          (o) => o.source_type === line.source_type && o.source_id === line.source_id,
        )
        if (!override) return line
        return {
          ...line,
          margin_pct: override.margin_pct ?? line.margin_pct,
          description: override.description ?? line.description,
        }
      })

      const calculatedLines = rawLines.map((l) => ({ ...l, ...calculateLineAmounts(l) }))
      const totals = calculateInvoiceTotals(calculatedLines, retentionPct)
      const invoiceNumber = await generateInvoiceNumber(companyId)
      const billingMethod = params.billing_method

      const invoiceResult = await client.query<{ id: string }>(
        `INSERT INTO project_invoices
           (contract_id, project_id, company_id, invoice_number, billing_method, display_mode,
            progress_pct, previous_progress_pct,
            subtotal, margin_total, gross_total, retention_amount, net_payable, currency_code,
            invoice_date, due_date, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
        [
          contractId,
          c['project_id'],
          companyId,
          invoiceNumber,
          billingMethod,
          displayMode,
          params.progress_pct ?? null,
          params.previous_progress_pct ?? null,
          totals.subtotal,
          totals.margin_total,
          totals.gross_total,
          totals.retention_amount,
          totals.net_payable,
          c['currency_code'],
          invoiceDate,
          dueDate.toISOString().slice(0, 10),
          userId,
        ],
      )
      const invoice = firstRowOrThrow(invoiceResult)
      const invoiceId = invoice['id'] as string

      for (const [i, l] of calculatedLines.entries()) {
        await client.query(
          `INSERT INTO project_invoice_lines
             (invoice_id, line_number, description, source_type, source_id,
              mo_display_mode, qty, unit_cost, subtotal, margin_pct, margin_amount,
              line_total, currency_code, mo_components)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
            invoiceId,
            i + 1,
            l.description,
            l.source_type,
            l.source_id ?? null,
            l.mo_display_mode ?? 'summarised',
            l.qty,
            l.unit_cost,
            l.subtotal,
            l.margin_pct,
            l.margin_amount,
            l.line_total,
            l.currency_code,
            l.mo_components ? JSON.stringify(l.mo_components) : null,
          ],
        )
      }

      await client.query('COMMIT')
      await logAudit({
        companyId,
        userId,
        action: 'CREATE',
        tableName: 'project_invoices',
        recordId: invoiceId,
      })
      sendOk(res, { ...invoice, lines: calculatedLines, totals }, 201)
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    if (err instanceof BillingError) return sendError(res, 409, err.code, err.message)
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create invoice', err)
  }
})

// POST /projects/invoices/:id/submit-for-review
invoicesRouter.post(
  '/:id/submit-for-review',
  requirePermission('projects.invoices.edit', 'edit'),
  async (req, res) => {
    try {
      const id = requireParam(req, 'id')
      const companyId = getAuth(req).companyId
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await client.query(
          `UPDATE project_invoices SET status='review', updated_at=NOW()
           WHERE id=$1 AND company_id=$2 AND status='draft' RETURNING id`,
          [id, companyId],
        )
        if (!result.rows[0]) {
          await client.query('ROLLBACK')
          sendError(res, 409, 'INVALID_STATUS', 'Only draft invoices can be submitted for review')
          return
        }
        // Submitting again is what "addresses" every flag left by an earlier rejection (migration
        // 313); the approver still confirms each one (resolve-flag below).
        await client.query(
          `UPDATE project_invoice_lines SET flag_addressed_at=NOW()
           WHERE invoice_id=$1 AND flagged_at IS NOT NULL
             AND flag_resolved_at IS NULL AND flag_addressed_at IS NULL`,
          [id],
        )
        await client.query(
          `UPDATE project_invoice_header_flags SET flag_addressed_at=NOW()
           WHERE invoice_id=$1 AND flag_resolved_at IS NULL AND flag_addressed_at IS NULL`,
          [id],
        )
        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }
      sendOk(res, { id, status: 'review' })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Action failed', err)
    }
  },
)

// POST /projects/invoices/:id/approve — marks sources as invoiced
invoicesRouter.post(
  '/:id/approve',
  requirePermission('projects.invoices.edit', 'edit'),
  async (req, res) => {
    try {
      const id = requireParam(req, 'id')
      const companyId = getAuth(req).companyId
      const userId = getAuth(req).userId

      const invoice = await query(
        'SELECT status FROM project_invoices WHERE id=$1 AND company_id=$2',
        [id, companyId],
      )
      if (!invoice.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Invoice not found')
      if ((invoice.rows[0] as { status: string })['status'] !== 'review') {
        return sendError(res, 409, 'INVALID_STATUS', 'Only invoices in review can be approved')
      }

      const lines = await query<{ source_type: string; source_id: string | null }>(
        'SELECT source_type, source_id FROM project_invoice_lines WHERE invoice_id=$1',
        [id],
      )

      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await markSourcesInvoiced(
          client,
          lines.rows.map((l) => {
            const entry: { source_type: string; source_id?: string } = {
              source_type: l['source_type'],
            }
            if (l['source_id']) entry.source_id = l['source_id']
            return entry
          }),
        )
        await client.query(
          `UPDATE project_invoices SET status='approved', updated_at=NOW() WHERE id=$1`,
          [id],
        )
        await client.query('COMMIT')
        await logAudit({
          companyId,
          userId,
          action: 'UPDATE',
          tableName: 'project_invoices',
          recordId: id,
          newValues: { status: 'approved' },
        })
        sendOk(res, { id, status: 'approved' })
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to approve invoice', err)
    }
  },
)

// POST /projects/invoices/:id/reject — an approver sends an invoice in review back to draft.
//
// The lines that need changing can be ticked, each with its own reason (lineFlags), the same way a
// requisition or an expense claim is rejected; with only flags the invoice's reason is composed from
// them, so a rejected invoice always has a reason to show. Flags are optional: a reason about the
// whole invoice is enough. It lands in 'draft', where Edit and Submit for review already exist, so
// there is no new status. Nothing needs undoing: sources are only marked invoiced at approve.
// Gated like approve (projects.invoices.edit): whoever may approve may reject.
//
// Fields of the printed header (Bill To, Due Date, Contract No., ...) can be flagged the same way
// (headerFlags, migration 314), so a wrong line and a wrong header can be reported together.
const rejectSchema = z
  .object({
    reason: z.string().trim().max(2000).optional(),
    lineFlags: z
      .array(z.object({ lineId: z.string().uuid(), reason: z.string().trim().min(1).max(1000) }))
      .max(500)
      .optional(),
    headerFlags: z
      .array(
        z.object({
          field: z.enum(INVOICE_HEADER_FLAG_FIELDS),
          reason: z.string().trim().min(1).max(1000),
        }),
      )
      .max(INVOICE_HEADER_FLAG_FIELDS.length)
      .optional(),
  })
  .refine((d) => !!d.reason || (d.lineFlags?.length ?? 0) > 0 || (d.headerFlags?.length ?? 0) > 0, {
    message: 'Give an overall reason or flag at least one line or header field with a reason',
  })

invoicesRouter.post(
  '/:id/reject',
  requirePermission('projects.invoices.edit', 'edit'),
  asyncHandler(async (req, res) => {
    try {
      const id = requireParam(req, 'id')
      const { companyId, userId } = getAuth(req)
      const parsed = rejectSchema.safeParse(req.body)
      if (!parsed.success) {
        sendError(res, 422, 'VALIDATION', parsed.error.issues[0]?.message ?? 'Invalid request')
        return
      }
      const { reason, lineFlags = [], headerFlags = [] } = parsed.data
      const lineIds = lineFlags.map((f) => f.lineId)
      if (new Set(lineIds).size !== lineIds.length) {
        sendError(res, 422, 'VALIDATION', 'A line can only be flagged once')
        return
      }
      if (new Set(headerFlags.map((f) => f.field)).size !== headerFlags.length) {
        sendError(res, 422, 'VALIDATION', 'A header field can only be flagged once')
        return
      }
      const reasonByLine = new Map(lineFlags.map((f) => [f.lineId, f.reason]))

      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const inv = await client.query<{ status: string }>(
          'SELECT status FROM project_invoices WHERE id=$1 AND company_id=$2 FOR UPDATE',
          [id, companyId],
        )
        if (!inv.rows[0]) {
          await client.query('ROLLBACK')
          sendError(res, 404, 'NOT_FOUND', 'Invoice not found')
          return
        }
        if (inv.rows[0].status !== 'review') {
          await client.query('ROLLBACK')
          sendError(res, 409, 'INVALID_STATUS', 'Only invoices in review can be rejected')
          return
        }

        for (const hf of headerFlags) {
          // One row per field: flagging it again starts a fresh cycle (not addressed, not resolved).
          await client.query(
            `INSERT INTO project_invoice_header_flags (invoice_id, field, flag_reason, flagged_by)
             VALUES ($1,$2,$3,$4)
             ON CONFLICT (invoice_id, field) DO UPDATE
               SET flag_reason=EXCLUDED.flag_reason, flagged_at=NOW(), flagged_by=EXCLUDED.flagged_by,
                   flag_addressed_at=NULL, flag_resolved_at=NULL, flag_resolved_by=NULL`,
            [id, hf.field, hf.reason, userId],
          )
        }

        const flagged: { lineNumber: number; label: string; reason: string }[] = []
        if (lineIds.length > 0) {
          const owned = await client.query<{
            id: string
            line_number: number
            description: string | null
          }>(
            `SELECT id, line_number, description FROM project_invoice_lines
             WHERE invoice_id=$1 AND id = ANY($2::uuid[]) ORDER BY line_number`,
            [id, lineIds],
          )
          if (owned.rows.length !== lineIds.length) {
            await client.query('ROLLBACK')
            sendError(
              res,
              422,
              'VALIDATION',
              'One of the flagged lines does not belong to this invoice',
            )
            return
          }
          for (const row of owned.rows) {
            const flagReason = reasonByLine.get(row.id) ?? ''
            // Re-flagging a line starts a fresh cycle: clears whatever addressed/resolved state an
            // earlier flag on it had.
            await client.query(
              `UPDATE project_invoice_lines
               SET flag_reason=$1, flagged_at=NOW(), flagged_by=$2,
                   flag_addressed_at=NULL, flag_resolved_at=NULL, flag_resolved_by=NULL
               WHERE id=$3 AND invoice_id=$4`,
              [flagReason, userId, row.id, id],
            )
            flagged.push({
              lineNumber: row.line_number,
              label: row.description?.trim() ?? '',
              reason: flagReason,
            })
          }
        }

        // The header fields first (the order of the page), then the lines.
        const composed = [
          ...headerFlags.map((f) => `• ${INVOICE_HEADER_FLAG_LABELS[f.field]}: ${f.reason}`),
          ...flagged.map(
            (f) => `• Line ${f.lineNumber}${f.label ? ` (${f.label})` : ''}: ${f.reason}`,
          ),
        ].join('\n')
        // The overall reason first, then the flagged items, with a blank line between.
        const fullReason = [reason, composed].filter((part) => !!part).join('\n\n')
        await client.query(
          `UPDATE project_invoices
           SET status='draft', rejected_by=$1, rejected_at=NOW(), rejection_reason=$2, updated_at=NOW()
           WHERE id=$3`,
          [userId, fullReason, id],
        )
        await client.query('COMMIT')
        await logAudit({
          companyId,
          userId,
          action: 'UPDATE',
          tableName: 'project_invoices',
          recordId: id,
          oldValues: { status: 'review' },
          newValues: {
            status: 'draft',
            rejection_reason: fullReason,
            lines_flagged: flagged.length,
            header_fields_flagged: headerFlags.length,
          },
        })
        sendOk(res, { id, status: 'draft', rejection_reason: fullReason })
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to reject invoice', err)
    }
  }),
)

// POST /projects/invoices/:id/lines/:lineId/resolve-flag — the approver confirms a fixed line.
//
// Only an addressed flag (the invoice was submitted for review again) can be resolved: an open one
// is still waiting for the person who made the invoice, and resolving it would hide the reason from
// them. Same gate as reject.
invoicesRouter.post(
  '/:id/lines/:lineId/resolve-flag',
  requirePermission('projects.invoices.edit', 'edit'),
  asyncHandler(async (req, res) => {
    try {
      const id = requireParam(req, 'id')
      const lineId = requireParam(req, 'lineId')
      const { companyId, userId } = getAuth(req)
      const r = await query(
        `UPDATE project_invoice_lines l SET flag_resolved_at=NOW(), flag_resolved_by=$1
         FROM project_invoices pi
         WHERE l.id=$2 AND l.invoice_id=$3 AND pi.id = l.invoice_id AND pi.company_id=$4
           AND l.flagged_at IS NOT NULL AND l.flag_addressed_at IS NOT NULL
           AND l.flag_resolved_at IS NULL
         RETURNING l.id`,
        [userId, lineId, id, companyId],
      )
      if (!r.rows[0]) {
        sendError(res, 409, 'INVALID_STATUS', 'This line has no fixed flag waiting to be confirmed')
        return
      }
      await logAudit({
        companyId,
        userId,
        action: 'UPDATE',
        tableName: 'project_invoice_lines',
        recordId: lineId,
        newValues: { flag_resolved: true },
      })
      sendOk(res, { id: lineId, flag_resolved: true })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to resolve flag', err)
    }
  }),
)

// POST /projects/invoices/:id/header-flags/:field/resolve-flag — the approver confirms a fixed header field.
//
// The same rule as a line: only an addressed flag can be resolved, same gate as reject.
invoicesRouter.post(
  '/:id/header-flags/:field/resolve-flag',
  requirePermission('projects.invoices.edit', 'edit'),
  asyncHandler(async (req, res) => {
    try {
      const id = requireParam(req, 'id')
      const field = requireParam(req, 'field')
      const { companyId, userId } = getAuth(req)
      if (!(INVOICE_HEADER_FLAG_FIELDS as readonly string[]).includes(field)) {
        sendError(res, 422, 'VALIDATION', 'Unknown header field')
        return
      }
      const r = await query(
        `UPDATE project_invoice_header_flags hf SET flag_resolved_at=NOW(), flag_resolved_by=$1
         FROM project_invoices pi
         WHERE hf.invoice_id=$2 AND hf.field=$3 AND pi.id = hf.invoice_id AND pi.company_id=$4
           AND hf.flag_addressed_at IS NOT NULL AND hf.flag_resolved_at IS NULL
         RETURNING hf.field`,
        [userId, id, field, companyId],
      )
      if (!r.rows[0]) {
        sendError(
          res,
          409,
          'INVALID_STATUS',
          'This field has no fixed flag waiting to be confirmed',
        )
        return
      }
      await logAudit({
        companyId,
        userId,
        action: 'UPDATE',
        tableName: 'project_invoice_header_flags',
        recordId: id,
        newValues: { field: field as InvoiceHeaderFlagField, flag_resolved: true },
      })
      sendOk(res, { id, field, flag_resolved: true })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to resolve flag', err)
    }
  }),
)

// POST /projects/invoices/:id/issue — posts GL + queues PDF
invoicesRouter.post(
  '/:id/issue',
  requirePermission('projects.invoices.edit', 'edit'),
  async (req, res) => {
    try {
      const id = requireParam(req, 'id')
      const companyId = getAuth(req).companyId
      const userId = getAuth(req).userId

      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        // Atomic: the UPDATE's own WHERE clause (not a prior SELECT-then-check)
        // is what prevents a race — two near-simultaneous "Issue" clicks (double
        // click, two tabs) serialize on the row, and only the first to see
        // status='approved' can ever match, so only one journal ever gets
        // enqueued. A separate SELECT check beforehand let both requests pass
        // validation and each enqueue their own GL journal, double-posting
        // revenue for the same invoice.
        const updated = await client.query(
          `UPDATE project_invoices SET status='issued', issued_by=$1, issued_at=NOW(), updated_at=NOW()
         WHERE id=$2 AND company_id=$3 AND status='approved' RETURNING *`,
          [userId, id, companyId],
        )
        const inv = updated.rows[0] as Record<string, unknown> | undefined
        if (!inv) {
          await client.query('ROLLBACK')
          const exists = await query(
            'SELECT id FROM project_invoices WHERE id=$1 AND company_id=$2',
            [id, companyId],
          )
          if (!exists.rows[0]) {
            sendError(res, 404, 'NOT_FOUND', 'Invoice not found')
          } else {
            sendError(res, 409, 'INVALID_STATUS', 'Only approved invoices can be issued')
          }
          return
        }

        // Queue GL journal
        await client.query(
          `INSERT INTO service_outbox (service, event_type, payload) VALUES ('finance','PROJECT_INVOICE_JOURNAL_REQUESTED',$1)`,
          [
            JSON.stringify({
              company_id: companyId,
              project_id: inv['project_id'],
              contract_id: inv['contract_id'],
              invoice_id: id,
              gross_total: inv['gross_total'],
              retention_amount: inv['retention_amount'],
              net_payable: inv['net_payable'],
              currency_code: inv['currency_code'],
              invoice_date: inv['invoice_date'],
              wht_applies: inv['wht_applies'],
              wht_scenario: inv['wht_scenario'],
              wht_amount: inv['wht_amount'],
            }),
          ],
        )

        // Queue PDF generation
        await client.query(
          `INSERT INTO service_outbox (service, event_type, payload) VALUES ('reporting','PROJECT_INVOICE_PDF_REQUESTED',$1)`,
          [JSON.stringify({ invoice_id: id, company_id: companyId })],
        )

        await client.query('COMMIT')
        await logAudit({
          companyId,
          userId,
          action: 'UPDATE',
          tableName: 'project_invoices',
          recordId: id,
          newValues: { status: 'issued' },
        })
        sendOk(res, { id, status: 'issued' })
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to issue invoice', err)
    }
  },
)

// POST /projects/invoices/:id/cancel
invoicesRouter.post(
  '/:id/cancel',
  requirePermission('projects.invoices.edit', 'edit'),
  async (req, res) => {
    try {
      const id = requireParam(req, 'id')
      const companyId = getAuth(req).companyId
      const userId = getAuth(req).userId

      const invoice = await query(
        'SELECT status FROM project_invoices WHERE id=$1 AND company_id=$2',
        [id, companyId],
      )
      if (!invoice.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Invoice not found')
      const status = (invoice.rows[0] as { status: string })['status']
      if (status === 'issued' || status === 'partial' || status === 'paid') {
        return sendError(
          res,
          409,
          'CANNOT_CANCEL',
          'Issued or paid invoices cannot be cancelled — raise a credit note instead',
        )
      }

      // Reverse is_invoiced flags on source lines
      const lines = await query<{ source_type: string; source_id: string | null }>(
        'SELECT source_type, source_id FROM project_invoice_lines WHERE invoice_id=$1',
        [id],
      )
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        for (const l of lines.rows) {
          if (!l['source_id']) continue
          switch (l['source_type']) {
            case 'manufacturing_order':
              await client.query(`UPDATE manufacturing_orders SET is_invoiced=false WHERE id=$1`, [
                l['source_id'],
              ])
              break
            case 'purchase_order':
              await client.query(`UPDATE po_receipts SET is_invoiced=false WHERE id=$1`, [
                l['source_id'],
              ])
              break
            case 'stock_issue':
              await client.query(
                `UPDATE project_material_issue_lines SET is_invoiced=false WHERE id=$1`,
                [l['source_id']],
              )
              break
            case 'rental':
              await client.query(`UPDATE rental_invoices SET is_invoiced=false WHERE id=$1`, [
                l['source_id'],
              ])
              break
            case 'milestone':
              await client.query(
                `UPDATE project_milestones SET status='reached' WHERE id=$1 AND status='invoiced'`,
                [l['source_id']],
              )
              break
          }
        }
        await client.query(
          `UPDATE project_invoices SET status='cancelled', updated_at=NOW() WHERE id=$1`,
          [id],
        )
        await client.query('COMMIT')
        await logAudit({
          companyId,
          userId,
          action: 'UPDATE',
          tableName: 'project_invoices',
          recordId: id,
          newValues: { status: 'cancelled' },
        })
        sendOk(res, { id, status: 'cancelled' })
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to cancel invoice', err)
    }
  },
)

// GET /projects/invoices/:id/available-costs
invoicesRouter.get(
  '/:id/available-costs',
  requirePermission('projects.invoices.view', 'view'),
  async (req, res) => {
    try {
      const id = requireParam(req, 'id')
      const companyId = getAuth(req).companyId
      const sourceType = req.query['source_type'] as string | undefined

      const invoice = await query<{ project_id: string; contract_id: string }>(
        'SELECT project_id, contract_id FROM project_invoices WHERE id=$1 AND company_id=$2',
        [id, companyId],
      )
      const invoiceRow = invoice.rows[0]
      if (!invoiceRow) return sendError(res, 404, 'NOT_FOUND', 'Invoice not found')
      const { project_id: projectId, contract_id: contractId } = invoiceRow

      const result: Record<string, unknown[]> = {}

      if (!sourceType || sourceType === 'milestone') {
        const ms = await query(
          "SELECT * FROM project_milestones WHERE contract_id=$1 AND status='reached'",
          [contractId],
        )
        result['milestones'] = ms.rows
      }
      if (!sourceType || sourceType === 'manufacturing_order') {
        const mos = await query(
          `SELECT mo.id, mo.mo_number, p.name AS product_name, mo.qty_produced, mo.actual_cost
         FROM manufacturing_orders mo JOIN products p ON p.id=mo.finished_product_id
         WHERE mo.project_id=$1 AND mo.status='completed' AND mo.is_invoiced=false`,
          [projectId],
        )
        result['manufacturing_orders'] = mos.rows
      }
      if (!sourceType || sourceType === 'purchase_order') {
        const pos = await query(
          `SELECT por.id, po.po_number, v.name AS vendor_name
         FROM po_receipts por JOIN purchase_orders po ON po.id=por.po_id JOIN vendors v ON v.id=po.vendor_id
         WHERE po.analytic_account_id=(SELECT analytic_account_id FROM projects WHERE id=$1)
           AND por.is_invoiced=false`,
          [projectId],
        )
        result['purchase_orders'] = pos.rows
      }
      if (!sourceType || sourceType === 'stock_issue') {
        const si = await query(
          `SELECT pmil.id, p.name AS product_name, pmil.qty_issued, pmil.unit_cost, pmi.issue_number
         FROM project_material_issue_lines pmil JOIN project_material_issues pmi ON pmi.id=pmil.issue_id
         JOIN products p ON p.id=pmil.product_id
         WHERE pmi.project_id=$1 AND pmi.status='issued' AND pmil.is_invoiced=false`,
          [projectId],
        )
        result['stock_issues'] = si.rows
      }
      if (!sourceType || sourceType === 'rental') {
        const ri = await query(
          `SELECT ri.id, rc.contract_number, ri.days_billed, ri.amount
         FROM rental_invoices ri JOIN rental_contracts rc ON rc.id=ri.contract_id
         WHERE rc.project_id=$1 AND ri.status='issued' AND ri.is_invoiced=false`,
          [projectId],
        )
        result['rental'] = ri.rows
      }
      sendOk(res, result)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch available costs', err)
    }
  },
)
