-- Material Return also needs to cover PO lines that were delivered straight
-- to a project jobsite (recordDirectDelivery / migration 209) and therefore
-- never created a project_material_issue_lines row at all — they skip the
-- warehouse and project_material_issue_lines/stock entirely, so a return of
-- their surplus has nothing to point issue_line_id at. Make issue_line_id
-- optional and add po_line_id as the alternative source, mutually exclusive.

ALTER TABLE project_material_return_lines
  ALTER COLUMN issue_line_id DROP NOT NULL;

ALTER TABLE project_material_return_lines
  ADD COLUMN po_line_id UUID REFERENCES po_lines(id);

ALTER TABLE project_material_return_lines
  ADD CONSTRAINT chk_project_material_return_lines_source CHECK (
    (issue_line_id IS NOT NULL AND po_line_id IS NULL) OR
    (issue_line_id IS NULL AND po_line_id IS NOT NULL)
  );

CREATE INDEX idx_project_material_return_lines_po_line
  ON project_material_return_lines(po_line_id) WHERE po_line_id IS NOT NULL;
