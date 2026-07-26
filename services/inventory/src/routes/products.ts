import { Router } from 'express'
import type { IRouter } from 'express'
import { z } from 'zod'
import { query } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const productsRouter: IRouter = Router()

const CreateProductSchema = z.object({
  sku: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  category: z.string().max(100).optional(),
  uom: z.string().max(20).default('unit'),
  valuation_method: z.enum(['avco', 'fifo', 'standard']).default('avco'),
  standard_cost: z.number().min(0).default(0),
  reorder_point: z.number().min(0).optional(),
  reorder_qty: z.number().min(0).optional(),
  is_storable: z.boolean().default(true),
})

const UpdateProductSchema = CreateProductSchema.partial().omit({ sku: true })

productsRouter.get('/', requirePermission('inventory.products.view', 'view'), async (req, res) => {
  try {
    const { category, is_active } = req.query
    let sql = `SELECT * FROM products WHERE company_id = $1`
    const params: unknown[] = [req.auth!.companyId]
    let idx = 2
    if (category) {
      sql += ` AND category = $${idx++}`
      params.push(category)
    }
    if (is_active !== undefined) {
      sql += ` AND is_active = $${idx++}`
      params.push(is_active === 'true')
    }
    sql += ' ORDER BY sku'
    const result = await query(sql, params)
    sendOk(res, result.rows)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch products', err)
  }
})

productsRouter.get(
  '/:id',
  requirePermission('inventory.products.view', 'view'),
  async (req, res) => {
    try {
      const result = await query('SELECT * FROM products WHERE id = $1 AND company_id = $2', [
        req.params['id'],
        req.auth!.companyId,
      ])
      const row = result.rows[0]
      if (!row) {
        sendError(res, 404, 'NOT_FOUND', 'Product not found')
        return
      }
      sendOk(res, row)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch product', err)
    }
  },
)

productsRouter.post('/', requirePermission('inventory.products.edit', 'edit'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const parsed = CreateProductSchema.safeParse(req.body)
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
      return
    }
    const {
      sku,
      name,
      description,
      category,
      uom,
      valuation_method,
      standard_cost,
      reorder_point,
      reorder_qty,
      is_storable,
    } = parsed.data
    const result = await query(
      `INSERT INTO products (company_id, sku, name, description, category, uom, valuation_method, standard_cost, reorder_point, reorder_qty, is_storable)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        companyId,
        sku,
        name,
        description ?? null,
        category ?? null,
        uom,
        valuation_method,
        standard_cost,
        reorder_point ?? null,
        reorder_qty ?? null,
        is_storable,
      ],
    )
    const product = result.rows[0]!
    await logAudit({
      companyId,
      userId: req.auth!.userId,
      action: 'CREATE',
      tableName: 'products',
      recordId: product['id'] as string,
    })
    sendOk(res, product, 201)
  } catch (err: unknown) {
    const e = err as { code?: string }
    if (e.code === '23505') {
      sendError(res, 409, 'DUPLICATE_SKU', 'SKU already exists for this company')
      return
    }
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create product', err)
  }
})

productsRouter.put(
  '/:id',
  requirePermission('inventory.products.edit', 'edit'),
  async (req, res) => {
    try {
      const companyId = req.auth!.companyId
      const parsed = UpdateProductSchema.safeParse(req.body)
      if (!parsed.success) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
        return
      }

      const existing = await query('SELECT * FROM products WHERE id = $1 AND company_id = $2', [
        req.params['id'],
        companyId,
      ])
      if (!existing.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Product not found')
        return
      }

      const d = parsed.data
      const updates: string[] = []
      const params: unknown[] = []
      let idx = 1
      if (d.name !== undefined) {
        updates.push(`name = $${idx++}`)
        params.push(d.name)
      }
      if (d.description !== undefined) {
        updates.push(`description = $${idx++}`)
        params.push(d.description)
      }
      if (d.category !== undefined) {
        updates.push(`category = $${idx++}`)
        params.push(d.category)
      }
      if (d.uom !== undefined) {
        updates.push(`uom = $${idx++}`)
        params.push(d.uom)
      }
      if (d.valuation_method !== undefined) {
        updates.push(`valuation_method = $${idx++}`)
        params.push(d.valuation_method)
      }
      if (d.standard_cost !== undefined) {
        updates.push(`standard_cost = $${idx++}`)
        params.push(d.standard_cost)
      }
      if (d.reorder_point !== undefined) {
        updates.push(`reorder_point = $${idx++}`)
        params.push(d.reorder_point)
      }
      if (d.reorder_qty !== undefined) {
        updates.push(`reorder_qty = $${idx++}`)
        params.push(d.reorder_qty)
      }
      if (d.is_storable !== undefined) {
        updates.push(`is_storable = $${idx++}`)
        params.push(d.is_storable)
      }
      if (updates.length === 0) {
        sendError(res, 400, 'NO_CHANGES', 'No fields to update')
        return
      }

      updates.push(`updated_at = NOW()`)
      params.push(req.params['id'], companyId)
      const result = await query(
        `UPDATE products SET ${updates.join(', ')} WHERE id = $${idx++} AND company_id = $${idx++} RETURNING *`,
        params,
      )
      await logAudit({
        companyId,
        userId: req.auth!.userId,
        action: 'UPDATE',
        tableName: 'products',
        recordId: req.params['id']!,
        newValues: parsed.data,
      })
      sendOk(res, result.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update product', err)
    }
  },
)

productsRouter.delete(
  '/:id',
  requirePermission('inventory.products.edit', 'edit'),
  async (req, res) => {
    try {
      const companyId = req.auth!.companyId
      const moves = await query(
        'SELECT COUNT(*) FROM stock_moves WHERE product_id = $1 AND company_id = $2',
        [req.params['id'], companyId],
      )
      if (parseInt((moves.rows[0] as { count: string }).count) > 0) {
        sendError(res, 409, 'HAS_STOCK_MOVES', 'Cannot delete product with stock moves')
        return
      }
      await query(
        'UPDATE products SET is_active = false, updated_at = NOW() WHERE id = $1 AND company_id = $2',
        [req.params['id'], companyId],
      )
      await logAudit({
        companyId,
        userId: req.auth!.userId,
        action: 'DELETE',
        tableName: 'products',
        recordId: req.params['id']!,
      })
      sendOk(res, { deleted: true })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to delete product', err)
    }
  },
)
