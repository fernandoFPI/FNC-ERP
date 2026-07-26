import { Router } from 'express'
import type { IRouter } from 'express'
import { z } from 'zod'
import { query, pool } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const accountsRouter: IRouter = Router()

const CreateAccountSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(255),
  account_type: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
  parent_id: z.string().uuid().optional(),
  currency_code: z.string().length(3).default('IQD'),
  is_reconcilable: z.boolean().default(false),
})

const UpdateAccountSchema = CreateAccountSchema.partial().omit({ code: true })

accountsRouter.get('/', requirePermission('finance.accounts.view', 'view'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const { type, is_active } = req.query

    let sql = `SELECT * FROM chart_of_accounts WHERE company_id = $1`
    const params: unknown[] = [companyId]
    let idx = 2

    if (type) {
      sql += ` AND account_type = $${idx++}`
      params.push(type)
    }
    if (is_active !== undefined) {
      sql += ` AND is_active = $${idx++}`
      params.push(is_active === 'true')
    }
    sql += ' ORDER BY code'

    const result = await query(sql, params)
    sendOk(res, result.rows)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch accounts', err)
  }
})

accountsRouter.get('/:id', requirePermission('finance.accounts.view', 'view'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const result = await query(
      `SELECT coa.*, parent.code AS parent_code, parent.name AS parent_name
       FROM chart_of_accounts coa
       LEFT JOIN chart_of_accounts parent ON parent.id = coa.parent_id
       WHERE coa.id = $1 AND coa.company_id = $2`,
      [req.params['id'], companyId],
    )
    const row = result.rows[0]
    if (!row) {
      sendError(res, 404, 'NOT_FOUND', 'Account not found')
      return
    }
    sendOk(res, row)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch account', err)
  }
})

accountsRouter.post('/', requirePermission('finance.accounts.edit', 'edit'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const parsed = CreateAccountSchema.safeParse(req.body)
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
      return
    }

    const { code, name, account_type, parent_id, currency_code, is_reconcilable } = parsed.data

    if (parent_id) {
      const parent = await query(
        'SELECT id FROM chart_of_accounts WHERE id = $1 AND company_id = $2',
        [parent_id, companyId],
      )
      if (!parent.rows[0]) {
        sendError(res, 400, 'INVALID_PARENT', 'Parent account not found in this company')
        return
      }
    }

    const result = await query(
      `INSERT INTO chart_of_accounts (company_id, code, name, account_type, parent_id, currency_code, is_reconcilable)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [companyId, code, name, account_type, parent_id ?? null, currency_code, is_reconcilable],
    )
    const account = result.rows[0]!
    await logAudit({
      companyId,
      userId: req.auth!.userId,
      action: 'CREATE',
      tableName: 'chart_of_accounts',
      recordId: account['id'] as string,
      newValues: account,
    })
    sendOk(res, account, 201)
  } catch (err: unknown) {
    const e = err as { code?: string }
    if (e.code === '23505') {
      sendError(res, 409, 'DUPLICATE_CODE', 'Account code already exists for this company')
      return
    }
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create account', err)
  }
})

accountsRouter.put('/:id', requirePermission('finance.accounts.edit', 'edit'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const parsed = UpdateAccountSchema.safeParse(req.body)
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
      return
    }

    const existing = await query(
      'SELECT * FROM chart_of_accounts WHERE id = $1 AND company_id = $2',
      [req.params['id'], companyId],
    )
    const acct = existing.rows[0]
    if (!acct) {
      sendError(res, 404, 'NOT_FOUND', 'Account not found')
      return
    }

    // Check if posted lines exist before allowing sensitive field updates
    const { name, account_type, parent_id, currency_code, is_reconcilable } = parsed.data
    const updates: string[] = []
    const params: unknown[] = []
    let idx = 1

    if (name !== undefined) {
      updates.push(`name = $${idx++}`)
      params.push(name)
    }
    if (account_type !== undefined) {
      updates.push(`account_type = $${idx++}`)
      params.push(account_type)
    }
    if (parent_id !== undefined) {
      updates.push(`parent_id = $${idx++}`)
      params.push(parent_id)
    }
    if (currency_code !== undefined) {
      updates.push(`currency_code = $${idx++}`)
      params.push(currency_code)
    }
    if (is_reconcilable !== undefined) {
      updates.push(`is_reconcilable = $${idx++}`)
      params.push(is_reconcilable)
    }

    if (updates.length === 0) {
      sendError(res, 400, 'NO_CHANGES', 'No fields to update')
      return
    }

    updates.push(`updated_at = NOW()`)
    params.push(req.params['id'], companyId)

    const result = await query(
      `UPDATE chart_of_accounts SET ${updates.join(', ')} WHERE id = $${idx++} AND company_id = $${idx++} RETURNING *`,
      params,
    )
    await logAudit({
      companyId,
      userId: req.auth!.userId,
      action: 'UPDATE',
      tableName: 'chart_of_accounts',
      recordId: req.params['id']!,
      newValues: parsed.data,
    })
    sendOk(res, result.rows[0])
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update account', err)
  }
})

accountsRouter.delete(
  '/:id',
  requirePermission('finance.accounts.admin', 'admin'),
  async (req, res) => {
    try {
      const companyId = req.auth!.companyId
      const lines = await query(
        'SELECT COUNT(*) FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_entry_id WHERE jl.account_id = $1 AND je.company_id = $2',
        [req.params['id'], companyId],
      )
      if (parseInt((lines.rows[0] as { count: string }).count) > 0) {
        sendError(res, 409, 'HAS_JOURNAL_LINES', 'Cannot delete account with journal lines')
        return
      }
      await query(
        'UPDATE chart_of_accounts SET is_active = false, updated_at = NOW() WHERE id = $1 AND company_id = $2',
        [req.params['id'], companyId],
      )
      await logAudit({
        companyId,
        userId: req.auth!.userId,
        action: 'DELETE',
        tableName: 'chart_of_accounts',
        recordId: req.params['id']!,
      })
      sendOk(res, { deleted: true })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to delete account', err)
    }
  },
)

// Account ledger
accountsRouter.get(
  '/:id/ledger',
  requirePermission('finance.accounts.view', 'view'),
  async (req, res) => {
    try {
      const companyId = req.auth!.companyId
      const { from_date, to_date, page = '1', limit = '50' } = req.query
      const offset = (parseInt(page as string) - 1) * parseInt(limit as string)

      let sql = `
      SELECT jl.*, je.reference, je.entry_date, je.status
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.journal_entry_id
      WHERE jl.account_id = $1 AND je.company_id = $2 AND je.status = 'posted'`
      const params: unknown[] = [req.params['id'], companyId]
      let idx = 3

      if (from_date) {
        sql += ` AND je.entry_date >= $${idx++}`
        params.push(from_date)
      }
      if (to_date) {
        sql += ` AND je.entry_date <= $${idx++}`
        params.push(to_date)
      }
      sql += ` ORDER BY je.entry_date, jl.id LIMIT $${idx++} OFFSET $${idx++}`
      params.push(parseInt(limit as string), offset)

      const result = await query(sql, params)
      sendOk(res, result.rows)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch ledger', err)
    }
  },
)

// Placeholder for pool export (used by other route files via shared import)
export { pool }
