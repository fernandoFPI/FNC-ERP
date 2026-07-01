-- Migration 036: PO edit requests (pending-approval change log)

CREATE TABLE po_edit_requests (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id           UUID         NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  requested_by    UUID         NOT NULL REFERENCES users(id),
  status          VARCHAR(20)  NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','approved','rejected')),
  changes         JSONB        NOT NULL,
  request_notes   TEXT,
  reviewed_by     UUID         REFERENCES users(id),
  review_notes    TEXT,
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_po_edit_requests_po_id   ON po_edit_requests(po_id);
CREATE INDEX idx_po_edit_requests_pending ON po_edit_requests(po_id) WHERE status = 'pending';
