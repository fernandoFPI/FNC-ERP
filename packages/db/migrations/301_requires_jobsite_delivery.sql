BEGIN;

-- A company flagged here can't choose "Delivered to Inventory" for a
-- project-purpose requisition/PO at all -- every line goes straight to the
-- jobsite. Data-driven rather than a hardcoded company id in resolver code,
-- same reasoning as is_central_warehouse (280_companies_central_warehouse).
-- See createRequisition/createPurchaseOrder/applyRequisitionEditChanges/
-- applyPOEditChanges in resolvers.ts for every place this flag is read.
ALTER TABLE companies
  ADD COLUMN requires_jobsite_delivery BOOLEAN NOT NULL DEFAULT false;

-- Nishtimani Yakam and Al Watanyia don't run their own warehouse operation
-- (Nishtimani Factory is the group's real central warehouse -- see
-- is_central_warehouse above) -- every project purchase for these two is
-- delivered straight to the jobsite, never "into inventory".
UPDATE companies SET requires_jobsite_delivery = true
WHERE id IN (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000003'
);

COMMIT;
