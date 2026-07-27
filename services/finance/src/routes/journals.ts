import { Router } from 'express'
import type { IRouter } from 'express'
import { z } from 'zod'
import { pool, query } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { getRate } from '@fnc-erp/fx'
import { checkRateStaleness } from '@fnc-erp/fx/staleness'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const journalsRouter: IRouter = Router()

const JournalLineSchema = z.object({
  account_id: z.string().uuid(),
  analytic_account_id: z.string().uuid().optional(),
  cost_center_id: z.string().uuid().optional(),
  description: z.string().optional(),
  debit: z.number().min(0).default(0),
  credit: z.number().min(0).default(0),
  currency_code: z.string().length(3).default('IQD'),
  fx_rate: z.number().positive().optional(),
})

const CreateJournalSchema = z.object({
  reference: z.string().min(1).max(100),
  description: z.string().optional(),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lines: z.array(JournalLineSchema).min(2),
  force_stale_rate: z.boolean().default(false),
})

journalsRouter.get('/', requirePermission('finance.journals.view', 'view'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const { status, from_date, to_date, source_type, page = '1', limit = '50' } = req.query
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string)

    let sql = `SELECT * FROM journal_entries WHERE company_id = $1`
    const params: unknown[] = [companyId]
    let idx = 2

    if (status) {
      sql += ` AND status = $${idx++}`
      params.push(status)
    }
    if (from_date) {
      sql += ` AND entry_date >= $${idx++}`
      params.push(from_date)
    }
    if (to_date) {
      sql += ` AND entry_date <= $${idx++}`
      params.push(to_date)
    }
    if (source_type) {
      sql += ` AND source_type = $${idx++}`
      params.push(source_type)
    }
    sql += ` ORDER BY entry_date DESC, created_at DESC LIMIT $${idx++} OFFSET $${idx++}`
    params.push(parseInt(limit as string), offset)

    const result = await query(sql, params)
    sendOk(res, result.rows)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch journals', err)
  }
})

journalsRouter.get('/:id', requirePermission('finance.journals.view', 'view'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const jeResult = await query(
      'SELECT * FROM journal_entries WHERE id = $1 AND company_id = $2',
      [req.params['id'], companyId],
    )
    const je = jeResult.rows[0]
    if (!je) {
      sendError(res, 404, 'NOT_FOUND', 'Journal entry not found')
      return
    }

    const linesResult = await query(
      `SELECT jl.*, coa.code AS account_code, coa.name AS account_name
       FROM journal_lines jl
       JOIN chart_of_accounts coa ON coa.id = jl.account_id
       WHERE jl.journal_entry_id = $1`,
      [req.params['id']],
    )
    sendOk(res, { ...je, lines: linesResult.rows })
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch journal', err)
  }
})

