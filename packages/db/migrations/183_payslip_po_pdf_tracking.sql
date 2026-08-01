-- 183_payslip_po_pdf_tracking
-- services/worker/src/jobs/outbox-processor.ts's handlePayslipPDF/handlePOPDF
-- write pdf_path/pdf_generated_at/sent_to_email/sent_at (payslips) and
-- pdf_path (purchase_orders) after generating the PDF, but none of these
-- columns have ever existed — every payslip and PO PDF generation has been
-- failing at the UPDATE step (and payslip generation additionally failed
-- earlier, at the SELECT, from unrelated phantom-column bugs fixed
-- alongside this migration).

ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS pdf_path VARCHAR(500),
  ADD COLUMN IF NOT EXISTS pdf_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sent_to_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS pdf_path VARCHAR(500);
