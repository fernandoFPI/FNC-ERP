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
- Stock-covered lines and the delivery destination: a project requisition/PO's delivery destination only decides
  what happens to PURCHASED goods (Delivered to inventory: a Store In; Delivered to the jobsite: straight to the
  jobsite, no Store In). Whatever is covered from inventory ALWAYS gets a draft Store Out (never skipped because of
  the destination), which reserves its quantity until it is confirmed; confirming deducts the stock, releases the
  reservation and charges the project. A requisition completes only when those Store Outs are confirmed. One
  function, `coverRequisitionStockLines` (gateway resolvers), makes the drafts at approval and when a buyer resolves
  a line from stock at Items Bought. The destination is chosen at creation, long before approval.
- One inventory for the whole group, held in Nishtimani Factory (companies.is_central_warehouse). Companies used to keep their own stock; now Yakam and Al Watanyia draw from Factory through cross-company Store Outs. Moving leftover stock into Factory is a no-charge re-assignment (no bill, no price, no journal), never an inter-company sale. Never match items across companies by SKU: shared SKUs are different items.
- Invoice header block (migration 311): the top of a project invoice reads Date of Issue / Due Date / Invoice No., then Deliver To and Bill To boxes, then Contract No. / Job / Period of Performance / Date of Delivery / Reference. Contract No. is the CLIENT's number (invoice `client_contract_no`, prefilled from `projects.rfq_number`), never our internal `project_contracts.contract_number`; Reference is our project code, Job the project name. Bill To / Deliver To / Date of Delivery / Period are free text kept on the invoice, prefilled from the project and editable at creation and on the edit screen; NULL = derive from the project, '' = blank on purpose.
- Expense claims sent back: a rejected claim stays `rejected` and is editable by whoever filed it (or an admin), then resubmitted (`POST /finance/expense-claims/:id/revise`); a claim Finance sent back from audit (`draft`) is editable the same way. Lines carry a stable number (`line_number`, never reused or shifted) and an approver may flag individual lines with a reason when rejecting, but flags are optional (a whole-claim reason is enough, unlike requisitions). The reject panel asks for one reason at a time: the claim-level one while no line is ticked, each ticked line's own reason once one is (the server builds the claim reason from them). The editor and the server decide who may edit in one place (`canReviseClaim`); finance.expenses.edit holders can edit drafts, not other people's rejected claims.
- Invoices in review can be rejected (migration 313): an approver (same gate as Approve, `projects.invoices.edit`) sends a project invoice from `review` back to `draft` with optional flags on lines and on the ten fields of the printed header (Date of Issue, Due Date, Invoice No., Deliver To, Bill To, Contract No., Job, Period of Performance, Date of Delivery, Reference) and a reason, one reason field at a time (the invoice-level one while nothing is ticked, each ticked item's own once one is). The creator fixes it in draft and uses Submit for review again, which marks the flags addressed; the approver confirms each flagged line or header field with Confirm fixed. The flags and the rejection are internal: never on the public QR verification page or the printed invoice. Nothing is posted before Approve, so a rejection undoes nothing.
