-- Read-only. Supports the G1 revised-design report, item 4: prod counts
-- for pre-vendor POs, vendor-committed POs by status, and lines missing a
-- GL account / cost center tag.
--
-- Usage: psql "$DATABASE_URL" -P pager=off -f packages/db/scripts/g1_revised_design_prod_counts.sql

\set ON_ERROR_STOP on

-- ── Pre-vendor vs vendor-committed, by status (same classifier as the
-- earlier g1_pre_vendor_po_count.sql, reproduced here so this script is
-- self-contained) ──────────────────────────────────────────────────────
SELECT
  CASE
    WHEN status IN ('draft', 'inventory_check', 'store_pricing') THEN 'TOMBSTONE (early-stage)'
    WHEN status IN ('ready_to_issue', 'completed') AND vendor_id IS NULL THEN 'COMPLETED-NO-CHILD (100% stock-covered)'
    ELSE 'BECOMES-CHILD (vendor-committed)'
  END AS migration_category,
  status,
  COUNT(*) AS po_count
FROM purchase_orders
GROUP BY migration_category, status
ORDER BY migration_category, po_count DESC;

-- ── Lines with no GL account / cost center tag today ───────────────────
-- account_id has been dead in the live path since migration 007 (never
-- populated by createPurchaseOrder); cost_center_id only gets populated
-- via setPOLineAccounting, gated on funding_source='employee_advance' AND
-- status='invoiced'. Expect both to be close to 100% empty for normal
-- vendor-AP lines — this is the actual backfill gap the revised design's
-- "NOT NULL for new lines" requirement needs to size.
SELECT
  COUNT(*) AS total_lines,
  COUNT(*) FILTER (WHERE account_id IS NULL) AS no_account_id,
  COUNT(*) FILTER (WHERE cost_center_id IS NULL) AS no_cost_center_id,
  COUNT(*) FILTER (WHERE account_id IS NULL AND cost_center_id IS NULL) AS no_tag_at_all,
  ROUND(100.0 * COUNT(*) FILTER (WHERE account_id IS NULL) / NULLIF(COUNT(*), 0), 1) AS pct_no_account,
  ROUND(100.0 * COUNT(*) FILTER (WHERE cost_center_id IS NULL) / NULLIF(COUNT(*), 0), 1) AS pct_no_cost_center
FROM po_lines;

-- Same, broken down by the parent PO's funding_source, since account_id/
-- cost_center_id are only ever wired up for employee_advance today.
SELECT
  po.funding_source,
  COUNT(pl.*) AS total_lines,
  COUNT(*) FILTER (WHERE pl.account_id IS NULL) AS no_account_id,
  COUNT(*) FILTER (WHERE pl.cost_center_id IS NULL) AS no_cost_center_id
FROM po_lines pl
JOIN purchase_orders po ON po.id = pl.po_id
GROUP BY po.funding_source;

-- ── Currency spread on po_lines (relevant to the no-conversion policy —
-- how many POs/lines are actually non-base-currency today, i.e. how much
-- real multi-currency data the fx_rate_to_base removal needs to handle
-- correctly rather than as a rare edge case) ────────────────────────────
SELECT currency_code, COUNT(*) AS line_count, COUNT(DISTINCT po_id) AS po_count
FROM po_lines
GROUP BY currency_code
ORDER BY line_count DESC;

-- ── stock_moves.currency_code — confirm it's genuinely always the
-- default (never populated), as found in the code audit ────────────────
SELECT currency_code, COUNT(*) AS move_count
FROM stock_moves
GROUP BY currency_code;
