# Store Out, Equipment and Transfers: plan

Source: the user's mockup "ERP Store Out - Sample" (a claude.ai artifact shared 2026-11-19; a single-page prototype
with six tabs). Status: **PLAN, nothing built.** Update the checkboxes below as each item lands, not at the end.

## Decisions by the user (2026-11-19)

1. **Scope: everything in the mockup.** Equipment and returnables, temporary stores with goods receipt into them,
   Store Out transfers with an In Transit state, the Returnables list, History.
2. **Equipment is tracked by quantity** (4 ladders, 1 out), as in the mockup. No per-unit asset record; an optional
   serial note can be typed on the Store Out line.
3. **Project cost:** equipment costs the project nothing when it is issued and nothing when it comes back. It is charged
   only if it comes back as **Lost** (see "Cross-company" for the exception).
4. **Cross-company:** equipment held in Nishtimani Factory (the central warehouse) may be issued to another company's
   person or project as a **no-charge loan**: no price, no inter-company bill, and it returns to the lender.

## What exists today (read-only checks, production 2026-11-19)

- `products` has no equipment or returnable notion. All 3,773 active products are `raw_material` (sub-category = the
  store); none is `consumable`. Equipment-type items (step ladders FACT-192 to 194, pump FACT-253) are flagged by hand.
- Confirming a Store Out moves stock to the company's `virtual_out` location, which means "used up"
  (`issueMaterialIssue`, resolvers.ts ~26001). Equipment sent that way can never come back.
- `project_material_issues` has no issued-to, department or due date. 200 manual Store Outs (197 Factory, 3 Yakam),
  661 lines, all into `virtual_out`.
