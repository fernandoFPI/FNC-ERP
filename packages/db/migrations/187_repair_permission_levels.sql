-- Migration 187: repair permission grants mis-stored by a Permission Tree UI bug.
--
-- Every permission key's own suffix already says what it grants
-- (projects.cost_control.edit IS the edit grant), but the checkbox that
-- toggled a key always stored access_level='view' first regardless of the
-- key's suffix — an admin had to notice and separately click a second
-- "Edit"/"Approve"/"Admin" button to correct it. Anyone who just checked
-- the box got silently under-granted (e.g. "Edit Cost Control" stored at
-- 'view', which every .edit-level check then correctly treats as
-- insufficient). system_admin/company_admin never hit this since they
-- bypass permission checks entirely — hence "only system admin can see it."
--
-- The UI is fixed (apps/web/src/components/permissions/PermissionTree.tsx)
-- so this state can no longer be produced going forward. This normalizes
-- every existing row to match its own key's implied level — there is no
-- legitimate case where e.g. a '.edit'-suffixed key should sit below
-- 'edit', so this is a safe, unambiguous repair, not a guess.

UPDATE user_permissions
SET access_level = CASE
  WHEN permission_key = 'projects.cancel' THEN 'admin'
  WHEN permission_key LIKE '%.admin' THEN 'admin'
  WHEN permission_key LIKE '%.approve' THEN 'approve'
  WHEN permission_key LIKE '%.edit' THEN 'edit'
  ELSE 'view'
END,
updated_at = NOW()
WHERE access_level <> CASE
  WHEN permission_key = 'projects.cancel' THEN 'admin'
  WHEN permission_key LIKE '%.admin' THEN 'admin'
  WHEN permission_key LIKE '%.approve' THEN 'approve'
  WHEN permission_key LIKE '%.edit' THEN 'edit'
  ELSE 'view'
END;

UPDATE role_template_permissions
SET access_level = CASE
  WHEN permission_key = 'projects.cancel' THEN 'admin'
  WHEN permission_key LIKE '%.admin' THEN 'admin'
  WHEN permission_key LIKE '%.approve' THEN 'approve'
  WHEN permission_key LIKE '%.edit' THEN 'edit'
  ELSE 'view'
END
WHERE access_level <> CASE
  WHEN permission_key = 'projects.cancel' THEN 'admin'
  WHEN permission_key LIKE '%.admin' THEN 'admin'
  WHEN permission_key LIKE '%.approve' THEN 'approve'
  WHEN permission_key LIKE '%.edit' THEN 'edit'
  ELSE 'view'
END;
