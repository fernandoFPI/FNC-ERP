-- Migration 326: equipment that must come back (Store Out returnables). Playbook #107, STORE_OUT_EQUIPMENT_PLAN.md phase 1.
--
-- Until now every Store Out line was consumption: confirming it moved stock into the company's Virtual Consumption location
-- ("used up") and the only way to bring anything back was a Material Return, which needs a purchase order or a requisition as its
-- parent. A manual Store Out (200 on production) could not be returned at all, and a Store Out carried no "issued to".
--
-- This adds, all additive and nullable or defaulted so nothing existing changes:
--   * products.is_returnable / default_return_days: "Equipment (must come back)". Every product stays a consumable until flagged.
--   * Store Out header: who it was issued to (an employee, or a typed name for a contractor) and the department.
--   * Store Out line: returnable flag, expected return date, an optional serial note (equipment is tracked by quantity).
--   * store_out_returns / store_out_return_lines: the return document, tied to the Store Out LINE (not to a PO or requisition),
--     with the condition of what came back. Deliberately separate from project_material_returns (migration 271): equipment never
--     charged the project when issued, so there is no cost to offset, and the parent is different.
--
-- No new location type: equipment goes to Virtual Consumption while it is out, exactly as consumables do (every stock query
-- already leaves that location out of what is available), and comes back through a stock move out of it, as Material Returns do.
--
-- Forward-only.

ALTER TABLE products
  ADD COLUMN is_returnable BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN default_return_days INTEGER
    CONSTRAINT products_default_return_days_range CHECK (default_return_days IS NULL OR default_return_days BETWEEN 1 AND 3650);

ALTER TABLE project_material_issues
  ADD COLUMN issued_to_employee_id UUID REFERENCES employees(id),
  ADD COLUMN issued_to_name VARCHAR(200),
  ADD COLUMN department VARCHAR(100);

ALTER TABLE project_material_issue_lines
  ADD COLUMN is_returnable BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN expected_return_date DATE,
  ADD COLUMN serial_note VARCHAR(100);

-- Returnables are read by "what is still out": a partial index keeps that cheap however many consumable lines there are.
CREATE INDEX idx_project_material_issue_lines_returnable
  ON project_material_issue_lines (issue_id) WHERE is_returnable;

CREATE TABLE store_out_returns (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- The company that HOLDS the equipment and takes it back (the lender, when the Store Out was a loan from the central warehouse).
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  return_number   VARCHAR(100) NOT NULL,
  return_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  received_by_name VARCHAR(200),
  notes           TEXT,
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, return_number)
);

CREATE TABLE store_out_return_lines (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_id       UUID NOT NULL REFERENCES store_out_returns(id) ON DELETE CASCADE,
  -- The Store Out line being returned: required, no cascade (the issue line is history).
  issue_line_id   UUID NOT NULL REFERENCES project_material_issue_lines(id),
  product_id      UUID NOT NULL REFERENCES products(id),
  qty_returned    NUMERIC(20,4) NOT NULL CHECK (qty_returned > 0),
  condition       VARCHAR(20) NOT NULL CHECK (condition IN ('good','needs_repair','damaged','lost')),
  -- Where it went back into inventory. NULL exactly when it was lost (a lost quantity never comes back).
  to_location_id  UUID REFERENCES stock_locations(id),
  -- Carried from the issue line, never re-entered.
  unit_cost       NUMERIC(20,4) NOT NULL DEFAULT 0,
  total_cost      NUMERIC(20,4) NOT NULL DEFAULT 0,
  stock_move_id   UUID REFERENCES stock_moves(id),
  remarks         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT store_out_return_lines_lost_has_no_location CHECK ((condition = 'lost') = (to_location_id IS NULL))
);

CREATE INDEX idx_store_out_return_lines_return ON store_out_return_lines (return_id);
CREATE INDEX idx_store_out_return_lines_issue_line ON store_out_return_lines (issue_line_id);

-- Number the returns from a rule an admin controls (same seeding as migration 288: copy the shape of Store Out's own row).
-- Without a row, nextDocumentNumber would fall back to a timestamp-style number.
INSERT INTO document_sequences (company_id, doc_type, prefix, next_number, pad_length, year_in_number, separator)
SELECT company_id, 'equipment_return', 'ERET', 1, 5, false, '-'
FROM document_sequences
WHERE doc_type = 'material_issue'
ON CONFLICT (company_id, doc_type) DO NOTHING;
