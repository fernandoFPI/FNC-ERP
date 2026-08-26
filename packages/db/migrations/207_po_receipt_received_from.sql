-- ── MIGRATION 207: PO RECEIPT — "RECEIVED FROM" EMPLOYEE ──────────────────
-- Store In previously displayed the PO's vendor as "Received From." That's
-- being replaced with a free-text name captured from an employee picker at
-- receiving time (mirrors received_by_name, which is also a free-text name
-- sourced from the same employee dropdown, not an FK — see migration 056).

ALTER TABLE po_receipts
  ADD COLUMN IF NOT EXISTS received_from_name TEXT;
