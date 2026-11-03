// One-off consolidation (playbook #48): the group now keeps ONE inventory, in the central warehouse
// company (Nishtimani Factory). Each company used to hold its own stock; whatever is still sitting in
// another company's real locations (Nishtimani Yakam: 15 rows / 54 units in "Main Warehouse" on
// 3 Nov) is moved into the central company's warehouse so the group has a single place to look.
//
// It is a plain re-assignment, NOT an inter-company sale: no bill, no transfer price, no journal
// entry and no inter-company record. Each row becomes two ordinary stock-ledger entries (stock_moves),
// one out of the source company and one into the central company, both at the row's own average cost
// and currency so the stock keeps its value, linked by one shared run id and tagged
// 'company_consolidation'. The item's own standard cost is untouched, so no Cost Change Approval is raised.
// The system values stock at its LAST cost (an incoming move's cost replaces the location's cost), so
// when the destination location already holds the item, the incoming entry uses the destination's own
// cost and currency instead: the existing stock there is never re-priced by a re-assignment.
//
// Dry run by default: reads, prints exactly what it would move and anything that stops it, writes
// nothing. `--apply` writes the whole company in ONE transaction, or nothing at all. A row it cannot
// move safely (reserved for a document, lot-tracked, negative, or an item the central company does not
// own) refuses the whole company and says why, unless:
//   --skip-blocked        moves every row that CAN move and leaves the blocked rows where they are
//                         (reported as LEFT BEHIND; run it again once they are unblocked).
//   --create-missing-items  copies an item the central company does not own into its catalog (name,
//                         Arabic name, description, category, store, unit, storable flag, active flag,
//                         cost and cost currency; not reorder levels or market price) and moves the
//                         stock under the copy. The copy keeps the source SKU if the central company
//                         has no item with it, otherwise it takes the next number of the central
//                         company's own store sequence (the same numbering as the Add Product form).
// Items are never matched across companies by SKU (the same SKU is a different item in two
// catalogs), so a copy is always a NEW item. Running it twice moves nothing the second time.
//
// Run on the server, from the gateway folder, after sourcing the app's .env:
//   node dist/scripts/consolidate-stock-into-central.js --company "Nishtimani Yakam" --create-missing-items --skip-blocked
//   node dist/scripts/consolidate-stock-into-central.js --company "Nishtimani Yakam" --create-missing-items --skip-blocked --apply --actor-email you@company.com
// (--to-company / --to-location only if there is not exactly one central company / one warehouse.)
/* eslint-disable no-console -- a command-line script: printing is its output */
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import {
  pool,
  nextDocumentNumber,
  getProductStoreCategoryPrefix,
  PRODUCT_CATEGORY_SKU_PREFIXES,
  type PoolClient,
} from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'

export const CONSOLIDATION_SOURCE_TYPE = 'company_consolidation'

export interface ConsolidateOptions {
  // The company whose stock is moved out: its exact name or its id.
  company: string
  // Defaults to the one company flagged is_central_warehouse.
  toCompany?: string
  // Defaults to the destination company's one active warehouse.
  toLocation?: string
  // Copy items the destination does not own into its catalog instead of refusing them.
  createMissingItems?: boolean
  // Move what can move and leave blocked rows behind, instead of refusing the whole company.
  skipBlocked?: boolean
  apply: boolean
  actorEmail?: string
}

export interface PlannedMove {
  sku: string
  item: string
  fromLocation: string
  qty: string
  unitCost: string
  currency: string
  value: string
  // Set when the destination already holds this item: the incoming entry uses ITS cost, not the above.
  destinationKeeps?: { unitCost: string; currency: string }
  // Set when the stock lands under a new copy of the item in the destination catalog.
  intoSku?: string
}

export interface PlannedCopy {
  fromSku: string
  item: string
  toSku: string
  active: boolean
}

export interface ConsolidateReport {
  company: string
  toCompany: string
  toLocation: string
  status: 'planned' | 'moved' | 'nothing-to-do' | 'refused'
  // Why rows are not moved: what refused the run, or (with --skip-blocked) what was left behind.
  problems: string[]
  moves: PlannedMove[]
  copies: PlannedCopy[]
  // Set once applied: the id both ledger entries of every row carry.
  runId?: string
}

