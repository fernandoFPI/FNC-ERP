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
})

costCentersRouter.get('/', requirePermission('finance.cost_centers.view', 'view'), async (req, res) => {
  try {
    const { is_active, search } = req.query as Record<string, string>
    const conditions = [`cc.company_id = $1`]
    const values: unknown[] = [req.auth!.companyId]
    let p = 1
    if (is_active !== undefined) { conditions.push(`cc.is_active = $${++p}`); values.push(is_active === 'true') }
    if (search) { conditions.push(`(cc.name ILIKE $${++p} OR cc.code ILIKE $${p})`); values.push(`%${search}%`) }
    const result = await query(`
      SELECT cc.*,
        COUNT(DISTINCT jl.id)::integer AS journal_line_count
      FROM cost_centers cc
      LEFT JOIN journal_lines jl ON jl.cost_center_id = cc.id
      WHERE ${conditions.join(' AND ')}
      GROUP BY cc.id
      ORDER BY cc.code
    `, values)
    sendOk(res, result.rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch cost centers', err) }
})

costCentersRouter.post('/', requirePermission('finance.cost_centers.edit', 'edit'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const parsed = Schema.safeParse(req.body)
    if (!parsed.success) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
    const { code, name, type, parent_id } = parsed.data
    const result = await query(
      `INSERT INTO cost_centers (company_id, code, name, type, parent_id) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [companyId, code, name, type, parent_id ?? null],
    )
    await logAudit({ companyId, userId: req.auth!.userId, action: 'CREATE', tableName: 'cost_centers', recordId: result.rows[0]!['id'] as string })
    sendOk(res, result.rows[0], 201)
  } catch (err: unknown) {
    const e = err as { code?: string }
    if (e.code === '23505') return sendError(res, 409, 'DUPLICATE_CODE', 'Code already exists')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create cost center', err)
  }
})

costCentersRouter.put('/:id', requirePermission('finance.cost_centers.edit', 'edit'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const parsed = Schema.partial().safeParse(req.body)
    if (!parsed.success) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
    const result = await query(
      `UPDATE cost_centers SET name = COALESCE($1, name), type = COALESCE($2, type), is_active = COALESCE($3, is_active)
       WHERE id = $4 AND company_id = $5 RETURNING *`,
      [parsed.data.name ?? null, parsed.data.type ?? null, null, req.params['id'], companyId],
    )
    if (!result.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Cost center not found')
    sendOk(res, result.rows[0])
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update cost center', err) }
})

costCentersRouter.delete('/:id', requirePermission('finance.cost_centers.edit', 'edit'), async (req, res) => {
  try {
    await query('UPDATE cost_centers SET is_active = false WHERE id = $1 AND company_id = $2', [req.params['id'], req.auth!.companyId])
    await logAudit({ companyId: req.auth!.companyId, userId: req.auth!.userId, action: 'DELETE', tableName: 'cost_centers', recordId: req.params['id']! })
    sendOk(res, { deleted: true })
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to delete cost center', err) }
})
