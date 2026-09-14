// Backfill for lines that had a fully-stock-covered total_price zeroed by
// confirmPOInventoryCheck's old behavior (services/gateway/src/graphql/
// resolvers.ts), which only ever auto-filled store_price/unit_price for a
// from-stock line when the PO ALSO still needed a vendor purchase for some
// other line — a 100%-stock-covered PO skipped that fill entirely and went
// straight to ready_to_issue with every line (and the PO's own Total) at 0.
// The resolver itself is already fixed to do this going forward, on every
// new confirmPOInventoryCheck call; this script is only for lines that
// already went through the old code path before that fix shipped.
//
// Two scopes, run one after the other:
//
// 1. Standalone PO lines (po_id set) — mirrors confirmPOInventoryCheck's own
//    fallback chain exactly: storePrice = cached last_market_price (if >0),
//    else stock_balances.average_cost at the line's own source_location_id,
//    else 0. storeCurrency = last_market_price_currency (if using the
//    cache), else the product's own cost_currency, else the PO's
//    base_currency_code. Sets unit_price/currency_code/total_price/
//    fx_rate_to_base, then recalculates that PO's subtotal/total_amount
//    (purchase_orders.total_amount is a real column, converted to base
//    currency via fx_rate_to_base — see recalcPO in resolvers.ts).
//
// 2. Requisition-linked lines (requisition_id set, po_id NULL — either a
//    line still on its requisition pre-fork, or one of the pre-G1
//    historical POs migration 258 moved onto a synthetic REQ-MIG-*
//    requisition without ever touching its pricing). Same fallback chain,
//    except the last-resort currency is the company's own
//    system_configuration.default_currency (there's no PO to read a
//    base_currency_code from), and there's no fx_rate_to_base or PO total
//    to update — requisitions.currencyTotals (getRequisitionCurrencyTotals
//    in resolvers.ts) is a live, uncached SUM(total_price) GROUP BY
//    currency_code read straight off po_lines, by G1's own deliberate
//    no-conversion-between-currencies design — so setting total_price is
//    the whole fix for this scope.
//
// Scope common to both — a line is touched only when ALL of:
//   - qty_from_stock > 0 AND qty_from_stock >= qty_ordered (fully covered)
//   - total_price = 0 (the exact symptom; a line with a real total_price
//     already, for any reason, is left alone)
// A genuine G1-forked child-PO line (finishBuyingRequisition) always has
// qty_from_stock=0 by construction — it's only ever created for the portion
// that still needed a vendor purchase — so it can never match
// "qty_from_stock >= qty_ordered" (qty_ordered > 0 always, per the po_lines
// CHECK constraint) and is naturally excluded from both scopes.
//
// Where a currency needs converting and there's nothing configured to
// convert it with (a PO's po_fx_rates entry in scope 1; nothing needed in
// scope 2), the line is SKIPPED and reported, never given a wrong or
// default-1 conversion. Same for a line with no cached price and no
// location-matched average_cost at all — left untouched rather than
// written with a no-op $0 (or a company-wide-average guess this was
// explicitly decided against).
//
// Usage:
//   DATABASE_URL=... npx tsx scripts/backfill-po-stock-line-totals.ts            # dry run (default) — prints the plan, writes nothing
//   DATABASE_URL=... npx tsx scripts/backfill-po-stock-line-totals.ts --apply    # actually writes, inside one transaction per scope

import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env['DATABASE_URL'] })
const APPLY = process.argv.includes('--apply')

interface PlanRow {
  label: string
  lineNumber: number
  description: string
  qtyFromStock: number
  storePrice: number
  storeCurrency: string
  fxRateToBase: number | null
  newTotalPrice: number
  source: string
}

async function resolveFxRateToBase(
  companyId: string,
  currencyCode: string,
  baseCurrencyCode: string,
): Promise<number | undefined> {
  if (currencyCode === baseCurrencyCode) return 1
  const r = await pool.query<{ rate_to_base: string }>(
    `SELECT rate_to_base FROM po_fx_rates WHERE company_id=$1 AND currency_code=$2`,
    [companyId, currencyCode],
  )
  const rate = r.rows[0]?.rate_to_base
  return rate == null ? undefined : parseFloat(rate)
}

const companyDefaultCurrencyCache = new Map<string, string>()
async function getCompanyDefaultCurrency(companyId: string): Promise<string> {
  const cached = companyDefaultCurrencyCache.get(companyId)
  if (cached) return cached
  const r = await pool.query<{ default_currency: string | null }>(
    `SELECT default_currency FROM system_configuration WHERE company_id=$1`,
    [companyId],
  )
  const currency = r.rows[0]?.default_currency ?? 'IQD'
  companyDefaultCurrencyCache.set(companyId, currency)
  return currency
}

