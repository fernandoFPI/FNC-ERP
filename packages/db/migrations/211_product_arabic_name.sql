-- ── MIGRATION 211: PRODUCT ARABIC NAME ──────────────────────────────────────
-- Products previously had no structured place for an Arabic name — some
-- product records had it stuffed into the free-text `description` field as
-- a workaround. This adds a real, optional field so every place that lets a
-- user pick a product (PO lines, Store Out, stock adjustments, transfers,
-- BOM components, etc.) can show both names. Existing `description` values
-- are left untouched — no reliable way to tell which of them are actually
-- an Arabic name vs. a real description.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS name_ar TEXT;
