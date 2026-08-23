import { Router, type IRouter } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole } from '@fnc-erp/auth'
import { listPoFxRates, upsertPoFxRate, deletePoFxRate, pool } from '@fnc-erp/db'
import { logger } from '@fnc-erp/logger'
import type { Request, Response } from 'express'

const log = logger.child({ module: 'po-fx-rates' })

export const poFxRatesRouter: IRouter = Router()

const requireAdmin = [requireAuth(), requireRole('system_admin')]

const upsertSchema = z.object({
  currency_code: z.string().length(3),
  rate_to_base: z.number().positive(),
})

// GET /api/v1/admin/po-fx-rates
// Returns every currency the caller's company has configured a PO exchange rate for.
poFxRatesRouter.get('/', ...requireAdmin, async (req: Request, res: Response) => {
  try {
    const rates = await listPoFxRates(req.auth!.companyId)
    // default_po_currency lives on system_configuration (one row per company),
    // not on companies itself, and is distinct from that table's general
    // default_currency — see createPurchaseOrder in resolvers.ts for the same fix.
    const companyRes = await pool.query<{ default_po_currency: string }>(
      `SELECT default_po_currency FROM system_configuration WHERE company_id=$1`,
      [req.auth!.companyId],
    )
    res.json({ rates, base_currency: companyRes.rows[0]?.default_po_currency ?? 'IQD' })
  } catch (err) {
    log.error({ err }, 'po-fx-rates GET failed')
    res.status(500).json({ error: 'INTERNAL_ERROR' })
  }
})

// PUT /api/v1/admin/po-fx-rates/:currencyCode
poFxRatesRouter.put('/:currencyCode', ...requireAdmin, async (req: Request, res: Response) => {
  const parsed = upsertSchema.safeParse({ ...req.body, currency_code: req.params.currencyCode })
  if (!parsed.success) {
    res.status(400).json({ error: 'VALIDATION_ERROR', issues: parsed.error.issues })
    return
  }
  try {
    const row = await upsertPoFxRate(
      req.auth!.companyId,
      parsed.data.currency_code,
      parsed.data.rate_to_base,
      req.auth!.userId,
    )
    res.json(row)
  } catch (err) {
    log.error({ err }, 'po-fx-rates PUT failed')
    res.status(500).json({ error: 'INTERNAL_ERROR' })
  }
})

// DELETE /api/v1/admin/po-fx-rates/:currencyCode
poFxRatesRouter.delete('/:currencyCode', ...requireAdmin, async (req: Request, res: Response) => {
  try {
    await deletePoFxRate(req.auth!.companyId, req.params.currencyCode)
    res.json({ ok: true })
  } catch (err) {
    log.error({ err }, 'po-fx-rates DELETE failed')
    res.status(500).json({ error: 'INTERNAL_ERROR' })
  }
})
