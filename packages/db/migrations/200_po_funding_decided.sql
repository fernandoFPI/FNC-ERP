-- Funding source (vendor AP vs employee advance) moved off the PO creation
-- form onto Finance, decided once the PO reaches 'invoiced' instead. This
-- flag tracks whether that decision has actually been made yet, since
-- purchase_orders.funding_source itself still defaults to 'vendor_ap' and
-- can't tell "not decided yet" apart from "decided: vendor AP".

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS funding_decided BOOLEAN NOT NULL DEFAULT false;

-- Every PO already in the system went through the old creation-time picker,
-- so its funding source is already effectively decided — backfill true so
-- these don't get re-prompted. Only POs created after this migration start
-- out undecided.
UPDATE purchase_orders SET funding_decided = true WHERE funding_decided = false;
