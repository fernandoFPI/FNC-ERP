-- Migration 085: Force profile_completed = true for the system admin account
-- This resolves the mobile login loop caused by profile_completed = false in DB
-- while the PC had a stale cached state showing the user as complete.
UPDATE users SET profile_completed = true WHERE email = 'fernandoyosef2003@gmail.com';
