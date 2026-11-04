-- A requisition's owner (organizer) can price and buy some of its lines themselves while procurement
-- handles the rest, in parallel; the requisition waits for both before it moves on.
--
-- Until now both stages were locked to positions for the whole requisition: market pricing needs
-- procurement_officer, and recording a purchase needs buyer, so an owner who was happy to go and buy
-- some items himself (the kitchen's weekly shopping, say) could not record it. There was no way to say
-- "this line is mine".
--
--   po_lines.owner_handles                   the owner ticked this line to price and buy himself.
--                                            false (the default) = procurement's, exactly as before, so
--                                            every existing requisition behaves unchanged.
--   requisitions.owner_pricing_submitted_at  the owner submitted his part of Market pricing
--   requisitions.procurement_pricing_submitted_at
--                                            procurement submitted its part
--
-- The requisition leaves Market pricing when every side that has lines to price has submitted; a side
-- with no lines counts as done, so a requisition where the owner took nothing advances on procurement's
-- one submit as before. Both timestamps are cleared whenever the requisition enters Market pricing.
ALTER TABLE po_lines
  ADD COLUMN owner_handles BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE requisitions
  ADD COLUMN owner_pricing_submitted_at TIMESTAMPTZ,
  ADD COLUMN procurement_pricing_submitted_at TIMESTAMPTZ;
