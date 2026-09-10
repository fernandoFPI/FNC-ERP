-- Seeds company_price_tolerance (created empty by migration 258) with a
-- provisional default policy: 5% or the flat amount, whichever is hit
-- first (IQD 25,000 / USD 20) — flags a bought-entry price as
-- over_tolerance if it exceeds the checked market price by more than
-- EITHER threshold. Marked provisional since these are placeholder
-- values pending Finance's own review, not a confirmed policy — the
-- is_provisional flag lets the Phase 4 settings screen (and any earlier
-- UI surfacing tolerance policy) call that out explicitly rather than
-- presenting them as an already-deliberate, finalized choice.
--
-- Only IQD and USD are seeded — the two currencies actually in live use
-- today (confirmed via prod: 207 IQD-priced / 57 USD-priced po_lines,
-- zero of any other currency). A company transacting in a currency with
-- no tolerance row here has no tolerance policy at all yet; Phase 2's
-- Items Bought resolver needs to decide how to handle that case (treat
-- as no tolerance configured => always flag over_tolerance, forcing a
-- supervisor look, rather than silently skip the check — matches "when
-- in doubt, ask" rather than "when in doubt, let it through").

BEGIN;

ALTER TABLE company_price_tolerance
  ADD COLUMN is_provisional BOOLEAN NOT NULL DEFAULT false;

INSERT INTO company_price_tolerance (company_id, currency_code, tolerance_pct, tolerance_abs, is_provisional)
SELECT c.id, cur.code, 5.00, cur.abs_threshold, true
FROM companies c
CROSS JOIN (VALUES ('IQD', 25000.0000), ('USD', 20.0000)) AS cur(code, abs_threshold)
WHERE NOT EXISTS (
  SELECT 1 FROM company_price_tolerance cpt
  WHERE cpt.company_id = c.id AND cpt.currency_code = cur.code
);

COMMIT;
