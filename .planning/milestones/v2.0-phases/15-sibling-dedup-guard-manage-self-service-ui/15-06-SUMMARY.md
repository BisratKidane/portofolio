---
phase: 15-sibling-dedup-guard-manage-self-service-ui
plan: 06
subsystem: frontend — /manage admin branch
tags: [react, mui, graphql, admin, manage-ui, phase-15-final-gate]
dependency-graph:
  requires: ["15-04 (AdminMemberTable)", "15-05 (ManagePage member branch, groupByRelation, /manage route)"]
  provides: ["ManagePage admin branch complete", "MNG-03 (account-linking re-homed)", "phase-15 full-suite gate"]
  affects: ["frontend/src/pages/ManagePage.jsx"]
tech-stack:
  added: []
  patterns:
    - "flattenFocusedRow: reshapes a single nested familyMember(id) response into the flat rows array the SAME groupByRelation helper (15-05) expects — one grouping function, two entry points (D-03)"
    - "isAdmin=true passed to RelationshipGroupedPanel bypasses MemberCard's D-06 lock via short-circuit (!isAdmin && ...), not a separate code path"
key-files:
  created: []
  modified:
    - frontend/src/pages/ManagePage.jsx
    - frontend/src/pages/ManagePage.test.jsx
decisions:
  - "Followed 15-RESEARCH.md's `mother { id fullname }` / `father { id fullname }` focus-query shape over the plan's <interfaces> block (which had `mother { id }` only, copy-pasted from the member branch's shallow shape) — without fullname, flattened parent rows would render with blank names"
  - "UnlinkedUserRow, UNLINKED_USERS_QUERY, LINK_USER_TO_MEMBER_MUTATION ported verbatim from AdminLinkMembers.jsx's pre-redirect state (commit 9082440) rather than redesigned"
metrics:
  duration: ~35min
  completed: 2026-07-23
---

# Phase 15 Plan 06: Admin branch — table, focus panel, delete confirm, account-linking Summary

Completed `/manage`'s admin branch: an admin-role user now sees a searchable `AdminMemberTable`,
can select any row to focus that member into the same `RelationshipGroupedPanel` the member view
uses (with Edit/Remove active), can remove a member behind a UI-SPEC-exact two-step confirm
dialog, and the account-linking UI from the retired `/admin/link-members` page now lives on this
same page (MNG-03) — the phase's final wiring plan.

## What Was Built

**Task 1 — Admin branch: table, focus-into-panel, delete confirm**
- `ManagePage.jsx`'s `AdminBranch` (replacing 15-05's placeholder) fetches `FAMILY_MEMBERS_QUERY`
  on mount and renders `AdminMemberTable` under the exact admin subtitle "Search the whole tree
  and manage any member."
- Row select (`handleFocus`) fetches `FAMILY_MEMBER_FOCUS_QUERY(id)`; a new `flattenFocusedRow`
  helper reshapes the single nested response (self + mother/father/spouses/children/siblings) into
  the flat "array of rows" shape the SAME `groupByRelation` helper 15-05 wrote already expects —
  D-03's "one grouped component, two entry points" now literally shares one grouping function too.
- `RelationshipGroupedPanel` renders with `isAdmin={true}`, which bypasses `MemberCard`'s D-06
  lock via its existing `!isAdmin && ...` short-circuit — no new bypass code was written, the
  existing component's own logic does it.
- Remove opens an inline `Dialog` (no new component) with UI-SPEC-exact copy: title "Remove
  member?", body "Remove {fullname} from the family tree? Blood relatives are preserved. This
  can't be undone.", confirm button "Remove" (`color="error"`), neutral Cancel. Confirming calls
  `graphqlRequest(DELETE_MEMBER_MUTATION, { id })`, refetches `FAMILY_MEMBERS_QUERY`, and clears
  the focused scope.
- `AddRelativeDialog`/`EditMemberDialog` (both from 15-02/15-05) are reused unchanged, now
  parameterized by the admin-focused member (`focusedScope.self.id`) instead of the caller's own
  `self.id`; both trigger a refetch of the table AND the currently focused member on success.

