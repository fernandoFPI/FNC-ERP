-- Material Return: brings unused, already-issued project material back
-- into real inventory. Deliberately its own header+lines pair (mirrors
-- project_material_issues/project_material_issue_lines, po_receipts/
-- po_receipt_lines, po_returns/po_return_items) rather than a running
-- qty_returned counter bolted onto project_material_issue_lines — this
-- keeps a full, auditable trail of who returned what, when, and to
-- which location, and supports several partial returns of the same
-- issued line over time.
--
-- Not to be confused with po_returns (migration 111) — that's a vendor/
-- finance concept (goods sent back to a vendor for a credit note, no
-- stock_moves or stock_balances interaction at all). This is the
-- opposite direction: material that already left inventory for a
-- project, coming back into it.

CREATE TABLE project_material_returns (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  return_number  VARCHAR(100) NOT NULL,
  return_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  notes          TEXT,
  created_by     UUID NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, return_number)
);

CREATE TABLE project_material_return_lines (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_id      UUID NOT NULL REFERENCES project_material_returns(id) ON DELETE CASCADE,
  -- The original Store Out line this return is reversing part or all of —
  -- required (a return always ties back to a real issuance), no CASCADE
  -- since project_material_issue_lines is itself append-only history.
  issue_line_id  UUID NOT NULL REFERENCES project_material_issue_lines(id),
  product_id     UUID NOT NULL REFERENCES products(id),
  to_location_id UUID NOT NULL REFERENCES stock_locations(id),
  qty_returned   NUMERIC(20,4) NOT NULL CHECK (qty_returned > 0),
  -- Carried from the issue line's own unit_cost, never re-entered — the
  -- material's cost basis doesn't change just because it came back.
  unit_cost      NUMERIC(20,4) NOT NULL DEFAULT 0,
  total_cost     NUMERIC(20,4) NOT NULL DEFAULT 0,
  stock_move_id  UUID REFERENCES stock_moves(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_project_material_returns_project ON project_material_returns(project_id);
CREATE INDEX idx_project_material_return_lines_return ON project_material_return_lines(return_id);
CREATE INDEX idx_project_material_return_lines_issue_line ON project_material_return_lines(issue_line_id);
