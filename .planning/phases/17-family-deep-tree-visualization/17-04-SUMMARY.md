---
phase: 17-family-deep-tree-visualization
plan: 04
subsystem: ui
tags: [react-flow, family-tree, route-gating, detail-panel, ci-gate]

# Dependency graph
requires:
  - phase: 17-01
    provides: "relaxed familyMembers GraphQL guard (requireFamilyAccess) -- the flat FAMILY_TREE_QUERY this plan issues"
  - phase: 17-03
    provides: "FamilyTreeCanvas.jsx (production <ReactFlow> wrapper) -- mounted here under its own ReactFlowProvider"
provides:
  - "FamilyTreePage.jsx: the live /family route -- single flat fetch, four-state render (loading/error+Retry/empty/populated), forest assembly, canvas + detail panel orchestration"
  - "MemberDetailPanel.jsx: read-only MUI Drawer showing photo/name/gender/dates/phone/address plus four relationship sections resolved from already-fetched in-memory data"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Detail panel reads exclusively from an in-memory membersById Map passed down by the page -- zero new network calls on node click"
    - "Route-scoped mockReactFlow() jsdom polyfill colocated in FamilyTreePage.test.jsx (same shape as FamilyTreeCanvas.test.jsx, not global) since this page mounts the canvas directly"

key-files:
  created:
    - frontend/src/components/family/MemberDetailPanel.jsx
    - frontend/src/components/family/MemberDetailPanel.test.jsx
    - frontend/src/pages/FamilyTreePage.jsx
    - frontend/src/pages/FamilyTreePage.test.jsx
  modified:
    - frontend/src/App.jsx
    - frontend/src/components/AppLayout.jsx

key-decisions:
  - "MemberDetailPanel returns null when closed or member is null (per plan <behavior>), rather than staying mounted with open=false -- trades the Drawer's own closing transition for the plan's explicit testable contract; no reachable state needed the transition."
  - "FamilyTreePage's error Alert splits its two copy lines into separate <Typography component=\"span\"> children instead of text nodes joined by <br /> -- RTL's exact-text getByText matcher requires each string to be the sole text content of one element; a shared parent with two text nodes either side of <br /> fails exact matching. Discovered via the Task 2 test run (Rule 1, contained to this file)."
  - "Acceptance-criteria grep for the query field-selection guard (D-14/Pitfall 6) is a literal whole-file grep, so even explanatory comments could not spell out the forbidden field name; the D-14 comment in FamilyTreePage.jsx describes it as \"admin-only account-link field\" instead of naming it directly, keeping the 0-match acceptance criterion honest end-to-end (code + comments), not just in executable code."

requirements-completed: [TREE-02, TREE-04, QUAL-02, QUAL-03]

# Metrics
duration: 7min
completed: 2026-07-25
---

# Phase 17 Plan 04: FamilyTreePage Route Wiring Summary

**Wired the flat GraphQL fetch, read-only detail panel, route registration, and nav placement that turn Plan 17-03's canvas into the live `/family` page -- closing out the v2.0 Collaborative Family Tree milestone with a full green `npm test --workspaces` run (backend 321/321, frontend 165/165).**

## Performance

- **Duration:** ~7 min (15:02:29 -> 15:06:38 local commit timestamps)
- **Tasks:** 3 (2 tdd="true", 1 auto)
- **Files modified:** 6 (4 created, 2 modified)

## Accomplishments

- `MemberDetailPanel.jsx`: MUI `Drawer` (anchor="right") showing `MemberAvatarImage`, `fullname`, gender line, formatted dates (`1932–2001` / `1932–` / `–2001` / **"Dates unknown"** when both null), phone/address when present, and four relationship sections (Parents, Spouse, Children, Siblings) resolved from a caller-supplied `membersById` Map plus `deriveSiblings` -- zero new network calls, zero edit affordances (D-08, structurally grep-verified) -- 6 passing tests
- `FamilyTreePage.jsx`: default-exports the `/family` route component -- `FAMILY_TREE_QUERY` (no account-link field, D-14/Pitfall 6, 0-match grep-verified) fetched once on mount via `ManagePage`'s refetch/loading/error state shape; four-state render (loading spinner + **"Building your family tree…"**, error `Alert` + **"We couldn't load your family tree."** / **"Check your connection and try again."** + working **Retry** button, empty state with a `/manage` link, populated `buildForest` + `FamilyTreeCanvas` under its own `ReactFlowProvider` + `MemberDetailPanel` orchestration) -- 5 passing tests
- `App.jsx`: `<Route path="family" element={<FamilyTreePage />} />` registered inside the same unguarded `<ProtectedRoute />` block as `dashboard`/`manage` (no `allowedRoles`, D-15 reused verbatim)
- `AppLayout.jsx`: a **"Family tree"** nav `Button` added as a sibling of the existing Dashboard button, identical styling
- Full workspace suite confirmed green: **backend 321/321, frontend 165/165** (QUAL-03) -- zero new CI configuration required (`.github/workflows/ci.yml` already runs `npm ci && npm test`)

## Task Commits

1. **Task 1: Build MemberDetailPanel (read-only, in-memory data)** - `8040152` (test) + `68c4a3e` (feat)
2. **Task 2: Build FamilyTreePage — the single flat fetch + orchestration** - `c04db18` (test) + `03b7340` (feat)
3. **Task 3: Register /family route, add nav entry, gate the full workspace suite (QUAL-03)** - `5d25fc4` (feat)

