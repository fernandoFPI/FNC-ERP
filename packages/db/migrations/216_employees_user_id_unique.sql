-- employees.user_id is the sole link deciding whether a logged-in user can
-- see the projects/positions/team memberships tied to their employee
-- record (see requireProjectViewGW, po_position_assignments, etc.) — but
-- nothing ever stopped the same user_id from silently ending up linked to
-- two different employees rows (one stale, one current). Root cause traced
-- to linkEmployeeUser overwriting a target row's user_id with no check for
-- who else might already hold it — "unlink and relink" to fix a broken
-- link could leave the old row still holding the same user_id, so
-- project_members/po_position_assignments referencing the OLD employee_id
-- silently stopped resolving for that user again.
--
-- If this fails on a real duplicate already in the data, that's the
-- constraint doing its job — find the two employees rows sharing that
-- user_id first (SELECT company_id, user_id, array_agg(id) FROM employees
-- WHERE user_id IS NOT NULL GROUP BY 1,2 HAVING COUNT(*)>1) and resolve
-- which one should keep it before re-running.
CREATE UNIQUE INDEX IF NOT EXISTS employees_company_user_unique
  ON employees (company_id, user_id)
  WHERE user_id IS NOT NULL;
