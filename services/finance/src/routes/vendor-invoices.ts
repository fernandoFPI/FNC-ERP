import { Router } from 'express'
import type { IRouter } from 'express'
import { z } from 'zod'
import { query, withTransaction } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const vendorInvoicesRouter: IRouter = Router()

const LineSchema = z.object({
  po_line_id: z.string().uuid().optional(),
  description: z.string().min(1),
  qty: z.number().positive().default(1),
  unit_price: z.number().min(0).default(0),
  total_price: z.number().min(0).optional(),
  account_id: z.string().uuid().optional(),
})

const CreateSchema = z.object({
  vendor_id: z.string().uuid(),
  po_id: z.string().uuid().optional(),
  invoice_number: z.string().min(1).max(100),
  invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  subtotal: z.number().min(0),
  tax_amount: z.number().min(0).default(0),
  currency_code: z.string().length(3).default('IQD'),
  wht_applies: z.boolean().optional(),
  wht_rate: z.number().min(0).max(1).optional(),
  analytic_account_id: z.string().uuid().optional(),
  cost_center_id: z.string().uuid().optional(),
  notes: z.string().optional(),
  lines: z.array(LineSchema).optional(),
})

const UpdateSchema = CreateSchema.omit({ vendor_id: true, po_id: true, lines: true })
  .partial()
  .extend({ lines: z.array(LineSchema).optional() })

const PaymentSchema = z.object({
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive(),
  currency_code: z.string().length(3).optional(),
  payment_method: z.enum(['bank_transfer', 'cheque', 'cash', 'other']).default('bank_transfer'),
  payment_reference: z.string().optional(),
  notes: z.string().optional(),
})

// ── GET /finance/vendor-invoices ──────────────────────────────
vendorInvoicesRouter.get('/', requirePermission('finance.ap.view', 'view'), async (req, res) => {
  try {
    const {
      status,
      vendor_id,
      po_id,
      invoice_number,
      from_date,
      to_date,
      overdue,
      cross_company,
      page = '1',
      limit = '20',
    } = req.query as Record<string, string>
    const offset = (parseInt(page) - 1) * parseInt(limit)
    // cross_company=true skips the company filter — used by PO detail to find invoices
    // created in a different company context (workflow-imported POs exist in multiple companies)
    const conditions: string[] = cross_company === 'true' ? [] : [`vi.company_id = $1`]
    const values: unknown[] = cross_company === 'true' ? [] : [req.auth!.companyId]
    let p = cross_company === 'true' ? 0 : 1

    if (status) {
      conditions.push(`vi.status = ANY($${++p}::text[])`)
      values.push(status.split(','))
    }
    if (vendor_id) {
      conditions.push(`vi.vendor_id = $${++p}`)
      values.push(vendor_id)
    }
    if (po_id) {
      conditions.push(`vi.po_id = $${++p}`)
      values.push(po_id)
    }
    if (invoice_number) {
      conditions.push(`vi.invoice_number = $${++p}`)
      values.push(invoice_number)
    }
    if (from_date) {
      conditions.push(`vi.invoice_date >= $${++p}`)
      values.push(from_date)
    }
    if (to_date) {
      conditions.push(`vi.invoice_date <= $${++p}`)
      values.push(to_date)
    }
    if (overdue === 'true') {
      conditions.push(`vi.due_date < CURRENT_DATE`)
      conditions.push(`vi.status NOT IN ('paid','cancelled')`)
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const rows = await query(
      `
      SELECT
        vi.*,
        v.name AS vendor_name,
        v.tax_id AS vendor_tax_id,
        po.po_number,
        (CURRENT_DATE - vi.due_date)::integer AS days_overdue,
        vi.net_payable - vi.amount_paid AS outstanding,
        u_sub.email AS submitted_by_email,
        u_app.email AS approved_by_email,
        COUNT(vil.id)::integer AS line_count
      FROM vendor_invoices vi
      JOIN vendors v ON v.id = vi.vendor_id
      LEFT JOIN purchase_orders po ON po.id = vi.po_id
      LEFT JOIN users u_sub ON u_sub.id = vi.submitted_by
      LEFT JOIN users u_app ON u_app.id = vi.approved_by
      LEFT JOIN vendor_invoice_lines vil ON vil.vendor_invoice_id = vi.id
      ${where}
      GROUP BY vi.id, v.name, v.tax_id, po.po_number, u_sub.email, u_app.email
      ORDER BY
        CASE WHEN vi.status NOT IN ('paid','cancelled') AND vi.due_date < CURRENT_DATE THEN 0 ELSE 1 END,
        vi.due_date ASC, vi.created_at DESC
      LIMIT $${p + 1} OFFSET $${p + 2}
    `,
      [...values, parseInt(limit), offset],
    )

    const total = await query(`SELECT COUNT(*) FROM vendor_invoices vi ${where}`, values)

    sendOk(res, {
      items: rows.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(total.rows[0]!['count'] as string),
        totalPages: Math.ceil(parseInt(total.rows[0]!['count'] as string) / parseInt(limit)),
      },
    })
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list vendor invoices', err)
  }
})

