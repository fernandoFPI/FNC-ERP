import { pool, withIntercoTransaction } from '@fnc-erp/db'
import { logAudit } from '@fnc-erp/audit'
import { resolveTransferPrice, TransferPricingError } from '@fnc-erp/fx'

interface IntercoStockMovePayload {
  product_id: string
  lot_id?: string | null
  from_location_id: string
  to_location_id: string
  qty: number
  source_type: string
  source_id?: string | null
  notes?: string | null
  moved_by: string
  from_company_id: string
  to_company_id: string
  market_price?: number | null
}

interface IntercoStockTransferExecutePayload {
  from_company_id: string
  to_company_id: string
  transfer_date: string
  notes?: string | null
  source_type: string
  source_id?: string | null
  moved_by: string
  lines: Array<{
    product_id: string
    lot_id?: string | null
    from_location_id: string
    to_location_id: string
    qty: number
    market_price?: number | null
  }>
}

// ── DETECT AND ROUTE ──────────────────────────────────────────
// Called when inventory service detects a cross-entity move.
// Resolves pricing and queues INTERCO_STOCK_TRANSFER_EXECUTE.
export async function handleIntercoStockMoveDetected(
  payload: IntercoStockMovePayload,
): Promise<void> {
  const client = await pool.connect()
  try {
    const pricing = await resolveTransferPrice({
      client,
      productId: payload.product_id,
      fromCompanyId: payload.from_company_id,
      fromLocationId: payload.from_location_id,
      ...(payload.market_price != null ? { manualPrice: payload.market_price } : {}),
    })

    if (pricing.requires_manual_input) {
      console.error(
        `[worker] Interco stock move requires market price for product ${payload.product_id} ` +
          `but none was provided. Transfer cannot proceed automatically.`,
      )
      return
    }

    // Queue the full execution with resolved pricing context
    await pool.query(
      `INSERT INTO service_outbox (service, event_type, payload)
       VALUES ('interco','INTERCO_STOCK_TRANSFER_EXECUTE',$1)`,
      [
        JSON.stringify({
          from_company_id: payload.from_company_id,
          to_company_id: payload.to_company_id,
          transfer_date: new Date().toISOString().slice(0, 10),
          notes: payload.notes,
          source_type: payload.source_type,
          source_id: payload.source_id,
          moved_by: payload.moved_by,
          lines: [
            {
              product_id: payload.product_id,
              lot_id: payload.lot_id,
              from_location_id: payload.from_location_id,
              to_location_id: payload.to_location_id,
              qty: payload.qty,
              market_price: payload.market_price,
            },
          ],
        }),
      ],
    )
  } finally {
    client.release()
  }
}

