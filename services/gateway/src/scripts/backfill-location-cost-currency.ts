// One-off backfill (playbook #67): the currency label on a stock location's last cost follows the product's.
//
// `stock_balances.last_cost_currency` and `stock_moves.currency_code` both default to 'IQD', so stock that was
// imported or backfilled arrived tagged IQD whatever its real currency, and a Stock Adjustment cost correction that
// kept the number and changed only the currency used to skip the location (fixed in createStockAdjustment). The
// product's own Cost (products.cost_currency) is the one people corrected: on production 727 location rows (548 of
// them holding stock, almost all in Nishtimani Factory) say IQD under a product whose Cost is USD, with exactly the
// same number.
//
// Only that case is changed: a location tagged IQD, a product whose cost currency is USD, and the SAME amount at the
// location and on the product. Everything else is left alone and reported:
//   - a product whose cost currency is IQD is genuinely IQD (or not corrected yet): never touched;
//   - a product with no cost currency has nothing to follow;
//   - a location whose amount DIFFERS from the product's (stock bought at another price, or a rounded number) is
//     listed for a person to review and is never changed by this script;
//   - a product held in another company's location, and virtual locations, are skipped.
//
// How a row is changed. A location that holds stock gets a `cost_correction` move (same location to itself, the full
// quantity, the same cost, currency USD), the same entry a Stock Adjustment cost correction writes, so the append-only
// ledger agrees with the balance and the existing trigger re-tags the balance; the quantity and the amount do not
// change. The balance's last_move_at is put back to what it was (the correction is not a physical movement; the only
// reader is transfer pricing, which ranks lots by it). A location that holds nothing cannot take a move (a move needs
// a quantity above zero, and there is no value to restate), so its label is changed directly.
//
// Dry run by default: reads, prints what it would change and the rows needing review, writes nothing. `--apply`
// makes the change in ONE transaction, records the old and new label of every row in audit_log, then re-reads the
// COMMITTED data and fails if anything is off. Take a database backup first.
//
// Run on the server, from the gateway folder, after sourcing the app's .env:
//   node dist/scripts/backfill-location-cost-currency.js                          (dry run, every company)
//   node dist/scripts/backfill-location-cost-currency.js --company "Nishtimani Factory" --apply --actor-email you@company.com
/* eslint-disable no-console -- a command-line script: printing is its output */
import { pathToFileURL } from 'node:url'
import { pool, type PoolClient } from '@fnc-erp/db'

// The label legacy stock was tagged with by default, and the product currency it should follow.
export const FROM_CURRENCY = 'IQD'
export const TO_CURRENCY = 'USD'
export const MOVE_NOTE = `Currency label corrected ${FROM_CURRENCY} to ${TO_CURRENCY} to match the product's cost currency (backfill, playbook #67)`
export const AUDIT_ACTION = 'backfill_location_cost_currency'

export interface BackfillOptions {
  apply: boolean
  actorEmail?: string
  // A company id or its exact name (the company that owns the location); omitted means every company.
  company?: string
}

export interface BalanceRow {
  balance_id: string
  product_id: string
  location_id: string
  lot_id: string | null
  company_id: string
  company: string
  sku: string
  product_name: string
  location: string
  qty_on_hand: string
  average_cost: string
  product_cost: string
  last_move_at: string | null
}

export interface CompanyTotal {
  company: string
  rows: number
  withStock: number
  empty: number
  // Quantity times cost over the rows that hold stock, in the products' own number (one currency per row).
  value: string
}

export interface LocationCurrencyPlan {
  relabel: BalanceRow[]
  totals: CompanyTotal[]
  // Location IQD, product USD, but a different amount: for a person to review, never changed here.
  review: BalanceRow[]
  leftAlone: {
    alreadyMatches: number
    productCurrencyNotSet: number
    otherCompanyProduct: number
    otherMismatch: number
  }
}

export interface BackfillReport {
  applied: boolean
  plan: LocationCurrencyPlan
}

type Exec = Pick<PoolClient, 'query'>

const companyFilter = `($1::text IS NULL OR co.id::text = $1 OR lower(co.name) = lower($1))`

const FROM_CLAUSE = `
  FROM stock_balances sb
  JOIN products p ON p.id = sb.product_id
  JOIN stock_locations sl ON sl.id = sb.location_id
  JOIN companies co ON co.id = sl.company_id`

const REAL_LOCATION = `sl.type NOT IN ('virtual_in', 'virtual_out')`

