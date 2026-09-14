// Backfill for POs that had a fully-stock-covered line's total_price
// zeroed by confirmPOInventoryCheck's old behavior (services/gateway/src/
// graphql/resolvers.ts), which only ever auto-filled store_price/unit_price
// for a from-stock line when the PO ALSO still needed a vendor purchase for
// some other line — a 100%-stock-covered PO skipped that fill entirely and
// went straight to ready_to_issue with every line (and the PO's own Total)
// at 0. The resolver itself is already fixed to do this going forward, on
// every new confirmPOInventoryCheck call; this script is only for POs that
// already went through the old code path before that fix shipped.
//
// Mirrors the resolver's own fallback chain exactly (see confirmPOInventoryCheck):
// storePrice = cached last_market_price (if >0), else stock_balances.average_cost
// at the line's own source_location_id, else 0.
// storeCurrency = last_market_price_currency (if using the cache), else the
// product's own cost_currency, else the PO's base_currency_code.
//
// Scope — a line is touched only when ALL of:
//   - qty_from_stock > 0 AND qty_from_stock >= qty_ordered (fully covered)
//   - total_price = 0 (the exact symptom; a line with a real total_price
//     already, for any reason, is left alone)
// No po.requisition_id filter: a genuine G1-forked line (finishBuyingRequisition)
// always has qty_from_stock=0 by construction — it's only ever created for the
// portion that still needed a vendor purchase — so it can never match
// "qty_from_stock >= qty_ordered" (qty_ordered > 0 always, per the po_lines
// CHECK constraint) regardless of whether requisition_id is set. A line that
// DOES match with requisition_id set is therefore never a real fork; on
// production this is specifically the pre-G1 historical POs migration 258
// retroactively tagged with a synthetic requisition_id for continuity
// (BECOMES_CHILD category) without ever touching their po_lines pricing —
// exactly the same symptom as a standalone PO, just with that extra tag.
//
// Where storeCurrency != base_currency_code, a configured po_fx_rates entry
// is required (same as the resolver's own resolveFxRateToBase) — a line
// whose currency has no configured rate is SKIPPED and reported, never
// given a wrong or default-1 conversion.
//
// Usage:
//   DATABASE_URL=... npx tsx scripts/backfill-po-stock-line-totals.ts            # dry run (default) — prints the plan, writes nothing
//   DATABASE_URL=... npx tsx scripts/backfill-po-stock-line-totals.ts --apply    # actually writes, inside one transaction, then recalculates each touched PO's subtotal/total_amount

import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env['DATABASE_URL'] })
const APPLY = process.argv.includes('--apply')

interface CandidateLine {
  po_id: string
  po_number: string
  base_currency_code: string
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

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (will write)' : 'DRY RUN (no writes)'}`)

  const candidates = await pool.query<CandidateLine>(
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

  console.log(`Found ${candidates.rows.length} candidate line(s) across ${new Set(candidates.rows.map((r) => r.po_id)).size} PO(s).\n`)

  const skippedNoFx: string[] = []
  const skippedNoCost: string[] = []
  const plan: {
    po_number: string
    line_number: number
    description: string
    qtyFromStock: number
    storePrice: number
    storeCurrency: string
    fxRateToBase: number
    newTotalPrice: number
    source: string
  }[] = []

  const client = await pool.connect()
  try {
    if (APPLY) await client.query('BEGIN')

    const touchedPoIds = new Set<string>()

    for (const row of candidates.rows as (CandidateLine & { company_id: string })[]) {
      const cachedPrice = row.last_market_price != null ? parseFloat(row.last_market_price) : null
      const usingCache = cachedPrice != null && cachedPrice > 0
      const storePrice = usingCache ? cachedPrice! : parseFloat(row.fallback_avg_cost ?? '0')
      const storeCurrency = usingCache
        ? (row.last_market_price_currency ?? row.cost_currency ?? row.base_currency_code)
        : (row.cost_currency ?? row.base_currency_code)

      // No cached market price and no average_cost match either (almost
      // always a missing source_location_id on an old pre-reservation-lock
      // line — the exact-location join finds nothing) — decided not to
      // widen this to a company-wide average; leave the line untouched
      // entirely rather than writing a no-op $0 that changes updated_at
      // for nothing.
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
        po_number: row.po_number,
        line_number: row.line_number,
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

    console.table(
      plan.map((p) => ({
        PO: p.po_number,
        Line: p.line_number,
        Item: p.description,
        Qty: p.qtyFromStock,
        'Store Price': p.storePrice,
        Currency: p.storeCurrency,
        'FX->Base': p.fxRateToBase,
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
      await client.query('COMMIT')
      console.log(`\nApplied. ${touchedPoIds.size} PO(s) updated and their totals recalculated.`)
    } else {
      console.log('\nDry run only — nothing written. Re-run with --apply to write these changes.')
    }
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
