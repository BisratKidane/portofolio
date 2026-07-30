---
phase: 18-data-model-migration
plan: 01
subsystem: backend-data-model
tags: [sequelize, model, geez, virtual-getter, tdd]
requires:
  - FamilyMember Sequelize model (existing, Phase 12)
provides:
  - "geezFirstname/geezLastname/geezMothersname nullable STRING attrs on FamilyMember"
  - "geezFullname VIRTUAL getter (Latin-safe defensive join, excludes mothersname)"
affects:
  - backend/src/models/FamilyMember.js
tech-stack:
  added: []
  patterns:
    - "Defensive VIRTUAL getter: [a, b].filter(Boolean).join(' ') || null for optional name parts"
key-files:
  created: []
  modified:
    - backend/src/models/FamilyMember.js
    - backend/src/models/FamilyMember.test.js
decisions:
  - "geezFullname joins only geezFirstname+geezLastname, excluding geezMothersname (D-01)"
  - "Defensive filter(Boolean).join || null instead of template-literal join, since Ge'ez parts are optional (D-02)"
  - "Ge'ez columns are unvalidated nullable STRING, matching mothersname/address/phone precedent (D-05)"
metrics:
  duration: 14 min
  completed: 2026-07-30
---

# Phase 18 Plan 01: Ge'ez Name Model Fields Summary

Added three nullable Ge'ez-script name attributes plus a Latin-safe `geezFullname` VIRTUAL getter to the `FamilyMember` Sequelize model, built test-first (RED → GREEN).

## What Was Built

Extended `backend/src/models/FamilyMember.js` with:
- `geezFirstname`, `geezLastname`, `geezMothersname` — nullable, unvalidated `STRING` attributes (mirroring the existing `mothersname`/`profilePicture` shape, no `validate` key per D-05).
- `geezFullname` — a `VIRTUAL` getter returning `[this.geezFirstname, this.geezLastname].filter(Boolean).join(' ') || null`. Unlike the existing template-literal `fullname` getter, this is defensive: both Ge'ez parts are optional, so a naive join would emit stray spaces or literal `"null"`/`"undefined"`. `geezMothersname` is deliberately excluded from the combined name (D-01).

Extended `backend/src/models/FamilyMember.test.js` with 8 new tests across two `describe` blocks:
- Group A (DATA-01): validation still resolves with Ge'ez fields omitted; all three declared `allowNull: true`.
- Group B (DATA-02, D-01, D-02): `geezFullname` is a `VIRTUAL`; fill-matrix coverage (none → null, first-only, last-only, mothersname-only → null, all-filled → `'ጃነ ዶ'` excluding mothersname) using real Ethiopic UTF-8 literals.

## Task Commits

| Task | Name | Type | Commit |
| ---- | ---- | ---- | ------ |
| 1 | RED: failing fill-matrix tests for Ge'ez fields + geezFullname getter | test | `a9246c3` |
| 2 | GREEN: implement Ge'ez STRING attrs + defensive geezFullname VIRTUAL | feat | `1d70a7b` |

## Verification

- **RED (after Task 1):** `npm test --workspace backend -- FamilyMember` — the new getter and nullable-declaration tests failed as expected (`instance.geezFullname` / `rawAttributes.geezFirstname` undefined); `FamilyMember.js` had zero diff.
- **GREEN (after Task 2):** all `FamilyMember.test.js` tests pass (137/138 in the filtered run; the single remaining failure is the pre-existing `familyMember.dedup.test.js` TOCTOU flake, not `FamilyMember.test.js`).
- **Full backend suite:** `Test Files 2 failed | 55 passed (57)`, `Tests 2 failed | 388 passed (390)`. Baseline was 380 passed / 2 named failures / 382 total → passed count is baseline + 8, and the only 2 failures are the exact named pre-existing flakes: `verifyEmail.test.js` VERIFY-04 race and `familyMember.dedup.test.js` D-10 TOCTOU. **Zero new failures introduced.**
- **Grep checks (Task 2 acceptance):** `geezFirstname: {` / `geezLastname: {` / `geezMothersname: {` each appear exactly once; the `geezFullname` getter body contains `filter(Boolean).join(' ') || null`; `geezMothersname` appears 0 times inside the getter body.

## TDD Gate Compliance

Gate sequence satisfied: `test(18-01)` RED commit (`a9246c3`) precedes the `feat(18-01)` GREEN commit (`1d70a7b`). No REFACTOR commit — the getter is already the minimal defensive expression, nothing to clean up.

## Deviations from Plan

None — plan executed exactly as written.

## Notes

- The plan-listed "resolves when all Ge'ez fields omitted" test (group A) passes even in the RED phase, which is expected: it asserts existing validation is unaffected by the new fields, not that the fields exist. The load-bearing RED signals (nullable-declaration + getter tests) all failed correctly before Task 2.
- No new packages installed; `DataTypes` was already imported. No trust boundary or attack surface added — these fields are not yet reachable via the GraphQL API (schema/resolver exposure is Phase 19).

## Self-Check: PASSED

- Files: `backend/src/models/FamilyMember.js` FOUND, `backend/src/models/FamilyMember.test.js` FOUND.
- Commits: `a9246c3` FOUND, `1d70a7b` FOUND.