// A location tagged with the default label under a product whose cost currency says otherwise.
const LABEL_MISMATCH = `${REAL_LOCATION} AND ${companyFilter}
  AND p.company_id = sl.company_id
  AND btrim(sb.last_cost_currency) = $2 AND btrim(p.cost_currency) = $3 AND p.standard_cost > 0`

const SELECT_ROW = `
  SELECT sb.id AS balance_id, sb.product_id, sb.location_id, sb.lot_id, sl.company_id, co.name AS company,
         p.sku, p.name AS product_name, sl.name AS location,
         sb.qty_on_hand::text AS qty_on_hand, sb.average_cost::text AS average_cost,
         p.standard_cost::text AS product_cost, sb.last_move_at::text AS last_move_at`

export async function planLocationCurrency(
  exec: Exec,
  company: string | undefined,
): Promise<LocationCurrencyPlan> {
  const params = [company ?? null, FROM_CURRENCY, TO_CURRENCY]
  const relabel = await exec.query<BalanceRow>(
    `${SELECT_ROW} ${FROM_CLAUSE}
      WHERE ${LABEL_MISMATCH} AND sb.average_cost = p.standard_cost
      ORDER BY co.name, p.sku, sl.name, sb.id`,
    params,
  )
  const totals = await exec.query<{
    company: string
    rows: string
    with_stock: string
    value: string
  }>(
    `SELECT co.name AS company, count(*)::text AS rows,
            count(*) FILTER (WHERE sb.qty_on_hand > 0)::text AS with_stock,
            ROUND(COALESCE(SUM(GREATEST(sb.qty_on_hand, 0) * sb.average_cost), 0), 0)::text AS value
       ${FROM_CLAUSE}
      WHERE ${LABEL_MISMATCH} AND sb.average_cost = p.standard_cost
      GROUP BY co.name ORDER BY co.name`,
    params,
  )
  const review = await exec.query<BalanceRow>(
    `${SELECT_ROW} ${FROM_CLAUSE}
      WHERE ${LABEL_MISMATCH} AND sb.average_cost <> p.standard_cost
      ORDER BY co.name, p.sku, sl.name, sb.id`,
    params,
  )
  const counts = await exec.query<{
    total: string
    already_matches: string
    not_set: string
    other_company: string
  }>(
    `SELECT count(*)::text AS total,
            count(*) FILTER (WHERE p.company_id = sl.company_id AND p.cost_currency IS NOT NULL
                               AND btrim(sb.last_cost_currency) = btrim(p.cost_currency))::text AS already_matches,
            count(*) FILTER (WHERE p.company_id = sl.company_id AND p.cost_currency IS NULL)::text AS not_set,
            count(*) FILTER (WHERE p.company_id <> sl.company_id)::text AS other_company
       ${FROM_CLAUSE}
      WHERE ${REAL_LOCATION} AND ${companyFilter}`,
    [company ?? null],
  )
  const k = counts.rows[0] // an aggregate without GROUP BY always returns exactly one row
  const total = parseInt(k.total, 10)
  const alreadyMatches = parseInt(k.already_matches, 10)
  const productCurrencyNotSet = parseInt(k.not_set, 10)
  const otherCompanyProduct = parseInt(k.other_company, 10)
  return {
    relabel: relabel.rows,
    totals: totals.rows.map((t) => ({
      company: t.company,
      rows: parseInt(t.rows, 10),
      withStock: parseInt(t.with_stock, 10),
      empty: parseInt(t.rows, 10) - parseInt(t.with_stock, 10),
      value: t.value,
    })),
    review: review.rows,
    leftAlone: {
      alreadyMatches,
      productCurrencyNotSet,
      otherCompanyProduct,
      otherMismatch:
        total -
        relabel.rows.length -
        review.rows.length -
        alreadyMatches -
        productCurrencyNotSet -
        otherCompanyProduct,
    },
  }
}

