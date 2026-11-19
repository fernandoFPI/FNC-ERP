// Temporary stores and store transfers that spend time in transit. Playbook #108, STORE_OUT_EQUIPMENT_PLAN.md phase 2.
//
// A transfer moves stock between two locations of ONE company. Sending takes it out of the From location into the company's transit
// location, so it is neither "on the shelf here" nor "on the shelf there" while the truck drives. Receiving puts what arrived into the To
// location. What did not arrive is written off to Virtual Consumption with the reason on the line, so every unit is always somewhere in
// the ledger and nothing "disappears" the way it does in a spreadsheet. Cancelling a transfer that is still in transit puts it all back.
//
// Everything that decides where stock may go lives here; the resolvers only check who is asking.
import type { PoolClient } from '@fnc-erp/db'
import { QTY_EPSILON, cleanIssuedToText, isDateOnly } from './equipmentReturns.js'
import { stockCostCurrencySql } from './stockIssueCost.js'

/** Goods waiting in a temporary store for longer than this are flagged late. */
export const TEMP_WAIT_DAYS = 7

/** The kinds of location a transfer may start or end at: real places. Never virtual, never the transit location itself. */
export const TRANSFER_ENDPOINT_TYPES = ['warehouse', 'site', 'temporary'] as const

/** A row the statement just returned (an INSERT ... RETURNING): throws a readable error instead of a non-null assertion. */
function mustRow<T>(row: T | undefined): T {
  if (row === undefined) throw new Error('The database returned no row')
  return row
}

export interface TransferLineInput {
  productId: string
  qty: number
  remarks?: string | null
}

export interface SendTransferInput {
  fromLocationId: string
  toLocationId: string
  transferDate?: string | null
  driverName?: string | null
  vehicleNo?: string | null
  waybillNo?: string | null
  reference?: string | null
  notes?: string | null
  lines: TransferLineInput[]
}

export interface ReceiveLineInput {
  lineId: string
  qtyReceived: number
  remarks?: string | null
}

type Client = Pick<PoolClient, 'query'>

