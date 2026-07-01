-- Add flag + resolution tracking to PO line comments
ALTER TABLE po_line_comments
  ADD COLUMN flag         VARCHAR(20)  DEFAULT NULL
                          CHECK (flag IN ('info','warning','dispute')),
  ADD COLUMN resolved     BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN resolved_by  UUID         REFERENCES users(id),
  ADD COLUMN resolved_at  TIMESTAMPTZ  DEFAULT NULL;

CREATE INDEX idx_po_line_comments_flag ON po_line_comments(po_line_id) WHERE flag IS NOT NULL AND resolved = false;
