import { Router } from 'express'
import type { IRouter } from 'express'
import { z } from 'zod'
import { query, pool } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const returnsRouter: IRouter = Router({ mergeParams: true })

// ── Validation ──────────────────────────────────────────────────────────────

const ReturnItemSchema = z.object({
  po_line_id: z.string().uuid().optional(),
  description: z.string().min(1).max(500),
  quantity_returned: z.coerce.number().positive(),
  original_unit_price: z.coerce.number().min(0),
  assessed_unit_price: z.coerce.number().min(0),
  damage_notes: z.string().optional(),
})

const CreateReturnSchema = z.object({
  return_type: z.enum(['full_refund', 'damage']),
  notes: z.string().optional(),
  damage_description: z.string().optional(),
  currency_code: z.string().length(3).default('IQD'),
  items: z.array(ReturnItemSchema).min(1, 'At least one item is required'),
})

const UpdateReturnSchema = z.object({
  return_type: z.enum(['full_refund', 'damage']).optional(),
  notes: z.string().optional(),
  damage_description: z.string().optional(),
  items: z.array(ReturnItemSchema).min(1).optional(),
})

// ── Number generator ────────────────────────────────────────────────────────

async function generateReturnNumber(companyId: string, poNumber: string): Promise<string> {
  const base = poNumber.replace(/^PO-/i, '')
  const candidate = `RTN-${base}`
  const exists = await query(
    `SELECT 1 FROM po_returns WHERE company_id=$1 AND return_number=$2 LIMIT 1`,
    [companyId, candidate],
  )
  if (exists.rows.length === 0) return candidate
  // suffix with count if duplicate
  const count = await query(
    `SELECT COUNT(*) AS c FROM po_returns WHERE company_id=$1 AND return_number LIKE $2`,
    [companyId, `RTN-${base}%`],
  )
  return `RTN-${base}-${(count.rows[0] as { c: string }).c}`
}

// ── GET /procurement/purchase-orders/:poId/returns ──────────────────────────

returnsRouter.get('/', requirePermission('procurement.po.view', 'view'), async (req, res) => {
  const { poId } = req.params as { poId: string }
  const companyId = req.auth!.companyId
  try {
    const rows = await query<{
      id: string
      return_number: string
      return_type: string
      status: string
      total_returned_value: string
      currency_code: string
      created_at: string
      damage_description: string | null
      notes: string | null
    }>(
      `SELECT id, return_number, return_type, status, total_returned_value,
              currency_code, damage_description, notes, created_at
       FROM po_returns
       WHERE po_id = $1 AND company_id = $2
       ORDER BY created_at DESC`,
      [poId, companyId],
    )
    sendOk(res, rows.rows)
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list returns', err)
  }
})

// ── GET /procurement/purchase-orders/:poId/returns/:id ──────────────────────

returnsRouter.get('/:id', requirePermission('procurement.po.view', 'view'), async (req, res) => {
  const { poId, id } = req.params as { poId: string; id: string }
  const companyId = req.auth!.companyId
  try {
    const ret = await query(
      `SELECT r.*,
              po.po_number, po.vendor_id,
              v.name AS vendor_name,
              cb.email AS created_by_email,
              ab.email AS approved_by_email,
              emp.first_name || ' ' || emp.last_name AS responsible_employee_name,
              emp.employee_number AS responsible_employee_number,
              sdr.id AS deduction_request_id,
              sdr.status AS deduction_status,
              sdr.applied_at AS deduction_applied_at
       FROM po_returns r
       JOIN purchase_orders po ON po.id = r.po_id
       JOIN vendors v ON v.id = po.vendor_id
       LEFT JOIN users cb ON cb.id = r.created_by
       LEFT JOIN users ab ON ab.id = r.approved_by
       LEFT JOIN employees emp ON emp.id = r.responsible_employee_id
       LEFT JOIN salary_deduction_requests sdr ON sdr.source_type='po_return' AND sdr.source_id=r.id
       WHERE r.id = $1 AND r.po_id = $2 AND r.company_id = $3`,
      [id, poId, companyId],
    )
    if (!ret.rows[0]) {
      sendError(res, 404, 'NOT_FOUND', 'Return not found')
      return
    }

    const items = await query(
      `SELECT ri.*, poi.description AS original_description
       FROM po_return_items ri
       LEFT JOIN po_lines poi ON poi.id = ri.po_line_id
       WHERE ri.return_id = $1
       ORDER BY ri.created_at`,
      [id],
    )
    sendOk(res, { ...ret.rows[0], items: items.rows })
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch return', err)
  }
})

