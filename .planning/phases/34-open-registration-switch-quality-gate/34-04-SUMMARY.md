---
phase: 34-open-registration-switch-quality-gate
plan: 04
subsystem: ui
tags: [react, mui, graphql-client, admin-control, testing]

# Dependency graph
requires:
  - phase: 34-01
    provides: "34-UI-SPEC.md design contract and the GraphQL contract (publicRegistrationSetting query, setPublicRegistrationEnabled mutation) pinned for parallel execution with 34-03"
provides:
  - "PublicSignupSwitch.jsx -- the admin control for opening/closing public self-registration, with its own query, mutation, and five mutually-exclusive states"
  - "InvitationsPage.jsx wired to render the switch as the first admin-gated region above InvitePage, with no new route/nav/page"
affects: [34-05, 34-06, 34-07, 34-08, 34-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Region component owns its own graphqlRequest query + mutation + loadError/actionError split, matching ApprovalsPage.jsx's established shape"
    - "No-optimistic-flip: Switch `checked` is derived only from last server-confirmed state, never local intent; a failed mutation re-reads rather than reverting a local flag"
    - "Asymmetric confirmation: one direction (close) flips directly, the other (open) requires a Dialog naming the consequence"

key-files:
  created:
    - frontend/src/components/PublicSignupSwitch.jsx
    - frontend/src/components/PublicSignupSwitch.test.jsx
  modified:
    - frontend/src/pages/InvitationsPage.jsx
    - frontend/src/pages/InvitationsPage.test.jsx

key-decisions:
  - "Rehearsed both required mutations (remove confirmation asymmetry; drive checked from local intent) -- both went RED then green after restore, proving tests 6 and 7 actually catch the regressions they claim to catch"
  - "Attribution comment referencing the absent closing dialog was rephrased to avoid literally quoting \"Close public signup?\", which was tripping the negative-match acceptance grep for that exact string"

patterns-established:
  - "Pattern: admin toggle regions (state + attribution + asymmetric confirmation) live in components/, not pages/, owning their own data lifecycle -- reusable for any future admin flag"

requirements-completed: [ADMIN-01, ADMIN-03]

# Metrics
duration: 10min
completed: 2026-09-09
---

# Phase 34 Plan 04: Public Signup Admin Switch Summary

**PublicSignupSwitch.jsx admin control (five states, asymmetric open/close friction, no-optimistic-flip) wired as the first region of /invitations**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-09-09T10:05:00Z (approx.)
- **Completed:** 2026-09-09T10:16:07Z
- **Tasks:** 3
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- Built `PublicSignupSwitch.jsx`: a self-contained admin control with its own `publicRegistrationSetting` read and `setPublicRegistrationEnabled` flip mutation, rendering five mutually-exclusive states (loading, failed-to-load, open, closed, in-flight) with byte-identical UI-SPEC copy
- Implemented D-05's asymmetric friction: closing the door is one click on the Switch with no dialog; opening requires confirming a Dialog that names the consequence
- Implemented D-07's no-optimistic-flip rule: `checked` reads only from the last server-confirmed `setting`, and a failed flip re-reads rather than leaving a locally-assumed state
- Covered all of the above with 8 component tests using a query-dispatching mock (no `*Once` chains), then rehearsed two mutation-tests (removing the confirmation asymmetry; driving `checked` from local intent) to prove both went RED before being restored to green
- Wired `PublicSignupSwitch` as the first admin-gated region of `InvitationsPage.jsx`, above the existing `InvitePage`/`ApprovalsPage` stack, with no new route, nav entry, or page component (D-04)
- Full frontend suite green: 44 test files, 491 tests

## Task Commits

Each task was committed atomically:

1. **Task 1: PublicSignupSwitch.jsx — the admin control, five states, asymmetric friction** - `d6695ed` (feat)
2. **Task 2: PublicSignupSwitch.test.jsx — states, asymmetry, attribution, no-optimistic-flip** - `ccd08ec` (test)
3. **Task 3: Wire the switch as the first region of InvitationsPage** - `081cc04` (feat)

_Note: no TDD-gated tasks in this plan; component built first (Task 1), then covered (Task 2), following this project's established "build then test the region" pattern used by ApprovalsPage/InvitePage._

## Files Created/Modified
- `frontend/src/components/PublicSignupSwitch.jsx` - The admin control: own query/mutation, formatWhen date helper, describeAttribution helper, five-state render, confirmation Dialog
- `frontend/src/components/PublicSignupSwitch.test.jsx` - 8 tests covering all states, D-05 asymmetry (both directions), all three D-06 attribution variants, D-07 no-optimistic-flip, and the Retry path
- `frontend/src/pages/InvitationsPage.jsx` - Added the `isAdmin`-gated `<PublicSignupSwitch />` + `Divider` fragment as the first child of the existing `Stack`
- `frontend/src/pages/InvitationsPage.test.jsx` - Added a `publicRegistrationSetting` dispatch branch and asserted the region's admin-only presence

## Decisions Made
- Kept the attribution helper (`describeAttribution`) as a module-level pure function taking `setting` as an argument, mirroring `ApprovalsPage.jsx`'s module-level `formatWhen` rather than defining it inline in JSX, for testability and readability.
- Used one shared `mockImplementation` set in `beforeEach` (query-dispatching, reading mutable `current`/flag variables) across all 8 tests rather than per-test `mockResolvedValueOnce` chains, per the plan's explicit instruction and the acceptance-criteria grep enforcing 0 `*Once` usages.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Comment text tripped the "no closing dialog" negative-match acceptance check**
- **Found during:** Task 1 verification (acceptance criteria greps)
- **Issue:** A code comment explaining the deliberate absence of a closing confirmation literally quoted `"Close public signup?"`, which matched the acceptance criterion `grep -ci "close public signup?"` expecting `0` (the check guards against ever adding such a dialog title, and doesn't distinguish comments from rendered strings).
- **Fix:** Reworded the comment to describe the same intent ("no equivalent confirmation on the closing direction... read that absence as intentional") without quoting the literal forbidden phrase.
- **Files modified:** `frontend/src/components/PublicSignupSwitch.jsx`
- **Verification:** Re-ran `grep -ci "close public signup?"` → `0`; all other Task 1 acceptance greps still pass.
- **Committed in:** `d6695ed` (Task 1 commit — fixed before commit, not a separate commit)

---

**Total deviations:** 1 auto-fixed (1 bug, comment-only, no behavior change)
**Impact on plan:** Cosmetic; no scope creep, no functional change.

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None - no external service configuration required. This plan mocks `graphqlRequest` throughout; it does not require the backend GraphQL contract (built in parallel by plan 34-03) to be present to pass its own tests.

## Next Phase Readiness
- `PublicSignupSwitch.jsx` is ready to talk to the real backend once plan 34-03's `publicRegistrationSetting` query and `setPublicRegistrationEnabled` mutation land — the interface strings are pinned verbatim from this plan's `<interfaces>` block, so no client-side changes should be needed.
- `InvitationsPage.jsx` now has three stacked admin-gated regions (switch, invite form, approval queue) sharing one `Divider` convention; any future region should follow the same `isAdmin && (<><Region /><Divider .../></>)` shape.
- No blockers. The full frontend suite (44 files / 491 tests) is green and this plan touched no backend files, so it is safe alongside plan 34-03's concurrent backend work per the plan's own `<verification>` note.

---
*Phase: 34-open-registration-switch-quality-gate*
*Completed: 2026-09-09*
