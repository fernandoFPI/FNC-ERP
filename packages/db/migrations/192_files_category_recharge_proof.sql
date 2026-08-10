-- ── MIGRATION 192: add recharge_proof to files category constraint ───────────
ALTER TABLE files DROP CONSTRAINT IF EXISTS files_category_check;
ALTER TABLE files ADD CONSTRAINT files_category_check
  CHECK (category IN (
    'contract','identity','attachment','report',
    'po_receipt_photo','po_return_damage_photo','recharge_proof'
  ));
