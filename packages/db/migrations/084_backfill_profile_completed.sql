-- Migration 084: Backfill profile_completed for users who already have all required fields
UPDATE users
SET profile_completed = true
WHERE profile_completed = false
  AND first_name  IS NOT NULL AND first_name  <> ''
  AND last_name   IS NOT NULL AND last_name   <> ''
  AND job_title   IS NOT NULL AND job_title   <> ''
  AND phone       IS NOT NULL AND phone       <> ''
  AND emergency_phone IS NOT NULL AND emergency_phone <> '';
