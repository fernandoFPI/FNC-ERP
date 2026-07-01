-- Migration 093: SAP-style Procure-to-Pay workflow
-- Adds: journal→PO links, journal auditor fields, vendor_invoice multi-PO,
--       payment_vouchers, payment_voucher_lines, payment_voucher_journals

-- ── 1. Link journal entries to multiple POs ───────────────────────────────────
CREATE TABLE IF NOT EXISTS journal_po_links (
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  po_id            UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  PRIMARY KEY (journal_entry_id, po_id)
);
CREATE INDEX IF NOT EXISTS idx_journal_po_links_je  ON journal_po_links(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_po_links_po  ON journal_po_links(po_id);

-- ── 2. Accountant + Auditor fields on journal entries ─────────────────────────
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS accountant_id UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS audited_by    UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS audited_at    TIMESTAMPTZ;

-- ── 3. vendor_invoices: allow multiple POs via junction table ─────────────────
--    Keep existing po_id column for backward compat (single-PO shortcut).
CREATE TABLE IF NOT EXISTS vendor_invoice_pos (
  vendor_invoice_id UUID NOT NULL REFERENCES vendor_invoices(id) ON DELETE CASCADE,
  po_id             UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  PRIMARY KEY (vendor_invoice_id, po_id)
);
CREATE INDEX IF NOT EXISTS idx_vi_pos_invoice ON vendor_invoice_pos(vendor_invoice_id);
CREATE INDEX IF NOT EXISTS idx_vi_pos_po      ON vendor_invoice_pos(po_id);

-- Backfill junction from existing po_id column
INSERT INTO vendor_invoice_pos (vendor_invoice_id, po_id)
SELECT id, po_id FROM vendor_invoices WHERE po_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ── 4. Payment Vouchers (سند صرف) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_vouchers (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  voucher_number    VARCHAR(50) NOT NULL,
  voucher_date      DATE NOT NULL,
  received_from     TEXT NOT NULL,
  reference_to      TEXT,
  bank_account_fund TEXT,
  total_amount_iqd  NUMERIC(20,4) NOT NULL DEFAULT 0,
  total_amount_usd  NUMERIC(20,4) NOT NULL DEFAULT 0,
  status            VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','approved','paid','cancelled')),
  cashier_id        UUID REFERENCES users(id),
  receiver_name     TEXT,
  audited_by        UUID REFERENCES users(id),
  audited_at        TIMESTAMPTZ,
  notes             TEXT,
  created_by        UUID NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, voucher_number)
);
CREATE INDEX IF NOT EXISTS idx_payment_vouchers_company  ON payment_vouchers(company_id);
CREATE INDEX IF NOT EXISTS idx_payment_vouchers_status   ON payment_vouchers(company_id, status);
CREATE INDEX IF NOT EXISTS idx_payment_vouchers_date     ON payment_vouchers(voucher_date);

-- ── 5. Payment Voucher lines (5-column account classification) ────────────────
CREATE TABLE IF NOT EXISTS payment_voucher_lines (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_voucher_id UUID NOT NULL REFERENCES payment_vouchers(id) ON DELETE CASCADE,
  statement          TEXT NOT NULL,
  acct_1             VARCHAR(30),   -- Directory No. / رقم الدليل
  acct_2             VARCHAR(30),
  acct_3             VARCHAR(30),
  acct_4             VARCHAR(30),
  acct_5             VARCHAR(30),
  amount_iqd         NUMERIC(20,4) NOT NULL DEFAULT 0,
  amount_usd         NUMERIC(20,4) NOT NULL DEFAULT 0,
  sequence           INTEGER NOT NULL DEFAULT 1,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pvl_voucher ON payment_voucher_lines(payment_voucher_id);

-- ── 6. Payment Voucher → multiple Journal Entries ─────────────────────────────
CREATE TABLE IF NOT EXISTS payment_voucher_journals (
  payment_voucher_id UUID NOT NULL REFERENCES payment_vouchers(id) ON DELETE CASCADE,
  journal_entry_id   UUID NOT NULL REFERENCES journal_entries(id),
  PRIMARY KEY (payment_voucher_id, journal_entry_id)
);
CREATE INDEX IF NOT EXISTS idx_pvj_voucher ON payment_voucher_journals(payment_voucher_id);
CREATE INDEX IF NOT EXISTS idx_pvj_journal ON payment_voucher_journals(journal_entry_id);