// ── GET /finance/vendor-invoices/ap-summary ───────────────────
vendorInvoicesRouter.get(
  '/ap-summary',
  requirePermission('finance.ap.view', 'view'),
  async (req, res) => {
    try {
      const result = await query(
        `
      SELECT
        COALESCE(SUM(vi.net_payable - vi.amount_paid) FILTER (WHERE vi.status NOT IN ('cancelled')), 0) AS total_outstanding,
        COALESCE(SUM(vi.net_payable - vi.amount_paid) FILTER (
          WHERE vi.status NOT IN ('paid','cancelled') AND CURRENT_DATE - vi.due_date BETWEEN 0 AND 30
        ), 0) AS bucket_0_30,
        COALESCE(SUM(vi.net_payable - vi.amount_paid) FILTER (
          WHERE vi.status NOT IN ('paid','cancelled') AND CURRENT_DATE - vi.due_date BETWEEN 31 AND 60
        ), 0) AS bucket_31_60,
        COALESCE(SUM(vi.net_payable - vi.amount_paid) FILTER (
          WHERE vi.status NOT IN ('paid','cancelled') AND CURRENT_DATE - vi.due_date BETWEEN 61 AND 90
        ), 0) AS bucket_61_90,
        COALESCE(SUM(vi.net_payable - vi.amount_paid) FILTER (
          WHERE vi.status NOT IN ('paid','cancelled') AND CURRENT_DATE - vi.due_date > 90
        ), 0) AS bucket_over_90,
        COUNT(*) FILTER (WHERE vi.status NOT IN ('paid','cancelled'))::integer AS open_invoice_count,
        COUNT(*) FILTER (
          WHERE vi.due_date < CURRENT_DATE AND vi.status NOT IN ('paid','cancelled')
        )::integer AS overdue_count,
        COUNT(*) FILTER (WHERE vi.status = 'submitted')::integer AS pending_approval_count,
        COALESCE(SUM(vp.amount) FILTER (
          WHERE DATE_TRUNC('month', vp.payment_date) = DATE_TRUNC('month', CURRENT_DATE)
        ), 0) AS paid_this_month
      FROM vendor_invoices vi
      LEFT JOIN vendor_payments vp ON vp.vendor_invoice_id = vi.id
      WHERE vi.company_id = $1
    `,
        [req.auth!.companyId],
      )

      sendOk(res, result.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to get AP summary', err)
    }
  },
)

// ── GET /finance/vendor-invoices/vendor/:vendorId/summary ─────
vendorInvoicesRouter.get(
  '/vendor/:vendorId/summary',
  requirePermission('finance.ap.view', 'view'),
  async (req, res) => {
    try {
      const result = await query(
        `
      SELECT
        v.id, v.name, v.currency_code,
        COUNT(vi.id) FILTER (WHERE vi.status NOT IN ('paid','cancelled'))::integer AS open_invoices,
        COALESCE(SUM(vi.net_payable - vi.amount_paid) FILTER (WHERE vi.status NOT IN ('paid','cancelled')), 0) AS total_outstanding,
        MIN(vi.due_date) FILTER (WHERE vi.status NOT IN ('paid','cancelled')) AS earliest_due_date,
        COUNT(vi.id) FILTER (
          WHERE vi.due_date < CURRENT_DATE AND vi.status NOT IN ('paid','cancelled')
        )::integer AS overdue_count
      FROM vendors v
      LEFT JOIN vendor_invoices vi ON vi.vendor_id = v.id AND vi.company_id = $1
      WHERE v.id = $2
      GROUP BY v.id, v.name, v.currency_code
    `,
        [req.auth!.companyId, req.params['vendorId']],
      )

      if (!result.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Vendor not found')
        return
      }
      sendOk(res, result.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to get vendor summary', err)
    }
  },
)

// ── GET /finance/vendor-invoices/:id ──────────────────────────
vendorInvoicesRouter.get('/:id', requirePermission('finance.ap.view', 'view'), async (req, res) => {
  try {
    const [invoiceResult, linesResult, paymentsResult] = await Promise.all([
      query(
        `
        SELECT
          vi.*,
          v.name AS vendor_name, v.tax_id AS vendor_tax_id,
          v.currency_code AS vendor_currency, v.payment_terms_days,
          v.withholding_tax_rate,
          po.po_number,
          (CURRENT_DATE - vi.due_date)::integer AS days_overdue,
          vi.net_payable - vi.amount_paid AS outstanding,
          u_sub.email AS submitted_by_email,
          u_app.email AS approved_by_email,
          u_rej.email AS rejected_by_email
        FROM vendor_invoices vi
        JOIN vendors v ON v.id = vi.vendor_id
        LEFT JOIN purchase_orders po ON po.id = vi.po_id
        LEFT JOIN users u_sub ON u_sub.id = vi.submitted_by
        LEFT JOIN users u_app ON u_app.id = vi.approved_by
        LEFT JOIN users u_rej ON u_rej.id = vi.rejected_by
        WHERE vi.id = $1 AND vi.company_id = $2
      `,
        [req.params['id'], req.auth!.companyId],
      ),
      query(
        `
        SELECT vil.*, a.code AS account_code, a.name AS account_name,
               pol.description AS po_line_description
        FROM vendor_invoice_lines vil
        LEFT JOIN chart_of_accounts a ON a.id = vil.account_id
        LEFT JOIN po_lines pol ON pol.id = vil.po_line_id
        WHERE vil.vendor_invoice_id = $1 ORDER BY vil.sequence
      `,
        [req.params['id']],
      ),
      query(
        `
        SELECT vp.*, COALESCE(u.first_name || ' ' || u.last_name, u.email) AS created_by_email
        FROM vendor_payments vp
        JOIN users u ON u.id = vp.created_by
        WHERE vp.vendor_invoice_id = $1 ORDER BY vp.payment_date DESC
      `,
        [req.params['id']],
      ),
    ])

    if (!invoiceResult.rows[0]) {
      sendError(res, 404, 'NOT_FOUND', 'Vendor invoice not found')
      return
    }
    sendOk(res, {
      ...invoiceResult.rows[0],
      lines: linesResult.rows,
      payments: paymentsResult.rows,
    })
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to get vendor invoice', err)
  }
})

// ── POST /finance/vendor-invoices ─────────────────────────────
vendorInvoicesRouter.post('/', requirePermission('finance.ap.edit', 'edit'), async (req, res) => {
  try {
    const parsed = CreateSchema.safeParse(req.body)
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
      return
    }
    const {
      vendor_id,
      po_id,
      invoice_number,
      invoice_date,
      due_date,
      subtotal,
      tax_amount,
      currency_code,
      wht_applies: whtAppliesInput,
      wht_rate: whtRateInput,
      analytic_account_id,
      cost_center_id,
      notes,
      lines,
    } = parsed.data

    // If wht_applies is not explicitly set, default based on vendor's configured rate.
    const vendorResult = await query(`SELECT withholding_tax_rate FROM vendors WHERE id = $1`, [
      vendor_id,
    ])
    const vendorRate = parseFloat(String(vendorResult.rows[0]?.['withholding_tax_rate'] ?? 0))
    const whtApplies = whtAppliesInput ?? vendorRate > 0
    const whtRate = whtApplies ? (whtRateInput ?? vendorRate) : 0
    const totalAmount = subtotal + tax_amount
    const whtAmount = Math.round((whtApplies ? subtotal * whtRate : 0) * 100) / 100
    const netPayable = Math.round((totalAmount - whtAmount) * 100) / 100

    const invoice = await withTransaction(
      { companyId: req.auth!.companyId, userId: req.auth!.userId, role: req.auth!.role },
      async (client) => {
        const inv = await client.query(
          `
          INSERT INTO vendor_invoices (
            company_id, vendor_id, po_id, invoice_number, invoice_date, due_date,
            subtotal, tax_amount, wht_amount, total_amount, net_payable,
            currency_code, wht_applies, wht_rate, status,
            analytic_account_id, cost_center_id, notes, created_by
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'draft',$15,$16,$17,$18)
          RETURNING *
        `,
          [
            req.auth!.companyId,
            vendor_id,
            po_id ?? null,
            invoice_number,
            invoice_date,
            due_date,
            subtotal,
            tax_amount,
            whtAmount,
            totalAmount,
            netPayable,
            currency_code,
            whtApplies,
            whtRate,
            analytic_account_id ?? null,
            cost_center_id ?? null,
            notes ?? null,
            req.auth!.userId,
          ],
        )

        const invoiceId = inv.rows[0]!.id as string
        const createdLines: unknown[] = []

        if (lines?.length) {
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i]!
            const lineTotal = line.total_price ?? line.qty * line.unit_price
            const lineResult = await client.query(
              `
              INSERT INTO vendor_invoice_lines
                (vendor_invoice_id, po_line_id, description, qty, unit_price, total_price, account_id, sequence)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
            `,
              [
                invoiceId,
                line.po_line_id ?? null,
                line.description,
                line.qty,
                line.unit_price,
                lineTotal,
                line.account_id ?? null,
                i + 1,
              ],
            )
            createdLines.push(lineResult.rows[0])
          }
        }

        await logAudit({
          userId: req.auth!.userId,
          companyId: req.auth!.companyId,
          action: 'CREATE',
          tableName: 'vendor_invoices',
          recordId: invoiceId,
        })

        return { ...inv.rows[0], lines: createdLines }
      },
    )

    sendOk(res, invoice, 201)
  } catch (err: unknown) {
    const e = err as { code?: string }
    if (e.code === '23505') {
      sendError(
        res,
        409,
        'DUPLICATE_INVOICE_NUMBER',
        'Invoice number already exists for this vendor',
      )
      return
    }
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create vendor invoice', err)
  }
})

