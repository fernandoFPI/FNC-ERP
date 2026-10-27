// One-off backfill (playbook #44): gives requisitions that were approved BEFORE every stock-covered
// line got its draft Store Out the drafts they are owed. Since August a project requisition
// "delivered to inventory" got none, and a line a buyer resolved from stock at Items Bought never
// got one at any destination, so those lines sit reserved with nothing to confirm and the
// requisition can never complete (REQ-2026-0075 and four others).
//
// It reuses the one function the app itself now uses (coverRequisitionStockLines), which covers only
// the part of each stock-covered line that no non-cancelled Store Out line covers yet, so running it
// twice creates nothing the second time. It creates DRAFT Store Outs only: no stock moves, no project
// cost, no status change and no change to any reservation until a person confirms a draft.
//
// Dry run by default: reads, prints the exact lines it would create and any reason it would refuse,
// and writes nothing (it does not even take a Store Out number). `--apply` writes, one transaction
// per requisition, and refuses a requisition whose reservation is smaller than what its drafts would
// need (confirming would then fail with "Reservation mismatch").
//
// Run on the server, from the gateway folder, after sourcing the app's .env:
//   node dist/scripts/backfill-stock-store-outs.js --company "Nishtimani Factory" --requisitions REQ-2026-0075,REQ-2026-0047
//   node dist/scripts/backfill-stock-store-outs.js --company ... --requisitions ... --apply --actor-email you@company.com
// (--company is needed whenever more than one company has a requisition with that number.)
/* eslint-disable no-console -- a command-line script: printing is its output */
import { pathToFileURL } from 'node:url'
import { pool, type PoolClient } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { coverRequisitionStockLines, uncoveredRequisitionStockLines } from '../graphql/resolvers.js'

// Post-approval, not finished: the only states a requisition can be waiting on a Store Out in.
const OPEN_STATUSES = ['approved', 'items_bought', 'sourcing']

export interface PlannedLine {
  line: number
  item: string
  qty: number
  location: string
  estimatedUnitCost: number
  costCurrency: string | null
  note?: string
}

export interface RequisitionReport {
  requisitionNumber: string
  company: string
  status: 'planned' | 'created' | 'nothing-to-do' | 'skipped' | 'refused'
  reason?: string
  lines: PlannedLine[]
  storeOuts: string[]
}

export interface BackfillOptions {
  requisitionNumbers: string[]
  apply: boolean
  actorEmail?: string
  // Requisition numbers repeat across companies, so name the company (its exact name or its id).
  company?: string
}

interface ReqRow {
  id: string
  company_id: string
  requisition_number: string
  status: string
  project_id: string | null
  company_name: string
}

async function findRequisition(number: string, company?: string): Promise<ReqRow> {
  const r = await pool.query<ReqRow>(
    `SELECT r.id, r.company_id, r.requisition_number, r.status, r.project_id, c.name AS company_name
       FROM requisitions r JOIN companies c ON c.id = r.company_id
      WHERE r.requisition_number = $1
        AND ($2::text IS NULL OR c.id::text = $2 OR lower(c.name) = lower($2))`,
    [number, company ?? null],
  )
  if (r.rows.length === 0)
    throw new Error(`Requisition ${number} was not found${company ? ` in company ${company}` : ''}`)
  if (r.rows.length > 1)
    throw new Error(
      `More than one company has a requisition numbered ${number} (${r.rows.map((x) => x.company_name).join(', ')}); name one with --company`,
    )
  return r.rows[0]
}

