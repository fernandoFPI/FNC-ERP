-- ── MIGRATION 047: PO PURPOSE, STOCK SPLIT, MO COMPONENT LINKS ──────────────

-- 1. Add purpose + linked IDs to purchase_orders
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS purpose VARCHAR(20) NOT NULL DEFAULT 'stock'
    CHECK (purpose IN ('project', 'manufacturing', 'stock')),
  ADD COLUMN IF NOT EXISTS linked_project_id UUID REFERENCES projects(id),
  ADD COLUMN IF NOT EXISTS linked_mo_id UUID REFERENCES manufacturing_orders(id);

-- 2. Add pricing + stock columns to po_lines (some were missing from migration 030)
ALTER TABLE po_lines
  ADD COLUMN IF NOT EXISTS market_price          NUMERIC(20,4),
  ADD COLUMN IF NOT EXISTS market_price_currency CHAR(3),
  ADD COLUMN IF NOT EXISTS verified_price        NUMERIC(20,4),
  ADD COLUMN IF NOT EXISTS verified_price_currency CHAR(3),
  ADD COLUMN IF NOT EXISTS in_stock              BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS qty_from_stock        NUMERIC(20,4) NOT NULL DEFAULT 0;

-- 3. Replace status constraint to add ready_to_issue
ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_status_check
  CHECK (status IN (
    'opening','inventory_check','store_pricing','market_pricing',
    'price_verification','review','pending_approval','dept_assigned',
    'approved','ready_to_issue','completed','deleted'
  ));

-- 4. Link table: PO lines → MO BOM components (for auto-status updates on receipt)
CREATE TABLE IF NOT EXISTS po_mo_component_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_line_id UUID NOT NULL REFERENCES po_lines(id) ON DELETE CASCADE,
  mo_id UUID NOT NULL REFERENCES manufacturing_orders(id) ON DELETE CASCADE,
  bom_line_id UUID REFERENCES bom_lines(id),
  qty_allocated NUMERIC(20,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(po_line_id, bom_line_id)
);