// ── PATCH /finance/vendor-invoices/:id/link-po ────────────────
vendorInvoicesRouter.patch(
  '/:id/link-po',
  requirePermission('finance.ap.edit', 'edit'),
  async (req, res) => {
    try {
      const { po_id } = req.body as { po_id?: string | null }
      const result = await query(
        `UPDATE vendor_invoices SET po_id = $1, updated_at = NOW()
       WHERE id = $2 AND company_id = $3
       RETURNING id, po_id`,
        [po_id ?? null, req.params['id'], req.auth!.companyId],
      )
      if (!result.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Vendor invoice not found')
        return
      }
      sendOk(res, result.rows[0])
    } catch (err: unknown) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to link PO', err)
    }
  },
)

// ── PUT /finance/vendor-invoices/:id ──────────────────────────
vendorInvoicesRouter.put('/:id', requirePermission('finance.ap.edit', 'edit'), async (req, res) => {
  try {
    const current = await query(
      `SELECT status, vendor_id FROM vendor_invoices WHERE id = $1 AND company_id = $2`,
      [req.params['id'], req.auth!.companyId],
    )
    if (!current.rows[0]) {
      sendError(res, 404, 'NOT_FOUND', 'Vendor invoice not found')
      return
    }
    if (current.rows[0]['status'] !== 'draft') {
      sendError(res, 400, 'NOT_EDITABLE', 'Only draft invoices can be edited')
      return
    }

    const parsed = UpdateSchema.safeParse(req.body)
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
      return
    }
    const d = parsed.data

    const subtotalNum = d.subtotal ?? 0
    const taxNum = d.tax_amount ?? 0
    const totalAmount = subtotalNum + taxNum

    // Resolve WHT: use per-invoice override if provided, else fall back to vendor's rate
    const vendorResult = await query(`SELECT withholding_tax_rate FROM vendors WHERE id = $1`, [
      current.rows[0]['vendor_id'],
    ])
    const vendorRate = parseFloat(String(vendorResult.rows[0]?.['withholding_tax_rate'] ?? 0))
    const whtApplies = d.wht_applies ?? vendorRate > 0
    const whtRate = whtApplies ? (d.wht_rate ?? vendorRate) : 0
    const whtAmount = Math.round((whtApplies ? subtotalNum * whtRate : 0) * 100) / 100
    const netPayable = Math.round((totalAmount - whtAmount) * 100) / 100

    await query(
      `
      UPDATE vendor_invoices SET
        invoice_number      = COALESCE($1, invoice_number),
        invoice_date        = COALESCE($2, invoice_date),
        due_date            = COALESCE($3, due_date),
        subtotal            = $4,
        tax_amount          = $5,
        wht_amount          = $6,
        total_amount        = $7,
        net_payable         = $8,
        currency_code       = COALESCE($9, currency_code),
        wht_applies         = $10,
        wht_rate            = $11,
        analytic_account_id = COALESCE($12, analytic_account_id),
        cost_center_id      = COALESCE($13, cost_center_id),
        notes               = COALESCE($14, notes),
        updated_at          = NOW()
      WHERE id = $15 AND company_id = $16
    `,
      [
        d.invoice_number ?? null,
        d.invoice_date ?? null,
        d.due_date ?? null,
        subtotalNum,
        taxNum,
        whtAmount,
        totalAmount,
        netPayable,
        d.currency_code ?? null,
        whtApplies,
        whtRate,
        d.analytic_account_id ?? null,
        d.cost_center_id ?? null,
        d.notes ?? null,
        req.params['id'],
        req.auth!.companyId,
      ],
    )

    sendOk(res, { message: 'Invoice updated' })
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update vendor invoice', err)
  }
})

