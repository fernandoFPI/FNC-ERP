import { Router } from 'express'
import type { IRouter } from 'express'
import { z } from 'zod'
import { pool, query } from '@fnc-erp/db'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const bomsRouter: IRouter = Router()

const BomSchema = z.object({
  finished_product_id: z.string().uuid(),
  version: z.string().max(20).default('1.0'),
  name: z.string().max(255).optional(),
  qty_produced: z.number().positive().default(1),
  notes: z.string().optional(),
  lines: z.array(z.object({
    component_product_id: z.string().uuid(),
    qty_required: z.number().positive(),
    uom: z.string().default('unit'),
    work_center_id: z.string().uuid().optional(),
    operation_time_hours: z.number().optional(),
    sequence: z.number().int().default(0),
    notes: z.string().optional(),
  })).min(1),
})

bomsRouter.get('/', requirePermission('manufacturing.boms.view', 'view'), async (req, res) => {
  try {
    const { finished_product_id, is_active } = req.query
    let sql = `SELECT b.*, p.name AS product_name, p.sku AS product_sku
               FROM boms b JOIN products p ON p.id = b.finished_product_id
               WHERE b.company_id = $1`
    const params: unknown[] = [req.auth!.companyId]
    let idx = 2
    if (finished_product_id) { sql += ` AND b.finished_product_id = $${idx++}`; params.push(finished_product_id) }
    if (is_active !== undefined) { sql += ` AND b.is_active = $${idx++}`; params.push(is_active === 'true') }
    sql += ' ORDER BY p.sku, b.version'
    const result = await query(sql, params)
    sendOk(res, result.rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch BOMs', err) }
})

bomsRouter.get('/:id', requirePermission('manufacturing.boms.view', 'view'), async (req, res) => {
  try {
    const bom = await query(
      `SELECT b.*, p.name AS product_name FROM boms b JOIN products p ON p.id = b.finished_product_id
       WHERE b.id = $1 AND b.company_id = $2`,
      [req.params['id'], req.auth!.companyId],
    )
    if (!bom.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'BOM not found')
    const lines = await query(
      `SELECT bl.*, p.name AS component_name, p.sku AS component_sku,
              wc.name AS work_center_name
       FROM bom_lines bl
       JOIN products p ON p.id = bl.component_product_id
       LEFT JOIN work_centers wc ON wc.id = bl.work_center_id
       WHERE bl.bom_id = $1 ORDER BY bl.sequence`,
      [req.params['id']],
    )
    sendOk(res, { ...bom.rows[0], lines: lines.rows })
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch BOM', err) }
})

bomsRouter.post('/', requirePermission('manufacturing.boms.edit', 'edit'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const parsed = BomSchema.safeParse(req.body)
    if (!parsed.success) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
    const d = parsed.data

    // Validate: no circular BOM
    if (d.lines.some(l => l.component_product_id === d.finished_product_id)) {
      return sendError(res, 409, 'CIRCULAR_BOM', 'Component cannot be the same as the finished product')
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query<{ id: string }>(
        `INSERT INTO boms (company_id, finished_product_id, version, name, qty_produced, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [companyId, d.finished_product_id, d.version, d.name ?? null, d.qty_produced, d.notes ?? null, req.auth!.userId],
      )
      const bom = result.rows[0]!
      for (const line of d.lines) {
        await client.query(
          `INSERT INTO bom_lines (bom_id, component_product_id, qty_required, uom, work_center_id, operation_time_hours, sequence, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [bom['id'], line.component_product_id, line.qty_required, line.uom, line.work_center_id ?? null,
           line.operation_time_hours ?? null, line.sequence, line.notes ?? null],
        )
      }
      await client.query('COMMIT')
      sendOk(res, bom, 201)
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create BOM', err) }
})

bomsRouter.post('/:id/deactivate', requirePermission('manufacturing.boms.edit', 'edit'), async (req, res) => {
  try {
    const activeMOs = await query(
      `SELECT COUNT(*) AS cnt FROM manufacturing_orders WHERE bom_id = $1 AND status IN ('confirmed','in_progress')`,
      [req.params['id']],
    )
    if (parseInt(activeMOs.rows[0]?.['cnt'] ?? '0') > 0) {
      return sendError(res, 409, 'HAS_ACTIVE_MOS', 'Cannot deactivate BOM with active manufacturing orders')
    }
    await query('UPDATE boms SET is_active = false, updated_at = NOW() WHERE id = $1 AND company_id = $2', [req.params['id'], req.auth!.companyId])
    sendOk(res, { deactivated: true })
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to deactivate BOM', err) }
})
