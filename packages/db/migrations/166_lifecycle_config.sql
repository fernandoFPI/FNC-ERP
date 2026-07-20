-- Migration 166: Configurable project lifecycle
-- Moves the hardcoded phase list + tab-to-phase gating into company-scoped config,
-- so client changes become settings edits, not code changes. Phase KEYS are kept
-- identical to the current hardcoded values (enquiry, scope_review, bidding,
-- client_approval, execution, closeout) — no project phase-value migration needed.

CREATE TABLE lifecycle_phases (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID         NOT NULL,
  key         VARCHAR(50)  NOT NULL,
  label       VARCHAR(100) NOT NULL,
  sequence    INT          NOT NULL,
  optional    BOOLEAN      NOT NULL DEFAULT false,   -- e.g. a skippable design gate
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, key)
);

-- Which module (tab) becomes available from which phase onward.
CREATE TABLE lifecycle_phase_modules (
  id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id     UUID         NOT NULL,
  module_key     VARCHAR(50)  NOT NULL,    -- tab key (overview, bidding, cost_control, …)
  min_phase_key  VARCHAR(50)  NOT NULL,    -- module shows once project reaches this phase
  sequence       INT          NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, module_key)
);

CREATE INDEX idx_lifecycle_phases_company  ON lifecycle_phases(company_id, sequence);
CREATE INDEX idx_lifecycle_modules_company ON lifecycle_phase_modules(company_id);

-- ── Seed every existing company with the current lifecycle ──────────────────
INSERT INTO lifecycle_phases (company_id, key, label, sequence, optional)
SELECT c.id, p.key, p.label, p.sequence, p.optional
FROM companies c
CROSS JOIN (VALUES
  ('enquiry',         'Client Enquiry',  1, false),
  ('scope_review',    'Scope Review',    2, false),
  ('bidding',         'Bidding',         3, false),
  ('client_approval', 'Client Approval', 4, false),
  ('execution',       'Execution',       5, false),
  ('closeout',        'Closeout',        6, false)
) AS p(key, label, sequence, optional)
ON CONFLICT (company_id, key) DO NOTHING;

-- Tab → minimum phase (mirrors the current hardcoded .filter() gating).
INSERT INTO lifecycle_phase_modules (company_id, module_key, min_phase_key, sequence)
SELECT c.id, m.module_key, m.min_phase_key, m.sequence
FROM companies c
CROSS JOIN (VALUES
  ('overview',         'enquiry',      1),
  ('client_documents', 'enquiry',      2),
  ('rfq_lines',        'scope_review', 3),
  ('bidding',          'enquiry',      4),
  ('contracts',        'bidding',      5),
  ('engineering',      'scope_review', 6),
  ('execution',        'execution',    7),
  ('handover',         'execution',    8),
  ('procurement',      'scope_review', 9),
  ('cost_control',     'scope_review', 10),
  ('variation_orders', 'execution',    11),
  ('risk_register',    'scope_review', 12),
  ('meetings',         'scope_review', 13),
  ('attachments',      'enquiry',      14),
  ('team',             'enquiry',      15),
  ('history',          'enquiry',      16)
) AS m(module_key, min_phase_key, sequence)
ON CONFLICT (company_id, module_key) DO NOTHING;

COMMENT ON TABLE lifecycle_phases        IS 'Company-configurable project lifecycle phases (keys stable; labels/order editable)';
COMMENT ON TABLE lifecycle_phase_modules IS 'Company-configurable tab→minimum-phase gating (which tab appears from which phase)';
