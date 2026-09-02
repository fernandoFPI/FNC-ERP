-- po_approval_log.action was VARCHAR(30), left over from a fixed-list CHECK
-- constraint that was dropped in 030_po_lifecycle_redesign.sql when the PO
-- lifecycle grew far more transition types than the original short list.
-- Two of those newer action strings ('reject_verification_to_market_pricing',
-- 37 chars; 'reject_verification_to_store_pricing', 36 chars) exceed 30
-- characters, so Postgres hard-errors ("value too long for type character
-- varying(30)") every time either reject path is used -- it has never
-- worked. Widened to TEXT (no practical difference from VARCHAR(n) in
-- Postgres) so no future action name can hit this same wall again.
ALTER TABLE po_approval_log ALTER COLUMN action TYPE TEXT;
