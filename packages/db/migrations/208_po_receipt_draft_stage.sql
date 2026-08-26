-- ── MIGRATION 208: STORE IN DRAFT STAGE ─────────────────────────────────────
-- Mirrors project_material_issues' draft/issued/cancelled pattern for
-- po_receipts. Existing receipts already had their qty_received/stock_moves
-- impact applied atomically at creation time (the old recordReceipt
-- behavior), so they backfill as 'confirmed' via the column default — only
-- receipts created after this migration start life as an editable draft
-- with zero inventory/PO impact until explicitly confirmed.

ALTER TABLE po_receipts
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('draft', 'confirmed', 'cancelled')),
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- Needed so a draft can capture a per-line actual price at receiving time
-- and have it applied to po_lines only when the receipt is confirmed,
-- instead of immediately (recordReceipt used to apply it straight away).
ALTER TABLE po_receipt_lines
  ADD COLUMN IF NOT EXISTS actual_unit_price NUMERIC(20,4);
