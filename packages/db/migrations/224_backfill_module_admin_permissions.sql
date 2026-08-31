-- One-time companion to the module_admin auto-grant added to addUserRole/
-- updateUserRole/assignRole (services/gateway/src/graphql/resolvers.ts).
-- Anyone whose role was already module_admin + a specific module before
-- that shipped never got the corresponding 'admin' permission grants —
-- the live code only fires on a role change going forward, and a plain
-- re-save of unchanged values didn't trigger it either until the diff
-- logic was fixed to grant unconditionally. This applies the identical
-- grant once, in bulk, to every active module_admin membership.
INSERT INTO user_permissions (user_id, company_id, permission_key, access_level, granted_by)
SELECT ucr.user_id, ucr.company_id, p.key, 'admin', ucr.user_id
FROM user_company_roles ucr
JOIN permissions p ON p.module = ucr.module
WHERE ucr.role = 'module_admin'
  AND ucr.module IS NOT NULL
  AND ucr.is_active = true
ON CONFLICT (user_id, company_id, permission_key)
  DO UPDATE SET access_level = 'admin', updated_at = NOW();
