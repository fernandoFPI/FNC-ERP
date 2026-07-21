# FNC ERP — Improvement Plan & Session Handoff

> **Purpose of this file:** durable memory of the diagnosis, models, and the
> phased implementation plan we agreed on, so any future session can pick up
> without re-deriving everything. Read this top-to-bottom before starting work.

Last updated: 2026-07-21

---

## 1. The core diagnosis

The system is **feature-rich, not feature-poor.** A full read of all 16 project
tabs confirmed several modules are enterprise-grade (Planning = WBS/CPM/EVM +
Primavera import; Execution = full QA/QC; Engineering = two-track doc control).
Adding more features will **not** fix what feels wrong.

The friction comes from **three roots**:

1. **Modules are silos — the bridges are missing.** Data won't flow between
   tabs, so users re-key. (Biggest finding.)
2. **Access is decided by name-matching** — a real bug (see §6, Phase 1).
3. **The lifecycle is hardcoded**, so every client change is a re-architecture.

North star for all work: **connect, standardize, clarify — not build more.**

---

## 2. The lifecycle model (the fixed spine)

Six phases, fixed in code because they map to **contract events**, not
deliverables. Everything a client can change lives *inside* a phase as config.

```
1. ENQUIRY / RFQ   →│ gate: go / no-go
2. BID & ESTIMATE  →│ gate: submitted
3. AWARD & CONTRACT→│ ✦ WON — RFQ becomes a live project (the pivot)
4. ENGINEERING     →│ gate: IFC issued
5. EXECUTION       →│ gate: works done
6. HANDOVER/CLOSEOUT→│ gate: accepted
```

**Two axes, kept separate:**
- **Commercial status** (deal state): pending → submitted → approved/won →
  ongoing → completed, plus off-ramps on_hold / cancelled / cancelled_after_approval.
- **Delivery phase** (the six above).

**Cross-cutting modules** run across all phases: Cost Control, Variation Orders,
Risk, Meetings, Attachments, Team, History.

### Refinements from the client's own mind map (fold these in)
The client independently produced a "Project and Tender Management" mind map that
**validated this spine** (Tender Record = parent → Award Trigger → Project
Conversion). It added three things that are *better* than our original and should
be adopted:
1. **Conditional Design Gate** — engineering/design is optional ("Stage 3 Skip").
   Some tenders skip pre-engineering and go straight to submission. Model as a
   config gate type. → affects Phase 2.
2. **Two-envelope Submittal Package** — Technical Folder (compliance / specs /
   bidder capabilities) + Commercial Folder (pricing / terms / contracts).
   Matches real tendering. → affects Bidding UI (Phase 3).
3. **Scope taxonomy** — Main Scope / Variations / Additions / Descope as a living
   contract-scope model. → affects Phase 5 (Contract & Scope linking).
Also watch: the client's map folded commercial status into "Stage 4" — keep it a
**separate axis**, not a stage, or the old confusion returns.

---

## 3. Permissions & the capability matrix

Two disconnected permission systems exist today:
- **Global registry** (`apps/web/src/lib/permissionRegistry.ts`) — clean
  `module.submodule.action` model with levels none < view < edit < approve < admin.
  **But its `projects` entry has NO sub-modules** (no `projects.bidding`,
  `projects.engineering`, etc.).
- **Ad-hoc project-tab system** (in `ProjectDetail.tsx`) — per-member overrides
  (`edit`/`view`/`none`) keyed by **name-matching** (the bug). Lives outside the
  registry.

**Target model — one capability grid** (roles × modules × level), rendered by a
single `useProjectCapability(module)` hook:
- **none → tab hidden · view → read-only · edit → action buttons · approve → + sign-off buttons.**
- Two layers on top: per-user override (exists) + phase gating (exists).
- Access = `role level` AND `phase reached`.

Default matrix roles: PM / Commercial / Engineering / Procurement / Viewer
(+ Admin bypass). Draft cell values are in the Capability Matrix artifact (§7);
they still need the client's corrections before enforcing.

---

## 4. Tab audit summary (all 16 read in source)

