import { Router } from 'express'
import type { IRouter } from 'express'
import { pool, query } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { sendOk, sendError } from '../lib/errors.js'
import { requirePermission } from '@fnc-erp/permissions'

export const paymentsRouter: IRouter = Router({ mergeParams: true })

// GET /projects/invoices/:id/payments
paymentsRouter.get('/', requirePermission('projects.invoices.view', 'view'), async (req, res) => {
  try {
    const invoiceId = (req.params as Record<string, string>)['id']!
    sendOk(res, (await query(
      'SELECT * FROM project_invoice_payments WHERE invoice_id=$1 ORDER BY payment_date',
      [invoiceId],
    )).rows)
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch payments', err) }
})

// POST /projects/invoices/:id/payments
paymentsRouter.post('/', requirePermission('projects.invoices.edit', 'edit'), async (req, res) => {
  try {
    const invoiceId = (req.params as Record<string, string>)['id']!
    const companyId = req.auth!.companyId
    const userId = req.auth!.userId
    const body = req.body as {
      payment_date: string; amount: number; currency_code?: string
      payment_reference?: string; payment_method?: string; notes?: string
    }

    const invoice = await query<{
      status: string; net_payable: string; currency_code: string; project_id: string
      wht_applies: boolean; wht_scenario: string | null; wht_amount: string
    }>(
      'SELECT status, net_payable, currency_code, project_id, wht_applies, wht_scenario, wht_amount FROM project_invoices WHERE id=$1 AND company_id=$2',
      [invoiceId, companyId],
    )
    if (!invoice.rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Invoice not found')
    const inv = invoice.rows[0]!
    if (!['issued','partial'].includes(inv['status'])) {
      return sendError(res, 409, 'INVALID_STATUS', 'Only issued or partial invoices can receive payments')
    }

    // Check outstanding balance
    const paidResult = await query<{ total: string }>(
      'SELECT COALESCE(SUM(amount),0) AS total FROM project_invoice_payments WHERE invoice_id=$1',
      [invoiceId],
    )
    const alreadyPaid = parseFloat(paidResult.rows[0]?.['total'] ?? '0')
    const netPayable = parseFloat(inv['net_payable'])
    const whtAmount = inv['wht_applies'] ? parseFloat(inv['wht_amount']) : 0
    // For Scenario A (client withholds), the cash received is netPayable - WHT.
    // The invoice is fully paid when accumulated cash equals that reduced amount.
    const cashTarget = inv['wht_scenario'] === 'client_withholds' ? netPayable - whtAmount : netPayable
    const outstanding = cashTarget - alreadyPaid

    if (body.amount > outstanding + 0.001) {
      return sendError(res, 409, 'EXCEEDS_BALANCE', `Payment amount ${body.amount} exceeds outstanding balance ${outstanding}`)
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const result = await client.query<{ id: string }>(
        `INSERT INTO project_invoice_payments
           (invoice_id, payment_date, amount, currency_code, payment_reference, payment_method, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [invoiceId, body.payment_date, body.amount,
         body.currency_code ?? inv['currency_code'],
         body.payment_reference ?? null, body.payment_method ?? null,
         body.notes ?? null, userId],
      )
      const payment = result.rows[0]!

      // Update invoice status
      const newTotalPaid = alreadyPaid + body.amount
      const newStatus = newTotalPaid >= cashTarget - 0.001 ? 'paid' : 'partial'
      await client.query(
        `UPDATE project_invoices SET status=$1, updated_at=NOW() WHERE id=$2`,
        [newStatus, invoiceId],
      )

      // Queue GL journal: Dr Cash (+ WHT Recoverable if Scenario A) / Cr AR
      await client.query(
        `INSERT INTO service_outbox (service, event_type, payload) VALUES ('finance','INVOICE_PAYMENT_JOURNAL_REQUESTED',$1)`,
        [JSON.stringify({
          company_id: companyId, invoice_id: invoiceId,
          project_id: inv['project_id'], amount: body.amount,
          currency_code: body.currency_code ?? inv['currency_code'],
          payment_date: body.payment_date,
          wht_applies: inv['wht_applies'], wht_scenario: inv['wht_scenario'],
          wht_amount: whtAmount,
        })],
      )

      await client.query('COMMIT')
      await logAudit({ companyId, userId, action: 'CREATE', tableName: 'project_invoice_payments', recordId: payment['id'] as string })
      sendOk(res, { ...payment, invoice_status: newStatus }, 201)
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', 'Failed to record payment', err) }
})
