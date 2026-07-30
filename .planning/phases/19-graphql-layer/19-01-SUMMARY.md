---
phase: 19-graphql-layer
plan: 01
subsystem: api
tags: [graphql, apollo-server, sequelize, ge'ez, ethiopic-script, family-member]

# Dependency graph
requires:
  - phase: 18-data-model-migration
    provides: geezFirstname/geezLastname/geezMothersname columns + geezFullname VIRTUAL getter on the FamilyMember model
provides:
  - geezFirstname/geezLastname/geezMothersname/geezFullname readable on the FamilyMember GraphQL type
  - geezFirstname/geezLastname/geezMothersname writable on NewFamilyMemberInput and EditFamilyMemberInput
  - Ge'ez fields wired into the shared OPTIONAL_FAMILY_MEMBER_FIELDS blank->null passthrough (SC3)
  - geezFullname VIRTUAL hardened to declare source-field dependencies (closes 18-REVIEW WR-01)
  - GraphQL integration test proving create round-trip, edit set, clear-to-null, and derive-over-API
affects: [22-render-read-surfaces, 23-write-path-forms]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Extend-existing pattern: opening a model's fields to the API via schema SDL + OPTIONAL_FAMILY_MEMBER_FIELDS, with zero new resolver body code (mirrors mothersname/fullname)"

key-files:
  created:
    - backend/src/resolvers/familyMember.geez.test.js
  modified:
    - backend/src/schemas/familyMember.schema.js
    - backend/src/resolvers/user.resolver.js
    - backend/src/models/FamilyMember.js

key-decisions:
  - "Followed CONTEXT.md D-01 through D-05 exactly: backend-only scope, no validation on Ge'ez inputs, geezFullname read-only/derived (absent from both input types), focused (not exhaustive) integration test coverage."
  - "Skipped hardening the sibling Latin `fullname` VIRTUAL's dependency declaration (CONTEXT D-03/Discretion default: lean skip since its parts are required and it isn't newly exposed) -- tracked as a follow-up below."

patterns-established:
  - "Adding an optional String field to the GraphQL layer costs: 4 lines of schema SDL (type + both inputs) + 1 array entry in OPTIONAL_FAMILY_MEMBER_FIELDS -- zero resolver body changes."

requirements-completed: [DATA-03]

# Metrics
duration: 20min
completed: 2026-07-30
---

# Phase 19 Plan 01: GraphQL Layer Summary

**Ge'ez name fields now flow through the FamilyMember GraphQL API via the existing spread-passthrough create/edit resolvers, with the geezFullname VIRTUAL hardened to declare its source-field dependencies.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-30T20:38:00+02:00 (approx.)
- **Completed:** 2026-07-30T20:47:24+02:00
- **Tasks:** 3 completed
- **Files modified:** 3 (+1 created)

## Accomplishments
- `type FamilyMember` now exposes `geezFirstname`, `geezLastname`, `geezMothersname`, and the derived `geezFullname` (all nullable `String`); both `NewFamilyMemberInput` and `EditFamilyMemberInput` accept the three writable fields (`geezFullname` correctly excluded from both, mirroring `fullname`).
- `OPTIONAL_FAMILY_MEMBER_FIELDS` extended with the three writable Ge'ez keys — the entire mechanism needed for blank-string→null persistence (SC3) — with zero changes to `sanitizeNewMember` or any resolver body.
- `geezFullname`'s Sequelize VIRTUAL now declares `['geezFirstname', 'geezLastname']` as its source-field dependencies (`new DataTypes.VIRTUAL(DataTypes.STRING, [...])`), closing 18-REVIEW.md WR-01 before it could bite a future `attributes`-restricting query. `get()` body is byte-for-byte unchanged.
- New focused integration test (`familyMember.geez.test.js`, 3 tests) proves: create-path (`addChild`) round-trip, `editMember` set + read-back + derive, and the load-bearing clear-to-null case (`geezFirstname: ''` → `null`, backed by a DB `reload()` assertion).

## Task Commits

Each task was committed atomically:

1. **Task 1: Expose Ge'ez fields on the GraphQL type and input types + extend the blank->null field list** - `6ced659` (feat)
2. **Task 2: Harden the geezFullname VIRTUAL to declare its source-field dependencies (D-02)** - `20e4cc5` (fix)
3. **Task 3: Focused GraphQL integration test — create round-trip + editMember set/clear-to-null/derive (D-05)** - `ac3f22f` (test)

_No plan-metadata commit yet — SUMMARY.md is committed separately by the worktree agent (orchestrator owns STATE.md/ROADMAP.md updates after merge)._

## Files Created/Modified
- `backend/src/schemas/familyMember.schema.js` - Added 4 Ge'ez fields to `type FamilyMember`, 3 writable Ge'ez fields to both input types
- `backend/src/resolvers/user.resolver.js` - Extended `OPTIONAL_FAMILY_MEMBER_FIELDS` with `geezFirstname`/`geezLastname`/`geezMothersname`
- `backend/src/models/FamilyMember.js` - Hardened `geezFullname` VIRTUAL type to declare source-field dependencies
- `backend/src/resolvers/familyMember.geez.test.js` - New focused GraphQL integration test (create round-trip, edit set, clear-to-null, derive)

## Decisions Made
- Backend-only scope maintained throughout (D-01) — no frontend query strings touched; rendering/forms deferred to Phases 22/23 as planned.
- No validation added to the three Ge'ez input fields (D-04) — plain nullable `String`, mirroring `mothersname` exactly.
- Latin `fullname` VIRTUAL's dependency-declaration hardening was **skipped** this phase (CONTEXT.md D-03/Claude's Discretion lean default: its parts are required and it is not newly exposed, so its latent risk is lower than `geezFullname`'s). **Tracked as a follow-up** for whichever future phase next touches `FamilyMember.js`.

## Deviations from Plan

None - plan executed exactly as written. All three tasks matched their `<action>`/`<acceptance_criteria>` blocks with no architectural changes, no new packages, and no resolver-body edits.

## Issues Encountered

- The full `npm test` run in `backend/` (not a task-specific acceptance-criteria command, but the plan's overall `<verification>` requirement) surfaced 2 pre-existing concurrency/TOCTOU-race test flakes across two runs, in tests unrelated to this plan's changes (`verifyEmail.test.js` VERIFY-04 racing-verify test, `familyMember.dedup.test.js` D-10 TOCTOU test) — both throwing the identical underlying Sequelize optimistic-lock message `Record has changed since last read in table '...'`. This matches PROJECT.md's own Phase 18 completion note ("2 remaining failures are documented pre-existing concurrency/TOCTOU flakes"). Confirmed unrelated: neither failing test file intersects the 3 files this plan modified, and every task-scoped verify command (`familyMember`, `FamilyMember.test`, `familyMember.geez`) passed cleanly and repeatably. Logged to `.planning/phases/19-graphql-layer/deferred-items.md`; not fixed, per SCOPE BOUNDARY (pre-existing, out-of-scope for this plan).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The GraphQL API surface for Ge'ez names is fully open: Phase 22 (read surfaces) can now select `geezFirstname`/`geezLastname`/`geezMothersname`/`geezFullname` on any existing `FamilyMember` query, and Phase 23 (write forms) can submit the three writable fields through the existing `NewFamilyMemberInput`/`EditFamilyMemberInput` mutations with no further backend changes.
- 18-REVIEW.md WR-01 is closed for `geezFullname`; the analogous hardening of the Latin `fullname` VIRTUAL remains an open, low-priority follow-up (see Decisions Made).
- No blockers for Phase 20 (font/theme, independent) or the remainder of the v3.0 roadmap.

---
*Phase: 19-graphql-layer*
*Completed: 2026-07-30*

## Self-Check: PASSED

- FOUND: backend/src/schemas/familyMember.schema.js
- FOUND: backend/src/resolvers/user.resolver.js
- FOUND: backend/src/models/FamilyMember.js
- FOUND: backend/src/resolvers/familyMember.geez.test.js
- FOUND: .planning/phases/19-graphql-layer/19-01-SUMMARY.md
- FOUND: .planning/phases/19-graphql-layer/deferred-items.md
- FOUND commit: 6ced659 (Task 1)
- FOUND commit: 20e4cc5 (Task 2)
- FOUND commit: ac3f22f (Task 3)
