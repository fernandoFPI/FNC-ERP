-- G1 Phase 4 — requisitions never got the position-holder stamping
-- columns purchase_orders has had since migration 030. Same four columns,
-- same meaning: which employee performed each pre-approval pricing stage.
-- Stamped by confirmRequisitionInventoryCheck/submitRequisitionStorePricing/
-- submitRequisitionMarketPricing/verifyRequisitionPrices, mirroring their
-- purchase_orders counterparts exactly.
ALTER TABLE requisitions
  ADD COLUMN IF NOT EXISTS store_keeper_id        UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS store_pricing_id       UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS procurement_officer_id UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS procurement_2nd_id     UUID REFERENCES employees(id);
