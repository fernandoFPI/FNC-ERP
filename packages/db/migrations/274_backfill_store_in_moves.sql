-- Backfills the missing stock_moves row for every confirmed po_receipt_lines
-- row whose product was already cataloged before completeStoreInLineForResolvedProduct
-- existed (commit b17eed8) — historical instances of the store-in bug: a
-- receipt line with no catalog product_id at confirm time correctly skipped
-- its stock move (queued into pending_product_catalog_items instead), but
-- once cataloged, nothing ever created the move it should have gotten. The
-- receipt stayed 'confirmed' and po_lines.qty_received matched what was
-- ordered, but the quantity never reached stock_balances. Fixed going
-- forward by that commit; this is the one-time retroactive correction for
-- every line that predates it.
--
-- Confirmed against production before writing this migration: 98 lines
-- across 11 receipts, 3,700,756.41 IQD, zero unresolvable destination
-- locations. Unlike G8's opening-balance backfill (migration 255), this is
-- a genuine, previously-unrecorded increase — the trigger stays enabled so
-- qty_on_hand actually goes up by the missing amount, exactly like a normal
-- confirmReceipt insert would have done at the time.
--
-- Skips any line where a compensating stock adjustment already exists —
-- same guard as the live code (295c441) — so a line a store keeper already
-- fixed by hand (PO-2026-0011, PO-2026-0014 — the ELEC-9xx lines) isn't
-- backfilled a second time. This is computed by the guard below, not a
-- hardcoded exclusion list, so it stays correct if re-run.

INSERT INTO stock_moves (
  company_id, product_id, from_location_id, to_location_id,
  moved_at, qty, unit_cost, total_cost, source_type, source_id, notes, moved_by,
  po_line_id, po_receipt_line_id
)
SELECT
  po.company_id,
  pl.product_id,
  vloc.id,
  COALESCE(por.warehouse_location_id, wloc.id),
  por.received_date,
  prl.qty_received,
  pl.unit_price * COALESCE(pl.fx_rate_to_base, 1),
  prl.qty_received * pl.unit_price * COALESCE(pl.fx_rate_to_base, 1),
  'po_receipt',
  por.id,
  'Backfilled retroactively (migration 274) — store-in bug fixed in 295c441; this line predates the fix',
  NULL,
  pl.id,
  prl.id
FROM po_receipt_lines prl
JOIN po_receipts por ON por.id = prl.receipt_id
JOIN po_lines pl ON pl.id = prl.po_line_id
JOIN purchase_orders po ON po.id = por.po_id
CROSS JOIN LATERAL (
  SELECT id FROM stock_locations
  WHERE company_id = po.company_id AND type = 'virtual_in' AND is_active = true
  LIMIT 1
) vloc
LEFT JOIN LATERAL (
  SELECT id FROM stock_locations
  WHERE company_id = po.company_id AND type = 'warehouse' AND is_active = true
  LIMIT 1
) wloc ON true
WHERE por.status = 'confirmed'
  AND pl.product_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM stock_moves sm WHERE sm.po_receipt_line_id = prl.id)
  AND NOT EXISTS (
    SELECT 1 FROM stock_moves sm
    WHERE sm.company_id = po.company_id AND sm.product_id = pl.product_id
      AND sm.source_type = 'adjustment' AND sm.moved_at >= por.received_date
  )
  AND COALESCE(por.warehouse_location_id, wloc.id) IS NOT NULL;
