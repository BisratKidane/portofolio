# Phase 15: Sibling Dedup Guard & /manage Self-Service UI - Context

**Gathered:** 2026-07-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the `/manage` page — the first surface where members act on their own family
data — plus the REL-06 duplicate-child guard on the backend.

**In scope:**
- A `/manage` page with a member-user view (scoped, relationship-grouped) and an admin
  view (whole-tree, searchable) that both drive the Phase 14 GraphQL mutations.
- Add/edit member forms wiring relationships (parent/spouse/child; sibling derived) via
  dropdowns that pick existing members — constrained to the actor's scope per Phase 14 D-02.
- Absorbing admin account-linking (currently `/admin/link-members`) into `/manage`.
- The REL-06 sibling/child duplicate-name guard in the service layer.
- Route gating so only linked members (scoped) and admins (full) reach `/manage`.

**Out of scope (belongs to other phases):**
- Deep pannable/zoomable tree visualization → Phase 17 (`/family`).
- Photo upload → Phase 16.
- New backend mutations — Phase 14 already shipped the full mutation/query surface this
  UI consumes (`myEditableMembers`, `addParent/addSpouse/addChild/addSibling`, `editMember`,
  `deleteMember`). This phase is UI + the one new dedup guard, not new relationship logic.
- Member→admin removal-request flow (deferred, noted in REQUIREMENTS PERM-03).

</domain>

<decisions>
## Implementation Decisions

### Scope presentation on /manage (MNG-01)

- **D-01 — Relationship-grouped layout for the member view:** The member-user's editable
  scope renders as labelled sections — **You**, **Parents**, **Spouse**, **Children**,
  **Siblings** — each with its own `+ Add {relationship}` action. Rejected a flat card list
  and a mini-tree diagram: grouping makes the scope boundary self-explanatory (the page
  shows *why* each person is editable) and gives each Phase 14 add-mutation a natural home.
  The mini-tree overlaps Phase 17 and was explicitly deferred.
- **D-02 — Siblings section is derived, labelled as such:** Siblings come from
  `myEditableMembers` (shared-parent derivation, Phase 14 D-03), shown with a "derived"
  affordance, never presented as a stored edge.

### Admin view (MNG-03)

