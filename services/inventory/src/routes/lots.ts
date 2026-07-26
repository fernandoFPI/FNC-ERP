import { Router } from 'express'
import type { IRouter } from 'express'
import { z } from 'zod'
import { query } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const lotsRouter: IRouter = Router()

const Schema = z.object({
  product_id: z.string().uuid(),
  lot_number: z.string().min(1).max(100),
  expiry_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  notes: z.string().optional(),
})

lotsRouter.get('/', requirePermission('inventory.lots.view', 'view'), async (req, res) => {
  try {
    const { product_id } = req.query
    let sql = `SELECT sl.* FROM stock_lots sl JOIN products p ON p.id = sl.product_id WHERE p.company_id = $1`
    const params: unknown[] = [req.auth!.companyId]
    if (product_id) {
      sql += ` AND sl.product_id = $2`
      params.push(product_id)
    }
    sql += ' ORDER BY sl.lot_number'
    const result = await query(sql, params)
    sendOk(res, result.rows)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch lots', err)
  }
})

lotsRouter.post('/', requirePermission('inventory.lots.edit', 'edit'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const parsed = Schema.safeParse(req.body)
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
      return
    }
    const { product_id, lot_number, expiry_date, notes } = parsed.data

    // Verify product belongs to company
    const prod = await query('SELECT id FROM products WHERE id = $1 AND company_id = $2', [
      product_id,
      companyId,
    ])
    if (!prod.rows[0]) {
      sendError(res, 400, 'INVALID_PRODUCT', 'Product not found in this company')
      return
    }

    const result = await query(
      `INSERT INTO stock_lots (product_id, lot_number, expiry_date, notes) VALUES ($1,$2,$3,$4) RETURNING *`,
      [product_id, lot_number, expiry_date ?? null, notes ?? null],
    )
    await logAudit({
      companyId,
      userId: req.auth!.userId,
      action: 'CREATE',
      tableName: 'stock_lots',
      recordId: result.rows[0]!['id'] as string,
    })
    sendOk(res, result.rows[0], 201)
  } catch (err: unknown) {
    const e = err as { code?: string }
    if (e.code === '23505') {
      sendError(res, 409, 'DUPLICATE_LOT', 'Lot number already exists for this product')
      return
    }
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create lot', err)
  }
})
