-- Reverses migration 258's TOMBSTONE handling for every still-untouched
-- pre-vendor PO: restores purchase_orders.status to what it was before
-- the backfill, clears the requisition pointer, moves po_lines back
-- under the old PO, and deletes the synthetic REQ-MIG- requisition row
-- migration 258 created for it — so these can be carried through the old
-- flow while the new model's frontend doesn't exist yet (Phase 4).
--
-- COMPLETED_NO_CHILD rows (100% stock-covered, migrated straight to a
-- 'completed' requisition) are explicitly NOT touched here — there's no
-- "old flow" left to carry through for a request that's already done.
--
-- Scope: a purchase_orders row is reversed only when ALL of:
--   - status = 'deleted' AND its superseding requisition's number matches
--     'REQ-MIG-%' (migration-created, never a real new-model requisition)
--   - that requisition's status != 'completed' (excludes COMPLETED_NO_CHILD)
--   - zero footprint from any new-model mutation since the backfill: no
--     requisition_approval_log entry, no po_line_purchases entry on any
--     of its lines, no project_material_issues, no
--     requisition_approved_totals, no pending_product_catalog_items, no
--     po_edit_requests. Anything showing real interaction since the
--     backfill is left alone rather than silently discarded.
--
-- Verified against production before this file was written: 10
-- candidates (4 cancelled, 4 market_pricing, 2 pending_approval), all
-- zero-footprint, and migration 258's section 6 GL-account backfill never
-- activated for any of their lines (system_configuration's defaults were
-- still NULL) — so there is nothing else to unwind besides
-- purchase_orders/po_lines/requisitions themselves.
--
-- This is a deliberate, temporary reopening of the old flow for exactly
-- this window — not a reversal of G1's design. Phase 3's own backfill
-- will pick these rows up again later, once the new resolvers are the
-- only path creating requisitions.

BEGIN;

CREATE TEMP TABLE g1_tombstone_reversal_candidates AS
SELECT po.id AS po_id, r.id AS req_id, r.status AS restored_status
FROM purchase_orders po
JOIN requisitions r ON r.id = po.superseded_by_requisition_id
WHERE po.status = 'deleted'
  AND r.requisition_number LIKE 'REQ-MIG-%'
  AND r.status != 'completed'
  AND NOT EXISTS (SELECT 1 FROM requisition_approval_log WHERE requisition_id = r.id)
  AND NOT EXISTS (
    SELECT 1 FROM po_line_purchases plp JOIN po_lines pl ON pl.id = plp.po_line_id WHERE pl.requisition_id = r.id
  )
  AND NOT EXISTS (SELECT 1 FROM project_material_issues WHERE requisition_id = r.id)
  AND NOT EXISTS (SELECT 1 FROM requisition_approved_totals WHERE requisition_id = r.id)
  AND NOT EXISTS (SELECT 1 FROM pending_product_catalog_items WHERE requisition_id = r.id)
  AND NOT EXISTS (SELECT 1 FROM po_edit_requests WHERE requisition_id = r.id);

UPDATE po_lines pl
SET po_id = c.po_id,
    requisition_id = NULL
FROM g1_tombstone_reversal_candidates c
WHERE pl.requisition_id = c.req_id;

UPDATE purchase_orders po
SET status = c.restored_status,
    superseded_by_requisition_id = NULL,
    requisition_id = NULL,
    updated_at = NOW()
FROM g1_tombstone_reversal_candidates c
WHERE po.id = c.po_id;

DELETE FROM requisitions r
USING g1_tombstone_reversal_candidates c
WHERE r.id = c.req_id;

DROP TABLE g1_tombstone_reversal_candidates;

COMMIT;
