-- Material Return for a Store Out that belongs to a requisition.
--
-- Migration 272 scoped a Material Return to the Purchase Order its material was
-- sourced through, and createMaterialReturn / returnableMaterialIssueLines both
-- required one. Since the requisition split (G1, migration 258) the Store Out
-- for stock-covered lines is made against the REQUISITION and has no po_id at
-- all, so none of those Store Outs could ever be returned (found live: three
-- Nishtimani Yakam Store Outs of PLMB-727 from the central warehouse, 12 units).
--
-- A return now hangs off exactly one parent: a PO (existing behaviour, all
-- existing rows) or a requisition. po_id stays nullable (migration 272), and is
-- NOT forced to be present, because returns recorded before 272 may have none.
ALTER TABLE project_material_returns
  ADD COLUMN requisition_id UUID REFERENCES requisitions(id);

ALTER TABLE project_material_returns
  ADD CONSTRAINT project_material_returns_one_parent
  CHECK (po_id IS NULL OR requisition_id IS NULL);

CREATE INDEX idx_project_material_returns_requisition
  ON project_material_returns(requisition_id) WHERE requisition_id IS NOT NULL;
