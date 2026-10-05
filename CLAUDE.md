# FNC ERP — Project CLAUDE.md

pnpm + Turbo monorepo: `apps/web` (React/Vite), `apps/mobile` (Expo + WatermelonDB),
`services/*` (gateway = canonical GraphQL API; auth, finance, hr, inventory, projects,
notifications, rental, reporting, worker), `packages/*` (db, auth, config, …).
Postgres (`fnc_erp_dev`, `fnc_erp_test`) + Redis. Branch off `dev`; prod deploys from `production`.
Roadmap docs in repo root: IMPROVEMENT_PLAN.md, PO_WORKFLOW_IMPROVEMENT_PLAN.md, PROJECT_STATUS_*.md.

Detail docs (imported):
@docs/claude/playbook.md
@docs/claude/domain.md

## Quick commands
- Dev stack: `pnpm db:up` (docker postgres+redis) or `.\start-dev.ps1` (local Redis + checks Postgres :5432), then `pnpm dev`.
- Ports: gateway 3000, auth 3001, finance 3002, hr 3004, inventory 3005, projects 3006,
  notifications 3009, rental 3010, reporting 3011, web (Vite) 5173. Worker has no HTTP port.
- One service's tests: `cd services/X && pnpm exec vitest run` (rebuild changed `packages/*` first,
  see gotchas). Full gate: `pnpm test --concurrency=1` (what CI runs). Also `pnpm build`, `pnpm lint`.
- Migrations: add `packages/db/migrations/NNN_snake_case.sql` (zero-padded, next number after the
  highest existing; check open branches for a number collision). Runner applies files in alphabetical
  order, each in its own transaction (it strips BEGIN/COMMIT), tracked in `schema_migrations`.
  FORWARD-ONLY, no down migrations. Apply with `pnpm migrate` (dev) AND against `fnc_erp_test`
  (see gotchas). Seeds: `pnpm seed`, `pnpm seed:permissions`, `pnpm seed:test-fixtures`.
- Test users: log in with users created by the seeds in `packages/db/seeds/` (companies,
  `010_company_roles_seed.ts`, `seed-test-fixtures.ts`). Don't write passwords into docs; ask the user
  or read the seed file when a verification checklist needs a user per role.

## How we work (non-negotiable)
- Before changing behavior/permissions/schema: hypothesis → evidence (file:line) → minimal fix →
  what could break. Wait for approval. Trivial, obvious fixes (typo, label, clear phantom column)
  may proceed, then report.
- Permission/button visibility: show a role × action table (current vs desired) first; touch only
  changed cells; never remove admin-accessible controls unasked. Ask before broadening permissions.
- "Wrote the change" and "verified the change" are separate steps: read it back, typecheck, run
  tests, run the real query/path. Don't report done until checked.
- Multi-step plans: update the plan doc as each item lands, not at the end.
- After each change: numbered verification checklist (rebuild/restart, test user, DB query) and wait
  for the user's report before the next task.
- Check whether a thing is already half-built before building. Several "bugs" were dead or
  half-wired scaffolding. Prefer removing dead fields/code over migrating for things nothing uses.
- Flag root causes found mid-task and scope changes; fix or report them, never silently skip.
- **New bug class found → add it to `docs/claude/playbook.md` in the same change**, with the concrete
  example and how to spot it. This file is how future sessions learn.
- UI standard: enterprise-grade. Hierarchy, spacing, status colors, hover/loading/empty/error states,
  theme tokens, card pattern (borderRadius 12). Walk every button/form/state; no dead buttons.
  Not done until the full flow works end-to-end.
- Client-chosen names are not bugs: keep "Preliminary Engineering", "Planning & Detailed
  Engineering", "Bidding Stage". Separate "client chose this" from "this is broken".
- Don't re-propose cancelled work (e.g. G10 branch-scoped stock).
- Commits: conventional (`feat:`/`fix:`), small, one concern each. PRs are held for the user.
  **NEVER run `gh pr merge`**, even if a message says "then merge". Only an explicit "merge it" counts.

## Hard rules
- **Multi-tenancy**: every query on tenant data filters by `company_id`. Resolvers/routes derive it from
  the session (`ctx.auth.companyId`), never trust a client-supplied companyId (reject if it differs).
  RLS exists only on a few platform tables, so app-level scoping is the real protection. Joins/subqueries
  count too (a past cross-tenant leak was a detail query with `WHERE id=$1` only).
