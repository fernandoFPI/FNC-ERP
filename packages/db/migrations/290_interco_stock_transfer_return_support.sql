BEGIN;

-- 'last_cost' — createIntercoStockTransfer and issueMaterialIssue's
-- cross-company branch now record the real resolveTransferPrice method
-- instead of a hardcoded 'avco' literal, so this needs to accept whatever
-- companies.interco_transfer_pricing_method can hold (see migration 289).
ALTER TABLE interco_stock_transfers DROP CONSTRAINT interco_stock_transfers_pricing_method_check;
ALTER TABLE interco_stock_transfers ADD CONSTRAINT interco_stock_transfers_pricing_method_check
  CHECK (pricing_method IN ('avco','cost_plus','market','standard','last_cost'));

-- 'material_return' — createMaterialReturn now auto-creates an
-- interco_stock_transfer (+ linked pending interco_transaction) when a
-- return's destination is the group's central warehouse, mirroring how
-- issueMaterialIssue already does this for a cross-company Store Out
-- ('project_issue').
ALTER TABLE interco_stock_transfers DROP CONSTRAINT interco_stock_transfers_source_type_check;
ALTER TABLE interco_stock_transfers ADD CONSTRAINT interco_stock_transfers_source_type_check
  CHECK (source_type IN ('project_issue','manual','material_return'));

COMMIT;
