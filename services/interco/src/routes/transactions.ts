import { Router } from 'express'
import type { IRouter } from 'express'
import { z } from 'zod'
import { query, withIntercoTransaction } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { getRate } from '@fnc-erp/fx'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const transactionsRouter: IRouter = Router()

const CreateIntercoSchema = z.object({
  to_company_id: z.string().uuid(),
  transaction_type: z.enum([
    'goods_transfer',
    'service_charge',
    'equipment_rental',
    'management_fee',
  ]),
  amount: z.number().positive(),
  currency_code: z.string().length(3).default('IQD'),
  description: z.string().optional(),
  reference: z.string().max(100).optional(),
  from_debit_account_id: z.string().uuid(),
  from_credit_account_id: z.string().uuid(),
  to_debit_account_id: z.string().uuid(),
  to_credit_account_id: z.string().uuid(),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

transactionsRouter.get(
  '/',
  requirePermission('interco.transactions.view', 'view'),
  async (req, res) => {
    try {
      const companyId = req.auth!.companyId
      const { status, page = '1', limit = '50' } = req.query
      const offset = (parseInt(page as string) - 1) * parseInt(limit as string)
      let sql = `SELECT it.*, fc.name AS from_company_name, tc.name AS to_company_name
               FROM interco_transactions it
               JOIN companies fc ON fc.id = it.from_company_id
               JOIN companies tc ON tc.id = it.to_company_id
               WHERE (it.from_company_id = $1 OR it.to_company_id = $1)`
      const params: unknown[] = [companyId]
      let idx = 2
      if (status) {
        sql += ` AND it.status = $${idx++}`
        params.push(status)
      }
      sql += ` ORDER BY it.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`
      params.push(parseInt(limit as string), offset)
      const result = await query(sql, params)
      sendOk(res, result.rows)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch transactions', err)
    }
  },
)

transactionsRouter.get(
  '/:id',
  requirePermission('interco.transactions.view', 'view'),
  async (req, res) => {
    try {
      const companyId = req.auth!.companyId
      const result = await query(
        `SELECT it.*, fc.name AS from_company_name, tc.name AS to_company_name
       FROM interco_transactions it
       JOIN companies fc ON fc.id = it.from_company_id
       JOIN companies tc ON tc.id = it.to_company_id
       WHERE it.id = $1 AND (it.from_company_id = $2 OR it.to_company_id = $2)`,
        [req.params['id'], companyId],
      )
      const row = result.rows[0]
      if (!row) {
        sendError(res, 404, 'NOT_FOUND', 'Transaction not found')
        return
      }
      sendOk(res, row)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch transaction', err)
    }
  },
)

// Create + immediately post interco transaction using a single DB connection.
// withIntercoTransaction switches RLS context mid-transaction using SET LOCAL,
// so both journal entries commit together or neither does.
transactionsRouter.post(
  '/',
  requirePermission('interco.transactions.edit', 'edit'),
  async (req, res) => {
    const companyId = req.auth!.companyId
    const parsed = CreateIntercoSchema.safeParse(req.body)
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
      return
    }

    const {
      to_company_id,
      transaction_type,
      amount,
      currency_code,
      description,
      reference,
      from_debit_account_id,
      from_credit_account_id,
      to_debit_account_id,
      to_credit_account_id,
      entry_date,
    } = parsed.data

    if (companyId === to_company_id) {
      sendError(res, 400, 'SAME_COMPANY', 'from and to company must differ')
      return
    }

    try {
      const tx = await withIntercoTransaction(req.auth!.userId, async (client, switchContext) => {
        // Verify to_company exists
        const toCompany = await client.query('SELECT id FROM companies WHERE id = $1', [
          to_company_id,
        ])
        if (!toCompany.rows[0])
          throw Object.assign(new Error('Target company not found'), {
            code: 'INVALID_COMPANY',
            status: 400,
          })

        // Resolve FX rate outside of RLS context — fx_rates is global
        let fxRate = 1
        if (currency_code !== 'IQD') {
          fxRate = await getRate(currency_code, 'IQD', new Date(entry_date))
        }
        const amountIQD = Math.round(amount * fxRate * 10000) / 10000

        const txRef = reference ?? `INTERCO-${transaction_type.toUpperCase()}-${Date.now()}`
        const jeDesc = description ?? `Inter-company ${transaction_type}`

        // ── FROM company context ──────────────────────────────────────────────
        await switchContext(companyId)

        // Verify open period for from company
        const fromPeriod = await client.query(
          `SELECT id FROM accounting_periods WHERE company_id = $1 AND status = 'open' AND start_date <= $2 AND end_date >= $2`,
          [companyId, entry_date],
        )
        if (!fromPeriod.rows[0])
          throw Object.assign(
            new Error(`No open period for date ${entry_date} in company ${companyId}`),
            { code: 'NO_OPEN_PERIOD', status: 422 },
          )

        const fromJE = await client.query(
          `INSERT INTO journal_entries (company_id, reference, description, entry_date, status, created_by, source_type)
         VALUES ($1,$2,$3,$4,'posted',$5,'interco') RETURNING *`,
          [companyId, txRef, jeDesc, entry_date, req.auth!.userId],
        )
        const fromJEId = (fromJE.rows[0] as { id: string }).id

        await client.query(
          `INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, currency_code, fx_rate, amount_company_currency)
         VALUES ($1,$2,$3,0,$4,$5,$6)`,
          [fromJEId, from_debit_account_id, amount, currency_code, fxRate, amountIQD],
        )
        await client.query(
          `INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, currency_code, fx_rate, amount_company_currency)
         VALUES ($1,$2,0,$3,$4,$5,$6)`,
          [fromJEId, from_credit_account_id, amount, currency_code, fxRate, amountIQD],
        )

        // ── TO company context ────────────────────────────────────────────────
        await switchContext(to_company_id)

        // Verify open period for to company
        const toPeriod = await client.query(
          `SELECT id FROM accounting_periods WHERE company_id = $1 AND status = 'open' AND start_date <= $2 AND end_date >= $2`,
          [to_company_id, entry_date],
        )
        if (!toPeriod.rows[0])
          throw Object.assign(
            new Error(`No open period for date ${entry_date} in company ${to_company_id}`),
            { code: 'NO_OPEN_PERIOD', status: 422 },
          )

        const toJE = await client.query(
          `INSERT INTO journal_entries (company_id, reference, description, entry_date, status, created_by, source_type)
         VALUES ($1,$2,$3,$4,'posted',$5,'interco') RETURNING *`,
          [to_company_id, txRef, jeDesc, entry_date, req.auth!.userId],
        )
        const toJEId = (toJE.rows[0] as { id: string }).id

        await client.query(
          `INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, currency_code, fx_rate, amount_company_currency)
         VALUES ($1,$2,$3,0,$4,$5,$6)`,
          [toJEId, to_debit_account_id, amount, currency_code, fxRate, amountIQD],
        )
        await client.query(
          `INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, currency_code, fx_rate, amount_company_currency)
         VALUES ($1,$2,0,$3,$4,$5,$6)`,
          [toJEId, to_credit_account_id, amount, currency_code, fxRate, amountIQD],
        )

        // ── Back to from company — create the interco_transactions record ─────
        await switchContext(companyId)

        const txResult = await client.query(
          `INSERT INTO interco_transactions (from_company_id, to_company_id, transaction_type, amount, currency_code, fx_rate, description, reference, from_journal_entry_id, to_journal_entry_id, status, created_by, posted_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'posted',$11,NOW()) RETURNING *`,
          [
            companyId,
            to_company_id,
            transaction_type,
            amount,
            currency_code,
            fxRate,
            description ?? null,
            txRef,
            fromJEId,
            toJEId,
            req.auth!.userId,
          ],
        )
        const txRow = txResult.rows[0]!

        // Audit inside the transaction
        await logAudit({
          companyId,
          userId: req.auth!.userId,
          action: 'CREATE',
          tableName: 'interco_transactions',
          recordId: txRow.id as string,
          newValues: { to_company_id, transaction_type, amount, currency_code },
          client,
        })

        return txRow
      })

      sendOk(res, tx, 201)
    } catch (err: unknown) {
      const e = err as { code?: string; status?: number; message?: string }
      if (e.code === 'INVALID_COMPANY') {
        sendError(res, 400, 'INVALID_COMPANY', e.message ?? 'Invalid company')
        return
      }
      if (e.code === 'NO_OPEN_PERIOD') {
        sendError(res, 422, 'NO_OPEN_PERIOD', e.message ?? 'No open period')
        return
      }
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create interco transaction', err)
    }
  },
)

transactionsRouter.post(
  '/:id/approve-company',
  requirePermission('interco.transactions.approve', 'approve'),
  async (req, res) => {
    const companyId = req.auth!.companyId
    const txId = req.params['id']
    try {
      const txResult = await query(
        `SELECT * FROM interco_transactions WHERE id = $1 AND (from_company_id = $2 OR to_company_id = $2)`,
        [txId, companyId],
      )
      const tx = txResult.rows[0] as
        | {
            from_company_id: string
            to_company_id: string
            status: string
          }
        | undefined
      if (!tx) {
        sendError(res, 404, 'NOT_FOUND', 'Transaction not found')
        return
      }
      if (tx.status === 'posted') {
        sendError(res, 409, 'ALREADY_POSTED', 'Transaction already posted')
        return
      }
      if (tx.status === 'cancelled') {
        sendError(res, 409, 'CANCELLED', 'Transaction is cancelled')
        return
      }

      const isFrom = tx.from_company_id === companyId
      const updateSql = isFrom
        ? `UPDATE interco_transactions SET from_company_approved_by=$2, from_company_approved_at=NOW() WHERE id=$1 RETURNING *`
        : `UPDATE interco_transactions SET to_company_approved_by=$2, to_company_approved_at=NOW() WHERE id=$1 RETURNING *`

      const updated = await query(updateSql, [txId, req.auth!.userId])
      sendOk(res, updated.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to approve transaction', err)
    }
  },
)

transactionsRouter.post(
  '/:id/cancel',
  requirePermission('interco.transactions.approve', 'approve'),
  async (req, res) => {
    const companyId = req.auth!.companyId
    try {
      const tx = await withIntercoTransaction(req.auth!.userId, async (client, switchContext) => {
        await switchContext(companyId)

        const txResult = await client.query(
          'SELECT * FROM interco_transactions WHERE id = $1 AND from_company_id = $2 FOR UPDATE',
          [req.params['id'], companyId],
        )
        const txRow = txResult.rows[0] as
          | {
              id: string
              status: string
              from_journal_entry_id: string
              to_journal_entry_id: string
              to_company_id: string
            }
          | undefined
        if (!txRow)
          throw Object.assign(new Error('Transaction not found'), {
            code: 'NOT_FOUND',
            status: 404,
          })
        if (txRow.status === 'cancelled')
          throw Object.assign(new Error('Already cancelled'), {
            code: 'ALREADY_CANCELLED',
            status: 409,
          })

        // Cancel from-side journal entry
        await switchContext(companyId)
        await client.query(
          `UPDATE journal_entries SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
          [txRow.from_journal_entry_id],
        )

        // Cancel to-side journal entry
        await switchContext(txRow.to_company_id)
        await client.query(
          `UPDATE journal_entries SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
          [txRow.to_journal_entry_id],
        )

        // Update interco record
        await switchContext(companyId)
        await client.query(
          `UPDATE interco_transactions SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
          [txRow.id],
        )

        await logAudit({
          companyId,
          userId: req.auth!.userId,
          action: 'UPDATE',
          tableName: 'interco_transactions',
          recordId: txRow.id,
          newValues: { status: 'cancelled' },
          client,
        })

        return txRow.id
      })

      const updated = await query('SELECT * FROM interco_transactions WHERE id = $1', [tx])
      sendOk(res, updated.rows[0])
    } catch (err: unknown) {
      const e = err as { code?: string; status?: number; message?: string }
      if (e.code === 'NOT_FOUND') {
        sendError(res, 404, 'NOT_FOUND', e.message ?? 'Not found')
        return
      }
      if (e.code === 'ALREADY_CANCELLED') {
        sendError(res, 409, 'ALREADY_CANCELLED', e.message ?? 'Already cancelled')
        return
      }
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to cancel transaction', err)
    }
  },
)
