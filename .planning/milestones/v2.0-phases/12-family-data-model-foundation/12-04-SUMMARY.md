---
phase: 12-family-data-model-foundation
plan: 04
subsystem: database
tags: [sequelize, transactions, cascade-safety, service-layer, tdd, family-tree]

# Dependency graph
requires:
  - phase: 12-02
    provides: Spouse canonical-pair join model, motherId/fatherId self-referencing associations with ON DELETE SET NULL
  - phase: 12-03
    provides: familyMember.service.js module shape (wouldCreateCycle, linkParent, addChild) — this plan appends to the same file
provides:
  - "setSpouse(memberAId, memberBId) — transactional, idempotent spouse-pair creation; a caught UniqueConstraintError resolves to the existing canonical row instead of throwing"
  - "getSpouseRows(memberId) — symmetric Op.or read with memberA/memberB associations included"
  - "deleteMember(memberId) — the only sanctioned way to remove a FamilyMember; transactional, married-in one-hop delete rule (D-03/D-04): blood relatives (any parent link or any child) always survive, a married-in-only spouse (no parent link, no children) is removed one hop alongside the deleted partner, with no recursion"
affects: [14]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Idempotent-create-via-caught-UniqueConstraintError: setSpouse attempts Spouse.create() inside a transaction and treats a UniqueConstraintError as success (looks up and returns the existing canonical row) rather than a hard failure — backed by Plan 12-02's DB-level unique index as the actual source of truth"
    - "Pre-delete-state married-in evaluation: deleteMember computes isMarriedInOnly() for every direct partner strictly before any destroy() call in the same transaction, using graph state as it existed before the target was removed — this is what makes the one-hop (non-recursive) guarantee provable by test rather than incidental"

key-files:
  created: [backend/src/models/FamilyMember.delete.test.js]
  modified: [backend/src/services/familyMember.service.js, backend/src/models/Spouse.test.js]

key-decisions: []

patterns-established:
  - "deleteMember as the sole sanctioned FamilyMember-removal path: any future caller (Phase 14 resolvers) must route deletion through this helper rather than raw FamilyMember.destroy(), to preserve the married-in cascade-safety guarantee (mirrors the linkParent/addChild choke-point pattern established in Plan 12-03)"

requirements-completed: [REL-02]

# Metrics
duration: 8min
completed: 2026-07-21
---

# Phase 12 Plan 04: Family Data Model — Spouse Write Path + Married-In Delete Summary

**Transactional `deleteMember` enforcing the married-in one-hop cascade-safety rule (D-03/D-04) — blood relatives always survive, a married-in-only spouse is removed one hop alongside their partner with no recursion — plus `setSpouse`/`getSpouseRows` completing REL-02; full backend suite 171/171 green, closing Phase 12.**

## Performance

- **Duration:** ~8 min
- **Completed:** 2026-07-21
- **Tasks:** 2 (RED, GREEN)
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- Extended `Spouse.test.js` with `setSpouse` idempotency (swapped-argument-order re-call resolves without throwing, `Spouse.count()` stays 1) and `getSpouseRows` symmetric-read (same canonical row from either member id, `memberA`/`memberB` included) describe blocks, importing from the not-yet-extended service module — confirmed RED (`setSpouse is not a function`)
- Wrote `FamilyMember.delete.test.js` covering three cases against the not-yet-existing `deleteMember`: blood-relative survival (mid-tree delete nulls the child's FK, a blood spouse with a parent link survives), married-in-only one-hop delete (a spouse with no parent link and no children is removed alongside the target), and two-hop non-recursion (a removed married-in partner's own married-in spouse survives) — confirmed RED
- Implemented `setSpouse`, `getSpouseRows`, an internal `isMarriedInOnly`, and `deleteMember` in `familyMember.service.js` exactly per RESEARCH.md's Pattern 5, including the critical ordering constraint: married-in status is computed for every partner *before* any `destroy()` call in the transaction
- All 11 target test cases green (5 new Spouse.test.js/delete-test cases plus the pre-existing 6); full backend suite green: 171/171 (11 net-new + 160 pre-existing, zero regressions) — `sequelize.sync({ force: true })` booted cleanly against a fresh database as part of the same run, satisfying Phase 12 ROADMAP success criterion #5 (as revised by D-04)

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Extend Spouse.test.js with setSpouse/getSpouseRows; write FamilyMember.delete.test.js** - `8b7dc72` (test)
2. **Task 2 (GREEN): Implement setSpouse/getSpouseRows/isMarriedInOnly/deleteMember; run full suite as phase gate** - `10c43c2` (feat)

