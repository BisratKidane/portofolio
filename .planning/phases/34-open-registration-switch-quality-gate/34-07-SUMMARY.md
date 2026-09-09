---
phase: 34-open-registration-switch-quality-gate
plan: 07
subsystem: testing
tags: [graphql, apollo, vitest, supertest, authorization, security, mutation-testing]

# Dependency graph
requires:
  - phase: 34-03
    provides: "publicRegistrationSetting/setPublicRegistrationEnabled GraphQL surface (both requireAdmin) this plan's SEC-04 matrix executes cells against"
  - phase: 34-05
    provides: "register's tokenless door check + PUBLIC_REGISTRATION_CLOSED_MESSAGE this plan's tokenless-door cells assert against"
provides:
  - "The milestone's D-11 proof artifact: security.boundaries.test.js, one file containing the SEC-04 authorization matrix (11 requireAdmin cells + 11 admin controls + 3 tokenless-door cells) and the SEC-05 schema-driven sweep (28 non-allowlisted root fields + Query.me's null-result case + 3 non-GraphQL photo-route cells), 58 tests total"
  - "A verified, executable proof that getUserFromRequest's Active-only gate has REACH over every authenticated GraphQL root field and the one non-GraphQL authenticated surface in the codebase, not merely that the gate exists"
affects: [34-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-harness split within one proof file: graphql() (contextValue.user injection) for SEC-04's genuinely-authenticated-actor claims; httpClient() + a real signToken() Bearer header exclusively for SEC-05's getUserFromRequest-reach claim -- documented in a file-header comment so the two are never unified"
    - "coveredBy-annotated matrix rows: a cell executes the same adversarial case a deeper per-resolver test already covers, in one line, with a comment naming the file:line that covers it in depth -- proof without duplication-as-source-of-truth"
    - "Schema-driven synthesizer (buildSchema + a type-directed dummy-value/selection-set generator) over the real SDL, never introspection or a regex over template literals, so a future maxQueryDepth reduction or SDL rename cannot silently break the sweep"
    - "errors[0].path deep-equality as the execution-vs-validation discriminator: proves a refusal originated inside the field's own resolver, not from a malformed synthesized query"

key-files:
  created:
    - backend/src/resolvers/security.boundaries.test.js
  modified: []

key-decisions:
  - "SEC-04's non-admin matrix deliberately covers 11 of the 13 requireAdmin root fields (omitting users/unlinkedUsers), matching the plan's explicit NON_ADMIN_CELLS enumeration and its own acceptance-criteria count ('at least 26 tests = 11 + 11 + 3 + bootstrap'). Both omitted fields are still swept for the Pending-token claim by SEC-05 (which covers all 27 guarded root fields) -- they are absent only from the admin/non-admin authorization matrix, not from the file's overall coverage. Followed the plan's literal enumeration rather than 'every requireAdmin field' read as an instruction to add two unlisted cells, since the acceptance criteria are calibrated to the 11-cell list."
  - "Reused the same NON_ADMIN_CELLS array for both the non-admin refusal describe block and the admin-positive-control describe block (rather than a separate ADMIN_CONTROL_CELLS array with duplicated operation strings), since the plan's own D-11 rationale is 'the same operations executed by an ADMIN actor' -- a second copy of the same query/variables would itself be a duplication-as-source-of-truth risk of the exact kind the coveredBy convention exists to avoid."
  - "Fixed the it.each sweep title format mid-task ($opKind.$name -> $opKind field $name) after the M4 rehearsal's failure output showed 'undefined refuses a Pending self-registrant' -- vitest's $variable interpolation does not chain two separate $-prefixed tokens joined by a literal '.'. Purely cosmetic (test output readability); no assertion or coverage changed."

patterns-established:
  - "Pattern: a milestone-closing authorization proof file states its own harness-selection rationale in a header comment and is explicitly excluded from D-11's 'reference rather than duplicate' rule via a coveredBy column that names, rather than replaces, the deeper per-resolver test"

requirements-completed: [ADMIN-01, ADMIN-03, SEC-04, SEC-05]

# Metrics
duration: ~25min
completed: 2026-09-09
---

# Phase 34 Plan 07: The Milestone's Security Boundary Proof Artifact Summary

**One 496-line file (`security.boundaries.test.js`, 58 tests) proving two independent claims with two deliberately different harnesses: SEC-04's admin-only matrix (`graphql()`, 25 cells) and SEC-05's schema-driven Pending-token sweep (`httpClient()` + a real JWT, 28 root fields + 3 Express routes) — with M4/M6/M7 rehearsed by hand to confirm each assertion actually catches the regression it claims to.**

## Performance

- **Duration:** ~25 min (worktree base correction through the full backend suite run)
- **Started:** 2026-09-09T13:00:00Z (approx.)
- **Completed:** 2026-09-09T13:22:00Z (approx.)
- **Tasks:** 3 completed
- **Files modified:** 1 (created)

## Accomplishments

- Created `backend/src/resolvers/security.boundaries.test.js` opened with a file-header comment naming it as the milestone's D-11 proof artifact and stating, prominently, that it deliberately uses two different harnesses and why — so a future reader does not "tidy" them into one and silently gut the SEC-05 claim.
- **SEC-04 matrix (Task 1):** 11 `requireAdmin` root-field cells (`createInvitation`, `approveUser`, `rejectUser`, `setUserPassword`, `pendingApprovals`, `myInvitations`, `invitations`, `linkUserToMember`, `deleteMember`, and this phase's two new fields `publicRegistrationSetting`/`setPublicRegistrationEnabled`) executed against a linked, Active, non-admin actor built the way `createInvitation.test.js`'s `activeMember()` builds it — each asserting the exact message `'Admin access is required.'` and carrying a `coveredBy` reference to the pre-existing per-resolver test it duplicates. Paired admin positive controls (same 11 operations, genuine ADMIN actor) assert only that the outcome is *not* the admin-refusal message, guarding against a broken actor fixture keeping the matrix green for the wrong reason. Three tokenless-door cells cover SEC-04's third clause: anonymous refused with `PUBLIC_REGISTRATION_CLOSED_MESSAGE`, a real invitation still redeeming while closed (D-08 control), and an admin getting no self-exemption.
- **SEC-05 sweep (Task 2):** ported the RESEARCH.md-verified synthesizer (`unwrap`/`selectionFor`/`dummyValue`/`buildOperation`) verbatim over `buildSchema(typeDefs.join('\n'))` — never introspection, never a regex over the `#graphql` template literals. Enumerated all 28 non-allowlisted root fields (14 Query + 21 Mutation minus the 7-name `PUBLIC_ALLOWLIST`), executed each over real HTTP with a real Pending user's `signToken()` Bearer header (`httpClient()` only — zero calls to `graphql()` in this block, verified by read and by grep), validated every synthesized operation before executing it, and asserted both the exact `AUTH_ERROR` message and `errors[0].path === [name]` as the execution-vs-validation discriminator. `Query.me` got its own `NULL_RESULT_FIELDS` assertion (errors undefined, `data.me` null) instead of being allowlisted. Two pins (`PUBLIC_ALLOWLIST` sorted-array literal; 14/21/7/28 field-count assertion) close the "silently widen the allowlist" and "silently shrink the sweep" failure modes.
- **Non-GraphQL surface (Task 3):** three cells assert GET/POST/DELETE `/api/family-members/:id/photo` return 401 with the exact `requireAuth` message for a Pending token — previously unasserted. POST sends no file, proving the guard runs before any multipart handling. A closing comment states what SEC-05 now covers end to end and that a future authenticated surface must join one of the three enumerated categories.
- All required mutation rehearsals performed by hand and confirmed:
  - **M5** (Task 1): removing `requireAdmin` from `setPublicRegistrationEnabled` turned exactly the matching SEC-04 cell red; restored to a clean diff.
  - **M4** (Task 2): removing `requireAdmin` from `Query.pendingApprovals` turned both the SEC-04 cell and the SEC-05 sweep row for that field red; restored.
  - **M6** (Task 2): letting `Pending` status through `auth.js`'s `getUserFromRequest` status check turned all 28 sweep rows red at once — the assertion that proves the chokepoint's *reach*, SEC-05's actual claim; restored.
  - **M7** (Task 2): adding a new unguarded root field to the SDL + a resolver for it, without touching the allowlist, turned both the new field's own sweep test and the coverage pin red; restored (field and resolver fully removed).
- Full target verification green: `security.boundaries.test.js` (58/58) + `publicRegistrationSwitch.test.js` (26/26) = 84/84.
- Full backend suite green: 72 files, 648 passed + 3 pre-existing engine-gated skips (651 total) — the same 3-skip baseline 34-05 reported, plus this plan's 58 new tests (593 + 58 = 651).
- `git diff --name-only` confirmed `createInvitation.test.js`, `approveReject.test.js`, `setUserPassword.test.js`, and `accountStatus.test.js` were never touched (D-11: existing per-resolver adversarial tests stay exactly where they are).

## Task Commits

Each task was committed atomically:

1. **Task 1: SEC-04 authorization matrix + tokenless door cells** - `845d36f` (test)
2. **Task 2: SEC-05 schema-driven root-field sweep** - `d312eae` (test)
3. **Task 3: non-GraphQL photo-route surface + closing scope note** - `c2e90e9` (test)

**Plan metadata:** committed as part of this SUMMARY (worktree mode — orchestrator handles STATE.md/ROADMAP.md centrally after merge)

## Files Created/Modified

- `backend/src/resolvers/security.boundaries.test.js` - the milestone's D-11 proof artifact: SEC-04 matrix (11 non-admin cells + 11 admin controls + 3 tokenless-door cells) via `graphql()`, SEC-05 schema-driven sweep (28 root fields + allowlist pin + coverage pin) plus 3 photo-route cells via `httpClient()`, 58 tests total

## Decisions Made

- **SEC-04's matrix covers 11 of the 13 `requireAdmin` root fields, per the plan's own explicit enumeration** — `users`/`unlinkedUsers` are not given a dedicated non-admin/admin-control cell pair, matching the plan's literal `NON_ADMIN_CELLS` list and its acceptance criterion ("at least 26 tests = 11 + 11 + 3 + bootstrap"). Both fields remain covered by SEC-05's sweep (all 27 guarded root fields, including these two, must refuse a Pending token) — the gap is scoped to the authorization-matrix half only, not to the file's overall coverage.
- **Reused one `NON_ADMIN_CELLS` array for both the refusal block and the admin-control block** rather than a second, duplicated `ADMIN_CONTROL_CELLS` array — the plan's own language ("the same operations executed by an ADMIN actor") makes a byte-identical second array a duplication risk the `coveredBy` convention exists to avoid.
- **Fixed the sweep's `it.each` title interpolation mid-Task-2** (`$opKind.$name` → `$opKind field $name`) after the M4 rehearsal's failure output printed `undefined refuses a Pending self-registrant` instead of naming the field — vitest does not chain two `$`-prefixed tokens joined by a literal `.`. Cosmetic only; no assertion, coverage, or grep-gated string was affected.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed unreadable sweep test titles**

- **Found during:** Task 2, the M4 mutation rehearsal
- **Issue:** `it.each(sweepRows)('$opKind.$name refuses a Pending self-registrant', ...)` rendered as `undefined refuses a Pending self-registrant` in test output — vitest's `$variable` template does not resolve `$opKind.$name` as two separate substitutions joined by a literal period.
- **Fix:** Changed the title template to `'$opKind field $name refuses a Pending self-registrant'`, which vitest resolves as two independent substitutions.
- **Files modified:** `backend/src/resolvers/security.boundaries.test.js`
- **Verification:** Re-ran the file; titles now read e.g. `'query' field 'pendingApprovals' refuses a Pending self-registrant`. No change to any assertion or grep-gated string.
- **Committed in:** `d312eae` (Task 2 commit — fixed before commit, not a follow-up)

---

**Total deviations:** 1 auto-fixed (Rule 1, cosmetic), caught and fixed before its task's commit — no follow-up commit needed.
**Impact on plan:** Test-output readability only. No production code touched, no assertion weakened or added, no coverage change.

## Issues Encountered

- The worktree's initial HEAD (`52d044e`, forked from `origin/main`) predated Waves 1–3's `appSettings.js`, `setting.schema.js`/`setting.resolver.js`, the gated `register` resolver, and `publicRegistrationSwitch.test.js` by roughly two weeks of planning commits. Resolved per the mandatory `worktree_branch_check` step: verified the working tree was clean, `git reset --hard a2c8946c3b46316bac88b3729e4fc2921b972971`, confirmed the new HEAD matched, and confirmed `grep -n "isPublicRegistrationEnabled" backend/src/resolvers/user.resolver.js` returned a match before starting Task 1. No project code was affected — this was worktree setup, not a plan deviation.
- Several Bash invocations combining `git`/shell logic in one command (and one multi-`echo` grep-gate command) were rejected by the sandbox's worktree-isolation complexity classifier. Each was resolved by splitting into separate, single-purpose commands — matching the same class of issue every prior 34-* plan's SUMMARY has documented.
- The full backend suite (`npm test --workspace backend`) took ~6.5 minutes (387.5s) and was run once, to completion, as a background task per the plan's explicit instruction not to run it more than once or interrupt it mid-run (a killed run can leave a TRUNCATE metadata lock that wedges MariaDB). No interruption occurred; the run completed cleanly with exit code 0.

## User Setup Required

None — no external service configuration required. This plan is purely a new integration test file exercising already-shipped resolvers, schema, and auth utilities from plans 34-01/34-03/34-05.

## Next Phase Readiness

- `security.boundaries.test.js` is feature-complete for this plan's scope: the D-11 proof artifact exists, is green, and has all four required mutation rehearsals (M4/M5/M6/M7) hand-verified red-then-restored. Plan 34-08 (the formal, message-recording mutation-testing run across all eight named mutations for the phase) can build directly on this file without further scaffolding.
- The `coveredBy` convention (naming, not replacing, the deeper per-resolver test) is established and could be reused by a future phase's own proof-artifact plan.
- No blockers. Full backend suite green (72 files / 648 passed + 3 pre-existing engine-gated skips / 651 total).

## Self-Check: PASSED

- FOUND: backend/src/resolvers/security.boundaries.test.js
- FOUND commit: 845d36f
- FOUND commit: d312eae
- FOUND commit: c2e90e9

---
*Phase: 34-open-registration-switch-quality-gate*
*Completed: 2026-09-09*
