-- 'buyer' becomes a po_position_assignments position type, scoped by branch
-- (a new scope dimension parallel to project_id/department_id) so migrating
-- the old per-branch default_procurement_user_id preserves exactly today's
-- per-branch granularity instead of collapsing distinct branches' buyers
-- into one company-wide grant.

ALTER TABLE po_position_assignments
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES company_branches(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_ppa_branch
  ON po_position_assignments(branch_id)
  WHERE branch_id IS NOT NULL;

ALTER TABLE po_position_assignments
  DROP CONSTRAINT IF EXISTS po_position_assignments_position_check;
ALTER TABLE po_position_assignments
  ADD CONSTRAINT po_position_assignments_position_check
  CHECK (position IN (
    'store_keeper', 'store_pricing', 'procurement_officer',
    'procurement_2nd', 'po_admin', 'buyer'
  ));

-- Register Store Out ("material_issue") in the document-numbering system with
-- prefix "SO", and seed it for every existing company so numbers are clean
-- (SO-00001-style) immediately rather than falling back to timestamp IDs
-- until an admin happens to visit Settings -> Document Numbering. This
-- deliberately deviates from how other doc types were onboarded (none of
-- them were pre-seeded) because unifying away from the "SI-" prefix (which
-- collides with Site Instructions) is the whole point of this change.
INSERT INTO document_sequences (company_id, doc_type, prefix, next_number, pad_length, year_in_number, separator)
SELECT id, 'material_issue', 'SO', 1, 5, false, '-'
FROM companies
ON CONFLICT (company_id, doc_type) DO NOTHING;
