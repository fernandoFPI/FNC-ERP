-- Store Out (project_material_issues) can now be created with no project.
-- Cost is not posted to project_cost_actuals when project_id is null —
-- it's a plain stock decrement with no project cost tracking (temporary,
-- to be revisited).
ALTER TABLE project_material_issues ALTER COLUMN project_id DROP NOT NULL;
