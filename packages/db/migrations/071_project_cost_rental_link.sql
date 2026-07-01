-- Migration 071: Allow direct cost entries in project_cost_actuals without a journal line
-- Needed for rental invoices (and future direct-cost sources) to appear in project cost
-- summaries without requiring a full double-entry journal entry setup.

-- 1. Drop the NOT NULL + UNIQUE constraint on journal_line_id
ALTER TABLE project_cost_actuals
  DROP CONSTRAINT IF EXISTS project_cost_actuals_journal_line_id_key;

ALTER TABLE project_cost_actuals
  ALTER COLUMN journal_line_id DROP NOT NULL;

-- 2. Recreate as a partial unique index (nulls are allowed, but no two non-null rows share the same journal_line_id)
CREATE UNIQUE INDEX IF NOT EXISTS uq_project_cost_actuals_journal_line
  ON project_cost_actuals(journal_line_id)
  WHERE journal_line_id IS NOT NULL;

-- 3. Add source_id so direct entries can reference their source document
ALTER TABLE project_cost_actuals
  ADD COLUMN IF NOT EXISTS source_id UUID;

-- 4. Partial unique index to prevent duplicate rental invoice entries
CREATE UNIQUE INDEX IF NOT EXISTS uq_project_cost_actuals_rental_source
  ON project_cost_actuals(source_id)
  WHERE source_type = 'rental' AND source_id IS NOT NULL;
