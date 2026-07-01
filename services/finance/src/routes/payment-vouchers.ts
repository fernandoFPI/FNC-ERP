import { Router } from 'express'
import type { IRouter } from 'express'
import { z } from 'zod'
import { pool, query } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const paymentVouchersRouter: IRouter = Router()

const VoucherLineSchema = z.object({
  statement:  z.string().min(1),
  acct_1:     z.string().max(30).optional(),
  acct_2:     z.string().max(30).optional(),
  acct_3:     z.string().max(30).optional(),
  acct_4:     z.string().max(30).optional(),
  acct_5:     z.string().max(30).optional(),
  amount_iqd: z.number().min(0).default(0),
  amount_usd: z.number().min(0).default(0),
  sequence:   z.number().int().default(1),
})

const CreateVoucherSchema = z.object({
  voucher_number:    z.string().min(1).max(50),
  voucher_date:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  received_from:     z.string().min(1),
  reference_to:      z.string().optional(),
  bank_account_fund: z.string().optional(),
  receiver_name:     z.string().optional(),
  notes:             z.string().optional(),
  lines:             z.array(VoucherLineSchema).min(1),
  journal_ids:       z.array(z.string().uuid()).optional(),
})

// ── GET / — list payment vouchers ────────────────────────────────────────────
paymentVouchersRouter.get('/', requirePermission('finance.journals.view', 'view'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const { status, from_date, to_date, page = '1', limit = '50' } = req.query
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string)

    let sql = `
      SELECT pv.*,
             COALESCE(u.first_name || ' ' || u.last_name, u.email) AS created_by_email,
             COALESCE(cb.first_name || ' ' || cb.last_name, cb.email) AS cashier_email,
             COALESCE(ab.first_name || ' ' || ab.last_name, ab.email) AS auditor_email,
             (SELECT COUNT(*) FROM payment_voucher_journals pvj WHERE pvj.payment_voucher_id=pv.id) AS journal_count
      FROM payment_vouchers pv
      LEFT JOIN users u  ON u.id  = pv.created_by
      LEFT JOIN users cb ON cb.id = pv.cashier_id
      LEFT JOIN users ab ON ab.id = pv.audited_by
      WHERE pv.company_id = $1`
    const params: unknown[] = [companyId]
    let idx = 2
    if (status)    { sql += ` AND pv.status = $${idx++}`;          params.push(status) }
    if (from_date) { sql += ` AND pv.voucher_date >= $${idx++}`;   params.push(from_date) }
    if (to_date)   { sql += ` AND pv.voucher_date <= $${idx++}`;   params.push(to_date) }
    sql += ` ORDER BY pv.voucher_date DESC, pv.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`
    params.push(parseInt(limit as string), offset)
    sendOk(res, (await query(sql, params)).rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch payment vouchers', err) }
})