interface CompanyRow {
  id: string
  name: string
}

interface BalanceRow {
  product_id: string
  location_id: string
  lot_id: string | null
  qty_on_hand: string
  qty_reserved: string
  average_cost: string
  currency: string
  value: string
  dest_cost: string | null
  dest_currency: string | null
  sku: string
  item: string
  name_ar: string | null
  description: string | null
  category: string | null
  sub_category: string | null
  uom: string
  is_storable: boolean
  is_active: boolean
  standard_cost: string
  cost_currency: string | null
  product_company_id: string
  product_company_name: string
  location_name: string
}

async function findCompany(ref: string): Promise<CompanyRow> {
  const r = await pool.query<CompanyRow>(
    `SELECT id, name FROM companies WHERE id::text = $1 OR lower(name) = lower($1)`,
    [ref.trim()],
  )
  if (r.rows.length === 0) throw new Error(`Company ${ref} was not found`)
  if (r.rows.length > 1) throw new Error(`More than one company matches ${ref}; use its id`)
  return r.rows[0]
}

async function findCentralCompany(): Promise<CompanyRow> {
  const r = await pool.query<CompanyRow>(
    `SELECT id, name FROM companies WHERE is_central_warehouse = true ORDER BY name`,
  )
  if (r.rows.length !== 1)
    throw new Error(
      r.rows.length === 0
        ? 'No company is flagged as the central warehouse; name the destination with --to-company'
        : `${r.rows.length} companies are flagged as the central warehouse (${r.rows.map((c) => c.name).join(', ')}); name one with --to-company`,
    )
  return r.rows[0]
}

async function findDestinationLocation(
  company: CompanyRow,
  ref?: string,
): Promise<{ id: string; name: string }> {
  const r = await pool.query<{ id: string; name: string; type: string }>(
    `SELECT id, name, type FROM stock_locations
      WHERE company_id = $1 AND is_active = true AND type NOT IN ('virtual_in','virtual_out')
        AND ($2::text IS NULL OR id::text = $2 OR lower(name) = lower($2))
      ORDER BY name`,
    [company.id, ref ?? null],
  )
  if (ref) {
    if (r.rows.length !== 1)
      throw new Error(`${ref} is not exactly one active location of ${company.name}`)
    return r.rows[0]
  }
  const warehouses = r.rows.filter((l) => l.type === 'warehouse')
  if (warehouses.length !== 1)
    throw new Error(
      `${company.name} has ${warehouses.length} active warehouses; name the destination with --to-location`,
    )
  return warehouses[0]
}

// Every real (non-virtual) stock row the company still holds, with the money worked out in SQL.
async function loadRows(
  client: PoolClient,
  companyId: string,
  destinationLocationId: string,
  lock: boolean,
): Promise<BalanceRow[]> {
  const r = await client.query<BalanceRow>(
    `SELECT sb.product_id, sb.location_id, sb.lot_id, sb.qty_on_hand, sb.qty_reserved, sb.average_cost,
            btrim(COALESCE(sb.last_cost_currency, p.cost_currency, 'IQD')) AS currency,
            ROUND(sb.qty_on_hand * sb.average_cost, 4) AS value,
            dst.average_cost AS dest_cost, btrim(dst.last_cost_currency) AS dest_currency,
            p.sku, p.name AS item, p.name_ar, p.description, p.category, p.sub_category, p.uom,
            p.is_storable, p.is_active, p.standard_cost, btrim(p.cost_currency) AS cost_currency,
            p.company_id AS product_company_id,
            pc.name AS product_company_name, sl.name AS location_name
       FROM stock_balances sb
       JOIN stock_locations sl ON sl.id = sb.location_id
       JOIN products p ON p.id = sb.product_id
       JOIN companies pc ON pc.id = p.company_id
       LEFT JOIN stock_balances dst
              ON dst.product_id = sb.product_id AND dst.location_id = $2 AND dst.lot_id IS NULL
             AND dst.qty_on_hand > 0 AND dst.average_cost > 0
      WHERE sl.company_id = $1 AND sl.type NOT IN ('virtual_in','virtual_out')
        AND (sb.qty_on_hand <> 0 OR sb.qty_reserved <> 0)
      ORDER BY p.sku, sl.name
      ${lock ? 'FOR UPDATE OF sb' : ''}`,
    [companyId, destinationLocationId],
  )
  return r.rows
}

