-- Add project_id to purchase_orders and manufacturing_orders
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

ALTER TABLE manufacturing_orders
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_project
  ON purchase_orders(project_id) WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_manufacturing_orders_project
  ON manufacturing_orders(project_id) WHERE project_id IS NOT NULL;
