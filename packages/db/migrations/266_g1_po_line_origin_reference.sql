-- G1 PR 4 follow-up — a child po_lines row Finish Buying forks into a new
-- row (the mixed stock+vendor case, or a multi-vendor split beyond the
-- first entry) had no way to trace back to the requisition line it came
-- from. po_line_purchases.po_line_id still points at the original line
-- correctly, but that's the bought-entry record, not the fragment itself
-- — nothing on the fragment's own po_lines row said "this came from
-- that line." Self-referencing FK, nullable: NULL for every line that
-- isn't itself a fork (the requisition's own master lines, and the
-- simple single-vendor-zero-stock case that mutates its existing row in
-- place rather than creating a new one).

BEGIN;

ALTER TABLE po_lines ADD COLUMN origin_line_id UUID REFERENCES po_lines(id);

COMMIT;
