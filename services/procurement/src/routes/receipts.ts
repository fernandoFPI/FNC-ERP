import { Router } from 'express'
import type { IRouter } from 'express'
import { z } from 'zod'
import { query, pool } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const receiptsRouter: IRouter = Router()

const ReceiptLineSchema = z.object({
  po_line_id: z.string().uuid(),
  qty_received: z.number().positive(),
})

const CreateReceiptSchema = z.object({
  receipt_number: z.string().min(1).max(50),
  received_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  warehouse_location_id: z.string().uuid(),
  notes: z.string().optional(),
  lines: z.array(ReceiptLineSchema).min(1),
})

receiptsRouter.get('/:poId/receipts', requirePermission('procurement.po.view', 'view'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const po = await query('SELECT id FROM purchase_orders WHERE id = $1 AND company_id = $2', [req.params['poId'], companyId])
    if (!po.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Purchase order not found')
    const result = await query('SELECT * FROM po_receipts WHERE po_id = $1 ORDER BY received_date DESC', [req.params['poId']])
    sendOk(res, result.rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch receipts', err) }
})

receiptsRouter.post('/:poId/receipts', requirePermission('procurement.po.edit', 'edit'), async (req, res) => {
  const companyId = req.auth!.companyId
  const parsed = CreateReceiptSchema.safeParse(req.body)
  if (!parsed.success) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())

  const { receipt_number, received_date, warehouse_location_id, notes, lines } = parsed.data
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const poResult = await client.query(
      'SELECT * FROM purchase_orders WHERE id = $1 AND company_id = $2 FOR UPDATE',
      [req.params['poId'], companyId],
    )
    const po = poResult.rows[0] as { id: string; status: string; currency_code: string } | undefined
    if (!po) { await client.query('ROLLBACK'); return sendError(res, 404, 'NOT_FOUND', 'Purchase order not found') }

    if (po['status'] !== 'approved' && po['status'] !== 'goods_received') {
      await client.query('ROLLBACK')
      return sendError(res, 422, 'INVALID_STATUS', `Cannot receive against a PO in status '${po['status']}' — PO must be approved or goods_received`)
    }

    // Create the receipt record
    const receiptResult = await client.query(
      `INSERT INTO po_receipts (po_id, receipt_number, received_date, received_by, warehouse_location_id, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [po['id'], receipt_number, received_date, req.auth!.userId, warehouse_location_id, notes ?? null],
    )
    const receipt = receiptResult.rows[0]!
    const receiptId = receipt['id'] as string

    for (const rl of lines) {
      // Verify po_line belongs to this PO
      const lineResult = await client.query(
        'SELECT * FROM po_lines WHERE id = $1 AND po_id = $2',
        [rl.po_line_id, po['id']],
      )
      const poLine = lineResult.rows[0] as {
        id: string; product_id: string | null; qty_ordered: string; qty_received: string; unit_price: string; actual_unit_price: string | null
      } | undefined
      if (!poLine) { await client.query('ROLLBACK'); return sendError(res, 400, 'INVALID_LINE', `PO line ${rl.po_line_id} not found`) }

      const alreadyReceived = parseFloat(poLine['qty_received'])
      const newTotalReceived = alreadyReceived + rl.qty_received
      const qtyOrdered = parseFloat(poLine['qty_ordered'])

      await client.query(
        'INSERT INTO po_receipt_lines (receipt_id, po_line_id, qty_received) VALUES ($1,$2,$3)',
        [receiptId, rl.po_line_id, rl.qty_received],
      )

      if (newTotalReceived > qtyOrdered) {
        // Actual quantity purchased exceeds original request — silently update qty_ordered
        // and recalculate total_price based on actual_unit_price if available, else unit_price
        await client.query(
          `UPDATE po_lines
             SET qty_received = $1,
                 qty_ordered  = $1,
                 total_price  = $1 * COALESCE(actual_unit_price, unit_price)
           WHERE id = $2`,
          [newTotalReceived, rl.po_line_id],
        )
      } else {
        await client.query(
          'UPDATE po_lines SET qty_received = qty_received + $1 WHERE id = $2',
          [rl.qty_received, rl.po_line_id],
        )
      }

      // Write stock move request to outbox INSIDE the same transaction.
      // If this write fails the entire receipt rolls back — no ghost receipts.
      // The outbox worker delivers to inventory when it is available.
      // Use actual_unit_price for inventory cost basis when available.
      if (poLine['product_id']) {
        const unitCost = poLine['actual_unit_price']
          ? parseFloat(String(poLine['actual_unit_price']))
          : parseFloat(poLine['unit_price'])
        const outboxPayload = {
          company_id: companyId,
          product_id: poLine['product_id'],
          warehouse_location_id,
          qty: rl.qty_received,
          unit_cost: unitCost,
          currency_code: po['currency_code'],
          source_type: 'po_receipt',
          source_id: receiptId,
          moved_by: req.auth!.userId,
        }
        await client.query(
          `INSERT INTO service_outbox (service, event_type, payload) VALUES ('inventory','STOCK_MOVE_REQUESTED',$1)`,
          [JSON.stringify(outboxPayload)],
        )
      }
    }

    // Auto-transition approved → goods_received on first receipt recorded
    const receiptCount = await client.query(
      `SELECT COUNT(*) AS c FROM po_receipts WHERE po_id=$1`,
      [po['id']],
    )
    const isFirstReceipt = parseInt(String(receiptCount.rows[0]?.['c'] ?? '0')) <= 1
    if (isFirstReceipt && po['status'] === 'approved') {
      await client.query(
        `UPDATE purchase_orders SET status='goods_received', updated_at=NOW() WHERE id=$1`,
        [po['id']],
      )
      await client.query(
        `INSERT INTO po_approval_log (po_id, actor_id, action, notes)
         VALUES ($1,$2,'receive_goods','Auto-transitioned to goods_received on first receipt')`,
        [po['id'], req.auth!.userId],
      )
      // Notify the organizer that goods have been received
      const orgRes = await client.query<{ organizer_id: string; po_number: string }>(
        `SELECT organizer_id, po_number FROM purchase_orders WHERE id=$1`, [po['id']]
      )
      const orgId = orgRes.rows[0]?.organizer_id
      const poNum = String(orgRes.rows[0]?.po_number ?? '')
      if (orgId) {
        await client.query(
          `INSERT INTO service_outbox (service, event_type, payload) VALUES ('notifications','PO_GOODS_RECEIVED',$1)`,
          [JSON.stringify({
            userId: orgId, companyId, poId: po['id'], poNumber: poNum,
            title: `Goods received: ${poNum}`,
            body: `Items have been received for purchase order ${poNum}. Receipt: ${receipt_number}`,
          })]
        )
      }
    }

    // Audit inside the same transaction
    await logAudit({
      companyId, userId: req.auth!.userId, action: 'CREATE', tableName: 'po_receipts',
      recordId: receiptId, newValues: { receipt_number, received_date }, client,
    })

    await client.query('COMMIT')
    sendOk(res, receipt, 201)
  } catch (err) {
    await client.query('ROLLBACK')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create receipt', err)
  } finally {
    client.release()
  }
})
