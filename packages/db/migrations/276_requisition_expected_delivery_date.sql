-- Requisitions never got an expected delivery date, unlike purchase_orders
-- (007_procurement_schema.sql). Nullable/optional by design — knowing when
-- items are needed is useful before a vendor is even picked, but nobody
-- should be blocked from submitting a requisition for lacking it.
ALTER TABLE requisitions
  ADD COLUMN IF NOT EXISTS expected_delivery_date DATE;
