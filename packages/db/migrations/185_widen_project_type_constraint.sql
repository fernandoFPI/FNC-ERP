-- Migration 185: widen projects.project_type CHECK constraint
--
-- ProjectForm.tsx's PROJECT_TYPES dropdown offers 8 values (construction,
-- supply, services, rental, fabrication, manpower_supply,
-- operation_maintenance, epc), but migration 016's CHECK constraint only
-- ever allowed ('construction','epc','manufacturing','rental','internal').
-- Selecting any of supply/services/fabrication/manpower_supply/
-- operation_maintenance failed the CHECK constraint on save — the frontend
-- was expanded at some point without a matching migration. Widen to the
-- union of both lists so nothing currently valid becomes invalid, and
-- everything the dropdown can send becomes valid.

ALTER TABLE projects DROP CONSTRAINT projects_project_type_check;

ALTER TABLE projects ADD CONSTRAINT projects_project_type_check
  CHECK (project_type IN (
    'construction', 'epc', 'manufacturing', 'rental', 'internal',
    'supply', 'services', 'fabrication', 'manpower_supply', 'operation_maintenance'
  ));
