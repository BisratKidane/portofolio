---
phase: 15-sibling-dedup-guard-manage-self-service-ui
plan: 02
subsystem: ui
tags: [react, mui, manage-page, presentational-components]

# Dependency graph
requires:
  - phase: 14-relationship-resolvers-permission-scoping-query-safety
    provides: "myEditableMembers scope shape (self/parents/spouses/children/siblings), editMember's D-06 field-lock check, sibling-derivation semantics"
provides:
  - "MemberCard.jsx — per-member presentational card with the D-06 read-only lock branch (self/admin bypass), D-02 derived-sibling Chip, and no fabricated Rewire affordance"
  - "RelationshipGroupedPanel.jsx — the shared You/Parents/Spouse/Children/Siblings grouped panel consumed by both the member and admin-focused /manage views"
affects: [15-03, 15-04, 15-05, 15-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Presentational-only components: no GraphQL calls inside MemberCard/RelationshipGroupedPanel — they only render server-supplied scope data (client never re-derives editable scope)"
    - "D-06 lock condition mirrored verbatim from familyMember.resolver.js's editMember check (`target.linkedUser.id !== user.id`), pinned by a component test"

key-files:
  created:
    - frontend/src/components/manage/MemberCard.jsx
    - frontend/src/components/manage/MemberCard.test.jsx
    - frontend/src/components/manage/RelationshipGroupedPanel.jsx
    - frontend/src/components/manage/RelationshipGroupedPanel.test.jsx
  modified: []

key-decisions:
  - "Add-relative buttons render as \"+ Add {relationship}\" (e.g. \"+ Add parent\") — reconciles the plan's <behavior>/<acceptance_criteria> literal \"+ Add ...\" wording with the UI-SPEC/<action> \"Add parent\" copy, since the rendered label contains the UI-SPEC phrase as a substring"
  - "onRewire omitted from MemberCard's destructured props per the plan's explicit interfaces note — no button is wired to it this phase (no backing mutation exists); a future plan can pass it without a prop-shape change since unused props are simply ignored by React"
  - "The combined \"Just you so far.\" empty state is an additional notice shown only when parents+spouses+children are all empty, not a replacement for the three sections — each of Parents/Spouse/Children/Siblings always renders its own heading and add button so the shared component's contract with AddRelativeDialog/ManagePage stays consistent regardless of scope emptiness"

patterns-established:
  - "Pattern 1: MemberCard's `locked` boolean is the single source of truth for both the missing Edit button and the caption text — computed once, not duplicated across JSX branches"
  - "Pattern 2: RelationshipGroupedPanel destructures `scope` into `{ self, parents, spouses, children, siblings }` and renders one `MemberRows` helper per section, passing `isSelf={row.id === self.id}` uniformly and `isDerived` only for the Siblings section"

requirements-completed: [MNG-01]

# Metrics
duration: 3min
completed: 2026-07-23
---

# Phase 15 Plan 02: MemberCard & RelationshipGroupedPanel Summary

**Presentational building blocks for `/manage`: MemberCard (D-06 locked/read-only branch, D-02 derived-sibling chip, admin bypass, no dead Rewire button) and RelationshipGroupedPanel (You/Parents/Spouse/Children/Siblings sections, one shared component for both the member and admin views)**

## Performance

- **Duration:** 3 min
- **Started:** 2026-07-23T18:34:00Z
- **Completed:** 2026-07-23T18:36:37Z
- **Tasks:** 2
- **Files modified:** 4 (all new)

## Accomplishments
- `MemberCard.jsx` renders the D-06 lock branch exactly (no Edit button + "Manages their own profile." caption) unless the viewer is an admin or the relative IS the acting user (isSelf bypass), with the lock condition pinned by a component test to the exact `target.linkedUser.id !== user.id` comparison `familyMember.resolver.js`'s `editMember` enforces server-side.
- `MemberCard.jsx` renders a "Derived" Chip for Siblings-section rows and never renders a "Rewire" affordance (no backing mutation this phase) — both verified by zero-match and match greps.
- `RelationshipGroupedPanel.jsx` renders all five D-01 sections (You/Parents/Spouse/Children/Siblings) with UI-SPEC-exact empty-state copy ("Just you so far.", "No siblings yet — they appear automatically once you and another child share a parent.") and the `onAddRelative('parent'|'spouse'|'child'|'sibling')` contract `AddRelativeDialog` (a later, parallel plan) will also use.
- Full frontend suite green: 50/50 tests across 11 files.

## Task Commits

Each task was committed atomically, TDD red→green:

1. **Task 1: MemberCard.jsx — D-06 read-only branch, D-02 derived chip, admin bypass**
   - `de70832` test(15-02): add failing test for MemberCard D-06/D-02 behavior
   - `9f089d3` feat(15-02): implement MemberCard D-06 lock, D-02 derived chip, admin bypass
2. **Task 2: RelationshipGroupedPanel.jsx — You/Parents/Spouse/Children/Siblings sections**
   - `87802fb` test(15-02): add failing test for RelationshipGroupedPanel sections
   - `2f9606f` feat(15-02): implement RelationshipGroupedPanel with You/Parents/Spouse/Children/Siblings sections

_No refactor commits were needed — both GREEN implementations passed on the first attempt with no follow-up cleanup required._

## Files Created/Modified
- `frontend/src/components/manage/MemberCard.jsx` - Per-member card: 42x42 Avatar/name, D-06 read-only branch, D-02 derived Chip, admin Edit/Remove bypass, no Rewire button
- `frontend/src/components/manage/MemberCard.test.jsx` - 9 RTL tests covering lock/self/admin/derived/callback behavior
- `frontend/src/components/manage/RelationshipGroupedPanel.jsx` - Shared grouped-panel: You/Parents/Spouse/Children/Siblings sections, empty states, add-relative callback wiring
- `frontend/src/components/manage/RelationshipGroupedPanel.test.jsx` - 7 RTL tests covering empty states, section rendering, and the onAddRelative contract

## Decisions Made
- Reconciled a wording inconsistency between the plan's `<action>` (quotes exact button copy "Add parent" per UI-SPEC) and its `<behavior>`/`<acceptance_criteria>` (both literally quote "+ Add parent" and assert "+ Add ..." buttons): rendered label is `"+ Add parent"` etc., which satisfies the acceptance-criteria test literally while still containing the UI-SPEC's "Add parent" copy as a substring.
- `onRewire` is not destructured in `MemberCard`'s function signature (plan's `<action>` instructs omitting it from the render path) — since React silently ignores props that aren't destructured, this doesn't break the documented "accept it as an unused prop" forward-compatibility note; no button in this component calls it.
- The "Just you so far." combined empty notice is additive, not a replacement — Parents/Spouse/Children/Siblings sections always render their own heading + add button even when scope is fully empty, so downstream plans (AddRelativeDialog wiring) can rely on all four add buttons always being present.

