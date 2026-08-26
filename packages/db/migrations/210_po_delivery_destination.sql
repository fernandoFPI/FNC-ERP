-- ── MIGRATION 210: PO DELIVERY DESTINATION ──────────────────────────────────
-- Whether a project-purpose PO's goods end up in company inventory or go
-- straight to the jobsite has to be known before the PO is approved — the
-- from-stock auto Store Out (issueStockForPOLines) fires at approval time,
-- well before anyone reaches the receiving step. So this is decided once, at
-- PO creation, not per receipt. Only meaningful for purpose='project' POs;
-- NULL for everything else.

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS delivery_destination TEXT
    CHECK (delivery_destination IN ('inventory', 'jobsite'));
