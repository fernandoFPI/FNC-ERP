-- ── MIGRATION 209: PO DIRECT-TO-JOBSITE DELIVERY ────────────────────────────
-- Some PO lines are delivered straight to a project's jobsite and never pass
-- through company inventory — recording that shouldn't create a Store In
-- (no stock_moves/stock_balances row, no draft/photos/confirm), just mark
-- the line received and post its cost straight to the project. Mirrors the
-- existing stock_issue/rental partial-unique-index pattern so re-recording
-- the same PO line's direct delivery updates its cost_actual instead of
-- duplicating it.

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_cost_actuals_po_direct_delivery
  ON project_cost_actuals(source_id)
  WHERE source_type = 'po_direct_delivery' AND source_id IS NOT NULL;
