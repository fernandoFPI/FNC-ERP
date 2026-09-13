-- G1 Phase 3 Milestone A screen 3 — Items Bought needs a real vendors row
-- to point recordLinePurchase's vendorId at for a genuine cash purchase
-- (petty cash, no real vendor to track) — vendorId is NOT NULL, so there
-- is no sentinel-free way around having one. One designated vendor per
-- company, found-or-created lazily by ensureCashPurchaseVendor (gateway
-- resolver) rather than seeded here, since seeding would need a name/
-- currency decision this migration shouldn't make on a company's behalf.

BEGIN;

ALTER TABLE vendors
  ADD COLUMN is_cash_purchase BOOLEAN NOT NULL DEFAULT false;

-- At most one per company — ensureCashPurchaseVendor's find-or-create
-- relies on this to stay a safe upsert-by-lookup under concurrent calls.
CREATE UNIQUE INDEX idx_vendors_one_cash_purchase_per_company
  ON vendors(company_id) WHERE is_cash_purchase = true;

COMMIT;