## Deviations from Plan

None - plan executed exactly as written, with one wording clarification (see Decisions Made) resolving an internal inconsistency between the plan's own `<action>` and `<behavior>`/`<acceptance_criteria>` sections — not a deviation from either, since the chosen copy satisfies both.

## Issues Encountered
- Initial `MemberCard.jsx` implementation included an inline comment mentioning "Rewire" wording, which caused the acceptance-criterion `grep -n "Rewire" ... ` (expected zero matches) to fail. Reworded the comment to avoid the literal string "Rewire" while preserving the same intent (T-15-05 mitigation note) — fixed before committing the GREEN implementation, so no extra commit was needed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `MemberCard` and `RelationshipGroupedPanel` establish the exact prop contracts (`MemberCard({ member, isAdmin, actingUserId, isSelf, isDerived, onEdit, onDelete })` and `RelationshipGroupedPanel({ scope, isAdmin, actingUserId, onAddRelative, onEdit, onDelete })`) that later plans in this phase (`AddRelativeDialog`'s relation-type contract, `ManagePage`'s wiring, and the admin-focused panel reuse) can build against with zero exploration.
- No blockers. The known, documented gap (no "Rewire" mutation exists yet for admin edge-rewiring) is flagged per 15-CONTEXT.md D-03/D-07 and intentionally not built as dead UI in this plan.

---
*Phase: 15-sibling-dedup-guard-manage-self-service-ui*
*Completed: 2026-07-23*

## Self-Check: PASSED

- FOUND: frontend/src/components/manage/MemberCard.jsx
- FOUND: frontend/src/components/manage/MemberCard.test.jsx
- FOUND: frontend/src/components/manage/RelationshipGroupedPanel.jsx
- FOUND: frontend/src/components/manage/RelationshipGroupedPanel.test.jsx
- FOUND: commit de70832 (test: MemberCard RED)
- FOUND: commit 9f089d3 (feat: MemberCard GREEN)
- FOUND: commit 87802fb (test: RelationshipGroupedPanel RED)
- FOUND: commit 2f9606f (feat: RelationshipGroupedPanel GREEN)
