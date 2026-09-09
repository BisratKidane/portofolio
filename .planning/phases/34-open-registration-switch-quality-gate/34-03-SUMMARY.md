---
phase: 34-open-registration-switch-quality-gate
plan: 03
subsystem: api
tags: [graphql, apollo, sequelize, transaction, audit-log, admin]

# Dependency graph
requires:
  - phase: 34-01
    provides: "AppSetting model, isPublicRegistrationEnabled(models), getPublicRegistrationSettingRow(models), PUBLIC_REGISTRATION_KEY"
provides:
  - "GraphQL SDL + resolvers for the public registration switch: publicRegistrationEnabled (public), publicRegistrationSetting (admin, attribution), setPublicRegistrationEnabled (admin, transactional flip)"
  - "Settings-layer half of publicRegistrationSwitch.test.js (14 tests) — plan 34-05 appends the D-02/D-07 register-agreement half"
  - "The codebase's first awaited, in-transaction writeAuditLog caller (D-03 precedent for future self-overwriting-value flips)"
affects: [34-04, 34-05, 34-06, 34-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two root fields (public vs admin) instead of one nullable-attribution field, so an anonymous caller cannot learn who administers the system or when (D-06/D-07/Pattern 5)"
    - "upsert (not update) inside the flip transaction so an absent settings row is created rather than silently no-op'd (D-02)"
    - "Awaited, in-transaction writeAuditLog for a value that overwrites itself — diverges deliberately from this codebase's five existing fire-and-forget audit call sites, which all record a side-fact whose primary effect is durably visible elsewhere"
    - "Attribution payload builder re-derives enabled via isPublicRegistrationEnabled(models) and reads the row via getPublicRegistrationSettingRow(models) only for updatedAt/updatedById — never a second AppSetting.findByPk call site"

key-files:
  created:
    - backend/src/schemas/setting.schema.js
    - backend/src/resolvers/setting.resolver.js
    - backend/src/resolvers/publicRegistrationSwitch.test.js
  modified:
    - backend/src/schemas/index.js
    - backend/src/resolvers/index.js

key-decisions:
  - "AuditLog.metadata round-trips as a JSON string on this local MariaDB test environment (not a parsed object as on MySQL 8) — test assertions normalize with a small parsedMetadata() helper before comparing, matching the precedent already documented in accountStatus.test.js's writeAuditLog describe block"
  - "The pre-flip `previous` value is read via isPublicRegistrationEnabled(models) OUTSIDE the transaction (no {transaction: t}) since it must observe the last-committed value before any lock is taken, per the plan's explicit interfaces section"
  - "The mutation re-reads the payload via buildPublicRegistrationSettingPayload(models) after the transaction commits rather than trusting upsert's [instance, created] return shape, which has no other call site in this codebase to validate against"

patterns-established:
  - "Pattern: admin-only privileged flip = requireAdmin as literal first statement + upsert (never update) + awaited in-transaction audit write, verified by two mutation rehearsals (drop requireAdmin; swap upsert for update) that must go RED before commit"

requirements-completed: [ADMIN-01, ADMIN-03]

# Metrics
duration: ~20min
completed: 2026-09-09
---

# Phase 34 Plan 03: GraphQL Surface of the Registration Switch Summary

**Public/admin GraphQL read split plus an admin-only, transactional flip mutation (`setPublicRegistrationEnabled`) that upserts the setting row and awaits its audit-log write in the same transaction — the codebase's first such caller.**

## Performance

- **Duration:** ~20 min (worktree base correction through final verification)
- **Started:** 2026-09-09T10:00:00Z (approx.)
- **Completed:** 2026-09-09T10:15:00Z (approx.)
- **Tasks:** 3 completed
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments

- Built `setting.schema.js`: `PublicRegistrationSetting` type + two `extend type Query` fields (one deliberately unauthenticated, one `requireAdmin`) + one `extend type Mutation` field, each carrying an SDL comment naming the decision/threat it encodes. `buildSchema` resolves 14 Query + 21 Mutation fields (baseline 12/20 + this plan's 2/1).
- Built `setting.resolver.js`: the public query has no guard at all (by design, D-07); the admin query and the flip mutation both call `requireAdmin(user)` as their literal first statement; the flip runs inside one `sequelize.transaction` doing (a) a pre-transaction read of the previous value, (b) `AppSetting.upsert` (never `update`, so an absent row is created not silently skipped), (c) an **awaited** `writeAuditLog` call carrying `from`/`to` in `metadata`. Both barrels (`schemas/index.js`, `resolvers/index.js`) register the new module last.
- Verified by grep gate that `AppSetting.findByPk` has exactly one production call site codebase-wide (`utils/appSettings.js`'s `getPublicRegistrationSettingRow`) — the resolver's attribution payload goes through that accessor, never a second direct `findByPk`.
- Wrote `publicRegistrationSwitch.test.js`: 14 integration tests covering authz on both admin fields (anonymous + non-admin), the public query's bare-boolean/no-attribution contract, flip persistence (row + predicate + `updatedById`), the two-row audit `from`→`to` history, transactional rollback when the audit write is forced to fail, upsert-on-absent-row, and all four D-06 attribution payload shapes (never-changed / named actor / unknown actor / absent row).
- Performed both mandated mutation rehearsals manually: removing `requireAdmin(user)` from the flip turned 2 tests RED (confirmed, then restored); swapping the flip's `upsert` for `update` turned the absent-row test RED (confirmed, then restored) — `git diff` against the Task 2 commit showed zero residual changes before the Task 3 commit.
- Full target verification green: `npx vitest run src/resolvers/publicRegistrationSwitch.test.js src/resolvers/accountStatus.test.js` → 2 files, 22 tests passed.

## Task Commits

Each task was committed atomically:

1. **Task 1: setting.schema.js + schemas barrel** - `538b710` (feat)
2. **Task 2: setting.resolver.js (public read, admin read, in-transaction flip) + resolvers barrel** - `f801fcc` (feat)
3. **Task 3: Settings-layer integration coverage in publicRegistrationSwitch.test.js** - `a4a2602` (test)

**Plan metadata:** committed as part of this SUMMARY (worktree mode — orchestrator handles STATE.md/ROADMAP.md centrally after merge)

## Files Created/Modified

- `backend/src/schemas/setting.schema.js` - `PublicRegistrationSetting` type, `publicRegistrationEnabled` (public), `publicRegistrationSetting` (admin), `setPublicRegistrationEnabled` (admin) — with rationale comments locking D-06/D-07 naming and disposition
- `backend/src/schemas/index.js` - registers `settingTypeDefs` last; `userTypeDefs` remains first
- `backend/src/resolvers/setting.resolver.js` - `buildPublicRegistrationSettingPayload` helper (enabled via the shared predicate, row via the shared bare accessor); unguarded public read; `requireAdmin`-guarded admin read; `requireAdmin`-guarded transactional flip (upsert + awaited in-transaction `writeAuditLog`)
- `backend/src/resolvers/index.js` - registers `settingResolvers` last
- `backend/src/resolvers/publicRegistrationSwitch.test.js` - 14-test settings-layer suite (authz, flip persistence, audit history, transactional atomicity, upsert-on-absent-row, all 4 attribution variants); file header documents that plan 34-05 appends a second half

## Decisions Made

- **`AuditLog.metadata` normalized on read in tests** — this local MariaDB test environment round-trips the JSON column as a string (not a parsed object as on MySQL 8, matching the exact caveat already documented in `accountStatus.test.js`'s `writeAuditLog` describe block). A small `parsedMetadata(row)` helper in the new test file normalizes before asserting `from`/`to`/`setting`, keeping the assertions environment-independent rather than MariaDB-specific.
- **Pre-flip `previous` read stays outside the transaction** — per the plan's explicit interface contract, this read must observe the last-committed value (no lock held yet), so it deliberately does not pass `{ transaction: t }`.
- **Mutation return value re-reads the payload rather than trusting `upsert`'s tuple** — `upsert`'s `[instance, created]` return shape has no other call site in this codebase to validate against, so the resolver re-reads via `buildPublicRegistrationSettingPayload(models)` after the transaction commits (also resolves the actor name for the response).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reworded an inline comment that accidentally recreated a grep-gated string**

- **Found during:** Task 2, running the acceptance-criteria grep gates
- **Issue:** The `buildPublicRegistrationSettingPayload` header comment originally read "...never a direct `models.AppSetting.findByPk` call in this file..." — the literal substring `AppSetting.findByPk` in that comment caused the codebase-wide `grep -rln 'AppSetting.findByPk' backend/src --include='*.js' | grep -v '\.test\.js' | wc -l` acceptance check to report 2 production call sites instead of the required 1 (the grep does not exclude comments).
- **Fix:** Reworded the comment to convey the same constraint ("this file never calls the model's findByPk method directly") without containing the literal grep-matched string.
- **Files modified:** `backend/src/resolvers/setting.resolver.js`
- **Verification:** Re-ran `grep -rln 'AppSetting.findByPk' backend/src --include='*.js' | grep -v '\.test\.js' | wc -l` → `1`; re-ran `npx vitest run src/resolvers/accountStatus.test.js` → still green.
- **Committed in:** `f801fcc` (Task 2 commit — fixed before commit, not a follow-up)

**2. [Rule 1 - Bug] Fixed two test assertions that assumed a parsed JSON object instead of a MariaDB string**

- **Found during:** Task 3, first `npx vitest run` of the new test file
- **Issue:** `models.AuditLog.findAll()` on this local MariaDB test environment returns `metadata` as a JSON *string*, not a parsed object (Sequelize dialect quirk already documented in `accountStatus.test.js`). Two assertions (`rows[0].metadata.setting`, `toMatchObject({ from, to })`) failed against the string form.
- **Fix:** Added a `parsedMetadata(row)` helper that `JSON.parse`s only when `typeof row.metadata === 'string'`, and used it in both affected assertions.
- **Files modified:** `backend/src/resolvers/publicRegistrationSwitch.test.js`
- **Verification:** `npx vitest run src/resolvers/publicRegistrationSwitch.test.js` → 14/14 passed.
- **Committed in:** `a4a2602` (Task 3 commit — fixed before commit, not a follow-up)

---

**Total deviations:** 2 auto-fixed (both Rule 1, both caught and fixed before their task's commit — no follow-up commits needed)
**Impact on plan:** Both fixes were necessary for the plan's own acceptance criteria (grep gate) and test suite (green run) to pass as specified. No scope creep — no production behavior changed by either fix.

## Issues Encountered

- The worktree's initial HEAD (`52d044e`, forked from `origin/main`) predated Wave 1's `appSettings.js`/`AppSetting` model by roughly two weeks of planning commits. Resolved per the mandatory `worktree_branch_check` step: verified the working tree was clean, then `git reset --hard 4c59c9944cee096fe9a8ea01c48a21e4a756104f`, confirmed the new HEAD matched, and confirmed `backend/src/utils/appSettings.js` and `backend/src/models/AppSetting.js` existed before starting Task 1. No project code was affected — this was worktree setup, not a plan deviation.
- Several Bash invocations that combined variable assignment with conditional logic in one command were rejected by the sandbox's worktree-isolation complexity classifier ("too complex to verify that it stays inside the worktree"). Each was resolved by splitting into separate, single-purpose commands (e.g., `git rev-parse --abbrev-ref HEAD` as its own call rather than chained with an `if` test) — no workaround or alternate command semantics were used, purely a syntactic split.

## User Setup Required

None — no external service configuration required. This plan is purely GraphQL schema/resolver/test additions on top of the already-migrated `app_settings` table from plan 34-01.

## Next Phase Readiness

- `settingTypeDefs`/`settingResolvers` are registered and live; `publicRegistrationEnabled`, `publicRegistrationSetting`, and `setPublicRegistrationEnabled` are ready for plan 34-04 (the admin UI component) to consume directly, matching the exact field/type names and D-06 attribution-variant semantics locked in this plan's `<interfaces>` contract.
- `publicRegistrationSwitch.test.js` has an established file header noting plan 34-05 appends the D-02/D-07 register-agreement half to the same file — no new file needed there.
- `isPublicRegistrationEnabled(models)` remains the single predicate every future caller (including `Mutation.register`'s tokenless branch in a later plan) must import and call directly — this plan added zero new derivations of the boolean.
- No blockers. Full target verification green (2 files / 22 tests); full backend suite was not re-run in this plan (out of scope per the plan's own `<verification>` section, which scopes to the two named files).

## Self-Check: PASSED

- FOUND: backend/src/schemas/setting.schema.js
- FOUND: backend/src/resolvers/setting.resolver.js
- FOUND: backend/src/resolvers/publicRegistrationSwitch.test.js
- FOUND commit: 538b710
- FOUND commit: f801fcc
- FOUND commit: a4a2602

---
*Phase: 34-open-registration-switch-quality-gate*
*Completed: 2026-09-09*
