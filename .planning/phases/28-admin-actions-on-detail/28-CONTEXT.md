# Phase 28: Admin Actions on /detail - Context

**Gathered:** 2026-08-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Make `/detail`'s admin actions real, reusing existing dialogs, mutations, and
guards end to end:

1. **Edit** — wire DetailPage's three no-op `onEdit={() => {}}` stubs (head,
   gen1, gen2 render sites) to open the existing `EditMemberDialog`. The
   `canEdit`-gated edit button already exists on `PersonCard` (Phase 25) — this
   phase only connects it.
2. **Add child / add spouse** — add a new admin-only control to `PersonCard`
   that opens the existing `AddRelativeDialog` with `relationType: 'child'` or
   `'spouse'`.
3. **Refresh in place** — after a successful add/edit, refresh the affected
   person (and its children/spouses) without a full page reload. Phase 27
   explicitly deferred mutation-driven cache invalidation to this phase.
4. **Backend enforcement (SC-3)** — prove server-side rejection of a non-admin
   edit/add mutation issued from this new surface, via an adversarial test. No
   new guard logic — the existing `requireFamilyAccess` + admin scope-bypass on
   `editMember`/`addChild`/`addSpouse` already enforce it.

**Out of scope (milestone-level, from PROJECT.md):** editing/adding from any
surface other than the reused existing dialogs; DB schema changes; new
mutations. This phase adds NO new backend mutations — it reuses `editMember`,
`addChild`, `addSpouse`.

</domain>

<decisions>
## Implementation Decisions

### Add-relative control (PERM-02)
- **D-01 (single "Add" menu):** The add affordance is **one always-visible icon
  button** (a `+` / overflow `⋮`) that opens a small menu with two items:
  **Add child** and **Add spouse**. Rejected: two separate always-visible
  buttons (would put three action controls on an already-busy card). Keeps the
  card visually calm and scales if more relation types are ever added. Exact
  icon glyph and menu-item wording are Claude's discretion.
- **D-02 (placement + visibility):** The Add menu sits **top-of-card beside the
  existing edit button** (which is absolutely positioned top-right at
  `PersonCard.jsx:104-112`). It is **always visible** (not hover-only), matching
  the edit button and the a11y direction (Phase 29) — no hover-reveal controls.
  Both controls are gated on `member.canEdit === true`, so non-admins see
  neither (SC-1/SC-2 negative case).
- **D-03 (dialog reuse is total):** "Add child" / "Add spouse" open the
  **unchanged** `AddRelativeDialog` with the appropriate `relationType`; "Edit"
  opens the **unchanged** `EditMemberDialog`. Mirror the `/manage` `AdminBranch`
  wiring pattern (`ManagePage.jsx:409-471`): dialog state + target held at the
  page level, dialogs mounted once, fed from state. Do NOT reuse ManagePage's
  refetch callbacks — they refetch `/manage`-specific queries `/detail` doesn't
  use (see D-04).

### Refresh in place (PERM-02) — resolves the Phase-27 deferral
- **D-04 (evict + refetch the affected id):** On a successful mutation, refresh
  is **targeted to the affected person**, not the whole view:
  - **Head** refreshes via the existing `loadPersonById(mainPerson.id)`.
  - **Descendants** (which live only in `useDescendantNav`'s per-id ref cache,
    `useDescendantNav.js:36`) refresh by **evicting that id from the cache and
    re-running the existing Phase-24 read** for that person (children + spouses +
    own fields, one bounded/N+1-free request). This requires adding an
    invalidate/refetch capability to `useDescendantNav` — Phase 27 built the
    cache "with a shape Phase 28 can invalidate per-id" (Phase 27 discretion
    note). Rejected: **optimistic merge** (risks drift from server-computed
    fields like derived/patronymic names + ordering; adds merge logic the
    codebase has nowhere else) and **refetch-whole-view** (throws away the
    Phase-27 session cache, more requests than needed).
- **D-05 (auto-expand to confirm add-child):** When an admin adds a child to a
  person whose children are **currently collapsed**, **auto-expand** that person
  after the refresh so the just-added child is immediately visible — closing the
  loop with no extra click. This expansion **respects the Phase-27 nav rules**
  (D-01 one-branch-at-a-time, D-03 forward-shift, the 3-generation cap): if the
  target is a grandchild with children, expanding it triggers the normal
  forward-shift rather than exceeding the cap. Rejected: only bumping the
  child-count chip (no direct confirmation the child landed).
