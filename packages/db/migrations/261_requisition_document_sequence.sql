-- Seeds document_sequences for the new 'requisition' doc type, one row
-- per company, mirroring purchase_order's own row shape exactly (prefix
-- REQ instead of PO, same pad_length/year_in_number/separator) — without
-- this, nextDocumentNumber('requisition') would silently fall back to
-- REQ-<timestamp> numbers for every requisition (the same pattern this
-- session already flagged as a red flag when found on legacy PO data).
INSERT INTO document_sequences (company_id, doc_type, prefix, next_number, pad_length, year_in_number, separator)
SELECT company_id, 'requisition', 'REQ', 1, 4, true, '-'
FROM document_sequences
WHERE doc_type = 'purchase_order'
ON CONFLICT (company_id, doc_type) DO NOTHING;
