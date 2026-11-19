# Requisition and PO screens: redesign plan

Started 2026-11-11. **Nothing in this plan is committed or pushed until the user says so.** No branch was created:
the work sits in the working tree of whatever branch is checked out (it was `fix/line-currency-display-and-source`
on 2026-11-11). The two modified mobile files (`AttendanceScreen.tsx`, `SyncEngine.ts`) are not part of it.

## Decisions (the user's)

- Detail page = mockup **B** (table first): slim phase bar, one summary strip, tabs, lines table with inline entry
  for the current pricing stage, sticky action bar. Form = mockup **D** (purpose cards first, only the fields that apply).
- Phone cards use **option B** (labeled values: small label above a bold value, no grey sentence).
- No "Paste from Excel", no "What happens next" card. Form draft auto-save is browser-only (assumed, not objected to).
- The **PO detail page is in scope**, after the requisition.
- Inline entry covers the pricing stages only (store, market, verified price). Inventory check stays a panel; Pending
  approval keeps its flag-a-line boxes.
- Do not edit shared `StatusBar` (also Payroll run, HR recharge), `TabBar` (26 pages), `LineItemEditor` (17 forms) or
  the shared `Table` card styling (about 90 tables): new components, or opt-in options that default to today's look.
- Informational text never uses `theme.textMuted` (#9aa0a8, 2.64:1 on white): labels `textSecondary`, figures
  `textPrimary` (playbook #75). The token itself is not changed.

## Steps

| # | Step | Status |
|---|---|---|
| 1 | Requisition: five-phase progress bar (`PhaseBar`, `REQUISITION_PHASES`) and the shorter Summary (total, priority, expected delivery, project, organizer, rest behind "All details") | **Done, waiting for the user's browser check** |
| 2 | Requisition: Store / Market / Verified price as inline columns in the Lines table, phone cards in option B (opt-in `Table` option), sticky action bar for the stage's one action (draft, store, market, verification) | **Done (with step 3), waiting for the user's browser check** |
| 3 | Requisition: Activity timeline for the Log tab; header "more actions" menu on a phone | **Done (with step 2), waiting for the user's browser check** |
| 4 | New-requisition form (D) | **Done 2026-11-16, waiting for the user's browser check** (purpose cards, numbered sections, "Before you create it" card; playbook #97) |
| 5 | PO detail: same shell (phase bar for both status lists, summary strip, action bar INSIDE the `fieldset disabled={lock.lockedByOther}` edit lock), then inline entry for older full-flow POs only (child POs start at `bought`, no pricing stages) | **Shell done 2026-11-16, waiting for the user's browser check** (phase bar, phone header and menu, summary, foldable Next Step on a phone, labelled line cards, PO list on a phone). The Next Step panel's stage forms were NOT redesigned; no inline entry (child POs have no pricing stages) |

## Left out of step 1 on purpose

- **"Days in this step" / "Waiting on <role>"**: no stage-change timestamp exists (only `updated_at`, which any edit
  moves), so a number would be wrong. Needs a backend field or a read of `*_approval_log`; separate decision.
- **Header "more actions" (kebab) menu on a phone**: `PageHeader` is shared by hundreds of pages; do it locally in step 3.
- **Activity timeline**: independent of the rest, step 3.

## Step 1: what changed

- `lib/requisition-constants.ts`: `REQUISITION_PHASES`, `getRequisitionPhaseLabel` (status names unchanged).
- `components/procurement/PhaseBar.tsx` (new): replaces `StatusBar` on the requisition page only.
- `RequisitionDetail.tsx`: `PhaseBar` + new Summary (`SummaryField`), priority now translated.
- `i18n` en + ar: `req.phase.*`, `req.detail.{allDetails, hideDetails, progress, stepOf}`.
- Tests: `requisitionPhases.test.ts` (8), `PhaseBar.test.tsx` (11), 13 more in `RequisitionDetail.test.tsx`;
  8 mutations checked. Full web suite: 100 files, 1,181 tests passing; `tsc` clean; lint clean on the changed lines.

## Steps 2 and 3: what changed (the whole requisition page, done together on the user's request)

The user saw only the top of the page change after step 1 ("it's still the old UI"); steps 2 and 3 were done in one go.

- **Prices on the lines.** Store, Market and Verified price are boxes in the Lines table cell of their line
  (`LinePriceInput`), the market currency next to its box, "Qty to buy" under it. Take / hand back sits in the
  Handled by cell. The side panels for draft, store pricing, market pricing and price verification are gone; the side
  column is hidden (`display: none`) at those steps so the table has the full width. Inventory check, pending approval
  and later steps keep their panels (not in this change).
- **The action bar.** `StageActionBar`: sticky at the bottom on a desktop, fixed above the bottom navigation on a phone.
  It holds the step's title, hint, what is missing (red) and the button(s): Submit for inventory check, Submit to
  market pricing, the market-pricing parts (organizer's / procurement's / Continue), Submit for approval. Same gates and
  same mutation payloads as the old panels.
- **Price verification.** "Not ready to approve?" (reason + send-back buttons) is a card under the lines table; the
  flag boxes stay on the lines.
- **Columns menu.** The column being typed in (and Handled by at Market pricing) is locked on, so a step can never lose
  its input.
- **Phone.** `Table` has an opt-in `mobileLayout="fields"` (label above value, two to a row, price boxes full width,
  nothing behind "More"); the requisition lines use it, the item name is the card title, the flag box is in the corner.
  The header holds one "⋯ More actions" menu (Print, Cancel requisition) instead of two buttons (`OverflowMenu`).
- **Log tab.** `ActivityTimeline`: a sentence per action (`req.logAction.*`, en + ar), who and when, the reason as a
  quote; dot colour from the action name.
- Colours: labels and figures in the new pieces use `textSecondary` / `textPrimary` (playbook #75); the store price
  cell and the Handled-by name moved off `textMuted`.
- Verified: `tsc` clean; full web suite 104 files / 1,277 tests; 222 translation keys resolve in en and ar; lint clean on
  changed lines; 22 + 19 mutations. Not verified in a browser. Playbook #76.
- Still not done: days-in-step / waiting-on (needs a stage timestamp), Inventory check as a table step, the PO page,
  the new-requisition form.

## Send back, Inventory check (the rest of the requisition page)

After the user's browser check ("inventory check, pending approval, items bought all still look like the old UI; the
not-ready-to-approve box is still the old UI, give ideas"), a canvas of sketches was made (a private Design artifact) and
the user chose **option 3, a dialog** ("for the rest they look fine").

- **Send back.** The always-open "Not ready to approve?" card is gone. Price verification and Pending approval have a
  **Send back** button in the action bar (disabled until a line is ticked and has a reason; the bar says what is missing),
  which opens `SendBackDialog`: destinations (verification: market pricing, store pricing, inventory check, draft;
  approval: the same without store pricing), the flagged lines with their reasons, the overall reason, and a confirm button
  that names the place. Nothing pre-selected. Same mutations and payloads as the old buttons. Pending approval's panel is
  gone too (Approve is in the bar).
- **Inventory check.** On hand / reserved / available, the source location (`InlineSelect`) and the quantity from stock
  are in the Lines table; "Qty to buy" under the box; the bar counts "N of M lines covered from stock" and holds Confirm.
  "Wrong item? Reselect" is in the item cell. Same cap, same localStorage draft, same payload. New: a chosen location can
  be cleared again.
- Side column hidden at every step that now lives on the lines (draft, inventory check, store pricing, market pricing,
  price verification, pending approval). Approved and later steps keep their panels.
- Verified: `tsc` clean; lint clean on changed lines; 191 translation keys resolve in en and ar; 23 mutations. Not
  verified in a browser. Playbook #77.
- **Items Bought page** (`ItemsBoughtPage.tsx`), done after the user said to build it with the batch controls kept: one joined list
  (header row, a row per line, the active line tinted with its entry strip under it), the batch card above it unchanged,
  Finish buying as a bar. All purchase logic and all 52 old tests untouched. Playbook #78.
- Still not done: the new-requisition form (D), the PO page, days-in-step / waiting-on (needs a stage timestamp).

## Last steps of the requisition page, full width, checkboxes

- Approved, Items bought and Sourcing use the bar; Completed and the stopped states are a banner above the lines; the lines
  take the whole row and the purchase orders / Store Outs cards sit under them, full width, hidden when empty. The Items
  Bought page is full width too (1800px).
- The shared `Checkbox` keeps its input in the Tab order (it was `display: none`) and shows a keyboard focus ring; Items
  Bought uses it for its two batch toggles. The flag checkboxes in the Lines table are still native (many tests find them
  by role); say if they should match too. Playbook #79.
- Still not done: the shared `Modal` pass (answer given, waiting for the user), the new-requisition form (D), the PO page.

## Items Bought polish

- The batch card (same vendor / same receipt for all) has a title ("Apply to all items") and a line of explanation, and its two groups sit
  side by side with a divider (stacked on a phone). Rows are numbered (a `#` column; the number in front of the name on a phone) and a
  heavier line (2px, the strong border colour) separates one row from the next on a desktop. Tests in the "batch card, row numbers
  and separators" block of `ItemsBoughtPage.test.tsx`; 8 mutations.

## Items Bought: entry card, apply-to-all tiles, Arabic name (2026-11-12)

- The user found the Items Bought dropdowns and buttons plain and chose a form card (option B of three sketches). The per-line
  entry strip is now a card: title and caption (`Left to buy 10 bag · approved price 100 IQD`), a vendor picker with Cash,
  up to three recent vendors and a dashed + New vendor chip, a quantity stepper, a price field with its currency inside the box
  and a live total, a receipt drop zone with file chips, and a footer with Mark short, Resolve from stock and one solid
  Record purchase. New opt-in controls (the shared Button / Input / Select are untouched): `ActionButton`,
  `QuantityStepper`, `MoneyField`, `ChipButton`, `ChoiceTile`, `ReceiptDropZone`, plus a `field` look on
  `SearchableSelect` and four theme tokens (`borderField`, `accentSolid`, `accentSolidHover`, `accentSolidText`).
- The user asked for the same on the Apply to all items card: its two toggles are now two tiles (the user picked tiles from four
  sketches: switch rows, tiles, per-line / for-all segmented, chip toggles), with the same vendor picker and chips, a drop zone for
  the shared receipt and a solid Record all purchases. The tile opens what it controls inside itself.
- Removing a shared receipt file now also drops the cached uploads (before, only adding did).
- A line's Arabic name sits right under the English name at 14 px (it hung at the far end of the item column).
- Phone fixes from the user's iPhone: the bottom bar was a tall empty panel (its text block had a 320px flex-basis, a height
  in a column) and is now as tall as its text; and the iOS zoom-on-focus that happens all over the app (the 16px rule in
  themes.css never applied because the shared inputs size themselves inline) is fixed with a touch-keyed `!important` rule
  plus `touch-action: manipulation`. Playbook #81. Not checked on a device.
- Verified: tsc clean; lint clean on my lines; translation keys resolve in en and ar; 89 mutations, all killed; full web
  suite 114 files / 1550 tests. Not verified in a browser. Playbook #80 and #81.
- Still not done: the shared Modal pass (waiting for the user's answer), the new-requisition form (D), the PO page, the flag
  checkboxes in the Lines table (still native), the same Arabic-name alignment on the requisition Lines table.

## Phone pass over every requisition screen (2026-11-15)

The user: "for the phone all the screens of requisition look like a mess, prioritize ease of navigation and simple UI."
Measured first in a real browser (headless Chrome at 390px, logged in to the dev stack; harness in the session scratchpad:
`phone-shots/shoot.mjs`), then changed, then measured again. Phone only: every desktop layout is unchanged.

| Screen | Before | After | What changed |
|---|---|---|---|
| Requisitions list | 12,051px (35 rows) | 5,230px | title and New on one row; the five KPI cards are a scrolling row of chips; the four dropdown filters sit behind one Filters button (it shows how many are set); each requisition is three lines with its status visible; a tap opens the requisition; no CSV export |
| Requisition, market pricing | 1,738px | 1,224px | one-row header; compact summary; line cards two-up (the global `main dl[style]` rule was forcing one column, playbook #88); price and currency on one row; the bar is about 130px and the explanation is behind an info button |
| Items Bought (4 lines) | 4,494px | 1,729px | accordion: one line open, the first that needs buying; the rest are a one-line summary; "Apply to all items" is one row until opened |
| New requisition | 1,861px | about the same | one-row header, Create in the bar above the bottom navigation |

Components: `PageHeader compact` (opt-in), `StageActionBar` `more` prop + info button + measured spacer, `ListKit` phone mode
(`PageTitle`, `KpiRow`, `KpiTile`), `data-phone-grid` opt-out in `themes.css`.

Not done: the purchase-order page and My Queue on a phone; the shell breadcrumb that prints a UUID fragment; the pale primary
`Button`; the form's own content (mockup D); a check on a physical phone.

## New requisition form (D) and the PO pages (2026-11-16)

The user (after checking the phone pass): "phone check passes, do PO pages and Form D". Verified in a real browser (headless
Chrome, desktop 1440px and phone 390px, local dev stack) before and after; harness in the session scratchpad
(`phone-shots/form-shots.mjs`, `po-shots.mjs`). Nothing is committed.

**Form D** (`RequisitionForm.tsx`): the purpose is a group of cards (`PurposeCards`: icon, name, one line; three to a row on
a desktop, two to a row with only icon and name on a phone and the chosen purpose's line as a caption); the page is numbered
1 What is it for, 2 Details, 3 Lines; only the fields of the chosen purpose are drawn, its own first; the side column
(sticky on a desktop) holds the Summary and a "Before you create it" card (`RequirementsChecklist`), and the phone's bar above
the bottom navigation says "2 of 4 done · Next: Choose a project". One `requirements` list drives the card AND the refusal
when Create is pressed (the first thing missing is the toast), so they cannot drift. Create is never disabled. Declined by the
user earlier and not built: Paste from Excel, a "What happens next" card.

**PO pages**: `PhaseBar` replaces the dot bar (six phases for a whole-flow PO, the five statuses for a forked child PO;
`PO_PHASES` / `CHILD_PO_PHASES` in `po-constants.ts`). Phone: compact header; Print, Create return, View/Create invoice and
Delete behind a "⋯" menu (same gates as the desktop buttons, role x action table shown before editing); summary two tiles to
a row with the total across; Next Step foldable; the lines are labelled two-up cards. Desktop keeps its header buttons, the
summary tiles and the two-column Next Step / Lines layout. PO list on a phone: 6,213px to 2,867px (three lines per PO, status
and total visible, tap opens the PO, one Filters button, no CSV).

| Screen (phone, same data) | Before | After |
|---|---|---|
| Purchase Orders list (26 POs) | 6,213px | 2,867px |
| PO page, child PO at payment pending | 1,729px (header of three rows, bottom bar of three buttons) | header one row + a row of tags, no bottom bar |
| New requisition, direct supply | 2,693px with the six cards at about 405px | purpose block about 300px |

**Found on the way (flagged, fixed):** `Card` never forwarded `data-tour`, so four walkthrough anchors pointed at nothing
(playbook #97a). **Found, NOT changed:** the local gateway on :3000 is older than the web app (it does not know
`PurchaseOrder.fundingAdvances`), so every PO page says "PO not found" on this machine until the gateway is restarted.

**Not done:** the PO page's Next Step stage forms (about 2,600 lines, each as it was), the legacy `PurchaseOrderForm`, the PO
returns pages, My Queue on a phone, the shared `Modal` (still waiting for the user's answer), Arabic / right-to-left and a
physical phone not checked.

**Follow-up, same day: the product picker was slow (playbook #97e).** The user: "the Custom item dropdown is glitching and
taking a long time to load, on mobile and desktop". Measured first: the shared `SearchableSelect` drew all 6,909 products
(2.1 s to open, 270 ms per mouse move); the untouched PO form's picker measured the same, so it was not the form change. Now it
draws at most 200 (searching still looks through all), with a line "Showing the first 200 of 6,909" under the list: 147 ms to open,
16 ms per mouse move. The form also builds its product options once per load.

## The shared Modal (2026-11-16, playbook #98)

The user: "what about the Modal", then "go with your recommendations". Probed first (what it does today, measured), then fixed
inside `components/ui/Modal.tsx` with the props unchanged, so none of the 49 files that use it was edited. Esc now closes the
top modal only and not a dropdown's list plus the modal; it is a real dialog (role, name, description, "Close" label); focus
returns to what opened it; Tab stays inside; a click on the dark area is ignored once something was typed or chosen (a bump says
so; Esc, the close button and Cancel still close); the phone sheet's handle really swipes down to close; the page stays locked
while any modal is open; animations stop under "reduce motion". Not done: `Drawer`, `StageEditDrawer`, `SearchPalette`,
`HelpDrawer` (separate overlays with the same gaps).

## PO page, second pass: every stage, the compact strip, the two pickers (2026-11-16, playbook #99)

The user, three times: "still showing the old UI on some of the stages", "this UI is not correct", "the compact strip colors and
size don't match the new design", "these two also". Done: one column (no empty side column at Closed), the record-the-delivery
stages (approved, bought, goods received with nothing recorded) are the bottom bar with a solid 40px button, the Next Step is a
compact strip (small-caps label, no status tag, funding choice as chips with Confirm on the same row), the Employee and Advance
pickers use the field look, and the message boxes are on theme tokens (they were fixed light colours, wrong in the dark theme).
The user chose the compact strip from three drawn layouts (strip, bottom bar, back beside the lines). Not redone: the long
forms inside the card (finance review / audit, items bought, whole-flow pricing panels).

## Drawers and the rest of the forms (2026-11-17, playbook #100)

The user: "do the Drawers and the rest of the PO forms", with a screenshot of the new-requisition form (the Priority box and the
Expected Delivery date in the browser's own grey chrome between pickers in the newer style, columns starting at a different place
on each row). Done:

- **One overlay behaviour** (`components/ui/overlay.ts`): Escape closes the top overlay only, a counted page lock, focus in and back,
  Tab stays inside, a click on the dark area is ignored once something was typed. Modal, `Drawer`, `StageEditDrawer` (rebuilt on
  `Drawer`), `HelpDrawer` (closed it is now out of Tab and screen-reader reach) and `SearchPalette` use it. The app shell no longer
  closes Help and Search itself, and its "type anywhere opens the search" shortcut stays out of the way while a dialog is open.
- **The field look**: `field` on `Input`, `Select`, `Textarea` (40px, 10px corners, the readable edge, the searchable select's chevron
  on a native select), one source `components/ui/fieldStyles.ts`. On the requisition, PO, receipt, return and vendor forms; the PO
  page's Edit PO / Admin correction / receipt-draft / pricing boxes and the requisition page's edit-request form use the dense 36px
  version. The detail rows of the requisition and PO forms are one grid, so the columns line up.
- **Found and fixed on the way**: a refused stage save was swallowed (now shown); the notifications heading printed `{{COUNT}}`;
  `Modal.test.tsx` exited 1 with every test passing (unhandled jsdom errors); and, in a real browser at phone width, the Help drawer
  ignored Escape (the Escape listener was re-registered on every render and missed the event that caused the render).
- **Found, not changed**: `StageEditDrawer` cannot be opened (the `stages` tab is not in the project page's tab list).
- **Not done**: the long forms inside the PO Next Step card keep their inside look (only their boxes moved), `NotificationsDrawer`
  beyond its heading, forms outside procurement, Arabic / dark theme / a physical phone not looked at.

## The open state of every dropdown, and the rest that was left old (2026-11-17, playbook #101)

The user, after the drawers pass: "you did an amazing job with some but left some other same as they were", with a screenshot of
the Priority box (closed in the new field look, open as the browser's own grey popup), and earlier "the dropdowns itself still is
the old". Done:

- **One menu look** (`components/ui/menuStyles.ts`): the searchable select's list, the Columns menu and the "⋯" menu share a 12px
  card with pill rows (accent tint under the pointer, stronger tint + solid accent text + a tick on the chosen row, 44px rows on a
  phone). The "no choice" row ("Select branch...") is no longer drawn as a chosen blue row. Focus returns to the field, a keyboard
  ring, `listbox` / `option` roles, Arabic line and `<bdi>` names fixed.
- **Every native `<select>`** (167 of them) gets the same popup from one CSS block in `themes.css` (Chrome and Edge 135+,
  `appearance: base-select`); other browsers keep their own popup. The calendar of `type="date"` cannot be restyled and is NOT done.
- **Popovers**: `DatePicker` rebuilt, `OverflowMenu` on a portal, notification rows usable from the keyboard with translated times,
  the notifications drawer's buttons.
- **PO pages**: 46 pale `Button`s and ~100 fixed hex colours became `ActionButton`s and theme tokens (also the receipt, PO, return and
  edit-request forms); the print and comments dialogs are the shared `Modal`.
- **Field look on every labelled form control outside filter bars** (about 345 tags, ~90 files), guarded by a source-scan test.
- Still old: the other hand-rolled overlays (requisition print dialog, store in / out, returns, finance pages), the PO Next Step
  forms' inside layout, hard-coded hex outside the PO files. Not verified: a physical phone, Safari / Firefox.

## PO page at Goods received, Finance review and its tabs (2026-11-17)

Done locally (not committed): Goods received is a bar (Send to Finance Audit) instead of a card; the PO Summary is filled tiles with the shared pickers; Actions is a dialog (cancel reason, admin override) instead of a popover with window.prompt; Finance review is merged into the Lines card (Check column, variance, short / over, progress, flag box) with Pass Audit / Return for Correction in the bar; the other tabs (Receipts, Returns, Log, Edit requests, comments) are in the new look, `TabBar` has an opt-in `readable` look; the receipts and photos open in a window of their own (Picture-in-Picture or a pop-up). Playbook #102 (receipt page) and #103 (this).

Still open: the Next Step card's long forms for the other stages (finance review used to be one; invoiced / payment pending, pricing and approval panels keep their inside look), the admin correction tab's form, the PO list / My Queue on a phone, the viewer in Arabic and on a phone, the viewer's window chrome in Edge and on a real second monitor.

## The Purchase Orders and Requisitions lists (2026-11-17 and 18, playbook #104)

The user: "now lets redo these two pages", all four areas (summary tiles, table rows, filters and search, page header and actions).
Done locally (not committed):

- **`ListKit` restyled** (it is the kit of FOUR screens: the PO list, the Requisitions list, My Queue and Cost Change Approvals, so
  the last two change too and were NOT looked at): calm tiles, `SearchBox`, `PillSelect`, `MoreFilters` (named dialog), applied-filter
  chips (every filter, including a tile's quick filter and "only mine", can be taken off from the chip row), empty state with a way
  out, priority tag, tinted `PersonCell`, `StageMini`, a real `RowMenu`, a `Pagination` landmark, the selection bar as a region.
- **Opt-in on shared components**: `Table readable` (readable headings, rows that open something are keyboard stops),
  `Checkbox indeterminate` (select-all says "some"), `FilterPresets inline` (the lists show their presets inside the More Filters
  panel instead of floating them over its edge, where the panel cut them off). `FilterPresets` itself (12 pages) got a polish:
  readable greys, field-look button, menu card, solid Save, a focus ring on the name box.
- **A bug class found on the way**: `‹` and `›` are mirrored by the browser in an RTL page, so the `rtl ? '›' : '‹'` swaps
  in `Pagination`, `AttendanceCalendar`, `DatePicker` and `PoPhotoViewer` flipped them back (Previous pointed away from page 1 in
  Arabic). All four fixed, playbook #25 corrected.
- **Checked**: tsc clean, lint clean in every line I changed, 68 mutations killed, 49 new tests plus the changed ones (see #104);
  real Chrome on a login-free harness of the real kit pieces (desktop light, dark, Arabic, phone light, phone dark Arabic).

Still open: the two real pages with real data on a phone, in the dark theme and in Arabic (needs the dev login); My Queue and Cost
Change Approvals after the kit change; the search placeholder is cut on a phone ("Search PO, vendor, p..."); the 10 other pages that
use `FilterPresets` still float its list (they are in open toolbars; add `inline` where one sits in a panel).

## The sidebar and the top bar (2026-11-18, playbook #106)

The user (screenshot of the PO page with the sidebar and top bar outlined): "update the side bar and top bar also to match the new UI
look". Done locally (not committed):

- **Sidebar**: pill rows (readable grey, solid accent for the page you are on, a heavier weight, an accent bar beside it); groups are
  real buttons (`aria-expanded`, `aria-controls` while open); an open group turns only its text accent and its page carries the tint,
  a closed group carries the tint; a visible guide line (`borderStrong`) beside an open group's pages; section headings are groups in
  the readable grey; the icon rail names every row (`title` + `aria-label` with the count) and shows a dot where a count was; counts
  are solid pills, overdue child counts are danger-tinted; the phone drawer has the identity card and 48px rows; chevrons rotate in
  Arabic; the header is 56px like the top bar. Permission gates and the items list are untouched.
- **Top bar**: one 36px `TopbarButton` for every control; breadcrumb (`nav` > `ol`, links for the pages above, the current page bold
  with `aria-current`, an id is plain text); search with its shortcut named; language, theme, bell with a capped count and a name that
  says how many, avatar menu (identity header, Profile, Settings, Sign out); company menu as radio rows with a tick; every menu is a
  real `menu` answering arrows, Home, End, Escape (focus back to the button) and Tab, with a solid keyboard ring.
- **Phone**: the bar owns the notch inset; the toast sits under it; the bottom bar got the readable grey / solid accent / `aria-current`.
- **Checked**: tsc clean, lint clean in every line I changed, the shell and list tests pass, 153 mutations (24 survived the first tests,
  each named a missing assertion, all killed after new tests); real Chrome on a login-free
  harness of the real `Sidebar` / `Topbar` / `BottomNav` (desktop light, dark, Arabic, rail, tablet, phone, drawer).

Still open: the real pages with real data (needs the dev login), a physical phone with a notch, the breadcrumb's `#29ee62b4` for
record pages (a page would have to register its title), `⌘K` on a Mac, Safari and Firefox.