journalsRouter.post('/', requirePermission('finance.journals.edit', 'edit'), async (req, res) => {
  const companyId = req.auth!.companyId
  const parsed = CreateJournalSchema.safeParse(req.body)
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
    return
  }

  const { reference, description, entry_date, lines, force_stale_rate } = parsed.data
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Verify open period exists
    const periodCheck = await client.query(
      `SELECT id FROM accounting_periods WHERE company_id = $1 AND status = 'open'
       AND start_date <= $2 AND end_date >= $2`,
      [companyId, entry_date],
    )
    if (!periodCheck.rows[0]) {
      await client.query('ROLLBACK')
      sendError(res, 422, 'NO_OPEN_PERIOD', `No open accounting period for date ${entry_date}`)
      return
    }

    // Verify all accounts belong to this company
    for (const line of lines) {
      const acctCheck = await client.query(
        'SELECT id FROM chart_of_accounts WHERE id = $1 AND company_id = $2 AND is_active = true',
        [line.account_id, companyId],
      )
      if (!acctCheck.rows[0]) {
        await client.query('ROLLBACK')
        sendError(
          res,
          400,
          'INVALID_ACCOUNT',
          `Account ${line.account_id} not found in this company`,
        )
        return
      }
    }

    // Validate and compute fx amounts
    let totalDebitCompany = 0
    let totalCreditCompany = 0
    const processedLines: { line: (typeof lines)[number]; rate: number; amountCompany: number }[] =
      []

    for (const line of lines) {
      if (line.debit > 0 && line.credit > 0) {
        await client.query('ROLLBACK')
        sendError(res, 400, 'INVALID_LINE', 'A journal line cannot have both debit and credit')
        return
      }
      if (line.debit === 0 && line.credit === 0) {
        await client.query('ROLLBACK')
        sendError(res, 400, 'INVALID_LINE', 'A journal line must have either debit or credit > 0')
        return
      }

      let rate = line.fx_rate ?? 1
      if (line.currency_code !== 'IQD' && !line.fx_rate) {
        rate = await getRate(line.currency_code, 'IQD', new Date(entry_date))
      }

      const amount = line.debit > 0 ? line.debit : line.credit
      const amountCompany = Math.round(amount * rate * 10000) / 10000

      if (line.debit > 0) totalDebitCompany += amountCompany
      else totalCreditCompany += amountCompany

      processedLines.push({ line, rate, amountCompany })
    }

    // ── FX staleness check ──────────────────────────────────
    const foreignPairs = [
      ...new Set(
        lines
          .filter((l) => l.currency_code !== 'IQD')
          .map((l) => JSON.stringify({ from: l.currency_code, to: 'IQD' })),
      ),
    ].map((s) => JSON.parse(s) as { from: string; to: string })

    if (foreignPairs.length > 0) {
      const stalenessStatuses = await checkRateStaleness(companyId, foreignPairs)
      const criticalPairs = stalenessStatuses.filter(
        (s) => s.status === 'critical' || s.status === 'missing',
      )
      const warnPairs = stalenessStatuses.filter((s) => s.status === 'warn')

      if (criticalPairs.length > 0 && !force_stale_rate) {
        await client.query('ROLLBACK')
        sendError(
          res,
          422,
          'STALE_FX_RATE',
          `Exchange rate for ${criticalPairs.map((p) => p.currencyPair).join(', ')} is critically stale ` +
            `(${criticalPairs[0]!.ageHours ?? 'unknown'} hours old). ` +
            `Update the rate first or pass force_stale_rate=true to proceed anyway.`,
          { stalePairs: criticalPairs, canForce: true },
        )
        return
      }

      // Attach non-blocking warnings — retrieved after commit for the response
      if (warnPairs.length > 0 || (criticalPairs.length > 0 && force_stale_rate)) {
        const allStalePairs = [...criticalPairs, ...warnPairs]
        res.locals['_fxWarnings'] = allStalePairs.map((p) => ({
          code: 'STALE_FX_RATE_WARNING',
          message: p.message,
          pair: p.currencyPair,
          ageHours: p.ageHours,
        }))
      }
    }

    // Double-entry balance check (allow small floating point tolerance)
    if (Math.abs(totalDebitCompany - totalCreditCompany) > 0.01) {
      await client.query('ROLLBACK')
      sendError(
        res,
        422,
        'UNBALANCED_ENTRY',
        `Journal entry is not balanced. Debits: ${totalDebitCompany.toFixed(4)}, Credits: ${totalCreditCompany.toFixed(4)}`,
      )
      return
    }

    // Create journal entry
    const jeResult = await client.query(
      `INSERT INTO journal_entries (company_id, reference, description, entry_date, status, created_by)
       VALUES ($1,$2,$3,$4,'draft',$5) RETURNING *`,
      [companyId, reference, description ?? null, entry_date, req.auth!.userId],
    )
    const je = jeResult.rows[0]!

    // Insert lines
    for (const { line, rate, amountCompany } of processedLines) {
      await client.query(
        `INSERT INTO journal_lines
           (journal_entry_id, account_id, analytic_account_id, cost_center_id,
            description, debit, credit, currency_code, fx_rate, amount_company_currency)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          je.id,
          line.account_id,
          line.analytic_account_id ?? null,
          line.cost_center_id ?? null,
          line.description ?? null,
          line.debit,
          line.credit,
          line.currency_code,
          rate,
          amountCompany,
        ],
      )
    }

    // Audit inside the same transaction — rolls back if commit fails
    await logAudit({
      companyId,
      userId: req.auth!.userId,
      action: 'CREATE',
      tableName: 'journal_entries',
      recordId: je.id as string,
      newValues: { reference, entry_date, lineCount: lines.length },
      client,
    })

    await client.query('COMMIT')

    // Re-fetch with lines
    const fullJe = await query('SELECT * FROM journal_entries WHERE id = $1', [je.id])
    const fullLines = await query('SELECT * FROM journal_lines WHERE journal_entry_id = $1', [
      je.id,
    ])
    const fxWarnings = res.locals['_fxWarnings'] as unknown[] | undefined
    const payload: Record<string, unknown> = { ...fullJe.rows[0], lines: fullLines.rows }
    if (fxWarnings && fxWarnings.length > 0) payload['warnings'] = fxWarnings
    sendOk(res, payload, 201)
  } catch (err) {
    await client.query('ROLLBACK')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create journal entry', err)
  } finally {
    client.release()
  }
})

journalsRouter.post(
  '/:id/post',
  requirePermission('finance.journals.approve', 'approve'),
  async (req, res) => {
    const companyId = req.auth!.companyId
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const jeResult = await client.query(
        'SELECT * FROM journal_entries WHERE id = $1 AND company_id = $2 FOR UPDATE',
        [req.params['id'], companyId],
      )
      const je = jeResult.rows[0]
      if (!je) {
        await client.query('ROLLBACK')
        sendError(res, 404, 'NOT_FOUND', 'Journal entry not found')
        return
      }
      if ((je as { status: string }).status !== 'draft') {
        await client.query('ROLLBACK')
        sendError(
          res,
          409,
          'ALREADY_PROCESSED',
          `Journal entry is already ${(je as { status: string }).status}`,
        )
        return
      }
      await client.query(
        `UPDATE journal_entries SET status = 'posted', posted_at = NOW(), posted_by = $1, updated_at = NOW() WHERE id = $2`,
        [req.auth!.userId, req.params['id']],
      )

      // If this journal was generated from a vendor payment, mark the payment as posted
      if ((je as { source_type: string; source_id: string }).source_type === 'vendor_payment') {
        await client.query(`UPDATE vendor_payments SET posted = true WHERE id = $1`, [
          (je as { source_id: string }).source_id,
        ])
      }

      await logAudit({
        companyId,
        userId: req.auth!.userId,
        action: 'UPDATE',
        tableName: 'journal_entries',
        recordId: req.params['id']!,
        newValues: { status: 'posted' },
        client,
      })
      // Notify finance team that a journal has been posted
      const jeRef = (je as { reference: string }).reference
      const fuJ = await client.query(
        `SELECT DISTINCT u.id AS user_id FROM users u JOIN user_company_roles ucr ON ucr.user_id=u.id WHERE ucr.company_id=$1 AND (ucr.role IN ('company_admin','system_admin') OR (ucr.module='finance' AND ucr.role IN ('module_admin','module_user'))) AND u.is_active=true`,
        [companyId],
      )
      for (const u of fuJ.rows) {
        await client.query(
          `INSERT INTO service_outbox (service,event_type,payload) VALUES ('notifications','JOURNAL_POSTED',$1)`,
          [
            JSON.stringify({
              userId: u.user_id,
              companyId,
              title: `Journal posted: ${jeRef}`,
              body: `Journal entry ${jeRef} has been posted`,
              data: { journalId: req.params['id'], reference: jeRef },
            }),
          ],
        )
      }
      await client.query('COMMIT')
      const updated = await query('SELECT * FROM journal_entries WHERE id = $1', [req.params['id']])
      sendOk(res, updated.rows[0])
    } catch (err) {
      await client.query('ROLLBACK')
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to post journal entry', err)
    } finally {
      client.release()
    }
  },
)

// ── POST /:id/link-pos — link/unlink POs to a journal entry ─────────────────
journalsRouter.post(
  '/:id/link-pos',
  requirePermission('finance.journals.edit', 'edit'),
  async (req, res) => {
    const companyId = req.auth!.companyId
    const jeId = req.params['id']!
    const { po_ids } = req.body as { po_ids?: string[] }
    if (!Array.isArray(po_ids)) {
      sendError(res, 400, 'VALIDATION_ERROR', 'po_ids must be an array')
      return
    }
    try {
      const jeCheck = await query(`SELECT id FROM journal_entries WHERE id=$1 AND company_id=$2`, [
        jeId,
        companyId,
      ])
      if (!jeCheck.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Journal entry not found')
        return
      }
      // Verify all POs belong to same company
      for (const poId of po_ids) {
        const poCheck = await query(
          `SELECT id FROM purchase_orders WHERE id=$1 AND company_id=$2`,
          [poId, companyId],
        )
        if (!poCheck.rows[0]) {
          sendError(res, 400, 'INVALID_PO', `PO ${poId} not found`)
          return
        }
      }
      // Replace all links
      await query(`DELETE FROM journal_po_links WHERE journal_entry_id=$1`, [jeId])
      for (const poId of po_ids) {
        await query(
          `INSERT INTO journal_po_links (journal_entry_id, po_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [jeId, poId],
        )
      }
      const links = await query(
        `SELECT jpl.po_id, po.po_number, v.name AS vendor_name, po.status, po.total_amount, po.currency_code
       FROM journal_po_links jpl
       JOIN purchase_orders po ON po.id=jpl.po_id
       JOIN vendors v ON v.id=po.vendor_id
       WHERE jpl.journal_entry_id=$1`,
        [jeId],
      )
      sendOk(res, links.rows)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to link POs', err)
    }
  },
)

