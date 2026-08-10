-- Branch-scoped procurement buyers: each company_branches row can name one
-- user responsible for buying once a PO for that branch is approved. POs
-- record which branch they belong to so the right buyer gets notified and
-- so branch-only buyers can be scoped to just their branch's POs.

ALTER TABLE company_branches
  ADD COLUMN IF NOT EXISTS default_procurement_user_id UUID REFERENCES users(id);

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES company_branches(id);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_branch_id ON purchase_orders(branch_id);
