-- Migration 327: temporary stores and store transfers that spend time in transit. Playbook #108, STORE_OUT_EQUIPMENT_PLAN.md phase 2.
--
-- Until now a location was a warehouse, a site or a virtual bucket, and the only way to move stock between two real locations was
-- createManualTransfer, which is instant: nothing said "sent, not yet received". This adds, all additive:
--   * a `temporary` location type: a store where bought goods wait until they are sent on to their final destination. It is a real
--     location (its stock is counted like any other), so no stock query changes.
--   * po_receipts.final_destination_location_id: where goods received into a temporary store are going.
--   * stock_transfers / stock_transfer_lines: a transfer between two locations of ONE company. Sending takes the stock out of the From
--     location into the company's transit location; receiving puts what arrived into the To location; what did not arrive is written off
--     (to Virtual Consumption) with the reason on the line, so the ledger always says where every unit went.
--
-- Forward-only.

ALTER TABLE stock_locations DROP CONSTRAINT IF EXISTS stock_locations_type_check;
ALTER TABLE stock_locations
  ADD CONSTRAINT stock_locations_type_check
  CHECK (type IN ('warehouse','site','transit','virtual_in','virtual_out','temporary'));

ALTER TABLE po_receipts
  ADD COLUMN final_destination_location_id UUID REFERENCES stock_locations(id);

CREATE TABLE stock_transfers (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  transfer_number  VARCHAR(100) NOT NULL,
  transfer_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  from_location_id UUID NOT NULL REFERENCES stock_locations(id),
  to_location_id   UUID NOT NULL REFERENCES stock_locations(id),
  status           VARCHAR(20) NOT NULL DEFAULT 'in_transit'
    CHECK (status IN ('in_transit','received','received_short','cancelled')),
  driver_name      VARCHAR(200),
  vehicle_no       VARCHAR(100),
  waybill_no       VARCHAR(100),
  reference        VARCHAR(200),
  notes            TEXT,
  sent_by          UUID NOT NULL REFERENCES users(id),
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_date    DATE,
  received_by_name VARCHAR(200),
  received_by      UUID REFERENCES users(id),
  received_at      TIMESTAMPTZ,
  cancelled_by     UUID REFERENCES users(id),
  cancelled_at     TIMESTAMPTZ,
  UNIQUE (company_id, transfer_number),
  CONSTRAINT stock_transfers_two_places CHECK (from_location_id <> to_location_id)
);

CREATE TABLE stock_transfer_lines (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transfer_id      UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  product_id       UUID NOT NULL REFERENCES products(id),
  qty_sent         NUMERIC(20,4) NOT NULL CHECK (qty_sent > 0),
  -- NULL until the transfer is received
  qty_received     NUMERIC(20,4) CHECK (qty_received IS NULL OR qty_received >= 0),
  -- carried from the From location when it was sent, never typed
  unit_cost        NUMERIC(20,4) NOT NULL DEFAULT 0,
  currency_code    CHAR(3) NOT NULL DEFAULT 'IQD',
  remarks          TEXT,
  receive_remarks  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stock_transfers_company_status ON stock_transfers (company_id, status);
CREATE INDEX idx_stock_transfer_lines_transfer ON stock_transfer_lines (transfer_id);

INSERT INTO document_sequences (company_id, doc_type, prefix, next_number, pad_length, year_in_number, separator)
SELECT company_id, 'stock_transfer', 'TRF', 1, 5, false, '-'
FROM document_sequences
WHERE doc_type = 'material_issue'
ON CONFLICT (company_id, doc_type) DO NOTHING;
