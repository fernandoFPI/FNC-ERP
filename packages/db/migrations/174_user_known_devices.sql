-- Migration 174: persistent "known device" history for login notifications.
-- The "new device login" email check previously queried the live `sessions`
-- table, which gets hard-deleted on logout — so every login right after a
-- logout looked like a brand-new device. This table survives logout and is
-- only ever appended/updated, giving an accurate "have we seen this device
-- before" history independent of session lifecycle.

CREATE TABLE IF NOT EXISTS user_known_devices (
  user_id       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id     VARCHAR(100) NOT NULL,
  first_seen_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, device_id)
);
