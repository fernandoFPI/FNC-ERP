import { Router } from 'express'
import type { IRouter } from 'express'
import { z } from 'zod'
import { pool, query } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { moStateMachine } from '@fnc-erp/workflow'
import { generateMONumber } from '../lib/mo-number.js'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const ordersRouter: IRouter = Router()

const CreateSchema = z.object({
  bom_id: z.string().uuid(),
  project_id: z.string().uuid().optional(),
  qty_planned: z.number().positive(),
  dispatch_type: z.enum(['direct_to_site','warehouse_first']).default('warehouse_first'),
  destination_location_id: z.string().uuid().optional(),
  scheduled_start: z.string().optional(),
  scheduled_end: z.string().optional(),
  notes: z.string().optional(),
})

ordersRouter.get('/', requirePermission('manufacturing.orders.view', 'view'), async (req, res) => {
  try {
    const { status, project_id, from_date, to_date } = req.query
    const page = Math.max(1, parseInt(req.query['page'] as string || '1'))
    const limit = Math.min(100, parseInt(req.query['limit'] as string || '20'))
    const offset = (page - 1) * limit

    let sql = `SELECT mo.*, p.name AS product_name
               FROM manufacturing_orders mo
               JOIN products p ON p.id = mo.finished_product_id
               WHERE mo.company_id = $1`
    const params: unknown[] = [req.auth!.companyId]
    let idx = 2
    if (status) { sql += ` AND mo.status = $${idx++}`; params.push(status) }
    if (project_id) { sql += ` AND mo.project_id = $${idx++}`; params.push(project_id) }
    if (from_date) { sql += ` AND mo.scheduled_start >= $${idx++}`; params.push(from_date) }
    if (to_date) { sql += ` AND mo.scheduled_start <= $${idx++}`; params.push(to_date) }
    sql += ` ORDER BY mo.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`
    params.push(limit, offset)
    const result = await query(sql, params)
    sendOk(res, result.rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch orders', err) }
})

ordersRouter.get('/:id', requirePermission('manufacturing.orders.view', 'view'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const id = req.params['id']!
    const mo = await query(
      `SELECT mo.*, p.name AS product_name FROM manufacturing_orders mo
       JOIN products p ON p.id = mo.finished_product_id
       WHERE mo.id = $1 AND mo.company_id = $2`,
      [id, companyId],
    )
    if (!mo.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Manufacturing order not found')
    const [consumptions, wcTime] = await Promise.all([
      query(`SELECT mc.*, p.name AS component_name FROM mo_consumptions mc
             JOIN products p ON p.id = mc.component_product_id WHERE mc.mo_id = $1`, [id]),
      query(`SELECT mwt.*, wc.name AS work_center_name FROM mo_work_center_time mwt
             JOIN work_centers wc ON wc.id = mwt.work_center_id WHERE mwt.mo_id = $1`, [id]),
    ])
    sendOk(res, { ...mo.rows[0], consumptions: consumptions.rows, work_center_time: wcTime.rows })
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch order', err) }
})

ordersRouter.post('/', requirePermission('manufacturing.orders.edit', 'edit'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const userId = req.auth!.userId
    const parsed = CreateSchema.safeParse(req.body)
    if (!parsed.success) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
    const d = parsed.data

    const bom = await query(
      `SELECT b.*, array_agg(row_to_json(bl)) AS lines
       FROM boms b LEFT JOIN bom_lines bl ON bl.bom_id = b.id
       WHERE b.id = $1 AND b.company_id = $2 AND b.is_active = true
       GROUP BY b.id`,
      [d.bom_id, companyId],
    )
    if (!bom.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'BOM not found or inactive')
    const bomData = bom.rows[0] as Record<string, unknown>
    const lines = (bomData['lines'] as null | Record<string, unknown>[]) ?? []

    const moNumber = await generateMONumber(companyId)

    // Calculate planned cost
    let plannedCost = 0
    for (const line of lines) {
      if (!line) continue
      const comp = await query<{ average_cost: string }>('SELECT average_cost FROM products WHERE id = $1', [line['component_product_id']])
      const unitCost = parseFloat(comp.rows[0]?.['average_cost'] ?? '0')
      plannedCost += unitCost * Number(line['qty_required']) * d.qty_planned

      // Add WC labour cost
      if (line['work_center_id'] && line['operation_time_hours']) {
        const wc = await query<{ cost_per_hour: string }>('SELECT cost_per_hour FROM work_centers WHERE id = $1', [line['work_center_id']])
        const cph = parseFloat(wc.rows[0]?.['cost_per_hour'] ?? '0')
        plannedCost += cph * Number(line['operation_time_hours']) * d.qty_planned
      }
    }

    // Get project analytic account
    let analyticAccountId: string | null = null
    if (d.project_id) {
      const proj = await query<{ analytic_account_id: string }>('SELECT analytic_account_id FROM projects WHERE id = $1', [d.project_id])
      analyticAccountId = proj.rows[0]?.['analytic_account_id'] ?? null
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query<{ id: string }>(
        `INSERT INTO manufacturing_orders
           (company_id, mo_number, bom_id, finished_product_id, project_id, analytic_account_id,
            qty_planned, dispatch_type, destination_location_id, planned_cost, currency_code,
            scheduled_start, scheduled_end, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'IQD',$11,$12,$13,$14) RETURNING *`,
        [companyId, moNumber, d.bom_id, bomData['finished_product_id'], d.project_id ?? null,
         analyticAccountId, d.qty_planned, d.dispatch_type, d.destination_location_id ?? null,
         plannedCost, d.scheduled_start ?? null, d.scheduled_end ?? null, d.notes ?? null, userId],
      )
      const mo = result.rows[0]!
      const moId = mo['id'] as string

      // Create consumption rows from BOM lines
      for (const line of lines) {
        if (!line) continue
        await client.query(
          `INSERT INTO mo_consumptions (mo_id, component_product_id, bom_line_id, qty_planned)
           VALUES ($1,$2,$3,$4)`,
          [moId, line['component_product_id'], line['id'], Number(line['qty_required']) * d.qty_planned],
        )
        // Create WC time rows
        if (line['work_center_id'] && line['operation_time_hours']) {
          const wcResult = await client.query<{ cost_per_hour: string }>(
            'SELECT cost_per_hour FROM work_centers WHERE id = $1', [line['work_center_id']],
          )
          await client.query(
            `INSERT INTO mo_work_center_time (mo_id, work_center_id, planned_hours, cost_per_hour)
             VALUES ($1,$2,$3,$4)`,
            [moId, line['work_center_id'], Number(line['operation_time_hours']) * d.qty_planned,
             wcResult.rows[0]?.['cost_per_hour'] ?? 0],
          )
        }
      }
      await client.query('COMMIT')
      await logAudit({ companyId, userId, action: 'CREATE', tableName: 'manufacturing_orders', recordId: moId })
      const moNum = moNumber
      ;(async () => {
        const managers = await query(
          `SELECT DISTINCT u.id AS user_id FROM users u
           JOIN user_company_roles ucr ON ucr.user_id = u.id
           WHERE ucr.company_id = $1
             AND (ucr.role IN ('company_admin', 'system_admin')
                  OR (ucr.module = 'manufacturing' AND ucr.role = 'module_admin'))
             AND u.is_active = true`,
          [companyId],
        )
        for (const u of managers.rows) {
          await query(
            `INSERT INTO service_outbox (service,event_type,payload) VALUES ('notifications','MO_CREATED',$1)`,
            [JSON.stringify({ userId: u['user_id'], companyId, title: `New MO requires confirmation: ${moNum}`,
              body: `Manufacturing order ${moNum} has been created and is awaiting confirmation before production can begin`,
              data: { moId, moNumber: moNum } })],
          )
        }
      })().catch(() => {})
      sendOk(res, mo, 201)
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create MO', err) }
})

// POST /:id/confirm
ordersRouter.post('/:id/confirm', requirePermission('manufacturing.orders.approve', 'approve'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const id = req.params['id']!
    const mo = await query('SELECT * FROM manufacturing_orders WHERE id = $1 AND company_id = $2', [id, companyId])
    if (!mo.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'MO not found')
    const moData = mo.rows[0] as Record<string, unknown>
    await moStateMachine.transition(moData['status'] as never, 'confirm')

    // Check stock availability
    const consumptions = await query('SELECT * FROM mo_consumptions WHERE mo_id = $1', [id])
    for (const c of consumptions.rows as Record<string, unknown>[]) {
      const stock = await query<{ qty_on_hand: string; qty_reserved: string }>(
        `SELECT COALESCE(SUM(qty_on_hand),0) AS qty_on_hand, COALESCE(SUM(qty_reserved),0) AS qty_reserved
         FROM stock_balances sb JOIN stock_locations sl ON sl.id = sb.location_id
         WHERE sb.product_id = $1 AND sl.company_id = $2 AND sl.type = 'warehouse'`,
        [c['component_product_id'], companyId],
      )
      const available = parseFloat(stock.rows[0]?.['qty_on_hand'] ?? '0') - parseFloat(stock.rows[0]?.['qty_reserved'] ?? '0')
      if (available < Number(c['qty_planned'])) {
        return sendError(res, 409, 'INSUFFICIENT_STOCK',
          `Insufficient stock for product ${String(c['component_product_id'])}. Need ${String(c['qty_planned'])}, available ${available}`)
      }
    }

    await query('UPDATE manufacturing_orders SET status=$1, updated_at=NOW() WHERE id=$2', ['confirmed', id])
    const createdBy = moData['created_by'] as string | null
    const moNum = String(moData['mo_number'] ?? '')
    if (createdBy) {
      query(
        `INSERT INTO service_outbox (service,event_type,payload) VALUES ('notifications','MO_CONFIRMED',$1)`,
        [JSON.stringify({ userId: createdBy, companyId, title: `MO Confirmed: ${moNum}`, body: `Manufacturing order ${moNum} has been confirmed and is ready to start`, data: { moId: id, moNumber: moNum } })]
      ).catch(() => {})
    }
    sendOk(res, { id, status: 'confirmed' })
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string }
    if (e.name === 'WorkflowError') return sendError(res, 409, 'INVALID_TRANSITION', e.message ?? 'Invalid transition')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to confirm MO', err)
  }
})

// POST /:id/start
ordersRouter.post('/:id/start', requirePermission('manufacturing.orders.approve', 'approve'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const id = req.params['id']!
    const mo = await query('SELECT status, created_by, mo_number FROM manufacturing_orders WHERE id = $1 AND company_id = $2', [id, companyId])
    if (!mo.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'MO not found')
    const moRow = mo.rows[0] as { status: string; created_by: string | null; mo_number: string }
    await moStateMachine.transition(moRow.status as never, 'start')
    await query('UPDATE manufacturing_orders SET status=$1, actual_start=NOW(), updated_at=NOW() WHERE id=$2', ['in_progress', id])
    if (moRow.created_by) {
      query(
        `INSERT INTO service_outbox (service,event_type,payload) VALUES ('notifications','MO_STARTED',$1)`,
        [JSON.stringify({ userId: moRow.created_by, companyId, title: `MO Started: ${moRow.mo_number}`, body: `Manufacturing order ${moRow.mo_number} has started production`, data: { moId: id, moNumber: moRow.mo_number } })]
      ).catch(() => {})
    }
    sendOk(res, { id, status: 'in_progress' })
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string }
    if (e.name === 'WorkflowError') return sendError(res, 409, 'INVALID_TRANSITION', e.message ?? 'Invalid transition')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to start MO', err)
  }
})

