-- Inter-company transactions between FNC entities
CREATE TABLE interco_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_company_id UUID NOT NULL REFERENCES companies(id),
  to_company_id UUID NOT NULL REFERENCES companies(id),
  transaction_type VARCHAR(50) NOT NULL
    CHECK (transaction_type IN (
      'goods_transfer',
      'service_charge',
      'equipment_rental',
      'management_fee'
    )),
  amount NUMERIC(20,4) NOT NULL CHECK (amount > 0),
  currency_code CHAR(3) NOT NULL DEFAULT 'IQD',
  fx_rate NUMERIC(20,6) NOT NULL DEFAULT 1,
  description TEXT,
  reference VARCHAR(100),
  from_journal_entry_id UUID REFERENCES journal_entries(id),
  to_journal_entry_id UUID REFERENCES journal_entries(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','posted','cancelled')),
  created_by UUID NOT NULL REFERENCES users(id),
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (from_company_id <> to_company_id)
);