// What the drafts would contain, with the same cost rule the draft line uses (the line's store price
// if set, otherwise the average cost at the source location), plus the reasons confirming them would
// fail. Reads only.
async function planFor(
  client: PoolClient,
  req: ReqRow,
): Promise<{ lines: PlannedLine[]; problems: string[] }> {
  const uncovered = await uncoveredRequisitionStockLines(client, req.id)
  const lines: PlannedLine[] = []
  const wanted = new Map<
    string,
    { qty: number; item: string; productId: string; locationId: string }
  >()

  for (const l of uncovered) {
    const qty = parseFloat(String(l.uncovered_qty))
    const productId = (l.product_id as string | null) ?? null
    const locationId = (l.source_location_id as string | null) ?? null
    const info = await client.query<{
      item: string
      location: string | null
      unit_cost: string
      cost_currency: string | null
    }>(
      `SELECT COALESCE(p.name, pl.description, 'item') AS item,
              (SELECT sl.name FROM stock_locations sl WHERE sl.id = pl.source_location_id) AS location,
              COALESCE(NULLIF(pl.store_price, 0),
                       (SELECT sb.average_cost FROM stock_balances sb
                         WHERE sb.product_id = pl.product_id AND sb.location_id = pl.source_location_id LIMIT 1),
                       0) AS unit_cost,
              CASE WHEN NULLIF(pl.store_price, 0) IS NOT NULL THEN pl.store_price_currency
                   ELSE (SELECT sb.last_cost_currency FROM stock_balances sb
                          WHERE sb.product_id = pl.product_id AND sb.location_id = pl.source_location_id LIMIT 1)
              END AS cost_currency
         FROM po_lines pl LEFT JOIN products p ON p.id = pl.product_id
        WHERE pl.id = $1`,
      [l.id],
    )
    const row = info.rows[0]
    lines.push({
      line: lines.length + 1,
      item: row.item,
      qty,
      location: row.location ?? '(company default warehouse)',
      estimatedUnitCost: parseFloat(row.unit_cost),
      costCurrency: row.cost_currency ?? null,
      ...(productId
        ? {}
        : { note: 'no catalog product: queued for cataloguing, no Store Out line' }),
    })
    if (productId && locationId) {
      const key = `${productId}|${locationId}`
      const cur = wanted.get(key)
      if (cur) cur.qty += qty
      else wanted.set(key, { qty, item: row.item, productId, locationId })
    }
    if (productId && !locationId)
      lines[lines.length - 1].note = 'no source location on the line: the default warehouse is used'
  }

  const problems: string[] = []
  for (const w of wanted.values()) {
    const bal = await client.query<{ qty_on_hand: string; qty_reserved: string }>(
      `SELECT qty_on_hand, qty_reserved FROM stock_balances
        WHERE product_id=$1 AND location_id=$2 AND lot_id IS NULL`,
      [w.productId, w.locationId],
    )
    const onHand = parseFloat(bal.rows[0]?.qty_on_hand ?? '0')
    const reserved = parseFloat(bal.rows[0]?.qty_reserved ?? '0')
    if (reserved + 0.0001 < w.qty)
      problems.push(`${w.item}: only ${reserved} reserved, ${w.qty} needed (confirming would fail)`)
    if (onHand + 0.0001 < w.qty)
      problems.push(`${w.item}: only ${onHand} on hand, ${w.qty} needed (confirming would fail)`)
  }
  return { lines, problems }
}

