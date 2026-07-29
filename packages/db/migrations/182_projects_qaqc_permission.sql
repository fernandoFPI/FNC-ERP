-- Migration 182: Split a dedicated "Site QA/QC" permission submodule out of
-- projects.execution.*. RFI, Site Instructions, ITP, Inspection Requests,
-- NCR, and HSE records were gated under projects.execution.{view,edit,approve}
-- as a stopgap (no independent key existed in the registry) — this gives
-- them their own key so QA/QC access can be granted independently of
-- subcontracts/labor/equipment.
--
-- Backfills every existing projects.execution grant (user_permissions AND
-- role_template_permissions, including custom company-created templates,
-- not just the 4 system templates seed-permissions.ts regenerates) onto the
-- matching projects.qaqc key at the same access level, so nobody currently
-- covered by an execution grant silently loses QA/QC access the moment the
-- gateway resolvers switch over to checking the new key.

INSERT INTO permissions (key, module, submodule, action, label, sort_order) VALUES
  ('projects.qaqc.view',    'projects', 'qaqc', 'view',    'View Site QA/QC Records',    390),
  ('projects.qaqc.edit',    'projects', 'qaqc', 'edit',    'Manage Site QA/QC Records',  391),
  ('projects.qaqc.approve', 'projects', 'qaqc', 'approve', 'Approve Site QA/QC Records', 392)
ON CONFLICT (key) DO NOTHING;

INSERT INTO user_permissions (user_id, company_id, permission_key, access_level, granted_by, granted_at, updated_at)
SELECT user_id, company_id,
       'projects.qaqc.' || split_part(permission_key, '.', 3),
       access_level, granted_by, granted_at, updated_at
FROM user_permissions
WHERE permission_key IN ('projects.execution.view', 'projects.execution.edit', 'projects.execution.approve')
ON CONFLICT (user_id, company_id, permission_key) DO NOTHING;

INSERT INTO role_template_permissions (template_id, permission_key, access_level)
SELECT template_id,
       'projects.qaqc.' || split_part(permission_key, '.', 3),
       access_level
FROM role_template_permissions
WHERE permission_key IN ('projects.execution.view', 'projects.execution.edit', 'projects.execution.approve')
ON CONFLICT (template_id, permission_key) DO NOTHING;
