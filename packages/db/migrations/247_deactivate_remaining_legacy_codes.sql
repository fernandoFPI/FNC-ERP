-- Migration 247: Rename the 3 rows migration 244 missed
-- Migration 244 only suffixed rows that were still active at cutover time.
-- Three rows were already deactivated back in September (before this cutover)
-- and so were skipped: Nishtimani Factory's old "1700" (superseded duplicate
-- Intercompany Receivable), Nishtimani Yakam's old "2150" (superseded
-- duplicate Intercompany Payable), and Yakam's "10082-1" (the typo'd,
-- zero-activity "Fernando Advnace" duplicate). Their plain codes collide
-- with the new chart (e.g. new "2150" is "Short-term Bank Facilities").
-- Same fix, same reasoning as migration 244 — metadata only, already inactive.

UPDATE chart_of_accounts
  SET code = code || '-LEGACY', updated_at = NOW()
  WHERE is_active = false AND code NOT LIKE '%-LEGACY';