**Task 2 — Re-home account-linking (MNG-03) + phase-level full-suite gate**
- The admin branch's mount effect now fetches `UNLINKED_USERS_QUERY` alongside
  `FAMILY_MEMBERS_QUERY` in one `Promise.all`.
- `UnlinkedUserRow`, `UNLINKED_USERS_QUERY`, `LINK_USER_TO_MEMBER_MUTATION`, and its form-state
  constant were ported **verbatim** from `AdminLinkMembers.jsx`'s pre-redirect state (git history
  at commit `9082440`, before 15-05 reduced that page to a `<Navigate>` redirect) into
  `ManagePage.jsx`, admin-branch-only.
- Renders a "Link accounts" section: heading, the ported row list, or the empty-state text "No
  accounts are waiting to be linked." verbatim.
- "Create & link" wording is preserved on this specific path, distinct from `AddRelativeDialog`'s
  "Add member" (per UI-SPEC).
- Re-added the meaningful assertions originally in `AdminLinkMembers.test.jsx` (link-existing via
  Autocomplete, create-and-link, per-row error, empty state) into `ManagePage.test.jsx`, adapted
  to render inside the admin branch.
- Full frontend suite: **90/90 green**. Full backend suite: **280/280 green** — this is the
  phase's final gate before `/gsd:verify-work`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `<interfaces>` block's `familyMember(id)` query shape corrected to match 15-RESEARCH.md**
- **Found during:** Task 1, reading `read_first` sources before implementing `handleFocus`.
- **Issue:** The plan's `<interfaces>` block specified `mother { id } father { id }` for
  `FAMILY_MEMBER_FOCUS_QUERY` — apparently copy-pasted from `MY_EDITABLE_MEMBERS_QUERY`'s shape.
  That shallow shape works for the member branch because `myEditableMembers` returns an array
  where the parent's OWN full row (with `fullname`) is a separate top-level array entry; the
  `mother { id }` field there is only used to resolve an id-to-row link. `familyMember(id)`
  returns a single nested record with no equivalent flat array of full parent records — flattening
  `mother: { id }` as-is would produce a Parents-section card with no `fullname` to display.
  15-RESEARCH.md's "Admin table + focus query shape" section (the canonical source this task's
  `read_first` explicitly points to) already specifies the correct shape: `mother { id fullname }`
  / `father { id fullname }`.
- **Fix:** Implemented `FAMILY_MEMBER_FOCUS_QUERY` with `mother { id fullname }` /
  `father { id fullname }`, matching RESEARCH.md. A code comment at the constant's definition
  documents this deviation inline.
- **Files modified:** `frontend/src/pages/ManagePage.jsx`
- **Commit:** `54df4db`

None of the remaining behavior deviated from the plan — the redirect-only `/admin/link-members`
page and its rewritten test (both from 15-05) were left untouched, as the plan's `files_modified`
frontmatter specified only `ManagePage.jsx`/`ManagePage.test.jsx`.

### Auth Gates

None — no authentication flows were touched by this plan.

## Verification

- `npm test --workspace frontend -- src/pages/ManagePage.test.jsx` — 16/16 passing (7 pre-existing
  member-branch + route-gating tests, 9 new admin-branch tests: table/subtitle, focus-into-panel,
  D-06 bypass, delete confirm, and 4 account-linking tests: list render, empty state, link-existing,
  create-and-link, per-row error).
- `npm test --workspace frontend` (full suite) — 90/90 passing.
- `npm test --workspace backend` (full suite, phase-level sanity re-check) — 280/280 passing.

## Known Stubs

None.

## Threat Flags

None — every query/mutation this plan wires (`familyMembers`, `familyMember(id)`, `unlinkedUsers`,
`deleteMember`, `linkUserToMember`) is pre-existing, already `requireAdmin`-gated server-side, and
unchanged by this plan. No new network endpoints, auth paths, or schema changes were introduced.
The STRIDE register in this plan's `<threat_model>` (T-15-12/13/14) covers exactly the surface
touched.

## Self-Check: PASSED

- FOUND: frontend/src/pages/ManagePage.jsx
- FOUND: frontend/src/pages/ManagePage.test.jsx
- FOUND commit 54df4db (Task 1)
- FOUND commit e5a3879 (Task 2)
