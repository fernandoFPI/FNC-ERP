ALTER TABLE purchase_orders
  ADD COLUMN priority VARCHAR(10) NOT NULL DEFAULT 'low'
    CHECK (priority IN ('low', 'high', 'emergency'));
