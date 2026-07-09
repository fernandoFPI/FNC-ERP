-- ── MIGRATION 111: PO RETURNS ─────────────────────────────────────────────────

CREATE TYPE po_return_type   AS ENUM ('full_refund', 'damage');
CREATE TYPE po_return_status AS ENUM ('draft', 'submitted', 'approved', 'credited');

CREATE TABLE po_returns (
  id                    UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id            UUID          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  po_id                 UUID          NOT NULL REFERENCES purchase_orders(id),
  return_number         VARCHAR(60)   NOT NULL,
  return_type           po_return_type NOT NULL DEFAULT 'full_refund',
  status                po_return_status NOT NULL DEFAULT 'draft',
  notes                 TEXT,
  damage_description    TEXT,
  total_returned_value  NUMERIC(20,4) NOT NULL DEFAULT 0,
  currency_code         CHAR(3)       NOT NULL DEFAULT 'IQD',
  created_by            UUID          REFERENCES users(id),
  submitted_by          UUID          REFERENCES users(id),
  submitted_at          TIMESTAMPTZ,
  approved_by           UUID          REFERENCES users(id),
  approved_at           TIMESTAMPTZ,
  credited_by           UUID          REFERENCES users(id),
  credited_at           TIMESTAMPTZ,
  credit_note_reference VARCHAR(100),
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),

  UNIQUE (company_id, return_number)
);

CREATE TABLE po_return_items (
  id                  UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_id           UUID          NOT NULL REFERENCES po_returns(id) ON DELETE CASCADE,
  po_line_id          UUID          REFERENCES po_lines(id),
  description         TEXT          NOT NULL,
  quantity_returned   NUMERIC(20,4) NOT NULL CHECK (quantity_returned > 0),
  original_unit_price NUMERIC(20,4) NOT NULL DEFAULT 0,
  assessed_unit_price NUMERIC(20,4) NOT NULL DEFAULT 0,
  line_total          NUMERIC(20,4) GENERATED ALWAYS AS (quantity_returned * assessed_unit_price) STORED,
  damage_notes        TEXT,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Keep total_returned_value in sync
CREATE OR REPLACE FUNCTION sync_po_return_total()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE po_returns
  SET total_returned_value = (
    SELECT COALESCE(SUM(line_total), 0)
    FROM po_return_items
    WHERE return_id = COALESCE(NEW.return_id, OLD.return_id)
  ),
  updated_at = now()
  WHERE id = COALESCE(NEW.return_id, OLD.return_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_po_return_total
AFTER INSERT OR UPDATE OR DELETE ON po_return_items
FOR EACH ROW EXECUTE FUNCTION sync_po_return_total();

CREATE INDEX idx_po_returns_company  ON po_returns (company_id);
CREATE INDEX idx_po_returns_po_id    ON po_returns (po_id);
CREATE INDEX idx_po_return_items_ret    ON po_return_items (return_id);
CREATE INDEX idx_po_return_items_line   ON po_return_items (po_line_id);