- **D-06 (edit + add-spouse update in place too):** An **edit** re-renders the
  affected card with server truth (via the same evict+refetch / `loadPersonById`
  path). An **add-spouse** surfaces the new spouse beside the person after
  refresh (see D-08 for the "displayed spouse changes" consequence).

### Actionable cards (PERM-01, PERM-02, SPOUSE-01)
- **D-07 (spouse cards = edit only):** Spouse cards (rendered laterally as
  leaves, `isSpouse`, `PersonCard.jsx:58-72`) keep **only** their existing
  `canEdit`-gated edit button. The **Add menu appears on anchor cards only**
  (head, children, grandchildren). Adding a child to the couple is done from the
  **anchor** card — matching the model (children belong to a couple) and
  avoiding a redundant/confusing second add path. Concretely: the new
  add-menu prop is passed to non-spouse `PersonCardSingle` instances, not to the
  spouse leaf.
- **D-08 (add-spouse always available):** "Add spouse" stays available **even
  when a spouse is already displayed.** Truthful to the model (multiple spouses
  supported; the existing `addSpouse` mutation permits it). Accepted consequence:
  because `/detail` shows only the **last** spouse (Phase 25 D-12/D-14), after
  adding, the refresh shows the **new** last spouse and the previously-shown one
  drops from view — acceptable given the single-spouse display rule. Rejected:
  hiding/disabling "Add spouse" once a spouse exists (diverges from the model,
  blocks a legitimate admin action).

### Backend enforcement (PERM-03, SC-3)
- **D-09 (reuse guards, add adversarial test):** No new guard code. The
  existing `requireFamilyAccess` + admin scope-bypass on `editMember`
  (`familyMember.resolver.js:245-268`), `addSpouse` (`:116-141`), and `addChild`
  (`:149-189`) already reject non-admin edit/add. Phase 28 adds an **adversarial
  integration test** exercising one of these mutations **as a non-admin from the
  `/detail`-relevant path** and asserting server-side rejection — proving the
  action is enforced server-side, not merely hidden in the UI.

### Claude's Discretion
- **Add-child co-parent (`inScopeMembers`):** `AddRelativeDialog` has an optional
  co-parent picker fed by `inScopeMembers`; `/detail` has no ready in-scope list.
  Claude picks the pragmatic approach — pass `[]` (picker shows no options; the
  backend accepts any id for an admin and defaults are fine), or default the
  co-parent to the person's displayed spouse. Not user-blocking.
- Exact add-menu icon glyph and menu-item labels/copy.
- The precise shape of the `useDescendantNav` invalidate/refetch API (method
  name, per-id vs batch) — keep `PersonCard` presentational (Phase 25) and the
  page/hook owning fetch + state.
- Field-completeness fix for edit (see Integration Points): whether to extend
  the `/detail` queries with the full editable field set or fetch a full member
  fresh when the edit dialog opens — an implementation tradeoff for the planner.
