import { Router } from 'express'
import { z } from 'zod'
import { query, withTransaction } from '@fnc-erp/db'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'
import { logAudit } from '@fnc-erp/audit'

export const pettyCashRouter: import('express').Router = Router()

async function nextReplenNumber(companyId: string): Promise<string> {
  const yr = new Date().getFullYear()
  const res = await query(
    `SELECT COUNT(*)+1 AS n FROM petty_cash_replenishments WHERE company_id=$1 AND replenishment_number LIKE $2`,
    [companyId, `PCR-${yr}-%`],
  )
  return `PCR-${yr}-${String(Number(res.rows[0]!['n'])).padStart(4, '0')}`
}

// ─── Float CRUD ───────────────────────────────────────────────────────────────

pettyCashRouter.get(
  '/floats',
  requirePermission('finance.petty_cash.view', 'view'),
  async (req, res) => {
    try {
      const r = await query(
        `SELECT f.*, a.code AS account_code, a.name AS account_name,
              ROUND((f.current_balance::NUMERIC / NULLIF(f.authorized_limit,0))*100, 1) AS pct_remaining
       FROM petty_cash_floats f
       LEFT JOIN chart_of_accounts a ON a.id = f.gl_account_id
       WHERE f.company_id=$1 ORDER BY f.name`,
        [req.auth!.companyId],
      )
      sendOk(res, r.rows)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load floats', err)
    }
  },
)

