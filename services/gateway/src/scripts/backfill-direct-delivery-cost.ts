// One-off backfill (playbook #65): brings the project cost of jobsite deliveries in step with the fixes in
// lib/directDeliveryCost.ts. Four independent corrections, each listed before it is made:
//
//   1. relabel   direct-delivery cost rows booked as 'IQD' on a line in another currency (127 USD rows on production
//                on 2026-11-07, about 38.9K USD): the label becomes the line's own currency. The amount was never
//                converted, so only the label is wrong. Rows booked at an old fx_rate_to_base (amount >= 100 x the line
//                value) are really IQD and are left alone.
//   2. reprice   (only with --reprice) rows whose amount no longer equals received qty x price, because a price was
//                edited after delivery (NY-PO-2026-0101 line 8: 31.50 posted, 21.00 now). Opt-in because it changes a
//                cost figure that someone may have reported on: read the list first.
//   3. offsets   approved or credited vendor returns that never took their value off the project (RTN-NY-PO-2026-0101,
//                9.00 USD): the same negative row an approval makes today (offsetVendorReturnCost).
//   4. material  the material_return offsets of USD direct-delivery lines were booked as 'IQD' too (3 on production):
//                relabelled when the return is made only of direct-delivery lines of ONE currency; a return that
//                mixes stock-issue and direct-delivery lines has no way to tell its rows apart and is only reported.
//
// Dry run by default: reads, prints exactly what it would change, writes nothing. `--apply` makes the changes in ONE
// transaction, then re-reads and rolls back by itself if anything it was meant to fix is still wrong. It records one
// audit_log row per project it touches. Take scripts/backup-db.sh first.
//
// Run on the server, from the gateway folder, after sourcing the app's .env:
//   node dist/scripts/backfill-direct-delivery-cost.js                       (dry run, every company)
//   node dist/scripts/backfill-direct-delivery-cost.js --company "Nishtimani Yakam" --apply --actor-email you@company.com
//   add --reprice to also correct stale amounts (item 2)
/* eslint-disable no-console -- a command-line script: printing is its output */
import { pathToFileURL } from 'node:url'
import { pool, type PoolClient } from '@fnc-erp/db'
import { offsetVendorReturnCost } from '../lib/directDeliveryCost.js'

// An amount at least this many times the line's own value was converted into IQD at an old exchange rate (about
// 1,500 x): that is a correct IQD figure, not a mislabelled foreign one.
const CONVERTED_RATIO = 100

export interface BackfillOptions {
  apply: boolean
  reprice: boolean
  actorEmail?: string
  // A company id or its exact name; omitted means every company.
  company?: string
}

interface RelabelRow {
  cost_id: string
  company_id: string
  project_id: string
  company: string
  po_number: string
  ln: number
  from_label: string
  to_label: string
  amount: string
}
interface RepriceRow {
  cost_id: string
  company_id: string
  project_id: string
  company: string
  po_number: string
  ln: number
  ccy: string
  posted: string
  new_amount: string
}
interface OffsetRow {
  return_id: string
  company_id: string
  project_id: string
  company: string
  return_number: string
  status: string
  currency_code: string
  value: string
}
interface MaterialRow {
  cost_id: string
  company_id: string
  project_id: string
  company: string
  from_label: string
  to_label: string
  amount: string
}
interface MaterialCandidate {
  cost_id: string
  company_id: string
  project_id: string
  company: string
  amount: string
  n_rows: number
  stock_lines: number
  n_ccys: number
  ccy: string | null
  has_converted: boolean
}
interface MaterialAmbiguous {
  cost_id: string
  company: string
  why: string
}

export interface Plan {
  relabel: RelabelRow[]
  reprice: RepriceRow[]
  offsets: OffsetRow[]
  material: MaterialRow[]
  materialAmbiguous: MaterialAmbiguous[]
}

export interface BackfillReport {
  applied: boolean
  plan: Plan
}

type Exec = Pick<PoolClient, 'query'>

const companyFilter = (alias: string) =>
  `($1::text IS NULL OR ${alias}.id::text = $1 OR lower(${alias}.name) = lower($1))`