// The writes, guarded row by row. Exported so a test can hand it a stale plan; the caller owns the transaction.
export async function applyLocationCurrency(
  client: Exec,
  plan: LocationCurrencyPlan,
  actorId: string,
): Promise<void> {
  if (plan.relabel.length === 0) return
  // The balance's last_move_at is put back at the end: a correction is not a physical movement. Held in a
  // temporary table so the exact timestamps are kept (a value round-tripped through JavaScript could lose digits).
  await client.query(
    `CREATE TEMP TABLE lccbf_prev ON COMMIT DROP AS
       SELECT id, last_move_at FROM stock_balances WHERE id = ANY($1::uuid[])`,
    [plan.relabel.map((r) => r.balance_id)],
  )
  for (const r of plan.relabel) {
    // Lock the row and make sure it is still exactly what was planned: same quantity, same cost, same label.
    const now = await client.query<{ qty_on_hand: string; average_cost: string; label: string }>(
      `SELECT qty_on_hand::text AS qty_on_hand, average_cost::text AS average_cost,
              btrim(last_cost_currency) AS label
         FROM stock_balances WHERE id = $1 FOR UPDATE`,
      [r.balance_id],
    )
    const c = now.rows.at(0)
    if (
      !c ||
      c.qty_on_hand !== r.qty_on_hand ||
      c.average_cost !== r.average_cost ||
      c.label !== FROM_CURRENCY
    )
      throw new Error(
        `${r.sku} at ${r.location} changed since the plan was made; nothing was written, run it again`,
      )

    const holdsStock = parseFloat(r.qty_on_hand) > 0
    if (holdsStock) {
      await client.query(
        `INSERT INTO stock_moves (company_id, product_id, lot_id, from_location_id, to_location_id, moved_at,
                                  qty, unit_cost, total_cost, currency_code, source_type, notes, moved_by)
         VALUES ($1, $2, $3, $4, $4, NOW(), $5, $6, ROUND($5::numeric * $6::numeric, 4), $7,
                 'cost_correction', $8, $9)`,
        [
          r.company_id,
          r.product_id,
          r.lot_id,
          r.location_id,
          r.qty_on_hand,
          r.average_cost,
          TO_CURRENCY,
          MOVE_NOTE,
          actorId,
        ],
      )
    } else {
      const updated = await client.query(
        `UPDATE stock_balances SET last_cost_currency = $2, updated_at = NOW() WHERE id = $1`,
        [r.balance_id, TO_CURRENCY],
      )
      if (updated.rowCount !== 1) throw new Error(`Could not relabel ${r.sku} at ${r.location}`)
    }

    // Plain SQL, not logAudit: logAudit swallows its own errors, and a failed insert inside the transaction
    // would turn COMMIT into a silent ROLLBACK while this script printed APPLIED (playbook #48).
    await client.query(
      `INSERT INTO audit_log (user_id, company_id, action, table_name, record_id, old_values, new_values)
       VALUES ($1, $2, $3, 'stock_balances', $4, $5::jsonb, $6::jsonb)`,
      [
        actorId,
        r.company_id,
        AUDIT_ACTION,
        r.balance_id,
        JSON.stringify({
          last_cost_currency: FROM_CURRENCY,
          average_cost: r.average_cost,
          qty_on_hand: r.qty_on_hand,
        }),
        JSON.stringify({
          last_cost_currency: TO_CURRENCY,
          average_cost: r.average_cost,
          qty_on_hand: r.qty_on_hand,
          via: holdsStock ? 'cost_correction_move' : 'direct_relabel',
        }),
      ],
    )
  }
  await client.query(
    `UPDATE stock_balances sb SET last_move_at = t.last_move_at
       FROM lccbf_prev t WHERE t.id = sb.id AND sb.last_move_at IS DISTINCT FROM t.last_move_at`,
  )
}

