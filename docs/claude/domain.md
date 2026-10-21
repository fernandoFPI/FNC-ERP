# Domain decisions (settled, don't relitigate)

- `products.valuation_method` is permanently `last_cost` (migration 257 dropped avco/fifo/standard).
  Weighted-average costing is not coming back.
- Stock availability is scoped company-wide on purpose (G10 cancelled). Don't propose branch scoping.
- Purchasing: `purchase_orders` is split into `requisitions` (pre-vendor) + per-vendor child POs created
  at Finish Buying. No currency conversion; each line keeps its own `currency_code`.
- Vendor is never required at PO creation. Actual price is entered at the `items_bought` stage; Finance
  Audit is a read-only review.
- GraphQL gateway is the canonical API for the PO workflow (the old REST procurement service was removed).
- Variation Orders: approval syncs contract value + cost budget via `applied_value` bookkeeping
  (reversible); approved = locked snapshot (voValue/contractId not editable). Approval logs an entry in
  `project_contract_revisions`.
- Contracts and Bids use read-only `RevisionHistory`; Eng Docs/Client Docs keep their own actionable
  revisioning (don't force the read-only component onto them).
- Project lifecycle phases, tab labels and which phase a tab appears from are config-driven
  (Settings > Company > Project Lifecycle). Tab visibility/edit/approve come from the capability
  resolver (`lib/projectCapabilityMatrix.ts`, `hooks/useProjectCapability.ts`).
- Client-requested tab names are intentional (see CLAUDE.md).
- Inventory integrity: a negative-balance trigger guard exists (migration 254); opening-balance backfill
  done (255/256). Landed cost and a cost-only revaluation move are open follow-ups.
- Cost Change Approvals (`product_cost_change_requests`, Inventory > Cost Approvals): whoever triggered a parked
  cost change can't be the one to clear it, except admins (system_admin/company_admin) and the company-wide
  Store Keeper position (a Store Keeper scoped to a branch, department or project does not count). One function,
  `canReviewOwnCostChangeGW` (gateway resolvers), answers it for approve, reject and the queue's per-row
  `can_review`; the web page keeps no copy of the rule. A self-reviewed row is labelled "Reviewed by the person
  who raised it". Rejecting holds back only the product's own cost: the receipt, price, adjustment or edit that
  raised the request stays saved (stock adjustments and manual edits keep the stock location's cost).
