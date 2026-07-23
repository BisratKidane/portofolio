---
phase: 15-sibling-dedup-guard-manage-self-service-ui
plan: 03
subsystem: ui
tags: [react, mui, react-testing-library, graphql, family-tree]

# Dependency graph
requires:
  - phase: 14-relationship-resolvers-permission-scoping-query-safety
    provides: addParent/addSpouse/addChild/addSibling GraphQL mutations and the in-scope member list this dialog's picker consumes
provides:
  - "AddRelativeDialog component: one dialog parameterized by relationType ('parent'|'spouse'|'child'|'sibling'), implementing D-04/D-05's per-relationship form shapes"
  - "Colocated RTL test suite (13 tests) covering all four relation types, the in-scope-only picker, and REL-06/D-04 error surfacing"
affects: [15-manage-page-wiring, 15-relationship-grouped-panel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AddRelativeDialog reuses AdminLinkMembers.jsx's EMPTY_FORM / TextField create-form layout verbatim rather than a new form library"
    - "relationType-driven branching inside one component (NEEDS_ROLE set, conditional mutation dispatch) rather than four separate dialog components"

key-files:
  created:
    - frontend/src/components/manage/AddRelativeDialog.jsx
    - frontend/src/components/manage/AddRelativeDialog.test.jsx
  modified: []

key-decisions:
  - "Picker Autocomplete for the child relation type is toggle-revealed behind a text Button, not always rendered, matching D-04's 'secondary path' framing"
  - "otherParentId is submitted as otherParent?.id ?? null (never undefined) so the mutation variable is always explicit"
  - "REL-06 and Phase 14 D-04 rejections are NOT special-cased; both flow through the same generic <Alert severity=\"error\">{err.message}</Alert> rendering already used for parent/spouse errors"

patterns-established:
  - "Component test suite grouped by relationType (describe blocks), mirroring the plan's per-relation-type acceptance criteria"

requirements-completed: [MNG-02]

# Metrics
duration: 15min
completed: 2026-07-23
---

# Phase 15 Plan 03: AddRelativeDialog Summary

**AddRelativeDialog — one MUI Dialog component parameterized by relationType, covering all four Phase 14 add-relative mutations (addParent/addSpouse/addChild/addSibling) with an in-scope-only "other parent" picker for the child path**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-23T20:22:33+02:00 (base commit)
- **Completed:** 2026-07-23T20:37:03+02:00
- **Tasks:** 2 completed
- **Files modified:** 2 (both created)

## Accomplishments
- Built the single `AddRelativeDialog` component that reuses `AdminLinkMembers.jsx`'s proven `EMPTY_FORM`/`TextField` create-form layout, parameterized entirely by the `relationType` prop
- Implemented all four relation-type paths: parent (role selector), spouse (no extras), child (role selector + toggle-revealed in-scope `Autocomplete` picker), sibling (no extras)
- REL-06 dedup and Phase 14 D-04 "add a parent first" server rejections both render via the same generic error-`Alert` pattern — no dead ends, no special-casing
- 13 RTL tests, full TDD red→green cycle for both tasks; full frontend suite green (47/47)

## Task Commits

Each task was committed via the RED→GREEN TDD cycle:

1. **Task 1: AddRelativeDialog — parent and spouse relation types**
   - `216709e` (test) — failing test for parent/spouse paths
   - `2ac3ac8` (feat) — implementation, green
2. **Task 2: AddRelativeDialog — child and sibling relation types, in-scope picker, error surfacing**
   - `88c838f` (test) — failing test for child/sibling paths
   - `bd36e09` (feat) — implementation, green (includes a same-commit fix to a faulty test assertion — see Deviations)

**Plan metadata:** committed separately after this summary (docs commit, worktree mode).

_TDD gate sequence verified in git log: test → feat → test → feat, in order._

## Files Created/Modified
- `frontend/src/components/manage/AddRelativeDialog.jsx` - The one dialog component parameterized by `relationType`; defines `ADD_PARENT_MUTATION`, `ADD_SPOUSE_MUTATION`, `ADD_CHILD_MUTATION`, `ADD_SIBLING_MUTATION`; renders the shared create-form fields plus relation-specific extras (role select for parent/child, toggle-revealed Autocomplete for child)
- `frontend/src/components/manage/AddRelativeDialog.test.jsx` - RTL test suite, 13 tests grouped by relation type (parent/spouse/child/sibling), asserting mutation call shape, "Add member" button label, in-scope-only picker options, and REL-06/D-04 error text rendering inside `role="alert"`

## Decisions Made
- Picker Autocomplete for `child` is behind a `Button variant="text"` toggle ("or pick someone already in your family") rather than always-rendered, matching D-04's "secondary path" framing and keeping the sibling/spouse forms visually identical to the child form when the picker is collapsed
- `otherParentId` always submits as `otherParent?.id ?? null` (never `undefined`), keeping the GraphQL variable explicit regardless of picker interaction
- No special-casing of REL-06 or Phase 14 D-04 error text — both render through the same generic `<Alert severity="error">{err.message}</Alert>` already established for parent/spouse, per T-15-07's accept disposition (server messages are already designed to be user-facing)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a faulty test assertion for the in-scope Autocomplete-options test**
- **Found during:** Task 2, GREEN step verification
- **Issue:** The originally written test (`binds the Autocomplete options strictly to the inScopeMembers prop`) queried for the Autocomplete via a CSS class selector without first clicking the toggle button that reveals it — since the picker is toggle-revealed (not always rendered), the query returned `null` and the test failed even though the implementation was correct.
- **Fix:** Rewrote the test to click the "or pick someone already in your family" toggle first, then type into the picker and assert only the in-scope option (`William King`) renders while an out-of-scope name does not — this is also a stronger assertion of the acceptance criterion than the original class-selector check.
- **Files modified:** `frontend/src/components/manage/AddRelativeDialog.test.jsx`
- **Verification:** Full test file re-run, 13/13 passing
- **Committed in:** `bd36e09` (part of Task 2 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug in test code, not implementation)
**Impact on plan:** No scope creep — the fix corrected a test authoring error discovered during the same TDD cycle it was introduced in; the component implementation was correct on first pass for this criterion.

## Issues Encountered

**Worktree base drift (pre-execution, not part of the plan):** At agent startup, the worktree's HEAD was on stale history unrelated to Phase 15 (a `merge-base` check against the expected base commit `c0d6960` returned a divergent ancestor). Per the mandatory `<worktree_branch_check>` protocol, `git reset --hard c0d6960` was run to correct the worktree to the expected base before any plan work began. This is a worktree-provisioning artifact, not a plan deviation — no plan-authored commits were affected.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `AddRelativeDialog` is ready to be dropped into the `/manage` member view and admin-focused panel unchanged — its prop contract (`{ open, relationType, targetId, inScopeMembers, onClose, onCreated }`) is locked and consumed by no other component yet, so a later wiring plan can integrate it against `RelationshipGroupedPanel`'s `onAddRelative` callback with no interface changes.
- No blockers. The REL-06 backend guard and `RelationshipGroupedPanel` (built in parallel plans per the phase's wave structure) are the two pieces this dialog will be wired against next.

---
*Phase: 15-sibling-dedup-guard-manage-self-service-ui*
*Completed: 2026-07-23*

## Self-Check: PASSED

- FOUND: frontend/src/components/manage/AddRelativeDialog.jsx
- FOUND: frontend/src/components/manage/AddRelativeDialog.test.jsx
- FOUND: .planning/phases/15-sibling-dedup-guard-manage-self-service-ui/15-03-SUMMARY.md
- FOUND: 216709e (test commit, parent/spouse RED)
- FOUND: 2ac3ac8 (feat commit, parent/spouse GREEN)
- FOUND: 88c838f (test commit, child/sibling RED)
- FOUND: bd36e09 (feat commit, child/sibling GREEN)
