-- New PO lifecycle stage for employee-advance-funded POs only: after approval,
-- the assigned buyer opens the PO and ticks each line as bought before it
-- continues to goods_received. Vendor-AP POs are unaffected (they keep going
-- straight from approved -> goods_received via recordReceipt, as today).

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS assigned_buyer_user_id UUID REFERENCES users(id);

ALTER TABLE po_lines
  ADD COLUMN IF NOT EXISTS is_bought BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
ALTER TABLE purchase_orders
  ADD CONSTRAINT purchase_orders_status_check
  CHECK (status IN (
    'draft', 'inventory_check', 'store_pricing', 'market_pricing',
    'price_verification', 'pending_approval', 'approved', 'ready_to_issue',
    'items_bought', 'goods_received', 'finance_audit', 'invoiced',
    'completed', 'rejected', 'cancelled', 'deleted'
  ));
