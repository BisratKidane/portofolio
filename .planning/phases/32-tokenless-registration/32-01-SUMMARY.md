---
phase: 32-tokenless-registration
plan: 01
subsystem: auth
tags: [sequelize, mysql, mariadb, bcrypt, migration, tdd]

# Dependency graph
requires:
  - phase: 30-approval-moves-to-the-account
    provides: users.approvedAt/approvedBy/rejectedAt/rejectionReason columns + the manual-migration/scratch-DB-proof process (019) this plan's migration 020 mirrors
  - phase: 31-invitations-become-admin-only
    provides: D-04/D-05 auto-activation semantics keyed on Invitation-row existence, the reason a synthetic Invitation row was rejected for storing the self-registrant's note
provides:
  - "users.relationshipNote column (VARCHAR(500) NULL DEFAULT NULL) via migration 020, proven on a scratch DB and applied to the real local dev database"
  - "User model relationshipNote field (DataTypes.STRING(500), allowNull: true)"
  - "beforeCreate(user, options) explicit-flag double-hash guard: skips re-hashing only when options.passwordAlreadyHashed === true, never derived from passwordHash's content/shape"
affects: [32-02, 32-03, 32-04]

# Tech tracking
tech-stack:
  added: []
  patterns: ["explicit-flag Sequelize hook guard (never content-sniffing)", "scratch-database migration proof before real-DB apply"]

key-files:
  created: [backend/migrations/manual/020-add-users-relationship-note.sql]
  modified: [backend/src/models/User.js, backend/src/models/User.test.js]

key-decisions:
  - "D-04: relationshipNote lives on the users table itself, not a synthetic Invitation row (which would silently auto-activate an unvouched stranger per Phase 31 D-05)"
  - "beforeCreate's double-hash guard is keyed exclusively on options.passwordAlreadyHashed -- a content-sniffing regex (BCRYPT_HASH_PATTERN) was explicitly rejected because it would let an attacker-chosen password shaped like a bcrypt hash be stored in cleartext"
  - "Task 2's real-DB apply target was the native MariaDB 12.1.2 service on 127.0.0.1:3306, not the Docker Compose mysql container -- confirmed to be the actual database env/local.env's DB_HOST/DB_PORT resolve to in this environment"

patterns-established:
  - "Explicit-flag hook-skip pattern: a Sequelize lifecycle hook may only skip its default transform when the caller passes an explicit options.<flag> === true; it must never infer the skip from the field's own content or shape"

requirements-completed: [REG-03, SEC-03]

# Metrics
duration: ~10min active work (plus a human-gated pause at Task 2 for the real-database migration apply)
completed: 2026-08-30
---

# Phase 32 Plan 01: Migration 020 + beforeCreate Double-Hash Guard Summary

**Migration 020 adds `users.relationshipNote` (VARCHAR(500) NULL); `User.js`'s `beforeCreate` hook now skips re-hashing only via an explicit `options.passwordAlreadyHashed` flag, never by inspecting `passwordHash`'s content or shape.**

## Performance