// The cost and currency the incoming entry carries: the destination's own when it already holds the item.
function incomingCost(row: BalanceRow): { unitCost: string; currency: string } {
  return row.dest_cost
    ? { unitCost: row.dest_cost, currency: row.dest_currency ?? row.currency }
    : { unitCost: row.average_cost, currency: row.currency }
}

interface Classified {
  movable: BalanceRow[]
  // One entry per row that cannot move now, with the reasons in plain words.
  blocked: string[]
  blockedRows: number
}

function classify(
  rows: BalanceRow[],
  destination: CompanyRow,
  createMissingItems: boolean,
): Classified {
  const movable: BalanceRow[] = []
  const blocked: string[] = []
  let blockedRows = 0
  for (const row of rows) {
    const label = `${row.sku} ${row.item} at ${row.location_name}`
    const reasons: string[] = []
    if (row.lot_id) reasons.push(`${label}: lot-tracked stock, move it by hand`)
    if (parseFloat(row.qty_on_hand) < 0)
      reasons.push(`${label}: negative balance (${row.qty_on_hand}), correct it first`)
    if (parseFloat(row.qty_reserved) > 0)
      reasons.push(
        `${label}: ${row.qty_reserved} reserved for a document, release or finish it first`,
      )
    if (row.product_company_id !== destination.id && !createMissingItems)
      reasons.push(
        `${label}: the item belongs to ${row.product_company_name}, not ${destination.name}; ` +
          `it is never matched by SKU, so create or map it in ${destination.name} first ` +
          `(or run with --create-missing-items to copy it)`,
      )
    if (reasons.length > 0) {
      blocked.push(...reasons)
      blockedRows += 1
    } else movable.push(row)
  }
  return { movable, blocked, blockedRows }
}

// What the next number of a sequence WILL be, without taking it (the dry run must not use up numbers).
async function previewDocumentNumber(
  client: PoolClient,
  companyId: string,
  docType: string,
  fallbackPrefix: string,
  alreadyPreviewed: number,
): Promise<string> {
  const r = await client.query<{
    prefix: string
    next_number: number
    pad_length: number
    year_in_number: boolean
    separator: string
  }>(
    `SELECT prefix, next_number, pad_length, year_in_number, separator
       FROM document_sequences WHERE company_id = $1 AND doc_type = $2`,
    [companyId, docType],
  )
  if (r.rows.length === 0) return `${fallbackPrefix}-(number given when applied)`
  const row = r.rows[0]
  const num = String(row.next_number + alreadyPreviewed).padStart(row.pad_length, '0')
  const sep = row.separator
  return row.year_in_number
    ? `${row.prefix}${sep}${new Date().getFullYear()}${sep}${num}`
    : `${row.prefix}${sep}${num}`
}

// The SKU a copy gets in the destination: the source SKU when the destination has no item with it,
// otherwise the next number of the destination's own store sequence (same rule as createProduct).
async function skuForCopy(
  client: PoolClient,
  destination: CompanyRow,
  row: BalanceRow,
  apply: boolean,
  previewed: Map<string, number>,
): Promise<string> {
  const taken = async (sku: string): Promise<boolean> =>
    (
      await client.query(`SELECT 1 FROM products WHERE company_id = $1 AND sku = $2`, [
        destination.id,
        sku,
      ])
    ).rows.length > 0
  if (!(await taken(row.sku))) return row.sku

  const store = row.sub_category
    ? await getProductStoreCategoryPrefix(destination.id, row.sub_category)
    : null
  const generated =
    store ?? (row.category ? PRODUCT_CATEGORY_SKU_PREFIXES[row.category] : undefined)
  const docType = generated ? `product_${generated.slug}` : 'product'
  const fallback = generated ? generated.prefix : 'PRD'
  if (!apply) {
    const n = previewed.get(docType) ?? 0
    previewed.set(docType, n + 1)
    return previewDocumentNumber(client, destination.id, docType, fallback, n)
  }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const sku = await nextDocumentNumber(destination.id, docType, fallback)
    if (!(await taken(sku))) return sku
  }
  throw new Error(`Could not find a free SKU for ${row.sku} in ${destination.name}`)
}

