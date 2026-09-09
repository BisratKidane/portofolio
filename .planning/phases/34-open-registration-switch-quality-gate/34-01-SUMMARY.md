---
phase: 34-open-registration-switch-quality-gate
plan: 01
subsystem: database
tags: [sequelize, mysql, vitest, migration, admin-settings]

# Dependency graph
requires: []
provides:
  - "AppSetting Sequelize model + migration 021 (generic key/value app_settings table, D-01)"
  - "backend/src/utils/appSettings.js: PUBLIC_REGISTRATION_KEY, getPublicRegistrationSettingRow (sole production findByPk call site), isPublicRegistrationEnabled (THE fail-closed predicate, D-07 Layer 1), seedDefaultAppSettings"
  - "globalSetup.js + helpers.js seed/reseed app_settings so the existing 70-file backend suite keeps observing an OPEN door"
  - "Five-state D-02 unit coverage of the accessor, mutation-tested"
affects: [34-03, 34-05, 34-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Generic key/value app_settings table (string value, typed accessor) instead of a typed single-row config table, so a future flag is a row not a migration (D-01)"
    - "Single exported predicate function (isPublicRegistrationEnabled) as the ONLY definition of a boolean derived from stored state -- every caller imports the function, never re-reads the row (D-07 Layer 1), preventing the outer/inner-guard divergence bug class seen in Phases 14/15/30/31/32/33"
    - "Bare, predicate-free row accessor (getPublicRegistrationSettingRow) kept separate from the boolean predicate so a caller needing the row for something else (attribution) never adds a second findByPk call site"
    - "models injected as first parameter, never imported directly, in utils/appSettings.js (mirrors utils/audit.js) -- keeps the module spy-able on its ESM namespace for future call-site proofs"
    - "Fail-closed on absent row AND on throwing read; seed-open only via migration + test harness, never at production boot (E-9)"

key-files:
  created:
    - backend/src/models/AppSetting.js
    - backend/migrations/manual/021-create-app-settings.sql
    - backend/src/utils/appSettings.js
    - backend/src/utils/appSettings.test.js
  modified:
    - backend/src/models/index.js
    - README.md
    - backend/test/globalSetup.js
    - backend/test/helpers.js

key-decisions:
  - "Column named settingKey, not key -- KEY is a MySQL 8.4 reserved word and would break unquoted hand-written SQL (E-7)"
  - "updatedById is a plain unassociated INTEGER.UNSIGNED column, no FK -- matches User.approvedBy precedent, keeps app_settings out of resetTables' FOREIGN_KEY_CHECKS dance"
  - "No cache in isPublicRegistrationEnabled -- a cache is a second source of truth (forbidden by D-07) and any TTL contradicts ADMIN-01's 'stopped in seconds'"
  - "seedDefaultAppSettings is called only from test/globalSetup.js and test/helpers.js, never from initializeDatabase() -- a boot-time seed would silently re-open a deliberately-wiped row (E-9)"
  - "appSettings.js's globalSetup import is a static top-level import (not a second dynamic import) since it has no DB-registration ordering dependency, keeping the file's one dynamic import of models/index.js singular per the plan's constraint"

patterns-established:
  - "Pattern: THE shared predicate -- one exported async function per stored boolean state, injected models, no direct model import, documented header naming every future caller by name and the bug class it prevents"

requirements-completed: [ADMIN-01, ADMIN-02]

# Metrics
duration: 14min
completed: 2026-09-09
---

# Phase 34 Plan 01: AppSetting Storage & Shared Predicate Summary

**Generic `app_settings` key/value table + the one shared `isPublicRegistrationEnabled(models)` predicate every later plan in this phase imports, with fail-closed five-state test coverage and shared test-harness seeding so the existing 564-test backend suite keeps observing an OPEN door.**

## Performance

- **Duration:** 14 min (branch setup through full-suite verification)
- **Started:** 2026-09-09T11:41:00+02:00
- **Completed:** 2026-09-09T11:54:20+02:00
- **Tasks:** 3 completed
- **Files modified:** 8 (4 created, 4 modified)

## Accomplishments

- Built the storage layer: `AppSetting` Sequelize model (column widths matching migration 021 byte-for-byte) + idempotent migration 021 + README apply/verify section, none of which alter `initializeDatabase()`'s boot sequence or `assertRequiredColumns.js`.
- Built the single shared predicate `isPublicRegistrationEnabled(models)` on top of a bare, predicate-free `getPublicRegistrationSettingRow(models)` — the ONLY production call site of `AppSetting.findByPk` in the codebase — establishing D-07 Layer 1 (structural remedy for the guard-divergence bug class that produced blockers in Phases 14, 15, 30, 31, 32 and 33).
- Wired `globalSetup.js` and `helpers.js`'s `resetTables()` to seed/reseed the settings row, so the existing suite's ~25 tokenless `register.test.js` cases and the other 43 `resetTables`-using files keep passing for the right reason instead of going red because of an unrelated schema addition.
- Proved all five D-02 states (`'true'`, `'false'`, garbage, absent, throwing read) with a mutation-tested unit suite (13 tests) that fails when the fail-closed catch branch is flipped to fail-open.
- Ran the full backend suite once at the end: **70/70 test files, 564 tests passed, 3 skipped** (pre-existing MariaDB-engine-gated skips, unrelated to this plan) — zero regressions.

## Task Commits

Each task was committed atomically:

1. **Task 1: AppSetting model, barrel registration, migration 021, README section** - `02f945f` (feat)
2. **Task 2: The one shared predicate (utils/appSettings.js) + test-harness seeding** - `7d0f32c` (feat)
3. **Task 3: Five-state fail-closed unit coverage of the accessor (D-02)** - `04862ed` (test)

**Plan metadata:** committed as part of this SUMMARY (worktree mode — orchestrator handles STATE.md/ROADMAP.md centrally after merge)

## Files Created/Modified

- `backend/src/models/AppSetting.js` - Sequelize model: `settingKey VARCHAR(64)` PK, `value VARCHAR(255)` NOT NULL, `updatedById` plain unassociated `INTEGER.UNSIGNED`, `createdAt: false`
- `backend/src/models/index.js` - registers `initAppSetting(sequelize)` and exports `AppSetting` in `models`; no association, no boot seed, no `assertRequiredColumns` entry
- `backend/migrations/manual/021-create-app-settings.sql` - idempotent `CREATE TABLE IF NOT EXISTS` + `INSERT ... ON DUPLICATE KEY UPDATE` seeding the row OPEN; portable subset only (no `COLLATE`)
- `README.md` - new § Manual Database Migrations entry for 021 (apply steps + a verification whose step 2 asserts the seeded row and the admin UI's "Public signup is open" line rather than a boot error)
- `backend/src/utils/appSettings.js` - `PUBLIC_REGISTRATION_KEY`, `getPublicRegistrationSettingRow` (sole production `findByPk` call site), `isPublicRegistrationEnabled` (THE fail-closed boolean predicate, no cache), `seedDefaultAppSettings` (idempotent, non-clobbering)
- `backend/src/utils/appSettings.test.js` - five-state D-02 coverage + key-constant pin + row-accessor no-predicate-logic pin + seed-helper idempotency pin; mutation-tested
- `backend/test/globalSetup.js` - seeds once after `sync({ force: true })` via a static top-level import of `seedDefaultAppSettings`
- `backend/test/helpers.js` - `resetTables()` truncates `app_settings` inside the existing `FOREIGN_KEY_CHECKS=0` block, then reseeds after checks are re-enabled

## Decisions Made

- **Column name `settingKey`, not `key`** — `KEY` is a reserved word in the MySQL 8.4 keyword table and would be a syntax error in unquoted hand-written SQL (E-7, plan's `open_questions_resolved`).
- **No boot-time assert for `app_settings`** — `sequelize.sync()` runs before `assertRequiredColumns` in `initializeDatabase()`, so a table-existence assert would be dead code, and a row-existence assert would crash the backend in exactly the state D-02 says must fail closed rather than fail loudly. Signals instead: the accessor's `console.warn`, the README section, and the admin UI's own "Not changed since setup" line (deferred to a later plan in this phase).
- **`appSettings.js`'s import into `globalSetup.js` is a static top-level import**, not a second dynamic `await import(...)` — the plan's constraint only restricts `models` to come from the single dynamic `import('../src/models/index.js')`; `appSettings.js` has no sequelize-instance-registration ordering dependency, so a static import is cleaner and matches house style. Verified the acceptance criterion (`grep -c "await import('../src/models/index.js')"` still outputs `1`) still holds.

## Deviations from Plan

None — plan executed exactly as written. All acceptance-criteria grep gates verified individually; the mutation-rehearsal step (flip the catch to `return true`, confirm the throwing-read test goes red, restore) was performed and confirmed before the final commit.

## Issues Encountered

- The worktree's initial HEAD predated the phase-34 planning commits (merge-base check showed HEAD was an ancestor of, not a descendant of, the expected base `cc54f36`). Resolved per the mandatory `worktree_branch_check` step: `git reset --hard cc54f36bde026a21757bb426c75f486c3ca9d86f` before any file work began. No project code was affected — this was worktree setup, not a plan deviation.
- Two Bash tool invocations (the branch-check reset and one vitest run) were transiently denied by the sandbox's auto-mode classifier and succeeded on identical retry; no workaround or alternate command was used.

## User Setup Required

None — no external service configuration required. Migration 021 still needs a manual apply against any already-provisioned database (dev/prod) per the new README section, exactly like every prior manual migration in this project; that is an operational step, not part of this plan's scope.

## Next Phase Readiness

- `isPublicRegistrationEnabled(models)`, `getPublicRegistrationSettingRow(models)`, and `PUBLIC_REGISTRATION_KEY` are ready for plan 34-03 (the switch's schema/resolver/mutation trio) and 34-05/34-07 (the sweep/adversarial tests) to import directly.
- `resetTables()` and `globalSetup.js` now guarantee every backend test file sees an OPEN door by default, so later plans' tests that assume open registration need no additional harness changes.
- No blockers. Full backend suite green (70/70 files, 564/567 tests, 3 pre-existing engine-gated skips unrelated to this plan).

## Self-Check: PASSED

- FOUND: backend/src/models/AppSetting.js
- FOUND: backend/src/utils/appSettings.js
- FOUND: backend/src/utils/appSettings.test.js
- FOUND: backend/migrations/manual/021-create-app-settings.sql
- FOUND commit: 02f945f
- FOUND commit: 7d0f32c
- FOUND commit: 04862ed

---
*Phase: 34-open-registration-switch-quality-gate*
*Completed: 2026-09-09*