- **Duration:** ~10 min active work across two sessions (Task 1 ~19:35-19:40 UTC+2; Task 3 ~20:22-20:28 UTC+2), separated by a human-gated pause at Task 2's checkpoint while the user applied the migration to the real local dev database
- **Started:** 2026-08-30T19:35:13+02:00
- **Completed:** 2026-08-30T20:27:36+02:00
- **Tasks:** 3 (1 auto, 1 checkpoint:human-action, 1 auto/tdd)
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- Migration 020 created and proven on a scratch database (`portofolio_scratch`, cloned from the real `users` table via `CREATE TABLE ... LIKE`), then applied by the user to the real local dev database — confirmed via `information_schema` (one row: `relationshipNote | varchar(500) | YES`)
- `User` model gained a nullable `relationshipNote` column matching the migration exactly
- Closed the phase's single highest-risk defect (T-32-01/T-32-04): `beforeCreate` no longer unconditionally re-hashes `passwordHash`. The skip is gated exclusively on an explicit `options.passwordAlreadyHashed` flag set by trusted internal callers (Plan 32-03's D-09 precomputed-hash `User.create` call), never by sniffing `passwordHash`'s content or shape — proven by a regression test where a plaintext password shaped like a bcrypt hash (`$2a$04$aaaaaaaaaaaaaaaaaaaaaa`) still gets hashed when no flag is passed

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration 020 (D-04, D-05) + scratch-database proof** — `d185d35` (feat)
2. **Task 2: Apply migration 020 to local dev database (F-03, checkpoint:human-action)** — no commit (database-state action only, no repo change). The user applied the migration by hand against the real local dev database and reported completion; the orchestrator independently verified via a read-only `information_schema` query before clearing the checkpoint. Target was the native MariaDB 12.1.2 service on `127.0.0.1:3306`, not the Docker Compose `mysql` container (see Deviations).
3. **Task 3 (TDD, RED): add failing regression tests for beforeCreate guard + relationshipNote** — `9a9feb0` (test)
   **Task 3 (TDD, GREEN): relationshipNote field + explicit-flag beforeCreate guard** — `2690045` (feat)