| Tab | Rating | Key gap |
|---|---|---|
| Overview | ●●●●○ | health score partly hardcoded |
| Client Documents | ●●●○○ | simple revisioning; no transmittal link |
| Preliminary Engineering (= Doc Control) | ●●●●● | **mislabeled**; revision compare |
| Bidding | ●●●●○ | no bid revisioning; quote→cost not linked; single-currency; no win/loss |
| Contract Management | ●●●○○ | flat retention; VOs don't flow into contract value |
| Planning (= Schedule) | ●●●●● | possibly over-built vs team maturity |
| Execution | ●●●●● | huge surface; SI→VO link is text only |
| Handover | ●●●○○ | retention-release read-only; no cert PDF |
| Procurement | ●●○○○ | window only; navigates out; no commitment tracking |
| Cost Control | ●●●○○ | **backend richer than UI** — subcontracts/labor/equipment/cash-flow/forecast/billings built but not surfaced |
| Variation Orders | ●●●●○ | approved VO doesn't update contract value or cost budget |
| Risk Register | ●●●●○ | standalone; not linked to issues/VO/cost |
| Meetings | ●●●○○ | actions don't become tasks/notifications |
| Team | ●●●○○ | **name-based identity** (the bug); thin role model |
| Attachments / History / Stages | ●●●○○ | fine as support |

**Five cross-cutting findings:**
1. Modules are silos — missing/text-only links (the big one).
2. Revisioning inconsistent — 4 patterns (Client Docs `uploadRevision`; Eng Docs
   `docGroupId + isCurrent + history`; Drawings `parentDrawingId`; Bids/Contracts none).
3. Cost Control's backend is richer than its screen.
4. Tab labels follow the **client's process vocabulary**, not the component's
   internal structure ("Preliminary Engineering" = the doc-control tab used in the
   preliminary phase; "Planning & Detailed Engineering" = scheduling). **The
   client requested these names — keep them, do NOT rename.** (Only label change
   made: Bidding → "Bidding Stage", per client request.)
5. Some modules out-run team maturity (Primavera import, resource leveling, EVM).

---

## 5. The six-phase implementation plan — STATUS: Phases 0-3 DONE, Phase 4 in progress

Guiding rule: connect, standardize, clarify. Guardrails: role × action table
before any permission edit; never broaden access silently; verification checklist
per change; migrations additive & reversible.

**Phase 0 — Quick Clarity Wins** ✅ DONE
- ~~Rename misleading tabs~~ — CLIENT WANTS THE NAMES KEPT. Only change made:
  Bidding → "Bidding Stage" (done). Preliminary Engineering / Planning & Detailed
  Engineering names untouched, per client request.
- Cost Control hidden sections surfaced: 7 new sections (Committed, Subcontracts,
  Labor, Equipment, Cash Flow, Forecast, Client Billing) with full CRUD, config-
  driven table + unified modal. Note: these were once deliberately moved to
  Finance — user chose to rebuild in Cost Control anyway (possible overlap with
  Finance AR/AP/Retention, not yet reconciled — candidate for Phase 5).

**Phase 1 — Permission & Identity Foundation** ✅ DONE
- 🐛 Identity fixed: auth service (login/mfa/me) now joins `employees` and
  returns `employeeId`; `authStore.User` + `useAuth` thread it through;
  `ProjectDetail` derives PM/team by `employeeId`, falling back to name-match
  only when a user has no linked employee record (safe rollout).
- 11 project sub-modules added to both permission registries (backend +
  frontend copy): client_documents, engineering, planning, bidding, contracts,
  execution, procurement, cost_control, variations, risk, handover, meetings.
- `useProjectCapability` hook + `projectCapabilityMatrix.ts` built
  (`resolveProjectCapability` pure fn: admin > override > max(grant, role) >
  phase gate). Matrix cells confirmed by user.
- Role-template seeding from the matrix: NOT done (deferred — capability
  resolver reads the matrix directly in code, not via seeded DB role templates).