// ── POST /finance/vendor-invoices/:id/submit ──────────────────
vendorInvoicesRouter.post(
  '/:id/submit',
  requirePermission('finance.ap.edit', 'edit'),
  async (req, res) => {
    try {
      const invoice = await query(
        `SELECT status FROM vendor_invoices WHERE id = $1 AND company_id = $2`,
        [req.params['id'], req.auth!.companyId],
      )
      if (!invoice.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Vendor invoice not found')
        return
      }
      if (invoice.rows[0]['status'] !== 'draft') {
        sendError(res, 400, 'INVALID_STATUS', 'Only draft invoices can be submitted')
        return
      }

      const lineCount = await query(
        `SELECT COUNT(*) FROM vendor_invoice_lines WHERE vendor_invoice_id = $1`,
        [req.params['id']],
      )
      if (parseInt(lineCount.rows[0]!['count'] as string) === 0) {
        sendError(res, 400, 'NO_LINES', 'Invoice must have at least one line before submission')
        return
      }

      await withTransaction(
        { companyId: req.auth!.companyId, userId: req.auth!.userId, role: req.auth!.role },
        async (client) => {
          await client.query(
            `
          UPDATE vendor_invoices SET status='submitted', submitted_by=$1, submitted_at=NOW(), updated_at=NOW()
          WHERE id=$2
        `,
            [req.auth!.userId, req.params['id']],
          )

          // Notify system admins via outbox
          const admins = await client.query(`
          SELECT DISTINCT u.id FROM users u
          JOIN user_company_roles ucr ON ucr.user_id = u.id
          WHERE ucr.role = 'system_admin' AND u.is_active = true
        `)
          for (const admin of admins.rows) {
            await client.query(
              `
            INSERT INTO service_outbox (service, event_type, payload)
            VALUES ('notifications', 'VENDOR_INVOICE_APPROVAL_REQUIRED', $1::jsonb)
          `,
              [JSON.stringify({ userId: admin.id, invoiceId: req.params['id'] })],
            )
          }

          await logAudit({
            userId: req.auth!.userId,
            companyId: req.auth!.companyId,
            action: 'UPDATE',
            tableName: 'vendor_invoices',
            recordId: req.params['id']!,
          })
        },
      )

      sendOk(res, { message: 'Invoice submitted for approval' })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to submit vendor invoice', err)
    }
  },
)

