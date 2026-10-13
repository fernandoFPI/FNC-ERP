BEGIN;

-- A custom-description requisition/PO line gets queued here as "needs
-- cataloging" unconditionally -- but a lot of these are never really a
-- catalog product at all: a one-time service (hiring a taxi to deliver
-- materials), or an item the organizer just didn't know this company's
-- existing name/SKU for (handled instead by linking to that existing
-- product). 'dismissed' lets a store keeper say "this one was never
-- inventory to begin with" without creating or linking a product --
-- po_lines.product_id simply stays null, same as every other free-text
-- line already works today. dismiss_reason is optional, not required.
ALTER TABLE pending_product_catalog_items
  DROP CONSTRAINT pending_product_catalog_items_status_check;
ALTER TABLE pending_product_catalog_items
  ADD CONSTRAINT pending_product_catalog_items_status_check
  CHECK (status IN ('pending','resolved','dismissed'));

ALTER TABLE pending_product_catalog_items ADD COLUMN dismiss_reason TEXT;

COMMIT;
