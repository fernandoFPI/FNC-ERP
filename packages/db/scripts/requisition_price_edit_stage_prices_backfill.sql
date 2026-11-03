-- One-off data correction: requisition lines whose price edit was approved AFTER approval but left
-- market_price / verified_price / approved_unit_price on the old price.
--
-- Background: applyRequisitionEditChanges used to write only unit_price (and the total). The fix
-- (branch fix/requisition-price-edit-stage-prices) moves the other three along with it, but only the
-- ones a line already has. This script brings the lines edited BEFORE the fix in step, using the same
-- rule: each of the three that is set takes the line's current unit_price. Nothing else changes: not
-- the total (already right), not the edit request, not any purchase. A purchase that was already
-- flagged over tolerance against the stale approved price (REQ-2026-0077) stays flagged; it is
-- cleared through its normal approval, not here.
--
-- Which lines: those with an approved edit request that needed a real review (not auto-applied) and
-- changed unit_price, where the line's current unit_price is still that edit's value (nobody has
-- re-priced it since) and at least one of the three records disagrees with it. On 2026-11-03 that was
-- exactly 5 lines: REQ-2026-0057 and REQ-2026-0056 (Al Watanyia, 148 -> 145), REQ-2026-0055 (Al
-- Watanyia, 3,500 -> 2,000), REQ-2026-0025 (Al Watanyia, 402,500 -> 402,000), REQ-2026-0077 (Nishtimani
-- Factory, 58,000 -> 64,000). The script refuses to do anything unless it finds exactly 5.
--
-- Safe by default: with no flag it is a DRY RUN. It only reads (plus a session-local temporary working
-- table; PostgreSQL does not allow even that in a read-only transaction), lists what it would change,
-- never reaches the UPDATE and rolls back. Applying needs -v apply=1; it then runs in one transaction
-- and rolls back by itself if any selected line is still out of step afterwards.
--
-- Usage (run from a file, never pasted; take scripts/backup-db.sh first when applying):
--   dry run: psql "$DATABASE_URL" -P pager=off -f packages/db/scripts/requisition_price_edit_stage_prices_backfill.sql
--   apply:   psql "$DATABASE_URL" -P pager=off -v apply=1 -f packages/db/scripts/requisition_price_edit_stage_prices_backfill.sql

\set ON_ERROR_STOP on
\pset null '(null)'

\if :{?apply}
\else
  \set apply 0
\endif

BEGIN;

-- BEGIN-SELECT
CREATE TEMP TABLE stale_lines ON COMMIT DROP AS
WITH e AS (
  SELECT er.requisition_id, er.reviewed_at, jsonb_array_elements(er.changes -> 'lines' -> 'edited') AS ed
  FROM po_edit_requests er
  WHERE er.requisition_id IS NOT NULL
    AND er.status = 'approved'
    AND coalesce(er.review_notes, '') NOT LIKE 'Auto-applied%'
)
SELECT DISTINCT ON (pl.id)
       pl.id AS line_id, c.name AS company, r.requisition_number, pl.line_number,
       pl.unit_price, pl.market_price, pl.verified_price, pl.approved_unit_price
FROM e
JOIN requisitions r ON r.id = e.requisition_id
JOIN companies c ON c.id = r.company_id
JOIN po_lines pl ON pl.id = (e.ed ->> 'id')::uuid AND pl.requisition_id = e.requisition_id
WHERE e.ed ->> 'field' = 'unit_price'
  AND round(pl.unit_price, 4) = round((e.ed ->> 'to')::numeric, 4)
  AND (   (pl.market_price        IS NOT NULL AND round(pl.market_price, 4)        <> round(pl.unit_price, 4))
       OR (pl.verified_price      IS NOT NULL AND round(pl.verified_price, 4)      <> round(pl.unit_price, 4))
       OR (pl.approved_unit_price IS NOT NULL AND round(pl.approved_unit_price, 4) <> round(pl.unit_price, 4)))
ORDER BY pl.id, e.reviewed_at DESC;
-- END-SELECT

\echo '== lines that are out of step now =='
SELECT company, requisition_number AS req, line_number AS ln,
       unit_price, market_price, verified_price, approved_unit_price
FROM stale_lines ORDER BY company, requisition_number;

SELECT (count(*) = 5) AS count_ok FROM stale_lines \gset
\if :count_ok
\else
  \echo 'ABORT: expected exactly 5 lines, found a different number. Nothing was changed.'
  ROLLBACK;
  \quit
\endif

\if :apply
  -- BEGIN-UPDATE
  UPDATE po_lines pl
  SET market_price        = CASE WHEN pl.market_price        IS NOT NULL THEN pl.unit_price ELSE pl.market_price END,
      verified_price      = CASE WHEN pl.verified_price      IS NOT NULL THEN pl.unit_price ELSE pl.verified_price END,
      approved_unit_price = CASE WHEN pl.approved_unit_price IS NOT NULL THEN pl.unit_price ELSE pl.approved_unit_price END
  FROM stale_lines s
  WHERE pl.id = s.line_id;
  -- END-UPDATE

  \echo '== the same lines after the correction =='
  SELECT s.company, s.requisition_number AS req, s.line_number AS ln,
         pl.unit_price, pl.market_price, pl.verified_price, pl.approved_unit_price
  FROM stale_lines s JOIN po_lines pl ON pl.id = s.line_id
  ORDER BY s.company, s.requisition_number;

  SELECT (count(*) = 0) AS clean
  FROM stale_lines s JOIN po_lines pl ON pl.id = s.line_id
  WHERE (pl.market_price        IS NOT NULL AND round(pl.market_price, 4)        <> round(pl.unit_price, 4))
     OR (pl.verified_price      IS NOT NULL AND round(pl.verified_price, 4)      <> round(pl.unit_price, 4))
     OR (pl.approved_unit_price IS NOT NULL AND round(pl.approved_unit_price, 4) <> round(pl.unit_price, 4)) \gset
  \if :clean
    COMMIT;
    \echo 'APPLIED: 5 lines corrected.'
  \else
    ROLLBACK;
    \echo 'ABORT: some line is still out of step after the update. Rolled back, nothing changed.'
  \endif
\else
  ROLLBACK;
  \echo 'DRY RUN: nothing was changed. To apply, re-run with -v apply=1 (back up first).'
\endif
