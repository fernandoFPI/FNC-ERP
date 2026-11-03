-- Project invoice header: the client-facing block printed at the top of the invoice
-- (Date of Issue / Due Date / Invoice No., Deliver To / Bill To, then Contract No.,
-- Job, Period of Performance, Date of Delivery, Reference).
--
-- Job and Reference come from the project (name and code). The rest has no home yet:
--   client_contract_no     the CLIENT's contract / PO / RFQ number (prefilled from projects.rfq_number);
--                          project_contracts.contract_number is our internal reference and is not
--                          what the client expects to see
--   bill_to_address        free text, one line per line break
--   deliver_to_address     free text, one line per line break
--   delivery_date          date the goods or work were delivered
--   period_of_performance  free text ("01/10/2026 - 31/10/2026", "n/a")
--
-- NULL means "never set": the gateway then derives the value from the project, so invoices
-- created before this migration print a useful header. An empty string means the person
-- cleared the field on purpose and it prints as blank.
--
-- Additive and nullable, nothing is rewritten; forward-only like every migration.

ALTER TABLE project_invoices
  ADD COLUMN IF NOT EXISTS client_contract_no    VARCHAR(200),
  ADD COLUMN IF NOT EXISTS bill_to_address       TEXT,
  ADD COLUMN IF NOT EXISTS deliver_to_address    TEXT,
  ADD COLUMN IF NOT EXISTS delivery_date         DATE,
  ADD COLUMN IF NOT EXISTS period_of_performance VARCHAR(200);