function toMoves(rows: BalanceRow[], copiedSku: Map<string, string>): PlannedMove[] {
  return rows.map((r) => {
    const into = incomingCost(r)
    const differs =
      into.currency !== r.currency ||
      Math.abs(parseFloat(into.unitCost) - parseFloat(r.average_cost)) > 0.00005
    const intoSku = copiedSku.get(r.product_id)
    return {
      sku: r.sku,
      item: r.item,
      fromLocation: r.location_name,
      qty: r.qty_on_hand,
      unitCost: r.average_cost,
      currency: r.currency,
      value: r.value,
      ...(differs ? { destinationKeeps: into } : {}),
      ...(intoSku ? { intoSku } : {}),
    }
  })
}

function toCopies(rows: BalanceRow[], copiedSku: Map<string, string>): PlannedCopy[] {
  const seen = new Set<string>()
  const copies: PlannedCopy[] = []
  for (const r of rows) {
    const toSku = copiedSku.get(r.product_id)
    if (!toSku || seen.has(r.product_id)) continue
    seen.add(r.product_id)
    copies.push({ fromSku: r.sku, item: r.item, toSku, active: r.is_active })
  }
  return copies
}

async function ensureVirtualLocation(
  client: PoolClient,
  companyId: string,
  type: 'virtual_in' | 'virtual_out',
): Promise<string> {
  const found = await client.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type=$2 AND is_active=true LIMIT 1`,
    [companyId, type],
  )
  if (found.rows[0]) return found.rows[0].id
  const made = await client.query<{ id: string }>(
    `INSERT INTO stock_locations (company_id,name,type,is_active) VALUES ($1,$2,$3,true) RETURNING id`,
    [companyId, type === 'virtual_in' ? 'Virtual Receipts' : 'Virtual Consumption', type],
  )
  return made.rows[0].id
}

async function resolveActor(email: string, companyIds: string[]): Promise<string> {
  const u = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE lower(email) = lower($1)`,
    [email],
  )
  const actorId = u.rows[0]?.id
  if (!actorId) throw new Error(`No ERP user has the email ${email}`)
  const roles = await pool.query<{ company_id: string; role: string }>(
    `SELECT company_id, role FROM user_company_roles
      WHERE user_id=$1 AND is_active=true AND role IN ('system_admin','company_admin')`,
    [actorId],
  )
  // A system admin reaches every company; a company admin must be one in BOTH companies.
  const isSystemAdmin = roles.rows.some((r) => r.role === 'system_admin')
  const adminOf = new Set(roles.rows.map((r) => r.company_id))
  if (!isSystemAdmin && !companyIds.every((id) => adminOf.has(id)))
    throw new Error(`${email} is not a system administrator or an administrator of both companies`)
  return actorId
}

