import { Router } from 'express'
import type { IRouter } from 'express'
import { z } from 'zod'
import { pool, query } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const contractsRouter: IRouter = Router()

const ContractSchema = z.object({
  rental_type: z.enum(['short_term','long_term','project_based']).default('short_term'),
  client_name: z.string().max(255).optional(),
  client_contact: z.string().optional(),
  to_company_id: z.string().uuid().optional(),
  project_id: z.string().uuid().optional(),
  billing_cycle: z.enum(['daily','weekly','monthly','fixed']).default('monthly'),
  rate_amount: z.number().min(0),
  currency_code: z.string().length(3).default('IQD'),
  start_date: z.string(),
  end_date: z.string().optional(),
  revenue_account_id: z.string().uuid().optional(),
  analytic_account_id: z.string().uuid().optional(),
  lines: z.array(z.object({
    asset_id: z.string().uuid(),
    qty: z.number().int().positive().default(1),
    daily_rate: z.number().min(0),
    currency_code: z.string().length(3).default('IQD'),
    deployment_location_id: z.string().uuid().optional(),
  })).min(1),
})

// Generate contract number
async function generateContractNumber(companyId: string): Promise<string> {
  const year = new Date().getFullYear()
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM rental_contracts WHERE company_id = $1 AND contract_number LIKE $2`,
    [companyId, `RC-${year}-%`],
  )
  const seq = parseInt(result.rows[0]?.['count'] ?? '0') + 1
  return `RC-${year}-${String(seq).padStart(4, '0')}`
}

// Generate invoice number
async function generateInvoiceNumber(contractId: string): Promise<string> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM rental_invoices WHERE contract_id = $1`,
    [contractId],
  )
  const seq = parseInt(result.rows[0]?.['count'] ?? '0') + 1
  return `INV-${contractId.slice(0, 8).toUpperCase()}-${String(seq).padStart(3, '0')}`
}