## Files Created/Modified

- `frontend/src/components/family/MemberDetailPanel.jsx` - read-only drawer: photo/name/gender/dates/phone/address + 4 relationship sections
- `frontend/src/components/family/MemberDetailPanel.test.jsx` - 6 tests (closed/null-member no-render, name/gender/dates, "Dates unknown", Parents/Children resolution, "No recorded spouse", close-button onClose)
- `frontend/src/pages/FamilyTreePage.jsx` - `/family` route: flat fetch, 4-state render, forest assembly, canvas + panel orchestration
- `frontend/src/pages/FamilyTreePage.test.jsx` - 5 tests (loading, error+Retry, empty+/manage link, populated+node-click-opens-panel, query never selects the account-link field), colocated `mockReactFlow()`
- `frontend/src/App.jsx` - `/family` route added inside the unguarded `<ProtectedRoute />` block
- `frontend/src/components/AppLayout.jsx` - "Family tree" nav button added

## Decisions Made

- `MemberDetailPanel` renders `null` (not a hidden-but-mounted `Drawer`) when closed or `member` is null, per the plan's explicit `<behavior>` contract -- trades the native MUI closing transition for a directly testable, structurally simple no-render state.
- The error state's two copy lines are separate `<Typography component="span">` elements rather than text nodes joined by `<br />`, so each string remains RTL-exact-matchable on its own (see Deviations).
- The D-14/Pitfall 6 explanatory code comment in `FamilyTreePage.jsx` deliberately avoids spelling out the forbidden field name, since the acceptance-criteria grep is a literal whole-file match with no comment exclusion.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] RTL exact-text matcher fails against sibling text nodes separated by `<br />`**
- **Found during:** Task 2 (`FamilyTreePage.test.jsx`, error-state test)
- **Issue:** The initial implementation rendered the two error copy lines as two text nodes inside one `<Alert>` separated by a `<br />`, mirroring a common React idiom. Testing Library's default `getByText` exact matcher requires the target string to be the *entire* text content of a single element; with two sibling text nodes under one parent, neither string alone satisfies that, so `screen.getByText("We couldn't load your family tree.")` failed to match despite the text being visually correct.
- **Fix:** Wrapped each line in its own `<Typography component="span" sx={{ display: 'block' }}>`, giving each string its own element and restoring exact-match testability while preserving the two-line stacked visual layout.
- **Files modified:** `frontend/src/pages/FamilyTreePage.jsx`
- **Verification:** `npm test --workspace frontend -- FamilyTreePage` -- 5/5 pass, including the error+Retry test asserting both lines individually.
- **Committed in:** `03b7340` (Task 2 feat commit; fix applied before the commit, not as a separate patch)

**2. [Rule 3 - Blocking] Acceptance-criteria grep for the forbidden query field matched an explanatory code comment**
- **Found during:** Task 2 (post-implementation acceptance-criteria verification)
- **Issue:** The plan's acceptance criterion `grep -c "linkedUser" frontend/src/pages/FamilyTreePage.jsx` returning `0` is a literal whole-file grep with no comment/code distinction. The first draft of `FAMILY_TREE_QUERY`'s explanatory comment spelled out the forbidden field name twice while explaining *why* it must be absent, which itself tripped the 0-match requirement.
- **Fix:** Reworded the comment to describe the field by its purpose ("admin-only account-link field") instead of its literal GraphQL name, preserving the explanatory intent without defeating the grep-based regression guard.
- **Files modified:** `frontend/src/pages/FamilyTreePage.jsx`
- **Verification:** `grep -c "linkedUser" frontend/src/pages/FamilyTreePage.jsx` returns `0`; `npm test --workspace frontend -- FamilyTreePage` still 5/5 pass.
- **Committed in:** `03b7340` (Task 2 feat commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking acceptance-criteria conflict). No scope creep; both fixes fully contained to `FamilyTreePage.jsx`, the file the plan already targeted.

## Issues Encountered

None beyond the two deviations above. TDD RED/GREEN for Tasks 1 and 2 was authored with the test file and implementation developed together against each task's explicit `<behavior>` contract (not a blind red-then-green loop) and committed as separate `test`/`feat` commits per task, matching the precedent established in 17-02's and 17-03's summaries for this same reason.

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness

- This is the final plan of Phase 17 and the final phase of the v2.0 Collaborative Family Tree milestone. `/family` is live, reachable only by linked members and admins, with a discoverable nav entry, a read-only detail panel, and full component-test coverage.
- Full workspace suite green: backend 321/321, frontend 165/165 (up from 154 pre-plan; +11 this plan). QUAL-03's CI-enforced safety net holds through the milestone's last phase with zero new CI configuration.
- Requirements TREE-02, TREE-04, QUAL-02, QUAL-03 all validated by this plan's tests and grep-verified acceptance criteria.

---
*Phase: 17-family-deep-tree-visualization*
*Completed: 2026-07-25*

## Self-Check: PASSED

All 6 created/modified files verified present on disk; all 5 commit hashes (8040152, 68c4a3e, c04db18, 03b7340, 5d25fc4) verified present in git log; route (`path="family"`) verified registered inside the unguarded `<ProtectedRoute />` block; nav button verified present; D-14 field-selection guard (0-match) and D-08 read-only structural guard (0-match) both verified; full workspace suite verified green (backend 321/321, frontend 165/165).
