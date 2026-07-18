-- Migration 140: Add lifecycle_phase to projects
-- Tracks sub-stage within the 6-stage project lifecycle independently of status.
-- Stages: enquiry | scope_review | bidding | client_approval | execution | closeout

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS lifecycle_phase VARCHAR(30) NOT NULL DEFAULT 'enquiry';

-- Backfill from current status
UPDATE projects SET lifecycle_phase = CASE
  WHEN status = 'pending'                  THEN 'enquiry'
  WHEN status = 'ongoing'                  THEN 'scope_review'
  WHEN status = 'submitted'                THEN 'client_approval'
  WHEN status = 'approved'                 THEN 'execution'
  WHEN status = 'completed'                THEN 'closeout'
  WHEN status = 'cancelled_after_approval' THEN 'execution'
  WHEN status IN ('cancelled', 'on_hold')  THEN 'enquiry'
  ELSE 'enquiry'
END;

CREATE INDEX IF NOT EXISTS idx_projects_lifecycle_phase ON projects(lifecycle_phase);
