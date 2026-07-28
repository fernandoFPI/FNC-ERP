-- Allows a PO position assignment to have no project_id and no department_id,
-- representing a company-wide grant (e.g. po_admin managing all POs).
-- Previously enforced "at least one required" — the frontend already offered
-- a "Company-wide" scope option that this constraint silently rejected.
ALTER TABLE po_position_assignments
  DROP CONSTRAINT IF EXISTS ppa_must_have_scope;
