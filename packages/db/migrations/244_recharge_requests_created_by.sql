-- Migration 244: Track who actually filed a recharge request, separate from
-- who it's for. createRechargeRequest always set requested_by to the caller
-- (self-service only) -- letting a recharge admin file on someone else's
-- behalf needs requested_by to stay "who this recharge is for" while a new
-- column records who actually submitted it.

ALTER TABLE recharge_requests ADD COLUMN created_by UUID REFERENCES users(id);

-- Backfill: every existing row was self-submitted, so the submitter is the
-- same person as the requester.
UPDATE recharge_requests SET created_by = requested_by WHERE created_by IS NULL;

ALTER TABLE recharge_requests ALTER COLUMN created_by SET NOT NULL;