**Plan metadata:** (this SUMMARY's commit, created next)

_TDD task (Task 3) has the expected two commits: test (RED) then feat (GREEN); no refactor step was needed._

## Files Created/Modified

- `backend/migrations/manual/020-add-users-relationship-note.sql` — new manual migration, single `ALTER TABLE users ADD COLUMN relationshipNote VARCHAR(500) NULL DEFAULT NULL;`, header comment documents why a synthetic Invitation row was rejected (D-04) and the VARCHAR(500) MariaDB/MySQL-8.4 portability claim (F-04)
- `backend/src/models/User.js` — added `relationshipNote: { type: DataTypes.STRING(500), allowNull: true }`; rewrote `beforeCreate(user, options)` to guard re-hashing on `options.passwordAlreadyHashed` only, removed nothing (no prior content-sniffing code existed to remove)
- `backend/src/models/User.test.js` — 3 new regression tests added inside the existing `describe('beforeCreate hashing hook', ...)` block (no new describe block created, per the plan's explicit instruction)

## Decisions Made

- Followed the plan's explicit rejection of content-sniffing: no `BCRYPT_HASH_PATTERN` or any other regex-based check on `passwordHash` exists anywhere in the file (`grep -c "BCRYPT_HASH_PATTERN" backend/src/models/User.js` returns `0`)
- The guard is keyed exclusively on `options.passwordAlreadyHashed === true` (via `!(options && options.passwordAlreadyHashed)`), matching the plan's exact specified condition
- Did **not** mark REG-03 or SEC-03 as complete in `.planning/REQUIREMENTS.md`. This plan is explicitly scoped as "pure foundation — no resolver logic changes here" (plan objective). REG-03's "shown to admins at approval time" and SEC-03's server-side length assertion + safe-rendering-everywhere both remain Plan 32-03/32-04 work; checking them off here would be premature. Left `REQUIREMENTS.md` untouched entirely to avoid asserting an incomplete requirement and to avoid any merge-conflict risk with Plan 32-02's already-applied SEC-03 mark in its parallel worktree (per the coordinator's explicit instruction not to revert or restructure that line). The `requirements-completed` frontmatter field above lists the plan's declared `requirements: [REG-03, SEC-03]` frontmatter as instructed by the summary template — this documents what this plan *contributed toward*, not that the requirement text is fully satisfied end-to-end.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Docker Compose's `mysql` service could not bind port 3306; connected to the native MariaDB service directly instead**
- **Found during:** Task 1 (scratch-database proof)
- **Issue:** The plan's exact invocation (`docker compose --env-file env/local.env exec -T mysql mysql -u... `) requires the Compose `mysql` container to already be running. `docker compose --env-file env/local.env up -d mysql` failed with `Error response from daemon: ports are not available: exposing port TCP 0.0.0.0:3306 ... address already in use`. Investigation (`lsof -nP -iTCP:3306 -sTCP:LISTEN`) showed a native `mariadbd` process (confirmed `SELECT VERSION()` → `12.1.2-MariaDB`) already listening on `127.0.0.1:3306` — this is the actual database `env/local.env`'s `DB_HOST=127.0.0.1`/`DB_PORT=3306` resolve to, so it is the real local dev database regardless of which process serves it.
- **Fix:** Connected with the local `mysql` CLI (`/opt/homebrew/opt/mariadb@10.5/bin/mysql`) directly against `127.0.0.1:3306` instead of via `docker compose exec`, using the same `DB_USER`/`DB_PASSWORD`/`DB_NAME` values from `env/local.env`. The `portofolio` app user lacks `CREATE DATABASE` privilege, so `MYSQL_ROOT_PASSWORD` (also from `env/local.env`) was used only for `CREATE DATABASE portofolio_scratch`, `GRANT ... ON portofolio_scratch.*`, and the final `DROP DATABASE portofolio_scratch` / cleanup `REVOKE`. Every table-shape-clone, `ALTER TABLE`, and `information_schema` verification query ran as the `portofolio` app user, matching the real app's privilege scope — root was never used against the real `portofolio` database.
- **Files modified:** none (execution-environment adaptation only; the migration file's content is unaffected and byte-identical to what the plan specified)
- **Verification:** scratch-DB `information_schema` query returned exactly the expected row (`relationshipNote | varchar(500) | YES`); scratch database dropped and confirmed gone (`SHOW DATABASES LIKE 'portofolio_scratch'` → empty); real `portofolio.users` confirmed to still lack the column before Task 2 (`COUNT(*)` → `0`)
- **Committed in:** `d185d35` (Task 1 commit — the deviation is procedural/environmental, not a code change)

---

**Total deviations:** 1 auto-fixed (1 blocking, Rule 3)
**Impact on plan:** No scope creep. The migration file, the scratch-DB proof's actual assertions, and the real-database apply target are all exactly what the plan required — only the client tool used to reach that same database changed.

## Issues Encountered

- A full backend regression suite (`npm test -w backend`, all files) was run as extra due diligence beyond the plan's Task 3 `<verify>` requirement, which only mandates the scoped run (`npm test -w backend -- src/models/User.test.js`, passed 11/11 with both required greps satisfied: `passwordAlreadyHashed` count 4 ≥ 2, `BCRYPT_HASH_PATTERN` count 0). Result: **63 test files passed, 443 tests passed, 3 skipped (0 failed)** — the `beforeCreate` hook signature change (single-arg → `(user, options)`) and the new `relationshipNote` field are confirmed to not regress any existing resolver, integration, or model test, including the invited-registration path's existing `User.create` call (no `passwordAlreadyHashed` option passed, hashing proceeds unchanged). The 3 skips match the known engine-gated skips documented in `KNOWN-ISSUES.md` (MariaDB-local vs MySQL-8.4-CI/prod locking behavior, unrelated to this plan).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 32-03 can now build the tokenless `register` branch directly against a working `relationshipNote` column and a working `beforeCreate` hook — the key_link contract is proven exact and stable: `models.User.create(values, { passwordAlreadyHashed: true })` is the literal call shape Plan 32-03's D-09 precomputed-hash path must use
- Migration 020 is live on the local dev database, so Plan 32-03's integration tests can run against a real `relationshipNote` column, not just the test database's `sync()`-derived schema
- REG-03 and SEC-03 remain open in `REQUIREMENTS.md` pending Plan 32-03 (resolver wiring + server-side length assertion) and Plan 32-04/32-02 (admin-facing display + safe rendering)
- Full backend suite confirmed green (443/443 non-skipped tests, 0 failures) — no regression risk carried into Plan 32-03

---
*Phase: 32-tokenless-registration*
*Completed: 2026-08-30*

## Self-Check: PASSED

- FOUND: backend/migrations/manual/020-add-users-relationship-note.sql
- FOUND: .planning/phases/32-tokenless-registration/32-01-SUMMARY.md
- FOUND: d185d35 (Task 1 commit)
- FOUND: 9a9feb0 (Task 3 RED commit)
- FOUND: 2690045 (Task 3 GREEN commit)