export async function planBackfill(exec: Exec, company: string | undefined): Promise<Plan> {
  const c = company ?? null
  const relabel = await exec.query<RelabelRow>(
    `SELECT pca.id AS cost_id, co.id AS company_id, pca.project_id, co.name AS company, po.po_number, pl.line_number AS ln,
            pca.currency_code::text AS from_label, pl.currency_code::text AS to_label, pca.amount::text AS amount
       FROM project_cost_actuals pca
       JOIN po_lines pl ON pl.id = pca.source_id
       JOIN purchase_orders po ON po.id = pl.po_id
       JOIN companies co ON co.id = po.company_id
      WHERE pca.source_type = 'po_direct_delivery'
        AND pca.currency_code <> pl.currency_code
        AND COALESCE(NULLIF(pl.fx_rate_to_base, 0), 1) = 1
        AND pl.qty_received * pl.unit_price > 0
        AND pca.amount < ${CONVERTED_RATIO} * pl.qty_received * pl.unit_price
        AND ${companyFilter('co')}
      ORDER BY co.name, po.po_number, pl.line_number`,
    [c],
  )
  const reprice = await exec.query<RepriceRow>(
    `SELECT pca.id AS cost_id, co.id AS company_id, pca.project_id, co.name AS company, po.po_number, pl.line_number AS ln,
            pl.currency_code::text AS ccy, pca.amount::text AS posted,
            ROUND(pl.qty_received * pl.unit_price, 4)::text AS new_amount
       FROM project_cost_actuals pca
       JOIN po_lines pl ON pl.id = pca.source_id
       JOIN purchase_orders po ON po.id = pl.po_id
       JOIN companies co ON co.id = po.company_id
      WHERE pca.source_type = 'po_direct_delivery'
        AND COALESCE(NULLIF(pl.fx_rate_to_base, 0), 1) = 1
        AND pl.qty_received * pl.unit_price > 0
        AND pca.amount < ${CONVERTED_RATIO} * pl.qty_received * pl.unit_price
        AND ABS(pca.amount - pl.qty_received * pl.unit_price) > 0.005
        AND ${companyFilter('co')}
      ORDER BY co.name, po.po_number, pl.line_number`,
    [c],
  )
  const offsets = await exec.query<OffsetRow>(
    `SELECT r.id AS return_id, co.id AS company_id, po.linked_project_id AS project_id, co.name AS company,
            r.return_number, r.status::text AS status, r.currency_code::text AS currency_code,
            SUM(ri.line_total)::text AS value
       FROM po_returns r
       JOIN purchase_orders po ON po.id = r.po_id
       JOIN companies co ON co.id = r.company_id
       JOIN po_return_items ri ON ri.return_id = r.id
      WHERE r.status IN ('approved', 'credited') AND po.linked_project_id IS NOT NULL AND ri.line_total > 0
        AND EXISTS (SELECT 1 FROM project_cost_actuals dd
                     WHERE dd.source_type = 'po_direct_delivery' AND dd.source_id = ri.po_line_id)
        AND NOT EXISTS (SELECT 1 FROM project_cost_actuals o
                         WHERE o.source_type = 'po_vendor_return' AND o.source_id = ri.id)
        AND ${companyFilter('co')}
      GROUP BY r.id, co.id, po.linked_project_id, co.name, r.return_number, r.status, r.currency_code
      ORDER BY co.name, r.return_number`,
    [c],
  )
  // Every 'IQD' material_return cost row of a return that has at least one direct-delivery line in another currency,
  // and that has no row in another currency already (the current code writes one row per currency, so a return that
  // already has a foreign row is correct). What is safe to relabel is decided below, in code, from these facts.
  const candidates = await exec.query<MaterialCandidate>(
    `SELECT pca.id AS cost_id, co.id AS company_id, pca.project_id, co.name AS company, pca.amount::text AS amount,
            (SELECT COUNT(*) FROM project_cost_actuals y
              WHERE y.source_type = 'material_return' AND y.source_id = pmr.id)::int AS n_rows,
            COUNT(*) FILTER (WHERE l.po_line_id IS NULL)::int AS stock_lines,
            COUNT(DISTINCT pl.currency_code)::int AS n_ccys,
            MIN(pl.currency_code)::text AS ccy,
            COALESCE(bool_or(COALESCE(NULLIF(pl.fx_rate_to_base, 0), 1) <> 1
                             OR dd.amount >= ${CONVERTED_RATIO} * pl.qty_received * pl.unit_price), false) AS has_converted
       FROM project_cost_actuals pca
       JOIN project_material_returns pmr ON pmr.id = pca.source_id
       JOIN companies co ON co.id = pmr.company_id
       JOIN project_material_return_lines l ON l.return_id = pmr.id
       LEFT JOIN po_lines pl ON pl.id = l.po_line_id
       LEFT JOIN project_cost_actuals dd ON dd.source_type = 'po_direct_delivery' AND dd.source_id = l.po_line_id
      WHERE pca.source_type = 'material_return' AND pca.currency_code = 'IQD'
        AND NOT EXISTS (SELECT 1 FROM project_cost_actuals z
                         WHERE z.source_type = 'material_return' AND z.source_id = pmr.id AND z.currency_code <> 'IQD')
        AND ${companyFilter('co')}
      GROUP BY pca.id, co.id, pca.project_id, co.name, pca.amount, pmr.id, pca.created_at
     HAVING COALESCE(bool_or(pl.currency_code <> 'IQD'), false)
      ORDER BY co.name, pca.created_at`,
    [c],
  )
  const material: MaterialRow[] = []
  const materialAmbiguous: MaterialAmbiguous[] = []
  for (const m of candidates.rows) {
    // Only a return made of direct-delivery lines in ONE foreign currency, with ONE cost row, has a label that can be
    // fixed without guessing. A return that mixes stock-issue and direct-delivery lines, or two currencies, was booked
    // as one IQD number that adds unlike units together: it is reported, not changed.
    if (m.stock_lines === 0 && m.n_rows === 1 && m.n_ccys === 1 && !m.has_converted && m.ccy)
      material.push({
        cost_id: m.cost_id,
        company_id: m.company_id,
        project_id: m.project_id,
        company: m.company,
        from_label: 'IQD',
        to_label: m.ccy,
        amount: m.amount,
      })
    else
      materialAmbiguous.push({
        cost_id: m.cost_id,
        company: m.company,
        why: m.has_converted
          ? 'the delivery was converted into IQD at an exchange rate; left as it is'
          : 'the return mixes stock-issue and direct-delivery lines or several currencies',
      })
  }
  return {
    relabel: relabel.rows,
    reprice: reprice.rows,
    offsets: offsets.rows,
    material,
    materialAmbiguous,
  }
}

