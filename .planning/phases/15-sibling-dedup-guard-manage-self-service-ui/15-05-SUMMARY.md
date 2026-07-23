---
phase: 15-sibling-dedup-guard-manage-self-service-ui
plan: 05
subsystem: ui
tags: [react, mui, react-router, graphql, family-tree]

# Dependency graph
requires:
  - phase: 15-02
    provides: RelationshipGroupedPanel/MemberCard component contracts (scope-shaped rendering, isSelf/isDerived/lock semantics)
  - phase: 15-03
    provides: AddRelativeDialog component contract (open/relationType/targetId/inScopeMembers/onClose/onCreated)
provides:
  - Member-facing /manage page (ManagePage.jsx) that fetches myEditableMembers, groups the flat
    result into { self, parents, spouses, children, siblings }, and renders it via
    RelationshipGroupedPanel
  - Add-relative flow wired end to end (AddRelativeDialog -> refetch)
  - EditMemberDialog for plain-field edits of self/non-locked relatives (editMember mutation)
  - /manage route registered behind the unchanged ProtectedRoute (no allowedRoles), identical
    gating to /dashboard
  - /admin/link-members retired to an unconditional redirect to /manage
affects: [15-06, 17-family-tree]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "groupByRelation(rows, self): client-side grouping of a flat myEditableMembers result into
      relationship buckets using self's own nested mother/father/spouses/children/siblings ids
      — no second query per category"
    - "Page-level dialogState/editTarget pattern for wiring child dialogs (AddRelativeDialog,
      EditMemberDialog) to a single refetch callback"

key-files:
  created:
    - frontend/src/pages/ManagePage.jsx
    - frontend/src/pages/ManagePage.test.jsx
    - frontend/src/components/manage/EditMemberDialog.jsx
    - frontend/src/components/manage/EditMemberDialog.test.jsx
  modified:
    - frontend/src/App.jsx
    - frontend/src/pages/AdminLinkMembers.jsx
    - frontend/src/pages/AdminLinkMembers.test.jsx

key-decisions:
  - "Admin role currently renders a minimal placeholder in ManagePage (heading + subtitle + a
    'coming in a later plan' notice) — the admin table/focus/link branch is explicitly deferred
    to a later plan per this plan's objective, not a stub left by accident."
  - "App.jsx's admin/link-members route element uses <Navigate to=\"/manage\" replace /> directly
    (no longer imports/renders AdminLinkMembers) while AdminLinkMembers.jsx is independently
    reduced to its own 5-line redirect component — both changes were explicit in the plan's
    action text (kept the file for any bookmarked/direct references, decoupled from the route)."

patterns-established:
  - "Relationship-grouped panel fed by one page + client-side derivation, reused unchanged from
    15-02/15-03 (D-01/D-03) — ManagePage is purely a data-fetch + grouping + wiring layer."

requirements-completed: [MNG-01, MNG-02, MNG-04]

# Metrics
duration: ~20min
completed: 2026-07-23
---

# Phase 15 Plan 05: ManagePage Member Branch, EditMemberDialog, /manage Routing Summary

**Member-facing `/manage` page wired end to end: `myEditableMembers` fetch + client-side relationship grouping, add-relative dialog, plain-field `EditMemberDialog`, and `/manage` routed behind the unchanged `ProtectedRoute` gate with `/admin/link-members` retired to a redirect.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-23
- **Tasks:** 3 completed
- **Files modified:** 7 (4 created, 3 modified)

## Accomplishments
- A member-role user visiting `/manage` now sees a fetched, grouped, populated editable scope
  (You / Parents / Spouse / Children / Siblings) rendered via the existing
  `RelationshipGroupedPanel`
- The add-relative flow (`+ Add parent/spouse/child/sibling`) is wired to `AddRelativeDialog`,
  refetching the scope on success
- A new `EditMemberDialog` lets a member edit their own or a non-locked relative's plain fields
  via the `editMember` mutation, matching `EditFamilyMemberInput`'s exact (edge-free) field list
- `/manage` is registered behind the same plain `ProtectedRoute` (no `allowedRoles`) that guards
  `/dashboard` — proven end to end against the real route tree (unlinked non-admin → `/pending`;
  linked member → `ManagePage` content), not just `ProtectedRoute` in isolation
