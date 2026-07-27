-- 179_companies_city_country
-- services/worker/src/jobs/outbox-processor.ts's fetchInvoiceData/fetchPOData
-- (3 call sites) select companies.city and companies.country for the PDF
-- letterhead (packages/pdf/src/templates/{base,invoice,purchase-order}.ts
-- all render "${company.city}, ${company.country}" or similar) — neither
-- column has ever existed. Every invoice/PO PDF generation has been failing.
--
-- country defaults to 'Iraq': every company row today has country_code='IQ',
-- and invoice.ts/purchase-order.ts already hardcode ", Iraq" in the
-- letterhead rather than using a dynamic value, so this matches existing
-- (working) behavior for those two templates and gives base.ts a real value
-- instead of "undefined".

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS city    VARCHAR(255),
  ADD COLUMN IF NOT EXISTS country VARCHAR(100) NOT NULL DEFAULT 'Iraq';