// ── POST /procurement/purchase-orders/:poId/returns ─────────────────────────

returnsRouter.post('/', requirePermission('procurement.po.edit', 'edit'), async (req, res) => {
  const { poId } = req.params as { poId: string }
  const companyId = req.auth!.companyId
  const userId = req.auth!.userId

  const parsed = CreateReturnSchema.safeParse(req.body)
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', parsed.error.message)
    return
  }
  const body = parsed.data

  // Validate assessed_unit_price <= original for damage returns
  if (body.return_type === 'damage') {
    for (const item of body.items) {
      if (
        Math.round(item.assessed_unit_price * 10000) > Math.round(item.original_unit_price * 10000)
      ) {
        sendError(
          res,
          400,
          'INVALID_PRICE',
          `Assessed price cannot exceed original price for "${item.description}"`,
        )
        return
      }
    }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Verify PO belongs to company and is in a returnable status
    const po = await client.query(
      `SELECT id, po_number, status, currency_code FROM purchase_orders
       WHERE id=$1 AND company_id=$2`,
      [poId, companyId],
    )
    if (!po.rows[0]) {
      await client.query('ROLLBACK')
      sendError(res, 404, 'NOT_FOUND', 'Purchase order not found')
      return
    }
    const poRow = po.rows[0] as {
      id: string
      po_number: string
      status: string
      currency_code: string
    }
    if (!['received', 'invoiced', 'completed'].includes(poRow.status)) {
      await client.query('ROLLBACK')
      sendError(
        res,
        400,
        'INVALID_STATUS',
        'Returns can only be created for received, invoiced, or completed POs',
      )
      return
    }

    // Validate quantities — can only return what was received, accounting for prior returns
    for (const item of body.items) {
      if (!item.po_line_id) continue
      const lineRow = await client.query(
        `SELECT COALESCE(qty_received, qty_ordered) AS returnable_qty FROM po_lines WHERE id=$1 AND po_id=$2`,
        [item.po_line_id, poId],
      )
      if (!lineRow.rows[0]) continue
      const alreadyReturned = await client.query(
        `SELECT COALESCE(SUM(ri.quantity_returned),0) AS returned
         FROM po_return_items ri
         JOIN po_returns r ON r.id = ri.return_id
         WHERE ri.po_line_id=$1 AND r.status != 'draft'`,
        [item.po_line_id],
      )
      const maxQty = parseFloat((lineRow.rows[0] as { returnable_qty: string }).returnable_qty)
      const alreadyRet = parseFloat((alreadyReturned.rows[0] as { returned: string }).returned)
      if (item.quantity_returned + alreadyRet > maxQty) {
        await client.query('ROLLBACK')
        sendError(
          res,
          400,
          'QTY_EXCEEDS_RECEIVED',
          `Return quantity for "${item.description}" exceeds quantity received (${maxQty - alreadyRet} available)`,
        )
        return
      }
    }

    const returnNumber = await generateReturnNumber(companyId, poRow.po_number)
    const currency = body.currency_code || poRow.currency_code

    const ret = await client.query(
      `INSERT INTO po_returns
         (company_id, po_id, return_number, return_type, status, notes,
          damage_description, currency_code, created_by)
       VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,$8)
       RETURNING id`,
      [
        companyId,
        poId,
        returnNumber,
        body.return_type,
        body.notes ?? null,
        body.damage_description ?? null,
        currency,
        userId,
      ],
    )
    const returnId = (ret.rows[0] as { id: string }).id

    for (const item of body.items) {
      const assessed =
        body.return_type === 'full_refund' ? item.original_unit_price : item.assessed_unit_price
      await client.query(
        `INSERT INTO po_return_items
           (return_id, po_line_id, description, quantity_returned,
            original_unit_price, assessed_unit_price, damage_notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          returnId,
          item.po_line_id ?? null,
          item.description,
          item.quantity_returned,
          item.original_unit_price,
          assessed,
          item.damage_notes ?? null,
        ],
      )
    }

    await client.query('COMMIT')
    await logAudit({
      action: 'po_return.created',
      tableName: 'po_returns',
      recordId: returnId,
      userId,
      companyId,
      newValues: { return_number: returnNumber, return_type: body.return_type },
    })

    sendOk(res, { id: returnId, return_number: returnNumber }, 201)
  } catch (err) {
    await client.query('ROLLBACK')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create return', err)
  } finally {
    client.release()
  }
})

// ── PATCH /procurement/purchase-orders/:poId/returns/:id ────────────────────

returnsRouter.patch('/:id', requirePermission('procurement.po.edit', 'edit'), async (req, res) => {
  const { poId, id } = req.params as { poId: string; id: string }
  const companyId = req.auth!.companyId

  const parsed = UpdateReturnSchema.safeParse(req.body)
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', parsed.error.message)
    return
  }
  const body = parsed.data

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const existing = await client.query(
      `SELECT status, return_type FROM po_returns WHERE id=$1 AND po_id=$2 AND company_id=$3`,
      [id, poId, companyId],
    )
    if (!existing.rows[0]) {
      await client.query('ROLLBACK')
      sendError(res, 404, 'NOT_FOUND', 'Return not found')
      return
    }
    const cur = existing.rows[0] as { status: string; return_type: string }
    if (cur.status !== 'draft') {
      await client.query('ROLLBACK')
      sendError(res, 400, 'INVALID_STATUS', 'Only draft returns can be edited')
      return
    }

    const effectiveType = body.return_type ?? cur.return_type
    if (effectiveType === 'damage' && body.items) {
      for (const item of body.items) {
        if (item.assessed_unit_price > item.original_unit_price) {
          await client.query('ROLLBACK')
          sendError(
            res,
            400,
            'INVALID_PRICE',
            `Assessed price cannot exceed original for "${item.description}"`,
          )
          return
        }
      }
    }

    await client.query(
      `UPDATE po_returns SET
         return_type        = COALESCE($1, return_type),
         notes              = COALESCE($2, notes),
         damage_description = COALESCE($3, damage_description),
         updated_at         = now()
       WHERE id=$4`,
      [body.return_type ?? null, body.notes ?? null, body.damage_description ?? null, id],
    )

    if (body.items) {
      await client.query(`DELETE FROM po_return_items WHERE return_id=$1`, [id])
      for (const item of body.items) {
        const assessed =
          effectiveType === 'full_refund' ? item.original_unit_price : item.assessed_unit_price
        await client.query(
          `INSERT INTO po_return_items
             (return_id, po_line_id, description, quantity_returned,
              original_unit_price, assessed_unit_price, damage_notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            id,
            item.po_line_id ?? null,
            item.description,
            item.quantity_returned,
            item.original_unit_price,
            assessed,
            item.damage_notes ?? null,
          ],
        )
      }
    }

    await client.query('COMMIT')
    sendOk(res, { id })
  } catch (err) {
    await client.query('ROLLBACK')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update return', err)
  } finally {
    client.release()
  }
})

