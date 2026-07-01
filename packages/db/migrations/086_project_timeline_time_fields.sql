-- Migration 086: Add time + additional date fields to projects for tender timeline tracking
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS submission_time  TIME,
  ADD COLUMN IF NOT EXISTS site_visit_date  DATE,
  ADD COLUMN IF NOT EXISTS site_visit_time  TIME,
  ADD COLUMN IF NOT EXISTS question_date    DATE,
  ADD COLUMN IF NOT EXISTS question_time    TIME;
