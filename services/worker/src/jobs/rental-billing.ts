import { pool } from '@fnc-erp/db'

interface ContractRow {
  id: string
  company_id: string
  contract_number: string
  billing_cycle: string
  rate_amount: number
  currency_code: string
  start_date: string
  revenue_account_id: string | null
  analytic_account_id: string | null
}

interface LineRow {
  asset_id: string
  qty: number
  daily_rate: number
}

async function autoGenerateRentalInvoice(contract: ContractRow, lines: LineRow[]): Promise<void> {
  const now = new Date()
  const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0) // last day of previous month
  const periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1)

  const startStr = periodStart.toISOString().slice(0, 10)
  const endStr = periodEnd.toISOString().slice(0, 10)

  // Check for existing invoice in this period
  const existing = await pool.query(
    `SELECT id FROM rental_invoices WHERE contract_id = $1 AND billing_period_start = $2`,
    [contract.id, startStr],
  )
  if ((existing.rowCount ?? 0) > 0) return

  const daysBilled = Math.round((periodEnd.getTime() - periodStart.getTime()) / 86_400_000) + 1
  let totalAmount = 0
  for (const line of lines) {
    totalAmount += daysBilled * Number(line.daily_rate) * Number(line.qty)
  }

  const seq = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM rental_invoices WHERE contract_id = $1`,
    [contract.id],
  )
  const invoiceNumber = `INV-${contract.id.slice(0, 8).toUpperCase()}-${String(parseInt(seq.rows[0]?.['count'] ?? '0') + 1).padStart(3, '0')}`

  const invoiceResult = await pool.query<{ id: string }>(
    `INSERT INTO rental_invoices (contract_id, invoice_number, billing_period_start, billing_period_end,
       days_billed, amount, currency_code) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [contract.id, invoiceNumber, startStr, endStr, daysBilled, totalAmount, contract.currency_code],
  )

  await pool.query(
    `INSERT INTO service_outbox (service, event_type, payload) VALUES ('finance','RENTAL_INVOICE_JOURNAL_REQUESTED', $1)`,
    [JSON.stringify({
      invoice_id: invoiceResult.rows[0]?.['id'],
      contract_id: contract.id,
      company_id: contract.company_id,
      amount: totalAmount,
      revenue_account_id: contract.revenue_account_id,
      analytic_account_id: contract.analytic_account_id,
    })],
  )

  console.warn(`[worker] Auto-generated rental invoice ${invoiceNumber} for contract ${contract.contract_number} (${contract.currency_code} ${totalAmount})`)
}

/**
 * Runs daily at 01:00. For each active monthly rental contract with no invoice
 * for the previous month, auto-generates an invoice and queues the GL journal.
 */
export async function processRentalBilling(): Promise<void> {
  console.warn('[worker] Running rental billing job')

  const result = await pool.query<ContractRow>(
    `SELECT rc.* FROM rental_contracts rc
     WHERE rc.status = 'active' AND rc.billing_cycle = 'monthly'
       AND NOT EXISTS (
         SELECT 1 FROM rental_invoices ri
         WHERE ri.contract_id = rc.id
           AND ri.billing_period_end >= DATE_TRUNC('month', NOW()) - INTERVAL '1 day'
           AND ri.billing_period_end < DATE_TRUNC('month', NOW())
           AND ri.status != 'cancelled'
       )`,
  )

  for (const contract of result.rows) {
    const lines = await pool.query<LineRow>(
      'SELECT asset_id, qty, daily_rate FROM rental_contract_lines WHERE contract_id = $1',
      [contract.id],
    )
    try {
      await autoGenerateRentalInvoice(contract, lines.rows)
    } catch (err) {
      console.error(`[worker] Failed to auto-bill contract ${contract.contract_number}:`, err)
    }
  }

  console.warn(`[worker] Rental billing done — processed ${result.rowCount ?? 0} contracts`)
}
