-- Seed document_sequences for the new 'store_in' doc type, one row per
-- company, mirroring material_issue's own row shape (prefix RCPT instead
-- of SO, same pad_length/year_in_number/separator — see migration 204) —
-- without this, nextDocumentNumber('store_in') would silently fall back
-- to RCPT-<timestamp> numbers for every goods receipt, same gap recordReceipt
-- had before it started calling nextDocumentNumber at all.
INSERT INTO document_sequences (company_id, doc_type, prefix, next_number, pad_length, year_in_number, separator)
SELECT company_id, 'store_in', 'RCPT', 1, 5, false, '-'
FROM document_sequences
WHERE doc_type = 'material_issue'
ON CONFLICT (company_id, doc_type) DO NOTHING;