async function resolveActor(email: string, companyIds: string[]): Promise<string> {
  const u = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE lower(email) = lower($1)`,
    [email],
  )
  const actorId = u.rows[0]?.id
  if (!actorId) throw new Error(`No ERP user has the email ${email}`)
  for (const companyId of new Set(companyIds)) {
    const role = await pool.query(
      `SELECT 1 FROM user_company_roles
        WHERE user_id=$1 AND company_id=$2 AND is_active=true AND role IN ('system_admin','company_admin')`,
      [actorId, companyId],
    )
    if (role.rows.length === 0)
      throw new Error(
        `${email} is not an active administrator of the company that owns these requisitions`,
      )
  }
  return actorId
}

export async function backfillStockStoreOuts(opts: BackfillOptions): Promise<RequisitionReport[]> {
  if (opts.requisitionNumbers.length === 0) throw new Error('Name at least one requisition')
  const reqs: ReqRow[] = []
  for (const n of opts.requisitionNumbers) reqs.push(await findRequisition(n.trim(), opts.company))

  let actorId = ''
  if (opts.apply) {
    if (!opts.actorEmail)
      throw new Error(
        '--apply needs --actor-email (the administrator the drafts are recorded under)',
      )
    actorId = await resolveActor(
      opts.actorEmail,
      reqs.map((r) => r.company_id),
    )
  }

  const reports: RequisitionReport[] = []
  for (const req of reqs) {
    const base = {
      requisitionNumber: req.requisition_number,
      company: req.company_name,
      storeOuts: [] as string[],
    }
    if (!OPEN_STATUSES.includes(req.status)) {
      reports.push({
        ...base,
        status: 'skipped',
        reason: `status is '${req.status}'; only open requisitions (${OPEN_STATUSES.join(', ')}) are backfilled`,
        lines: [],
      })
      continue
    }

    const client = await pool.connect()
    try {
      if (!opts.apply) {
        const plan = await planFor(client, req)
        reports.push({
          ...base,
          status:
            plan.lines.length === 0
              ? 'nothing-to-do'
              : plan.problems.length > 0
                ? 'refused'
                : 'planned',
          ...(plan.problems.length > 0 ? { reason: plan.problems.join('; ') } : {}),
          lines: plan.lines,
        })
        continue
      }

      await client.query('BEGIN')
      // serialise against anyone approving/resolving/cancelling this requisition right now
      const locked = await client.query<ReqRow & { project_id: string | null }>(
        `SELECT r.id, r.company_id, r.requisition_number, r.status, r.project_id, c.name AS company_name
           FROM requisitions r JOIN companies c ON c.id = r.company_id WHERE r.id=$1 FOR UPDATE OF r`,
        [req.id],
      )
      const current = locked.rows[0] as ReqRow
      if (!OPEN_STATUSES.includes(current.status)) {
        await client.query('ROLLBACK')
        reports.push({
          ...base,
          status: 'skipped',
          reason: `status changed to '${current.status}'`,
          lines: [],
        })
        continue
      }
      const plan = await planFor(client, current)
      if (plan.lines.length === 0) {
        await client.query('ROLLBACK')
        reports.push({ ...base, status: 'nothing-to-do', lines: [] })
        continue
      }
      if (plan.problems.length > 0) {
        await client.query('ROLLBACK')
        reports.push({
          ...base,
          status: 'refused',
          reason: plan.problems.join('; '),
          lines: plan.lines,
        })
        continue
      }
      const made = await coverRequisitionStockLines(
        client,
        current as unknown as Record<string, unknown>,
        current.company_id,
        actorId,
      )
      const left = await uncoveredRequisitionStockLines(client, current.id)
      if (left.length > 0)
        throw new Error(
          `${current.requisition_number}: ${left.length} lines still uncovered after the backfill`,
        )
      await logAudit({
        userId: actorId,
        companyId: current.company_id,
        action: 'backfill_stock_store_outs',
        tableName: 'requisitions',
        recordId: current.id,
        newValues: { storeOuts: made.map((m) => m.issueNumber), lines: plan.lines.length },
        client,
      })
      await client.query('COMMIT')
      reports.push({
        ...base,
        status: 'created',
        lines: plan.lines,
        storeOuts: made.map((m) => m.issueNumber),
      })
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw e
    } finally {
      client.release()
    }
  }
  return reports
}

function printReports(reports: RequisitionReport[], apply: boolean): void {
  for (const r of reports) {
    console.log(
      `\n${r.requisitionNumber} (${r.company}): ${r.status.toUpperCase()}${r.reason ? ' - ' + r.reason : ''}`,
    )
    for (const l of r.lines) {
      console.log(
        `   ${String(l.line).padStart(2)}. ${l.item.slice(0, 48).padEnd(48)} ${String(l.qty).padStart(9)}  from ${l.location}` +
          `  ~${l.estimatedUnitCost} ${l.costCurrency ?? '?'} each${l.note ? '  [' + l.note + ']' : ''}`,
      )
    }
    if (r.storeOuts.length > 0) console.log(`   draft Store Out created: ${r.storeOuts.join(', ')}`)
  }
  const lines = reports.reduce((n, r) => n + r.lines.length, 0)
  const units = reports.reduce((n, r) => n + r.lines.reduce((m, l) => m + l.qty, 0), 0)
  console.log(
    `\n${apply ? 'APPLIED' : 'DRY RUN (nothing written)'}: ${reports.length} requisitions, ${lines} lines, ${units} units` +
      (apply ? '' : '. Re-run with --apply --actor-email <admin email> to create the drafts.'),
  )
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const valueOf = (flag: string): string | undefined => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }
  const requisitions = (valueOf('--requisitions') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const apply = args.includes('--apply')
  const actorEmail = valueOf('--actor-email')
  const company = valueOf('--company')
  try {
    const reports = await backfillStockStoreOuts({
      requisitionNumbers: requisitions,
      apply,
      ...(actorEmail ? { actorEmail } : {}),
      ...(company ? { company } : {}),
    })
    printReports(reports, apply)
    process.exitCode = reports.some((r) => r.status === 'refused') ? 2 : 0
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
