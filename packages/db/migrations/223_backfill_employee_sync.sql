-- One-time retroactive companion to the live profile-sync hook in
-- services/gateway/src/routes/user-profile.ts (PUT /me/profile, existing-
-- link branch). That hook only updates an employees row the next time its
-- linked user resubmits their profile — anyone already linked before this
-- shipped, who hasn't touched their profile since, is stuck with whatever
-- name was on file when they were first linked (often an abbreviated
-- legacy import, e.g. "Merel A").
--
-- This applies the identical sync once, retroactively, to every row that is
-- ALREADY linked to a real user account. Unlike 222_backfill_employee_links,
-- this never creates or relinks anything — it's a plain UPDATE restricted to
-- rows that already have the correct user_id — so it carries none of the
-- duplicate-record risk the create-fallback had (fixed separately in
-- user-profile.ts with a name-collision guard before that fallback fires).
WITH synced AS (
  UPDATE employees e
  SET first_name = u.first_name,
      last_name = u.last_name,
      job_title = COALESCE(u.job_title, e.job_title),
      phone = COALESCE(u.phone, e.phone),
      updated_at = NOW()
  FROM users u
  WHERE e.user_id = u.id
    AND u.profile_completed = true
    AND (e.first_name IS DISTINCT FROM u.first_name
         OR e.last_name IS DISTINCT FROM u.last_name
         OR (u.job_title IS NOT NULL AND e.job_title IS DISTINCT FROM u.job_title)
         OR (u.phone IS NOT NULL AND e.phone IS DISTINCT FROM u.phone))
  RETURNING e.id, e.user_id, e.company_id
)
INSERT INTO audit_log (user_id, company_id, action, table_name, record_id)
SELECT user_id, company_id, 'AUTO_SYNC_EMPLOYEE_BACKFILL', 'employees', id FROM synced;