// ── GET /:id/linked-pos — fetch POs linked to a journal ──────────────────────
journalsRouter.get(
  '/:id/linked-pos',
  requirePermission('finance.journals.view', 'view'),
  async (req, res) => {
    const companyId = req.auth!.companyId
    try {
      const jeCheck = await query(`SELECT id FROM journal_entries WHERE id=$1 AND company_id=$2`, [
        req.params['id'],
        companyId,
      ])
      if (!jeCheck.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Journal entry not found')
        return
      }
      const result = await query(
        `SELECT jpl.po_id, po.po_number, v.name AS vendor_name, po.status, po.total_amount, po.currency_code
       FROM journal_po_links jpl
       JOIN purchase_orders po ON po.id=jpl.po_id
       JOIN vendors v ON v.id=po.vendor_id
       WHERE jpl.journal_entry_id=$1`,
        [req.params['id']],
      )
      sendOk(res, result.rows)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch linked POs', err)
    }
  },
)

// ── POST /:id/audit — auditor signs off on a posted journal ──────────────────
journalsRouter.post(
  '/:id/audit',
  requirePermission('finance.journals.approve', 'approve'),
  async (req, res) => {
    const companyId = req.auth!.companyId
    try {
      const je = await query(
        `SELECT id, status, created_by, reference FROM journal_entries WHERE id=$1 AND company_id=$2`,
        [req.params['id'], companyId],
      )
      if (!je.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Journal entry not found')
        return
      }
      const jeRow = je.rows[0] as { status: string; created_by: string | null; reference: string }
      if (jeRow.status !== 'posted') {
        sendError(res, 422, 'INVALID_STATUS', 'Only posted journals can be audited')
        return
      }
      const r = await query(
        `UPDATE journal_entries SET audited_by=$1, audited_at=NOW(), updated_at=NOW() WHERE id=$2 RETURNING *`,
        [req.auth!.userId, req.params['id']],
      )
      if (jeRow.created_by) {
        query(
          `INSERT INTO service_outbox (service,event_type,payload) VALUES ('notifications','JOURNAL_AUDITED',$1)`,
          [
            JSON.stringify({
              userId: jeRow.created_by,
              companyId,
              title: `Journal audited: ${jeRow.reference}`,
              body: `Journal entry ${jeRow.reference} has been signed off by the auditor`,
              data: { journalId: req.params['id'], reference: jeRow.reference },
            }),
          ],
        ).catch(() => {})
      }
      sendOk(res, r.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to audit journal', err)
    }
  },
)

journalsRouter.post(
  '/:id/cancel',
  requirePermission('finance.journals.approve', 'approve'),
  async (req, res) => {
    const companyId = req.auth!.companyId
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const jeResult = await client.query(
        'SELECT * FROM journal_entries WHERE id = $1 AND company_id = $2 FOR UPDATE',
        [req.params['id'], companyId],
      )
      const je = jeResult.rows[0] as
        | { status: string; id: string; reference: string; entry_date: string }
        | undefined
      if (!je) {
        await client.query('ROLLBACK')
        sendError(res, 404, 'NOT_FOUND', 'Journal entry not found')
        return
      }
      if (je.status === 'cancelled') {
        await client.query('ROLLBACK')
        sendError(res, 409, 'ALREADY_CANCELLED', 'Journal entry is already cancelled')
        return
      }

      // If posted, create a reversal entry first
      if (je.status === 'posted') {
        const linesResult = await client.query(
          'SELECT * FROM journal_lines WHERE journal_entry_id = $1',
          [je.id],
        )
        const reversalJe = await client.query(
          `INSERT INTO journal_entries (company_id, reference, description, entry_date, status, created_by, source_type, source_id)
         VALUES ($1,$2,$3,$4,'posted',$5,'cancellation',$6) RETURNING *`,
          [
            companyId,
            `REV-${je.reference}`,
            `Reversal of ${je.reference}`,
            je.entry_date,
            req.auth!.userId,
            je.id,
          ],
        )
        const reversalId = (reversalJe.rows[0] as { id: string }).id
        for (const line of linesResult.rows as {
          account_id: string
          analytic_account_id: string | null
          cost_center_id: string | null
          description: string | null
          debit: string
          credit: string
          currency_code: string
          fx_rate: string
          amount_company_currency: string
        }[]) {
          await client.query(
            `INSERT INTO journal_lines (journal_entry_id, account_id, analytic_account_id, cost_center_id, description, debit, credit, currency_code, fx_rate, amount_company_currency)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
              reversalId,
              line.account_id,
              line.analytic_account_id,
              line.cost_center_id,
              line.description,
              line.credit,
              line.debit,
              line.currency_code,
              line.fx_rate,
              line.amount_company_currency,
            ],
          )
        }
      }

      await client.query(
        `UPDATE journal_entries SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
        [je.id],
      )
      await logAudit({
        companyId,
        userId: req.auth!.userId,
        action: 'UPDATE',
        tableName: 'journal_entries',
        recordId: je.id,
        newValues: { status: 'cancelled' },
        client,
      })
      // Notify finance team of the cancellation
      const fuCancel = await client.query(
        `SELECT DISTINCT u.id AS user_id FROM users u JOIN user_company_roles ucr ON ucr.user_id=u.id WHERE ucr.company_id=$1 AND (ucr.role IN ('company_admin','system_admin') OR (ucr.module='finance' AND ucr.role IN ('module_admin','module_user'))) AND u.is_active=true`,
        [companyId],
      )
      for (const u of fuCancel.rows) {
        await client.query(
          `INSERT INTO service_outbox (service,event_type,payload) VALUES ('notifications','JOURNAL_CANCELLED',$1)`,
          [
            JSON.stringify({
              userId: u.user_id,
              companyId,
              title: `Journal cancelled: ${je.reference}`,
              body: `Journal entry ${je.reference} has been cancelled${je.status === 'posted' ? ' and a reversal entry has been created' : ''}`,
              data: { journalId: je.id, reference: je.reference },
            }),
          ],
        )
      }
      await client.query('COMMIT')
      const updated = await query('SELECT * FROM journal_entries WHERE id = $1', [je.id])
      sendOk(res, updated.rows[0])
    } catch (err) {
      await client.query('ROLLBACK')
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to cancel journal entry', err)
    } finally {
      client.release()
    }
  },
)
