import { Router } from 'express'
import { z } from 'zod'
import { query, withTransaction } from '@fnc-erp/db'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'
import { logAudit } from '@fnc-erp/audit'

export const retentionRouter: import('express').Router = Router()

function round2(n: number) {
  return Math.round(n * 100) / 100
}

async function nextRecordNumber(companyId: string): Promise<string> {
  const year = new Date().getFullYear()
  const r = await query(
    `SELECT COUNT(*) AS n FROM retention_records WHERE company_id=$1 AND record_number LIKE $2`,
    [companyId, `RET-${year}-%`],
  )
  const seq = Number(r.rows[0]!['n']) + 1
  return `RET-${year}-${String(seq).padStart(4, '0')}`
}

// ─── Summary KPIs ─────────────────────────────────────────────────────────────

retentionRouter.get(
  '/summary',
  requirePermission('finance.retention.view', 'view'),
  async (req, res) => {
    try {
      const r = await query(
        `SELECT
         SUM(retention_amount - released_amount) FILTER (WHERE retention_type='ar' AND status != 'released') AS ar_held,
         SUM(retention_amount - released_amount) FILTER (WHERE retention_type='ap' AND status != 'released') AS ap_held,
         COUNT(*) FILTER (WHERE status='held')                                                                AS total_held_count,
         COUNT(*) FILTER (WHERE status='partially_released')                                                  AS partial_count,
         SUM(retention_amount - released_amount) FILTER (
           WHERE status != 'released' AND expected_release_date <= CURRENT_DATE
         )                                                                                                    AS overdue_amount,
         COUNT(*) FILTER (
           WHERE status != 'released' AND expected_release_date <= CURRENT_DATE
         )                                                                                                    AS overdue_count,
         SUM(retention_amount - released_amount) FILTER (
           WHERE status != 'released'
             AND expected_release_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
         )                                                                                                    AS due_this_month
       FROM retention_records
       WHERE company_id = $1`,
        [req.auth!.companyId],
      )
      sendOk(res, r.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load retention summary', err)
    }
  },
)

// ─── Aging Report ─────────────────────────────────────────────────────────────

retentionRouter.get(
  '/aging',
  requirePermission('finance.retention.view', 'view'),
  async (req, res) => {
    try {
      const r = await query(
        `SELECT
         retention_type,
         SUM(retention_amount - released_amount) FILTER (WHERE expected_release_date > CURRENT_DATE OR expected_release_date IS NULL)           AS not_yet_due,
         SUM(retention_amount - released_amount) FILTER (WHERE expected_release_date BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE)                AS due_0_30,
         SUM(retention_amount - released_amount) FILTER (WHERE expected_release_date BETWEEN CURRENT_DATE - 90 AND CURRENT_DATE - 31)           AS due_31_90,
         SUM(retention_amount - released_amount) FILTER (WHERE expected_release_date BETWEEN CURRENT_DATE - 180 AND CURRENT_DATE - 91)          AS due_91_180,
         SUM(retention_amount - released_amount) FILTER (WHERE expected_release_date < CURRENT_DATE - 180)                                      AS over_180,
         COUNT(*) FILTER (WHERE status != 'released')                                                                                           AS open_count
       FROM retention_records
       WHERE company_id = $1 AND status != 'released'
       GROUP BY retention_type`,
        [req.auth!.companyId],
      )
      sendOk(res, r.rows)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load retention aging', err)
    }
  },
)

// ─── List ─────────────────────────────────────────────────────────────────────

retentionRouter.get('/', requirePermission('finance.retention.view', 'view'), async (req, res) => {
  const { type, status, project_id } = req.query as Record<string, string>
  try {
    const conditions = [`company_id = $1`]
    const vals: unknown[] = [req.auth!.companyId]
    let i = 2
    if (type) {
      conditions.push(`retention_type = $${i++}`)
      vals.push(type)
    }
    if (status) {
      conditions.push(`status = $${i++}`)
      vals.push(status)
    }
    if (project_id) {
      conditions.push(`project_id = $${i++}`)
      vals.push(project_id)
    }

    const r = await query(
      `SELECT *,
              (retention_amount - released_amount) AS outstanding_amount
       FROM retention_records
       WHERE ${conditions.join(' AND ')}
       ORDER BY invoice_date DESC, record_number DESC`,
      vals,
    )
    sendOk(res, r.rows)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load retention records', err)
  }
})

// ─── Get detail with releases ──────────────────────────────────────────────────

retentionRouter.get(
  '/:id',
  requirePermission('finance.retention.view', 'view'),
  async (req, res) => {
    try {
      const rr = await query(
        `SELECT *, (retention_amount - released_amount) AS outstanding_amount,
              ca1.name AS retention_account_name, ca1.code AS retention_account_code,
              ca2.name AS offset_account_name, ca2.code AS offset_account_code
       FROM retention_records rr
       LEFT JOIN chart_of_accounts ca1 ON ca1.id = rr.retention_account_id
       LEFT JOIN chart_of_accounts ca2 ON ca2.id = rr.offset_account_id
       WHERE rr.id = $1 AND rr.company_id = $2`,
        [req.params['id'], req.auth!.companyId],
      )
      if (!rr.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Retention record not found')
        return
      }

      const releases = await query(
        `SELECT rl.*, je.reference AS je_reference
       FROM retention_releases rl
       LEFT JOIN journal_entries je ON je.id = rl.journal_entry_id
       WHERE rl.retention_id = $1
       ORDER BY rl.release_date DESC`,
        [req.params['id']],
      )
      sendOk(res, { ...rr.rows[0], releases: releases.rows })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load retention record', err)
    }
  },
)

// ─── Create ───────────────────────────────────────────────────────────────────

retentionRouter.post('/', requirePermission('finance.retention.edit', 'edit'), async (req, res) => {
  const schema = z.object({
    retention_type: z.enum(['ar', 'ap']),
    source_ref: z.string().optional(),
    project_id: z.string().uuid().optional(),
    project_name: z.string().optional(),
    counterparty_name: z.string().min(1),
    invoice_amount: z.coerce.number().positive(),
    retention_rate: z.coerce.number().min(0.01).max(100),
    invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    expected_release_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    retention_account_id: z.string().uuid().optional(),
    offset_account_id: z.string().uuid().optional(),
    notes: z.string().optional(),
    post_journal_entry: z.boolean().default(true),
  })
  try {
    const d = schema.parse(req.body)
    const retentionAmount = round2((d.retention_rate / 100) * d.invoice_amount)
    const recordNumber = await nextRecordNumber(req.auth!.companyId)

    const result = await withTransaction(
      { companyId: req.auth!.companyId, userId: req.auth!.userId, role: req.auth!.role },
      async (client) => {
        const r = await client.query(
          `INSERT INTO retention_records
             (company_id, record_number, retention_type, source_ref, project_id, project_name,
              counterparty_name, invoice_amount, retention_rate, retention_amount,
              invoice_date, expected_release_date, retention_account_id, offset_account_id, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
          [
            req.auth!.companyId,
            recordNumber,
            d.retention_type,
            d.source_ref ?? null,
            d.project_id ?? null,
            d.project_name ?? null,
            d.counterparty_name,
            d.invoice_amount,
            d.retention_rate,
            retentionAmount,
            d.invoice_date,
            d.expected_release_date ?? null,
            d.retention_account_id ?? null,
            d.offset_account_id ?? null,
            d.notes ?? null,
            req.auth!.userId,
          ],
        )
        const record = r.rows[0]!

        // Post journal entry if accounts configured
        if (d.post_journal_entry && d.retention_account_id && d.offset_account_id) {
          const desc = `Retention ${d.retention_type.toUpperCase()} — ${d.counterparty_name}${d.source_ref ? ` (${d.source_ref})` : ''}`
          const jeRes = await client.query(
            `INSERT INTO journal_entries (company_id, reference, description, entry_date, source_type, status, created_by)
             VALUES ($1,$2,$3,$4,'retention','posted',$5) RETURNING id`,
            [req.auth!.companyId, recordNumber, desc, d.invoice_date, req.auth!.userId],
          )
          const jeId = jeRes.rows[0]!.id as string

          if (d.retention_type === 'ar') {
            // DR Retention Receivable / CR Accounts Receivable
            await client.query(
              `INSERT INTO journal_lines (journal_entry_id,account_id,description,debit,credit,amount_company_currency) VALUES ($1,$2,$3,$4,0,$4)`,
              [jeId, d.retention_account_id, desc, retentionAmount],
            )
            await client.query(
              `INSERT INTO journal_lines (journal_entry_id,account_id,description,debit,credit,amount_company_currency) VALUES ($1,$2,$3,0,$4,$4)`,
              [jeId, d.offset_account_id, desc, retentionAmount],
            )
          } else {
            // DR Accounts Payable / CR Retention Payable
            await client.query(
              `INSERT INTO journal_lines (journal_entry_id,account_id,description,debit,credit,amount_company_currency) VALUES ($1,$2,$3,$4,0,$4)`,
              [jeId, d.offset_account_id, desc, retentionAmount],
            )
            await client.query(
              `INSERT INTO journal_lines (journal_entry_id,account_id,description,debit,credit,amount_company_currency) VALUES ($1,$2,$3,0,$4,$4)`,
              [jeId, d.retention_account_id, desc, retentionAmount],
            )
          }
        }
        return record
      },
    )
    await logAudit({
      companyId: req.auth!.companyId,
      userId: req.auth!.userId,
      action: 'INSERT',
      tableName: 'retention_records',
      recordId: result.id as string,
      newValues: { record_number: recordNumber, type: d.retention_type, amount: retentionAmount },
    })
    sendOk(res, { ...result, outstanding_amount: retentionAmount }, 201)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create retention record', err)
  }
})

// ─── Release ──────────────────────────────────────────────────────────────────

retentionRouter.post(
  '/:id/release',
  requirePermission('finance.retention.edit', 'edit'),
  async (req, res) => {
    const schema = z.object({
      release_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      amount: z.coerce.number().positive(),
      notes: z.string().optional(),
      release_account_id: z.string().uuid().optional(), // AR/AP account to credit/debit on release
    })
    try {
      const d = schema.parse(req.body)

      const recRes = await query(`SELECT * FROM retention_records WHERE id=$1 AND company_id=$2`, [
        req.params['id'],
        req.auth!.companyId,
      ])
      const rec = recRes.rows[0]
      if (!rec) {
        sendError(res, 404, 'NOT_FOUND', 'Retention record not found')
        return
      }
      if (rec['status'] === 'released') {
        sendError(res, 400, 'ALREADY_RELEASED', 'Retention is already fully released')
        return
      }

      const outstanding = round2(Number(rec['retention_amount']) - Number(rec['released_amount']))
      if (d.amount > outstanding + 0.01) {
        sendError(
          res,
          400,
          'EXCESS_AMOUNT',
          `Release amount (${d.amount}) exceeds outstanding retention (${outstanding})`,
        )
        return
      }

      const newReleased = round2(Number(rec['released_amount']) + d.amount)
      const newStatus =
        newReleased >= Number(rec['retention_amount']) - 0.01 ? 'released' : 'partially_released'

      const result = await withTransaction(
        { companyId: req.auth!.companyId, userId: req.auth!.userId, role: req.auth!.role },
        async (client) => {
          let journalEntryId: string | null = null

          const retAcctId = d.release_account_id ?? (rec['retention_account_id'] as string | null)
          const offsetAcctId = rec['offset_account_id'] as string | null

          if (retAcctId && offsetAcctId) {
            const desc = `Retention release — ${rec['counterparty_name'] as string}${rec['source_ref'] ? ` (${rec['source_ref'] as string})` : ''}`
            const jeRes = await client.query(
              `INSERT INTO journal_entries (company_id, reference, description, entry_date, source_type, status, created_by)
             VALUES ($1,$2,$3,$4,'retention_release','posted',$5) RETURNING id`,
              [
                req.auth!.companyId,
                `${rec['record_number'] as string}-REL`,
                desc,
                d.release_date,
                req.auth!.userId,
              ],
            )
            journalEntryId = jeRes.rows[0]!.id as string

            if (rec['retention_type'] === 'ar') {
              // Release AR retention: DR AR (offset) / CR Retention Receivable
              await client.query(
                `INSERT INTO journal_lines (journal_entry_id,account_id,description,debit,credit,amount_company_currency) VALUES ($1,$2,$3,$4,0,$4)`,
                [journalEntryId, offsetAcctId, desc, d.amount],
              )
              await client.query(
                `INSERT INTO journal_lines (journal_entry_id,account_id,description,debit,credit,amount_company_currency) VALUES ($1,$2,$3,0,$4,$4)`,
                [journalEntryId, retAcctId, desc, d.amount],
              )
            } else {
              // Release AP retention: DR Retention Payable / CR AP (offset)
              await client.query(
                `INSERT INTO journal_lines (journal_entry_id,account_id,description,debit,credit,amount_company_currency) VALUES ($1,$2,$3,$4,0,$4)`,
                [journalEntryId, retAcctId, desc, d.amount],
              )
              await client.query(
                `INSERT INTO journal_lines (journal_entry_id,account_id,description,debit,credit,amount_company_currency) VALUES ($1,$2,$3,0,$4,$4)`,
                [journalEntryId, offsetAcctId, desc, d.amount],
              )
            }
          }

          await client.query(
            `INSERT INTO retention_releases (retention_id, company_id, release_date, amount, journal_entry_id, notes, released_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [
              req.params['id'],
              req.auth!.companyId,
              d.release_date,
              d.amount,
              journalEntryId,
              d.notes ?? null,
              req.auth!.userId,
            ],
          )

          const updated = await client.query(
            `UPDATE retention_records
           SET released_amount=$1, status=$2, released_at=CASE WHEN $3='released' THEN NOW() ELSE released_at END,
               release_notes=$4, updated_at=NOW()
           WHERE id=$5 RETURNING *, (retention_amount - released_amount) AS outstanding_amount`,
            [newReleased, newStatus, newStatus, d.notes ?? null, req.params['id']],
          )
          return updated.rows[0]
        },
      )
      await logAudit({
        companyId: req.auth!.companyId,
        userId: req.auth!.userId,
        action: 'UPDATE',
        tableName: 'retention_records',
        recordId: req.params['id'],
        newValues: { released: d.amount, status: newStatus },
      })
      sendOk(res, result)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to release retention', err)
    }
  },
)

// ─── Update expected release date / notes ────────────────────────────────────

retentionRouter.patch(
  '/:id',
  requirePermission('finance.retention.edit', 'edit'),
  async (req, res) => {
    const schema = z.object({
      expected_release_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      notes: z.string().optional(),
      retention_account_id: z.string().uuid().nullable().optional(),
      offset_account_id: z.string().uuid().nullable().optional(),
    })
    try {
      const d = schema.parse(req.body)
      const sets: string[] = []
      const vals: unknown[] = []
      let i = 1
      if (d.expected_release_date !== undefined) {
        sets.push(`expected_release_date=$${i++}`)
        vals.push(d.expected_release_date)
      }
      if (d.notes !== undefined) {
        sets.push(`notes=$${i++}`)
        vals.push(d.notes)
      }
      if (d.retention_account_id !== undefined) {
        sets.push(`retention_account_id=$${i++}`)
        vals.push(d.retention_account_id)
      }
      if (d.offset_account_id !== undefined) {
        sets.push(`offset_account_id=$${i++}`)
        vals.push(d.offset_account_id)
      }
      if (!sets.length) {
        sendError(res, 400, 'NO_CHANGES', 'Nothing to update')
        return
      }
      sets.push('updated_at=NOW()')
      vals.push(req.params['id'], req.auth!.companyId)
      const r = await query(
        `UPDATE retention_records SET ${sets.join(',')} WHERE id=$${i++} AND company_id=$${i++} RETURNING *, (retention_amount-released_amount) AS outstanding_amount`,
        vals,
      )
      if (!r.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Retention record not found')
        return
      }
      sendOk(res, r.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update retention record', err)
    }
  },
)
