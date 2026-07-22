-- Migration 097: add cancel_reason to journal_entries
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