- **D-03 — Searchable table → focus one member into the grouped panel:** The admin lands on
  a searchable, paginated table of all members (the whole tree can be hundreds of nodes).
  Selecting a member opens them in the **same** relationship-grouped panel the member-user
  sees, but with admin powers (rewire existing edges, delete, link account). One grouped
  component, two entry points (scoped list vs. table-focus). Rejected an unscoped flat
  grouped render (unusable at scale) and a fully separate admin screen (MNG-03 says "from
  the same page").

### Add-relative flow (MNG-02)

- **D-04 — Modal dialog, create-new default, in-scope picker secondary:** Clicking
  `+ Add {relationship}` opens a dialog whose primary path is entering a NEW person's fields
  (the overwhelmingly common case → one step). A secondary "or pick someone already in your
  family" control is offered where it applies, populated **only** with in-scope members
  (Phase 14 D-02 — the picker structurally cannot offer anything that would breach scope).
  Rejected an inline expanding form (page gets long with multiple sections open) and a
  two-step new-vs-existing chooser (extra click on the common case).
- **D-05 — Per-relationship form shape (maps to the Phase 14 mutations):**
  - **Add parent** → new person + a **mother/father role** selector (`addParent(role)`).
    No "other parent" picker.
  - **Add spouse** → new person; links via `addSpouse`.
  - **Add child** → new person + optional **"other parent"** picker (in-scope only) →
    `addChild(role, otherParentId?)`.
  - **Add sibling** → new person only; parents are **derived from the target**, no parent
    picker (`addSibling`). Surface Phase 14 D-04's "add a parent first" rejection as an
    inline message when the actor has no parent recorded.

### Edit + field-lock UX (MEM-04, PERM-02, Phase 14 D-06)

- **D-06 — Locked relatives render read-only with no edit affordance:** A relative who has
  their OWN linked user account (D-06 field-lock) shows as a card *without* an edit button,
  plus a small "manages their own profile" hint. The UI never presents an action the backend
  will reject — no dead-end forms. Rejected "editable form, error on submit" (guaranteed-fail
  dead end) and "disable locked fields" (D-06 locks the whole record, so that equals
  read-only with more work). The member always sees these relatives (they're in scope) and
  can always edit their own record (self is in the editable set).
- **D-07 — Members add-only; admins rewire/delete:** Carried from Phase 14 D-05. Member edit
  forms expose plain fields + add-edge actions only. Rewiring an existing edge and deleting a
  member are admin-only affordances, shown only in the admin-focused panel.

### Sibling/child dedup guard (REL-06)

- **D-08 — Service-layer hard block, applies to everyone:** Enforce the duplicate check in
  `backend/src/services/familyMember.service.js` on the `addChild` write path, so every
  caller — `addChild`, `addSibling` (which routes through `addChild`), admin attach, and any
  future caller — is covered by one function. Hard rejection (no admin override this phase)
  with an **actionable error naming the conflicting member** and its shared parent. Rejected a
  DB unique constraint (the "shares EITHER parent" / two-nullable-FK semantics aren't a simple
  column-tuple UNIQUE; would need a trigger/generated column — too heavy) and an admin-override
  path (extra flag + confirm step; an admin can edit after if a genuine same-name case arises).
- **D-09 — Comparison semantics:** Duplicate = another child sharing a **non-null `motherId`
  OR non-null `fatherId`** with the candidate, whose `firstname` matches **trimmed +
  case-folded**. Mirrors the either-parent sibling rule (Phase 14 D-03).
- **D-10 — Guard runs inside the insert transaction:** The check MUST execute in the same
  transaction as the `FamilyMember.create` it guards, so two concurrent adds cannot both pass
  the check and then both insert (TOCTOU). This intersects the still-open Phase 14 **WR-01**
  (`computeEditableScope`'s `{transaction}` option is accepted but never passed) — the dedup
  work is the natural place to start threading the shared transaction through, at least on the
  child-create path.
- **D-11 — "Creating OR linking" both fire the guard (REL-06 wording):** REL-06 covers
  creating *and linking* a child. Member adds are create-only (Phase 14 D-01), but the admin
  attach/rewire path must also run the guard — not only the create path.

### Route gating (MNG-04)

- **D-12 — Reuse the existing ProtectedRoute gate:** `/manage` sits behind `ProtectedRoute`,
  which already redirects unlinked non-admins to `/pending` (Phase 13 D-06:
  `requireFamilyAccess` = linked member OR admin). Linked members get the scoped view, admins
  the full view; unlinked users never reach it. No new gating primitive needed — the member
  vs. admin view split happens *inside* the page based on `user.role`.

### Claude's Discretion
- Exact MUI composition (Dialog vs. Drawer for the add form, table pagination size, empty-state
  copy) — follow existing `AdminLinkMembers.jsx` conventions.
- Whether the admin table and the scoped member list share a single route component with a
  role branch or split into two — planner's call, as long as they share the grouped panel.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase-boundary & requirements
- `.planning/ROADMAP.md` §"Phase 15" — goal, 4 success criteria, requirement IDs.
- `.planning/REQUIREMENTS.md` — REL-06, MNG-01, MNG-02, MNG-03, MNG-04 (all `Pending`).

### Locked upstream decisions this phase depends on
- `.planning/phases/14-relationship-resolvers-permission-scoping-query-safety/14-CONTEXT.md`
  — D-01/D-02 (create-only + in-scope-reference invariant, drives the add-form picker),
  D-03 (sibling = either shared parent), D-04 (add-sibling needs a parent first),
  D-05 (members add-only, no rewire/delete), D-06 (linked-account field lock → D-06 here).
- `.planning/phases/14-relationship-resolvers-permission-scoping-query-safety/14-REVIEW.md`
  — **WR-01** (unused `{transaction}` / permission-check TOCTOU) intersects dedup D-10;
  read before threading transactions. 12 warnings still OPEN.
- `.planning/phases/13-membership-gating-account-linking/13-CONTEXT.md` — D-03/D-04
  (admin linking UI + create-and-link, being re-homed into /manage), D-06 (`requireFamilyAccess`
  = linked-or-admin, basis for MNG-04 gating).

### Reusable code (see code_context)
- `frontend/src/pages/AdminLinkMembers.jsx` — Autocomplete + create-and-link + TextField
  form patterns to reuse and re-home.
- `frontend/src/components/ProtectedRoute.jsx` — the gate satisfying MNG-04.
- `backend/src/services/familyMember.service.js` — where the REL-06 guard lives.
- `backend/src/resolvers/familyMember.resolver.js` — the mutations the UI drives.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`AdminLinkMembers.jsx` (252 lines):** Already implements MUI `Autocomplete` for picking
  a member, `TextField`-based create form, and the create-and-link flow. The `/manage` add
  dialog (D-04) and admin account-linking (D-03) should reuse these directly rather than
  rebuild. This page becomes a redirect to `/manage`.
- **`ProtectedRoute.jsx`:** Already enforces linked-or-admin and redirects unlinked users to
  `/pending` — satisfies MNG-04 with no new primitive (D-12).
- **Phase 14 GraphQL surface:** `myEditableMembers`, `addParent`, `addSpouse`, `addChild`,
  `addSibling`, `editMember`, `deleteMember` all exist and are tested. This phase consumes
  them; it does not add relationship mutations.
- **`AuthContext` / `graphqlClient.js`:** Existing patterns for authed GraphQL calls and
  `user`/`role` access drive the member-vs-admin view branch.

### Established Patterns
- Frontend: PascalCase page components under `frontend/src/pages/`, colocated `*.test.jsx`
  (React Testing Library + jsdom), MUI + Emotion, `handle*` event handlers.
- Backend: service functions in `familyMember.service.js` accept optional `{ transaction }`;
  resolvers throw plain `Error` with user-facing messages; TDD red→green (project standard).

### Integration Points
- New `/manage` route added to `frontend/src/App.jsx` behind `ProtectedRoute`; old
  `/admin/link-members` route becomes `<Navigate to="/manage" replace />`.
- REL-06 guard hooks into the `addChild` write path in `familyMember.service.js`, inside the
  existing transaction (D-10), covering `addSibling` and admin attach transitively.

</code_context>

<specifics>
## Specific Ideas

- The member view should read as "here is my family and here's what I can do to it" — the
  grouped sections literally are the editable-scope boundary made visible.
- Dedup error must name the conflicting member and the shared parent, e.g. *"A child named
  'Sara' already exists under Almaz Kidane. Pick a different name or edit the existing member."*

</specifics>

<deferred>
## Deferred Ideas

- **Admin override for intentional duplicate-name children** (twins, cultural naming) — not
  this phase; hard block for now, admin can edit after. Revisit if it comes up in practice.
- **Deep tree visualization / pan-zoom** — Phase 17 (`/family`).
- **Member→admin removal-request flow** — deferred per REQUIREMENTS PERM-03 note.
- **Threading `{transaction}` through the *entire* permission/scope layer (full WR-01 fix)** —
  this phase only threads it on the child-create/dedup path (D-10); the broader
  `computeEditableScope` TOCTOU remains a Phase 14 gap-closure candidate.

None of these block Phase 15's four success criteria.

</deferred>

---

*Phase: 15-sibling-dedup-guard-manage-self-service-ui*
*Context gathered: 2026-07-23*
