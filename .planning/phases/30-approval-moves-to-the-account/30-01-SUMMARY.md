---
phase: 30-approval-moves-to-the-account
plan: 01
subsystem: database
tags: [sequelize, mysql, mariadb, migration, users, approval]

# Dependency graph
requires: []
provides:
  - "User model exposes approvedAt/approvedBy/rejectedAt/rejectionReason as nullable storage fields mirroring Invitation.js's decision shape"
  - "backend/migrations/manual/019-add-users-approval-columns.sql, proven against a scratch-DB dry run AND applied to the real local dev database (portofolio)"
  - "Real local dev database (portofolio.users) now carries the four approval columns, confirmed via information_schema"
affects: [30-02-approve-reject-resolvers, 30-03-tests, 32-self-registration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ALTER-TABLE-on-existing-table manual migration with no FK (015/018 precedent), proven via an isolated scratch database before real-DB apply"

key-files:
  created:
    - backend/migrations/manual/019-add-users-approval-columns.sql
  modified:
    - backend/src/models/User.js

key-decisions:
  - "approvedBy on users is a plain unassociated INTEGER.UNSIGNED column (no FK, no Sequelize association) — matches the 015/018 ALTER-on-existing-table precedent rather than invitations.approvedBy's CREATE-TABLE-time FK"
  - "Migration 019 proven on a throwaway scratch database (gsd_phase30_migration_check) before asking a human to touch the real, already-provisioned local dev database — never assumed correct from grep/inspection alone"
  - "Production apply of 019 explicitly deferred (F-03) — not touched, not assumed, tracked as an open follow-up"
  - "Docker unavailable locally — native Homebrew MariaDB 10.5 client used in place of the plan's `docker compose exec` command for both the scratch-DB proof and the real-DB apply; same file, same statements, same engine, so treated as an environment-driven adaptation, not a scope change"

patterns-established:
  - "Scratch-database dry run (create → minimal target table → apply → DESCRIBE → drop) as the required proof gate before any manual migration is handed to a human for real-DB application"

requirements-completed: [APPR-01]

# Metrics
duration: ~25min (across an interrupted session on 2026-08-27 and a resumed/checkpoint-resolved session on 2026-08-28)
completed: 2026-08-28
---

# Phase 30 Plan 01: Approval Columns on the User Model Summary

**Added approvedAt/approvedBy/rejectedAt/rejectionReason storage fields to the User Sequelize model, wrote and proved a portable no-FK migration (019) against a scratch MariaDB database, and got human-confirmed application of that same migration to the real local dev database.**

## Performance

- **Duration:** ~25 min of active execution, spread across two sessions (interrupted 2026-08-27, resumed + checkpoint resolved 2026-08-28)
- **Started:** 2026-08-27 (original session, interrupted before any commit)
- **Completed:** 2026-08-28T06:38:45Z
- **Tasks:** 3 (2 auto tasks + 1 human-verify checkpoint)
- **Files modified:** 2 (`backend/src/models/User.js`, `backend/migrations/manual/019-add-users-approval-columns.sql`), plus 1 tracking doc (`deferred-items.md`)

## Accomplishments
- `User.js` now declares `approvedAt`/`approvedBy`/`rejectedAt`/`rejectionReason` as nullable fields, mirroring `Invitation.js`'s decision-field shape, so a self-registrant with no invitation row (Phase 32+) still has somewhere to record its own approval/rejection decision (D-04). Storage only — Plan 30-02's `approveUser`/`rejectUser` resolvers are what write to these fields.
- `backend/migrations/manual/019-add-users-approval-columns.sql` written following the 015/018 house style (header comment block, single `ALTER TABLE`, no FK, no `IF NOT EXISTS` guard) and proven end-to-end against an isolated scratch database (`gsd_phase30_migration_check`) on local MariaDB — created, altered, `DESCRIBE`d, and dropped, touching zero project data.
- A human applied the same migration file to the real local dev database (`portofolio`), and the orchestrator independently confirmed via `information_schema` (not on approval-message faith alone) that all four columns exist with the exact predicted types/nullability, with the database's 3 pre-existing user rows and no possibility of a double-apply (columns confirmed absent immediately before the apply, and the `ALTER TABLE` has no idempotency guard).
- Production apply (`agne.bisrat.ch`) remains explicitly deferred, not silently assumed — one of this plan's must_haves (F-03).

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the four approval columns to the User model** - `77b434f` (feat)
2. **Task 2: Write migration 019 and prove its portability via an isolated scratch-DB dry run** - `f582bab` (feat)
3. **(process) Log + re-verify a suspected pre-existing test failure discovered during Task 1's baseline check** - `ca0ce4f` (docs)
4. **Task 3: Apply migration 019 to the real local dev database (F-03)** - checkpoint, no code changes; resolved by human approval, no separate commit (verification-only task per plan)

**Plan metadata:** _(this commit — SUMMARY.md + STATE.md + ROADMAP.md)_

## Files Created/Modified
- `backend/src/models/User.js` - Adds `approvedAt`/`approvedBy`/`rejectedAt`/`rejectionReason` nullable fields (storage only), with a comment explaining the mirror-of-Invitation.js rationale
- `backend/migrations/manual/019-add-users-approval-columns.sql` - Portable `ALTER TABLE users ADD COLUMN ...` for the same four columns, no FK, following the 015/018 house style
- `.planning/phases/30-approval-moves-to-the-account/deferred-items.md` - Logs an out-of-scope investigation into a suspected pre-existing test failure, later retracted after re-verification

## Decisions Made
- `approvedBy` is a plain `INTEGER.UNSIGNED` column with no association/FK, deliberately diverging from `Invitation.js`'s association-derived `approvedBy` — matches the stronger ALTER-on-existing-table precedent (015/018), both of which add zero FKs.
- The migration's portability proof happens on an isolated, uniquely-named scratch database (`gsd_phase30_migration_check`), never the project's own dev/test databases, and is dropped immediately after — this pattern is now the template for any future manual migration in this project.
- Real local-dev apply required an explicit, non-silent human checkpoint (F-03) rather than an automated apply, because `sequelize.sync()` never alters existing tables and the real dev database already holds production-shaped data (3 user rows).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking, environment] Docker daemon unavailable — used native MariaDB client instead of `docker compose exec`**
- **Found during:** Task 2 (scratch-DB dry run) and Task 3 (real-DB apply)
- **Issue:** The plan's precedent commands (and Task 3's `how-to-verify`) assume `docker compose ... exec mysql`, but the Docker daemon is not running on this machine. The local environment instead runs a native Homebrew MariaDB 10.5 install listening on `127.0.0.1:3306`.
- **Fix:** Used the native `mysql` client directly (`export PATH="/opt/homebrew/opt/mariadb@10.5/bin:$PATH"`) for both the scratch-DB dry run and, in the adapted checkpoint instructions, for applying the migration to the real dev database (`DB_NAME=portofolio` from `env/local.env`, sourced rather than hardcoded to avoid echoing `DB_USER`/`DB_PASSWORD`). Same migration file, same SQL statements, same underlying MariaDB engine — no behavioral difference, purely a tooling substitution.
- **Files modified:** None (shell-command substitution only, no code/file change)
- **Verification:** Scratch-DB dry run completed cleanly end-to-end (see below); real-DB apply confirmed via `information_schema` by the orchestrator independently of the human's "approved" response.
- **Committed in:** N/A (no file change; documented here per Rule 3's environment-adaptation guidance)

**2. [Rule 1 - Bug/process] Retracted a stale pre-existing-test-failure claim after re-verification**
- **Found during:** Resume audit (before Task 1/2 commits)
- **Issue:** The interrupted prior session's `deferred-items.md` claimed `backend/src/resolvers/approveReject.test.js` had a pre-existing failure (`approveInvitation` test expecting 1 `AuditLog` row, finding 0), confirmed "identical in both runs" of the full suite.
- **Fix:** Re-ran the file in isolation 3 times and the full backend suite once more before committing Task 1/2 — all runs passed cleanly (7/7 on the file; 413 passed | 2 skipped, zero failures on the full suite). The claim did not reproduce, most likely a transient/stale test-DB artifact from the interrupted session (e.g., a leftover `AuditLog` row or in-progress schema state), not a durable bug in `approveInvitation`/`rejectInvitation`. Appended a re-verification note to `deferred-items.md` rather than silently keeping or silently deleting the original claim.
- **Files modified:** `.planning/phases/30-approval-moves-to-the-account/deferred-items.md`
- **Verification:** 3 isolated runs of `approveReject.test.js` (7/7 pass each) + 1 full-suite run (413 passed | 2 skipped, 0 failed)
- **Committed in:** `ca0ce4f`

---

**Total deviations:** 2 (1 environment tooling substitution, 1 process retraction). Neither changed the scope, files, or behavior specified by the plan.
**Impact on plan:** None — both deviations are process/tooling notes, not code changes. The retracted test-failure claim is explicitly **not** carried forward into Plan 30-02/30-03 unless it reappears there.

## Issues Encountered
- The Task 2 scratch-database dry run had no recorded evidence from the interrupted prior session (`gsd_phase30_migration_check` did not exist, no captured output). Re-ran the full 5-step sequence (create → minimal `users` table → apply → `DESCRIBE` → drop) myself during the resume; it completed cleanly with the exact expected column types/nullability, and the scratch database was confirmed dropped afterward.
- Task 3's checkpoint was correctly held for human action — the migration was **not** applied to the real dev database by the executor. The human applied it and responded "approved"; the orchestrator additionally verified independently via `information_schema` rather than trusting the approval message alone, confirming all four columns exist with matching types/nullability and that no double-apply occurred (columns were absent immediately before the apply).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `User.js` now has the storage fields Plan 30-02's `approveUser`/`rejectUser` resolvers need to write to on every decision (with or without an invitation row).
- The real local dev database (`portofolio`) already carries the four columns, so Plan 30-02/30-03's resolver and integration-test work can be exercised against it immediately — no further manual migration step is needed before that work starts.
- Production apply of migration 019 remains an explicit, deferred, separate step (F-03) — must happen before any approve/reject code path is exercised against production, but is out of scope for this phase.
- The `approveReject.test.js` pre-existing-failure claim from the interrupted session was investigated and retracted; Plan 30-02/30-03 should treat the suite as green at hand-off unless the failure reappears independently.

---
*Phase: 30-approval-moves-to-the-account*
*Completed: 2026-08-28*

## Self-Check: PASSED

- FOUND: `backend/src/models/User.js`
- FOUND: `backend/migrations/manual/019-add-users-approval-columns.sql`
- FOUND: `.planning/phases/30-approval-moves-to-the-account/deferred-items.md`
- FOUND: commit `77b434f`
- FOUND: commit `f582bab`
- FOUND: commit `ca0ce4f`
