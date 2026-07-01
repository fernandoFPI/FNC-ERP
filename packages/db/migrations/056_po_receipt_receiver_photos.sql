-- ── MIGRATION 056: PO RECEIPT — RECEIVED BY NAME + LOCATION NOTES ──────────
-- received_by (UUID) tracks which system user logged the receipt.
-- received_by_name (TEXT) captures who physically received the goods
--   (could be a contractor / site foreman not in the system).
-- location_notes (TEXT) describes where goods were delivered
--   (job site address, floor, etc.) beyond the stock location dropdown.

ALTER TABLE po_receipts
  ADD COLUMN IF NOT EXISTS received_by_name  TEXT,
  ADD COLUMN IF NOT EXISTS location_notes    TEXT;
