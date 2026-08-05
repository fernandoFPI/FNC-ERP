-- 184_record_locks
-- Google-Docs-style "someone else is editing this" locking, agreed on
-- 2026-07-27 alongside the GraphQL subscriptions work (migration 182's
-- session/outbox live-update signals) but deferred to its own pass.
--
-- entity_type is a free-form string (same convention as pubsub.ts's
-- entityChanged channel), not an enum — 'journal_entry', 'purchase_order',
-- 'project_contract', 'project_variation_order' at launch, extensible to
-- more without a migration. Staleness (a tab closed without releasing) is
-- computed from last_heartbeat_at at read time, not swept by a cron — the
-- editing client heartbeats every ~20s; a lock past ~75s since its last
-- heartbeat is treated as available again.

CREATE TABLE record_locks (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type       VARCHAR(50) NOT NULL,
  entity_id         UUID        NOT NULL,
  company_id        UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  locked_by         UUID        NOT NULL REFERENCES users(id),
  locked_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entity_type, entity_id)
);
