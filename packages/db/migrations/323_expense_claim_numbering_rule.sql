-- Expense claim numbers become a numbering rule an admin controls (Settings > Company > Document Numbering > Expense Claim).
--
-- Until now the number was hard-coded in the finance service as EXP-<year>-NNNN, the highest of this year plus one. Every company
-- that already exists gets a rule that reproduces exactly that format (prefix EXP, year in the number, 4 digits, "-") and
-- continues from where it is: the next number is the highest claim number of the current year plus one (1 when there is none),
-- so nothing changes on screen until someone edits it. A company created later is seeded by createCompany.
--
-- From here the counter is one running count like every other document type (it does not restart in January by itself; reset it
-- in Settings), and the service still never issues a number that already exists.
INSERT INTO document_sequences (company_id, doc_type, prefix, next_number, pad_length, year_in_number, separator)
SELECT c.id,
       'expense_claim',
       'EXP',
       COALESCE((
         SELECT MAX(substring(e.claim_number FROM '[0-9]+$')::bigint)
           FROM expense_claims e
          WHERE e.company_id = c.id
            AND e.claim_number ~ ('^EXP-' || EXTRACT(YEAR FROM CURRENT_DATE)::int || '-[0-9]+$')
       ), 0)::int + 1,
       4,
       true,
       '-'
  FROM companies c
ON CONFLICT (company_id, doc_type) DO NOTHING;
