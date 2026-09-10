-- requisition_approval_log — mirrors po_approval_log exactly, for the
-- same reason it exists: an append-only status-transition history per
-- requisition. action is TEXT from the start (not a length-capped
-- VARCHAR(30) with a fixed-list CHECK) — po_approval_log shipped that
-- way in migration 007 and it broke the moment an action name exceeded
-- 30 characters (migration 232 fixed it after the fact, action names
-- like 'reject_verification_to_market_pricing' are 37 chars). No reason
-- to repeat that mistake here.
CREATE TABLE requisition_approval_log (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requisition_id UUID NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  from_status   TEXT NOT NULL,
  to_status     TEXT NOT NULL,
  action        TEXT NOT NULL,
  actor_id      UUID NOT NULL REFERENCES users(id),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_requisition_approval_log_req ON requisition_approval_log(requisition_id, created_at DESC);
