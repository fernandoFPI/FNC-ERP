-- Self-service Store Categories for products (previously a hardcoded list
-- duplicated across 3 frontend files, tied to a static backend prefix map
-- in document-sequence.ts). This table becomes the single source of truth;
-- admins manage it at Settings -> Store Categories.
--
-- Seeds the existing 19 stores exactly as-is (same names/prefixes/slugs as
-- PRODUCT_STORE_SKU_PREFIXES and migration 215) so nothing changes for
-- current data. New categories an admin adds get their own document_sequences
-- row provisioned at creation time (see createProductStoreCategory in
-- packages/db/src/product-store-category.ts) — unlike these 19, which
-- already had their counters seeded from real SKU history by migration 215.

CREATE TABLE product_store_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  sku_prefix VARCHAR(20) NOT NULL,
  slug VARCHAR(50) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, name),
  UNIQUE(company_id, sku_prefix),
  UNIQUE(company_id, slug)
);

CREATE INDEX idx_product_store_categories_company ON product_store_categories(company_id) WHERE is_active = true;

INSERT INTO product_store_categories (company_id, name, sku_prefix, slug)
SELECT c.id, v.name, v.prefix, v.slug
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
  ('Steel Store', 'STEEL', 'steel')
) AS v(name, prefix, slug)
ON CONFLICT (company_id, name) DO NOTHING;
