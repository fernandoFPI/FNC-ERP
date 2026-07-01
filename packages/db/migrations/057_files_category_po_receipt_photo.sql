-- ── MIGRATION 057: add po_receipt_photo to files category constraint ─────────
ALTER TABLE files DROP CONSTRAINT IF EXISTS files_category_check;
ALTER TABLE files ADD CONSTRAINT files_category_check
  CHECK (category IN ('contract','identity','attachment','report','po_receipt_photo'));