// POST /:id/complete
const CompleteSchema = z.object({
  qty_produced: z.number().positive(),
  consumptions: z.array(z.object({ mo_consumption_id: z.string().uuid(), qty_consumed: z.number().min(0) })),
  work_center_time: z.array(z.object({ mo_work_center_time_id: z.string().uuid(), actual_hours: z.number().min(0) })).optional(),
})

ordersRouter.post('/:id/complete', requirePermission('manufacturing.orders.approve', 'approve'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const userId = req.auth!.userId
    const id = req.params['id']!

    const parsed = CompleteSchema.safeParse(req.body)
    if (!parsed.success) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
    const d = parsed.data

    const mo = await query('SELECT * FROM manufacturing_orders WHERE id = $1 AND company_id = $2', [id, companyId])
    if (!mo.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'MO not found')
    const moData = mo.rows[0] as Record<string, unknown>

    await moStateMachine.transition(moData['status'] as never, 'complete')

    if (d.qty_produced > Number(moData['qty_planned'])) {
      return sendError(res, 409, 'EXCEEDS_PLANNED', `qty_produced (${d.qty_produced}) exceeds qty_planned (${String(moData['qty_planned'])})`)
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      let totalMaterialCost = 0
      let totalLabourCost = 0

      // Process consumptions
      for (const c of d.consumptions) {
        const consumption = await client.query<Record<string, string>>(
          'SELECT * FROM mo_consumptions WHERE id = $1 AND mo_id = $2',
          [c.mo_consumption_id, id],
        )
        if (!consumption.rows[0]) continue
        const productId = consumption.rows[0]['component_product_id']!
        const product = await client.query<{ average_cost: string; id: string }>(
          'SELECT id, average_cost FROM products WHERE id = $1', [productId],
        )
        const unitCost = parseFloat(product.rows[0]?.['average_cost'] ?? '0')
        const lineCost = c.qty_consumed * unitCost
        totalMaterialCost += lineCost

        await client.query(
          `UPDATE mo_consumptions SET qty_consumed=$1, unit_cost=$2, total_cost=$3 WHERE id=$4`,
          [c.qty_consumed, unitCost, lineCost, c.mo_consumption_id],
        )

        // Find virtual_out and warehouse location
        const virtualOut = await client.query<{ id: string }>(
          `SELECT id FROM stock_locations WHERE company_id = $1 AND type = 'virtual_out' LIMIT 1`, [companyId],
        )
        const warehouse = await client.query<{ id: string }>(
          `SELECT id FROM stock_locations WHERE company_id = $1 AND type = 'warehouse' LIMIT 1`, [companyId],
        )
        if (warehouse.rows[0] && virtualOut.rows[0] && c.qty_consumed > 0) {
          await client.query(
            `INSERT INTO stock_moves (company_id, product_id, from_location_id, to_location_id, qty, unit_cost, total_cost, source_type, source_id, moved_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'mo_consumption',$8,$9)`,
            [companyId, productId, warehouse.rows[0]['id'], virtualOut.rows[0]['id'],
             c.qty_consumed, unitCost, lineCost, id, userId],
          )
        }
      }

      // Process work center time
      for (const wct of d.work_center_time ?? []) {
        const wcTime = await client.query<Record<string, string>>(
          'SELECT * FROM mo_work_center_time WHERE id = $1 AND mo_id = $2',
          [wct.mo_work_center_time_id, id],
        )
        if (!wcTime.rows[0]) continue
        const cph = parseFloat(wcTime.rows[0]['cost_per_hour']!)
        const lineCost = wct.actual_hours * cph
        totalLabourCost += lineCost
        await client.query(
          `UPDATE mo_work_center_time SET actual_hours=$1, total_cost=$2 WHERE id=$3`,
          [wct.actual_hours, lineCost, wct.mo_work_center_time_id],
        )
      }

      const actualCost = totalMaterialCost + totalLabourCost
      const unitCostFinished = d.qty_produced > 0 ? actualCost / d.qty_produced : 0

      // Stock move for finished goods
      const destLocationId = moData['destination_location_id'] as string | null
      const warehouseLoc = await client.query<{ id: string }>(
        `SELECT id FROM stock_locations WHERE company_id = $1 AND type = 'warehouse' LIMIT 1`, [companyId],
      )
      const toLocationId = moData['dispatch_type'] === 'direct_to_site' && destLocationId
        ? destLocationId
        : (warehouseLoc.rows[0]?.['id'] ?? null)
      const virtualOut2 = await client.query<{ id: string }>(
        `SELECT id FROM stock_locations WHERE company_id = $1 AND type = 'virtual_out' LIMIT 1`, [companyId],
      )
      if (virtualOut2.rows[0] && toLocationId && d.qty_produced > 0) {
        await client.query(
          `INSERT INTO stock_moves (company_id, product_id, from_location_id, to_location_id, qty, unit_cost, total_cost, source_type, source_id, moved_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'mo_completion',$8,$9)`,
          [companyId, moData['finished_product_id'], virtualOut2.rows[0]['id'], toLocationId,
           d.qty_produced, unitCostFinished, actualCost, id, userId],
        )
      }

      // Queue outbox event for GL journal
      await client.query(
        `INSERT INTO service_outbox (service, event_type, payload) VALUES ('finance','MO_JOURNAL_REQUESTED', $1)`,
        [JSON.stringify({
          mo_id: id, company_id: companyId, material_cost: totalMaterialCost,
          labour_cost: totalLabourCost, actual_cost: actualCost, qty_produced: d.qty_produced,
          product_id: moData['finished_product_id'], analytic_account_id: moData['analytic_account_id'],
        })],
      )

      await client.query(
        `UPDATE manufacturing_orders SET status='completed', qty_produced=$1, actual_cost=$2,
         actual_end=NOW(), updated_at=NOW() WHERE id=$3`,
        [d.qty_produced, actualCost, id],
      )

      const moCreatedBy = moData['created_by'] as string | null
      const moNum2 = String(moData['mo_number'] ?? '')
      if (moCreatedBy) {
        await client.query(
          `INSERT INTO service_outbox (service,event_type,payload) VALUES ('notifications','MO_COMPLETED',$1)`,
          [JSON.stringify({ userId: moCreatedBy, companyId, title: `MO Completed: ${moNum2}`, body: `Manufacturing order ${moNum2} completed. Qty produced: ${d.qty_produced}, actual cost: ${actualCost.toFixed(2)} IQD`, data: { moId: id, moNumber: moNum2, qtyProduced: d.qty_produced, actualCost } })]
        )
      }

      await client.query('COMMIT')
      await logAudit({ companyId, userId, action: 'UPDATE', tableName: 'manufacturing_orders', recordId: id, newValues: { status: 'completed', actual_cost: actualCost } })
      sendOk(res, { id, status: 'completed', actual_cost: actualCost, unit_cost: unitCostFinished })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string }
    if (e.name === 'WorkflowError') return sendError(res, 409, 'INVALID_TRANSITION', e.message ?? 'Invalid transition')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to complete MO', err)
  }
})

