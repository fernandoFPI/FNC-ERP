-- ── RFQ Phase Labels ──────────────────────────────────────────
-- Adds a free-text phase/group label to each rfq_line so scope
-- items can be grouped into phases (e.g. "Light Gauge", "Insulation").
-- On RFQ approval the gateway auto-creates one project_stage per
-- distinct non-empty phase label.

ALTER TABLE rfq_lines
  ADD COLUMN IF NOT EXISTS phase_label VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_rfq_lines_phase_label
  ON rfq_lines(project_id, phase_label)
  WHERE phase_label IS NOT NULL;
