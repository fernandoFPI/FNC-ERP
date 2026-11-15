-- A purchase order paid from employee advances needs one advance PER CURRENCY, not one per PO.
--
-- purchase_orders.funding_advance_id (migration 197) holds a single advance, and setPOFunding insisted that advance's
-- currency equal the PO's one header currency. A PO whose lines are in IQD and USD (21 of them were waiting on production
-- on 2026-11-15, all at payment pending) could therefore be linked to an IQD advance or a USD one, never both, and the
-- other currency's lines had nothing to be paid from. Settlement made it worse: it bundled lines by
-- `po.funding_advance_id = advance` and booked their summed total_price in the advance's currency, so a USD line settled
-- against an IQD advance would have become an IQD amount with no conversion.
--
-- One row per PO and currency. A line is settled against the advance of ITS OWN currency, so a PO's IQD lines go to its
-- IQD advance and its USD lines to its USD advance, and a line added later in a currency that already has an advance
-- inherits it. purchase_orders.funding_advance_id stays as the PO's primary advance (the one in the header currency, else
-- the first by currency) so the PO page link and every reader of it keep working; setPOFunding writes both in one
-- transaction. Forward-only; the table is additive, old code ignores it.
CREATE TABLE po_funding_advances (
  po_id         UUID        NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  currency_code CHAR(3)     NOT NULL,
  advance_id    UUID        NOT NULL REFERENCES employee_advances(id),
  company_id    UUID        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (po_id, currency_code)
);

CREATE INDEX idx_po_funding_advances_advance ON po_funding_advances (advance_id);
CREATE INDEX idx_po_funding_advances_company ON po_funding_advances (company_id);

-- Every PO already linked to an advance gets its row, in the advance's own currency. The old check made that equal to the
-- PO's header currency; on production all 7 linked POs are single-currency and match.
INSERT INTO po_funding_advances (po_id, currency_code, advance_id, company_id)
SELECT po.id, a.currency_code, po.funding_advance_id, po.company_id
  FROM purchase_orders po
  JOIN employee_advances a ON a.id = po.funding_advance_id
 WHERE po.funding_advance_id IS NOT NULL
ON CONFLICT (po_id, currency_code) DO NOTHING;