export async function consolidateStockIntoCentral(
  opts: ConsolidateOptions,
): Promise<ConsolidateReport> {
  const source = await findCompany(opts.company)
  const destination = opts.toCompany
    ? await findCompany(opts.toCompany)
    : await findCentralCompany()
  if (source.id === destination.id)
    throw new Error(`${source.name} is the destination company: there is nothing to consolidate`)
  const toLocation = await findDestinationLocation(destination, opts.toLocation)
  const createMissingItems = opts.createMissingItems === true
  const skipBlocked = opts.skipBlocked === true

  let actorId = ''
  if (opts.apply) {
    if (!opts.actorEmail)
      throw new Error(
        '--apply needs --actor-email (the administrator the moves are recorded under)',
      )
    actorId = await resolveActor(opts.actorEmail, [source.id, destination.id])
  }

  const base = { company: source.name, toCompany: destination.name, toLocation: toLocation.name }
  const client = await pool.connect()
  try {
    if (opts.apply) await client.query('BEGIN')
    // With --apply the rows are locked, so nothing can be reserved or issued from them while this runs.
    const rows = await loadRows(client, source.id, toLocation.id, opts.apply)
    if (rows.length === 0) {
      if (opts.apply) await client.query('ROLLBACK')
      return { ...base, status: 'nothing-to-do', problems: [], moves: [], copies: [] }
    }
    const { movable, blocked, blockedRows } = classify(rows, destination, createMissingItems)

    // Without --skip-blocked one blocked row refuses everything; with it, only if nothing can move.
    if ((blockedRows > 0 && !skipBlocked) || movable.length === 0) {
      if (opts.apply) await client.query('ROLLBACK')
      return {
        ...base,
        status: 'refused',
        problems: blocked,
        moves: toMoves(rows, new Map()),
        copies: [],
      }
    }

    // One copy per distinct item the destination does not own, however many stock rows it has.
    const foreign = new Map<string, BalanceRow>()
    for (const row of movable)
      if (row.product_company_id !== destination.id && !foreign.has(row.product_id))
        foreign.set(row.product_id, row)
    const previewed = new Map<string, number>()
    const copiedSku = new Map<string, string>()
    const copiedId = new Map<string, string>()
    for (const [productId, row] of foreign) {
      const sku = await skuForCopy(client, destination, row, opts.apply, previewed)
      copiedSku.set(productId, sku)
      if (!opts.apply) continue
      const made = await client.query<{ id: string }>(
        `INSERT INTO products
           (company_id, sku, name, name_ar, description, category, sub_category, uom, valuation_method,
            standard_cost, cost_currency, is_storable, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'last_cost',$9::numeric,$10,$11,$12) RETURNING id`,
        [
          destination.id,
          sku,
          row.item,
          row.name_ar,
          row.description,
          row.category,
          row.sub_category,
          row.uom,
          row.standard_cost,
          row.cost_currency,
          row.is_storable,
          row.is_active,
        ],
      )
      copiedId.set(productId, made.rows[0].id)
    }

    if (!opts.apply) {
      return {
        ...base,
        status: 'planned',
        problems: blocked,
        moves: toMoves(movable, copiedSku),
        copies: toCopies(movable, copiedSku),
      }
    }

    const virtualOut = await ensureVirtualLocation(client, source.id, 'virtual_out')
    const virtualIn = await ensureVirtualLocation(client, destination.id, 'virtual_in')
    const runId = randomUUID()
    const insertMove = `INSERT INTO stock_moves
        (company_id,product_id,from_location_id,to_location_id,moved_at,qty,unit_cost,total_cost,currency_code,source_type,source_id,notes,moved_by)
      VALUES ($1,$2,$3,$4,NOW(),$5::numeric,$6::numeric,ROUND($5::numeric * $6::numeric, 4),$7,$8,$9,$10,$11)`
    for (const row of movable) {
      const into = incomingCost(row)
      await client.query(insertMove, [
        source.id,
        row.product_id,
        row.location_id,
        virtualOut,
        row.qty_on_hand,
        row.average_cost,
        row.currency,
        CONSOLIDATION_SOURCE_TYPE,
        runId,
        `Stock consolidated into ${destination.name} (no charge)`,
        actorId,
      ])
      await client.query(insertMove, [
        destination.id,
        copiedId.get(row.product_id) ?? row.product_id,
        virtualIn,
        toLocation.id,
        row.qty_on_hand,
        into.unitCost,
        into.currency,
        CONSOLIDATION_SOURCE_TYPE,
        runId,
        `Stock consolidated from ${source.name} (no charge)`,
        actorId,
      ])
    }

    // Exactly the blocked rows (and nothing else) may still be in the source company.
    const left = await loadRows(client, source.id, toLocation.id, false)
    if (left.length !== blockedRows)
      throw new Error(
        `${left.length} stock rows are still in ${source.name} after the move, expected ${blockedRows}`,
      )
    const copies = toCopies(movable, copiedSku)
    for (const companyId of [source.id, destination.id]) {
      await logAudit({
        userId: actorId,
        companyId,
        action: 'consolidate_stock_into_central',
        tableName: 'companies',
        recordId: source.id,
        newValues: {
          runId,
          from: source.name,
          to: destination.name,
          rows: movable.length,
          copies: copies.map((c) => ({ from: c.fromSku, to: c.toSku })),
          leftBehind: blockedRows,
        },
        client,
      })
    }
    await client.query('COMMIT')
    // logAudit swallows its own errors, and a failed statement inside a transaction turns COMMIT
    // into a silent ROLLBACK, so look at the committed data before saying it worked.
    const afterCommit = await loadRows(client, source.id, toLocation.id, false)
    if (afterCommit.length !== blockedRows)
      throw new Error(
        `The move did not commit: ${afterCommit.length} stock rows are in ${source.name}, expected ${blockedRows}`,
      )
    for (const c of copies) {
      const exists = await client.query(`SELECT 1 FROM products WHERE company_id=$1 AND sku=$2`, [
        destination.id,
        c.toSku,
      ])
      if (exists.rows.length === 0)
        throw new Error(
          `The move did not commit: item ${c.toSku} is missing in ${destination.name}`,
        )
    }
    return {
      ...base,
      status: 'moved',
      problems: blocked,
      moves: toMoves(movable, copiedSku),
      copies,
      runId,
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw e
  } finally {
    client.release()
  }
}

function printReport(r: ConsolidateReport, apply: boolean): void {
  console.log(
    `\n${r.company} -> ${r.toCompany} (${r.toLocation}): ${r.status.toUpperCase()}` +
      (r.runId ? `  [run ${r.runId}]` : ''),
  )
  for (const c of r.copies) {
    console.log(
      `   ${apply ? 'NEW ITEM' : 'WOULD CREATE'} in ${r.toCompany}: ${c.toSku}  (copy of ${c.fromSku}) ${c.item}` +
        (c.active ? '' : '  [inactive, like the original]'),
    )
  }
  for (const m of r.moves) {
    console.log(
      `   ${m.sku.padEnd(12)} ${m.item.slice(0, 40).padEnd(40)} ${m.qty.padStart(10)}  from ${m.fromLocation}` +
        `  @ ${m.unitCost} ${m.currency}  = ${m.value} ${m.currency}` +
        (m.intoSku ? `  [lands as ${m.intoSku}]` : '') +
        (m.destinationKeeps
          ? `  [${r.toCompany} keeps its own cost ${m.destinationKeeps.unitCost} ${m.destinationKeeps.currency}]`
          : ''),
    )
  }
  // A refused run moved nothing; a run that did move (or would) only leaves these rows where they are.
  const label = r.status === 'refused' ? 'PROBLEM' : 'LEFT BEHIND'
  for (const p of r.problems) console.log(`   ${label}: ${p}`)
  // Never added across currencies: one total per currency.
  const totals = new Map<string, number>()
  for (const m of r.moves)
    totals.set(m.currency, (totals.get(m.currency) ?? 0) + parseFloat(m.value))
  const units = r.moves.reduce((n, m) => n + parseFloat(m.qty), 0)
  // Only a run that really moved something may say "applied": a refused --apply writes nothing.
  const headline =
    r.status === 'moved'
      ? 'APPLIED'
      : r.status === 'refused'
        ? 'REFUSED (nothing written)'
        : r.status === 'nothing-to-do'
          ? 'NOTHING TO DO (nothing written)'
          : 'DRY RUN (nothing written)'
  console.log(
    `\n${headline}: ${r.moves.length} stock rows, ${units} units` +
      (totals.size > 0
        ? ` (value ${[...totals].map(([c, v]) => `${v.toFixed(4)} ${c}`).join(' + ')})`
        : '') +
      (r.copies.length > 0 ? `, ${r.copies.length} new items` : '') +
      (apply || r.status !== 'planned'
        ? ''
        : '. Re-run with --apply --actor-email <admin email> to move it.'),
  )
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const valueOf = (flag: string): string | undefined => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }
  const company = valueOf('--company')
  const toCompany = valueOf('--to-company')
  const toLocation = valueOf('--to-location')
  const actorEmail = valueOf('--actor-email')
  const apply = args.includes('--apply')
  try {
    if (!company) throw new Error('--company "<name or id>" is required')
    const report = await consolidateStockIntoCentral({
      company,
      apply,
      createMissingItems: args.includes('--create-missing-items'),
      skipBlocked: args.includes('--skip-blocked'),
      ...(toCompany ? { toCompany } : {}),
      ...(toLocation ? { toLocation } : {}),
      ...(actorEmail ? { actorEmail } : {}),
    })
    printReport(report, apply)
    process.exitCode = report.status === 'refused' ? 2 : 0
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
