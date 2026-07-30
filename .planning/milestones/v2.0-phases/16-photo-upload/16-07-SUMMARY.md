---
phase: 16-photo-upload
plan: 07
subsystem: ui
tags: [react, mui, vitest, react-testing-library, tdd, prop-threading]

# Dependency graph
requires:
  - phase: 16-photo-upload
    plan: 16-06
    provides: "photoClient.js (uploadMemberPhoto/removeMemberPhoto/fetchMemberPhotoBlob), MemberAvatarImage.jsx, PhotoCropDialog.jsx"
provides:
  - "MemberCard.jsx avatar as the live D-01 photo-upload trigger (ButtonBase + hidden file input + camera overlay + aria-label), D-10 icon placeholder fully replacing initials, and a scoped 'Remove photo' text action"
  - "RelationshipGroupedPanel.jsx/MemberRows explicit onPickPhoto/onRemovePhoto prop-threading to every MemberCard render path"
  - "ManagePage.jsx PhotoCropDialog + 'Remove photo?' confirm-dialog wiring in both MemberBranch and AdminBranch, and photoUrl on all 3 member-fetching queries"
  - "AdminMemberTable.jsx photo thumbnail column"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Avatar-as-upload-trigger: a plain-<button>-rendering MUI ButtonBase (not component=\"label\") with an onClick that calls fileInputRef.current.click(), paired with a separate visually-hidden <input type=\"file\"> -- keeps the focusable/keyboard-activatable control and the native file-picker trigger as two distinct, independently-testable DOM nodes rather than relying on native <label> semantics"
    - "Per-branch local dialog-open state (open/file/member for crop; target/removing/error for remove-photo confirm), mirroring the existing 'Remove member?' dialog's non-dismissible-while-in-flight/Cancel-left/destructive-confirm-right shape, duplicated (not extracted) across MemberBranch and AdminBranch since their refetch callbacks differ (single refetch() vs refetchMembers()+refetchFocused())"

key-files:
  created: []
  modified:
    - frontend/src/components/manage/MemberCard.jsx
    - frontend/src/components/manage/MemberCard.test.jsx
    - frontend/src/components/manage/RelationshipGroupedPanel.jsx
    - frontend/src/components/manage/RelationshipGroupedPanel.test.jsx
    - frontend/src/pages/ManagePage.jsx
    - frontend/src/pages/ManagePage.test.jsx
    - frontend/src/components/manage/AdminMemberTable.jsx
    - frontend/src/components/manage/AdminMemberTable.test.jsx

key-decisions:
  - "MemberCard's avatar trigger renders as a real <button> (MUI ButtonBase's default root component) with aria-label and an onClick that programmatically clicks a separate hidden <input type=\"file\">, rather than wrapping the input in a component=\"label\" ButtonBase -- this keeps the focusable/labeled control and the native file-input trigger as two distinct DOM nodes, which is both simpler for screen readers (one clear focus target) and directly testable (container.querySelector('input[type=\"file\"]') + userEvent.upload, independent of the button's aria-label)"
  - "PhotoCropDialog and the 'Remove photo?' confirm Dialog are duplicated (not extracted into a shared component) across MemberBranch and AdminBranch, matching this file's existing pattern where AddRelativeDialog/EditMemberDialog are already rendered separately in both branches with branch-specific refetch callbacks (refetch() vs refetchMembers()+refetchFocused())"

patterns-established:
  - "Any future avatar-driven action on MemberCard should reuse the ButtonBase-onClick-triggers-hidden-input pattern rather than a component=\"label\" wrapper, for the same testability/accessibility reasons"

requirements-completed: [PHOTO-01]

# Metrics
duration: 9min
completed: 2026-07-24
---

# Phase 16 Plan 07: MemberCard Avatar Trigger, Callback Threading & ManagePage Wiring Summary

**MemberCard's avatar is now the live D-01 upload trigger (ButtonBase + hidden file input + camera overlay, D-10 icon placeholder replacing initials everywhere), RelationshipGroupedPanel explicitly threads onPickPhoto/onRemovePhoto through every MemberCard render path, ManagePage wires PhotoCropDialog and a distinct "Remove photo?" confirm dialog into both the member and admin branches, and AdminMemberTable gains a photo thumbnail column — completing every UI-SPEC-declared surface for PHOTO-01**

## Performance

- **Duration:** 9 min
- **Started:** 2026-07-24T21:28:04+02:00
- **Completed:** 2026-07-24T21:37:11+02:00
- **Tasks:** 3 (Task 1 and Task 2 each their own TDD RED → GREEN cycle; Task 3 non-TDD auto)
- **Files created:** 0
- **Files modified:** 8

## Accomplishments
- `MemberCard.jsx`: `<MemberAvatarImage member={member} />` fully replaces the placeholder `<Avatar>{getInitials(...)}</Avatar>` (D-10, zero `getInitials` references left in the file); when unlocked, the avatar is wrapped in a tabbable `ButtonBase` (44×44 hit area, `aria-label` "Add a photo for {fullname}" / "Change photo for {fullname}") with a hover/focus-visible camera-icon scrim, and a visually-hidden `<input type="file" accept="image/jpeg,image/png,image/webp">` wired to a new `onPickPhoto(member, file)` prop; when locked, the avatar renders as a plain, non-interactive `MemberAvatarImage` with no `ButtonBase`; a neutral "Remove photo" text button renders only when `!locked && member.photoUrl`, calling a new `onRemovePhoto(member)` prop
- `RelationshipGroupedPanel.jsx`: `onPickPhoto`/`onRemovePhoto` added to the component's own signature, to `rowProps`, to `MemberRows`'s signature, and to every `<MemberCard>` JSX invocation (the standalone "You" row and every `MemberRows`-rendered row) — no spread/rest shortcut, matching the file's existing all-explicit-props convention; proven by behavioral tests exercising the real avatar-file-input and "Remove photo" button on both the self row and a `MemberRows`-rendered parent row
- `ManagePage.jsx`: `photoUrl` added to `MY_EDITABLE_MEMBERS_QUERY`, `FAMILY_MEMBERS_QUERY`, `FAMILY_MEMBER_FOCUS_QUERY`; both `MemberBranch` and `AdminBranch` gained `cropDialog`/`removePhotoTarget`/`removingPhoto`/`removePhotoError` local state, pass `onPickPhoto`/`onRemovePhoto` explicitly to their `<RelationshipGroupedPanel>` call site, render `<PhotoCropDialog onUploaded={<branch refetch>} />`, and render a new "Remove photo?" confirm `Dialog` (non-dismissible while removing, Cancel left / destructive "Remove photo"→"Removing…" right) with the exact D-11 copy from 16-UI-SPEC.md — distinct in title, body, and button color from the existing "Remove member?" dialog, which is unchanged and still present
- `AdminMemberTable.jsx`: a new leading `<TableCell sx={{ width: 56 }} />` header and a matching per-row `<TableCell><MemberAvatarImage member={member} /></TableCell>` — existing search/filter/pagination logic and its tests untouched
- Full frontend suite: 115/115 green (103 prior + 12 net new), no regressions; `npm test --workspace frontend` exits 0

## Task Commits

Each task was committed individually; Tasks 1–2 as their own TDD RED → GREEN cycle:

1. **Task 1: MemberCard.jsx avatar-upload trigger (D-01/D-10)** - `b1e26bb` (test, RED — 5 new tests fail against the placeholder-Avatar implementation) → `f87e123` (feat, GREEN — 16/16 pass)
2. **Task 2: RelationshipGroupedPanel prop-threading + ManagePage wiring** - `8411561` (test, RED — new behavioral + Remove-photo-dialog tests fail against the pre-threading implementation) → `2edb654` (feat, GREEN — 27/27 pass)
3. **Task 3: AdminMemberTable.jsx photo thumbnail column** - `a48b5a8` (feat, non-TDD auto task per plan)

_Confirmed via `git log`: `b1e26bb` precedes `f87e123`, and `8411561` precedes `2edb654` — both TDD cycles' RED commits predate their own GREEN commits._

## Files Created/Modified
- `frontend/src/components/manage/MemberCard.jsx` - Avatar-as-D-01-upload-trigger, camera overlay, scoped Remove-photo action
- `frontend/src/components/manage/MemberCard.test.jsx` - 16 tests: placeholder icon (no initials), aria-label add/change, locked-avatar non-interactivity, onPickPhoto file-pick, Remove-photo scoping + callback
- `frontend/src/components/manage/RelationshipGroupedPanel.jsx` - Explicit onPickPhoto/onRemovePhoto threading through rowProps/MemberRows/standalone self row
- `frontend/src/components/manage/RelationshipGroupedPanel.test.jsx` - 9 tests: 2 new behavioral tests proving callbacks reach both the self row and a MemberRows-rendered row
- `frontend/src/pages/ManagePage.jsx` - photoUrl on all 3 queries; PhotoCropDialog + "Remove photo?" confirm dialog in both branches
- `frontend/src/pages/ManagePage.test.jsx` - photoClient.js mocked; 2 new tests confirming the Remove-photo confirm dialog opens and calls removeMemberPhoto (member + admin branches)
- `frontend/src/components/manage/AdminMemberTable.jsx` - Leading photo-thumbnail TableCell per row
- `frontend/src/components/manage/AdminMemberTable.test.jsx` - 1 new test asserting an avatar renders per row

## Decisions Made
- MemberCard's avatar trigger is a plain `<button>` (ButtonBase default root) with `onClick={() => fileInputRef.current.click()}`, not a `component="label"` ButtonBase wrapping the input — keeps one clear, `aria-label`-carrying focus target and makes the hidden file input independently queryable/uploadable in tests via `userEvent.upload` regardless of the button's accessible name.
- PhotoCropDialog and the "Remove photo?" confirm dialog are duplicated across `MemberBranch` and `AdminBranch` rather than extracted into a shared component, matching this file's existing pattern (AddRelativeDialog/EditMemberDialog are already duplicated per-branch) since each branch's refetch callback differs.

## Deviations from Plan

None - plan executed exactly as written. Task 3 was already flagged `type="auto"` (no `tdd="true"`) in the plan itself, so it was implemented directly rather than via a RED→GREEN cycle, per the plan's own task typing.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- PHOTO-01 is now observably complete end-to-end: an in-scope member's avatar is a working upload trigger on every surface that renders a `MemberCard` (relationship panels) and the admin table shows a photo thumbnail column.
- `EditMemberDialog` deliberately gained no upload affordance (D-03) — the avatar-click flow remains the sole entry point for uploading, replacing, or removing a member's photo.
- No blockers identified for subsequent phase-16 work or the milestone close.

---
*Phase: 16-photo-upload*
*Completed: 2026-07-24*

## Self-Check: PASSED

All claimed files verified present on disk; all commits verified present in git log:
- `frontend/src/components/manage/MemberCard.jsx` — FOUND
- `frontend/src/components/manage/MemberCard.test.jsx` — FOUND
- `frontend/src/components/manage/RelationshipGroupedPanel.jsx` — FOUND
- `frontend/src/components/manage/RelationshipGroupedPanel.test.jsx` — FOUND
- `frontend/src/pages/ManagePage.jsx` — FOUND
- `frontend/src/pages/ManagePage.test.jsx` — FOUND
- `frontend/src/components/manage/AdminMemberTable.jsx` — FOUND
- `frontend/src/components/manage/AdminMemberTable.test.jsx` — FOUND
- `b1e26bb` (Task 1 RED) — FOUND
- `f87e123` (Task 1 GREEN) — FOUND
- `8411561` (Task 2 RED) — FOUND
- `2edb654` (Task 2 GREEN) — FOUND
- `a48b5a8` (Task 3) — FOUND