export async function backfillDirectDeliveryCost(opts: BackfillOptions): Promise<BackfillReport> {
  if (!opts.apply) {
    const plan = await planBackfill(pool, opts.company)
    return { applied: false, plan }
  }
  if (!opts.actorEmail)
    throw new Error('--apply needs --actor-email <the administrator making this change>')
  const actor = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE lower(email) = lower($1)`,
    [opts.actorEmail],
  )
  if (!actor.rows[0]) throw new Error(`No user with the email ${opts.actorEmail}`)
  const actorId = actor.rows[0].id
  // pg hands timestamps back as plain strings (packages/db/src/client.ts); it goes straight back in as a parameter.
  const startedAt = (await pool.query<{ now: string }>(`SELECT clock_timestamp() AS now`)).rows[0]
    .now

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const plan = await planBackfill(client, opts.company)

    // 3 first: an offset takes its currency from the return, not from any cost row, so order does not matter, but
    // the direct-delivery rows it cancels must exist (they do; that is what the plan's EXISTS checked).
    for (const o of plan.offsets) await offsetVendorReturnCost(client, o.return_id)

    if (plan.relabel.length > 0)
      await client.query(
        `UPDATE project_cost_actuals pca SET currency_code = pl.currency_code
           FROM po_lines pl
          WHERE pca.id = ANY($1::uuid[]) AND pl.id = pca.source_id`,
        [plan.relabel.map((r) => r.cost_id)],
      )
    if (opts.reprice && plan.reprice.length > 0)
      await client.query(
        `UPDATE project_cost_actuals pca SET amount = ROUND(pl.qty_received * pl.unit_price, 4)
           FROM po_lines pl
          WHERE pca.id = ANY($1::uuid[]) AND pl.id = pca.source_id`,
        [plan.reprice.map((r) => r.cost_id)],
      )
    if (plan.material.length > 0)
      for (const m of plan.material)
        await client.query(`UPDATE project_cost_actuals SET currency_code = $2 WHERE id = $1`, [
          m.cost_id,
          m.to_label,
        ])

    // Re-read: nothing it was meant to fix may still be wrong.
    const after = await planBackfill(client, opts.company)
    const left =
      after.relabel.length +
      after.offsets.length +
      after.material.length +
      (opts.reprice ? after.reprice.length : 0)
    if (left > 0)
      throw new Error(`${left} rows are still wrong after the backfill; nothing was written`)

    // One audit row per project touched.
    const touched = new Map<
      string,
      { companyId: string; relabeled: number; repriced: number; offsets: number; material: number }
    >()
    const bump = (
      projectId: string,
      companyId: string,
      key: 'relabeled' | 'repriced' | 'offsets' | 'material',
    ) => {
      const t = touched.get(projectId) ?? {
        companyId,
        relabeled: 0,
        repriced: 0,
        offsets: 0,
        material: 0,
      }
      t[key] += 1
      touched.set(projectId, t)
    }
    plan.relabel.forEach((r) => {
      bump(r.project_id, r.company_id, 'relabeled')
    })
    if (opts.reprice)
      plan.reprice.forEach((r) => {
        bump(r.project_id, r.company_id, 'repriced')
      })
    plan.offsets.forEach((r) => {
      bump(r.project_id, r.company_id, 'offsets')
    })
    plan.material.forEach((r) => {
      bump(r.project_id, r.company_id, 'material')
    })
    // Plain SQL, not logAudit: logAudit swallows its own errors, and a failed statement inside a transaction turns
    // COMMIT into a silent ROLLBACK while this script would still print APPLIED (playbook #48).
    for (const [projectId, t] of touched)
      await client.query(
        `INSERT INTO audit_log (user_id, company_id, action, table_name, record_id, new_values)
         VALUES ($1, $2, 'backfill_direct_delivery_cost', 'projects', $3, $4::jsonb)`,
        [
          actorId,
          t.companyId,
          projectId,
          JSON.stringify({
            relabeled: t.relabeled,
            repriced: t.repriced,
            offsets: t.offsets,
            materialReturns: t.material,
          }),
        ],
      )
    await client.query('COMMIT')

    // Read the COMMITTED state on a different connection before saying it worked.
    const committed = await planBackfill(pool, opts.company)
    const stillWrong =
      committed.relabel.length +
      committed.offsets.length +
      committed.material.length +
      (opts.reprice ? committed.reprice.length : 0)
    if (stillWrong > 0)
      throw new Error(`${stillWrong} rows are still wrong after COMMIT; check the database`)
    const audited = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM audit_log
        WHERE action = 'backfill_direct_delivery_cost' AND user_id = $1 AND record_id = ANY($2::uuid[])
          AND created_at >= $3::timestamptz`,
      [actorId, [...touched.keys()], startedAt],
    )
    if (parseInt(audited.rows[0].n, 10) < touched.size)
      throw new Error('The audit rows are missing after COMMIT; check the database')
    return { applied: true, plan }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw e
  } finally {
    client.release()
  }
}

