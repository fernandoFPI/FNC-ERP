-- Fixed Assets Module
-- Asset categories with default depreciation settings
CREATE TABLE asset_categories (
  id                               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                       UUID NOT NULL REFERENCES companies(id),
  name                             VARCHAR(100) NOT NULL,
  default_depreciation_method      VARCHAR(20) NOT NULL DEFAULT 'straight_line'
    CHECK (default_depreciation_method IN ('straight_line','declining_balance')),
  default_useful_life_months       INTEGER,
  default_declining_rate           NUMERIC(6,4),
  created_at                       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, name)
);

-- Fixed asset register
CREATE TABLE fixed_assets (
  id                               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                       UUID NOT NULL REFERENCES companies(id),
  asset_number                     VARCHAR(50) NOT NULL,
  name                             VARCHAR(200) NOT NULL,
  description                      TEXT,
  category_id                      UUID REFERENCES asset_categories(id),
  serial_number                    VARCHAR(100),
  location                         VARCHAR(200),

  -- Financials
  purchase_date                    DATE NOT NULL,
  purchase_cost                    NUMERIC(18,2) NOT NULL CHECK (purchase_cost > 0),
  salvage_value                    NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (salvage_value >= 0),
  useful_life_months               INTEGER NOT NULL CHECK (useful_life_months > 0),
  depreciation_method              VARCHAR(20) NOT NULL DEFAULT 'straight_line'
    CHECK (depreciation_method IN ('straight_line','declining_balance')),
  declining_rate                   NUMERIC(6,4),

  -- Running balances (updated each depreciation posting)
  accumulated_depreciation         NUMERIC(18,2) NOT NULL DEFAULT 0,
  book_value                       NUMERIC(18,2) NOT NULL,

  -- Linked CoA accounts
  asset_account_id                 UUID REFERENCES chart_of_accounts(id),
  accum_dep_account_id             UUID REFERENCES chart_of_accounts(id),
  dep_expense_account_id           UUID REFERENCES chart_of_accounts(id),

  -- Lifecycle
  status                           VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','fully_depreciated','disposed')),
  activation_date                  DATE,
  disposal_date                    DATE,
  disposal_proceeds                NUMERIC(18,2),
  disposal_gain_loss               NUMERIC(18,2),
  disposal_notes                   TEXT,

  -- Optional links
  vendor_id                        UUID REFERENCES vendors(id),
  notes                            TEXT,
  created_by                       UUID REFERENCES users(id),
  created_at                       TIMESTAMPTZ DEFAULT NOW(),
  updated_at                       TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (company_id, asset_number)
);

-- Full depreciation schedule generated on activation
CREATE TABLE asset_depreciation_schedule (
  id                               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id                         UUID NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  period                           VARCHAR(7) NOT NULL,      -- 'YYYY-MM'
  period_date                      DATE NOT NULL,            -- first day of period
  depreciation_amount              NUMERIC(18,2) NOT NULL,
  accumulated_depreciation         NUMERIC(18,2) NOT NULL,
  book_value_after                 NUMERIC(18,2) NOT NULL,
  status                           VARCHAR(10) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','posted','skipped')),
  journal_entry_id                 UUID REFERENCES journal_entries(id),
  posted_at                        TIMESTAMPTZ,
  UNIQUE (asset_id, period)
);

-- Indexes
CREATE INDEX idx_fixed_assets_company   ON fixed_assets(company_id);
CREATE INDEX idx_fixed_assets_status    ON fixed_assets(status);
CREATE INDEX idx_fixed_assets_category  ON fixed_assets(category_id);
CREATE INDEX idx_dep_schedule_asset     ON asset_depreciation_schedule(asset_id);
CREATE INDEX idx_dep_schedule_period    ON asset_depreciation_schedule(period);
CREATE INDEX idx_dep_schedule_status    ON asset_depreciation_schedule(status);
CREATE INDEX idx_asset_categories_co    ON asset_categories(company_id);
