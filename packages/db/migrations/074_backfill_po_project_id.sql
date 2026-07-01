-- Migration 074: Backfill project_id on imported POs that have linked_project_id set
-- The workflow import set linked_project_id but not project_id, so POs were invisible
-- in the project detail "Purchase Orders" tab (which queries po.project_id = p.id).
UPDATE purchase_orders
SET project_id = linked_project_id
WHERE linked_project_id IS NOT NULL
  AND project_id IS NULL;
