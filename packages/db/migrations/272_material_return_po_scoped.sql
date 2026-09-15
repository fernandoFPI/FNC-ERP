-- Material Return is scoped by the Purchase Order the material was
-- originally sourced through, not by project directly — matching how
-- users actually think about this ("a PO was made for items, some came
-- back") and matching project_material_issues' own reality: a Store Out
-- (and therefore the PO it's linked through) can have no project at all
-- (migration 213 — a plain stock decrement, e.g. a general-stock PO).
-- project_material_returns.project_id was wrongly NOT NULL from the
-- start; this drops that, and adds po_id so the return itself can be
-- looked up/filtered by PO the same way project_material_issues already
-- is.
ALTER TABLE project_material_returns
  ALTER COLUMN project_id DROP NOT NULL;

ALTER TABLE project_material_returns
  ADD COLUMN po_id UUID REFERENCES purchase_orders(id);

CREATE INDEX idx_project_material_returns_po ON project_material_returns(po_id) WHERE po_id IS NOT NULL;
