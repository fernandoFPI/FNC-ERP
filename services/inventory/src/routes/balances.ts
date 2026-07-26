import { Router } from 'express'
import type { IRouter } from 'express'
import { query } from '@fnc-erp/db'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const balancesRouter: IRouter = Router()

balancesRouter.get(
  '/',
  requirePermission('inventory.stock_moves.view', 'view'),
  async (req, res) => {
    try {
      const companyId = req.auth!.companyId
      const { product_id, location_id, below_reorder } = req.query

      let sql = `
      SELECT sb.*, p.sku, p.name AS product_name, p.uom, p.reorder_point,
             sl.name AS location_name, sl.code AS location_code
      FROM stock_balances sb
      JOIN products p ON p.id = sb.product_id
      JOIN stock_locations sl ON sl.id = sb.location_id
      WHERE p.company_id = $1 AND sb.qty_on_hand > 0`
      const params: unknown[] = [companyId]
      let idx = 2

      if (product_id) {
        sql += ` AND sb.product_id = $${idx++}`
        params.push(product_id)
      }
      if (location_id) {
        sql += ` AND sb.location_id = $${idx++}`
        params.push(location_id)
      }
      if (below_reorder === 'true') {
        sql += ` AND p.reorder_point IS NOT NULL AND sb.qty_on_hand < p.reorder_point`
      }
      sql += ' ORDER BY p.sku, sl.code'

      const result = await query(sql, params)
      sendOk(res, result.rows)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch balances', err)
    }
  },
)

balancesRouter.get(
  '/product/:id',
  requirePermission('inventory.stock_moves.view', 'view'),
  async (req, res) => {
    try {
      const companyId = req.auth!.companyId
      // Verify product belongs to company
      const prod = await query('SELECT * FROM products WHERE id = $1 AND company_id = $2', [
        req.params['id'],
        companyId,
      ])
      if (!prod.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Product not found')
        return
      }

      const result = await query(
        `SELECT sb.*, sl.name AS location_name, sl.code AS location_code, sl.type AS location_type
       FROM stock_balances sb
       JOIN stock_locations sl ON sl.id = sb.location_id
       WHERE sb.product_id = $1
       ORDER BY sl.code`,
        [req.params['id']],
      )
      const totalOnHand = result.rows.reduce(
        (sum, r) => sum + parseFloat((r as { qty_on_hand: string }).qty_on_hand),
        0,
      )
      sendOk(res, { product: prod.rows[0], total_on_hand: totalOnHand, by_location: result.rows })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch product balance', err)
    }
  },
)