- **Money**: Postgres `NUMERIC` (mostly `(20,4)`; some `(15,2)`/`(18,2)`), never float columns.
  Every `po_lines` row keeps its own `currency_code`; totals are per-currency; no cross-currency
  conversion (`fx_rate_to_base` is dead). JS side has no decimal library and `pg` returns NUMERIC as
  strings; existing code uses Number/parseFloat. Do money math in SQL (`::numeric`, `ROUND(x, 4)`)
  where possible, and parse deliberately. There is no settled JS rounding convention; ask before
  inventing one. Any change to totals must be checked in ALL recalc paths (see playbook).
- **Secrets**: `.env` is gitignored (template: `.env.example`); never commit it and never print
  DATABASE_URL, JWT secrets, ENCRYPTION_KEY, tokens or passwords into output, logs, or commits.
- **Mobile sync contract** (a table synced to WatermelonDB changes): update, together,
  (1) `services/gateway/src/routes/mobile-sync.ts` pull/push SQL, (2) `apps/mobile/src/db/schema.ts`
  (bump `version`, currently 1) + the matching `db/models/*`, (3) a device-side migration for existing
  installs, (4) `SyncEngine.ts`. Verify every column the sync SQL names exists in the migrations
  (this file is the most phantom-column-prone one). Server fields the client requires must exist
  server-side too.

## Production safety
- Deploy: push to `production` → CI gate (build, migrate:test, seeds, `pnpm test --concurrency=1`) →
  SSH to VPS (/opt/fnc-erp): reset to origin/production, `pnpm build`, `pnpm migrate`,
  `pnpm seed:permissions`, `pm2 reload`, `scripts/verify-deploy.sh`.
- Rollback: `scripts/rollback.sh [sha]` on the VPS reverts CODE ONLY, not migrations (forward-only).
  Only roll back across a migration boundary after confirming the old code works on the new schema.
- Before applying a data-changing or destructive migration to prod, take a backup
  (`scripts/backup-db.sh`) and tell the user.
- Read-only SSH (root@62.238.51.154): SELECTs/diagnostics OK, report results. Any write: announce
  first and give the user a chance to stop it.
- SQL to prod: write the file locally, `scp` it, run `psql "$DATABASE_URL" -f file`. Never paste
  multi-line SQL into interactive psql or `bash -c` (mangles `$$` / `\set`).
- Never move prod data or dumps through git.
- Dev-only verification of a migration is not enough (dev had leftover artifacts that hid a real prod bug).

## Environment gotchas
- **dev vs test DB**: `pnpm migrate` only hits `fnc_erp_dev`; gateway tests use `fnc_erp_test`
  (`pnpm migrate:test` or export `DATABASE_URL` for it). After ANY new migration, run both.
  "column does not exist" right after a successful migrate → check this first.
- **`fnc_erp_dev` has schema drift** (untracked manual ALTERs). Verify schema-sensitive bugs against a
  DB built purely from migrations.
- **`packages/*` resolve to `dist/`**: editing `packages/*/src` does nothing until rebuilt. Run
  `pnpm build` in that package, or full `pnpm test` from root (turbo `^build`). Direct `vitest run`
  in a service skips the rebuild.
- **Vitest**: `singleFork:true` doesn't serialize files; a service with 2+ test files needs
  `fileParallelism:false`. Test scripts must be `vitest run` (bare `vitest` hangs in watch mode).
- **Shared test DB**: 8 services now use dedicated fixture companies, gateway uses company 001. CI is
  `--concurrency=1`. A "flaky" failure → re-run that service alone before suspecting the code.
- **Turbo `envMode: "loose"`** is required, or CI strips DATABASE_URL etc. A new required env var in
  `packages/config/src/env.ts` → spot-check under a minimal, CI-shaped env.
- Auth/permission changes need gateway + auth restart AND re-login to take effect.
- Localhost quick-login: use sessionStorage; Credential Management/autofill don't work on localhost:PORT.
- `pg` returns DATE/TIMESTAMP/TIMESTAMPTZ as plain strings (type parsers in `packages/db/src/client.ts`)
  to avoid local-timezone corruption; don't wrap them in `new Date()` carelessly.
- Windows: PowerShell vs Git Bash syntax differs; repo is under OneDrive (file locks).