function printPlan(scopeLabel: string, plan: PlanRow[], skippedNoFx: string[], skippedNoCost: string[]): void {
  console.log(`\n=== ${scopeLabel} ===`)
  console.log(
    `Found ${plan.length + skippedNoFx.length + skippedNoCost.length} candidate line(s), ${plan.length} fixable.`,
  )
  console.table(
    plan.map((p) => ({
      [scopeLabel.includes('Requisition') ? 'Requisition' : 'PO']: p.label,
      Line: p.lineNumber,
      Item: p.description,
      Qty: p.qtyFromStock,
      'Store Price': p.storePrice,
      Currency: p.storeCurrency,
      'FX->Base': p.fxRateToBase ?? '—',
      'New Total': p.newTotalPrice.toFixed(2),
      Source: p.source,
    })),
  )
  if (skippedNoFx.length > 0) {
    console.log(`\nSkipped ${skippedNoFx.length} line(s) — no configured PO FX rate:`)
    for (const s of skippedNoFx) console.log(`  - ${s}`)
  }
  if (skippedNoCost.length > 0) {
    console.log(`\nSkipped ${skippedNoCost.length} line(s) — no cost data available at all, left untouched:`)
    for (const s of skippedNoCost) console.log(`  - ${s}`)
  }
}

interface StandalonePoCandidate {
  po_id: string
  po_number: string
  base_currency_code: string
  company_id: string
  line_id: string
  line_number: number
  description: string
  product_id: string | null
  sku: string | null
  qty_ordered: string
  qty_from_stock: string
  last_market_price: string | null
  last_market_price_currency: string | null
  cost_currency: string | null
  fallback_avg_cost: string | null
}

async function backfillStandalonePoLines(client: import('pg').PoolClient): Promise<void> {
  const candidates = await pool.query<StandalonePoCandidate>(
    `SELECT po.id AS po_id, po.po_number, po.base_currency_code, po.company_id,
            pl.id AS line_id, pl.line_number, pl.description, pl.product_id, p.sku,
            pl.qty_ordered, pl.qty_from_stock,
            p.last_market_price, p.last_market_price_currency, p.cost_currency,
            sb.average_cost AS fallback_avg_cost
     FROM po_lines pl
     JOIN purchase_orders po ON po.id = pl.po_id
     LEFT JOIN products p ON p.id = pl.product_id
     LEFT JOIN stock_balances sb ON sb.product_id = pl.product_id
       AND sb.location_id = pl.source_location_id AND sb.lot_id IS NULL
     WHERE pl.qty_from_stock > 0
       AND pl.qty_from_stock >= pl.qty_ordered
       AND pl.total_price = 0
     ORDER BY po.po_number, pl.line_number`,
  )

  const plan: PlanRow[] = []
  const skippedNoFx: string[] = []
  const skippedNoCost: string[] = []
  const touchedPoIds = new Set<string>()

  for (const row of candidates.rows) {
    const cachedPrice = row.last_market_price != null ? parseFloat(row.last_market_price) : null
    const usingCache = cachedPrice != null && cachedPrice > 0
    const storePrice = usingCache ? cachedPrice! : parseFloat(row.fallback_avg_cost ?? '0')
    const storeCurrency = usingCache
      ? (row.last_market_price_currency ?? row.cost_currency ?? row.base_currency_code)
      : (row.cost_currency ?? row.base_currency_code)

    if (storePrice === 0) {
      skippedNoCost.push(
        `${row.po_number} line ${row.line_number} (${row.description || row.sku || row.product_id}) — no cached market price and no location-matched average_cost`,
      )
      continue
    }

    const fxRateToBase = await resolveFxRateToBase(row.company_id, storeCurrency, row.base_currency_code)
    if (fxRateToBase == null) {
      skippedNoFx.push(
        `${row.po_number} line ${row.line_number} (${row.description || row.sku || row.product_id}) — needs ${storeCurrency} -> ${row.base_currency_code}, no po_fx_rates entry configured`,
      )
      continue
    }

    const qtyFromStock = parseFloat(row.qty_from_stock)
    const newTotalPrice = qtyFromStock * storePrice

    plan.push({
      label: row.po_number,
      lineNumber: row.line_number,
      description: row.description || row.sku || row.product_id || '(no description)',
      qtyFromStock,
      storePrice,
      storeCurrency,
      fxRateToBase,
      newTotalPrice,
      source: usingCache ? 'cached_market_price' : 'average_cost_fallback',
    })

    if (APPLY) {
      await client.query(
        `UPDATE po_lines
         SET store_price=$1, store_price_currency=$2, unit_price=$1, currency_code=$2,
             total_price=$3, fx_rate_to_base=$4
         WHERE id=$5`,
        [storePrice, storeCurrency, newTotalPrice, fxRateToBase, row.line_id],
      )
      touchedPoIds.add(row.po_id)
    }
  }

  printPlan('Standalone PO lines', plan, skippedNoFx, skippedNoCost)

  if (APPLY) {
    for (const poId of touchedPoIds) {
      await client.query(
        `UPDATE purchase_orders
         SET subtotal=(SELECT COALESCE(SUM(total_price * COALESCE(fx_rate_to_base,1)),0) FROM po_lines WHERE po_id=$1),
             total_amount=(SELECT COALESCE(SUM(total_price * COALESCE(fx_rate_to_base,1)),0) FROM po_lines WHERE po_id=$1),
             updated_at=NOW()
         WHERE id=$1`,
        [poId],
      )
    }
    console.log(`\nApplied. ${touchedPoIds.size} PO(s) updated and their totals recalculated.`)
  } else if (plan.length > 0) {
    console.log('\nDry run only — nothing written. Re-run with --apply to write these changes.')
  }
}

