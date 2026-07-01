-- Add work_center_id to manufacturing_orders for direct assignment
ALTER TABLE manufacturing_orders ADD COLUMN IF NOT EXISTS work_center_id UUID REFERENCES work_centers(id);
