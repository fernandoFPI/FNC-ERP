-- ── MOBILE SYNC CURSORS ───────────────────────────────────────
-- Tracks the last successful sync time per device per entity type.
-- Server uses this to calculate the delta since the last sync.
CREATE TABLE mobile_sync_cursors (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id       VARCHAR(255) NOT NULL,
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type     VARCHAR(50) NOT NULL,
    -- profile, attendance, locations, projects, approvals, products, leave
  last_synced_at  TIMESTAMPTZ NOT NULL,
  records_synced  INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (device_id, user_id, entity_type)
);

-- ── OFFLINE ACTION LOG ────────────────────────────────────────
-- Every action taken offline is logged here when submitted.
-- Provides a full audit trail of offline activity.
CREATE TABLE offline_action_log (
  id                        UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id                 VARCHAR(255) NOT NULL,
  user_id                   UUID        NOT NULL REFERENCES users(id),
  action_type               VARCHAR(50) NOT NULL
    CHECK (action_type IN (
      'punch_in',
      'punch_out',
      'approve_overtime',
      'reject_overtime',
      'approve_leave',
      'reject_leave',
      'create_material_issue'
    )),
  payload                   JSONB       NOT NULL,
  action_taken_at           TIMESTAMPTZ NOT NULL,
    -- when the user took the action on-device (may be in the past)
  submitted_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- when the device sent it to the server
  offline_duration_seconds  INTEGER,
  status                    VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processed','rejected','conflict','duplicate')),
  result_record_id          UUID,
  rejection_reason          TEXT,
  processed_at              TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── DEVICE REGISTRY ───────────────────────────────────────────
-- Tracks known mobile devices for sync coordination and push routing.
CREATE TABLE device_registry (
  id                     UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id              VARCHAR(255) NOT NULL UNIQUE,
  user_id                UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform               VARCHAR(10) NOT NULL CHECK (platform IN ('ios','android','unknown')),
  device_name            VARCHAR(255),
  app_version            VARCHAR(50),
  os_version             VARCHAR(50),
  last_sync_at           TIMESTAMPTZ,
  last_seen_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  push_token             TEXT,
  push_token_updated_at  TIMESTAMPTZ,
  is_active              BOOLEAN     NOT NULL DEFAULT true,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── INDEXES ───────────────────────────────────────────────────
CREATE INDEX idx_sync_cursors_device_user
  ON mobile_sync_cursors(device_id, user_id);
CREATE INDEX idx_sync_cursors_entity
  ON mobile_sync_cursors(entity_type, last_synced_at DESC);

CREATE INDEX idx_offline_actions_user
  ON offline_action_log(user_id, created_at DESC);
CREATE INDEX idx_offline_actions_status
  ON offline_action_log(status)
  WHERE status = 'pending';
CREATE INDEX idx_offline_actions_device
  ON offline_action_log(device_id, created_at DESC);

CREATE INDEX idx_device_registry_user
  ON device_registry(user_id);
CREATE INDEX idx_device_registry_push
  ON device_registry(push_token)
  WHERE push_token IS NOT NULL AND is_active = true;