// ── POST /finance/vendor-invoices/:id/approve ─────────────────
vendorInvoicesRouter.post(
  '/:id/approve',
  requirePermission('finance.ap.approve', 'approve'),
  async (req, res) => {
    try {
      if (req.auth!.role !== 'system_admin') {
        sendError(res, 403, 'FORBIDDEN', 'System admin required to approve vendor invoices')
        return
      }

      const invoice = await query(
        `SELECT status, submitted_by, invoice_number FROM vendor_invoices WHERE id=$1 AND company_id=$2`,
        [req.params['id'], req.auth!.companyId],
      )
      if (!invoice.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Vendor invoice not found')
        return
      }
      if (invoice.rows[0]['status'] !== 'submitted') {
        sendError(res, 400, 'INVALID_STATUS', 'Only submitted invoices can be approved')
        return
      }

      await withTransaction(
        { companyId: req.auth!.companyId, userId: req.auth!.userId, role: req.auth!.role },
        async (client) => {
          await client.query(
            `
          UPDATE vendor_invoices SET status='approved', approved_by=$1, approved_at=NOW(), updated_at=NOW()
          WHERE id=$2
        `,
            [req.auth!.userId, req.params['id']],
          )

          // Queue AP journal entry: Dr Expense / Cr Accounts Payable
          const invRow = await client.query(`SELECT * FROM vendor_invoices WHERE id=$1`, [
            req.params['id'],
          ])
          const apInv = invRow.rows[0] as Record<string, unknown>
          await client.query(
            `INSERT INTO service_outbox (service, event_type, payload) VALUES ('finance','VENDOR_INVOICE_JOURNAL_REQUESTED',$1)`,
            [
              JSON.stringify({
                invoice_id: req.params['id'],
                company_id: req.auth!.companyId,
                vendor_id: apInv['vendor_id'],
                total_amount: apInv['total_amount'],
                currency_code: apInv['currency_code'],
                invoice_date: apInv['invoice_date'],
              }),
            ],
          )

          if (invoice.rows[0]!['submitted_by']) {
            await client.query(
              `
            INSERT INTO service_outbox (service, event_type, payload)
            VALUES ('notifications', 'VENDOR_INVOICE_APPROVED_NOTIFICATION', $1::jsonb)
          `,
              [
                JSON.stringify({
                  userId: invoice.rows[0]!['submitted_by'],
                  invoiceId: req.params['id'],
                  invoiceNumber: invoice.rows[0]!['invoice_number'],
                }),
              ],
            )
          }

          await logAudit({
            userId: req.auth!.userId,
            companyId: req.auth!.companyId,
            action: 'UPDATE',
            tableName: 'vendor_invoices',
            recordId: req.params['id']!,
          })
        },
      )

      sendOk(res, { message: 'Vendor invoice approved' })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to approve vendor invoice', err)
    }
  },
)