contractsRouter.get('/', requirePermission('rental.contracts.view', 'view'), async (req, res) => {
  try {
    const { status, rental_type, project_id } = req.query
    const page = Math.max(1, parseInt(req.query['page'] as string || '1'))
    const limit = Math.min(100, parseInt(req.query['limit'] as string || '20'))
    const offset = (page - 1) * limit
    let sql = `SELECT rc.* FROM rental_contracts rc WHERE rc.company_id = $1`
    const params: unknown[] = [req.auth!.companyId]
    let idx = 2
    if (status) { sql += ` AND rc.status = $${idx++}`; params.push(status) }
    if (rental_type) { sql += ` AND rc.rental_type = $${idx++}`; params.push(rental_type) }
    if (project_id) { sql += ` AND rc.project_id = $${idx++}`; params.push(project_id) }
    sql += ` ORDER BY rc.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`
    params.push(limit, offset)
    sendOk(res, (await query(sql, params)).rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch contracts', err) }
})

contractsRouter.get('/:id', requirePermission('rental.contracts.view', 'view'), async (req, res) => {
  try {
    const contract = await query('SELECT * FROM rental_contracts WHERE id=$1 AND company_id=$2', [req.params['id'], req.auth!.companyId])
    if (!contract.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Contract not found')
    const [lines, invoices] = await Promise.all([
      query(`SELECT rcl.*, ea.name AS asset_name, ea.asset_number FROM rental_contract_lines rcl
             JOIN equipment_assets ea ON ea.id = rcl.asset_id WHERE rcl.contract_id = $1`, [req.params['id']]),
      query('SELECT * FROM rental_invoices WHERE contract_id=$1 ORDER BY billing_period_start DESC', [req.params['id']]),
    ])
    sendOk(res, { ...contract.rows[0], lines: lines.rows, invoices: invoices.rows })
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch contract', err) }
})

contractsRouter.post('/', requirePermission('rental.contracts.edit', 'edit'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const userId = req.auth!.userId
    const parsed = ContractSchema.safeParse(req.body)
    if (!parsed.success) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
    const d = parsed.data

    // Validate all assets are available
    for (const line of d.lines) {
      const asset = await query<{ status: string }>('SELECT status FROM equipment_assets WHERE id=$1 AND company_id=$2', [line.asset_id, companyId])
      if (!asset.rows[0]) return sendError(res, 404, 'NOT_FOUND', `Asset ${line.asset_id} not found`)
      if (asset.rows[0].status !== 'available') {
        return sendError(res, 409, 'ASSET_NOT_AVAILABLE', `Asset ${line.asset_id} is not available (status: ${asset.rows[0].status})`)
      }
    }

    const contractNumber = await generateContractNumber(companyId)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query<{ id: string }>(
        `INSERT INTO rental_contracts (company_id, contract_number, rental_type, client_name, client_contact,
           to_company_id, project_id, billing_cycle, rate_amount, currency_code,
           start_date, end_date, revenue_account_id, analytic_account_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
        [companyId, contractNumber, d.rental_type, d.client_name ?? null, d.client_contact ?? null,
         d.to_company_id ?? null, d.project_id ?? null, d.billing_cycle, d.rate_amount,
         d.currency_code, d.start_date, d.end_date ?? null,
         d.revenue_account_id ?? null, d.analytic_account_id ?? null, userId],
      )
      const contract = result.rows[0]!
      const contractId = contract['id'] as string

      for (const line of d.lines) {
        await client.query(
          `INSERT INTO rental_contract_lines (contract_id, asset_id, qty, daily_rate, currency_code, deployment_location_id)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [contractId, line.asset_id, line.qty, line.daily_rate, line.currency_code, line.deployment_location_id ?? null],
        )
        await client.query(`UPDATE equipment_assets SET status='rented', updated_at=NOW() WHERE id=$1`, [line.asset_id])
      }

      await client.query('COMMIT')
      await logAudit({ companyId, userId, action: 'CREATE', tableName: 'rental_contracts', recordId: contractId })
      sendOk(res, contract, 201)
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create contract', err) }
})

const FINANCE_USERS_QUERY = `SELECT DISTINCT u.id AS user_id FROM users u JOIN user_company_roles ucr ON ucr.user_id=u.id WHERE ucr.company_id=$1 AND (ucr.role IN ('company_admin','system_admin') OR (ucr.module='finance' AND ucr.role IN ('module_admin','module_user'))) AND u.is_active=true`

async function notifyFinance(companyId: string, eventType: string, payload: Record<string, unknown>): Promise<void> {
  const users = await query(FINANCE_USERS_QUERY, [companyId])
  for (const u of users.rows) {
    await query(
      `INSERT INTO service_outbox (service,event_type,payload) VALUES ('notifications',$1,$2)`,
      [eventType, JSON.stringify({ userId: u['user_id'], companyId, ...payload })]
    )
  }
}

contractsRouter.post('/:id/activate', requirePermission('rental.contracts.admin', 'admin'), async (req, res) => {
  try {
    const id = req.params['id']!
    const companyId = req.auth!.companyId
    const contract = await query('SELECT * FROM rental_contracts WHERE id=$1 AND company_id=$2', [id, companyId])
    if (!contract.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Contract not found')
    const c = contract.rows[0] as { status: string; start_date: string; contract_number: string }
    if (c.status !== 'draft') return sendError(res, 409, 'INVALID_STATUS', 'Only draft contracts can be activated')
    await query(`UPDATE rental_contracts SET status='active', updated_at=NOW() WHERE id=$1`, [id])
    notifyFinance(companyId, 'RENTAL_CONTRACT_ACTIVATED', {
      title: `Contract activated: ${c.contract_number}`,
      body: `Rental contract ${c.contract_number} is now active`,
      data: { contractId: id, contractNumber: c.contract_number },
    }).catch(() => {})
    sendOk(res, { id, status: 'active' })
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to activate contract', err) }
})

contractsRouter.post('/:id/complete', requirePermission('rental.contracts.admin', 'admin'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const id = req.params['id']!
    const contract = await query('SELECT status, contract_number FROM rental_contracts WHERE id=$1 AND company_id=$2', [id, companyId])
    if (!contract.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Contract not found')
    const contractRow = contract.rows[0] as { status: string; contract_number: string }
    if (contractRow.status !== 'active') {
      return sendError(res, 409, 'INVALID_STATUS', 'Only active contracts can be completed')
    }
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(`UPDATE rental_contracts SET status='completed', updated_at=NOW() WHERE id=$1`, [id])
      const lines = await client.query('SELECT asset_id FROM rental_contract_lines WHERE contract_id=$1', [id])
      for (const line of lines.rows as { asset_id: string }[]) {
        await client.query(`UPDATE equipment_assets SET status='available', updated_at=NOW() WHERE id=$1`, [line.asset_id])
      }
      await client.query('COMMIT')
      notifyFinance(companyId, 'RENTAL_CONTRACT_COMPLETED', {
        title: `Contract completed: ${contractRow.contract_number}`,
        body: `Rental contract ${contractRow.contract_number} has been completed and assets returned to inventory`,
        data: { contractId: id, contractNumber: contractRow.contract_number },
      }).catch(() => {})
      sendOk(res, { id, status: 'completed' })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to complete contract', err) }
})

contractsRouter.post('/:id/cancel', requirePermission('rental.contracts.admin', 'admin'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const id = req.params['id']!
    const reason = (req.body as { reason?: string }).reason ?? ''
    const contract = await query('SELECT status, contract_number FROM rental_contracts WHERE id=$1 AND company_id=$2', [id, companyId])
    if (!contract.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Contract not found')
    const contractRow = contract.rows[0] as { status: string; contract_number: string }
    if (!['draft','active'].includes(contractRow.status)) return sendError(res, 409, 'INVALID_STATUS', 'Cannot cancel completed or already-cancelled contract')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(`UPDATE rental_contracts SET status='cancelled', cancel_reason=$1, updated_at=NOW() WHERE id=$2`, [reason, id])
      const lines = await client.query('SELECT asset_id FROM rental_contract_lines WHERE contract_id=$1', [id])
      for (const line of lines.rows as { asset_id: string }[]) {
        await client.query(`UPDATE equipment_assets SET status='available', updated_at=NOW() WHERE id=$1`, [line.asset_id])
      }
      await client.query('COMMIT')
      notifyFinance(companyId, 'RENTAL_CONTRACT_CANCELLED', {
        title: `Contract cancelled: ${contractRow.contract_number}`,
        body: `Rental contract ${contractRow.contract_number} has been cancelled${reason ? ': ' + reason : ''}`,
        data: { contractId: id, contractNumber: contractRow.contract_number },
      }).catch(() => {})
      sendOk(res, { id, status: 'cancelled' })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to cancel contract', err) }
})

// Invoices
contractsRouter.get('/:id/invoices', requirePermission('rental.contracts.view', 'view'), async (req, res) => {
  try {
    sendOk(res, (await query('SELECT * FROM rental_invoices WHERE contract_id=$1 ORDER BY billing_period_start DESC', [req.params['id']])).rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch invoices', err) }
})

const InvoiceSchema = z.object({
  billing_period_start: z.string(),
  billing_period_end: z.string(),
  wht_applies:  z.boolean().optional(),
  wht_scenario: z.enum(['client_withholds','fnc_pays']).optional(),
  wht_rate:     z.number().min(0).max(1).optional(),
})

contractsRouter.post('/:id/invoices', requirePermission('rental.contracts.edit', 'edit'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const id = req.params['id']!
    const parsed = InvoiceSchema.safeParse(req.body)
    if (!parsed.success) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten())
    const { billing_period_start, billing_period_end } = parsed.data

    const contract = await query('SELECT * FROM rental_contracts WHERE id=$1 AND company_id=$2', [id, companyId])
    if (!contract.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Contract not found')
    const c = contract.rows[0] as Record<string, unknown>

    const start = new Date(billing_period_start)
    const end = new Date(billing_period_end)
    const daysBilled = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000))

    // Sum line totals: days × daily_rate × qty per line
    const lines = await query('SELECT * FROM rental_contract_lines WHERE contract_id=$1', [id])
    let totalAmount = 0
    for (const line of lines.rows as Record<string, number>[]){
      totalAmount += daysBilled * Number(line['daily_rate']) * Number(line['qty'])
    }

    const whtApplies  = Boolean(parsed.data.wht_applies ?? false)
    const whtScenario = whtApplies ? (parsed.data.wht_scenario ?? null) : null
    const whtRate     = whtApplies ? Number(parsed.data.wht_rate ?? 0) : 0
    const whtAmount   = whtApplies ? Math.round(totalAmount * whtRate * 10000) / 10000 : 0

    // Compute daily rate snapshot (sum of all line daily_rates × qty)
    let dailyRate = 0
    for (const line of lines.rows as Record<string, number>[]) {
      dailyRate += Number(line['daily_rate']) * Number(line['qty'])
    }

    const invoiceDate = new Date().toISOString().split('T')[0]!
    const dueDate = new Date(Date.now() + 30 * 86_400_000).toISOString().split('T')[0]!

    const invoiceNumber = await generateInvoiceNumber(id)
    const result = await query(
      `INSERT INTO rental_invoices (contract_id, company_id, invoice_number, billing_period_start, billing_period_end,
         days_billed, amount, total_amount, rate_amount, currency_code,
         invoice_date, due_date, wht_applies, wht_scenario, wht_rate, wht_amount)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [id, companyId, invoiceNumber, billing_period_start, billing_period_end, daysBilled,
       totalAmount, totalAmount, dailyRate, c['currency_code'],
       invoiceDate, dueDate, whtApplies, whtScenario, whtRate, whtAmount],
    )

    // Queue outbox for GL journal
    await query(
      `INSERT INTO service_outbox (service, event_type, payload) VALUES ('finance','RENTAL_INVOICE_JOURNAL_REQUESTED', $1)`,
      [JSON.stringify({
        invoice_id: (result.rows[0] as { id: string })['id'],
        contract_id: id,
        company_id: companyId,
        amount: totalAmount,
        revenue_account_id: c['revenue_account_id'],
        analytic_account_id: c['analytic_account_id'],
        wht_applies: whtApplies,
        wht_scenario: whtScenario,
        wht_amount: whtAmount,
      })],
    )

    sendOk(res, result.rows[0], 201)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create invoice', err) }
})

contractsRouter.post('/invoices/:invoiceId/issue', requirePermission('rental.contracts.admin', 'admin'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const result = await query(
      `UPDATE rental_invoices SET status='issued' WHERE id=$1 AND status='draft' RETURNING *`,
      [req.params['invoiceId']],
    )
    if (!result.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Invoice not found or not in draft status')
    const inv = result.rows[0] as Record<string, unknown>
    notifyFinance(companyId, 'RENTAL_INVOICE_ISSUED', {
      title: `Rental invoice issued: ${String(inv['invoice_number'] ?? '')}`,
      body: `Rental invoice ${String(inv['invoice_number'] ?? '')} has been issued`,
      data: { invoiceId: req.params['invoiceId'], contractId: inv['contract_id'], invoiceNumber: inv['invoice_number'] },
    }).catch(() => {})
    sendOk(res, result.rows[0])
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to issue invoice', err) }
})

contractsRouter.post('/invoices/:invoiceId/mark-paid', requirePermission('rental.contracts.admin', 'admin'), async (req, res) => {
  try {
    const companyId = req.auth!.companyId
    const result = await query(
      `UPDATE rental_invoices SET status='paid' WHERE id=$1 AND status='issued' RETURNING *`,
      [req.params['invoiceId']],
    )
    if (!result.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Invoice not found or not in issued status')
    const inv = result.rows[0] as Record<string, unknown>
    notifyFinance(companyId, 'RENTAL_INVOICE_PAID', {
      title: `Rental invoice paid: ${String(inv['invoice_number'] ?? '')}`,
      body: `Rental invoice ${String(inv['invoice_number'] ?? '')} has been marked as paid`,
      data: { invoiceId: req.params['invoiceId'], contractId: inv['contract_id'], invoiceNumber: inv['invoice_number'] },
    }).catch(() => {})
    sendOk(res, result.rows[0])
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to mark invoice paid', err) }
})
