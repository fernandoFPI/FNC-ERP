-- Migration 069: Fix rental_contracts.rental_type check constraint
-- Original migration 018 used ('external','internal') but the form and
-- business logic use ('short_term','long_term','project_based').

ALTER TABLE rental_contracts
  DROP CONSTRAINT IF EXISTS rental_contracts_rental_type_check;

-- Migrate any existing rows that used the old values
UPDATE rental_contracts SET rental_type = 'short_term'    WHERE rental_type = 'external';
UPDATE rental_contracts SET rental_type = 'long_term'     WHERE rental_type = 'internal';

ALTER TABLE rental_contracts
  ALTER COLUMN rental_type SET DEFAULT 'short_term';

ALTER TABLE rental_contracts
  ADD CONSTRAINT rental_contracts_rental_type_check
  CHECK (rental_type IN ('short_term', 'long_term', 'project_based'));
