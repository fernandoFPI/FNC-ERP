BEGIN;

-- Allow 'last_cost' as a valid companies.interco_transfer_pricing_method —
-- the group wants cross-company transfers priced at whatever the sourcing
-- location's most-recently-recorded cost was (see resolveTransferPrice's new
-- 'last_cost' case in packages/fx), not avco's quantity-weighted blend across
-- lots, and not any markup on top.
ALTER TABLE companies DROP CONSTRAINT companies_interco_transfer_pricing_method_check;
ALTER TABLE companies ADD CONSTRAINT companies_interco_transfer_pricing_method_check
  CHECK (interco_transfer_pricing_method IN ('avco','cost_plus','market','standard','last_cost'));

UPDATE companies
SET interco_transfer_pricing_method = 'last_cost',
    interco_cost_plus_markup_pct = 0
WHERE is_active = true;

COMMIT;