**Phase 2 — Lifecycle as Config** ✅ DONE
- Migration 166: `lifecycle_phases` + `lifecycle_phase_modules`, seeded per
  company with the OLD phase keys (no risky phase-value migration; behavior
  preserved). Migration 167: added `label` column so tab names are also
  configurable, not just phase names.
- `lifecycleConfig` GraphQL query; `ProjectDetail` reads phases/labels/tab-gating
  from config with hardcoded fallback if config is empty/unloaded.
- Admin screen: **Settings → Company → Project Lifecycle** — rename phases, mark
  a phase "skippable" (the conditional design gate flag from the client's mind
  map — stored, not yet wired into workflow logic), rename tabs, set which phase
  each tab appears from. `updateLifecyclePhase` + `updateLifecycleModule`
  mutations, admin-gated + company-scoped.

**Phase 3 — Adaptive UI** ✅ DONE (5 slices)
- Slice 1: `resolveProjectCapability` replaced the old ad-hoc `resolve()` —
  canEdit/canView now follow the confirmed matrix per role.
- Slice 2: per-module tab visibility — a tab shows only with ≥`view` capability;
  reconcile guard bounces a user off a now-hidden active tab.
- Slice 3: phase-grouped tab bar — dividers only (no text labels; inline
  uppercase group labels were tried and rejected as confusing, per feedback).
- Slice 4 + 4b: eng-doc `canEdit`/`canApprove` gating (approve-level actions —
  approve_for_issue, issue — now require engineering-approve, not just edit);
  read-only 7-stage pipeline stepper in the doc's expanded activity panel.
- Slice 5: bidding Approve/Reject gated by `canApprove.bidding`, not raw admin.

**Phase 4 — Unified Revisioning** ✅ DONE (approach: "standardize + fill gaps" —
adopt a shared pattern where a gap genuinely existed; do NOT rewrite the working
eng-doc/drawings/client-doc/submittal models)
- ✅ **P4.1** — Contract revisioning (contracts had NONE before). Migration 168:
  `project_contract_revisions` log (revisions-log pattern — fits a contract's
  dependent milestones/invoices better than new-row-per-revision), seeded Rev 1
  "Original contract". `reviseContract` mutation (snapshots new terms, bumps
  revision). New shared `components/ui/RevisionHistory.tsx` — reusable
  read-only timeline (current badge, who/when, summary, meta fields). Contract
  UI: Rev-N badge, Revise button, Revision History card, revise modal with live
  value delta + required change summary.
- ✅ **P4.2** — Bids had no revisioning either. Migration 169:
  `project_bid_revisions` (same aggregate-snapshot pattern — a bid isn't one row,
  it's `bid_commercial_summary` + `bid_cost_items`, so the revision snapshots the
  *computed* price + the 4 %s, not a line-item copy). New `reviseBid` mutation
  reuses the same price formula as the read resolver (factored into
  `computeBidPricing()` to kill a 4th copy-paste). Same UI pattern as contracts:
  Rev-N badge, Revise button, `RevisionHistory` card, revise modal.
- ❌ **P4.3 — decided NOT to do, on inspection.** The plan assumed Eng Docs and
  Client Docs could adopt the same `RevisionHistory` component. They can't
  without a real regression: their revisions are **actionable documents** (open/
  download an old file, see its status) — `RevisionHistory` is deliberately
  read-only (built for Contracts/Bids, where a "revision" is just numbers, not a
  file). Forcing them onto it would delete the open/download action on old
  revisions for the sake of visual sameness. The original audit finding
  ("revisioning inconsistent — 4 patterns") was true structurally, but the
  user-facing gap was never "these look different" — it was "no revision
  compare" and "no transmittal link," neither of which this would have fixed.
  Eng Docs/Client Docs keep their existing, richer, file-based revisioning as-is.
  (If genuine visual unification is wanted later, `RevisionHistory` would need
  an optional per-revision action slot first — not attempted, decide before
  starting if it comes up again.)