// POST /:id/cancel
ordersRouter.post('/:id/cancel', requirePermission('manufacturing.orders.approve', 'approve'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const id = req.params['id']!
    const mo = await query('SELECT status, created_by, mo_number FROM manufacturing_orders WHERE id = $1 AND company_id = $2', [id, companyId])
    if (!mo.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'MO not found')
    const moData = mo.rows[0] as { status: string; created_by: string | null; mo_number: string }
    await moStateMachine.transition(moData.status as never, 'cancel')
    await query('UPDATE manufacturing_orders SET status=$1, updated_at=NOW() WHERE id=$2', ['cancelled', id])
    if (moData.created_by && moData.created_by !== req.auth!.userId) {
      query(
        `INSERT INTO service_outbox (service,event_type,payload) VALUES ('notifications','MO_CANCELLED',$1)`,
        [JSON.stringify({ userId: moData.created_by, companyId, title: `MO Cancelled: ${moData.mo_number}`, body: `Manufacturing order ${moData.mo_number} has been cancelled`, data: { moId: id, moNumber: moData.mo_number } })]
      ).catch(() => {})
    }
    sendOk(res, { id, status: 'cancelled' })
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string }
    if (e.name === 'WorkflowError') return sendError(res, 409, 'INVALID_TRANSITION', e.message ?? 'Invalid transition')
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to cancel MO', err)
  }
})

