import { Router } from 'express'
import type { IRouter } from 'express'
import { z } from 'zod'
import { query, pool } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const periodsRouter: IRouter = Router()

const CreatePeriodSchema = z.object({
  name: z.string().min(1).max(50),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

periodsRouter.get('/', requirePermission('finance.periods.view', 'view'), async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM accounting_periods WHERE company_id = $1 ORDER BY start_date DESC',
      [req.auth!.companyId],
    )
    sendOk(res, result.rows)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch periods', err)
  }
})

periodsRouter.post('/', requirePermission('finance.periods.admin', 'admin'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const parsed = CreatePeriodSchema.safeParse(req.body)
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
      return
    }
    const { name, start_date, end_date } = parsed.data
    if (start_date >= end_date) {
      sendError(res, 400, 'INVALID_DATES', 'start_date must be before end_date')
      return
    }
    const result = await query(
      `INSERT INTO accounting_periods (company_id, name, start_date, end_date) VALUES ($1,$2,$3,$4) RETURNING *`,
      [companyId, name, start_date, end_date],
    )
    await logAudit({
      companyId,
      userId: req.auth!.userId,
      action: 'CREATE',
      tableName: 'accounting_periods',
      recordId: result.rows[0]!['id'] as string,
    })
    sendOk(res, result.rows[0], 201)
  } catch (err: unknown) {
    const e = err as { code?: string }
    if (e.code === '23505') {
      sendError(res, 409, 'DUPLICATE_PERIOD', 'A period with this start date already exists')
      return
    }
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create period', err)
  }
})

periodsRouter.post(
  '/:id/close',
  requirePermission('finance.periods.admin', 'admin'),
  async (req, res) => {
    const companyId = req.auth!.companyId
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const periodResult = await client.query(
        'SELECT * FROM accounting_periods WHERE id = $1 AND company_id = $2 FOR UPDATE',
        [req.params['id'], companyId],
      )
      const period = periodResult.rows[0] as
        | { id: string; status: string; start_date: string; end_date: string }
        | undefined
      if (!period) {
        await client.query('ROLLBACK')
        sendError(res, 404, 'NOT_FOUND', 'Period not found')
        return
      }
      if (period.status === 'closed') {
        await client.query('ROLLBACK')
        sendError(res, 409, 'ALREADY_CLOSED', 'Period already closed')
        return
      }

      // Check for draft journals in this period
      const drafts = await client.query(
        `SELECT COUNT(*) FROM journal_entries WHERE company_id = $1 AND status = 'draft'
       AND entry_date >= $2 AND entry_date <= $3`,
        [companyId, period.start_date, period.end_date],
      )
      const draftCount = parseInt((drafts.rows[0] as { count: string }).count)
      if (draftCount > 0) {
        await client.query('ROLLBACK')
        sendError(
          res,
          422,
          'DRAFT_JOURNALS_EXIST',
          `Cannot close period: ${draftCount} draft journal entries must be posted or cancelled first`,
        )
        return
      }

      await client.query(
        `UPDATE accounting_periods SET status = 'closed', closed_by = $1, closed_at = NOW() WHERE id = $2`,
        [req.auth!.userId, period.id],
      )
      await client.query('COMMIT')
      await logAudit({
        companyId,
        userId: req.auth!.userId,
        action: 'UPDATE',
        tableName: 'accounting_periods',
        recordId: period.id,
        newValues: { status: 'closed' },
      })
      const updated = await query('SELECT * FROM accounting_periods WHERE id = $1', [period.id])
      sendOk(res, updated.rows[0])
    } catch (err) {
      await client.query('ROLLBACK')
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to close period', err)
    } finally {
      client.release()
    }
  },
)