**Phase 5 — Module Linking** ⬜ NOT STARTED (highest value per the audit's #1
cross-cutting finding — modules are silos)
- VO → contract value + cost budget (do first — financial integrity; an approved
  VO currently doesn't update either).
- Quote → cost line (pull a supplier quotation straight into the bidding cost
  sheet instead of manual re-entry).
- PO → cost commitment (PO approval should create/update the committed cost;
  Cost Control's new "Committed Costs" section has a "Sync POs" button already
  wired to `syncPOCommitments` — worth checking if this already covers it before
  building more).
- Then: SI → VO hard link (currently a text ref); transmittal → eng doc; meeting
  action → task/notification; risk → issue.
- Adopt the client's scope taxonomy (main/variation/addition/descope) for the
  Contract & Scope model.
- Also worth reconciling here: Cost Control (Phase 0) vs Finance AR/AP/Retention
  — two entry points for related data now exist.

**Sequence actually taken:** 0 → 1 → 2 → 3 → 4 (in progress) — Phase 5 not yet
started. Original plan said "4 woven in when there's capacity"; in practice it
became the direct next phase after 3.

---

## 6. Key file locations (so a new session finds things fast)

Note: line numbers below drift as the file grows (~11.7k lines and counting) —
treat as approximate, always grep to confirm.

- **Project detail (all tabs, inline):** `apps/web/src/pages/projects/detail/ProjectDetail.tsx`
  - `ALL_TABS` list + `TAB_GROUP` map (Phase 3 grouping): near the top
  - Lifecycle config read (`lifecycleData` query, `moduleGate`, `phaseGte`,
    `moduleLabels`) + `DEFAULT_LIFECYCLE_STAGES`/`DEFAULT_MODULE_MIN_PHASE`
    fallbacks: replaced the old hardcoded `LIFECYCLE_STAGES`/`PHASE_ORDER`
  - ✅ Identity fix landed: `myEmployeeId = currentUser?.employeeId`, matches
    `p.managerId`/`m.employee_id` first, falls back to name only if unlinked
  - ✅ `resolveProjectCapability` (from `hooks/useProjectCapability.ts`) replaced
    the old ad-hoc `resolve()` — `canEdit`/`canView`/`canApprove` all derive
    from it now
  - `tabVisible()` — per-module capability-based tab hiding (Phase 3 slice 2)
  - Eng-doc pipeline stepper (`ENG_STEPPER_STAGES`, `ENG_STATUS_STAGE`) — in the
    expanded activity panel of `EngineeringTab`
  - Tab components (all inline, search by name): ClientDocumentsTab,
    BiddingTab (now takes `canApprove` prop), EngineeringTab (doc control, now
    takes `canApprove` prop), AttachmentsTab, HandoverTab, RiskRegisterTab,
    ContractManagementTab (now has `onReviseContract` + revision UI),
    ExecutionTab, PlanningTab, CostControlTab (nav now has 9 sections, not 2:
    overview/budget/committed/subcontract/labor/equipment/cash/forecast/billing),
    VariationOrdersTab, MeetingsTab
- **Shared revision UI:** `apps/web/src/components/ui/RevisionHistory.tsx` —
  module-agnostic revision timeline; adopted by Contracts (P4.1); Bids (P4.2)
  and Eng/Client Docs (P4.3) still to adopt it
- **Capability foundation:** `apps/web/src/lib/projectCapabilityMatrix.ts`
  (matrix + `TAB_TO_MODULE` map), `apps/web/src/hooks/useProjectCapability.ts`
  (`resolveProjectCapability` pure fn + hook wrapper)
- **Permission hook:** `apps/web/src/hooks/usePermission.ts`
- **Permission registry:** `apps/web/src/lib/permissionRegistry.ts` +
  `packages/permissions/src/registry.ts` (kept in sync manually — 11 project
  sub-modules added in Phase 1)
- **Lifecycle settings page:** `apps/web/src/pages/settings/company/lifecycle/LifecycleSettingsPage.tsx`
  (route: `/settings/company/lifecycle`)
- **Auth identity:** `services/auth/src/routes/auth.ts` (login/mfa/me now
  `LEFT JOIN employees`), `apps/web/src/store/authStore.ts` (`User.employeeId`)
- **Gateway GraphQL:** `services/gateway/src/graphql/schema.ts`, `resolvers.ts`
  - Eng-doc workflow `TRANSITIONS` map + `performDocWorkflowAction`: search resolvers
  - Lifecycle config: `lifecycleConfig` query, `updateLifecyclePhase`/`updateLifecycleModule` mutations
  - Contract revisions: `reviseContract` mutation, `project_contract_revisions` queries
- **Frontend GraphQL:** `apps/web/src/graphql/projects.ts`
- **Migrations:** `packages/db/migrations/` (latest = **168**, `168_contract_revisions.sql`)

---

## 7. Reference artifacts (published this session)

These are private artifacts on claude.ai (visual references):
- 🗺️ Lifecycle Reference — the fixed 6-phase spine
- 🔐 Capability Matrix — roles × modules × access (draft cells, needs client review)
- 🔍 Tab Audit — per-tab scorecard + 5 cross-cutting findings
- 📐 UX Mockup — pipeline stepper + phase-grouped nav
- 🧭 Consolidated Implementation Plan — the six phases above

(URLs live in the chat history; regenerate/relink if needed.)

---

## 8. Already shipped

**Engineering-document workflow** (pre-dates this program, DONE and migrated):
auto-generated transmittal refs, Client Comment Register for Code B/D responses
(migration 164), As-built → "Move to Bidding" status (migration 165), Supersede
guard (typed `SUPERSEDE` confirmation) + fixed `return_to_author` transitions.
Plus: risk register (158), engineering discipline expand (159), drop PRODOM
modules (160), handover (161), eng-doc workflow (162), notification reminders
(163), notifications GraphQL, eng-doc email template, eng-doc reminders worker job.

**This improvement program** (Phases 0-4.1, all committed on `dev`):
- `881da5f` — Phase 0-1: Bidding Stage rename, Cost Control 7 sections, identity
  fix, capability registry + hook foundation
- `e91e162` — Phase 2: config-driven lifecycle (migration 166)
- `348b12c` — Phase 2 admin screen + editable phase/tab names (migration 167)
- `c1c88d4` / `8baf219` / `945f5a1` / `21b08f4` / `7db87ba` — Phase 3 slices 1-5
  (capability wiring, tab visibility, grouped nav, eng-doc gating + stepper,
  bidding approve gating)
- `4896b5d` — Phase 4.1: contract revisioning + shared RevisionHistory component
  (migration 168)

Migrations 162 & 163 were applied directly to the dev DB before being tracked;
recorded in `schema_migrations` retroactively. **Local dev DB is at migration 168.**

**Also this session:** ran `/graphify` on the full repo (955 files) — knowledge
graph at `graphify-out/` (6577 nodes, 12326 edges, 499 communities), updated once
to backfill this file's own content + the notification spec + user guide. Use it
for "how does X work" orientation questions; still verify against live files
before citing as current fact or acting on it (see global CLAUDE.md).

---

## 9. Recommended next action

**Phase 4 is complete** (4.1 contracts, 4.2 bids; 4.3 deliberately dropped after
inspection — see §5). Next up: **Phase 5 — Module Linking**, the highest-value
phase per the original audit's #1 cross-cutting finding (modules are silos).
Start with **VO → contract value + cost budget** (financial integrity: an
approved variation order currently updates neither). Then quote→cost line,
PO→cost commitment (check whether Cost Control's existing "Sync POs" button on
Committed Costs already covers this before building more), SI→VO hard link,
transmittal→eng doc, meeting action→task, risk→issue, and the client's scope
taxonomy (main/variation/addition/descope).

**Operational reminders that keep coming up:**
- Gateway + auth services need a restart, and users need to **re-login**, before
  any Phase 1-3 permission/identity/lifecycle change is actually visible/testable.
- Every schema/migration change needs `pnpm migrate` with `DATABASE_URL` set
  (see any recent commit for the exact command used in this environment).
- Commit at phase/slice boundaries, not mid-slice — this file's §8 list is the
  audit trail of what's safely checkpointed.
