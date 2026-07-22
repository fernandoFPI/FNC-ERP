-- Migration 094: PO workflow redesign
-- Restructures PO status lifecycle to SAP-style P2P flow:
--   draft → inventory_check → ... → pending_approval → approved
--   → goods_received → finance_audit → invoiced → completed
-- Adds per-line finance audit columns.

BEGIN;

-- 1. Drop the old CHECK constraint
ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;

-- 2. Add new statuses, keeping all legacy ones temporarily for safe data migration
ALTER TABLE purchase_orders
  ADD CONSTRAINT purchase_orders_status_check
  CHECK (status IN (
    'draft', 'inventory_check', 'store_pricing', 'market_pricing',
    'price_verification', 'pending_approval', 'approved', 'ready_to_issue',
    'goods_received', 'finance_audit', 'invoiced',
    'completed', 'rejected', 'cancelled', 'deleted',
    -- legacy (kept until data migration below removes all rows with these values)
    'opening', 'review', 'dept_assigned'
  ));

-- 3. Data migration — map removed statuses to their equivalents
UPDATE purchase_orders SET status = 'draft'            WHERE status = 'opening';
UPDATE purchase_orders SET status = 'pending_approval' WHERE status = 'review';
UPDATE purchase_orders SET status = 'pending_approval' WHERE status = 'dept_assigned';

-- 4. Drop the temp constraint and apply the final clean one
ALTER TABLE purchase_orders DROP CONSTRAINT purchase_orders_status_check;
ALTER TABLE purchase_orders
  ADD CONSTRAINT purchase_orders_status_check
  CHECK (status IN (
    'draft', 'inventory_check', 'store_pricing', 'market_pricing',
    'price_verification', 'pending_approval', 'approved', 'ready_to_issue',
    'goods_received', 'finance_audit', 'invoiced',
    'completed', 'rejected', 'cancelled', 'deleted'
  ));

-- 5. Add per-line finance audit columns
ALTER TABLE po_lines
  ADD COLUMN IF NOT EXISTS audit_status VARCHAR(10)
    CHECK (audit_status IN ('pending', 'ok', 'flagged'))
    DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS audit_note TEXT;

COMMIT;
