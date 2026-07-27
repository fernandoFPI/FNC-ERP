-- 180_user_invitation_companies
-- Lets a single invitation grant access to multiple companies at once.
-- user_invitations.company_id/role/module (all already nullable) are no
-- longer written to going forward — the per-company grants now live here.

CREATE TABLE IF NOT EXISTS user_invitation_companies (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invitation_id UUID NOT NULL REFERENCES user_invitations(id) ON DELETE CASCADE,
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role          VARCHAR(50) NOT NULL,
  module        VARCHAR(50) NOT NULL DEFAULT 'all',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (invitation_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_uic_invitation ON user_invitation_companies(invitation_id);
CREATE INDEX IF NOT EXISTS idx_uic_company ON user_invitation_companies(company_id);
