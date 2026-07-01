-- ── VENDORS ───────────────────────────────────────────────────
CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  legal_name VARCHAR(255),
  tax_id VARCHAR(100),
  currency_code CHAR(3) NOT NULL DEFAULT 'IQD',
  payment_terms_days INTEGER NOT NULL DEFAULT 30,
  address TEXT,
  city VARCHAR(100),
  country_code CHAR(2) DEFAULT 'IQ',
  contact_name VARCHAR(255),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  bank_name VARCHAR(255),
  bank_account VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── PURCHASE ORDERS ───────────────────────────────────────────
CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  po_number VARCHAR(50) NOT NULL,
  vendor_id UUID NOT NULL REFERENCES vendors(id),
  analytic_account_id UUID REFERENCES analytic_accounts(id),
  status VARCHAR(30) NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft','submitted','pending_review','under_review',
      'approved_l1','approved_l2','ordered','partially_received',
      'fully_received','invoiced','closed','rejected','cancelled'
    )),
  currency_code CHAR(3) NOT NULL DEFAULT 'IQD',
  fx_rate NUMERIC(20,6) NOT NULL DEFAULT 1,
  subtotal NUMERIC(20,4) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(20,4) NOT NULL DEFAULT 0,
  total_amount NUMERIC(20,4) NOT NULL DEFAULT 0,
  notes TEXT,
  expected_delivery_date DATE,
  assigned_to UUID REFERENCES users(id),
  submitted_by UUID REFERENCES users(id),
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  ordered_at TIMESTAMPTZ,
  journal_entry_id UUID REFERENCES journal_entries(id),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, po_number)
);

-- ── PO LINES ──────────────────────────────────────────────────
CREATE TABLE po_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  description VARCHAR(500) NOT NULL,
  product_id UUID,
  qty_ordered NUMERIC(20,4) NOT NULL CHECK (qty_ordered > 0),
  qty_received NUMERIC(20,4) NOT NULL DEFAULT 0,
  unit_price NUMERIC(20,4) NOT NULL CHECK (unit_price >= 0),
  currency_code CHAR(3) NOT NULL DEFAULT 'IQD',
  uom VARCHAR(20) NOT NULL DEFAULT 'unit',
  total_price NUMERIC(20,4) NOT NULL,
  account_id UUID REFERENCES chart_of_accounts(id),
  UNIQUE(po_id, line_number)
);

-- ── PO APPROVAL LOG ────────────────────────────────────────────
CREATE TABLE po_approval_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  from_status VARCHAR(30) NOT NULL,
  to_status VARCHAR(30) NOT NULL,
  action VARCHAR(30) NOT NULL
    CHECK (action IN ('submit','review','start_review','approve_l1','approve_l2',
                      'reject','cancel','mark_ordered','receive_partial','receive_full','invoice','close')),
  actor_id UUID NOT NULL REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── PO RECEIPTS ────────────────────────────────────────────────
CREATE TABLE po_receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  receipt_number VARCHAR(50) NOT NULL,
  received_date DATE NOT NULL,
  received_by UUID NOT NULL REFERENCES users(id),
  warehouse_location_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── PO RECEIPT LINES ──────────────────────────────────────────
CREATE TABLE po_receipt_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  receipt_id UUID NOT NULL REFERENCES po_receipts(id) ON DELETE CASCADE,
  po_line_id UUID NOT NULL REFERENCES po_lines(id),
  qty_received NUMERIC(20,4) NOT NULL CHECK (qty_received > 0)
);
