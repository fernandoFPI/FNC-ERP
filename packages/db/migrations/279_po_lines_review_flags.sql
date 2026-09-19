-- Line-level rejection flags for PO/requisition price_verification and
-- pending_approval review. po_lines is the one table both purchase_orders
-- and requisitions' lines live in (po_id vs requisition_id), so this one
-- migration covers both document types.
--
-- Lifecycle: flagged_at/flag_reason/flagged_by/flagged_from_status are set
-- together when a reviewer rejects with at least one line flagged.
-- flag_addressed_at is stamped automatically the moment that specific line
-- is next touched by the forward-moving mutation for whichever stage it was
-- sent back to (confirm inventory check, submit store/market pricing) —
-- downgrades the flag from "open" to "addressed, awaiting confirmation" in
-- the UI, but does not clear it. Only flag_resolved_at/flag_resolved_by,
-- set by resolveLineFlag (gated to the same authority that could have
-- created a flag from that stage), actually clears the highlight. Same
-- actor-column convention as short_marked_by/closed_by (migrations 264/267).
BEGIN;

ALTER TABLE po_lines
  ADD COLUMN flag_reason TEXT,
  ADD COLUMN flagged_at TIMESTAMPTZ,
  ADD COLUMN flagged_by UUID REFERENCES users(id),
  ADD COLUMN flagged_from_status VARCHAR(30),
  ADD COLUMN flag_addressed_at TIMESTAMPTZ,
  ADD COLUMN flag_resolved_at TIMESTAMPTZ,
  ADD COLUMN flag_resolved_by UUID REFERENCES users(id);

CREATE INDEX idx_po_lines_open_flags ON po_lines (id) WHERE flagged_at IS NOT NULL AND flag_resolved_at IS NULL;

COMMIT;