_Note: this is a `type: tdd` plan; RED and GREEN gate commits both present, no REFACTOR commit needed (implementation matched RESEARCH.md's Pattern 5 exactly, no cleanup required)._

## Files Created/Modified
- `backend/src/services/familyMember.service.js` - added `setSpouse`, `getSpouseRows`, internal `isMarriedInOnly`, `deleteMember` alongside Plan 12-03's `wouldCreateCycle`/`linkParent`/`addChild`
- `backend/src/models/Spouse.test.js` - extended with `setSpouse (REL-02)` and `getSpouseRows (REL-02)` describe blocks (existing Plan 12-02 content preserved, not replaced)
- `backend/src/models/FamilyMember.delete.test.js` - new file: D-03/D-04 blood-survival, married-in one-hop, and two-hop non-recursion coverage

## Decisions Made
None beyond what RESEARCH.md's Pattern 5 already specified — the implementation followed the cited algorithm verbatim (transaction-wrapped idempotent `setSpouse`, pre-delete-state `isMarriedInOnly` check, ordered destroy sequence in `deleteMember`).

## Deviations from Plan

None - plan executed exactly as written. The implementation matched RESEARCH.md's Pattern 5 code example verbatim (including the `UniqueConstraintError` import name from the `sequelize` package, which the plan referred to by its runtime error-class name `SequelizeUniqueConstraintError`); no bugs, blocking issues, or missing functionality were discovered during execution.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Threat Model Verification

- **T-12-11 (Data Destruction/Tampering, mitigate):** Verified — the blood-survival test asserts a spouse with a parent link (`bloodSpouse`, linked via `motherId`) survives `deleteMember(parent.id)`; `isMarriedInOnly` is evaluated for every partner using pre-delete graph state, strictly before any `destroy()` call (source-order confirmed: the `for` loop calling `isMarriedInOnly` appears before the first `models.Spouse.destroy` line in the function body).
- **T-12-12 (Data Destruction, mitigate):** Verified — the two-hop non-recursion test (`p3`→`mi1`→`mi2` spouse chain, delete `p3`) asserts `mi1` is removed (married-in-only relative to `p3`, one hop) but `mi2` survives — the married-in check is computed only for `p3`'s direct partner(s), never recursively re-evaluated for `mi1`'s own spouse.
- **T-12-13 (Tampering, mitigate):** Verified — `setSpouse` wraps the create attempt in `sequelize.transaction()`, catches `UniqueConstraintError` via `instanceof` check, and resolves to the existing canonical row instead of rethrowing; the idempotency test (swapped-argument-order re-call, `Spouse.count()` stays 1) confirms this end-to-end against the real DB-level unique index from Plan 12-02.
- **T-12-14 (Repudiation, mitigate):** Verified — `deleteMember` runs entirely inside one `sequelize.transaction()` (`grep -c "sequelize.transaction"` on `familyMember.service.js` returns `2` — one in `setSpouse`, one in `deleteMember`), so any mid-operation failure rolls back atomically with no partial/orphaned state possible.

## Next Phase Readiness
- `setSpouse`/`getSpouseRows`/`deleteMember` are ready for Phase 14 (permission-scoping + relationship resolvers) to call — per the established choke-point pattern (mirroring `linkParent`/`addChild` from Plan 12-03), any future resolver must route parent-edge mutations and deletions through these service-layer helpers, never raw `FamilyMember`/`Spouse` model calls, to preserve cycle-safety and cascade-safety.
- Full backend suite (171/171) stays green; no regressions against `User`/`FamilyMember`/`Spouse` models or existing resolver/util tests.
- Phase 12 is now feature-complete: `FamilyMember` model (12-01), associations + `Spouse` model (12-02), cycle-prevention (12-03), and the married-in delete rule + spouse write path (12-04, this plan) are all in place and test-covered. ROADMAP success criterion #5 (full-suite green including a fresh-DB `sync({ force: true })` boot) is satisfied.
- No blockers for downstream phases.

---
*Phase: 12-family-data-model-foundation*
*Completed: 2026-07-21*

## Self-Check: PASSED

- FOUND: backend/src/services/familyMember.service.js
- FOUND: backend/src/models/FamilyMember.delete.test.js
- FOUND: backend/src/models/Spouse.test.js
- FOUND: commit 8b7dc72 (test)
- FOUND: commit 10c43c2 (feat)