// ── GET /:id — single voucher with lines + linked journals ────────────────────
paymentVouchersRouter.get('/:id', requirePermission('finance.journals.view', 'view'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const pv = await query(
      `SELECT pv.*,
              COALESCE(u.first_name || ' ' || u.last_name, u.email) AS created_by_email,
              COALESCE(cb.first_name || ' ' || cb.last_name, cb.email) AS cashier_email,
              COALESCE(ab.first_name || ' ' || ab.last_name, ab.email) AS auditor_email
       FROM payment_vouchers pv
       LEFT JOIN users u  ON u.id  = pv.created_by
       LEFT JOIN users cb ON cb.id = pv.cashier_id
       LEFT JOIN users ab ON ab.id = pv.audited_by
       WHERE pv.id=$1 AND pv.company_id=$2`, [req.params['id'], companyId])
    if (!pv.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Payment voucher not found')

    const [lines, journals] = await Promise.all([
      query(`SELECT * FROM payment_voucher_lines WHERE payment_voucher_id=$1 ORDER BY sequence`, [req.params['id']]),
      query(
        `SELECT je.id, je.reference, je.entry_date, je.status, je.description,
                je.audited_at,
                COALESCE(json_agg(DISTINCT jsonb_build_object('po_id',jpl.po_id,'po_number',po.po_number))
                  FILTER (WHERE jpl.po_id IS NOT NULL), '[]') AS linked_pos
         FROM payment_voucher_journals pvj
         JOIN journal_entries je ON je.id=pvj.journal_entry_id
         LEFT JOIN journal_po_links jpl ON jpl.journal_entry_id=je.id
         LEFT JOIN purchase_orders po ON po.id=jpl.po_id
         WHERE pvj.payment_voucher_id=$1
         GROUP BY je.id`, [req.params['id']]),
    ])
    sendOk(res, { ...pv.rows[0], lines: lines.rows, journals: journals.rows })
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch payment voucher', err) }
})

// ── POST / — create payment voucher ──────────────────────────────────────────
paymentVouchersRouter.post('/', requirePermission('finance.journals.edit', 'edit'), async (req, res) => {
  const companyId = req.auth!.companyId
  const parsed = CreateVoucherSchema.safeParse(req.body)
  if (!parsed.success) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
  const { voucher_number, voucher_date, received_from, reference_to, bank_account_fund, receiver_name, notes, lines, journal_ids } = parsed.data

  // Compute totals from lines
  const total_iqd = lines.reduce((s, l) => s + l.amount_iqd, 0)
  const total_usd = lines.reduce((s, l) => s + l.amount_usd, 0)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const pvResult = await client.query(
      `INSERT INTO payment_vouchers
         (company_id, voucher_number, voucher_date, received_from, reference_to, bank_account_fund,
          receiver_name, notes, total_amount_iqd, total_amount_usd, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [companyId, voucher_number, voucher_date, received_from, reference_to ?? null,
       bank_account_fund ?? null, receiver_name ?? null, notes ?? null,
       total_iqd, total_usd, req.auth!.userId],
    )
    const pv = pvResult.rows[0] as { id: string }

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]!
      await client.query(
        `INSERT INTO payment_voucher_lines
           (payment_voucher_id, statement, acct_1, acct_2, acct_3, acct_4, acct_5,
            amount_iqd, amount_usd, sequence)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [pv.id, l.statement, l.acct_1 ?? null, l.acct_2 ?? null, l.acct_3 ?? null,
         l.acct_4 ?? null, l.acct_5 ?? null, l.amount_iqd, l.amount_usd, l.sequence || i + 1],
      )
    }

    // Link journals
    for (const jeId of journal_ids ?? []) {
      const jeCheck = await client.query(
        `SELECT id FROM journal_entries WHERE id=$1 AND company_id=$2`, [jeId, companyId])
      if (jeCheck.rows[0]) {
        await client.query(
          `INSERT INTO payment_voucher_journals (payment_voucher_id, journal_entry_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [pv.id, jeId],
        )
      }
    }

    await logAudit({ companyId, userId: req.auth!.userId, action: 'CREATE', tableName: 'payment_vouchers', recordId: pv.id, newValues: { voucher_number, voucher_date, total_iqd, total_usd }, client })
    await client.query('COMMIT')
    const full = await query(`SELECT * FROM payment_vouchers WHERE id=$1`, [pv.id])
    sendOk(res, full.rows[0], 201)
  } catch (err) {
    await client.query('ROLLBACK')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create payment voucher', err)
  } finally { client.release() }
})

// ── PATCH /:id — update draft voucher ────────────────────────────────────────
paymentVouchersRouter.patch('/:id', requirePermission('finance.journals.edit', 'edit'), async (req, res) => {
  const companyId = req.auth!.companyId
  const pvId = req.params['id'] as string
  const parsed = CreateVoucherSchema.partial().safeParse(req.body)
  if (!parsed.success) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
  const d = parsed.data

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const pvCheck = await client.query(`SELECT id, status FROM payment_vouchers WHERE id=$1 AND company_id=$2 FOR UPDATE`, [pvId, companyId])
    const pv = pvCheck.rows[0] as { id: string; status: string } | undefined
    if (!pv) { await client.query('ROLLBACK'); return sendError(res, 404, 'NOT_FOUND', 'Payment voucher not found') }
    if (pv.status !== 'draft') { await client.query('ROLLBACK'); return sendError(res, 422, 'NOT_DRAFT', 'Only draft vouchers can be edited') }

    const total_iqd = d.lines ? d.lines.reduce((s, l) => s + (l.amount_iqd ?? 0), 0) : undefined
    const total_usd = d.lines ? d.lines.reduce((s, l) => s + (l.amount_usd ?? 0), 0) : undefined

    await client.query(
      `UPDATE payment_vouchers SET
         voucher_number    = COALESCE($1, voucher_number),
         voucher_date      = COALESCE($2, voucher_date),
         received_from     = COALESCE($3, received_from),
         reference_to      = COALESCE($4, reference_to),
         bank_account_fund = COALESCE($5, bank_account_fund),
         receiver_name     = COALESCE($6, receiver_name),
         notes             = COALESCE($7, notes),
         total_amount_iqd  = COALESCE($8, total_amount_iqd),
         total_amount_usd  = COALESCE($9, total_amount_usd),
         updated_at        = NOW()
       WHERE id=$10`,
      [d.voucher_number ?? null, d.voucher_date ?? null, d.received_from ?? null,
       d.reference_to ?? null, d.bank_account_fund ?? null, d.receiver_name ?? null,
       d.notes ?? null, total_iqd ?? null, total_usd ?? null, pvId],
    )

    if (d.lines) {
      await client.query(`DELETE FROM payment_voucher_lines WHERE payment_voucher_id=$1`, [pvId])
      for (let i = 0; i < d.lines.length; i++) {
        const l = d.lines[i]!
        await client.query(
          `INSERT INTO payment_voucher_lines (payment_voucher_id, statement, acct_1, acct_2, acct_3, acct_4, acct_5, amount_iqd, amount_usd, sequence)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [pvId, l.statement, l.acct_1 ?? null, l.acct_2 ?? null, l.acct_3 ?? null, l.acct_4 ?? null, l.acct_5 ?? null, l.amount_iqd ?? 0, l.amount_usd ?? 0, l.sequence || i + 1],
        )
      }
    }

    if (d.journal_ids !== undefined) {
      await client.query(`DELETE FROM payment_voucher_journals WHERE payment_voucher_id=$1`, [pvId])
      for (const jeId of d.journal_ids ?? []) {
        const jeCheck = await client.query(`SELECT id FROM journal_entries WHERE id=$1 AND company_id=$2`, [jeId, companyId])
        if (jeCheck.rows[0]) {
          await client.query(`INSERT INTO payment_voucher_journals (payment_voucher_id, journal_entry_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [pvId, jeId])
        }
      }
    }

    await client.query('COMMIT')
    const full = await query(`SELECT * FROM payment_vouchers WHERE id=$1`, [pvId])
    sendOk(res, full.rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update payment voucher', err)
  } finally { client.release() }
})

// ── POST /:id/approve — auditor approves ─────────────────────────────────────
paymentVouchersRouter.post('/:id/approve', requirePermission('finance.journals.approve', 'approve'), async (req, res) => {
  const companyId = req.auth!.companyId
  try {
    const pv = await query(`SELECT id, status, created_by, voucher_number, total_amount_iqd, total_amount_usd FROM payment_vouchers WHERE id=$1 AND company_id=$2`, [req.params['id'], companyId])
    if (!pv.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Payment voucher not found')
    const pvRow = pv.rows[0] as { status: string; created_by: string | null; voucher_number: string; total_amount_iqd: string; total_amount_usd: string }
    if (pvRow.status !== 'draft')
      return sendError(res, 422, 'INVALID_STATUS', 'Only draft vouchers can be approved')
    const r = await query(
      `UPDATE payment_vouchers SET status='approved', audited_by=$1, audited_at=NOW(), updated_at=NOW() WHERE id=$2 RETURNING *`,
      [req.auth!.userId, req.params['id']])
    await logAudit({ companyId, userId: req.auth!.userId, action: 'UPDATE', tableName: 'payment_vouchers', recordId: req.params['id']!, newValues: { status: 'approved' } })
    if (pvRow.created_by) {
      query(`INSERT INTO service_outbox (service,event_type,payload) VALUES ('notifications','PAYMENT_VOUCHER_APPROVED',$1)`, [JSON.stringify({ userId: pvRow.created_by, companyId, title: `Payment voucher approved: ${pvRow.voucher_number}`, body: `Payment voucher ${pvRow.voucher_number} has been approved by the auditor and is ready for payment`, data: { pvId: req.params['id'], voucherNumber: pvRow.voucher_number } })]).catch(() => {})
    }
    sendOk(res, r.rows[0])
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to approve payment voucher', err) }
})

// ── POST /:id/mark-paid — mark as paid ───────────────────────────────────────
paymentVouchersRouter.post('/:id/mark-paid', requirePermission('finance.journals.approve', 'approve'), async (req, res) => {
  const companyId = req.auth!.companyId
  try {
    const pv = await query(`SELECT id, status, created_by, audited_by, voucher_number FROM payment_vouchers WHERE id=$1 AND company_id=$2`, [req.params['id'], companyId])
    if (!pv.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Payment voucher not found')
    const pvRow2 = pv.rows[0] as { status: string; created_by: string | null; audited_by: string | null; voucher_number: string }
    if (pvRow2.status !== 'approved')
      return sendError(res, 422, 'INVALID_STATUS', 'Voucher must be approved before marking as paid')
    const r = await query(
      `UPDATE payment_vouchers SET status='paid', cashier_id=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [req.auth!.userId, req.params['id']])
    // Notify the creator and auditor that the voucher has been paid
    for (const userId of [pvRow2.created_by, pvRow2.audited_by].filter(Boolean) as string[]) {
      query(`INSERT INTO service_outbox (service,event_type,payload) VALUES ('notifications','PAYMENT_VOUCHER_PAID',$1)`, [JSON.stringify({ userId, companyId, title: `Payment voucher paid: ${pvRow2.voucher_number}`, body: `Payment voucher ${pvRow2.voucher_number} has been marked as paid by the cashier`, data: { pvId: req.params['id'], voucherNumber: pvRow2.voucher_number } })]).catch(() => {})
    }
    sendOk(res, r.rows[0])
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to mark as paid', err) }
})
