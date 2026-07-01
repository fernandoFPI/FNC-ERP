-- ── PERMISSION REGISTRY ──────────────────────────────────────
CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key VARCHAR(120) NOT NULL UNIQUE,
  module VARCHAR(60) NOT NULL,
  submodule VARCHAR(60) NOT NULL,
  action VARCHAR(30) NOT NULL,
  label VARCHAR(120) NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── USER PERMISSIONS ─────────────────────────────────────────
CREATE TABLE user_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  permission_key VARCHAR(120) NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
  access_level VARCHAR(20) NOT NULL DEFAULT 'none'
    CHECK (access_level IN ('none','view','edit','approve','admin')),
  granted_by UUID REFERENCES users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, company_id, permission_key)
);

-- ── ROLE TEMPLATES ───────────────────────────────────────────
CREATE TABLE role_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── ROLE TEMPLATE PERMISSIONS ────────────────────────────────
CREATE TABLE role_template_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES role_templates(id) ON DELETE CASCADE,
  permission_key VARCHAR(120) NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
  access_level VARCHAR(20) NOT NULL DEFAULT 'view'
    CHECK (access_level IN ('view','edit','approve','admin')),
  UNIQUE (template_id, permission_key)
);

-- ── INDEXES ──────────────────────────────────────────────────
CREATE INDEX idx_user_permissions_user_company ON user_permissions(user_id, company_id);
CREATE INDEX idx_user_permissions_key ON user_permissions(permission_key);
CREATE INDEX idx_permissions_module ON permissions(module);
CREATE INDEX idx_role_template_permissions_template ON role_template_permissions(template_id);
