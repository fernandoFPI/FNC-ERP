-- Migration 073: Add 'closed' to rental_contracts status check
-- The closeRentalContract resolver uses status='closed' but migration 018
-- only listed ('draft','active','completed','cancelled').
ALTER TABLE rental_contracts
  DROP CONSTRAINT IF EXISTS rental_contracts_status_check;

ALTER TABLE rental_contracts
  ADD CONSTRAINT rental_contracts_status_check
  CHECK (status IN ('draft','active','completed','cancelled','closed'));
