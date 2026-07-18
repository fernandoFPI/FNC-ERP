-- Migration 141: Store Out / Material Issue enhancements
-- Links material issues to originating PO, adds po_line_id on lines,
-- relaxes NOT NULL on location columns for the simplified store-out flow,
-- and adds a unique index for stock_issue entries in project_cost_actuals.

-- Link a store-out (material issue) to the originating purchase order (optional)
ALTER TABLE project_material_issues
  ADD COLUMN IF NOT EXISTS po_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL;

-- Link each issue line to the specific PO line it was sourced from (optional)
ALTER TABLE project_material_issue_lines
  ADD COLUMN IF NOT EXISTS po_line_id UUID REFERENCES po_lines(id) ON DELETE SET NULL;

-- Make location columns nullable: the simplified store-out flow doesn't require
-- full WMS locations at this stage; stock moves can be linked later.
ALTER TABLE project_material_issue_lines
  ALTER COLUMN from_location_id DROP NOT NULL,
  ALTER COLUMN to_location_id   DROP NOT NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pmi_po
  ON project_material_issues(po_id)
  WHERE po_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pmil_po_line
  ON project_material_issue_lines(po_line_id)
  WHERE po_line_id IS NOT NULL;

-- Prevent duplicate stock_issue cost_actual entries (mirrors the rental source index)
CREATE UNIQUE INDEX IF NOT EXISTS uq_project_cost_actuals_stock_issue
  ON project_cost_actuals(source_id)
  WHERE source_type = 'stock_issue' AND source_id IS NOT NULL;
