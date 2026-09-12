-- G1 Phase 3 — third of three call sites migrating from direct PO creation
-- to requisition-first purchasing (Project done, Vendor done, this is
-- Manufacturing Order). Mirrors purchase_orders.linked_mo_id exactly
-- (047_po_purpose_and_stock_split.sql) so a requisition raised for a
-- manufacturing order's missing components can carry that link forward.
-- finishBuyingRequisition's fork propagates it onto the resulting child
-- PO, so the existing MO-consumption-on-receipt logic (which only ever
-- reads purchase_orders.linked_mo_id, never anything requisition-specific)
-- keeps working unchanged.

BEGIN;

ALTER TABLE requisitions
  ADD COLUMN linked_mo_id UUID REFERENCES manufacturing_orders(id);

COMMIT;