- Loading/feedback affordance during a mutation refresh (spinner on the card vs
  reuse of the existing dialog's in-flight state); keep consistent with existing
  `/detail` idioms.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` § "Phase 28: Admin Actions on /detail" — goal + the 3
  success criteria (authoritative for what must be TRUE).
- `.planning/REQUIREMENTS.md` — **PERM-01, PERM-02, PERM-03** (this phase) plus
  the v4.0 milestone goal.
- `.planning/PROJECT.md` § "Current Milestone: v4.0" — `/detail` admin-actions
  bullet + the explicit out-of-scope list (reuse dialogs only, no schema change,
  backend-enforced).

### Prior-phase decisions this phase builds on
- `.planning/phases/24-backend-read-layer-for-detail/24-CONTEXT.md` — **D-07/D-08**
  (`canEdit: Boolean!` per-person, admin-only) and the reused read queries.
- `.planning/phases/25-reusable-personcard/25-CONTEXT.md` — PersonCard is
  presentational; already has the `canEdit`-gated edit button + `onEdit` prop;
  spouse pairing (D-12/D-14, single last spouse, leaf-only).
- `.planning/phases/27-descendant-navigation-performance/27-CONTEXT.md` —
  **D-01** (one-branch-at-a-time), **D-03/D-04** (forward-shift + collapse
  walk-back), **D-08/D-09** (lazy per-generation fetch + per-id session cache),
  and the **Claude's Discretion note deferring cache invalidation to Phase 28**.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/components/manage/EditMemberDialog.jsx` — props `{ open, member,
  onClose, onSaved }`; fires `editMember(id, fields)`; calls `onSaved()` then
  `onClose()` on success. Reuse unchanged.
- `frontend/src/components/manage/AddRelativeDialog.jsx` — props include
  `{ open, relationType, targetId, targetName, targetGender, targetFirstname,
  targetLastname, targetGeez*, inScopeMembers, onClose, onCreated }`. CHILD vs
  SPOUSE is the `relationType` string (`'child'` → `ADD_CHILD_MUTATION`,
  `'spouse'` → `ADD_SPOUSE_MUTATION`). Reuse unchanged.
- `frontend/src/pages/ManagePage.jsx` `AdminBranch` (`:281-525`) — the wiring
  pattern to mirror: `dialogState` + `editTarget` at page level, dialogs mounted
  once, `onAddRelative(relationType)` / `onEdit(member)` triggers. (Do NOT reuse
  its `/manage`-specific refetch callbacks.)
- `frontend/src/hooks/useDescendantNav.js` — per-id ref cache (`:36`), entry
  `{ self, children }`; `EXPAND_CHILDREN_QUERY` already fetches `canEdit` + full
  spouse/child fields per descendant. Needs a new invalidate/refetch method.

### Established Patterns
- **Page-owns-fetch, card-is-presentational** (Phase 25/27): PersonCard renders;
  DetailPage/useDescendantNav own all fetch + state. New add-menu is a prop-driven
  callback (e.g. `onAddRelative(relationType, member)`), not fetch inside the card.
- **`canEdit`-gating**: every action control keys off `member.canEdit === true`
  (resolved server-side as `Boolean(user?.role === 'ADMIN')`), so no client-only
  authorization.
- **Guarded mutations** (`familyMember.resolver.js`): `requireFamilyAccess` +
  admin scope-bypass on `editMember`/`addChild`/`addSpouse` — already enforce
  PERM-03.

### Integration Points
- **DetailPage `onEdit` stubs** at `DetailPage.jsx:134, 151, 160` — currently
  `() => {}`; wire to open `EditMemberDialog` via page-level `editTarget` state.
- **New PersonCard add-menu** — add a prop + control to `PersonCardSingle`
  (non-spouse only, D-07), gated on `canEdit`; DetailPage passes the handler at
  the same three render sites (plus the couple/anchor cards).
- **Field-completeness gap (edit):** `/detail`'s queries (`FAMILY_MEMBER_QUERY`,
  `EXPAND_CHILDREN_QUERY`) fetch only `id, fullname, geezFullname, gender,
  isAlive, photoUrl, canEdit, spouses, children` — NOT the editable field set
  `EditMemberDialog` seeds from (firstname/lastname/email/birthdate/phone/
  address/geez*). Opening the dialog with a bare `/detail` member would show a
  near-empty form. Planner must extend the queries with the editable fields OR
  fetch a full member fresh on edit-open (D — Claude's discretion tradeoff).
- **Refresh path (D-04):** add per-id invalidate/refetch to `useDescendantNav`;
  head uses existing `loadPersonById`.

</code_context>

<specifics>
## Specific Ideas

- The card action layout: edit button and the new Add menu both live at the top
  of the card, always visible (see ASCII in the discussion) — a calm, single Add
  entry point rather than a row of relation-specific buttons.
- Mirror `/manage`'s admin dialog wiring (state + single dialog mount), but with
  `/detail`'s own targeted refresh instead of `/manage`'s query refetches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (The Phase-27-deferred cache
invalidation is resolved here in D-04, not deferred further.)

</deferred>

---

*Phase: 28-admin-actions-on-detail*
*Context gathered: 2026-08-04*
