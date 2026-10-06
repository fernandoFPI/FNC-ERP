-- Migration 294: Reverse a confirmed Store In receipt
-- ─────────────────────────────────────────────────────────────────────────
-- Undoing a confirmed receipt (stock already moved, product cost already
-- updated, PO status already auto-advanced) is a real, audited correction —
-- not the same as cancelling a draft (status 'cancelled', which never
-- touched anything). 'reversed' is its own terminal status so the history
-- stays honest: this receipt DID happen, then was explicitly undone, with
-- who/when/why recorded — never reused 'cancelled', and never re-confirmable.

ALTER TABLE po_receipts DROP CONSTRAINT po_receipts_status_check;
ALTER TABLE po_receipts ADD CONSTRAINT po_receipts_status_check
  CHECK (status IN ('draft', 'confirmed', 'cancelled', 'reversed'));

ALTER TABLE po_receipts
  ADD COLUMN IF NOT EXISTS reversed_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversal_reason TEXT;
