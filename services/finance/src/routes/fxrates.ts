import { Router } from 'express'
import type { IRouter } from 'express'
import { z } from 'zod'
import { query } from '@fnc-erp/db'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const fxRatesRouter: IRouter = Router()

const CreateFXSchema = z.object({
  from_currency: z.string().length(3),
  to_currency: z.string().length(3),
  rate: z.number().positive(),
  rate_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: z.enum(['manual', 'cbi', 'market']).default('manual'),
})

fxRatesRouter.get('/', requirePermission('finance.fx_rates.view', 'view'), async (req, res) => {
  try {
    const { from_currency, to_currency, date } = req.query
    let sql = `SELECT * FROM fx_rates WHERE 1=1`
    const params: unknown[] = []
    let idx = 1
    if (from_currency) {
      sql += ` AND from_currency = $${idx++}`
      params.push(from_currency)
    }
    if (to_currency) {
      sql += ` AND to_currency = $${idx++}`
      params.push(to_currency)
    }
    if (date) {
      sql += ` AND rate_date <= $${idx++}`
      params.push(date)
    }
    sql += ' ORDER BY from_currency, to_currency, rate_date DESC'

    const result = await query(sql, params)
    sendOk(res, result.rows)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch FX rates', err)
  }
})

fxRatesRouter.post('/', requirePermission('finance.fx_rates.edit', 'edit'), async (req, res) => {
  try {
    const parsed = CreateFXSchema.safeParse(req.body)
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
      return
    }
    const { from_currency, to_currency, rate, rate_date, source } = parsed.data

    const today = new Date().toISOString().slice(0, 10)
    if (rate_date > today) {
      sendError(res, 400, 'FUTURE_DATE', 'Rate date cannot be in the future')
      return
    }

    const result = await query(
      `INSERT INTO fx_rates (from_currency, to_currency, rate, rate_date, source)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (from_currency, to_currency, rate_date) DO UPDATE SET rate = EXCLUDED.rate, source = EXCLUDED.source
       RETURNING *`,
      [from_currency, to_currency, rate, rate_date, source],
    )
    sendOk(res, result.rows[0], 201)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to upsert FX rate', err)
  }
})