/** The company's transit location, made the first time a transfer needs it (one per company, like Virtual Consumption). */
export async function companyTransitLocation(client: Client, companyId: string): Promise<string> {
  const r = await client.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='transit' AND is_active=true ORDER BY created_at LIMIT 1`,
    [companyId],
  )
  if (r.rows[0]) return r.rows[0].id
  const made = await client.query<{ id: string }>(
    `INSERT INTO stock_locations (company_id, name, type, is_active) VALUES ($1,'Transit','transit',true) RETURNING id`,
    [companyId],
  )
  return mustRow(made.rows.at(0)).id
}

async function companyVirtualOut(client: Client, companyId: string): Promise<string> {
  const r = await client.query<{ id: string }>(
    `SELECT id FROM stock_locations WHERE company_id=$1 AND type='virtual_out' AND is_active=true LIMIT 1`,
    [companyId],
  )
  if (r.rows[0]) return r.rows[0].id
  const made = await client.query<{ id: string }>(
    `INSERT INTO stock_locations (company_id, name, type, is_active) VALUES ($1,'Virtual Consumption','virtual_out',true) RETURNING id`,
    [companyId],
  )
  return mustRow(made.rows.at(0)).id
}

/** Throws unless the location is an active warehouse, site or temporary store of this company. Returns its name for messages. */
export async function assertTransferEndpoint(
  client: Client,
  companyId: string,
  locationId: string,
): Promise<string> {
  const r = await client.query<{
    name: string
    type: string
    company_id: string
    is_active: boolean
  }>(`SELECT name, type, company_id, is_active FROM stock_locations WHERE id=$1`, [locationId])
  const loc = r.rows.at(0)
  // another company's location looks like a missing one: a transfer never crosses companies (that is an inter-company transfer)
  if (!loc || loc.company_id !== companyId) throw new Error('Location not found')
  if (!loc.is_active) throw new Error(`${loc.name} is not active`)
  if (!(TRANSFER_ENDPOINT_TYPES as readonly string[]).includes(loc.type))
    throw new Error(
      `${loc.name} is not a place stock can be sent from or to (choose a warehouse, site or temporary store)`,
    )
  return loc.name
}

/** Takes the stock out of the From location into transit, records the transfer and returns its id. Runs inside the caller's transaction. */
export async function sendStoreTransfer(
  client: Client,
  args: { companyId: string; userId: string; number: string; input: SendTransferInput },
): Promise<string> {
  const { companyId, userId, number, input } = args
  if (input.fromLocationId === input.toLocationId) throw new Error('Choose two different locations')
  if (input.lines.length === 0) throw new Error('A transfer needs at least one item')
  if (input.transferDate && !isDateOnly(input.transferDate))
    throw new Error('Transfer date must be a valid date (YYYY-MM-DD)')
  const seen = new Set<string>()
  for (const l of input.lines) {
    if (seen.has(l.productId)) throw new Error('An item can appear only once in a transfer')
    seen.add(l.productId)
    if (!(Number(l.qty) > 0)) throw new Error('Quantity must be greater than 0')
  }
  const driver = cleanIssuedToText(input.driverName, 'Driver', 200)
  const vehicle = cleanIssuedToText(input.vehicleNo, 'Vehicle no.', 100)
  const waybill = cleanIssuedToText(input.waybillNo, 'Waybill', 100)
  const reference = cleanIssuedToText(input.reference, 'Reference', 200)
  const notes = cleanIssuedToText(input.notes, 'Notes', 2000)
  const fromName = await assertTransferEndpoint(client, companyId, input.fromLocationId)
  const toName = await assertTransferEndpoint(client, companyId, input.toLocationId)
  const transitId = await companyTransitLocation(client, companyId)

  const head = await client.query<{ id: string }>(
    `INSERT INTO stock_transfers (company_id, transfer_number, transfer_date, from_location_id, to_location_id, driver_name, vehicle_no, waybill_no, reference, notes, sent_by)
     VALUES ($1,$2,COALESCE($3::date, CURRENT_DATE),$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [
      companyId,
      number,
      input.transferDate ?? null,
      input.fromLocationId,
      input.toLocationId,
      driver,
      vehicle,
      waybill,
      reference,
      notes,
      userId,
    ],
  )
  const transferId = mustRow(head.rows.at(0)).id
  // one lock order for everyone: by product
  const lines = [...input.lines].sort((a, b) =>
    a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0,
  )
  for (const l of lines) {
    const qty = Number(l.qty)
    const bal = await client.query<{ sku: string | null; name: string | null; ccy: string }>(
      `SELECT p.sku, p.name, ${stockCostCurrencySql('p')} AS ccy FROM products p WHERE p.id = $1`,
      [l.productId],
    )
    const row = bal.rows.at(0)
    if (!row) throw new Error('Product not found')
    const label = row.sku ? `${row.sku} (${row.name ?? l.productId})` : (row.name ?? l.productId)
    // the balance row itself, locked, so two transfers cannot both take the last unit
    const locked = await client.query<{
      qty_on_hand: string
      qty_reserved: string
      average_cost: string
    }>(
      `SELECT qty_on_hand, qty_reserved, average_cost FROM stock_balances
        WHERE product_id=$1 AND location_id=$2 AND lot_id IS NULL FOR UPDATE`,
      [l.productId, input.fromLocationId],
    )
    const onHand = parseFloat(locked.rows[0]?.qty_on_hand ?? '0') || 0
    const reserved = parseFloat(locked.rows[0]?.qty_reserved ?? '0') || 0
    const available = onHand - reserved
    if (available + QTY_EPSILON < qty)
      throw new Error(
        `Not enough ${label} at ${fromName}: ${available} available (${onHand} on hand, ${reserved} reserved), ${qty} to send`,
      )
    const unitCost = parseFloat(locked.rows[0]?.average_cost ?? '0') || 0
    await client.query(
      `INSERT INTO stock_transfer_lines (transfer_id, product_id, qty_sent, unit_cost, currency_code, remarks)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        transferId,
        l.productId,
        qty,
        unitCost,
        row.ccy,
        cleanIssuedToText(l.remarks, 'Remarks', 500),
      ],
    )
    await client.query(
      `INSERT INTO stock_moves (company_id,product_id,from_location_id,to_location_id,moved_at,qty,unit_cost,total_cost,currency_code,source_type,source_id,notes,moved_by)
       VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,$8,'store_transfer',$9,$10,$11)`,
      [
        companyId,
        l.productId,
        input.fromLocationId,
        transitId,
        qty,
        unitCost,
        qty * unitCost,
        row.ccy,
        transferId,
        `Transfer ${number} sent: ${fromName} to ${toName}`,
        userId,
      ],
    )
  }
  return transferId
}

/** Puts what arrived into the To location and writes off what did not. Runs inside the caller's transaction. */
export async function receiveStoreTransfer(
  client: Client,
  args: {
    companyId: string
    userId: string
    transferId: string
    receivedDate?: string | null
    receivedByName?: string | null
    lines: ReceiveLineInput[]
  },
): Promise<void> {
  const { companyId, userId, transferId } = args
  if (args.receivedDate && !isDateOnly(args.receivedDate))
    throw new Error('Received date must be a valid date (YYYY-MM-DD)')
  const receivedBy = cleanIssuedToText(args.receivedByName, 'Received by', 200)
  const t = await client.query<{
    transfer_number: string
    status: string
    from_location_id: string
    to_location_id: string
  }>(
    `SELECT transfer_number, status, from_location_id, to_location_id FROM stock_transfers WHERE id=$1 AND company_id=$2 FOR UPDATE`,
    [transferId, companyId],
  )
  const tr = t.rows.at(0)
  if (!tr) throw new Error('Transfer not found')
  if (tr.status !== 'in_transit')
    throw new Error(`This transfer is already ${tr.status.replace('_', ' ')}`)
  const toName = await assertTransferEndpoint(client, companyId, tr.to_location_id)
  const transitId = await companyTransitLocation(client, companyId)
  const lost = await companyVirtualOut(client, companyId)
  const lineRows = await client.query<{
    id: string
    product_id: string
    qty_sent: string
    unit_cost: string
    currency_code: string
  }>(
    `SELECT id, product_id, qty_sent, unit_cost, currency_code FROM stock_transfer_lines WHERE transfer_id=$1 ORDER BY created_at, id`,
    [transferId],
  )
  const byId = new Map(args.lines.map((l) => [l.lineId, l]))
  if (byId.size !== args.lines.length) throw new Error('A line can appear only once')
  for (const l of args.lines)
    if (!lineRows.rows.some((r) => r.id === l.lineId))
      throw new Error('A line does not belong to this transfer')
  let short = false
  for (const line of lineRows.rows) {
    const got = byId.get(line.id)
    if (!got) throw new Error('Say how much arrived of every item')
    const sent = parseFloat(line.qty_sent)
    const qty = Number(got.qtyReceived)
    if (!(qty >= 0) || qty > sent + QTY_EPSILON)
      throw new Error(`Received quantity must be between 0 and ${sent}`)
    const missing = Math.max(sent - qty, 0)
    const remarks = cleanIssuedToText(got.remarks, 'Remarks', 500)
    if (missing > QTY_EPSILON && !remarks)
      throw new Error('Say what happened to the items that did not arrive')
    if (missing > QTY_EPSILON) short = true
    const cost = parseFloat(line.unit_cost) || 0
    if (qty > QTY_EPSILON)
      await client.query(
        `INSERT INTO stock_moves (company_id,product_id,from_location_id,to_location_id,moved_at,qty,unit_cost,total_cost,currency_code,source_type,source_id,notes,moved_by)
         VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,$8,'store_transfer',$9,$10,$11)`,
        [
          companyId,
          line.product_id,
          transitId,
          tr.to_location_id,
          qty,
          cost,
          qty * cost,
          line.currency_code,
          transferId,
          `Transfer ${tr.transfer_number} received at ${toName}`,
          userId,
        ],
      )
    if (missing > QTY_EPSILON)
      await client.query(
        `INSERT INTO stock_moves (company_id,product_id,from_location_id,to_location_id,moved_at,qty,unit_cost,total_cost,currency_code,source_type,source_id,notes,moved_by)
         VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,$8,'store_transfer',$9,$10,$11)`,
        [
          companyId,
          line.product_id,
          transitId,
          lost,
          missing,
          cost,
          missing * cost,
          line.currency_code,
          transferId,
          `Transfer ${tr.transfer_number} short on receipt: ${remarks}`,
          userId,
        ],
      )
    await client.query(
      `UPDATE stock_transfer_lines SET qty_received=$2, receive_remarks=$3 WHERE id=$1`,
      [line.id, qty, remarks],
    )
  }
  await client.query(
    `UPDATE stock_transfers
        SET status=$2, received_date=COALESCE($3::date, CURRENT_DATE), received_by_name=$4, received_by=$5, received_at=NOW()
      WHERE id=$1`,
    [
      transferId,
      short ? 'received_short' : 'received',
      args.receivedDate ?? null,
      receivedBy,
      userId,
    ],
  )
}

/** Puts everything of a transfer that is still in transit back where it came from. Runs inside the caller's transaction. */
export async function cancelStoreTransfer(
  client: Client,
  args: { companyId: string; userId: string; transferId: string },
): Promise<void> {
  const { companyId, userId, transferId } = args
  const t = await client.query<{
    transfer_number: string
    status: string
    from_location_id: string
  }>(
    `SELECT transfer_number, status, from_location_id FROM stock_transfers WHERE id=$1 AND company_id=$2 FOR UPDATE`,
    [transferId, companyId],
  )
  const tr = t.rows.at(0)
  if (!tr) throw new Error('Transfer not found')
  if (tr.status !== 'in_transit')
    throw new Error(
      `Only a transfer that is in transit can be cancelled (this one is ${tr.status.replace('_', ' ')})`,
    )
  const transitId = await companyTransitLocation(client, companyId)
  const lines = await client.query<{
    product_id: string
    qty_sent: string
    unit_cost: string
    currency_code: string
  }>(
    `SELECT product_id, qty_sent, unit_cost, currency_code FROM stock_transfer_lines WHERE transfer_id=$1`,
    [transferId],
  )
  for (const l of lines.rows) {
    const qty = parseFloat(l.qty_sent)
    const cost = parseFloat(l.unit_cost) || 0
    await client.query(
      `INSERT INTO stock_moves (company_id,product_id,from_location_id,to_location_id,moved_at,qty,unit_cost,total_cost,currency_code,source_type,source_id,notes,moved_by)
       VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,$8,'store_transfer',$9,$10,$11)`,
      [
        companyId,
        l.product_id,
        transitId,
        tr.from_location_id,
        qty,
        cost,
        qty * cost,
        l.currency_code,
        transferId,
        `Transfer ${tr.transfer_number} cancelled: stock put back`,
        userId,
      ],
    )
  }
  await client.query(
    `UPDATE stock_transfers SET status='cancelled', cancelled_by=$2, cancelled_at=NOW() WHERE id=$1`,
    [transferId, userId],
  )
}

/**
 * What is waiting in the company's temporary stores, and for how long. ONE query behind the list and the summary.
 * Age counts from the OLDEST of the arrivals that still make up what is there now (newest arrivals are assumed to be the ones still
 * on the shelf), so a late top-up does not hide a pallet that has been waiting for weeks. `receipts` / `suppliers` / `destination` come
 * from the purchase receipts those arrivals belong to.
 */
export const TEMP_STORE_ITEMS_SQL = `
  -- currency-safe: every SUM here is a quantity of units, not money
  WITH bal AS (
    SELECT sb.product_id, sb.location_id, sb.qty_on_hand::numeric AS qty
      FROM stock_balances sb JOIN stock_locations sl ON sl.id = sb.location_id
     WHERE sl.company_id = $1 AND sl.type = 'temporary' AND sl.is_active AND sb.lot_id IS NULL AND sb.qty_on_hand > ${QTY_EPSILON}
  ), inc AS (
    SELECT m.id, m.product_id, m.to_location_id AS location_id, m.moved_at, m.qty, m.po_receipt_line_id,
           SUM(m.qty) OVER (PARTITION BY m.product_id, m.to_location_id ORDER BY m.moved_at DESC, m.id) AS running
      FROM stock_moves m JOIN bal ON bal.product_id = m.product_id AND bal.location_id = m.to_location_id
     WHERE m.superseded_at IS NULL AND m.from_location_id <> m.to_location_id
  ), waiting AS (
    SELECT inc.* FROM inc JOIN bal ON bal.product_id = inc.product_id AND bal.location_id = inc.location_id
     WHERE inc.running - inc.qty < bal.qty
  )
  SELECT bal.product_id, bal.location_id, bal.qty::text AS qty,
         p.name AS product_name, p.name_ar AS product_name_ar, p.sku, p.uom, sl.name AS location_name,
         (SELECT MIN(w.moved_at)::date::text FROM waiting w WHERE w.product_id = bal.product_id AND w.location_id = bal.location_id) AS since,
         GREATEST(CURRENT_DATE - (SELECT MIN(w.moved_at)::date FROM waiting w WHERE w.product_id = bal.product_id AND w.location_id = bal.location_id), 0) AS days_waiting,
         (SELECT string_agg(DISTINCT po.po_number, ', ')
            FROM waiting w JOIN po_receipt_lines rl ON rl.id = w.po_receipt_line_id
            JOIN po_receipts r ON r.id = rl.receipt_id JOIN purchase_orders po ON po.id = r.po_id
           WHERE w.product_id = bal.product_id AND w.location_id = bal.location_id AND po.company_id = $1) AS po_numbers,
         (SELECT string_agg(DISTINCT v.name, ', ')
            FROM waiting w JOIN po_receipt_lines rl ON rl.id = w.po_receipt_line_id
            JOIN po_receipts r ON r.id = rl.receipt_id JOIN purchase_orders po ON po.id = r.po_id
            JOIN vendors v ON v.id = po.vendor_id
           WHERE w.product_id = bal.product_id AND w.location_id = bal.location_id AND po.company_id = $1) AS suppliers,
         (SELECT r.final_destination_location_id
            FROM waiting w JOIN po_receipt_lines rl ON rl.id = w.po_receipt_line_id JOIN po_receipts r ON r.id = rl.receipt_id
           WHERE w.product_id = bal.product_id AND w.location_id = bal.location_id AND r.final_destination_location_id IS NOT NULL
           ORDER BY w.moved_at DESC LIMIT 1) AS destination_location_id,
         (SELECT dl.name
            FROM waiting w JOIN po_receipt_lines rl ON rl.id = w.po_receipt_line_id JOIN po_receipts r ON r.id = rl.receipt_id
            JOIN stock_locations dl ON dl.id = r.final_destination_location_id AND dl.company_id = $1
           WHERE w.product_id = bal.product_id AND w.location_id = bal.location_id
           ORDER BY w.moved_at DESC LIMIT 1) AS destination_name
    FROM bal
    JOIN products p ON p.id = bal.product_id
    JOIN stock_locations sl ON sl.id = bal.location_id
   ORDER BY days_waiting DESC, p.name`

export function mapTempStoreRow(r: Record<string, unknown>) {
  return {
    productId: r.product_id,
    productName: (r.product_name as string | null) ?? null,
    productNameAr: (r.product_name_ar as string | null) ?? null,
    sku: (r.sku as string | null) ?? null,
    uom: (r.uom as string | null) ?? null,
    locationId: r.location_id,
    locationName: (r.location_name as string | null) ?? null,
    qty: parseFloat(String(r.qty)) || 0,
    since: (r.since as string | null) ?? null,
    daysWaiting: Number(r.days_waiting ?? 0),
    late: Number(r.days_waiting ?? 0) > TEMP_WAIT_DAYS,
    poNumbers: (r.po_numbers as string | null) ?? null,
    suppliers: (r.suppliers as string | null) ?? null,
    destinationLocationId: (r.destination_location_id as string | null) ?? null,
    destinationName: (r.destination_name as string | null) ?? null,
  }
}

/** The transfers of a company with their lines, newest first. `status` filters by one status; 'all' or empty is everything. */
export async function storeTransfersFor(
  client: Client,
  companyId: string,
  status: string | undefined,
  limit = 200,
  onlyId?: string,
) {
  const params: unknown[] = [companyId, limit]
  let where = 't.company_id = $1'
  if (onlyId) {
    params.push(onlyId)
    where += ` AND t.id = $${params.length}`
  }
  if (status && status !== 'all') {
    params.push(status)
    where += ` AND t.status = $${params.length}`
  }
  const heads = await client.query(
    `SELECT t.id, t.transfer_number, t.transfer_date::text AS transfer_date, t.status, t.from_location_id, t.to_location_id,
            fl.name AS from_name, tl.name AS to_name, t.driver_name, t.vehicle_no, t.waybill_no, t.reference, t.notes,
            t.sent_at, t.received_date::text AS received_date, t.received_by_name,
            GREATEST(CURRENT_DATE - t.transfer_date, 0) AS days_in_transit
       FROM stock_transfers t
       JOIN stock_locations fl ON fl.id = t.from_location_id
       JOIN stock_locations tl ON tl.id = t.to_location_id
      WHERE ${where}
      ORDER BY t.sent_at DESC
      LIMIT $2`,
    params,
  )
  const ids = heads.rows.map((h) => (h as { id: string }).id)
  const lines = ids.length
    ? await client.query(
        `SELECT l.id, l.transfer_id, l.product_id, p.name AS product_name, p.sku, p.uom, l.qty_sent, l.qty_received, l.remarks, l.receive_remarks
           FROM stock_transfer_lines l JOIN products p ON p.id = l.product_id
          WHERE l.transfer_id = ANY($1::uuid[])
          ORDER BY l.created_at, l.id`,
        [ids],
      )
    : { rows: [] as Record<string, unknown>[] }
  return heads.rows.map((h) => {
    const r = h as Record<string, unknown>
    return {
      id: r.id,
      transferNumber: r.transfer_number,
      transferDate: r.transfer_date,
      status: r.status,
      fromLocationId: r.from_location_id,
      fromLocationName: r.from_name,
      toLocationId: r.to_location_id,
      toLocationName: r.to_name,
      driverName: (r.driver_name as string | null) ?? null,
      vehicleNo: (r.vehicle_no as string | null) ?? null,
      waybillNo: (r.waybill_no as string | null) ?? null,
      reference: (r.reference as string | null) ?? null,
      notes: (r.notes as string | null) ?? null,
      daysInTransit: r.status === 'in_transit' ? Number(r.days_in_transit ?? 0) : null,
      receivedDate: (r.received_date as string | null) ?? null,
      receivedByName: (r.received_by_name as string | null) ?? null,
      lines: (lines.rows as Record<string, unknown>[])
        .filter((l) => l.transfer_id === r.id)
        .map((l) => ({
          id: l.id,
          productId: l.product_id,
          productName: (l.product_name as string | null) ?? null,
          sku: (l.sku as string | null) ?? null,
          uom: (l.uom as string | null) ?? null,
          qtySent: parseFloat(String(l.qty_sent)),
          qtyReceived: l.qty_received == null ? null : parseFloat(String(l.qty_received)),
          remarks: (l.remarks as string | null) ?? null,
          receiveRemarks: (l.receive_remarks as string | null) ?? null,
        })),
    }
  })
}