interface RequisitionCandidate {
  requisition_id: string
  requisition_number: string
  company_id: string
  line_id: string
  line_number: number
  description: string
  product_id: string | null
  sku: string | null
  qty_ordered: string
  qty_from_stock: string
  last_market_price: string | null
  last_market_price_currency: string | null
  cost_currency: string | null
  fallback_avg_cost: string | null
}

async function backfillRequisitionLines(client: import('pg').PoolClient): Promise<void> {
  const candidates = await pool.query<RequisitionCandidate>(
    `SELECT r.id AS requisition_id, r.requisition_number, r.company_id,
            pl.id AS line_id, pl.line_number, pl.description, pl.product_id, p.sku,
            pl.qty_ordered, pl.qty_from_stock,
            p.last_market_price, p.last_market_price_currency, p.cost_currency,
            sb.average_cost AS fallback_avg_cost
     FROM po_lines pl
     JOIN requisitions r ON r.id = pl.requisition_id
     LEFT JOIN products p ON p.id = pl.product_id
     LEFT JOIN stock_balances sb ON sb.product_id = pl.product_id
       AND sb.location_id = pl.source_location_id AND sb.lot_id IS NULL
     WHERE pl.qty_from_stock > 0
       AND pl.qty_from_stock >= pl.qty_ordered
       AND pl.total_price = 0
     ORDER BY r.requisition_number, pl.line_number`,
  )

  const plan: PlanRow[] = []
  const skippedNoCost: string[] = []

  for (const row of candidates.rows) {
    const companyDefaultCurrency = await getCompanyDefaultCurrency(row.company_id)
    const cachedPrice = row.last_market_price != null ? parseFloat(row.last_market_price) : null
    const usingCache = cachedPrice != null && cachedPrice > 0
    const storePrice = usingCache ? cachedPrice! : parseFloat(row.fallback_avg_cost ?? '0')
    const storeCurrency = usingCache
      ? (row.last_market_price_currency ?? row.cost_currency ?? companyDefaultCurrency)
      : (row.cost_currency ?? companyDefaultCurrency)

    if (storePrice === 0) {
      skippedNoCost.push(
        `${row.requisition_number} line ${row.line_number} (${row.description || row.sku || row.product_id}) — no cached market price and no location-matched average_cost`,
      )
      continue
    }

    const qtyFromStock = parseFloat(row.qty_from_stock)
    const newTotalPrice = qtyFromStock * storePrice

    plan.push({
      label: row.requisition_number,
      lineNumber: row.line_number,
      description: row.description || row.sku || row.product_id || '(no description)',
      qtyFromStock,
      storePrice,
      storeCurrency,
      fxRateToBase: null, // no conversion for requisitions — currencyTotals is grouped raw by currency_code
      newTotalPrice,
      source: usingCache ? 'cached_market_price' : 'average_cost_fallback',
    })

    if (APPLY) {
      await client.query(
        `UPDATE po_lines
         SET store_price=$1, store_price_currency=$2, unit_price=$1, currency_code=$2, total_price=$3
         WHERE id=$4`,
        [storePrice, storeCurrency, newTotalPrice, row.line_id],
      )
    }
  }

  printPlan('Requisition-linked lines', plan, [], skippedNoCost)

  if (APPLY) {
    console.log(`\nApplied. ${plan.length} line(s) updated (requisitions.currencyTotals reads these live — nothing else to recalculate).`)
  } else if (plan.length > 0) {
    console.log('\nDry run only — nothing written. Re-run with --apply to write these changes.')
  }
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (will write)' : 'DRY RUN (no writes)'}`)

  const client = await pool.connect()
  try {
    if (APPLY) await client.query('BEGIN')
    await backfillStandalonePoLines(client)
    if (APPLY) await client.query('COMMIT')
  } catch (e) {
    if (APPLY) await client.query('ROLLBACK')
    throw e
  }

  try {
    if (APPLY) await client.query('BEGIN')
    await backfillRequisitionLines(client)
    if (APPLY) await client.query('COMMIT')
  } catch (e) {
    if (APPLY) await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
