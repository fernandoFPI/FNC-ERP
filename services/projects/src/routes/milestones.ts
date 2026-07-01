import { Router } from 'express'
import type { IRouter } from 'express'
import { z } from 'zod'
import { query } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const milestonesRouter: IRouter = Router({ mergeParams: true })

const MilestoneSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  sequence: z.number().int().min(0).default(0),
  billable_amount: z.number().positive(),
  currency_code: z.string().length(3).default('IQD'),
  stage_id: z.string().uuid().optional(),
})

// GET /projects/contracts/:id/milestones
milestonesRouter.get('/', requirePermission('projects.view', 'view'), async (req, res) => {
  try {
    const p = req.params as Record<string, string>
    const contractId = p['id']!
    const result = await query(
      'SELECT * FROM project_milestones WHERE contract_id=$1 ORDER BY sequence',
      [contractId],
    )
    sendOk(res, result.rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch milestones', err) }
})

// POST /projects/contracts/:id/milestones
milestonesRouter.post('/', requirePermission('projects.edit', 'edit'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const contractId = (req.params as Record<string, string>)['id']!
    const parsed = MilestoneSchema.safeParse(req.body)
    if (!parsed.success) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
    const d = parsed.data

    // Validate contract belongs to company
    const c = await query('SELECT id, project_id FROM project_contracts WHERE id=$1 AND company_id=$2', [contractId, companyId])
    if (!c.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Contract not found')
    const projectId = (c.rows[0] as { project_id: string })['project_id']

    const result = await query(
      `INSERT INTO project_milestones (contract_id, project_id, stage_id, name, description, sequence, billable_amount, currency_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [contractId, projectId, d.stage_id ?? null, d.name, d.description ?? null, d.sequence, d.billable_amount, d.currency_code],
    )
    sendOk(res, result.rows[0], 201)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create milestone', err) }
})

// PUT /projects/contracts/:contractId/milestones/:id
milestonesRouter.put('/:milestoneId', requirePermission('projects.edit', 'edit'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const { id: contractId, milestoneId } = req.params as Record<string, string> as { id: string; milestoneId: string }

    const existing = await query(
      `SELECT pm.* FROM project_milestones pm
       JOIN project_contracts pc ON pc.id=pm.contract_id
       WHERE pm.id=$1 AND pm.contract_id=$2 AND pc.company_id=$3`,
      [milestoneId, contractId, companyId],
    )
    if (!existing.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Milestone not found')
    if ((existing.rows[0] as { status: string })['status'] === 'invoiced') {
      return sendError(res, 409, 'ALREADY_INVOICED', 'Cannot edit an invoiced milestone')
    }

    const parsed = MilestoneSchema.partial().safeParse(req.body)
    if (!parsed.success) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
    const d = parsed.data

    const updates: string[] = []
    const params: unknown[] = []
    let idx = 1
    const fields: Array<[string, unknown]> = [
      ['name', d.name], ['description', d.description], ['sequence', d.sequence],
      ['billable_amount', d.billable_amount], ['stage_id', d.stage_id],
    ]
    for (const [col, val] of fields) {
      if (val !== undefined) { updates.push(`${col} = $${idx++}`); params.push(val) }
    }
    if (updates.length === 0) return sendError(res, 400, 'NO_CHANGES', 'No fields to update')
    updates.push('updated_at = NOW()')
    params.push(milestoneId)
    const result = await query(
      `UPDATE project_milestones SET ${updates.join(', ')} WHERE id=$${idx++} RETURNING *`,
      params,
    )
    sendOk(res, result.rows[0])
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update milestone', err) }
})

// POST /projects/contracts/:contractId/milestones/:milestoneId/reach
milestonesRouter.post('/:milestoneId/reach', requirePermission('projects.edit', 'edit'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const userId = req.auth!.userId
    const { id: contractId, milestoneId } = req.params as Record<string, string> as { id: string; milestoneId: string }

    const existing = await query(
      `SELECT pm.*, pc.project_id FROM project_milestones pm
       JOIN project_contracts pc ON pc.id=pm.contract_id
       WHERE pm.id=$1 AND pm.contract_id=$2 AND pc.company_id=$3`,
      [milestoneId, contractId, companyId],
    )
    if (!existing.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Milestone not found')
    const m = existing.rows[0] as { status: string; name: string; project_id: string }
    if (m.status !== 'pending') return sendError(res, 409, 'INVALID_STATUS', 'Milestone must be in pending status to reach it')

    await query(
      `UPDATE project_milestones SET status='reached', reached_at=NOW(), reached_by=$1, updated_at=NOW() WHERE id=$2`,
      [userId, milestoneId],
    )

    // Notify project manager and company admins
    const admins = await query<{ user_id: string }>(
      `SELECT DISTINCT user_id FROM user_company_roles WHERE company_id=$1 AND role IN ('company_admin','system_admin') AND is_active=true`,
      [companyId],
    )
    const proj = await query<{ project_manager_id: string | null }>('SELECT project_manager_id FROM projects WHERE id=$1', [m.project_id])
    const recipients = new Set(admins.rows.map(r => r['user_id']))
    const pmId = proj.rows[0]?.['project_manager_id']
    if (pmId) recipients.add(pmId)

    for (const recipientId of recipients) {
      await query(
        `INSERT INTO notifications (company_id, user_id, type, title, body, data)
         VALUES ($1,$2,'MILESTONE_REACHED','Milestone ready to invoice: ' || $3,$4,$5)`,
        [companyId, recipientId, m.name,
         `Milestone "${m.name}" has been reached and is ready to invoice.`,
         JSON.stringify({ milestone_id: milestoneId, contract_id: contractId })],
      )
    }

    await logAudit({ companyId, userId, action: 'UPDATE', tableName: 'project_milestones', recordId: milestoneId, newValues: { status: 'reached' } })
    sendOk(res, { id: milestoneId, status: 'reached' })
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to reach milestone', err) }
})

// POST /projects/contracts/:contractId/milestones/:milestoneId/cancel
milestonesRouter.post('/:milestoneId/cancel', requirePermission('projects.edit', 'edit'), async (req, res) => {
  try {
    const { milestoneId } = req.params as { milestoneId: string }
    const result = await query(
      `UPDATE project_milestones SET status='cancelled', updated_at=NOW()
       WHERE id=$1 AND status NOT IN ('invoiced','cancelled') RETURNING id`,
      [milestoneId],
    )
    if (!result.rows[0]) return sendError(res, 409, 'INVALID_STATUS', 'Milestone cannot be cancelled')
    sendOk(res, { id: milestoneId, status: 'cancelled' })
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to cancel milestone', err) }
})
