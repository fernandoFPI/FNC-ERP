-- The approver can also flag fields of the invoice HEADER when rejecting an invoice in review (migration 313
-- added the line flags): the block printed at the top of the invoice.
--
--   Date of Issue, Due Date, Invoice No., Deliver To, Bill To, Contract No., Job, Period of Performance,
--   Date of Delivery, Reference
--
-- Why: with only line flags, a wrong Bill To could be described only in the invoice-level reason, which is hidden
-- once a line is ticked (one reason field at a time), so a line and a header problem could not both be reported.
--
-- One row per flagged field per invoice, with the same lifecycle as a line flag (migrations 279/312/313): raised
-- by the rejection, "addressed" when the invoice is submitted for review again, resolved by the approver. A
-- table (not columns on project_invoices) because the header has ten fields and a flag carries six facts each.
-- Invoice No., Job and Reference are not editable on the invoice (generated / taken from the project); they can
-- still be flagged, e.g. the wrong project was chosen, and are fixed where they come from.
CREATE TABLE project_invoice_header_flags (
  invoice_id        UUID         NOT NULL REFERENCES project_invoices(id) ON DELETE CASCADE,
  field             VARCHAR(30)  NOT NULL
                    CHECK (field IN ('invoice_date','due_date','invoice_number','deliver_to_address','bill_to_address',
                                     'client_contract_no','job','period_of_performance','delivery_date','reference')),
  flag_reason       TEXT         NOT NULL,
  flagged_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  flagged_by        UUID REFERENCES users(id),
  flag_addressed_at TIMESTAMPTZ,
  flag_resolved_at  TIMESTAMPTZ,
  flag_resolved_by  UUID REFERENCES users(id),
  PRIMARY KEY (invoice_id, field)
);
