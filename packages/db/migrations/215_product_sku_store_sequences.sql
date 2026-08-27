-- Per-store/per-category SKU numbering, continuing the exact prefix
-- convention already used by the ~6,900 real imported products (confirmed
-- 1:1 store->prefix correlation with zero exceptions before writing this).
-- Each (company, prefix) gets its own document_sequences row under
-- doc_type = 'product_<slug>' (not registered in DOC_TYPES / the Settings ->
-- Document Numbering page — these are a fixed domain rule tied to the real
-- store list, not a knob an admin should be retuning), seeded to continue
-- past whatever that company's highest existing number is for that prefix.
INSERT INTO document_sequences (company_id, doc_type, prefix, next_number, pad_length, year_in_number, separator)
SELECT
  c.id,
  'product_' || pfx.slug,
  pfx.prefix,
  COALESCE(
    (
      SELECT MAX((regexp_match(p.sku, '^' || pfx.prefix || '-([0-9]+)$'))[1]::int)
      FROM products p
      WHERE p.company_id = c.id AND p.sku LIKE pfx.prefix || '-%'
    ),
    0
  ) + 1,
  3,
  false,
  '-'
FROM companies c
CROSS JOIN (VALUES
  ('AC Unit Store', 'AC', 'ac'),
  ('Cleaning Materials Store', 'CLEAN', 'clean'),
  ('Ducts Store', 'DUCT', 'duct'),
  ('Electrical Equipment Store', 'ELEC', 'elec'),
  ('Factory Store', 'FACT', 'fact'),
  ('Frame Store', 'FRAME', 'frame'),
  ('Furniture Store', 'FURN', 'furn'),
  ('General Construction Store', 'CONST', 'const'),
  ('General Store', 'GEN', 'gen'),
  ('Iron Doors Store', 'DOOR', 'door'),
  ('Old Iron Boards Store', 'OIB', 'oib'),
  ('Outside Area Cables', 'CABLE', 'cable'),
  ('Paint Store', 'PAINT', 'paint'),
  ('Plumbing Store', 'PLMB', 'plmb'),
  ('PVC & Aluminum Store', 'PVCAL', 'pvcal'),
  ('PVC Store', 'PVC', 'pvc'),
  ('Safety Store', 'SAFE', 'safe'),
  ('Sandwich, Plywood, Vinyl', 'SPV', 'spv'),
  ('Steel Store', 'STEEL', 'steel'),
  -- category-level fallbacks for the (currently almost unused) non-raw-material categories
  ('__category_finished_goods', 'FG', 'cat_finished_goods'),
  ('__category_consumable', 'CONS', 'cat_consumable'),
  ('__category_service', 'SVC', 'cat_service')
) AS pfx(store, prefix, slug)
ON CONFLICT (company_id, doc_type) DO NOTHING;