- Material Returns work only for Store Outs tied to a PO or requisition (`returnableMaterialIssueLines`,
  `createMaterialReturn`) and record no condition. Manual Store Outs cannot be returned (playbook #46 left this open).
- Rental `equipment_assets` (migration 018) is for hiring machines out: 0 assets, 0 contracts. Not reused.
- `stock_locations.type` allows warehouse, site, transit, virtual_in, virtual_out. Factory has one `transit` location
  with 0 moves ever. `createManualTransfer` is instant (no in-transit state). No temporary store exists.
- Purchases are received through a PO (Store In / Record Receipt). The mockup's free-text GRN (any supplier, no PO)
  does not exist here and is **not** built: the existing receipt is extended instead.

## Mockup tab to ERP

| Mockup | ERP |
|---|---|
| Store Out, Issue to person / site | Inventory > Store Out, manual form extended (issued to, department, returnable lines). PO and requisition Store Outs unchanged |
| Store Out, Transfer | New Store Transfer document (sent, in transit, received), same company only. The instant manual transfer stays until someone decides to retire it |
| Goods Receipt | Existing Record Receipt / Store In, plus a final destination when the receiving location is temporary |
| Temp Store & Transit | New Inventory page |
| Returnables | New Inventory page with Receive back |
| History | One filterable list of Store Out, Store In and Transfer documents |
| Materials & Stock, Stores | Existing Products, Stock Balances and Locations; add the equipment flag, return days, "Out with people" and "In transit" columns, and a Temporary location type |

## Proposed data model (migration numbers taken at build time: next free after 325, check open branches)

Phase 1:
- `products.is_returnable BOOLEAN NOT NULL DEFAULT false`, `products.default_return_days INT` (existing rows unchanged).
- `stock_locations.type` CHECK += `issued` ("Out with people", one per company, auto-created like `virtual_out`).
- `project_material_issues`: `issued_to_employee_id`, `issued_to_name`, `department` (all nullable).
- `project_material_issue_lines`: `is_returnable`, `expected_return_date`, `serial_note`.
- New `store_out_returns` + `store_out_return_lines` (issue line, qty, date, condition good / needs_repair / damaged /
  lost, return location, received by). Separate from `project_material_returns` because equipment has no project cost to
  offset and a different parent.

Phase 2:
- `stock_locations.type` CHECK += `temporary`.
- `po_receipts.final_destination_location_id`.
- New `stock_transfers` + `stock_transfer_lines` (from, to, driver, vehicle, waybill, reference, status
  in_transit / received / received_short / cancelled, qty sent, qty received, remarks).

## Behaviour rules

- CHANGED while building: there is NO `issued` location type (about 77 places treat locations by name as virtual or not). A
  returnable line moves stock warehouse to `virtual_out`, like a consumable; the return moves it back out of there into a real
  location chosen on the return. "Out with people" is read from the Store Out lines.
- Equipment is forced returnable; any other product can be ticked returnable per line. Expected return date defaults to
  the product's `default_return_days`.
- Overdue = expected return date passed and quantity still out. Temp store: waiting more than 7 days is flagged red.
- Lost: the quantity is written off (`issued` to the owner's `virtual_out`) and the project (if any) is charged at the
  line's unit cost. **Cross-company loan:** a loss is a write-off in the owning company only, with no charge to the
  borrowing project (that would need an inter-company bill); it is flagged for management.
- Needs repair / Damaged: the quantity goes back into inventory; the condition is recorded on the return.
- Transfer: send moves stock from the From location to the company's transit location; receive moves the received
  quantity to the To location. A short quantity is written off to `virtual_out` with the reason, shown as short on the
  document (default, confirm).

## Traps found in the existing code (must be handled)

- `issueMaterialIssue` books project cost for every line of the issue (`bookStockIssueCost`, lib/stockIssueCost.ts:59):
  returnable lines must be excluded.
- The cross-company branch of `issueMaterialIssue` creates an interco transfer and a pending bill: loan lines must skip it
  (stock moves stay inside the owner's books).
- `cancelMaterialIssue` never reverses stock moves (resolvers.ts ~26316): cancelling an issued Store Out with returnable
  lines would leave equipment "out" for ever. Block it once issued.
- `assertReceivableLocation` (#105) must also refuse `issued` and `transit` as receipt locations.
- Every availability or total query must treat `issued` as owned but not available (audit before shipping).
- Store Out uses `projects.execution.edit` (an odd key for store keepers). Which permission keys the new screens use is a
  decision (new keys also need the dual registry: packages/permissions and the web copy).
- Mobile sync: Store Out tables are not synced; `products` and `stock_locations` are mentioned in mobile-sync.ts
  (check the SQL before adding columns).
- i18n en and ar keys, RTL, and a key-parity check for every new screen.

## Defaults assumed (confirm at sign-off)

- Issued To: employee picker, or a typed name for contractors.
- A loan is recorded as a Store Out of the borrowing company (as cross-company draws are today); the lending company's
  store keepers confirm the return; both companies see the line on their Returnables page.
- Transfers are within one company only; between companies stays inter-company.
- Opening balances use the existing Stock Adjustment, not a field on the item form.
- The 7-day temp-store flag is a constant for now (not a company setting).

## Plan

### Phase 1: equipment and returnables
- [x] 1.1 Migration 326, dev and test databases, types regenerated
- [x] 1.2 Product form: "Equipment (must come back)" and default return days (flagging the known equipment items is still to be done by hand in the app)
- [x] 1.3 Store Out: issued-to, department, returnable tick, expected date; confirm branch (Virtual Consumption, no cost, no interco). Also on an existing draft, the detail page and the printout
- [x] 1.4 Return mutation with condition; Lost write-off; cancel guard
- [x] 1.5 Returnables page (KPIs, Open / Overdue / All, Receive back); product page shows Out with people. NOT done: sidebar count badge, Stock Balances column
- [x] 1.6 Tests against real Postgres, mutation checks, en/ar, docs (playbook #107, domain). Browser check still to do

### Phase 2: temporary stores and transfers in transit
- [x] 2.1 Migration 327; Temporary location type; receipt final destination (the Record Receipt form asks for it)
- [x] 2.2 Store Transfer: send, receive (full / short), cancel (same company only)
- [x] 2.3 Temp Store & Transit page (own page with a New transfer dialog; NOT a mode of the Store Out form)
- [x] 2.4 Tests, en/ar, docs (playbook #108, domain). Browser check still to do

### Phase 3: History and polish
- [x] 3.1 One document history list with filters (Inventory > Store History)
- [ ] 3.2 Browser check (desktop, phone, dark, Arabic): NOT DONE, needs a login. Full suites run: gateway 1338 pass, web 3223 pass + 4 Topbar failures from another session
