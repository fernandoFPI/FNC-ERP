import { Router } from 'express'
import type { IRouter } from 'express'
import { z } from 'zod'
import { query } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const assetsRouter: IRouter = Router()

const Schema = z.object({
  asset_number: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  category: z.string().max(100).optional(),
  model: z.string().max(255).optional(),
  serial_number: z.string().max(255).optional(),
  year_of_manufacture: z.number().int().optional(),
  daily_rate: z.number().min(0),
  weekly_rate: z.number().min(0).optional(),
  monthly_rate: z.number().min(0).optional(),
  currency_code: z.string().length(3).default('IQD'),
  purchase_cost: z.number().min(0).optional(),
  purchase_date: z.string().optional(),
  notes: z.string().optional(),
})

assetsRouter.get('/', requirePermission('rental.assets.view', 'view'), async (req, res) => {
  try {
    const { status, category, is_active } = req.query
    let sql = `SELECT * FROM equipment_assets WHERE company_id = $1`
    const params: unknown[] = [req.auth!.companyId]
    let idx = 2
    if (status) { sql += ` AND status = $${idx++}`; params.push(status) }
    if (category) { sql += ` AND category = $${idx++}`; params.push(category) }
    if (is_active !== undefined) { sql += ` AND is_active = $${idx++}`; params.push(is_active === 'true') }
    sql += ' ORDER BY name LIMIT 500'
    sendOk(res, (await query(sql, params)).rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch assets', err) }
})

assetsRouter.get('/availability', requirePermission('rental.assets.view', 'view'), async (req, res) => {
  try {
    const { from_date, to_date, category } = req.query
    let sql = `SELECT a.* FROM equipment_assets a
               WHERE a.company_id = $1 AND a.status = 'available' AND a.is_active = true`
    const params: unknown[] = [req.auth!.companyId]
    let idx = 2
    if (category) { sql += ` AND a.category = $${idx++}`; params.push(category) }
    if (from_date && to_date) {
      sql += ` AND NOT EXISTS (
        SELECT 1 FROM rental_contracts rc
        JOIN rental_contract_lines rcl ON rcl.contract_id = rc.id
        WHERE rcl.asset_id = a.id AND rc.status IN ('active','draft')
          AND rc.start_date <= $${idx++} AND (rc.end_date IS NULL OR rc.end_date >= $${idx++})
      )`
      params.push(to_date, from_date)
    }
    sql += ' ORDER BY a.name'
    sendOk(res, (await query(sql, params)).rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch availability', err) }
})

assetsRouter.get('/:id', requirePermission('rental.assets.view', 'view'), async (req, res) => {
  try {
    const result = await query(
      `SELECT a.*, rc.contract_number AS current_contract, rc.status AS contract_status
       FROM equipment_assets a
       LEFT JOIN rental_contract_lines rcl ON rcl.asset_id = a.id
       LEFT JOIN rental_contracts rc ON rc.id = rcl.contract_id AND rc.status = 'active'
       WHERE a.id = $1 AND a.company_id = $2`,
      [req.params['id'], req.auth!.companyId],
    )
    if (!result.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Asset not found')
    sendOk(res, result.rows[0])
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch asset', err) }
})

assetsRouter.post('/', requirePermission('rental.assets.edit', 'edit'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const parsed = Schema.safeParse(req.body)
    if (!parsed.success) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
    const d = parsed.data
    const result = await query(
      `INSERT INTO equipment_assets (company_id, asset_number, name, category, model, serial_number,
         year_of_manufacture, daily_rate, weekly_rate, monthly_rate, currency_code,
         purchase_cost, purchase_date, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [companyId, d.asset_number, d.name, d.category ?? null, d.model ?? null, d.serial_number ?? null,
       d.year_of_manufacture ?? null, d.daily_rate, d.weekly_rate ?? null, d.monthly_rate ?? null,
       d.currency_code, d.purchase_cost ?? null, d.purchase_date ?? null, d.notes ?? null],
    )
    const asset = result.rows[0]!
    await logAudit({ companyId, userId: req.auth!.userId, action: 'CREATE', tableName: 'equipment_assets', recordId: asset['id'] as string })
    sendOk(res, asset, 201)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create asset', err) }
})

assetsRouter.put('/:id', requirePermission('rental.assets.edit', 'edit'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const parsed = Schema.partial().safeParse(req.body)
    if (!parsed.success) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
    const d = parsed.data
    const updates: string[] = []
    const params: unknown[] = []
    let idx = 1
    const fields: Array<[string, unknown]> = [
      ['name', d.name], ['category', d.category], ['model', d.model], ['daily_rate', d.daily_rate],
      ['weekly_rate', d.weekly_rate], ['monthly_rate', d.monthly_rate], ['notes', d.notes],
    ]
    for (const [col, val] of fields) {
      if (val !== undefined) { updates.push(`${col} = $${idx++}`); params.push(val) }
    }
    if (updates.length === 0) return sendError(res, 400, 'NO_CHANGES', 'No fields to update')
    updates.push('updated_at = NOW()')
    params.push(req.params['id'], companyId)
    const result = await query(
      `UPDATE equipment_assets SET ${updates.join(', ')} WHERE id = $${idx++} AND company_id = $${idx++} RETURNING *`,
      params,
    )
    if (!result.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Asset not found')
    sendOk(res, result.rows[0])
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update asset', err) }
})

assetsRouter.post('/:id/retire', requirePermission('rental.assets.edit', 'edit'), async (req, res) => {
  try {
    await query(
      `UPDATE equipment_assets SET status='disposed', is_active=false, updated_at=NOW()
       WHERE id=$1 AND company_id=$2`,
      [req.params['id'], req.auth!.companyId],
    )
    sendOk(res, { retired: true })
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to retire asset', err) }
})