pettyCashRouter.post(
  '/floats',
  requirePermission('finance.petty_cash.edit', 'edit'),
  async (req, res) => {
    const schema = z.object({
      name: z.string().min(1),
      location: z.string().optional(),
      custodian_name: z.string().optional(),
      currency_code: z.string().length(3).default('IQD'),
      authorized_limit: z.coerce.number().positive(),
      opening_balance: z.coerce.number().min(0).default(0),
      gl_account_id: z.string().uuid().optional(),
      notes: z.string().optional(),
    })
    try {
      const d = schema.parse(req.body)
      const result = await withTransaction(
        { companyId: req.auth!.companyId, userId: req.auth!.userId, role: req.auth!.role },
        async (client) => {
          const fRes = await client.query(
            `INSERT INTO petty_cash_floats (company_id, name, location, custodian_name, currency_code, authorized_limit, current_balance, gl_account_id, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [
              req.auth!.companyId,
              d.name,
              d.location ?? null,
              d.custodian_name ?? null,
              d.currency_code,
              d.authorized_limit,
              d.opening_balance,
              d.gl_account_id ?? null,
              d.notes ?? null,
            ],
          )
          const float_ = fRes.rows[0]!
          if (d.opening_balance > 0) {
            const balance = d.opening_balance
            await client.query(
              `INSERT INTO petty_cash_transactions (float_id, company_id, transaction_date, description, amount, transaction_type, balance_after, created_by)
             VALUES ($1,$2,NOW(),'Opening balance',$3,'opening',$4,$5)`,
              [float_.id, req.auth!.companyId, balance, balance, req.auth!.userId],
            )
          }
          return float_
        },
      )
      sendOk(res, result, 201)
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        sendError(res, 409, 'DUPLICATE', 'Float name already exists')
        return
      }
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create float', err)
    }
  },
)

pettyCashRouter.put(
  '/floats/:id',
  requirePermission('finance.petty_cash.edit', 'edit'),
  async (req, res) => {
    const schema = z.object({
      name: z.string().min(1),
      location: z.string().optional(),
      custodian_name: z.string().optional(),
      authorized_limit: z.coerce.number().positive(),
      gl_account_id: z.string().uuid().optional(),
      is_active: z.boolean().default(true),
      notes: z.string().optional(),
    })
    try {
      const d = schema.parse(req.body)
      const r = await query(
        `UPDATE petty_cash_floats SET name=$1, location=$2, custodian_name=$3, authorized_limit=$4, gl_account_id=$5, is_active=$6, notes=$7, updated_at=NOW()
       WHERE id=$8 AND company_id=$9 RETURNING *`,
        [
          d.name,
          d.location ?? null,
          d.custodian_name ?? null,
          d.authorized_limit,
          d.gl_account_id ?? null,
          d.is_active,
          d.notes ?? null,
          req.params['id'],
          req.auth!.companyId,
        ],
      )
      if (!r.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Float not found')
        return
      }
      sendOk(res, r.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update float', err)
    }
  },
)

// ─── Float detail + transactions ──────────────────────────────────────────────

pettyCashRouter.get(
  '/floats/:id',
  requirePermission('finance.petty_cash.view', 'view'),
  async (req, res) => {
    try {
      const fRes = await query(
        `SELECT f.*, a.code AS account_code, a.name AS account_name
       FROM petty_cash_floats f LEFT JOIN chart_of_accounts a ON a.id=f.gl_account_id
       WHERE f.id=$1 AND f.company_id=$2`,
        [req.params['id'], req.auth!.companyId],
      )
      if (!fRes.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Float not found')
        return
      }

      const txnRes = await query(
        `SELECT t.*, cat.name AS resolved_category
       FROM petty_cash_transactions t
       LEFT JOIN expense_categories cat ON cat.id = t.category_id
       WHERE t.float_id=$1 ORDER BY t.transaction_date DESC, t.created_at DESC LIMIT 100`,
        [req.params['id']],
      )
      const repRes = await query(
        `SELECT * FROM petty_cash_replenishments WHERE float_id=$1 ORDER BY created_at DESC LIMIT 20`,
        [req.params['id']],
      )
      sendOk(res, { ...fRes.rows[0], transactions: txnRes.rows, replenishments: repRes.rows })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load float', err)
    }
  },
)

// ─── Record spend ─────────────────────────────────────────────────────────────

pettyCashRouter.post(
  '/floats/:id/spend',
  requirePermission('finance.petty_cash.edit', 'edit'),
  async (req, res) => {
    const schema = z.object({
      transaction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      description: z.string().min(1),
      amount: z.coerce.number().positive(),
      category_id: z.string().uuid().optional(),
      category_name: z.string().optional(),
      gl_account_id: z.string().uuid().optional(),
      receipt_url: z.string().url().optional(),
    })
    try {
      const d = schema.parse(req.body)
      const floatRes = await query(
        `SELECT * FROM petty_cash_floats WHERE id=$1 AND company_id=$2`,
        [req.params['id'], req.auth!.companyId],
      )
      if (!floatRes.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Float not found')
        return
      }
      const float_ = floatRes.rows[0]
      if (Number(float_['current_balance']) < d.amount) {
        sendError(
          res,
          422,
          'INSUFFICIENT_BALANCE',
          `Insufficient balance. Current: ${float_['current_balance']}`,
        )
        return
      }

      const newBalance = Math.round((Number(float_['current_balance']) - d.amount) * 100) / 100
      const result = await withTransaction(
        { companyId: req.auth!.companyId, userId: req.auth!.userId, role: req.auth!.role },
        async (client) => {
          const txnRes = await client.query(
            `INSERT INTO petty_cash_transactions (float_id, company_id, transaction_date, description, category_id, category_name, gl_account_id, amount, transaction_type, balance_after, receipt_url, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'spend',$9,$10,$11) RETURNING *`,
            [
              req.params['id'],
              req.auth!.companyId,
              d.transaction_date,
              d.description,
              d.category_id ?? null,
              d.category_name ?? null,
              d.gl_account_id ?? null,
              d.amount,
              newBalance,
              d.receipt_url ?? null,
              req.auth!.userId,
            ],
          )
          await client.query(
            `UPDATE petty_cash_floats SET current_balance=$1, updated_at=NOW() WHERE id=$2`,
            [newBalance, req.params['id']],
          )

          // Post JE if GL account provided
          if (d.gl_account_id && float_['gl_account_id']) {
            const jeRes = await client.query(
              `INSERT INTO journal_entries (company_id, entry_date, reference, description, currency_code, status, created_by)
             VALUES ($1,$2,'PETTY','Petty cash spend: '||$3,$4,'posted',$5) RETURNING id`,
              [
                req.auth!.companyId,
                d.transaction_date,
                d.description,
                float_['currency_code'],
                req.auth!.userId,
              ],
            )
            const jeId = jeRes.rows[0]!.id as string
            await client.query(
              `INSERT INTO journal_lines (journal_entry_id, company_id, account_id, currency_code, debit, credit, description)
             VALUES ($1,$2,$3,$4,$5,0,$6),($1,$2,$7,$4,0,$5,$6)`,
              [
                jeId,
                req.auth!.companyId,
                d.gl_account_id,
                float_['currency_code'],
                d.amount,
                d.description,
                float_['gl_account_id'],
              ],
            )
            await client.query(
              `UPDATE petty_cash_transactions SET journal_entry_id=$1 WHERE id=$2`,
              [jeId, txnRes.rows[0]!.id],
            )
          }
          return txnRes.rows[0]
        },
      )
      sendOk(res, result, 201)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to record spend', err)
    }
  },
)

// ─── Request replenishment ────────────────────────────────────────────────────

pettyCashRouter.post(
  '/floats/:id/replenish',
  requirePermission('finance.petty_cash.edit', 'edit'),
  async (req, res) => {
    const schema = z.object({
      requested_amount: z.coerce.number().positive(),
      notes: z.string().optional(),
    })
    try {
      const { requested_amount, notes } = schema.parse(req.body)
      const existing = await query(
        `SELECT id FROM petty_cash_floats WHERE id=$1 AND company_id=$2`,
        [req.params['id'], req.auth!.companyId],
      )
      if (!existing.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Float not found')
        return
      }

      const num = await nextReplenNumber(req.auth!.companyId)
      const r = await query(
        `INSERT INTO petty_cash_replenishments (float_id, company_id, replenishment_number, requested_amount, notes, requested_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [
          req.params['id'],
          req.auth!.companyId,
          num,
          requested_amount,
          notes ?? null,
          req.auth!.userId,
        ],
      )
      sendOk(res, r.rows[0], 201)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create replenishment request', err)
    }
  },
)

// ─── Approve + post replenishment ─────────────────────────────────────────────

pettyCashRouter.post(
  '/replenishments/:replenId/approve',
  requirePermission('finance.petty_cash.approve', 'approve'),
  async (req, res) => {
    const schema = z.object({
      approved_amount: z.coerce.number().positive(),
      bank_account_id: z.string().uuid().optional(),
      offset_account_id: z.string().uuid().optional(),
    })
    try {
      const { approved_amount, offset_account_id } = schema.parse(req.body)
      const repRes = await query(
        `SELECT r.*, f.gl_account_id AS float_gl_account_id, f.currency_code, f.current_balance
       FROM petty_cash_replenishments r
       JOIN petty_cash_floats f ON f.id=r.float_id
       WHERE r.id=$1 AND r.company_id=$2 AND r.status='pending'`,
        [req.params['replenId'], req.auth!.companyId],
      )
      if (!repRes.rows[0]) {
        sendError(res, 409, 'INVALID_STATUS', 'Replenishment not found or not pending')
        return
      }
      const rep = repRes.rows[0]

      const newBalance = Math.round((Number(rep['current_balance']) + approved_amount) * 100) / 100

      const result = await withTransaction(
        { companyId: req.auth!.companyId, userId: req.auth!.userId, role: req.auth!.role },
        async (client) => {
          let jeId: string | null = null
          if (rep['float_gl_account_id'] && offset_account_id) {
            const jeRes = await client.query(
              `INSERT INTO journal_entries (company_id, entry_date, reference, description, currency_code, status, created_by)
             VALUES ($1,NOW(),$2,'Petty cash replenishment',$3,'posted',$4) RETURNING id`,
              [
                req.auth!.companyId,
                rep['replenishment_number'],
                rep['currency_code'],
                req.auth!.userId,
              ],
            )
            jeId = jeRes.rows[0]!.id as string
            // DR Petty Cash / CR Bank (offset)
            await client.query(
              `INSERT INTO journal_lines (journal_entry_id, company_id, account_id, currency_code, debit, credit, description)
             VALUES ($1,$2,$3,$4,$5,0,'Petty cash top-up'),($1,$2,$6,$4,0,$5,'Petty cash top-up')`,
              [
                jeId,
                req.auth!.companyId,
                rep['float_gl_account_id'],
                rep['currency_code'],
                approved_amount,
                offset_account_id,
              ],
            )
          }

          await client.query(
            `UPDATE petty_cash_replenishments SET status='posted', approved_amount=$1, approved_by=$2, approved_at=NOW(), journal_entry_id=$3 WHERE id=$4`,
            [approved_amount, req.auth!.userId, jeId, req.params['replenId']],
          )
          await client.query(
            `UPDATE petty_cash_floats SET current_balance=$1, updated_at=NOW() WHERE id=$2`,
            [newBalance, rep['float_id']],
          )
          await client.query(
            `INSERT INTO petty_cash_transactions (float_id, company_id, transaction_date, description, amount, transaction_type, balance_after, journal_entry_id, created_by)
           VALUES ($1,$2,NOW(),'Replenishment — '||$3,$4,'replenishment',$5,$6,$7)`,
            [
              rep['float_id'],
              req.auth!.companyId,
              rep['replenishment_number'],
              approved_amount,
              newBalance,
              jeId,
              req.auth!.userId,
            ],
          )
          return { approved: true, new_balance: newBalance, journal_entry_id: jeId }
        },
      )
      await logAudit({
        companyId: req.auth!.companyId,
        userId: req.auth!.userId,
        action: 'UPDATE',
        tableName: 'petty_cash_replenishments',
        recordId: req.params['replenId'],
        newValues: { status: 'posted', approved_amount },
      })
      sendOk(res, result)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to approve replenishment', err)
    }
  },
)

pettyCashRouter.post(
  '/replenishments/:replenId/reject',
  requirePermission('finance.petty_cash.approve', 'approve'),
  async (req, res) => {
    const schema = z.object({ reason: z.string().min(1) })
    try {
      const { reason } = schema.parse(req.body)
      const r = await query(
        `UPDATE petty_cash_replenishments SET status='rejected', rejection_reason=$1, approved_by=$2, approved_at=NOW() WHERE id=$3 AND company_id=$4 AND status='pending' RETURNING *`,
        [reason, req.auth!.userId, req.params['replenId'], req.auth!.companyId],
      )
      if (!r.rows[0]) {
        sendError(res, 409, 'INVALID_STATUS', 'Replenishment not found or not pending')
        return
      }
      sendOk(res, r.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to reject replenishment', err)
    }
  },
)

// ─── All pending replenishments (finance view) ────────────────────────────────

pettyCashRouter.get(
  '/replenishments',
  requirePermission('finance.petty_cash.view', 'view'),
  async (req, res) => {
    try {
      const r = await query(
        `SELECT pr.*, f.name AS float_name, f.currency_code
       FROM petty_cash_replenishments pr
       JOIN petty_cash_floats f ON f.id=pr.float_id
       WHERE pr.company_id=$1 ORDER BY pr.created_at DESC LIMIT 100`,
        [req.auth!.companyId],
      )
      sendOk(res, r.rows)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to load replenishments', err)
    }
  },
)
