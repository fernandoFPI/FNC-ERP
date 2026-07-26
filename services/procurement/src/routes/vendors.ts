import { Router } from 'express'
import type { IRouter } from 'express'
import { z } from 'zod'
import { query } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const vendorsRouter: IRouter = Router()

const Schema = z.object({
  name: z.string().min(1).max(255),
  legal_name: z.string().max(255).optional(),
  tax_id: z.string().max(100).optional(),
  currency_code: z.string().length(3).default('IQD'),
  payment_terms_days: z.number().int().min(0).default(30),
  address: z.string().optional(),
  city: z.string().max(100).optional(),
  country_code: z.string().length(2).default('IQ'),
  contact_name: z.string().max(255).optional(),
  contact_email: z.string().email().max(255).optional(),
  contact_phone: z.string().max(50).optional(),
  bank_name: z.string().max(255).optional(),
  bank_account: z.string().max(255).optional(),
})

vendorsRouter.get('/', requirePermission('procurement.vendors.view', 'view'), async (req, res) => {
  try {
    const { is_active } = req.query
    let sql = `SELECT * FROM vendors WHERE company_id = $1`
    const params: unknown[] = [req.auth!.companyId]
    if (is_active !== undefined) {
      sql += ` AND is_active = $2`
      params.push(is_active === 'true')
    }
    sql += ' ORDER BY name'
    const result = await query(sql, params)
    sendOk(res, result.rows)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch vendors', err)
  }
})

vendorsRouter.get(
  '/:id',
  requirePermission('procurement.vendors.view', 'view'),
  async (req, res) => {
    try {
      const result = await query('SELECT * FROM vendors WHERE id = $1 AND company_id = $2', [
        req.params['id'],
        req.auth!.companyId,
      ])
      const row = result.rows[0]
      if (!row) {
        sendError(res, 404, 'NOT_FOUND', 'Vendor not found')
        return
      }
      sendOk(res, row)
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch vendor', err)
    }
  },
)

vendorsRouter.post('/', requirePermission('procurement.vendors.edit', 'edit'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const parsed = Schema.safeParse(req.body)
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
      return
    }
    const d = parsed.data
    const result = await query(
      `INSERT INTO vendors (company_id, name, legal_name, tax_id, currency_code, payment_terms_days,
         address, city, country_code, contact_name, contact_email, contact_phone, bank_name, bank_account)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [
        companyId,
        d.name,
        d.legal_name ?? null,
        d.tax_id ?? null,
        d.currency_code,
        d.payment_terms_days,
        d.address ?? null,
        d.city ?? null,
        d.country_code,
        d.contact_name ?? null,
        d.contact_email ?? null,
        d.contact_phone ?? null,
        d.bank_name ?? null,
        d.bank_account ?? null,
      ],
    )
    const vendor = result.rows[0]!
    await logAudit({
      companyId,
      userId: req.auth!.userId,
      action: 'CREATE',
      tableName: 'vendors',
      recordId: vendor['id'] as string,
    })
    sendOk(res, vendor, 201)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create vendor', err)
  }
})

vendorsRouter.put(
  '/:id',
  requirePermission('procurement.vendors.edit', 'edit'),
  async (req, res) => {
    try {
      const companyId = req.auth!.companyId
      const parsed = Schema.partial().safeParse(req.body)
      if (!parsed.success) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
        return
      }
      const d = parsed.data
      const updates: string[] = []
      const params: unknown[] = []
      let idx = 1
      const fields: [string, unknown][] = [
        ['name', d.name],
        ['legal_name', d.legal_name],
        ['tax_id', d.tax_id],
        ['currency_code', d.currency_code],
        ['payment_terms_days', d.payment_terms_days],
        ['address', d.address],
        ['city', d.city],
        ['country_code', d.country_code],
        ['contact_name', d.contact_name],
        ['contact_email', d.contact_email],
        ['contact_phone', d.contact_phone],
        ['bank_name', d.bank_name],
        ['bank_account', d.bank_account],
      ]
      for (const [col, val] of fields) {
        if (val !== undefined) {
          updates.push(`${col} = $${idx++}`)
          params.push(val)
        }
      }
      if (updates.length === 0) {
        sendError(res, 400, 'NO_CHANGES', 'No fields to update')
        return
      }
      updates.push(`updated_at = NOW()`)
      params.push(req.params['id'], companyId)
      const result = await query(
        `UPDATE vendors SET ${updates.join(', ')} WHERE id = $${idx++} AND company_id = $${idx++} RETURNING *`,
        params,
      )
      if (!result.rows[0]) {
        sendError(res, 404, 'NOT_FOUND', 'Vendor not found')
        return
      }
      await logAudit({
        companyId,
        userId: req.auth!.userId,
        action: 'UPDATE',
        tableName: 'vendors',
        recordId: req.params['id']!,
        newValues: parsed.data,
      })
      sendOk(res, result.rows[0])
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update vendor', err)
    }
  },
)

vendorsRouter.delete(
  '/:id',
  requirePermission('procurement.vendors.edit', 'edit'),
  async (req, res) => {
    try {
      const companyId = req.auth!.companyId
      const pos = await query(
        'SELECT COUNT(*) FROM purchase_orders WHERE vendor_id = $1 AND company_id = $2',
        [req.params['id'], companyId],
      )
      if (parseInt((pos.rows[0] as { count: string }).count) > 0) {
        sendError(res, 409, 'HAS_PURCHASE_ORDERS', 'Cannot delete vendor with purchase orders')
        return
      }
      await query(
        'UPDATE vendors SET is_active = false, updated_at = NOW() WHERE id = $1 AND company_id = $2',
        [req.params['id'], companyId],
      )
      await logAudit({
        companyId,
        userId: req.auth!.userId,
        action: 'DELETE',
        tableName: 'vendors',
        recordId: req.params['id']!,
      })
      sendOk(res, { deleted: true })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to delete vendor', err)
    }
  },
)
