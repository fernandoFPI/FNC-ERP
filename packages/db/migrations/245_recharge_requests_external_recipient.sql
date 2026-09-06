-- Migration 245: Allow a recharge request to be filed for someone who isn't
-- in the system yet (no employee record / no login) -- e.g. a driver or a
-- shared company phone. requested_by becomes optional; requested_for_name
-- carries a plain-text label instead. Exactly one of the two must be set.

ALTER TABLE recharge_requests ALTER COLUMN requested_by DROP NOT NULL;
ALTER TABLE recharge_requests ADD COLUMN requested_for_name VARCHAR(255);

ALTER TABLE recharge_requests ADD CONSTRAINT recharge_requests_requester_xor CHECK (
  (requested_by IS NOT NULL AND requested_for_name IS NULL) OR
  (requested_by IS NULL AND requested_for_name IS NOT NULL)
);
