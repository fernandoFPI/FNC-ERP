-- Migration 172: company-wide "Simple Bid Mode" toggle.
-- Default false = today's behavior, unchanged, for every existing company.
-- When true, Technical/Commercial Bid show only a ZIP package upload zone
-- instead of the full deliverable/cost-item tracking (see IMPROVEMENT_PLAN.md
-- Phase 5 notes / Settings > Company > Lifecycle "Bidding Display Mode").

ALTER TABLE system_configuration
  ADD COLUMN IF NOT EXISTS bid_simple_mode_enabled BOOLEAN NOT NULL DEFAULT false;