// GET /:id/cost-analysis
ordersRouter.get('/:id/cost-analysis', requirePermission('manufacturing.orders.view', 'view'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const id = req.params['id']!
    const mo = await query('SELECT * FROM manufacturing_orders WHERE id = $1 AND company_id = $2', [id, companyId])
    if (!mo.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'MO not found')
    const consumptions = await query(
      `SELECT mc.*, p.name AS component_name FROM mo_consumptions mc
       JOIN products p ON p.id = mc.component_product_id WHERE mc.mo_id = $1`,
      [id],
    )
    const wcTime = await query(
      `SELECT mwt.*, wc.name AS work_center_name FROM mo_work_center_time mwt
       JOIN work_centers wc ON wc.id = mwt.work_center_id WHERE mwt.mo_id = $1`,
      [id],
    )
    const moData = mo.rows[0] as Record<string, unknown>
    sendOk(res, {
      mo_id: id,
      planned_cost: moData['planned_cost'],
      actual_cost: moData['actual_cost'],
      variance: Number(moData['actual_cost'] ?? 0) - Number(moData['planned_cost'] ?? 0),
      material_consumptions: consumptions.rows,
      work_center_time: wcTime.rows,
      unit_cost: moData['qty_produced'] && Number(moData['qty_produced']) > 0
        ? Number(moData['actual_cost']) / Number(moData['qty_produced'])
        : null,
    })
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch cost analysis', err) }
})