export async function backfillLocationCostCurrency(opts: BackfillOptions): Promise<BackfillReport> {
  if (!opts.apply) return { applied: false, plan: await planLocationCurrency(pool, opts.company) }
  if (!opts.actorEmail)
    throw new Error('--apply needs --actor-email <the administrator making this change>')
  const actor = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE lower(email) = lower($1)`,
    [opts.actorEmail],
  )
  if (!actor.rows[0]) throw new Error(`No user with the email ${opts.actorEmail}`)
  const actorId = actor.rows[0].id

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const plan = await planLocationCurrency(client, opts.company)
    await applyLocationCurrency(client, plan, actorId)
    await client.query('COMMIT')

    // Read the COMMITTED state on a different connection before saying it worked.
    const committed = await planLocationCurrency(pool, opts.company)
    if (committed.relabel.length > 0)
      throw new Error(
        `${committed.relabel.length} location rows still carry the old label after COMMIT; check the database`,
      )
    if (plan.relabel.length > 0) {
      const ids = plan.relabel.map((r) => r.balance_id)
      const after = await pool.query<{
        id: string
        qty_on_hand: string
        average_cost: string
        label: string
        last_move_at: string | null
      }>(
        `SELECT id, qty_on_hand::text AS qty_on_hand, average_cost::text AS average_cost,
                btrim(last_cost_currency) AS label, last_move_at::text AS last_move_at
           FROM stock_balances WHERE id = ANY($1::uuid[])`,
        [ids],
      )
      const byId = new Map(after.rows.map((x) => [x.id, x]))
      for (const r of plan.relabel) {
        const x = byId.get(r.balance_id)
        if (
          !x ||
          x.label !== TO_CURRENCY ||
          x.qty_on_hand !== r.qty_on_hand ||
          x.average_cost !== r.average_cost ||
          x.last_move_at !== r.last_move_at
        )
          throw new Error(
            `${r.sku} at ${r.location} is not as expected after COMMIT (label, quantity, amount or last movement); check the database`,
          )
      }
      const audited = await pool.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM audit_log
          WHERE action = $1 AND user_id = $2 AND record_id = ANY($3::uuid[])`,
        [AUDIT_ACTION, actorId, ids],
      )
      if (parseInt(audited.rows[0]?.n ?? '0', 10) < plan.relabel.length)
        throw new Error('The audit rows are missing after COMMIT; check the database')
      const stockRows = plan.relabel.filter((r) => parseFloat(r.qty_on_hand) > 0).length
      const moves = await pool.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM stock_moves
          WHERE source_type = 'cost_correction' AND notes = $1 AND moved_by = $2
            AND to_location_id = ANY($3::uuid[])`,
        [MOVE_NOTE, actorId, plan.relabel.map((r) => r.location_id)],
      )
      if (parseInt(moves.rows[0]?.n ?? '0', 10) < stockRows)
        throw new Error('The correcting stock moves are missing after COMMIT; check the database')
    }
    return { applied: true, plan }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw e
  } finally {
    client.release()
  }
}

function printReport(r: BackfillReport): void {
  const p = r.plan
  console.log(
    `\nLocations tagged ${FROM_CURRENCY} under a ${TO_CURRENCY} product, same amount: ${p.relabel.length} rows` +
      ` (${r.applied ? 'now relabelled' : 'would be relabelled'} ${TO_CURRENCY})`,
  )
  for (const t of p.totals)
    console.log(
      `   ${t.company.padEnd(24)} ${String(t.rows).padStart(5)} rows   ${String(t.withStock).padStart(5)} hold stock (a correcting move each)   ${String(t.empty).padStart(5)} empty (label only)   stock value ${t.value} (in the products' own number)`,
    )
  for (const x of p.relabel.slice(0, 15))
    console.log(
      `   ${x.sku.padEnd(14)} ${x.location.slice(0, 22).padEnd(22)} qty ${x.qty_on_hand.padStart(14)}  cost ${x.average_cost}`,
    )
  if (p.relabel.length > 15) console.log(`   ... and ${p.relabel.length - 15} more`)

  console.log(
    `\nNeeds a person's review, NOT changed by this script (location ${FROM_CURRENCY}, product ${TO_CURRENCY}, DIFFERENT amount): ${p.review.length}`,
  )
  for (const x of p.review)
    console.log(
      `   ${x.company.slice(0, 18).padEnd(18)} ${x.sku.padEnd(14)} ${x.location.slice(0, 18).padEnd(18)} qty ${x.qty_on_hand.padStart(12)}  location ${x.average_cost.padStart(12)} ${FROM_CURRENCY}  product ${x.product_cost.padStart(10)} ${TO_CURRENCY}`,
    )

  console.log(`\nLeft as they are:`)
  console.log(
    `   label already matches the product's currency (includes genuine IQD products): ${p.leftAlone.alreadyMatches}`,
  )
  console.log(
    `   product has no cost currency (nothing to follow): ${p.leftAlone.productCurrencyNotSet}`,
  )
  console.log(
    `   product belongs to another company than the location: ${p.leftAlone.otherCompanyProduct}`,
  )
  console.log(
    `   any other mismatch (e.g. location USD under an IQD product): ${p.leftAlone.otherMismatch}`,
  )
  console.log(
    `\n${r.applied ? 'APPLIED (verified by a second read)' : 'DRY RUN (nothing written)'}` +
      (r.applied ? '' : '. Re-run with --apply --actor-email <admin email> to make the change.'),
  )
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const valueOf = (flag: string): string | undefined => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }
  const actorEmail = valueOf('--actor-email')
  const company = valueOf('--company')
  try {
    const report = await backfillLocationCostCurrency({
      apply: args.includes('--apply'),
      ...(actorEmail ? { actorEmail } : {}),
      ...(company ? { company } : {}),
    })
    printReport(report)
    process.exitCode = 0
  } catch (e) {
    console.error(`\nFAILED: ${(e as Error).message}`)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
  process.exit()
}

// Runs only when started from the command line, never when a test imports it.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main()
}
