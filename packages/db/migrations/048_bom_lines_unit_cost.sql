-- Add unit_cost to bom_lines so BOM component costs can be stored explicitly
ALTER TABLE bom_lines ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(18,4) NOT NULL DEFAULT 0;
