-- An approved vendor return takes its value back off the project when the goods were delivered straight to the jobsite
-- (recordDirectDelivery posts their cost to the project at delivery). Until now a return changed nothing but its own
-- row: the project kept the cost, and the PO still paid for it.
--
-- The offset is one negative project_cost_actuals row per returned item (source_type 'po_vendor_return', source_id =
-- the po_return_items row), the same append-only pattern as material_return. The partial unique index is what makes
-- approving a return (or re-running the backfill) a no-op the second time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_project_cost_actuals_po_vendor_return
  ON project_cost_actuals(source_id)
  WHERE source_type = 'po_vendor_return' AND source_id IS NOT NULL;
