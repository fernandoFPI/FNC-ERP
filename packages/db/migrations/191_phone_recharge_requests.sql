-- Phone recharge bundle requests: employee requests a recharge, an approver
-- signs off, a cost-center-assigned fulfiller buys it and uploads proof, and
-- the requester can only see that proof after confirming receipt.

-- ── Catalog of recharge bundles an employee can request ──────────────────────
CREATE TABLE recharge_bundles (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  amount        NUMERIC(20,4) NOT NULL CHECK (amount > 0),
  currency_code CHAR(3)     NOT NULL DEFAULT 'IQD',
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  sort_order    INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recharge_bundles_company_id ON recharge_bundles(company_id);

-- ── One assigned fulfiller per cost center ────────────────────────────────────
ALTER TABLE cost_centers
  ADD COLUMN IF NOT EXISTS default_recharge_fulfiller_id UUID REFERENCES users(id);

-- ── The requests themselves ───────────────────────────────────────────────────
CREATE TABLE recharge_requests (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  requested_by      UUID        NOT NULL REFERENCES users(id),
  cost_center_id    UUID        NOT NULL REFERENCES cost_centers(id),
  bundle_id         UUID        NOT NULL REFERENCES recharge_bundles(id),
  phone_number      VARCHAR(50) NOT NULL,
  notes             TEXT,
  status            VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','fulfilled','confirmed','cancelled')),
  approved_by       UUID        REFERENCES users(id),
  approved_at       TIMESTAMPTZ,
  rejection_reason  TEXT,
  fulfilled_by      UUID        REFERENCES users(id),
  fulfilled_at      TIMESTAMPTZ,
  photo_file_id     UUID        REFERENCES files(id),
  confirmed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recharge_requests_company_id ON recharge_requests(company_id);
CREATE INDEX idx_recharge_requests_requested_by ON recharge_requests(requested_by);
CREATE INDEX idx_recharge_requests_cost_center_id ON recharge_requests(cost_center_id);
CREATE INDEX idx_recharge_requests_status ON recharge_requests(status);