// ── POST /finance/vendor-invoices/:id/reject ──────────────────
vendorInvoicesRouter.post(
  '/:id/reject',
  requirePermission('finance.ap.approve', 'approve'),
  async (req, res) => {
    try {
      if (req.auth!.role !== 'system_admin') {
        sendError(res, 403, 'FORBIDDEN', 'System admin required')
        return
      }

      const { reason } = req.body as { reason?: string }
      if (!reason?.trim()) {
        sendError(res, 400, 'REASON_REQUIRED', 'Rejection reason is required')
        return
      }

      const invoice = await query(
        `SELECT status, submitted_by FROM vendor_invoices WHERE id=$1 AND company_id=$2`,
        [req.params['id'], req.auth!.companyId],
      )
      if (!invoice.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Vendor invoice not found')
        return
      }
      if (invoice.rows[0]['status'] !== 'submitted') {
        sendError(res, 400, 'INVALID_STATUS', 'Only submitted invoices can be rejected')
        return
      }

      await withTransaction(
        { companyId: req.auth!.companyId, userId: req.auth!.userId, role: req.auth!.role },
        async (client) => {
          await client.query(
            `
          UPDATE vendor_invoices SET
            status='draft', rejected_by=$1, rejection_reason=$2,
            submitted_by=NULL, submitted_at=NULL, updated_at=NOW()
          WHERE id=$3
        `,
            [req.auth!.userId, reason, req.params['id']],
          )

          if (invoice.rows[0]!['submitted_by']) {
            await client.query(
              `
            INSERT INTO service_outbox (service, event_type, payload)
            VALUES ('notifications', 'VENDOR_INVOICE_REJECTED_NOTIFICATION', $1::jsonb)
          `,
              [
                JSON.stringify({
                  userId: invoice.rows[0]!['submitted_by'],
                  invoiceId: req.params['id'],
                  reason,
                }),
              ],
            )
          }

          await logAudit({
            userId: req.auth!.userId,
            companyId: req.auth!.companyId,
            action: 'UPDATE',
            tableName: 'vendor_invoices',
            recordId: req.params['id']!,
          })
        },
      )

      sendOk(res, { message: 'Invoice returned to draft' })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to reject vendor invoice', err)
    }
  },
)

