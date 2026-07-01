-- Migration 092: actual_unit_price on po_lines, assigned_receiver_id on purchase_orders

ALTER TABLE po_lines
  ADD COLUMN IF NOT EXISTS actual_unit_price NUMERIC(20,4);

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS assigned_receiver_id UUID REFERENCES employees(id);
