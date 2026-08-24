import { Router } from 'express'
import type { IRouter } from 'express'
import { pool, query, nextDocumentNumber } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const materialIssuesRouter: IRouter = Router()

// GET /projects/:id/material-issues
materialIssuesRouter.get('/', requirePermission('projects.view', 'view'), async (req, res) => {
  try {
    const projectId = (req.params as Record<string, string>)['id']!
    const companyId = req.auth!.companyId
    const result = await query(
      `SELECT pmi.*,
              JSON_AGG(JSON_BUILD_OBJECT(
                'id', pmil.id, 'product_id', pmil.product_id,
                'qty_issued', pmil.qty_issued, 'unit_cost', pmil.unit_cost,
                'total_cost', pmil.total_cost, 'is_invoiced', pmil.is_invoiced
              )) AS lines
       FROM project_material_issues pmi
       LEFT JOIN project_material_issue_lines pmil ON pmil.issue_id=pmi.id
       WHERE pmi.project_id=$1 AND pmi.company_id=$2
       GROUP BY pmi.id ORDER BY pmi.created_at DESC`,
      [projectId, companyId],
    )
    sendOk(res, result.rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch material issues', err) }
})

// GET /projects/material-issues/:id
materialIssuesRouter.get('/material-issues/:id', requirePermission('projects.view', 'view'), async (req, res) => {
  try {
    const id = req.params['id']!
    const companyId = req.auth!.companyId
    const issue = await query('SELECT * FROM project_material_issues WHERE id=$1 AND company_id=$2', [id, companyId])
    if (!issue.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Material issue not found')
    const lines = await query(
      `SELECT pmil.*, p.name AS product_name, p.sku
       FROM project_material_issue_lines pmil JOIN products p ON p.id=pmil.product_id
       WHERE pmil.issue_id=$1`,
      [id],
    )
    sendOk(res, { ...issue.rows[0], lines: lines.rows })
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch material issue', err) }
})

// POST /projects/:id/material-issues
materialIssuesRouter.post('/', requirePermission('projects.edit', 'edit'), async (req, res) => {
  try {
    const projectId = (req.params as Record<string, string>)['id']!
    const companyId = req.auth!.companyId
    const userId = req.auth!.userId
    const body = req.body as {
      issue_date: string; notes?: string
      lines: Array<{ product_id: string; lot_id?: string; from_location_id: string; to_location_id: string; qty_issued: number }>
    }
    if (!body.lines?.length) return sendError(res, 400, 'VALIDATION_ERROR', 'At least one line is required')

    const issueNumber = await nextDocumentNumber(companyId, 'material_issue', 'SO')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query<{ id: string }>(
        `INSERT INTO project_material_issues (project_id, company_id, issue_number, issue_date, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [projectId, companyId, issueNumber, body.issue_date, body.notes ?? null, userId],
      )
      const issue = result.rows[0]!
      for (const line of body.lines) {
        await client.query(
          `INSERT INTO project_material_issue_lines (issue_id, product_id, lot_id, from_location_id, to_location_id, qty_issued)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [issue['id'], line.product_id, line.lot_id ?? null, line.from_location_id, line.to_location_id, line.qty_issued],
        )
      }
      await client.query('COMMIT')
      sendOk(res, issue, 201)
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create material issue', err) }
})

// POST /projects/material-issues/:id/issue
materialIssuesRouter.post('/material-issues/:id/issue', requirePermission('projects.edit', 'edit'), async (req, res) => {
  try {
    const id = req.params['id']!
    const companyId = req.auth!.companyId
    const userId = req.auth!.userId

    const issue = await query(
      `SELECT pmi.*, p.analytic_account_id FROM project_material_issues pmi
       JOIN projects p ON p.id=pmi.project_id
       WHERE pmi.id=$1 AND pmi.company_id=$2`,
      [id, companyId],
    )
    if (!issue.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Material issue not found')
    const iss = issue.rows[0] as Record<string, unknown>
    if (iss['status'] !== 'draft') return sendError(res, 409, 'INVALID_STATUS', 'Only draft issues can be issued')

    const lines = await query<{
      id: string; product_id: string; from_location_id: string; to_location_id: string
      qty_issued: string; lot_id: string | null
    }>('SELECT * FROM project_material_issue_lines WHERE issue_id=$1', [id])

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      for (const line of lines.rows) {
        // Get average cost from stock balance
        const stock = await client.query<{ qty_on_hand: string; average_cost: string }>(
          `SELECT qty_on_hand, average_cost FROM stock_balances
           WHERE product_id=$1 AND location_id=$2 AND lot_id IS NOT DISTINCT FROM $3`,
          [line['product_id'], line['from_location_id'], line['lot_id'] ?? null],
        )
        const qtyOnHand = parseFloat(stock.rows[0]?.['qty_on_hand'] ?? '0')
        const unitCost = parseFloat(stock.rows[0]?.['average_cost'] ?? '0')
        const qtyIssued = parseFloat(line['qty_issued'])

        if (qtyOnHand < qtyIssued) {
          throw new Error(`Insufficient stock for product ${line['product_id']}: have ${qtyOnHand}, need ${qtyIssued}`)
        }

        const totalCost = unitCost * qtyIssued

        await client.query(
          `UPDATE project_material_issue_lines SET unit_cost=$1, total_cost=$2 WHERE id=$3`,
          [unitCost, totalCost, line['id']],
        )

        // Queue stock move via outbox
        await client.query(
          `INSERT INTO service_outbox (service, event_type, payload) VALUES ('inventory','STOCK_MOVE_REQUESTED',$1)`,
          [JSON.stringify({
            company_id: companyId,
            product_id: line['product_id'],
            lot_id: line['lot_id'],
            from_location_id: line['from_location_id'],
            to_location_id: line['to_location_id'],
            qty: qtyIssued,
            unit_cost: unitCost,
            currency_code: 'IQD',
            source_type: 'project_issue',
            source_id: id,
            analytic_account_id: iss['analytic_account_id'],
            moved_by: userId,
          })],
        )
      }

      await client.query(
        `UPDATE project_material_issues SET status='issued', issued_by=$1, issued_at=NOW() WHERE id=$2`,
        [userId, id],
      )
      await client.query('COMMIT')
      await logAudit({ companyId, userId, action: 'UPDATE', tableName: 'project_material_issues', recordId: id, newValues: { status: 'issued' } })
      sendOk(res, { id, status: 'issued' })
    } catch (err) {
      await client.query('ROLLBACK')
      if (err instanceof Error && err.message.startsWith('Insufficient stock')) {
        return sendError(res, 409, 'INSUFFICIENT_STOCK', err.message)
      }
      throw err
    } finally {
      client.release()
    }
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to issue material', err) }
})

// POST /projects/material-issues/:id/cancel
materialIssuesRouter.post('/material-issues/:id/cancel', requirePermission('projects.edit', 'edit'), async (req, res) => {
  try {
    const id = req.params['id']!
    const companyId = req.auth!.companyId
    const result = await query(
      `UPDATE project_material_issues SET status='cancelled' WHERE id=$1 AND company_id=$2 AND status='draft' RETURNING id`,
      [id, companyId],
    )
    if (!result.rows[0]) return sendError(res, 409, 'INVALID_STATUS', 'Only draft issues can be cancelled')
    sendOk(res, { id, status: 'cancelled' })
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to cancel material issue', err) }
})
