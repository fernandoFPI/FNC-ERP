-- Mirrors purchase_orders.assigned_receiver_id (migration 092) — lets a
-- requisition carry a pre-picked "Received By" employee that
-- finishBuyingRequisition copies onto every child PO it forks, so it
-- isn't left blank (and Confirm Receipt gating falling back to
-- position-only) the way every requisition-originated PO is today.
ALTER TABLE requisitions ADD COLUMN assigned_receiver_id UUID REFERENCES employees(id);