// ── POST /procurement/purchase-orders/:poId/returns/:id/submit ───────────────

returnsRouter.post(
  '/:id/submit',
  requirePermission('procurement.po.edit', 'edit'),
  async (req, res) => {
    const { poId, id } = req.params as { poId: string; id: string }
    const companyId = req.auth!.companyId
    const userId = req.auth!.userId
    try {
      const r = await query(
        `UPDATE po_returns SET status='submitted', submitted_by=$1, submitted_at=now(), updated_at=now()
       WHERE id=$2 AND po_id=$3 AND company_id=$4 AND status='draft'
       RETURNING id`,
        [userId, id, poId, companyId],
      )
      if (!r.rows[0]) {
        sendError(res, 400, 'INVALID_STATUS', 'Return is not in draft status')
        return
      }
      await logAudit({
        action: 'po_return.submitted',
        tableName: 'po_returns',
        recordId: id,
        userId,
        companyId,
      })
      sendOk(res, { id })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to submit return', err)
    }
  },
)

// ── POST /procurement/purchase-orders/:poId/returns/:id/approve ──────────────

returnsRouter.post(
  '/:id/approve',
  requirePermission('procurement.po.approve', 'approve'),
  async (req, res) => {
    const { poId, id } = req.params as { poId: string; id: string }
    const companyId = req.auth!.companyId
    const userId = req.auth!.userId

    // Approver can assign responsible employee at approval time
    const body = req.body as {
      responsible_employee_id?: string
      deduct_from_salary?: boolean
      deduction_amount?: number
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Save employee assignment (if provided) before transitioning status
      if (body.responsible_employee_id) {
        await client.query(
          `UPDATE po_returns SET
           responsible_employee_id = $1,
           deduct_from_salary      = $2,
           deduction_amount        = $3,
           updated_at              = now()
         WHERE id=$4 AND po_id=$5 AND company_id=$6 AND status='submitted'`,
          [
            body.responsible_employee_id,
            body.deduct_from_salary ?? false,
            body.deduction_amount ?? null,
            id,
            poId,
            companyId,
          ],
        )
      }

      const r = await client.query(
        `UPDATE po_returns SET status='approved', approved_by=$1, approved_at=now(), updated_at=now()
       WHERE id=$2 AND po_id=$3 AND company_id=$4 AND status='submitted'
       RETURNING id, responsible_employee_id, deduct_from_salary, deduction_amount, currency_code,
                 return_number, damage_description`,
        [userId, id, poId, companyId],
      )
      if (!r.rows[0]) {
        await client.query('ROLLBACK')
        sendError(res, 400, 'INVALID_STATUS', 'Return is not in submitted status')
        return
      }
      const ret = r.rows[0] as {
        id: string
        responsible_employee_id: string | null
        deduct_from_salary: boolean
        deduction_amount: string | null
        currency_code: string
        return_number: string
        damage_description: string | null
      }

      // Create salary deduction request if employee was assigned and deduction opted
      if (ret.deduct_from_salary && ret.responsible_employee_id && ret.deduction_amount) {
        await client.query(
          `INSERT INTO salary_deduction_requests
           (company_id, employee_id, source_type, source_id, amount, currency_code, reason, created_by)
         VALUES ($1,$2,'po_return',$3,$4,$5,$6,$7)`,
          [
            companyId,
            ret.responsible_employee_id,
            id,
            ret.deduction_amount,
            ret.currency_code,
            `Damage return ${ret.return_number}${ret.damage_description ? `: ${ret.damage_description.substring(0, 100)}` : ''}`,
            userId,
          ],
        )
      }

      await client.query('COMMIT')
      await logAudit({
        action: 'po_return.approved',
        tableName: 'po_returns',
        recordId: id,
        userId,
        companyId,
      })
      sendOk(res, { id })
    } catch (err) {
      await client.query('ROLLBACK')
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to approve return', err)
    } finally {
      client.release()
    }
  },
)

