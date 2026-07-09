-- ── MIGRATION 112: PO RETURN DAMAGE PHOTOS + SALARY DEDUCTIONS ───────────────

-- Allow damage photos in the files category constraint
ALTER TABLE files DROP CONSTRAINT IF EXISTS files_category_check;
ALTER TABLE files ADD CONSTRAINT files_category_check
  CHECK (category IN (
    'contract','identity','attachment','report',
    'po_receipt_photo','po_return_damage_photo'
  ));

-- Allow po_return as an attachment entity type
ALTER TABLE document_attachments DROP CONSTRAINT IF EXISTS document_attachments_entity_type_check;
ALTER TABLE document_attachments ADD CONSTRAINT document_attachments_entity_type_check
  CHECK (entity_type IN (
    'purchase_order','po_receipt','project_contract','project_invoice',
    'project','vendor','employee','payroll_run','manufacturing_order',
    'rental_contract','interco_transaction','po_return'
  ));

-- Responsible employee columns on po_returns
ALTER TABLE po_returns
  ADD COLUMN IF NOT EXISTS responsible_employee_id UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS deduct_from_salary       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deduction_amount         NUMERIC(20,4);

-- Salary deduction requests table
CREATE TABLE salary_deduction_requests (
  id                     UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id             UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id            UUID         NOT NULL REFERENCES employees(id),
  source_type            VARCHAR(30)  NOT NULL DEFAULT 'po_return',
  source_id              UUID         NOT NULL,
  amount                 NUMERIC(20,4) NOT NULL CHECK (amount > 0),
  currency_code          CHAR(3)      NOT NULL DEFAULT 'IQD',
  reason                 TEXT,
  status                 VARCHAR(20)  NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','applied','cancelled')),
  applied_payroll_run_id UUID         REFERENCES payroll_runs(id),
  applied_at             TIMESTAMPTZ,
  cancelled_by           UUID         REFERENCES users(id),
  cancelled_at           TIMESTAMPTZ,
  created_by             UUID         REFERENCES users(id),
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_salary_ded_company    ON salary_deduction_requests (company_id);
CREATE INDEX idx_salary_ded_employee   ON salary_deduction_requests (employee_id);
CREATE INDEX idx_salary_ded_status     ON salary_deduction_requests (status) WHERE status = 'pending';
CREATE INDEX idx_salary_ded_source     ON salary_deduction_requests (source_type, source_id);