- `/admin/link-members` no longer renders any admin-linking UI of its own; it unconditionally
  redirects to `/manage`

## Task Commits

Each task was committed atomically:

1. **Task 1: ManagePage member branch — fetch, group, render, add-relative wiring** - `889c403` (feat)
2. **Task 2: EditMemberDialog — plain-field edits for self and non-locked relatives** - `eef64e7` (feat)
3. **Task 3: /manage route registration + retire /admin/link-members + MNG-04 route-gating proof** - `5ddb825` (feat)

**Plan metadata:** committed alongside this SUMMARY (see final commit)

## Files Created/Modified
- `frontend/src/pages/ManagePage.jsx` - `/manage` page: fetches `myEditableMembers`, groups via
  `groupByRelation`, renders `RelationshipGroupedPanel` + `AddRelativeDialog` + `EditMemberDialog`
  for non-admin users; renders a placeholder for admin users (full admin branch deferred)
- `frontend/src/pages/ManagePage.test.jsx` - Fetch/group/render, add-child dialog wiring
  (relationType + targetId), refetch-after-create, edit-dialog wiring, and the real-route-tree
  MNG-04 proof (unlinked non-admin → `/pending`; linked member → content)
- `frontend/src/components/manage/EditMemberDialog.jsx` - Pre-fills from `member`, submits
  `editMember` with the exact `EditFamilyMemberInput` field list (no edge-mutating field), "Save
  changes"/"Cancel" actions, error `Alert` on rejection
- `frontend/src/components/manage/EditMemberDialog.test.jsx` - Pre-fill, submit-with-exact-fields,
  no-edge-field grep-style assertion, error-alert, and member-switch reset coverage
- `frontend/src/App.jsx` - Registers `<Route path="manage" element={<ManagePage />} />` inside the
  existing plain `ProtectedRoute` wrapper; `admin/link-members`'s element is now
  `<Navigate to="/manage" replace />`
- `frontend/src/pages/AdminLinkMembers.jsx` - Reduced to a 5-line component that unconditionally
  redirects to `/manage` (kept, not deleted, per plan)
- `frontend/src/pages/AdminLinkMembers.test.jsx` - Rewritten to assert only the redirect behavior;
  prior list/dialog assertions are superseded by `AddRelativeDialog`/`RelationshipGroupedPanel`'s
  own component tests from 15-02/15-03

## Decisions Made
- Admin branch of `ManagePage` is a minimal placeholder this plan (heading + admin subtitle copy
  + a note that the full admin tooling lands in a later plan) — matches the plan's explicit scope
  boundary, not an oversight.
- `App.jsx`'s `admin/link-members` route element was changed to a direct `<Navigate>` (dropping
  the `AdminLinkMembers` import from `App.jsx`) while `AdminLinkMembers.jsx` itself was
  independently reduced to its own redirect component — both actions were explicitly specified in
  the plan text, not a divergence.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

- `ManagePage.jsx`'s admin branch (`AdminPlaceholder`) renders static copy with no data fetch —
  this is the plan's own explicitly deferred scope ("the admin-focused branch... is deliberately
  deferred to a later plan that extends this same file"), not an unplanned stub. A later plan in
  this phase extends `ManagePage.jsx` to add the admin table → focus → panel flow.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `ManagePage.jsx` is ready to be extended with the admin branch (table → focus →
  `RelationshipGroupedPanel` with `isAdmin`/`onDelete` wired, plus account-linking) in a later
  plan of this phase, per the plan's stated scope boundary.
- `/manage` routing and MNG-04 gating are fully proven against the real route tree; no further
  routing changes are needed when the admin branch lands — only `ManagePage.jsx`'s internal
  content for `user.role === 'ADMIN'`.

---
*Phase: 15-sibling-dedup-guard-manage-self-service-ui*
*Completed: 2026-07-23*

## Self-Check: PASSED

All created/modified files verified present on disk; all three task commit hashes
(`889c403`, `eef64e7`, `5ddb825`) verified present in `git log --oneline --all`.