// ── POST /procurement/purchase-orders/:poId/returns/:id/credit ───────────────

returnsRouter.post(
  '/:id/credit',
  requirePermission('finance.ap.edit', 'edit'),
  async (req, res) => {
    const { poId, id } = req.params as { poId: string; id: string }
    const companyId = req.auth!.companyId
    const userId = req.auth!.userId
    const { credit_note_reference } = req.body as { credit_note_reference?: string }
    try {
      const r = await query(
        `UPDATE po_returns
       SET status='credited', credited_by=$1, credited_at=now(),
           credit_note_reference=$2, updated_at=now()
       WHERE id=$3 AND po_id=$4 AND company_id=$5 AND status='approved'
       RETURNING id`,
        [userId, credit_note_reference ?? null, id, poId, companyId],
      )
      if (!r.rows[0]) {
        sendError(res, 400, 'INVALID_STATUS', 'Return is not in approved status')
        return
      }
      await logAudit({
        action: 'po_return.credited',
        tableName: 'po_returns',
        recordId: id,
        userId,
        companyId,
        newValues: { credit_note_reference },
      })
      sendOk(res, { id })
    } catch (err) {
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to mark return as credited', err)
    }
  },
)

// ── DELETE /procurement/purchase-orders/:poId/returns/:id ───────────────────

returnsRouter.delete('/:id', requirePermission('procurement.po.edit', 'edit'), async (req, res) => {
  const { poId, id } = req.params as { poId: string; id: string }
  const companyId = req.auth!.companyId
  try {
    const r = await query(
      `DELETE FROM po_returns WHERE id=$1 AND po_id=$2 AND company_id=$3 AND status='draft'
       RETURNING id`,
      [id, poId, companyId],
    )
    if (!r.rows[0]) {
      sendError(res, 400, 'INVALID_STATUS', 'Only draft returns can be deleted')
      return
    }
    sendOk(res, { id })
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to delete return', err)
  }
})
