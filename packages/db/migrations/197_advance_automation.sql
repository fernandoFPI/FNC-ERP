-- Employee-requested advances with auto-resolved GL accounts, and PO line
-- items settling against an advance in finance-selected batches.

-- Currency -> designated cash account, one row per currency per company.
-- No canonical currency list exists in this system (every form hardcodes
-- its own currency dropdown), so this is free-text currency_code exactly
-- like everywhere else, not an FK to a currencies table.
CREATE TABLE company_default_cash_accounts (
  id            UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id    UUID NOT NULL,
  currency_code CHAR(3) NOT NULL,
  account_id    UUID NOT NULL REFERENCES chart_of_accounts(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, currency_code)
);

-- Parent account under which each employee's own advance sub-account gets
-- auto-created (e.g. "Employee Advances" as the parent, one child account
-- per employee, using chart_of_accounts.parent_id — already a
-- self-referencing hierarchy column, no new column needed there).
ALTER TABLE system_configuration
  ADD COLUMN advance_control_parent_account_id UUID REFERENCES chart_of_accounts(id);

-- Each employee's own dedicated advance-tracking account, lazily created
-- the first time they need one.
ALTER TABLE employees
  ADD COLUMN advance_control_account_id UUID REFERENCES chart_of_accounts(id);

-- PO <-> Advance linkage, decided at PO creation. Funding SOURCE (which
-- advance pays for this PO) is a whole-PO decision, but which GL
-- account/cost center absorbs the cost is not -- different items in the
-- same PO can legitimately belong to different cost centers, so that
-- granularity lives on po_lines below, not here.
ALTER TABLE purchase_orders
  ADD COLUMN funding_source VARCHAR(20) NOT NULL DEFAULT 'vendor_ap'
    CHECK (funding_source IN ('vendor_ap', 'employee_advance')),
  ADD COLUMN funding_advance_id UUID REFERENCES employee_advances(id);

-- po_lines.account_id already exists (migration 007) but is dead in the
-- live GraphQL path -- never in POLineInput, never populated by
-- createPurchaseOrder. This wires it up rather than adding a duplicate
-- column, and adds its missing cost-center counterpart. Both are only
-- meaningful when the parent PO's funding_source is 'employee_advance' --
-- a normal vendor-AP PO leaves them null exactly as account_id already
-- sits unused today.
ALTER TABLE po_lines
  ADD COLUMN cost_center_id UUID REFERENCES cost_centers(id),
  ADD COLUMN advance_settlement_id UUID REFERENCES advance_settlements(id);
  -- set once THIS LINE is bundled into a settlement -- eligibility for the
  -- "pending PO lines" queue is per LINE, not per PO, since one PO's lines
  -- can settle across different batches at different times

ALTER TABLE advance_settlement_lines
  ADD COLUMN po_line_id UUID REFERENCES po_lines(id);
  -- links a settlement line to the exact PO line item it came from; the
  -- parent PO/PO-number is reachable via po_lines.po_id for display

CREATE INDEX idx_po_default_cash_accounts_company ON company_default_cash_accounts(company_id);
CREATE INDEX idx_po_lines_advance_settlement ON po_lines(advance_settlement_id);
CREATE INDEX idx_purchase_orders_funding_advance ON purchase_orders(funding_advance_id);
CREATE INDEX idx_advance_settlement_lines_po_line ON advance_settlement_lines(po_line_id);