function printReport(r: BackfillReport, reprice: boolean): void {
  const p = r.plan
  const head = (s: string) => {
    console.log(`\n== ${s} ==`)
  }
  head(`1. relabel: ${p.relabel.length} direct-delivery cost rows on a non-IQD line labelled IQD`)
  const byCompany = new Map<string, { n: number; sum: number }>()
  for (const x of p.relabel) {
    const e = byCompany.get(`${x.company} ${x.to_label}`) ?? { n: 0, sum: 0 }
    e.n += 1
    e.sum += parseFloat(x.amount)
    byCompany.set(`${x.company} ${x.to_label}`, e)
  }
  for (const [k, v] of byCompany)
    console.log(`   ${k.padEnd(34)} ${String(v.n).padStart(4)} rows, ${v.sum.toFixed(2)} in total`)
  head(
    `2. reprice${reprice ? '' : ' (NOT done: add --reprice)'}: ${p.reprice.length} rows that differ from received qty x price`,
  )
  for (const x of p.reprice.slice(0, 30))
    console.log(
      `   ${x.company.padEnd(20)} ${x.po_number.padEnd(16)} line ${String(x.ln).padStart(2)}  ${x.ccy}  posted ${x.posted} -> ${x.new_amount}`,
    )
  head(
    `3. offsets: ${p.offsets.length} approved or credited vendor returns that never came off the project`,
  )
  for (const x of p.offsets)
    console.log(
      `   ${x.company.padEnd(20)} ${x.return_number.padEnd(22)} ${x.status.padEnd(9)} -${x.value} ${x.currency_code}`,
    )
  head(
    `4. material returns: ${p.material.length} offsets to relabel, ${p.materialAmbiguous.length} only reported`,
  )
  for (const x of p.material)
    console.log(`   ${x.company.padEnd(20)} ${x.amount} ${x.from_label} -> ${x.to_label}`)
  for (const x of p.materialAmbiguous)
    console.log(`   ${x.company.padEnd(20)} ${x.cost_id}  (${x.why})`)
  console.log(
    `\n${r.applied ? 'APPLIED (verified by a second read)' : 'DRY RUN (nothing written)'}` +
      (r.applied
        ? ''
        : '. Re-run with --apply --actor-email <admin email> to make items 1, 3 and 4 (and 2 with --reprice).'),
  )
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const valueOf = (flag: string): string | undefined => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }
  const apply = args.includes('--apply')
  const reprice = args.includes('--reprice')
  const actorEmail = valueOf('--actor-email')
  const company = valueOf('--company')
  try {
    const report = await backfillDirectDeliveryCost({
      apply,
      reprice,
      ...(actorEmail ? { actorEmail } : {}),
      ...(company ? { company } : {}),
    })
    printReport(report, reprice)
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
