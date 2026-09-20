BEGIN;

-- A company flagged here holds stock any other company's requisition/PO
-- can always see and source from during Inventory Check, regardless of
-- whether the requesting user has their own role grant in that company.
-- Data-driven rather than a hardcoded company id in resolver code, so it
-- stays correct if the group's central-warehouse company ever changes.
-- See requisitionStockAvailability/poStockAvailability/
-- confirmRequisitionInventoryCheck/confirmPOInventoryCheck in resolvers.ts
-- for every place this flag is read.
ALTER TABLE companies
  ADD COLUMN is_central_warehouse BOOLEAN NOT NULL DEFAULT false;

-- Nishtimani Factory holds essentially all real on-hand stock across the
-- group (1,934 products / ~203k units, vs. a handful at Nishtimani Yakam
-- and none at Al Watanyia as of this migration) — flip it on so every
-- company's requisitions/POs can already source from it without a
-- separate per-user access grant.
UPDATE companies SET is_central_warehouse = true
WHERE id = '00000000-0000-0000-0000-000000000002';

COMMIT;
