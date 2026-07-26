import { Router } from 'express'
import type { IRouter } from 'express'
import { z } from 'zod'
import { query, pool } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { isIntercoMove } from '../lib/interco-detector.js'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const movesRouter: IRouter = Router()

const CreateMoveSchema = z.object({
  product_id: z.string().uuid(),
  lot_id: z.string().uuid().optional(),
  from_location_id: z.string().uuid(),
  to_location_id: z.string().uuid(),
  qty: z.number().positive(),
  unit_cost: z.number().min(0).default(0),
  currency_code: z.string().length(3).default('IQD'),
  source_type: z.string().max(50).optional(),
  source_id: z.string().uuid().optional(),
  notes: z.string().optional(),
})

movesRouter.get('/', requirePermission('inventory.stock_moves.view', 'view'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const { product_id, location_id, from_date, to_date, page = '1', limit = '50' } = req.query
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string)

    let sql = `SELECT sm.*, p.sku, p.name AS product_name FROM stock_moves sm JOIN products p ON p.id = sm.product_id WHERE sm.company_id = $1`
    const params: unknown[] = [companyId]
    let idx = 2

    if (product_id) {
      sql += ` AND sm.product_id = $${idx++}`
      params.push(product_id)
    }
    if (location_id) {
      sql += ` AND (sm.from_location_id = $${idx} OR sm.to_location_id = $${idx})`
      idx++
      params.push(location_id)
    }
    if (from_date) {
      sql += ` AND sm.moved_at >= $${idx++}`
      params.push(from_date)
    }
    if (to_date) {
      sql += ` AND sm.moved_at <= $${idx++}`
      params.push(to_date)
    }
    sql += ` ORDER BY sm.moved_at DESC LIMIT $${idx++} OFFSET $${idx++}`
    params.push(parseInt(limit as string), offset)

    const result = await query(sql, params)
    sendOk(res, result.rows)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch moves', err)
  }
})

movesRouter.post('/', requirePermission('inventory.stock_moves.edit', 'edit'), async (req, res) => {
  const companyId = req.auth!.companyId
  const parsed = CreateMoveSchema.safeParse(req.body)
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
    return
  }

  const {
    product_id,
    lot_id,
    from_location_id,
    to_location_id,
    qty,
    unit_cost,
    currency_code,
    source_type,
    source_id,
    notes,
  } = parsed.data

  // Detect inter-company moves before standard validation
  // Worker sets source_type='interco_transfer' on direct inserts to bypass detection
  if (source_type !== 'interco_transfer') {
    const client = await pool.connect()
    try {
      const detection = await isIntercoMove(client, from_location_id, to_location_id)
      if (detection.isInterco) {
        // Check if from-company uses market pricing without providing a price
        const companyRow = await client.query<{ interco_transfer_pricing_method: string }>(
          `SELECT interco_transfer_pricing_method FROM companies WHERE id = $1`,
          [detection.fromCompanyId],
        )
        const pricingMethod = companyRow.rows[0]?.interco_transfer_pricing_method
        const requiresPricingInput =
          pricingMethod === 'market' && !(req.body as Record<string, unknown>)['market_price']

        await client.query(
          `INSERT INTO service_outbox (service, event_type, payload) VALUES ('interco','INTERCO_STOCK_MOVE_DETECTED',$1)`,
          [
            JSON.stringify({
              product_id,
              lot_id: lot_id ?? null,
              from_location_id,
              to_location_id,
              qty,
              source_type: source_type ?? 'manual',
              source_id: source_id ?? null,
              notes: notes ?? null,
              moved_by: req.auth!.userId,
              from_company_id: detection.fromCompanyId,
              to_company_id: detection.toCompanyId,
              market_price: (req.body as Record<string, unknown>)['market_price'] ?? null,
            }),
          ],
        )
        return res.status(202).json({
          success: true,
          data: {
            message: 'Cross-entity stock move detected. Routed to inter-company transfer flow.',
            requires_pricing_input: requiresPricingInput,
          },
        })
      }
    } finally {
      client.release()
    }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Verify product belongs to company
    const prod = await client.query(
      'SELECT id FROM products WHERE id = $1 AND company_id = $2 AND is_active = true',
      [product_id, companyId],
    )
    if (!prod.rows[0]) {
      await client.query('ROLLBACK')
      sendError(res, 400, 'INVALID_PRODUCT', 'Product not found in this company')
      return
    }

    // Verify both locations belong to company
    const fromLoc = await client.query(
      'SELECT id FROM stock_locations WHERE id = $1 AND company_id = $2',
      [from_location_id, companyId],
    )
    if (!fromLoc.rows[0]) {
      await client.query('ROLLBACK')
      sendError(res, 400, 'INVALID_LOCATION', 'Source location not found')
      return
    }
    const toLoc = await client.query(
      'SELECT id FROM stock_locations WHERE id = $1 AND company_id = $2',
      [to_location_id, companyId],
    )
    if (!toLoc.rows[0]) {
      await client.query('ROLLBACK')
      sendError(res, 400, 'INVALID_LOCATION', 'Destination location not found')
      return
    }

    if (from_location_id === to_location_id) {
      await client.query('ROLLBACK')
      sendError(res, 400, 'SAME_LOCATION', 'Source and destination locations cannot be the same')
      return
    }

    // Check sufficient stock at source (skip for virtual_in locations)
    const srcLocType = await client.query('SELECT type FROM stock_locations WHERE id = $1', [
      from_location_id,
    ])
    const srcType = (srcLocType.rows[0] as { type: string } | undefined)?.type
    if (srcType !== 'virtual_in') {
      const lotClause = lot_id ? `AND lot_id = '${lot_id}'` : 'AND lot_id IS NULL'
      const bal = await client.query(
        `SELECT qty_on_hand FROM stock_balances WHERE product_id = $1 AND location_id = $2 ${lotClause}`,
        [product_id, from_location_id],
      )
      const onHand = parseFloat(
        (bal.rows[0] as { qty_on_hand: string } | undefined)?.qty_on_hand ?? '0',
      )
      if (onHand < qty) {
        await client.query('ROLLBACK')
        sendError(
          res,
          422,
          'INSUFFICIENT_STOCK',
          `Insufficient stock. Available: ${onHand}, Requested: ${qty}`,
        )
        return
      }
    }

    const total_cost = Math.round(qty * unit_cost * 10000) / 10000

    // Insert move — trigger updates stock_balances automatically
    const moveResult = await client.query(
      `INSERT INTO stock_moves (company_id, product_id, lot_id, from_location_id, to_location_id, qty, unit_cost, total_cost, currency_code, source_type, source_id, notes, moved_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        companyId,
        product_id,
        lot_id ?? null,
        from_location_id,
        to_location_id,
        qty,
        unit_cost,
        total_cost,
        currency_code,
        source_type ?? null,
        source_id ?? null,
        notes ?? null,
        req.auth!.userId,
      ],
    )
    const move = moveResult.rows[0]!

    await client.query('COMMIT')
    await logAudit({
      companyId,
      userId: req.auth!.userId,
      action: 'CREATE',
      tableName: 'stock_moves',
      recordId: move.id as string,
      newValues: { product_id, qty, from_location_id, to_location_id },
    })
    sendOk(res, move, 201)
  } catch (err) {
    await client.query('ROLLBACK')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create stock move', err)
  } finally {
    client.release()
  }
})
