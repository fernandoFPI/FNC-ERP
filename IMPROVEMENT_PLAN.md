# FNC ERP — Improvement Plan & Session Handoff

> **Purpose of this file:** durable memory of the diagnosis, models, and the
> phased implementation plan we agreed on, so any future session can pick up
> without re-deriving everything. Read this top-to-bottom before starting work.

Last updated: 2026-07-20

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
4. Tab labels mislead ("Preliminary Engineering" = doc control; "Planning &
   Detailed Engineering" = scheduling).
5. Some modules out-run team maturity (Primavera import, resource leveling, EVM).

---

## 5. The six-phase implementation plan

Guiding rule: connect, standardize, clarify. Guardrails: role × action table
before any permission edit; never broaden access silently; verification checklist
per change; migrations additive & reversible.

**Phase 0 — Quick Clarity Wins** (S · no deps) — *recommended start*
- Rename misleading tabs (use the client's vocabulary: Engineering, Planning & Schedule).
- Surface Cost Control's hidden sections (wire existing GraphQL into new nav).

**Phase 1 — Permission & Identity Foundation** (M · gates Phase 3)
- 🐛 Fix identity: name-matching → `user_id`/`employee_id`.
- Add project sub-modules to the permission registry.
- Build `useProjectCapability(module)` unified resolver.
- Seed role templates from the confirmed capability matrix.

**Phase 2 — Lifecycle as Config** (M–L · no deps)
- Migration: `lifecycle_phases` + `phase_modules`; seed the 6-phase spine.
- Refactor hardcoded `PHASE_ORDER`/`LIFECYCLE_STAGES` + tab filters to read config.
- Keep commercial status a separate axis. Add the **conditional design gate**.
- Admin screen to edit phases/labels/module placement.

**Phase 3 — Adaptive UI** (L · needs P1 + P2)
- Apply capability rule everywhere (hidden/read-only/actions/sign-off).
- Phase-grouped navigation (16 tabs → 6 groups + cross-cutting).
- Eng-doc pipeline stepper + single "next action" CTA.
- Bidding per role (Commercial / Technical / PM) with the two-envelope layout.

**Phase 4 — Unified Revisioning** (M · can run in parallel)
- One pattern: `revision_group_id + is_current + revision + history` + helpers.
- Migrate Client Docs, Eng Docs, Drawings; add to Bids & Contracts.
- Standard revision UI: current badge, compare, supersede trail (reuse the guard).
- Client's scoping: revisions at design stage, variations at execution.

**Phase 5 — Module Linking** (L · highest value, incremental)
- VO → contract value + cost budget (do first — financial integrity).
- Quote → cost line. PO → cost commitment.
- Then: SI → VO hard link; transmittal → eng doc; meeting action → task; risk → issue.
- Adopt the client's scope taxonomy (main/variation/addition/descope).

**Sequence:** 0 + 1 together → 2 → 3 → 5, with 4 woven in when there's capacity.

---

## 6. Key file locations (so a new session finds things fast)

- **Project detail (all tabs, inline):** `apps/web/src/pages/projects/detail/ProjectDetail.tsx`
  - `ALL_TABS` list: ~line 96
  - `LIFECYCLE_STAGES` / `PHASE_ORDER` (hardcoded lifecycle): ~lines 118–127
  - Tab phase-gate `.filter()` chain: ~lines 583–594
  - 🐛 **Identity name-matching (Phase 1 fix target):** ~lines 535–536
    (`p.managerName === currentUserName`, `m.employee_name === currentUserName`)
  - `resolve()` project-permission logic: ~lines 548–560; `canEdit`/`canView`: ~562–579
  - Tab components (all inline): ClientDocumentsTab 3151, BiddingTab 3784,
    EngineeringTab (doc control) 4485, AttachmentsTab 7047, HandoverTab 7356,
    RiskRegisterTab 7719, ContractManagementTab 8153, ExecutionTab 8689,
    PlanningTab 9790, CostControlTab 10478 (nav only `overview`+`budget` ~10487),
    VariationOrdersTab 10697, MeetingsTab 11208
- **Permission hook:** `apps/web/src/hooks/usePermission.ts`
- **Permission registry:** `apps/web/src/lib/permissionRegistry.ts`
  (projects module lacks sub-modules — Phase 1 adds them)
- **Gateway GraphQL:** `services/gateway/src/graphql/schema.ts`, `resolvers.ts`
  - Eng-doc workflow `TRANSITIONS` map + `performDocWorkflowAction`: resolvers ~5900
- **Frontend GraphQL:** `apps/web/src/graphql/projects.ts`
- **Migrations:** `packages/db/migrations/` (latest committed here = 165)

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

## 8. Already shipped (in this checkpoint commit)

Engineering-document workflow work is DONE and migrated:
- Auto-generated transmittal refs (issue + client response actions).
- Client Comment Register for Code B/D responses — **migration 164**, full CRUD +
  inline register UI + counts on the doc row.
- As-built → "Move to Bidding" status — **migration 165**.
- Supersede guard (typed `SUPERSEDE` confirmation + warning banner) and fixed
  `return_to_author` transitions (now valid from `approved_with_comments`, `as_built`).
- Plus prior uncommitted work: risk register (158), engineering discipline expand
  (159), drop PRODOM modules (160), handover (161), eng-doc workflow (162),
  notification reminders (163), notifications GraphQL, eng-doc email template,
  eng-doc reminders worker job.

Migrations 162 & 163 were applied directly to the dev DB before being tracked;
they are now recorded in `schema_migrations`. Local dev DB is at migration 165.

---

## 9. Recommended next action

Start **Phase 0** (tab rename + Cost Control surfacing) — fast, safe, visible —
then bring the **Phase 1 identity fix** with a root-cause → evidence →
minimal-fix → risk writeup **and a role × action table** for approval before
editing (permission change; do not cowboy it).
