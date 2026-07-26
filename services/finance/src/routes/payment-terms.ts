import { Router } from 'express'
import { z } from 'zod'
import { query, withTransaction } from '@fnc-erp/db'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'
import { logAudit } from '@fnc-erp/audit'

export const paymentTermsRouter: import('express').Router = Router()

const lineSchema = z.object({
  sequence: z.coerce.number().int().default(10),
  description: z.string().optional(),
  value_type: z.enum(['percent', 'fixed']).default('percent'),
  value: z.coerce.number().min(0),
  due_type: z
    .enum(['immediate', 'days', 'end_of_month', 'end_of_next_month', 'retention'])
    .default('days'),
  days: z.coerce.number().int().min(0).default(0),
  is_retention: z.boolean().default(false),
})

const termSchema = z.object({
  name: z.string().min(1),
  note: z.string().optional(),
  is_active: z.boolean().default(true),
  lines: z.array(lineSchema).min(1),
})

// ─── List ─────────────────────────────────────────────────────────────────────

paymentTermsRouter.get('/', requirePermission('finance.terms.view', 'view'), async (req, res) => {
  try {
    const r = await query(
      `SELECT pt.*,
              COUNT(ptl.id) AS line_count,
              SUM(ptl.value) FILTER (WHERE ptl.is_retention) AS retention_pct,
              COUNT(ptl.id) FILTER (WHERE ptl.is_retention) AS retention_lines
       FROM payment_terms pt
       LEFT JOIN payment_term_lines ptl ON ptl.term_id = pt.id
       WHERE pt.company_id = $1
       GROUP BY pt.id
       ORDER BY pt.name`,
      [req.auth!.companyId],
    )
    sendOk(res, r.rows)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load payment terms', err)
  }
})

// ─── Get with lines ───────────────────────────────────────────────────────────

paymentTermsRouter.get(
  '/:id',
  requirePermission('finance.terms.view', 'view'),
  async (req, res) => {
    try {
      const termRes = await query(`SELECT * FROM payment_terms WHERE id = $1 AND company_id = $2`, [
        req.params['id'],
        req.auth!.companyId,
      ])
      if (!termRes.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Payment term not found')
        return
      }
      const linesRes = await query(
        `SELECT * FROM payment_term_lines WHERE term_id = $1 ORDER BY sequence`,
        [req.params['id']],
      )
      sendOk(res, { ...termRes.rows[0], lines: linesRes.rows })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load payment term', err)
    }
  },
)

// ─── Create ───────────────────────────────────────────────────────────────────

paymentTermsRouter.post('/', requirePermission('finance.terms.edit', 'edit'), async (req, res) => {
  try {
    const d = termSchema.parse(req.body)
    const result = await withTransaction(
      { companyId: req.auth!.companyId, userId: req.auth!.userId, role: req.auth!.role },
      async (client) => {
        const termRes = await client.query(
          `INSERT INTO payment_terms (company_id, name, note, is_active)
           VALUES ($1,$2,$3,$4) RETURNING *`,
          [req.auth!.companyId, d.name, d.note ?? null, d.is_active],
        )
        const term = termRes.rows[0]!
        const lines = []
        for (const line of d.lines) {
          const lr = await client.query(
            `INSERT INTO payment_term_lines (term_id, sequence, description, value_type, value, due_type, days, is_retention)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
            [
              term.id,
              line.sequence,
              line.description ?? null,
              line.value_type,
              line.value,
              line.due_type,
              line.days,
              line.is_retention,
            ],
          )
          lines.push(lr.rows[0])
        }
        return { ...term, lines }
      },
    )
    await logAudit({
      companyId: req.auth!.companyId,
      userId: req.auth!.userId,
      action: 'INSERT',
      tableName: 'payment_terms',
      recordId: result.id as string,
      newValues: { name: d.name },
    })
    sendOk(res, result, 201)
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      sendError(res, 409, 'DUPLICATE', 'Payment term name already exists')
      return
    }
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create payment term', err)
  }
})

// ─── Update (replaces all lines) ──────────────────────────────────────────────

paymentTermsRouter.put(
  '/:id',
  requirePermission('finance.terms.edit', 'edit'),
  async (req, res) => {
    try {
      const d = termSchema.parse(req.body)
      const existing = await query(`SELECT id FROM payment_terms WHERE id=$1 AND company_id=$2`, [
        req.params['id'],
        req.auth!.companyId,
      ])
      if (!existing.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Payment term not found')
        return
      }

      const result = await withTransaction(
        { companyId: req.auth!.companyId, userId: req.auth!.userId, role: req.auth!.role },
        async (client) => {
          const termRes = await client.query(
            `UPDATE payment_terms SET name=$1, note=$2, is_active=$3, updated_at=NOW() WHERE id=$4 RETURNING *`,
            [d.name, d.note ?? null, d.is_active, req.params['id']],
          )
          await client.query(`DELETE FROM payment_term_lines WHERE term_id=$1`, [req.params['id']])
          const lines = []
          for (const line of d.lines) {
            const lr = await client.query(
              `INSERT INTO payment_term_lines (term_id, sequence, description, value_type, value, due_type, days, is_retention)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
              [
                req.params['id'],
                line.sequence,
                line.description ?? null,
                line.value_type,
                line.value,
                line.due_type,
                line.days,
                line.is_retention,
              ],
            )
            lines.push(lr.rows[0])
          }
          return { ...termRes.rows[0], lines }
        },
      )
      sendOk(res, result)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update payment term', err)
    }
  },
)

