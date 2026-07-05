import { Router } from 'express'
import type { IRouter } from 'express'
import { z } from 'zod'
import { pool, query, withIntercoTransaction } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { resolveTransferPrice, TransferPricingError } from '@fnc-erp/fx'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const stockTransfersRouter: IRouter = Router()

// ── ADMIN: GET /interco/pricing-settings/:companyId ────────────
stockTransfersRouter.get('/pricing-settings/:companyId', requirePermission('interco.stock_transfers.view', 'view'), async (req, res) => {
  try {
    const companyId = req.params['companyId']!
    const authCompanyId = req.auth!.companyId
    const role = req.auth!.role

    // company_admin can only read own company; system_admin reads any
    if (role !== 'system_admin' && companyId !== authCompanyId) {
      return sendError(res, 403, 'FORBIDDEN', 'You can only view your own company settings')
    }

    const [settings, history] = await Promise.all([
      query<{
        interco_transfer_pricing_method: string
        interco_cost_plus_markup_pct: string
      }>(
        `SELECT interco_transfer_pricing_method, interco_cost_plus_markup_pct
         FROM companies WHERE id = $1`,
        [companyId],
      ),
      query(
        `SELECT * FROM interco_pricing_config_log
         WHERE company_id = $1 ORDER BY created_at DESC LIMIT 10`,
        [companyId],
      ),
    ])

    if (!settings.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Company not found')
    sendOk(res, {
      method: settings.rows[0].interco_transfer_pricing_method,
      cost_plus_markup_pct: parseFloat(settings.rows[0].interco_cost_plus_markup_pct),
      config_history: history.rows,
    })
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch pricing settings', err)
  }
})

// ── ADMIN: PUT /interco/pricing-settings/:companyId ────────────
stockTransfersRouter.put('/pricing-settings/:companyId', requirePermission('interco.stock_transfers.edit', 'edit'), async (req, res) => {
  try {
    const companyId = req.params['companyId']!
    const authCompanyId = req.auth!.companyId
    const userId = req.auth!.userId
    const role = req.auth!.role

    if (role !== 'system_admin' && companyId !== authCompanyId) {
      return sendError(res, 403, 'FORBIDDEN', 'You can only change your own company settings')
    }

    const schema = z.object({
      method: z.enum(['avco', 'cost_plus', 'market', 'standard']),
      cost_plus_markup_pct: z.number().min(0).optional(),
      notes: z.string().optional(),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
    }
    const { method, cost_plus_markup_pct, notes } = parsed.data

    if (method === 'cost_plus' && (!cost_plus_markup_pct || cost_plus_markup_pct <= 0)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'cost_plus_markup_pct must be > 0 when method is cost_plus')
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const prev = await client.query<{
        interco_transfer_pricing_method: string
        interco_cost_plus_markup_pct: string
      }>(
        `SELECT interco_transfer_pricing_method, interco_cost_plus_markup_pct
         FROM companies WHERE id = $1 FOR UPDATE`,
        [companyId],
      )
      if (!prev.rows[0]) {
        await client.query('ROLLBACK')
        return sendError(res, 404, 'NOT_FOUND', 'Company not found')
      }
      const previousMethod = prev.rows[0].interco_transfer_pricing_method
      const previousMarkup = parseFloat(prev.rows[0].interco_cost_plus_markup_pct)
      const newMarkup = cost_plus_markup_pct ?? 0

      await client.query(
        `UPDATE companies
         SET interco_transfer_pricing_method=$1,
             interco_cost_plus_markup_pct=$2
         WHERE id=$3`,
        [method, newMarkup, companyId],
      )

      await client.query(
        `INSERT INTO interco_pricing_config_log
           (company_id, changed_by, previous_method, new_method,
            previous_markup_pct, new_markup_pct, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [companyId, userId, previousMethod, method, previousMarkup, newMarkup, notes ?? null],
      )

      await client.query('COMMIT')

      await logAudit({
        companyId: authCompanyId,
        userId,
        action: 'UPDATE',
        tableName: 'companies',
        recordId: companyId,
        oldValues: { method: previousMethod, markup_pct: previousMarkup },
        newValues: { method, markup_pct: newMarkup },
      })

      sendOk(res, {
        method,
        cost_plus_markup_pct: newMarkup,
        warning:
          `Transfer pricing method updated. All future inter-company stock transfers will use ${method}. ` +
          `Existing transfers are not affected.`,
      })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update pricing settings', err)
  }
})

// ── GET /interco/stock-transfers/preview-price ─────────────────
stockTransfersRouter.get('/stock-transfers/preview-price', requirePermission('interco.stock_transfers.view', 'view'), async (req, res) => {
  try {
    const { product_id, from_company_id, from_location_id, qty, market_price } = req.query
    if (!product_id || !from_company_id || !from_location_id || !qty) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'product_id, from_company_id, from_location_id, qty are required')
    }

    const client = await pool.connect()
    try {
      const manualPriceVal = market_price ? parseFloat(market_price as string) : null
      const pricing = await resolveTransferPrice({
        client,
        productId: product_id as string,
        fromCompanyId: from_company_id as string,
        fromLocationId: from_location_id as string,
        ...(manualPriceVal != null ? { manualPrice: manualPriceVal } : {}),
      })
      const qtyNum = parseFloat(qty as string)
      sendOk(res, {
        ...pricing,
        total_transfer_value: pricing.requires_manual_input ? 0 : qtyNum * pricing.transfer_price,
      })
    } finally {
      client.release()
    }
  } catch (err) {
    if (err instanceof TransferPricingError) {
      return sendError(res, 422, err.code, err.message)
    }
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to preview transfer price', err)
  }
})

// ── GET /interco/stock-transfers ───────────────────────────────
stockTransfersRouter.get('/stock-transfers', requirePermission('interco.stock_transfers.view', 'view'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const role = req.auth!.role
    const { from_company_id, to_company_id, status, from_date, to_date } = req.query
    const page = Math.max(1, parseInt(req.query['page'] as string || '1'))
    const limit = Math.min(100, parseInt(req.query['limit'] as string || '20'))
    const offset = (page - 1) * limit

    let sql = `SELECT ist.*,
                      fc.name AS from_company_name,
                      tc.name AS to_company_name
               FROM interco_stock_transfers ist
               JOIN companies fc ON fc.id = ist.from_company_id
               JOIN companies tc ON tc.id = ist.to_company_id
               WHERE 1=1`
    const params: unknown[] = []
    let idx = 1

    // system_admin sees all; company_admin sees only their company's transfers
    if (role !== 'system_admin') {
      sql += ` AND (ist.from_company_id = $${idx} OR ist.to_company_id = $${idx})`
      params.push(companyId)
      idx++
    }

    if (from_company_id) { sql += ` AND ist.from_company_id = $${idx++}`; params.push(from_company_id) }
    if (to_company_id) { sql += ` AND ist.to_company_id = $${idx++}`; params.push(to_company_id) }
    if (status) { sql += ` AND ist.status = $${idx++}`; params.push(status) }
    if (from_date) { sql += ` AND ist.transfer_date >= $${idx++}`; params.push(from_date) }
    if (to_date) { sql += ` AND ist.transfer_date <= $${idx++}`; params.push(to_date) }

    sql += ` ORDER BY ist.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`
    params.push(limit, offset)

    sendOk(res, (await query(sql, params)).rows)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch stock transfers', err)
  }
})

// ── GET /interco/stock-transfers/:id ──────────────────────────
stockTransfersRouter.get('/stock-transfers/:id', requirePermission('interco.stock_transfers.view', 'view'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const role = req.auth!.role
    const id = req.params['id']!

    const transfer = await query(
      `SELECT ist.*, fc.name AS from_company_name, tc.name AS to_company_name
       FROM interco_stock_transfers ist
       JOIN companies fc ON fc.id = ist.from_company_id
       JOIN companies tc ON tc.id = ist.to_company_id
       WHERE ist.id = $1`,
      [id],
    )
    if (!transfer.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Transfer not found')

    const t = transfer.rows[0] as Record<string, unknown>
    // Scope check
    if (
      role !== 'system_admin' &&
      t['from_company_id'] !== companyId &&
      t['to_company_id'] !== companyId
    ) {
      return sendError(res, 403, 'FORBIDDEN', 'You do not have access to this transfer')
    }

    const lines = await query(
      `SELECT istl.*, p.sku, p.name AS product_name
       FROM interco_stock_transfer_lines istl
       JOIN products p ON p.id = istl.product_id
       WHERE istl.transfer_id = $1`,
      [id],
    )

    sendOk(res, { ...t, lines: lines.rows })
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch stock transfer', err)
  }
})

// ── POST /interco/stock-transfers ─────────────────────────────
const TransferLineSchema = z.object({
  product_id: z.string().uuid(),
  lot_id: z.string().uuid().optional(),
  from_location_id: z.string().uuid(),
  to_location_id: z.string().uuid(),
  qty: z.number().positive(),
  market_price: z.number().positive().optional(),
})

const CreateTransferSchema = z.object({
  from_company_id: z.string().uuid(),
  to_company_id: z.string().uuid(),
  transfer_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional(),
  lines: z.array(TransferLineSchema).min(1),
})

stockTransfersRouter.post('/stock-transfers', requirePermission('interco.stock_transfers.edit', 'edit'), async (req, res) => {
  try {
    const userId = req.auth!.userId

    // Check same-company before full schema validation so the error code is correct
    const raw = req.body as { from_company_id?: string; to_company_id?: string }
    if (raw.from_company_id && raw.to_company_id && raw.from_company_id === raw.to_company_id) {
      return sendError(res, 400, 'SAME_COMPANY', 'from_company_id and to_company_id must differ')
    }

    const parsed = CreateTransferSchema.safeParse(req.body)
    if (!parsed.success) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
    }
    const { from_company_id, to_company_id, transfer_date, notes, lines } = parsed.data

    // Validate locations ownership (from_locations ∈ from_company, to_locations ∈ to_company)
    for (const line of lines) {
      const [fromLoc, toLoc] = await Promise.all([
        query<{ company_id: string }>(
          'SELECT company_id FROM stock_locations WHERE id = $1',
          [line.from_location_id],
        ),
        query<{ company_id: string }>(
          'SELECT company_id FROM stock_locations WHERE id = $1',
          [line.to_location_id],
        ),
      ])
      if (!fromLoc.rows[0] || fromLoc.rows[0].company_id !== from_company_id) {
        return sendError(res, 400, 'INVALID_LOCATION', `from_location ${line.from_location_id} does not belong to from_company`)
      }
      if (!toLoc.rows[0] || toLoc.rows[0].company_id !== to_company_id) {
        return sendError(res, 400, 'INVALID_LOCATION', `to_location ${line.to_location_id} does not belong to to_company`)
      }
    }

    // Check pricing requirements and stock availability
    const client = await pool.connect()
    try {
      for (const line of lines) {
        const pricing = await resolveTransferPrice({
          client,
          productId: line.product_id,
          fromCompanyId: from_company_id,
          fromLocationId: line.from_location_id,
          ...(line.market_price != null ? { manualPrice: line.market_price } : {}),
        })
        if (pricing.requires_manual_input) {
          return res.status(422).json({
            success: false,
            error: {
              code: 'MARKET_PRICE_REQUIRED',
              message: 'This company uses market-based transfer pricing. Provide market_price for each line.',
              requires_market_price: true,
              product_id: line.product_id,
            },
          })
        }

        // Validate sufficient stock
        const bal = await client.query<{ qty_on_hand: string }>(
          `SELECT COALESCE(SUM(qty_on_hand), 0) AS qty_on_hand
           FROM stock_balances
           WHERE product_id = $1 AND location_id = $2`,
          [line.product_id, line.from_location_id],
        )
        const onHand = parseFloat(bal.rows[0]?.qty_on_hand ?? '0')
        if (onHand < line.qty) {
          return sendError(
            res,
            422,
            'INSUFFICIENT_STOCK',
            `Insufficient stock for product ${line.product_id}: have ${onHand}, need ${line.qty}`,
          )
        }
      }
    } finally {
      client.release()
    }

    // Queue the transfer for atomic execution by the worker
    await query(
      `INSERT INTO service_outbox (service, event_type, payload) VALUES ('interco','INTERCO_STOCK_TRANSFER_EXECUTE',$1)`,
      [
        JSON.stringify({
          from_company_id,
          to_company_id,
          transfer_date,
          notes: notes ?? null,
          lines,
          moved_by: userId,
          source_type: 'manual',
          source_id: null,
        }),
      ],
    )

    sendOk(res, {
      message: 'Transfer queued for processing.',
      from_company_id,
      to_company_id,
      line_count: lines.length,
    }, 202)
  } catch (err) {
    if (err instanceof TransferPricingError) {
      return sendError(res, 422, err.code, err.message)
    }
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create stock transfer', err)
  }
})

// ── POST /interco/stock-transfers/:id/cancel ──────────────────
stockTransfersRouter.post('/stock-transfers/:id/cancel', requirePermission('interco.stock_transfers.edit', 'edit'), async (req, res) => {
  try {
    const id = req.params['id']!
    const companyId = req.auth!.companyId
    const userId = req.auth!.userId

    const result = await query(
      `UPDATE interco_stock_transfers
       SET status='cancelled', updated_at=NOW()
       WHERE id=$1 AND from_company_id=$2 AND status='pending' RETURNING id`,
      [id, companyId],
    )
    if (!result.rows[0]) {
      return sendError(res, 409, 'CANNOT_CANCEL', 'Transfer not found or cannot be cancelled (only pending transfers can be cancelled)')
    }

    await logAudit({
      companyId,
      userId,
      action: 'UPDATE',
      tableName: 'interco_stock_transfers',
      recordId: id,
      newValues: { status: 'cancelled' },
    })

    sendOk(res, { id, status: 'cancelled' })
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to cancel transfer', err)
  }
})
