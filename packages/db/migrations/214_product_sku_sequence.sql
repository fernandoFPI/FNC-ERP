-- Register products ("product") in the document-numbering system with
-- prefix "PRD", and seed it for every existing company so a new product
-- created with no SKU gets a clean PRD-000001-style number immediately,
-- rather than falling back to a timestamp ID until an admin happens to
-- visit Settings -> Document Numbering. Pad length 6 (not the usual 4-5)
-- since a company can already have 7000+ legacy-imported products.
INSERT INTO document_sequences (company_id, doc_type, prefix, next_number, pad_length, year_in_number, separator)
SELECT id, 'product', 'PRD', 1, 6, false, '-'
FROM companies
ON CONFLICT (company_id, doc_type) DO NOTHING;
