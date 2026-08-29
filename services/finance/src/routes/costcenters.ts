import { Router } from 'express'
import type { IRouter } from 'express'
import { z } from 'zod'
import { query } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const costCentersRouter: IRouter = Router()

const Schema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(255),
  type: z.enum(['department', 'project', 'entity', 'overhead']),
  parent_id: z.string().uuid().optional(),
  default_recharge_fulfiller_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().optional(),
})

costCentersRouter.get(
  '/',
  requirePermission('finance.cost_centers.view', 'view'),
  async (req, res) => {
    try {
      const { is_active, search } = req.query as Record<string, string>
      const conditions = [`cc.company_id = $1`]
      const values: unknown[] = [req.auth!.companyId]
      let p = 1
      if (is_active !== undefined) {
        conditions.push(`cc.is_active = $${++p}`)
        values.push(is_active === 'true')
      }
      if (search) {
        conditions.push(`(cc.name ILIKE $${++p} OR cc.code ILIKE $${p})`)
        values.push(`%${search}%`)
      }
      const result = await query(
        `
      SELECT cc.*, u.email AS default_recharge_fulfiller_email,
        COUNT(DISTINCT jl.id)::integer AS journal_line_count
      FROM cost_centers cc
      LEFT JOIN journal_lines jl ON jl.cost_center_id = cc.id
      LEFT JOIN users u ON u.id = cc.default_recharge_fulfiller_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY cc.id, u.email
      ORDER BY cc.code
    `,
        values,
      )
      sendOk(res, result.rows)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch cost centers', err)
    }
  },
)

costCentersRouter.get(
  '/:id',
  requirePermission('finance.cost_centers.view', 'view'),
  async (req, res) => {
    try {
      const companyId = req.auth!.companyId
      const ccRes = await query(
        `
      SELECT cc.*, u.email AS default_recharge_fulfiller_email,
        parent.code AS parent_code, parent.name AS parent_name,
        COUNT(DISTINCT jl.id)::integer AS journal_line_count,
        COALESCE(SUM(CASE WHEN jl.debit > 0 THEN jl.amount_company_currency ELSE 0 END), 0) AS total_debits,
        COALESCE(SUM(CASE WHEN jl.credit > 0 THEN jl.amount_company_currency ELSE 0 END), 0) AS total_credits
      FROM cost_centers cc
      LEFT JOIN cost_centers parent ON parent.id = cc.parent_id
      LEFT JOIN users u ON u.id = cc.default_recharge_fulfiller_id
      LEFT JOIN journal_lines jl ON jl.cost_center_id = cc.id
      WHERE cc.id = $1 AND cc.company_id = $2
      GROUP BY cc.id, u.email, parent.code, parent.name
    `,
        [req.params['id'], companyId],
      )
      if (!ccRes.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Cost center not found')
        return
      }

      const linesRes = await query(
        `
      SELECT jl.id, jl.description, jl.debit, jl.credit, jl.currency_code,
             jl.fx_rate, jl.amount_company_currency,
             je.reference, je.entry_date AS je_date, je.source_type, je.status AS je_status,
             coa.name AS account_name, coa.code AS account_code
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.journal_entry_id
      JOIN chart_of_accounts coa ON coa.id = jl.account_id
      WHERE jl.cost_center_id = $1
      ORDER BY je.entry_date DESC, je.reference
      LIMIT 200
    `,
        [req.params['id']],
      )

      sendOk(res, { ...ccRes.rows[0], lines: linesRes.rows })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch cost center', err)
    }
  },
)

costCentersRouter.post(
  '/',
  requirePermission('finance.cost_centers.edit', 'edit'),
  async (req, res) => {
    try {
      const companyId = req.auth!.companyId
      const parsed = Schema.safeParse(req.body)
      if (!parsed.success) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
        return
      }
      const { code, name, type, parent_id } = parsed.data
      const result = await query(
        `INSERT INTO cost_centers (company_id, code, name, type, parent_id) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [companyId, code, name, type, parent_id ?? null],
      )
      await logAudit({
        companyId,
        userId: req.auth!.userId,
        action: 'CREATE',
        tableName: 'cost_centers',
        recordId: result.rows[0]!['id'] as string,
      })
      sendOk(res, result.rows[0], 201)
    } catch (err: unknown) {
      const e = err as { code?: string }
      if (e.code === '23505') {
        sendError(res, 409, 'DUPLICATE_CODE', 'Code already exists')
        return
      }
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create cost center', err)
    }
  },
)

costCentersRouter.put(
  '/:id',
  requirePermission('finance.cost_centers.edit', 'edit'),
  async (req, res) => {
    try {
      const companyId = req.auth!.companyId
      const parsed = Schema.partial().safeParse(req.body)
      if (!parsed.success) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
        return
      }
      // default_recharge_fulfiller_id needs to support explicit clearing (set
      // back to null), unlike the COALESCE'd fields above — so it's only
      // touched at all when the caller actually sent it in the body.
      const fulfillerProvided = 'default_recharge_fulfiller_id' in req.body
      if (fulfillerProvided && parsed.data.default_recharge_fulfiller_id) {
        const userCheck = await query(
          `SELECT 1 FROM user_company_roles WHERE user_id = $1 AND company_id = $2 AND is_active = true`,
          [parsed.data.default_recharge_fulfiller_id, companyId],
        )
        if (!userCheck.rows[0]) {
          sendError(res, 400, 'VALIDATION_ERROR', 'That user does not belong to this company')
          return
        }
      }
      const result = await query(
        `UPDATE cost_centers SET name = COALESCE($1, name), type = COALESCE($2, type), is_active = COALESCE($3, is_active),
         default_recharge_fulfiller_id = CASE WHEN $6 THEN $7::uuid ELSE default_recharge_fulfiller_id END
       WHERE id = $4 AND company_id = $5 RETURNING *`,
        [
          parsed.data.name ?? null,
          parsed.data.type ?? null,
          parsed.data.is_active ?? null,
          req.params['id'],
          companyId,
          fulfillerProvided,
          parsed.data.default_recharge_fulfiller_id ?? null,
        ],
      )
      if (!result.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Cost center not found')
        return
      }
      sendOk(res, result.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update cost center', err)
    }
  },
)

costCentersRouter.delete(
  '/:id',
  requirePermission('finance.cost_centers.edit', 'edit'),
  async (req, res) => {
    try {
      await query('UPDATE cost_centers SET is_active = false WHERE id = $1 AND company_id = $2', [
        req.params['id'],
        req.auth!.companyId,
      ])
      await logAudit({
        companyId: req.auth!.companyId,
        userId: req.auth!.userId,
        action: 'DELETE',
        tableName: 'cost_centers',
        recordId: req.params['id']!,
      })
      sendOk(res, { deleted: true })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to delete cost center', err)
    }
  },
)
