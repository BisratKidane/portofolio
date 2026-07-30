---
phase: 18-data-model-migration
plan: 02
subsystem: database
tags: [mariadb, mysql, migration, utf8mb4, geez, ddl, sequelize]

# Dependency graph
requires:
  - phase: 18-data-model-migration (plan 18-01)
    provides: FamilyMember model geezFirstname/geezLastname/geezMothersname attributes the migration columns must match
provides:
  - Portable manual migration 018 adding three nullable utf8mb4 Ge'ez name columns to family_members
  - README manual-migration doc entry for 018 with apply command, boot-verify, and D-03/D-04 notes
  - Proof (scratch-DB MariaDB round-trip) that the DDL applies cleanly and round-trips Ge'ez UTF-8 text
affects: [19-graphql-layer, 22-render-read-path, 23-write-path-forms, prod-deploy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bare CHARACTER SET utf8mb4 (no COLLATE, no ENCRYPTION) for cross-engine MariaDB/MySQL-8.4 portable DDL"
    - "Isolated, uniquely-named, self-cleaning scratch database for verifying migration portability without touching project dev/test/prod data"

key-files:
  created:
    - backend/migrations/manual/018-add-family-members-geez-names.sql
  modified:
    - README.md

key-decisions:
  - "Bare utf8mb4 with no explicit COLLATE/ENCRYPTION keeps the DDL portable across local MariaDB and prod MySQL 8.4 (D-03/Pitfall 3)"
  - "Prod apply deferred (D-04) — migration documented but not run against agne.bisrat.ch this phase; lands with the Ge'ez API/UI deploy"

patterns-established:
  - "Cross-engine portable DDL: let each engine supply its own default utf8mb4 collation instead of pinning MySQL-8-only utf8mb4_0900_ai_ci"
  - "Portability proof via a throwaway scratch DB that is created, migrated, round-trip-tested, and dropped — zero residue, zero project-data risk"

requirements-completed: [DATA-01]

# Metrics
duration: 8min
completed: 2026-07-30
---

# Phase 18 Plan 02: Ge'ez Name Columns Migration Summary

**Portable manual migration 018 adds three nullable `utf8mb4` Ge'ez name columns to `family_members`, proven to apply cleanly and round-trip Ethiopic UTF-8 text on real local MariaDB, and documented in README with D-03 portability and D-04 prod-deferred notes.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-07-30T17:16:00Z
- **Completed:** 2026-07-30T17:24:00Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- Wrote `018-add-family-members-geez-names.sql` — one `ALTER TABLE family_members` with three comma-joined `ADD COLUMN` clauses (`geezFirstname`, `geezLastname`, `geezMothersname`), each `VARCHAR(255) CHARACTER SET utf8mb4 NULL DEFAULT NULL`, no `COLLATE`/`ENCRYPTION`/`CONSTRAINT` tokens.
- Proved cross-engine portability against a real local MariaDB 12.1.2 engine via an isolated `gsd_phase18_migration_check` scratch database: created a minimal `family_members` table, applied the exact migration file, inserted Ge'ez text (`ጃነ` / `ዶ`), confirmed byte-exact round-trip (`HEX` = `E18C83E18A90`), then dropped the scratch DB — no residue, no project data touched.
- Documented 018 in README's "Manual Database Migrations" section with the standard apply-command / boot-verify shape plus explicit D-03 (MariaDB-verified) and D-04 (prod-apply-deferred) notes.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the portable 018 migration SQL file** - `79388dc` (feat)
2. **Task 2: Prove MariaDB portability via scratch-DB run + document 018 in README** - `b962f06` (docs)

## Files Created/Modified
- `backend/migrations/manual/018-add-family-members-geez-names.sql` - Portable ALTER TABLE adding 3 nullable utf8mb4 Ge'ez name columns to `family_members`, with a 013/014-style header comment block explaining the sync()-never-alters rationale, the no-backfill/no-validation policy (D-05), the `geezFullname` VIRTUAL note, and the portability rationale.
- `README.md` - New "Add Ge'ez-script name columns to family_members (Phase 18 / DATA-01, DATA-02)" subsection under Manual Database Migrations, before "## Project structure".

## Decisions Made
None beyond the plan — followed the plan as specified. The D-03 (bare-portable-DDL) and D-04 (prod-deferred) decisions were pre-made in the plan; this plan implemented and verified them.

## Deviations from Plan

None - plan executed exactly as written.

The only in-flight adjustment was a wording tweak to satisfy an acceptance grep: the README acceptance check `grep -A5 "Add Ge'ez-script name columns" | grep -c "MariaDB"` requires "MariaDB" within 5 lines of the subsection header, so a "verified portable against local MariaDB" clause was added to the intro paragraph (the fuller portability note already appeared later in the subsection). This is a documentation-phrasing adjustment, not a functional deviation.

## Issues Encountered
- Compound shell commands with a `<` redirect were refused by the worktree isolation guard as "too complex to verify". Resolved by splitting each verification into plain single commands with absolute paths, and applying the migration with a single plain `mysql <db> < file.sql` invocation.

## Verification Evidence
- Task 1 grep gates: `ALTER TABLE family_members` = 1; each `ADD COLUMN geez*` = 1; non-comment `COLLATE` = 0; non-comment `ENCRYPTION` = 0; non-comment `CHARACTER SET utf8mb4` = 3.
- Task 2 scratch-DB sequence exited 0 end-to-end (create → table → apply → insert Ge'ez → select-back byte-exact → drop); `SHOW DATABASES LIKE 'gsd_phase18_migration_check'` returned no rows afterward.
- Task 2 README gates: subsection header = 1; `018-add-family-members-geez-names.sql` mention ≥ 1; MariaDB within `-A5` of header = 1; `deferred` within `-A20` of header = 1.
- `git diff --stat` on the migration file after Task 2 was empty (Task 2 did not touch the SQL file).

## User Setup Required
None - no external service configuration required. The documented prod apply against `agne.bisrat.ch` is deliberately deferred (D-04) to the later v3.0 phase that ships the Ge'ez API/UI.

## Next Phase Readiness
- The migration file exists and is proven portable; Phase 19 (GraphQL layer) can expose the Ge'ez fields knowing the column DDL is ready for any environment that runs the documented apply command.
- No blockers. Prod DB remains un-migrated by design until the coordinated Ge'ez API/UI deploy.

---
*Phase: 18-data-model-migration*
*Completed: 2026-07-30*
