-- Migration 189: record which stock location a PO line's from-stock quantity was picked from
--
-- Needed so users can choose a specific location/company to fulfill a line from
-- stock (instead of always silently deducting from the requesting company's own
-- arbitrary warehouse), and so an approved PO's stock deduction can be reversed
-- back to the right place if the PO is later cancelled.

ALTER TABLE po_lines ADD COLUMN source_location_id UUID REFERENCES stock_locations(id);
