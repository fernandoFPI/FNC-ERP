import type { PoolClient } from 'pg'

// ── ERRORS ─────────────────────────────────────────────────────

export class BillingError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'BillingError'
  }
}

// ── TYPES ──────────────────────────────────────────────────────

export interface MOComponent {
  product_name: string
  qty: number
  unit_cost: number
  total_cost: number
}

export interface InvoiceLineInput {
  source_type: string
  source_id?: string
  description: string
  qty: number
  unit_cost: number
  margin_pct: number
  currency_code: string
  mo_display_mode?: 'summarised' | 'detailed'
  mo_components?: MOComponent[]
}

export interface LineAmounts {
  subtotal: number
  margin_amount: number
  line_total: number
}

export interface InvoiceTotals {
  subtotal: number
  margin_total: number
  gross_total: number
  retention_amount: number
  net_payable: number
}

export interface BillingContext {
  client: PoolClient
  projectId: string
  contractId: string
  companyId: string
  userId: string
}

export interface CostPlusOptions {
  includeCompletedMOs: boolean
  includeReceivedPOs: boolean
  includeStockIssues: boolean
  includeRental: boolean
  defaultMarginPct: number
  displayMode: 'summarised' | 'detailed'
}

// ── MILESTONE BILLING ──────────────────────────────────────────

export async function buildMilestoneLines(
  ctx: BillingContext,
  milestoneIds: string[],
): Promise<InvoiceLineInput[]> {
  const result = await ctx.client.query<{
    id: string; name: string; billable_amount: string; currency_code: string
  }>(
    `SELECT id, name, billable_amount, currency_code
     FROM project_milestones
     WHERE id = ANY($1) AND contract_id = $2 AND status = 'reached'`,
    [milestoneIds, ctx.contractId],
  )

  if (result.rows.length !== milestoneIds.length) {
    throw new BillingError(
      'INVALID_MILESTONES',
      'All selected milestones must exist, belong to this contract, and be in reached status',
    )
  }

  return result.rows.map(m => ({
    source_type: 'milestone',
    source_id: m['id'],
    description: m['name'],
    qty: 1,
    unit_cost: parseFloat(m['billable_amount']),
    margin_pct: 0,
    currency_code: m['currency_code'],
  }))
}

// ── PROGRESS BILLING ───────────────────────────────────────────

export async function buildProgressLines(
  ctx: BillingContext,
  progressPct: number,
  previousProgressPct: number,
): Promise<InvoiceLineInput[]> {
  if (progressPct <= previousProgressPct) {
    throw new BillingError(
      'INVALID_PROGRESS',
      `Progress ${progressPct}% must be greater than previously billed ${previousProgressPct}%`,
    )
  }
  if (progressPct > 100) {
    throw new BillingError('INVALID_PROGRESS', 'Progress cannot exceed 100%')
  }

  const result = await ctx.client.query<{ contract_value: string; contract_name: string; currency_code: string }>(
    `SELECT contract_value, contract_name, currency_code FROM project_contracts WHERE id = $1`,
    [ctx.contractId],
  )
  const c = result.rows[0]!
  const billablePct = (progressPct - previousProgressPct) / 100
  const billableAmount = parseFloat(c['contract_value']) * billablePct

  return [{
    source_type: 'manual',
    description: `Progress billing: ${previousProgressPct}% → ${progressPct}% complete`,
    qty: 1,
    unit_cost: billableAmount,
    margin_pct: 0,
    currency_code: c['currency_code'],
  }]
}

// ── COST PLUS BILLING ──────────────────────────────────────────