// ── POST /finance/vendor-invoices/:id/cancel ──────────────────
vendorInvoicesRouter.post(
  '/:id/cancel',
  requirePermission('finance.ap.approve', 'approve'),
  async (req, res) => {
    try {
      const { reason } = req.body as { reason?: string }

      const invoice = await query(
        `SELECT status FROM vendor_invoices WHERE id=$1 AND company_id=$2`,
        [req.params['id'], req.auth!.companyId],
      )
      if (!invoice.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Vendor invoice not found')
        return
      }
      if (!['draft', 'submitted'].includes(invoice.rows[0]['status'] as string)) {
        sendError(res, 400, 'CANNOT_CANCEL', 'Only draft or submitted invoices can be cancelled')
        return
      }

      const invToCancel = await query(`SELECT invoice_number FROM vendor_invoices WHERE id=$1`, [
        req.params['id'],
      ])
      await query(
        `
      UPDATE vendor_invoices SET
        status='cancelled',
        notes = CASE WHEN notes IS NULL THEN $1 ELSE notes || ' | Cancelled: ' || $1 END,
        updated_at=NOW()
      WHERE id=$2
    `,
        [reason ?? 'Cancelled', req.params['id']],
      )

      await logAudit({
        userId: req.auth!.userId,
        companyId: req.auth!.companyId,
        action: 'DELETE',
        tableName: 'vendor_invoices',
        recordId: req.params['id']!,
      })
      const invNum = String(invToCancel.rows[0]?.['invoice_number'] ?? '')
      ;(async () => {
        const fu = await query(
          `SELECT DISTINCT u.id AS user_id FROM users u JOIN user_company_roles ucr ON ucr.user_id=u.id WHERE ucr.company_id=$1 AND (ucr.role IN ('company_admin','system_admin') OR (ucr.module='finance' AND ucr.role IN ('module_admin','module_user'))) AND u.is_active=true`,
          [req.auth!.companyId],
        )
        for (const u of fu.rows)
          await query(
            `INSERT INTO service_outbox (service,event_type,payload) VALUES ('notifications','VENDOR_INVOICE_CANCELLED',$1)`,
            [
              JSON.stringify({
                userId: u['user_id'],
                companyId: req.auth!.companyId,
                title: `Invoice cancelled: ${invNum}`,
                body: `Vendor invoice ${invNum} has been cancelled${reason ? ': ' + reason : ''}`,
                data: { invoiceId: req.params['id'], invoiceNumber: invNum },
              }),
            ],
          )
      })().catch(() => {})
      sendOk(res, { message: 'Invoice cancelled' })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to cancel vendor invoice', err)
    }
  },
)

