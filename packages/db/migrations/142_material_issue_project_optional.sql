-- Migration 142: Make project_id optional on project_material_issues
-- Store outs can now be auto-created from POs that are not linked to a project.
-- Cost actuals (project_cost_actuals) are only created when a project is present.

ALTER TABLE project_material_issues
  ALTER COLUMN project_id DROP NOT NULL;
