-- 178_notifications_push_sent
-- services/worker/src/jobs/{outbox-processor,contract-expiry-alerts}.ts have
-- inserted into notifications with a push_sent column (always literal false
-- at insert time — a future push-dispatch job would presumably flip it to
-- true once a Web Push notification is actually sent) at ~10 call sites for
-- as long as those files have existed, but the column was never migrated.
-- Every one of those inserts has been failing with "column push_sent does
-- not exist" — notifications creation across the whole worker has been
-- broken.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS push_sent BOOLEAN NOT NULL DEFAULT false;
