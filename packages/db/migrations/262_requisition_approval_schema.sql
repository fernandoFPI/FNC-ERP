-- Schema additions for G1 Phase 2 PR 2 (single approval gate).
--
-- pending_product_catalog_items.po_id becomes nullable + gains
-- requisition_id (mutually exclusive, same XOR pattern as
-- po_edit_requests from migration 258) — a from-stock requisition line
-- with no matched product needs to queue onto this worklist at approval
-- time (issueStockForRequisitionLines, mirroring issueStockForPOLines),
-- and at that point there is no child purchase_orders row yet, only the
-- requisition. Existing rows are unaffected (po_id stays set,
-- requisition_id stays null, same as every other table this XOR pattern
-- was applied to).
ALTER TABLE pending_product_catalog_items ALTER COLUMN po_id DROP NOT NULL;
ALTER TABLE pending_product_catalog_items
  ADD COLUMN requisition_id UUID REFERENCES requisitions(id);
ALTER TABLE pending_product_catalog_items ADD CONSTRAINT pending_product_catalog_items_one_parent
  CHECK ((po_id IS NOT NULL)::int + (requisition_id IS NOT NULL)::int = 1);

-- requisition_approval_log gains actor_position — which position (admin /
-- dept_head / po_admin) actually qualified the actor for that specific
-- transition, not just who they were. Nullable: PR 1/1b's transitions
-- (submit, inventory check, store/market pricing, price verification)
-- don't populate it, only PR 2's approve/reject do — no retroactive
-- backfill, this is additive going forward only.
ALTER TABLE requisition_approval_log ADD COLUMN actor_position TEXT;

-- po_lines.approved_unit_price — a snapshot of unit_price taken at the
-- moment a requisition is approved, immune to whatever unit_price does
-- afterward. PR 3's tolerance check compares an actual bought price
-- against THIS, not against market_price/verified_price/unit_price live —
-- an explicit, dedicated field removes any ambiguity about which number
-- "what was approved" means, now or if anything upstream of approval
-- ever changes shape.
ALTER TABLE po_lines ADD COLUMN approved_unit_price NUMERIC(20,4);

-- requisition_approved_totals — the per-currency breakdown
-- (getRequisitionCurrencyTotals' shape) frozen at the moment of
-- approval, one row per currency. Deliberately a separate, persisted
-- snapshot rather than something PR 3 re-derives live from
-- approved_unit_price * qty at read time — "what was actually shown and
-- approved" is a fact about a specific moment, not a value that should
-- silently track any later change to the lines it summarizes.
CREATE TABLE requisition_approved_totals (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requisition_id UUID NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  currency_code  CHAR(3) NOT NULL,
  subtotal       NUMERIC(20,4) NOT NULL,
  line_count     INTEGER NOT NULL,
  snapshotted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (requisition_id, currency_code)
);