export async function buildCostPlusLines(
  ctx: BillingContext,
  options: CostPlusOptions,
): Promise<InvoiceLineInput[]> {
  const lines: InvoiceLineInput[] = []

  // Manufacturing orders
  if (options.includeCompletedMOs) {
    const mos = await ctx.client.query<{
      id: string; mo_number: string; product_name: string
      qty_produced: string; actual_cost: string; unit_cost: string
    }>(
      `SELECT mo.id, mo.mo_number, p.name AS product_name,
              mo.qty_produced, mo.actual_cost,
              CASE WHEN mo.qty_produced > 0
                   THEN mo.actual_cost / mo.qty_produced
                   ELSE 0 END AS unit_cost
       FROM manufacturing_orders mo
       JOIN products p ON p.id = mo.finished_product_id
       WHERE mo.project_id = $1 AND mo.status = 'completed' AND mo.is_invoiced = false`,
      [ctx.projectId],
    )

    for (const mo of mos.rows) {
      let components: MOComponent[] | undefined
      if (options.displayMode === 'detailed') {
        const cons = await ctx.client.query<{
          product_name: string; qty_consumed: string; unit_cost: string; total_cost: string
        }>(
          `SELECT p.name AS product_name, mc.qty_consumed, mc.unit_cost, mc.total_cost
           FROM mo_consumptions mc JOIN products p ON p.id = mc.component_product_id
           WHERE mc.mo_id = $1`,
          [mo['id']],
        )
        components = cons.rows.map(c => ({
          product_name: c['product_name'],
          qty: parseFloat(c['qty_consumed']),
          unit_cost: parseFloat(c['unit_cost']),
          total_cost: parseFloat(c['total_cost']),
        }))
      }

      const moLine: InvoiceLineInput = {
        source_type: 'manufacturing_order',
        source_id: mo['id'],
        description: options.displayMode === 'summarised'
          ? `${mo['product_name']} (MO: ${mo['mo_number']})`
          : `${mo['product_name']} — component breakdown (MO: ${mo['mo_number']})`,
        qty: parseFloat(mo['qty_produced']),
        unit_cost: parseFloat(mo['unit_cost']),
        margin_pct: options.defaultMarginPct,
        currency_code: 'IQD',
        mo_display_mode: options.displayMode,
      }
      if (components) moLine.mo_components = components
      lines.push(moLine)
    }
  }

  // Purchase order receipts (matched to project via analytic account)
  if (options.includeReceivedPOs) {
    const receipts = await ctx.client.query<{
      receipt_id: string; po_number: string; vendor_name: string
      description: string; qty_received: string; unit_price: string; currency_code: string
    }>(
      `SELECT por.id AS receipt_id, po.po_number, v.name AS vendor_name,
              pol.description, prl.qty_received, pol.unit_price, po.currency_code
       FROM po_receipts por
       JOIN po_receipt_lines prl ON prl.receipt_id = por.id
       JOIN po_lines pol ON pol.id = prl.po_line_id
       JOIN purchase_orders po ON po.id = por.po_id
       JOIN vendors v ON v.id = po.vendor_id
       WHERE po.analytic_account_id = (
         SELECT analytic_account_id FROM projects WHERE id = $1
       ) AND po.status IN ('fully_received','invoiced','closed')
         AND por.is_invoiced = false`,
      [ctx.projectId],
    )

    for (const r of receipts.rows) {
      lines.push({
        source_type: 'purchase_order',
        source_id: r['receipt_id'],
        description: `${r['description']} — PO ${r['po_number']} (${r['vendor_name']})`,
        qty: parseFloat(r['qty_received']),
        unit_cost: parseFloat(r['unit_price']),
        margin_pct: options.defaultMarginPct,
        currency_code: r['currency_code'],
      })
    }
  }

  // Stock issues (direct inventory issue to project)
  if (options.includeStockIssues) {
    const issues = await ctx.client.query<{
      id: string; product_name: string; qty_issued: string
      unit_cost: string; issue_number: string
    }>(
      `SELECT pmil.id, p.name AS product_name, pmil.qty_issued,
              pmil.unit_cost, pmi.issue_number
       FROM project_material_issue_lines pmil
       JOIN project_material_issues pmi ON pmi.id = pmil.issue_id
       JOIN products p ON p.id = pmil.product_id
       WHERE pmi.project_id = $1 AND pmi.status = 'issued' AND pmil.is_invoiced = false`,
      [ctx.projectId],
    )

    for (const i of issues.rows) {
      lines.push({
        source_type: 'stock_issue',
        source_id: i['id'],
        description: `${i['product_name']} (Issue: ${i['issue_number']})`,
        qty: parseFloat(i['qty_issued']),
        unit_cost: parseFloat(i['unit_cost']),
        margin_pct: options.defaultMarginPct,
        currency_code: 'IQD',
      })
    }
  }

  // Rental invoices linked to this project
  if (options.includeRental) {
    const rental = await ctx.client.query<{
      id: string; contract_number: string; asset_name: string
      days_billed: string; amount: string; currency_code: string
    }>(
      `SELECT ri.id, rc.contract_number,
              STRING_AGG(ea.name, ', ') AS asset_name,
              ri.days_billed, ri.amount, ri.currency_code
       FROM rental_invoices ri
       JOIN rental_contracts rc ON rc.id = ri.contract_id
       JOIN rental_contract_lines rcl ON rcl.contract_id = rc.id
       JOIN equipment_assets ea ON ea.id = rcl.asset_id
       WHERE rc.project_id = $1 AND ri.status = 'issued' AND ri.is_invoiced = false
       GROUP BY ri.id, rc.contract_number, ri.days_billed, ri.amount, ri.currency_code`,
      [ctx.projectId],
    )

    for (const r of rental.rows) {
      const days = parseInt(r['days_billed'])
      const totalAmount = parseFloat(r['amount'])
      lines.push({
        source_type: 'rental',
        source_id: r['id'],
        description: `Equipment rental: ${r['asset_name']} — ${days} days (Contract: ${r['contract_number']})`,
        qty: days,
        unit_cost: days > 0 ? totalAmount / days : totalAmount,
        margin_pct: options.defaultMarginPct,
        currency_code: r['currency_code'],
      })
    }
  }

  return lines
}

