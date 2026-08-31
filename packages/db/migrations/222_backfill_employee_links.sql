-- One-time backfill companion to the new auto-link/create hook on
-- PUT /api/v1/users/me/profile (services/gateway/src/routes/user-profile.ts).
-- That hook only ever fires the moment a user completes their profile for
-- the FIRST time — anyone who already had profile_completed = true before
-- this shipped will never hit it again, so without this backfill they'd be
-- stuck exactly as they are today: either a real account with no HR record,
-- or an HR record that was never linked to the account that matches it.
--
-- Uses the identical safe "fill a gap, never reassign" logic as the live
-- hook: only acts where a (company, user) pair currently has NO linked
-- employees row, and only claims an employees row that currently has
-- user_id IS NULL. It can never produce two rows sharing a user_id in the
-- same company, so employees_company_user_unique (migration 216) is never
-- at risk of firing off this migration.
--
-- Step 1 is intentionally more conservative than the live hook's email
-- match: if more than one unlinked placeholder row in a company shares the
-- same email (match_count > 1), it's skipped here rather than picked
-- arbitrarily — an ambiguous bulk auto-link is a worse failure mode than
-- just falling through to Step 2 and creating a fresh row instead.

-- Step 1: link unlinked (user_id IS NULL) HR placeholder rows to the
-- already-active user account matching them by email, same company only.
WITH candidates AS (
  SELECT
    ucr.company_id,
    ucr.user_id,
    e.id AS employee_id,
    COUNT(*) OVER (PARTITION BY ucr.company_id, ucr.user_id) AS match_count
  FROM user_company_roles ucr
  JOIN users u ON u.id = ucr.user_id
  JOIN employees e
    ON e.company_id = ucr.company_id
   AND e.user_id IS NULL
   AND lower(e.email) = lower(u.email)
  WHERE ucr.is_active = true
    AND u.profile_completed = true
    AND NOT EXISTS (
      SELECT 1 FROM employees e2
      WHERE e2.company_id = ucr.company_id AND e2.user_id = ucr.user_id
    )
),
linked AS (
  UPDATE employees e
  SET user_id = c.user_id, updated_at = NOW()
  FROM candidates c
  WHERE e.id = c.employee_id AND c.match_count = 1
  RETURNING e.id, e.user_id, e.company_id
)
INSERT INTO audit_log (user_id, company_id, action, table_name, record_id)
SELECT user_id, company_id, 'AUTO_LINK_EMPLOYEE_BACKFILL', 'employees', id FROM linked;

-- Step 2: for every remaining active membership still missing a link
-- (no placeholder existed, or Step 1 skipped it as ambiguous), create a
-- minimal employees row — mirrors the live hook's create branch exactly.
-- Restricted to profile_completed = true, which guarantees first_name/
-- last_name are populated and non-empty (enforced by the PUT /me/profile
-- validation that's the only way profile_completed becomes true).
WITH created AS (
  INSERT INTO employees (company_id, user_id, first_name, last_name, email, phone, job_title, hire_date, created_by)
  SELECT ucr.company_id, ucr.user_id, u.first_name, u.last_name, u.email, u.phone, u.job_title, CURRENT_DATE, ucr.user_id
  FROM user_company_roles ucr
  JOIN users u ON u.id = ucr.user_id
  WHERE ucr.is_active = true
    AND u.profile_completed = true
    AND NOT EXISTS (
      SELECT 1 FROM employees e
      WHERE e.company_id = ucr.company_id AND e.user_id = ucr.user_id
    )
  RETURNING id, user_id, company_id
)
INSERT INTO audit_log (user_id, company_id, action, table_name, record_id)
SELECT user_id, company_id, 'AUTO_CREATE_EMPLOYEE_BACKFILL', 'employees', id FROM created;
