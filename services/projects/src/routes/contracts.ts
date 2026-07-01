import { Router } from 'express'
import type { IRouter } from 'express'
import { z } from 'zod'
import { pool, query } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const contractsRouter: IRouter = Router()

const ContractSchema = z.object({
  project_id: z.string().uuid(),
  contract_number: z.string().min(1).max(100),
  contract_name: z.string().min(1).max(255),
  client_name: z.string().min(1).max(255),
  client_contact: z.string().optional(),
  contract_value: z.number().positive(),
  currency_code: z.string().length(3).default('IQD'),
  default_billing_method: z.enum(['milestone','progress','cost_plus','fixed_lump_sum']).default('milestone'),
  default_margin_pct: z.number().min(0).max(1).default(0),
  payment_terms_days: z.number().int().min(0).default(30),
  retention_pct: z.number().min(0).max(1).default(0),
  contract_date: z.string(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  contract_doc_path: z.string().optional(),
  notes: z.string().optional(),
})

// GET /projects/contracts
contractsRouter.get('/', requirePermission('projects.view', 'view'), async (req, res) => {
  try {
    const { project_id, status } = req.query
    const page = Math.max(1, parseInt(req.query['page'] as string || '1'))
    const limit = Math.min(100, parseInt(req.query['limit'] as string || '20'))
    const offset = (page - 1) * limit

    let sql = `SELECT pc.*,
                      COALESCE((SELECT SUM(pi.gross_total) FROM project_invoices pi
                                WHERE pi.contract_id=pc.id AND pi.status != 'cancelled'),0) AS total_invoiced,
                      COALESCE((SELECT SUM(pip.amount) FROM project_invoice_payments pip
                                JOIN project_invoices pi2 ON pi2.id=pip.invoice_id
                                WHERE pi2.contract_id=pc.id),0) AS total_paid
               FROM project_contracts pc WHERE pc.company_id = $1`
    const params: unknown[] = [req.auth!.companyId]
    let idx = 2
    if (project_id) { sql += ` AND pc.project_id = $${idx++}`; params.push(project_id) }
    if (status) { sql += ` AND pc.status = $${idx++}`; params.push(status) }
    sql += ` ORDER BY pc.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`
    params.push(limit, offset)
    sendOk(res, (await query(sql, params)).rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch contracts', err) }
})

// GET /projects/contracts/:id
contractsRouter.get('/:id', requirePermission('projects.view', 'view'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const id = req.params['id']!
    const contract = await query('SELECT * FROM project_contracts WHERE id=$1 AND company_id=$2', [id, companyId])
    if (!contract.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Contract not found')
    const [milestones, invoices] = await Promise.all([
      query('SELECT * FROM project_milestones WHERE contract_id=$1 ORDER BY sequence', [id]),
      query(`SELECT pi.*, COALESCE((SELECT SUM(pip.amount) FROM project_invoice_payments pip WHERE pip.invoice_id=pi.id),0) AS total_paid
             FROM project_invoices pi WHERE pi.contract_id=$1 ORDER BY pi.created_at DESC`, [id]),
    ])
    const c = contract.rows[0] as Record<string, unknown>
    const invRows = invoices.rows as Array<{ gross_total: string; status: string; total_paid: string }>
    const totalInvoiced = invRows.filter(i => i.status !== 'cancelled').reduce((s, i) => s + parseFloat(i.gross_total ?? '0'), 0)
    const totalPaid = invRows.reduce((s, i) => s + parseFloat(i.total_paid ?? '0'), 0)
    sendOk(res, { ...c, milestones: milestones.rows, invoices: invoices.rows, total_invoiced: totalInvoiced, total_paid: totalPaid, outstanding: totalInvoiced - totalPaid })
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch contract', err) }
})

// POST /projects/contracts
contractsRouter.post('/', requirePermission('projects.edit', 'edit'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const userId = req.auth!.userId
    const parsed = ContractSchema.safeParse(req.body)
    if (!parsed.success) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
    const d = parsed.data

    // Validate project belongs to company
    const proj = await query('SELECT id FROM projects WHERE id=$1 AND company_id=$2', [d.project_id, companyId])
    if (!proj.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Project not found')

    const result = await query(
      `INSERT INTO project_contracts
         (project_id, company_id, contract_number, contract_name, client_name, client_contact,
          contract_value, currency_code, default_billing_method, default_margin_pct,
          payment_terms_days, retention_pct, contract_date, start_date, end_date,
          contract_doc_path, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [d.project_id, companyId, d.contract_number, d.contract_name, d.client_name,
       d.client_contact ?? null, d.contract_value, d.currency_code,
       d.default_billing_method, d.default_margin_pct, d.payment_terms_days,
       d.retention_pct, d.contract_date, d.start_date ?? null, d.end_date ?? null,
       d.contract_doc_path ?? null, d.notes ?? null, userId],
    )
    const contract = result.rows[0]!
    await logAudit({ companyId, userId, action: 'CREATE', tableName: 'project_contracts', recordId: contract['id'] as string })
    sendOk(res, contract, 201)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create contract', err) }
})

// PUT /projects/contracts/:id
contractsRouter.put('/:id', requirePermission('projects.edit', 'edit'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const id = req.params['id']!
    const parsed = ContractSchema.partial().safeParse(req.body)
    if (!parsed.success) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
    const d = parsed.data

    const existing = await query('SELECT status FROM project_contracts WHERE id=$1 AND company_id=$2', [id, companyId])
    if (!existing.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Contract not found')

    // Block changing contract_value or billing_method if invoices exist
    if (d.contract_value !== undefined || d.default_billing_method !== undefined) {
      const invCount = await query(`SELECT COUNT(*) AS cnt FROM project_invoices WHERE contract_id=$1 AND status != 'cancelled'`, [id])
      if (parseInt(invCount.rows[0]?.['cnt'] ?? '0') > 0) {
        return sendError(res, 409, 'HAS_INVOICES', 'Cannot change contract_value or billing_method once invoices exist')
      }
    }

    const updates: string[] = []
    const params: unknown[] = []
    let idx = 1
    const fields: Array<[string, unknown]> = [
      ['contract_name', d.contract_name], ['client_name', d.client_name],
      ['client_contact', d.client_contact], ['contract_value', d.contract_value],
      ['default_billing_method', d.default_billing_method], ['default_margin_pct', d.default_margin_pct],
      ['payment_terms_days', d.payment_terms_days], ['retention_pct', d.retention_pct],
      ['start_date', d.start_date], ['end_date', d.end_date], ['notes', d.notes],
    ]
    for (const [col, val] of fields) {
      if (val !== undefined) { updates.push(`${col} = $${idx++}`); params.push(val) }
    }
    if (updates.length === 0) return sendError(res, 400, 'NO_CHANGES', 'No fields to update')
    updates.push('updated_at = NOW()')
    params.push(id, companyId)
    const result = await query(
      `UPDATE project_contracts SET ${updates.join(', ')} WHERE id=$${idx++} AND company_id=$${idx++} RETURNING *`,
      params,
    )
    sendOk(res, result.rows[0])
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update contract', err) }
})

// POST /projects/contracts/:id/activate
contractsRouter.post('/:id/activate', requirePermission('projects.approve', 'approve'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const id = req.params['id']!
    const contract = await query('SELECT pc.*, p.status AS project_status FROM project_contracts pc JOIN projects p ON p.id=pc.project_id WHERE pc.id=$1 AND pc.company_id=$2', [id, companyId])
    if (!contract.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Contract not found')
    const c = contract.rows[0] as { status: string; project_status: string }
    if (c.status !== 'draft') return sendError(res, 409, 'INVALID_STATUS', 'Only draft contracts can be activated')
    if (c.project_status !== 'active') return sendError(res, 409, 'PROJECT_NOT_ACTIVE', 'Project must be active to activate a contract')
    await query(`UPDATE project_contracts SET status='active', updated_at=NOW() WHERE id=$1`, [id])
    sendOk(res, { id, status: 'active' })
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to activate contract', err) }
})

// POST /projects/contracts/:id/complete
contractsRouter.post('/:id/complete', requirePermission('projects.approve', 'approve'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const id = req.params['id']!
    const unpaid = await query(
      `SELECT COUNT(*) AS cnt FROM project_invoices WHERE contract_id=$1 AND status NOT IN ('paid','cancelled')`,
      [id],
    )
    if (parseInt(unpaid.rows[0]?.['cnt'] ?? '0') > 0) {
      return sendError(res, 409, 'UNPAID_INVOICES', 'All invoices must be paid or cancelled before completing the contract')
    }
    await query(`UPDATE project_contracts SET status='completed', updated_at=NOW() WHERE id=$1 AND company_id=$2`, [id, companyId])
    sendOk(res, { id, status: 'completed' })
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to complete contract', err) }
})
