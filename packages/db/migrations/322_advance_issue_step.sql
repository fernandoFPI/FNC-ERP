-- Employee advances: approving and issuing the cash are two steps by two people.
--
-- Until now approving an advance also issued it (one click, the issuance journal posted against the advance's default cash
-- account). The business works differently: the manager approves, and the cashbox handler then issues the cash, choosing
-- which cashbox (a petty cash float) it comes out of. This adds the step between the two:
--
--   pending_approval --(manager approves)--> pending_issue --(cashbox handler issues)--> approved
--
-- The existing status 'approved' keeps its meaning, "issued and open for settlement", so every place that already selects
-- advances by ('approved','partially_settled') (settlement queue, funding choice, dashboards) needs no change, and the
-- advances already issued stay as they are. 'pending_issue' means approved but not paid out yet.
ALTER TABLE employee_advances DROP CONSTRAINT employee_advances_status_check;
ALTER TABLE employee_advances ADD CONSTRAINT employee_advances_status_check
  CHECK (status IN ('draft','pending_approval','pending_issue','approved','rejected','partially_settled','settled','cancelled'));

-- Who paid it out, when, and from which cashbox. approved_by / approved_at keep meaning the manager's approval.
ALTER TABLE employee_advances
  ADD COLUMN issued_by           UUID,
  ADD COLUMN issued_at           TIMESTAMPTZ,
  ADD COLUMN petty_cash_float_id UUID REFERENCES petty_cash_floats(id);

CREATE INDEX idx_emp_adv_pending_issue ON employee_advances(company_id) WHERE status = 'pending_issue';