// ── EXECUTE ATOMICALLY ────────────────────────────────────────
// Two stock moves + dual journal entries + interco_transaction
// all inside a single DB transaction via withIntercoTransaction.
export async function executeIntercoStockTransfer(
  payload: IntercoStockTransferExecutePayload,
): Promise<void> {
  await withIntercoTransaction(payload.moved_by, async (client, switchContext) => {
    const { from_company_id, to_company_id, moved_by } = payload

    // ── Get company prefix for transfer number ─────────────────
    await switchContext(from_company_id)
    const prefixRow = await client.query<{ name: string }>(
      'SELECT name FROM companies WHERE id = $1',
      [from_company_id],
    )
    const companyName = prefixRow.rows[0]?.name ?? 'UNK'
    const prefix = companyName
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 4)

    const year = new Date().getFullYear()
    const seqRow = await client.query<{ cnt: string }>(
      `SELECT COUNT(*) + 1 AS cnt
       FROM interco_stock_transfers
       WHERE from_company_id = $1
         AND EXTRACT(YEAR FROM created_at) = $2`,
      [from_company_id, year],
    )
    const seq = String(seqRow.rows[0]?.cnt ?? '1').padStart(4, '0')
    const transferNumber = `IST-${prefix}-${year}-${seq}`

    // ── Get GL accounts (both companies) ──────────────────────
    await switchContext(from_company_id)
    const fromAccounts = await client.query<{ id: string; code: string }>(
      `SELECT id, code FROM chart_of_accounts
       WHERE company_id=$1 AND is_active=true
         AND (code='1300' OR code='2400')
       ORDER BY code`,
      [from_company_id],
    )
    const fromInventoryAccount = fromAccounts.rows.find((a) => a.code === '1300')
    const fromIntercoPayable = fromAccounts.rows.find((a) => a.code === '2400')
    if (!fromInventoryAccount || !fromIntercoPayable) {
      throw new Error(
        `Company ${from_company_id} is missing required GL accounts (1300 Inventory, 2400 Interco Payable)`,
      )
    }

    await switchContext(to_company_id)
    const toAccounts = await client.query<{ id: string; code: string }>(
      `SELECT id, code FROM chart_of_accounts
       WHERE company_id=$1 AND is_active=true
         AND (code='1300' OR code='1700')
       ORDER BY code`,
      [to_company_id],
    )
    const toInventoryAccount = toAccounts.rows.find((a) => a.code === '1300')
    const toIntercoReceivable = toAccounts.rows.find((a) => a.code === '1700')
    if (!toInventoryAccount || !toIntercoReceivable) {
      throw new Error(
        `Company ${to_company_id} is missing required GL accounts (1300 Inventory, 1700 Interco Receivable)`,
      )
    }

    // ── Get virtual locations ──────────────────────────────────
    await switchContext(from_company_id)
    const fromVirtualOut = await client.query<{ id: string }>(
      `SELECT id FROM stock_locations WHERE company_id=$1 AND type='virtual_out' LIMIT 1`,
      [from_company_id],
    )
    if (!fromVirtualOut.rows[0]) {
      throw new Error(`Company ${from_company_id} has no virtual_out stock location`)
    }

    await switchContext(to_company_id)
    const toVirtualIn = await client.query<{ id: string }>(
      `SELECT id FROM stock_locations WHERE company_id=$1 AND type='virtual_in' LIMIT 1`,
      [to_company_id],
    )
    if (!toVirtualIn.rows[0]) {
      throw new Error(`Company ${to_company_id} has no virtual_in stock location`)
    }

    // ── Resolve pricing and create transfer record ─────────────
    await switchContext(from_company_id)

    let totalTransferValue = 0
    const resolvedLines: Array<{
      product_id: string
      lot_id: string | null
      from_location_id: string
      to_location_id: string
      qty: number
      avco_at_transfer: number
      standard_cost_at_transfer: number | null
      transfer_price: number
      markup_pct_applied: number | null
      total_transfer_value: number
    }> = []

    for (const line of payload.lines) {
      const pricing = await resolveTransferPrice({
        client,
        productId: line.product_id,
        fromCompanyId: from_company_id,
        fromLocationId: line.from_location_id,
        ...(line.market_price != null ? { manualPrice: line.market_price } : {}),
      })

      if (pricing.requires_manual_input) {
        throw new Error(
          `Market price required for product ${line.product_id} but not provided`,
        )
      }

      const lineValue = line.qty * pricing.transfer_price
      totalTransferValue += lineValue
      resolvedLines.push({
        product_id: line.product_id,
        lot_id: line.lot_id ?? null,
        from_location_id: line.from_location_id,
        to_location_id: line.to_location_id,
        qty: line.qty,
        avco_at_transfer: pricing.avco_at_transfer,
        standard_cost_at_transfer: pricing.standard_cost_at_transfer,
        transfer_price: pricing.transfer_price,
        markup_pct_applied: pricing.markup_pct_applied,
        total_transfer_value: lineValue,
      })
    }

    // ── Create interco_stock_transfer header ───────────────────
    const pricingMethod = resolvedLines[0]
      ? await getPricingMethod(client, from_company_id)
      : 'avco'

    const transferResult = await client.query<{ id: string }>(
      `INSERT INTO interco_stock_transfers
         (from_company_id, to_company_id, source_type, source_id,
          transfer_number, transfer_date, notes, pricing_method,
          status, initiated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9)
       RETURNING id`,
      [
        from_company_id,
        to_company_id,
        payload.source_type,
        payload.source_id ?? null,
        transferNumber,
        payload.transfer_date,
        payload.notes ?? null,
        pricingMethod,
        moved_by,
      ],
    )
    const transferId = transferResult.rows[0]!.id

    // ── Create transfer lines ──────────────────────────────────
    for (const line of resolvedLines) {
      await client.query(
        `INSERT INTO interco_stock_transfer_lines
           (transfer_id, product_id, lot_id,
            from_location_id, to_location_id,
            qty, avco_at_transfer, standard_cost_at_transfer,
            transfer_price, markup_pct_applied, total_transfer_value, currency_code)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'IQD')`,
        [
          transferId,
          line.product_id,
          line.lot_id,
          line.from_location_id,
          line.to_location_id,
          line.qty,
          line.avco_at_transfer,
          line.standard_cost_at_transfer,
          line.transfer_price,
          line.markup_pct_applied,
          line.total_transfer_value,
        ],
      )
    }

    // ── Stock moves (one per company) ──────────────────────────
    const fromMoveIds: string[] = []
    const toMoveIds: string[] = []

    for (const line of resolvedLines) {
      // FROM company: from_location → virtual_out
      await switchContext(from_company_id)
      const fromMove = await client.query<{ id: string }>(
        `INSERT INTO stock_moves
           (company_id, product_id, lot_id,
            from_location_id, to_location_id,
            qty, unit_cost, total_cost, currency_code,
            source_type, source_id, moved_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'IQD','interco_transfer',$9,$10)
         RETURNING id`,
        [
          from_company_id,
          line.product_id,
          line.lot_id,
          line.from_location_id,
          fromVirtualOut.rows[0]!.id,
          line.qty,
          line.transfer_price,
          line.total_transfer_value,
          transferId,
          moved_by,
        ],
      )
      fromMoveIds.push(fromMove.rows[0]!.id)

      // TO company: virtual_in → to_location
      await switchContext(to_company_id)
      const toMove = await client.query<{ id: string }>(
        `INSERT INTO stock_moves
           (company_id, product_id, lot_id,
            from_location_id, to_location_id,
            qty, unit_cost, total_cost, currency_code,
            source_type, source_id, moved_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'IQD','interco_transfer',$9,$10)
         RETURNING id`,
        [
          to_company_id,
          line.product_id,
          line.lot_id,
          toVirtualIn.rows[0]!.id,
          line.to_location_id,
          line.qty,
          line.transfer_price,
          line.total_transfer_value,
          transferId,
          moved_by,
        ],
      )
      toMoveIds.push(toMove.rows[0]!.id)
    }
    // stock_balance triggers fire automatically on each insert

    // ── Create interco_transaction record ─────────────────────
    await switchContext(from_company_id)
    const intercoTxResult = await client.query<{ id: string }>(
      `INSERT INTO interco_transactions
         (from_company_id, to_company_id, transaction_type,
          amount, currency_code, fx_rate, description, reference,
          status, created_by)
       VALUES ($1,$2,'goods_transfer',$3,'IQD',1,$4,$5,'pending',$6)
       RETURNING id`,
      [
        from_company_id,
        to_company_id,
        totalTransferValue,
        `Interco stock transfer: ${resolvedLines.length} line(s)`,
        transferNumber,
        moved_by,
      ],
    )
    const intercoTxId = intercoTxResult.rows[0]!.id

    // ── Get analytic account if source is a project issue ──────
    let analyticAccountId: string | null = null
    if (payload.source_type === 'project_issue' && payload.source_id) {
      await switchContext(to_company_id)
      const proj = await client.query<{ analytic_account_id: string | null }>(
        `SELECT p.analytic_account_id
         FROM project_material_issues pmi
         JOIN projects p ON p.id = pmi.project_id
         WHERE pmi.id = $1`,
        [payload.source_id],
      )
      analyticAccountId = proj.rows[0]?.analytic_account_id ?? null
    }

    // ── FROM company journal: inventory leaves, interco payable ─
    await switchContext(from_company_id)
    const fromEntryResult = await client.query<{ id: string }>(
      `INSERT INTO journal_entries
         (company_id, reference, description, entry_date, status,
          source_type, source_id, created_by, posted_at, posted_by)
       VALUES ($1,$2,$3,$4,'posted','interco_stock',$5,$6,NOW(),$6)
       RETURNING id`,
      [
        from_company_id,
        `IST-${transferNumber}`,
        `Interco stock transfer to company`,
        payload.transfer_date,
        intercoTxId,
        moved_by,
      ],
    )
    const fromEntryId = fromEntryResult.rows[0]!.id

    // DEBIT interco payable (2400) | CREDIT inventory (1300)
    await client.query(
      `INSERT INTO journal_lines
         (journal_entry_id, account_id, debit, credit, currency_code, fx_rate, amount_company_currency)
       VALUES ($1,$2,$3,0,'IQD',1,$3), ($1,$4,0,$3,'IQD',1,$3)`,
      [fromEntryId, fromIntercoPayable.id, totalTransferValue, fromInventoryAccount.id],
    )

    // ── TO company journal: inventory arrives, interco receivable ─
    await switchContext(to_company_id)
    const toEntryResult = await client.query<{ id: string }>(
      `INSERT INTO journal_entries
         (company_id, reference, description, entry_date, status,
          source_type, source_id, created_by, posted_at, posted_by)
       VALUES ($1,$2,$3,$4,'posted','interco_stock',$5,$6,NOW(),$6)
       RETURNING id`,
      [
        to_company_id,
        `IST-${transferNumber}`,
        `Interco stock received from company`,
        payload.transfer_date,
        intercoTxId,
        moved_by,
      ],
    )
    const toEntryId = toEntryResult.rows[0]!.id

    // DEBIT inventory (1300) with analytic | CREDIT interco receivable (1700)
    await client.query(
      `INSERT INTO journal_lines
         (journal_entry_id, account_id, analytic_account_id, debit, credit, currency_code, fx_rate, amount_company_currency)
       VALUES ($1,$2,$3,$4,0,'IQD',1,$4), ($1,$5,NULL,0,$4,'IQD',1,$4)`,
      [
        toEntryId,
        toInventoryAccount.id,
        analyticAccountId,
        totalTransferValue,
        toIntercoReceivable.id,
      ],
    )
    // analytic_account_id on the debit line triggers sync_project_cost_actuals

    // ── Update all records to posted ───────────────────────────
    await switchContext(from_company_id)

    // Update transfer header
    await client.query(
      `UPDATE interco_stock_transfers
       SET from_stock_move_id=$1, to_stock_move_id=$2,
           interco_transaction_id=$3, status='posted', posted_at=NOW(), updated_at=NOW()
       WHERE id=$4`,
      [fromMoveIds[0] ?? null, toMoveIds[0] ?? null, intercoTxId, transferId],
    )

    // Update transfer lines with stock move IDs
    for (let i = 0; i < resolvedLines.length; i++) {
      await client.query(
        `UPDATE interco_stock_transfer_lines
         SET from_stock_move_id=$1, to_stock_move_id=$2
         WHERE transfer_id=$3 AND product_id=$4`,
        [fromMoveIds[i] ?? null, toMoveIds[i] ?? null, transferId, resolvedLines[i]!.product_id],
      )
    }

    // Update interco transaction
    await client.query(
      `UPDATE interco_transactions
       SET from_journal_entry_id=$1, to_journal_entry_id=$2,
           status='posted', posted_at=NOW(), updated_at=NOW()
       WHERE id=$3`,
      [fromEntryId, toEntryId, intercoTxId],
    )

    // ── Audit log ─────────────────────────────────────────────
    await logAudit({
      userId: moved_by,
      companyId: from_company_id,
      action: 'CREATE',
      tableName: 'interco_stock_transfers',
      recordId: transferId,
      newValues: {
        to_company: to_company_id,
        pricing_method: pricingMethod,
        total_value: totalTransferValue,
        transfer_number: transferNumber,
      },
      client,
    })

    console.warn(
      `[worker] Interco stock transfer ${transferNumber} posted: ` +
        `${String(totalTransferValue)} IQD from ${from_company_id} → ${to_company_id}`,
    )
  })
}

async function getPricingMethod(
  client: import('@fnc-erp/db').PoolClient,
  companyId: string,
): Promise<string> {
  const result = await client.query<{ interco_transfer_pricing_method: string }>(
    'SELECT interco_transfer_pricing_method FROM companies WHERE id=$1',
    [companyId],
  )
  return result.rows[0]?.interco_transfer_pricing_method ?? 'avco'
}
