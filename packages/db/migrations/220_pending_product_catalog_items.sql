-- Store keeper's worklist: PO lines that arrived (warehouse receipt or
-- direct-to-jobsite delivery) with no catalog product_id — a buyer typed a
-- brand-new item as free text with no matching product picked. Queued here
-- rather than blocking receiving, since a jobsite delivery has no
-- store-keeper-gated action to block on at all (see migration 209,
-- recordDirectDelivery never touches stock/inventory) — the store keeper
-- works this list at their own pace instead of holding up procurement or
-- site logistics. UNIQUE(po_line_id) + ON CONFLICT DO NOTHING at insert
-- time means a PO line received across multiple partial receipts only ever
-- gets queued once.
CREATE TABLE pending_product_catalog_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  po_line_id UUID NOT NULL REFERENCES po_lines(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  qty NUMERIC(20,4),
  uom VARCHAR(20),
  unit_price NUMERIC(20,4),
  currency_code CHAR(3),
  source VARCHAR(20) NOT NULL CHECK (source IN ('store_in','direct_delivery')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved')),
  resolved_product_id UUID REFERENCES products(id),
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(po_line_id)
);

CREATE INDEX idx_pending_product_catalog_items_company_status
  ON pending_product_catalog_items(company_id, status);