// ─── Delete ───────────────────────────────────────────────────────────────────

paymentTermsRouter.delete(
  '/:id',
  requirePermission('finance.terms.edit', 'edit'),
  async (req, res) => {
    try {
      const r = await query(
        `DELETE FROM payment_terms WHERE id=$1 AND company_id=$2 RETURNING id`,
        [req.params['id'], req.auth!.companyId],
      )
      if (!r.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Payment term not found')
        return
      }
      sendOk(res, { deleted: true })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to delete payment term', err)
    }
  },
)

// ─── Compute payment schedule ──────────────────────────────────────────────────

paymentTermsRouter.post(
  '/:id/compute',
  requirePermission('finance.terms.view', 'view'),
  async (req, res) => {
    const schema = z.object({
      amount: z.coerce.number().positive(),
      invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    try {
      const { amount, invoice_date } = schema.parse(req.body)
      const linesRes = await query(
        `SELECT ptl.* FROM payment_term_lines ptl
       JOIN payment_terms pt ON pt.id = ptl.term_id
       WHERE ptl.term_id = $1 AND pt.company_id = $2
       ORDER BY ptl.sequence`,
        [req.params['id'], req.auth!.companyId],
      )
      if (!linesRes.rows.length) {
        sendError(res, 404, 'NOT_FOUND', 'Payment term not found or has no lines')
        return
      }

      const baseDate = new Date(invoice_date)

      const schedule = linesRes.rows.map((line) => {
        const lineAmount =
          line['value_type'] === 'percent'
            ? Math.round((Number(line['value']) / 100) * amount * 100) / 100
            : Number(line['value'])

        let dueDate: string | null = null
        const due = line['due_type'] as string

        if (due === 'immediate') {
          dueDate = invoice_date
        } else if (due === 'days') {
          const d = new Date(baseDate)
          d.setDate(d.getDate() + Number(line['days']))
          dueDate = d.toISOString().slice(0, 10)
        } else if (due === 'end_of_month') {
          const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0)
          dueDate = d.toISOString().slice(0, 10)
        } else if (due === 'end_of_next_month') {
          const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + 2, 0)
          dueDate = d.toISOString().slice(0, 10)
        } else if (due === 'retention') {
          dueDate = null // TBD — set on project completion
        }

        return {
          sequence: line['sequence'],
          description:
            line['description'] ??
            (line['is_retention'] ? 'Retention' : `Installment ${line['sequence']}`),
          amount: lineAmount,
          percentage: line['value_type'] === 'percent' ? Number(line['value']) : null,
          due_type: due,
          due_date: dueDate,
          is_retention: line['is_retention'],
        }
      })

      sendOk(res, {
        amount,
        invoice_date,
        schedule,
        total: schedule.reduce((s, l) => s + l.amount, 0),
      })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to compute schedule', err)
    }
  },
)
