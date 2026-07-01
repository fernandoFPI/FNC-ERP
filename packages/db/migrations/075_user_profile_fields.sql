-- Migration 075: User profile fields + completion flag
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS first_name        VARCHAR(100),
  ADD COLUMN IF NOT EXISTS last_name         VARCHAR(100),
  ADD COLUMN IF NOT EXISTS profile_picture   TEXT,
  ADD COLUMN IF NOT EXISTS job_title         VARCHAR(100),
  ADD COLUMN IF NOT EXISTS phone             VARCHAR(30),
  ADD COLUMN IF NOT EXISTS emergency_phone   VARCHAR(30),
  ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN NOT NULL DEFAULT false;