// ── FIXED LUMP SUM BILLING ─────────────────────────────────────

export async function buildLumpSumLines(ctx: BillingContext): Promise<InvoiceLineInput[]> {
  const contractResult = await ctx.client.query<{
    contract_value: string; contract_name: string; currency_code: string
  }>(
    `SELECT contract_value, contract_name, currency_code FROM project_contracts WHERE id = $1`,
    [ctx.contractId],
  )
  const c = contractResult.rows[0]!

  const existing = await ctx.client.query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM project_invoices WHERE contract_id = $1 AND status != 'cancelled'`,
    [ctx.contractId],
  )
  if (parseInt(existing.rows[0]?.['cnt'] ?? '0') > 0) {
    throw new BillingError('LUMP_SUM_ALREADY_INVOICED', 'A lump sum contract can only have one invoice')
  }

  return [{
    source_type: 'manual',
    description: `Contract completion — ${c['contract_name']}`,
    qty: 1,
    unit_cost: parseFloat(c['contract_value']),
    margin_pct: 0,
    currency_code: c['currency_code'],
  }]
}

// ── CALCULATORS ────────────────────────────────────────────────

export function calculateLineAmounts(line: InvoiceLineInput): LineAmounts {
  const subtotal = line.qty * line.unit_cost
  const margin_amount = subtotal * line.margin_pct
  const line_total = subtotal + margin_amount
  return { subtotal, margin_amount, line_total }
}

export function calculateInvoiceTotals(
  lines: LineAmounts[],
  retentionPct: number,
): InvoiceTotals {
  const subtotal = lines.reduce((s, l) => s + l.subtotal, 0)
  const margin_total = lines.reduce((s, l) => s + l.margin_amount, 0)
  const gross_total = lines.reduce((s, l) => s + l.line_total, 0)
  const retention_amount = gross_total * retentionPct
  const net_payable = gross_total - retention_amount
  return { subtotal, margin_total, gross_total, retention_amount, net_payable }
}

// ── MARK SOURCES AS INVOICED ───────────────────────────────────

export async function markSourcesInvoiced(
  client: PoolClient,
  lines: Array<{ source_type: string; source_id?: string }>,
): Promise<void> {
  for (const line of lines) {
    if (!line.source_id) continue
    switch (line.source_type) {
      case 'manufacturing_order':
        await client.query(`UPDATE manufacturing_orders SET is_invoiced=true WHERE id=$1`, [line.source_id])
        break
      case 'purchase_order':
        await client.query(`UPDATE po_receipts SET is_invoiced=true WHERE id=$1`, [line.source_id])
        break
      case 'stock_issue':
        await client.query(`UPDATE project_material_issue_lines SET is_invoiced=true WHERE id=$1`, [line.source_id])
        break
      case 'rental':
        await client.query(`UPDATE rental_invoices SET is_invoiced=true WHERE id=$1`, [line.source_id])
        break
      case 'milestone':
        await client.query(`UPDATE project_milestones SET status='invoiced' WHERE id=$1`, [line.source_id])
        break
    }
  }
}

// ── BILLING DISPATCHER ─────────────────────────────────────────

export interface BillingParams {
  billing_method: 'milestone' | 'progress' | 'cost_plus' | 'fixed_lump_sum'
  display_mode?: 'summarised' | 'detailed'
  milestone_ids?: string[]
  progress_pct?: number
  previous_progress_pct?: number
  include_mos?: boolean
  include_pos?: boolean
  include_stock_issues?: boolean
  include_rental?: boolean
  default_margin_pct?: number
}

export async function buildInvoiceLines(
  ctx: BillingContext,
  params: BillingParams,
): Promise<InvoiceLineInput[]> {
  switch (params.billing_method) {
    case 'milestone':
      return buildMilestoneLines(ctx, params.milestone_ids ?? [])
    case 'progress':
      return buildProgressLines(ctx, params.progress_pct ?? 0, params.previous_progress_pct ?? 0)
    case 'cost_plus':
      return buildCostPlusLines(ctx, {
        includeCompletedMOs: params.include_mos ?? true,
        includeReceivedPOs: params.include_pos ?? true,
        includeStockIssues: params.include_stock_issues ?? true,
        includeRental: params.include_rental ?? true,
        defaultMarginPct: params.default_margin_pct ?? 0,
        displayMode: params.display_mode ?? 'summarised',
      })
    case 'fixed_lump_sum':
      return buildLumpSumLines(ctx)
    default:
      throw new BillingError('UNKNOWN_BILLING_METHOD', `Unknown billing method: ${String(params.billing_method)}`)
  }
}