// ── POST /finance/vendor-invoices/:id/payments ────────────────
vendorInvoicesRouter.post(
  '/:id/payments',
  requirePermission('finance.ap.approve', 'approve'),
  async (req, res) => {
    try {
      const parsed = PaymentSchema.safeParse(req.body)
      if (!parsed.success) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
        return
      }
      const { payment_date, amount, currency_code, payment_method, payment_reference, notes } =
        parsed.data

      const invoice = await query(`SELECT * FROM vendor_invoices WHERE id=$1 AND company_id=$2`, [
        req.params['id'],
        req.auth!.companyId,
      ])
      if (!invoice.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Vendor invoice not found')
        return
      }

      const inv = invoice.rows[0] as Record<string, unknown>
      if (!['approved', 'partially_paid'].includes(inv['status'] as string)) {
        sendError(res, 400, 'NOT_PAYABLE', 'Invoice must be approved before recording payment')
        return
      }

      const outstandingCents =
        Math.round(parseFloat(String(inv['net_payable'])) * 100) -
        Math.round(parseFloat(String(inv['amount_paid'])) * 100)
      const outstandingDisplay = outstandingCents / 100
      if (amount <= 0) {
        sendError(res, 400, 'INVALID_AMOUNT', 'Payment amount must be greater than zero')
        return
      }
      if (Math.round(amount * 100) > outstandingCents) {
        sendError(
          res,
          400,
          'OVERPAYMENT',
          `Payment exceeds outstanding balance of ${outstandingDisplay.toFixed(2)}`,
        )
        return
      }

      const effectiveCurrency = currency_code ?? String(inv['currency_code'])

      const payment = await withTransaction(
        { companyId: req.auth!.companyId, userId: req.auth!.userId, role: req.auth!.role },
        async (client) => {
          const pmt = await client.query(
            `
          INSERT INTO vendor_payments
            (company_id, vendor_invoice_id, vendor_id, payment_date, amount, currency_code,
             payment_method, payment_reference, notes, created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
        `,
            [
              req.auth!.companyId,
              req.params['id'],
              inv['vendor_id'],
              payment_date,
              amount,
              effectiveCurrency,
              payment_method,
              payment_reference ?? null,
              notes ?? null,
              req.auth!.userId,
            ],
          )

          const newAmountPaid = parseFloat(String(inv['amount_paid'])) + amount
          const isFullyPaid =
            Math.round(newAmountPaid * 100) >=
            Math.round(parseFloat(String(inv['net_payable'])) * 100)
          const newStatus = isFullyPaid ? 'paid' : 'partially_paid'

          await client.query(
            `
          UPDATE vendor_invoices SET amount_paid=$1, status=$2, updated_at=NOW() WHERE id=$3
        `,
            [newAmountPaid, newStatus, req.params['id']],
          )

          // Collect all PO IDs linked to this invoice (junction table + legacy column)
          const poLinksRes = await client.query<{ po_id: string }>(
            `SELECT po_id FROM vendor_invoice_pos WHERE vendor_invoice_id = $1`,
            [req.params['id']],
          )
          const poIds: string[] = poLinksRes.rows.map((r) => r.po_id)
          if (inv['po_id'] && !poIds.includes(inv['po_id'] as string)) {
            poIds.push(inv['po_id'] as string)
          }

          // Queue GL journal entry via outbox
          await client.query(
            `
          INSERT INTO service_outbox (service, event_type, payload)
          VALUES ('finance', 'VENDOR_PAYMENT_JOURNAL_REQUESTED', $1::jsonb)
        `,
            [
              JSON.stringify({
                paymentId: pmt.rows[0]!.id,
                invoiceId: req.params['id'],
                vendorId: inv['vendor_id'],
                poIds,
                amount,
                netPayable: parseFloat(String(inv['net_payable'])),
                whtApplies: inv['wht_applies'],
                whtAmount: parseFloat(String(inv['wht_amount'])),
                currencyCode: effectiveCurrency,
                paymentDate: payment_date,
                companyId: req.auth!.companyId,
                isFullyPaid,
              }),
            ],
          )

          await logAudit({
            userId: req.auth!.userId,
            companyId: req.auth!.companyId,
            action: 'CREATE',
            tableName: 'vendor_payments',
            recordId: pmt.rows[0]!.id as string,
          })

          // Notify finance team that a payment was recorded
          const invNumberRow = await client.query<{ invoice_number: string }>(
            `SELECT invoice_number FROM vendor_invoices WHERE id=$1`,
            [req.params['id']],
          )
          const invNum = String(invNumberRow.rows[0]?.invoice_number ?? '')
          const fuPmt = await client.query(
            `SELECT DISTINCT u.id AS user_id FROM users u JOIN user_company_roles ucr ON ucr.user_id=u.id WHERE ucr.company_id=$1 AND (ucr.role IN ('company_admin','system_admin') OR (ucr.module='finance' AND ucr.role IN ('module_admin','module_user'))) AND u.is_active=true`,
            [req.auth!.companyId],
          )
          for (const u of fuPmt.rows) {
            await client.query(
              `INSERT INTO service_outbox (service,event_type,payload) VALUES ('notifications','VENDOR_PAYMENT_RECORDED',$1)`,
              [
                JSON.stringify({
                  userId: u.user_id,
                  companyId: req.auth!.companyId,
                  title: `Payment recorded: ${invNum}`,
                  body: `Payment of ${amount} ${effectiveCurrency} recorded for invoice ${invNum}${isFullyPaid ? ' — fully paid' : ''}`,
                  data: { invoiceId: req.params['id'], invoiceNumber: invNum, amount, isFullyPaid },
                }),
              ],
            )
          }

          return {
            ...pmt.rows[0],
            newStatus,
            isFullyPaid,
            outstanding: outstandingDisplay - amount,
          }
        },
      )

      sendOk(res, payment, 201)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to record vendor payment', err)
    }
  },
)
