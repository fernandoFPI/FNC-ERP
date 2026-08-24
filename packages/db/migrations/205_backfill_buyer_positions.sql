-- Backfill: one 'buyer' position assignment per branch that has a default
-- buyer configured today, scoped to that branch specifically (not collapsed
-- into a single company-wide grant, which would incorrectly widen each
-- buyer's authority to every other branch too).
--
-- Branches whose configured default_procurement_user_id has no matching
-- employees row in the same company are silently skipped here (employee_id
-- is a NOT NULL FK) -- these need a manual follow-up: find them after this
-- migration runs with
--
--   SELECT cb.id, cb.name, cb.company_id, cb.default_procurement_user_id
--   FROM company_branches cb
--   WHERE cb.default_procurement_user_id IS NOT NULL
--     AND NOT EXISTS (
--       SELECT 1 FROM po_position_assignments ppa
--       WHERE ppa.branch_id = cb.id AND ppa.position = 'buyer'
--     );
--
-- and have an admin either create the missing employee record or assign the
-- branch's buyer position manually via the PO Positions page.
--
-- Any purchase order already sitting in items_bought/goods_received at
-- cutover keeps working for its original buyer regardless of this backfill,
-- via a permanent assigned_buyer_user_id fallback kept in the application
-- code (see markPOLineBought / myPOQueue / myApprovalQueue).
INSERT INTO po_position_assignments (company_id, employee_id, position, branch_id, assigned_by)
SELECT cb.company_id, e.id, 'buyer', cb.id, cb.default_procurement_user_id
FROM company_branches cb
JOIN employees e
  ON e.user_id = cb.default_procurement_user_id
 AND e.company_id = cb.company_id
WHERE cb.default_procurement_user_id IS NOT NULL;
