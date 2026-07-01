-- ── MIGRATION 040: VENDOR INVOICES / AP MODULE ──────────────────────────────

-- Add withholding tax rate to vendors (needed for AP calculations)
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS withholding_tax_rate NUMERIC(5,4) NOT NULL DEFAULT 0;

-- ── VENDOR INVOICES ───────────────────────────────────────────
CREATE TABLE vendor_invoices (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  vendor_id           UUID NOT NULL REFERENCES vendors(id),
  po_id               UUID REFERENCES purchase_orders(id),
  invoice_number      VARCHAR(100) NOT NULL,
  invoice_date        DATE NOT NULL,
  due_date            DATE NOT NULL,
  subtotal            NUMERIC(20,4) NOT NULL DEFAULT 0,
  tax_amount          NUMERIC(20,4) NOT NULL DEFAULT 0,
  wht_amount          NUMERIC(20,4) NOT NULL DEFAULT 0,
  total_amount        NUMERIC(20,4) NOT NULL DEFAULT 0,
  net_payable         NUMERIC(20,4) NOT NULL DEFAULT 0,
  amount_paid         NUMERIC(20,4) NOT NULL DEFAULT 0,
  currency_code       CHAR(3)       NOT NULL DEFAULT 'IQD',
  status              VARCHAR(20)   NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','approved','partially_paid','paid','cancelled')),
  analytic_account_id UUID REFERENCES analytic_accounts(id),
  cost_center_id      UUID REFERENCES cost_centers(id),
  submitted_by        UUID REFERENCES users(id),
  submitted_at        TIMESTAMPTZ,
  approved_by         UUID REFERENCES users(id),
  approved_at         TIMESTAMPTZ,
  rejected_by         UUID REFERENCES users(id),
  rejection_reason    TEXT,
  notes               TEXT,
  created_by          UUID NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, vendor_id, invoice_number)
);

-- ── VENDOR INVOICE LINES ──────────────────────────────────────
CREATE TABLE vendor_invoice_lines (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_invoice_id   UUID NOT NULL REFERENCES vendor_invoices(id) ON DELETE CASCADE,
  po_line_id          UUID REFERENCES po_lines(id),
  description         TEXT NOT NULL,
  qty                 NUMERIC(20,4) NOT NULL DEFAULT 1,
  unit_price          NUMERIC(20,4) NOT NULL DEFAULT 0,
  total_price         NUMERIC(20,4) NOT NULL DEFAULT 0,
  account_id          UUID REFERENCES chart_of_accounts(id),
  sequence            INTEGER NOT NULL DEFAULT 1,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── VENDOR PAYMENTS ───────────────────────────────────────────
CREATE TABLE vendor_payments (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id          UUID NOT NULL REFERENCES companies(id),
  vendor_invoice_id   UUID NOT NULL REFERENCES vendor_invoices(id) ON DELETE CASCADE,
  vendor_id           UUID NOT NULL REFERENCES vendors(id),
  payment_date        DATE NOT NULL,
  amount              NUMERIC(20,4) NOT NULL,
  currency_code       CHAR(3)       NOT NULL DEFAULT 'IQD',
  payment_method      VARCHAR(30)   NOT NULL DEFAULT 'bank_transfer'
    CHECK (payment_method IN ('bank_transfer','cheque','cash','other')),
  payment_reference   VARCHAR(255),
  posted              BOOLEAN NOT NULL DEFAULT false,
  journal_entry_id    UUID REFERENCES journal_entries(id),
  notes               TEXT,
  created_by          UUID NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── INDEXES ───────────────────────────────────────────────────
CREATE INDEX idx_vendor_invoices_company_status ON vendor_invoices(company_id, status);
CREATE INDEX idx_vendor_invoices_vendor ON vendor_invoices(vendor_id);
CREATE INDEX idx_vendor_invoices_po ON vendor_invoices(po_id) WHERE po_id IS NOT NULL;
CREATE INDEX idx_vendor_invoices_due_date ON vendor_invoices(due_date);
CREATE INDEX idx_vendor_invoice_lines_invoice ON vendor_invoice_lines(vendor_invoice_id);
CREATE INDEX idx_vendor_payments_invoice ON vendor_payments(vendor_invoice_id);
CREATE INDEX idx_vendor_payments_vendor ON vendor_payments(vendor_id);
CREATE INDEX idx_vendor_payments_date ON vendor_payments(payment_date);
