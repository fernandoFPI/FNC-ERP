-- Migration 155: Punch Item Photo Evidence (PRODOM Phase 5)
-- Multiple photos per punch item for evidence of the defect and its clearance.

CREATE TABLE project_punch_photos (
  id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  punch_id     UUID         NOT NULL REFERENCES project_punch_items(id) ON DELETE CASCADE,
  file_id      UUID         REFERENCES files(id),
  url          VARCHAR(500),
  caption      VARCHAR(255),
  uploaded_by  VARCHAR(255),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_punch_photos_punch ON project_punch_photos(punch_id);

COMMENT ON TABLE project_punch_photos IS
  'Photo evidence attached to punch list items. Supports both file-system uploads '
  '(file_id → files table) and direct URL references.';
