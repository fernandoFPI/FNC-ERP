-- projects.overview / projects.team / projects.attachments were never added
-- to the permission registry (packages/permissions/src/registry.ts), even
-- though every other project module (bidding, engineering, cost_control,
-- etc.) already has view/edit keys. useProjectCapability's registryLevel()
-- checks 'projects.<module>.view'/'.edit'/'.approve' for a company-wide
-- grant to elevate a non-member's access to a project tab — with no keys to
-- grant, NO permission grant (however high) could ever unlock the Overview,
-- Team, or Attachments tabs for someone who isn't an actual member of that
-- specific project. This is what made the module_admin auto-grant
-- (222/223 unrelated; see the addUserRole/updateUserRole/assignRole change
-- in resolvers.ts) silently fail to help for these three tabs specifically.
--
-- Inserted directly here (not left to the next `pnpm seed:permissions` run)
-- so the grant-sweep below can see them immediately in this same
-- transaction, regardless of deploy step ordering. The seed script's
-- ON CONFLICT (key) DO UPDATE will harmlessly re-upsert these same values
-- next deploy.
INSERT INTO permissions (key, module, submodule, action, label, sort_order) VALUES
  ('projects.overview.view', 'projects', 'overview', 'view', 'View Project Overview', 305),
  ('projects.overview.edit', 'projects', 'overview', 'edit', 'Edit Project Overview', 306),
  ('projects.team.view', 'projects', 'team', 'view', 'View Project Team', 395),
  ('projects.team.edit', 'projects', 'team', 'edit', 'Manage Project Team', 396),
  ('projects.attachments.view', 'projects', 'attachments', 'view', 'View Attachments', 397),
  ('projects.attachments.edit', 'projects', 'attachments', 'edit', 'Manage Attachments', 398)
ON CONFLICT (key) DO NOTHING;

-- Re-run the same module_admin grant sweep as 224, now that these keys
-- exist, so anyone already module_admin + module='projects' (Domara
-- included) picks up admin on overview/team/attachments without needing
-- another manual re-save.
INSERT INTO user_permissions (user_id, company_id, permission_key, access_level, granted_by)
SELECT ucr.user_id, ucr.company_id, p.key, 'admin', ucr.user_id
FROM user_company_roles ucr
JOIN permissions p ON p.module = ucr.module
WHERE ucr.role = 'module_admin'
  AND ucr.module IS NOT NULL
  AND ucr.is_active = true
ON CONFLICT (user_id, company_id, permission_key)
  DO UPDATE SET access_level = 'admin', updated_at = NOW();
