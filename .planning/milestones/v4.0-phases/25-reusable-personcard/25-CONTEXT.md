# Phase 25: Reusable PersonCard - Context

**Gathered:** 2026-08-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the single reusable **`PersonCard`** React component that the `/detail`
page (later phases) uses for the family head, children, and grandchildren.
The card renders: avatar, Latin first/last name, Ge'ez name (when present),
gender (with a non-color cue), a relationship-to-main-person role label, a
Living/Deceased status, a child-count + expand control, an admin-only edit
affordance, and each person's spouse surfaced alongside them via a paired
card + dashed connector.

This phase is the **component only** (plus its spouse-rendering). Out of this
phase and belonging to later phases: the `/detail` page and its states
(Phase 26), the search bar (Phase 26), the responsive generation grid and the
actual expand/collapse + 3-generation forward-shift mechanics (Phase 27), and
the wiring of admin add/edit dialogs (Phase 28). PersonCard therefore exposes
**props/callbacks** (`onExpand`, `onEdit`, `expanded`, spouse/role inputs) that
those later phases drive — it does not own the page, the data-fetching, or the
navigation state.

Requirements covered: **CARD-01, CARD-02, CARD-03, CARD-04, SPOUSE-01**.

</domain>

<decisions>
## Implementation Decisions

### Card visual style
- **D-01:** PersonCard is a **fresh vertical `/detail` card** (avatar prominent,
  name + fields stacked below), NOT a reuse of `/family`'s fixed 252×120
  `MemberNode` nor `/manage`'s horizontal `MemberCard` row. It reuses the shared
  *conventions* (gender tint, dashed spouse connector, `MemberAvatarImage`,
  `getGeezDisplay`) but its own roomier geometry — `/detail` shows only a few
  cards at a time with space to breathe, unlike the dense zoomable canvas.
- **D-02:** Gender is signaled on the card with the **same convention as
  `/family`**: a gender-colored **border + soft background tint** on the whole
  card (Male ≈ `#3b82f6`, Female ≈ `#ec4899`, Other ≈ slate). This is the
  color half of the CARD-03 cue and MUST be paired with the non-color cue in D-07.
- **D-03:** **One card size/design for all three roles** (head, children,
  grandchildren) per CARD-02. Width is **fluid** (flexes to fill its grid
  column, ≤3/row desktop → 1 on mobile in Phase 27); height grows to fit
  content. No separate "head" size variant, no fixed-pixel box. Any extra
  emphasis on the main person is achieved later via placement/scale, not a
  different card component.

### Fields & layout
- **D-04:** The card shows: **avatar**, **Latin `fullname`**, **Ge'ez name**
  (via `getGeezDisplay`, only when present), a **relationship-to-main-person
  role label**, and a **Living/Deceased status** (from `isAlive`, e.g. a chip
  like `MemberDetailPanel`'s). Every field renders **only when it has a value**
  (CARD-01 "no empty fields/labels").
- **D-05:** "Relationship info (when relevant)" (CARD-01) = a small
  **role label derived from the card's position in the current view** —
  e.g. `Head` / `Child` / `Grandchild`. It is NOT the mother's-name line and
  NOT the marital status. The role value is supplied to the card as a prop by
  the page/nav layer (Phase 26/27); PersonCard just renders it when provided.
- **D-06 (scope trim — flag for verifier):** **No birth year on the card.**
  The user deliberately chose a lean card showing only Living/Deceased status,
  omitting birth year, address, and phone even when present. This is a
  conscious narrowing of CARD-01's "birth info" — record it as intentional so
  the planner/verifier do NOT treat the missing birth year as a defect.
  "Death info" is satisfied by the Deceased state of the status chip.

### Card controls (CARD-04, PERM-01 affordance)
- **D-07 (child count + expand):** A **child-count + expand affordance runs
  along the card's bottom edge**, shown **only when the person has ≥1 child**
  (never `0 children`, never a disabled/empty control — CARD-04). Count copy is
  singular/plural: `1 child` / `N children`. The control communicates
  expanded-vs-collapsed state visibly (chevron direction/rotation). The child
  count derives from `children` array length (Phase 24 D-05 — no `childCount`
  field). PersonCard exposes `onExpand`/`expanded`; the actual expand behavior
  is Phase 27.
- **D-08 (admin edit):** An **admin edit icon button sits top-right**, rendered
  **only when `member.canEdit === true`** (Phase 24's per-person `canEdit`
  field). It calls an `onEdit(member)` prop. **Wiring `onEdit` to the existing
  `EditMemberDialog` is Phase 28 (PERM-01)** — Phase 25 renders the gated
  affordance and exposes the callback only. Non-admin viewers never see it.
  Server-side enforcement (PERM-03) is unchanged and authoritative regardless
  of this UI gate.

### Gender non-color cue (CARD-03 — hard requirement + A11Y)
- **D-09:** Gender gets a **visible non-color cue via the avatar's ring
  SHAPE** — border style around the avatar encodes gender (e.g. solid = Male,
  dashed = Female, dotted = Other) — **always present, works over a real photo
  or the fallback**. This is the always-on cue that satisfies CARD-03/WCAG for
  BOTH photo and no-photo cards (color-alone was rejected as non-compliant).
- **D-10:** The existing **gendered `MemberFallbackAvatar`** (distinct
  male/female illustrations, neutral figure for Other) additionally serves as a
  visible gender cue for **no-photo** cards. It's decorative (`aria-hidden`), so
  it complements — not replaces — D-09's ring and the aria-label in D-11.
- **D-11:** Gender is also exposed to assistive tech via the card's
  **`aria-label`** (and `data-gender` for tests), mirroring `MemberNode`, so
  gender is never conveyed by color alone for screen-reader users either.

### Spouse presentation (SPOUSE-01)
- **D-12:** A person's spouse renders as a **second full PersonCard beside the
  person, joined by the same dashed spouse connector `/family` uses** (reuse the
  established partnered/dashed-connector convention). Spouses are **lateral** and
  **never count toward the 3-generation cap**.
- **D-13:** The **spouse card carries NO child-count/expand control.** In this
  family model a couple's children hang off the descendant (blood-line) person,
  so the shared children must not be offered for expansion twice. The spouse
  still renders as a full card (avatar/name/gender/status) — likely via an
  `isSpouse`/`canExpand={false}` prop on the same component. (Spouse editability
  under PERM is a Phase 28 concern.)
- **D-14:** **At most ONE spouse is shown — the last/most recent entry** in the
  `spouses` array. Per the user, two concurrent spouses are not possible in this
  family; if the backend ever returns multiple, PersonCard displays only the
  last one. (This intentionally scopes SPOUSE-01's "spouse(s)" to a single
  displayed spouse — record as a deliberate decision, not a gap.)

### Claude's Discretion
- Exact ring-style mapping to genders (solid/dashed/dotted vs another shape
  set), ring thickness, and how the ring composes with `MemberAvatarImage`.
- Precise avatar shape (circle vs rounded-square) and card padding/spacing.
- Exact dashed-connector rendering technique off-canvas (CSS pseudo-element /
  small flex spacer with a dashed rule) — reuse `/family`'s visual language.
- Chevron/expand iconography and the status-chip styling (may mirror
  `MemberDetailPanel`'s `Living`/`Deceased` chip).
- Which `spouses`-array index counts as "last" if ordering is ambiguous —
  default to the final array element; confirm ordering during implementation.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` § "Phase 25: Reusable PersonCard" — phase goal.
- `.planning/REQUIREMENTS.md` — **CARD-01, CARD-02, CARD-03, CARD-04, SPOUSE-01**
  (this phase) and the milestone goal / v4.0 target features for `PersonCard`.
- `.planning/PROJECT.md` § "Current Milestone: v4.0" — the `Reusable PersonCard`
  target-feature bullet (authoritative field list + behaviors).

### Backend contract this card consumes (Phase 24)
- `.planning/phases/24-backend-read-layer-for-detail/24-CONTEXT.md` — the read
  layer + `canEdit` field (D-07/D-08 there), and the "no `childCount` field —
  derive from `children { id }` length" decision (D-05 there) this card relies on.
- `backend/src/schemas/familyMember.schema.js` — the `FamilyMember` GraphQL type:
  fields available to the card (`fullname`, `geezFullname`, `gender`, `isAlive`,
  `birthdate`, `phone`, `address`, `photoUrl`, `spouses`, `children`, `canEdit`).

### Reusable frontend components & conventions to mirror
- `frontend/src/components/family/MemberNode.jsx` — `/family` card: gender
  tint/border convention (`genderMeta`, `MALE_TINT`/`FEMALE_TINT`), avatar-fill
  pattern, `data-gender` + aria-label non-color-cue precedent, expand-badge idea.
- `frontend/src/components/manage/MemberCard.jsx` — `/manage` row: name + Ge'ez
  stack, `getGeezDisplay` usage, edit-button gating precedent.
- `frontend/src/components/family/MemberDetailPanel.jsx` — `formatBirth` and the
  `Living`/`Deceased` status chip pattern (status field for D-04).
- `frontend/src/components/manage/MemberAvatarImage.jsx` — authenticated
  photo/blob avatar with fallback; reuse for the card avatar (supports
  `variant`, `fill`).
- `frontend/src/components/MemberFallbackAvatar.jsx` — gendered no-photo avatar
  (D-10); note it is `aria-hidden` / decorative.
- `frontend/src/utils/displayName.js` — `getGeezDisplay(member)` (Ge'ez display
  derivation; use verbatim, never re-derive).
- `frontend/src/theme.js` — `colors` (tint/line/ink/primary) for card styling.
- The `/family` **dashed spouse-connector** convention (spouse edge / partnered
  rendering in the family tree canvas) — reference for D-12's connector visual
  language. See `frontend/src/components/family/` (`FamilyTreeCanvas.jsx`,
  `familyTree.assembly.js`/`familyTree.layout.js` for the spouse-edge styling).

### Testing conventions
- `.planning/codebase/TESTING.md` — frontend test setup (Vitest + RTL + jsdom).
- Sibling `*.test.jsx` files (e.g. `MemberNode.test.jsx`, `MemberCard.test.jsx`)
  — the component-test pattern PersonCard's tests should follow.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`MemberAvatarImage`** (`manage/MemberAvatarImage.jsx`): the card's avatar —
  handles authenticated photo fetch + `MemberFallbackAvatar` fallback; supports
  `variant` and `fill`. The gender ring (D-09) wraps/overlays this.
- **`getGeezDisplay(member)`** (`utils/displayName.js`): returns
  `{ text, lang: 'ti' } | null` from `member.geezFullname` — drop the Ge'ez name
  line only when non-null (D-04).
- **`MemberFallbackAvatar`** (`components/MemberFallbackAvatar.jsx`): gendered
  illustrations for no-photo cards (D-10).
- **`genderMeta` / tint constants** (`family/MemberNode.jsx`): the exact
  gender→color mapping to reuse for D-02's border+tint (extract/share rather
  than re-hardcode if practical).
- **Status chip + `formatBirth`** (`family/MemberDetailPanel.jsx`): the
  `Living`/`Deceased` chip for D-04 (birth-year formatter is present but NOT
  used per D-06).

### Established Patterns
- **Props-only, page-agnostic component:** like `MemberNode` (driven by a `data`
  bag of member + callbacks), PersonCard takes `member`, a role label, spouse
  input, `expanded`, and `onExpand`/`onEdit` callbacks — no data-fetching or
  routing inside the card (that's Phases 26–28).
- **Non-color gender cue precedent:** `MemberNode` exposes gender via
  `data-gender` + aria-label + color; CARD-03 additionally requires a *visible*
  cue, satisfied here by the avatar ring shape (D-09) — a deliberate step beyond
  `MemberNode`.
- **Child count from array length:** Phase 24 chose no `childCount` field;
  derive `member.children.length` for the count + expand-visibility (D-07).
- **Component tests colocated:** `Component.jsx` + `Component.test.jsx`
  (Vitest + RTL). PersonCard ships with `PersonCard.test.jsx`.

### Integration Points
- **`canEdit`** field (Phase 24) gates the edit affordance (D-08); `onEdit`
  callback is wired to `EditMemberDialog` in Phase 28.
- **Grid/nav (Phase 27)** supplies fluid width, the role label (D-05), the
  `expanded` state, and drives `onExpand`. PersonCard must lay out cleanly at
  ≤3/row → 1/row without a fixed size (D-03).
- **Spouse pairing (D-12/D-13):** the page/nav passes the person's single last
  spouse (D-14) to render as a paired, non-expandable card + dashed connector.

</code_context>

<specifics>
## Specific Ideas

- Keep `/detail` and `/family` visually agreeing: same gender color language and
  the same dashed spouse-connector idiom, adapted to a flowing grid instead of a
  canvas.
- Lean card by intent: avatar + names + role + Living/Deceased is enough for
  browsing; richer detail lives in the (existing) detail/edit surfaces.
- The gender cue must be genuinely visible (ring shape), not aria-only — CARD-03
  and the milestone's accessibility gate (A11Y-01) both require it.

</specifics>

<deferred>
## Deferred Ideas

- **Birth year / address / phone on the card** — intentionally omitted for a
  lean card (D-06). Could be added to a future richer card variant if desired.
- **Multiple concurrent spouses** — not modeled in this family (D-14); a true
  multi-spouse layout would be a future genealogy enhancement (already a v4.0
  "Future Requirement": fuller genealogy relationships).
- **Larger emphasized "head" card variant** — considered and rejected for D-03
  (one size, emphasis via placement). Revisit only if the page design needs it.
- **Wiring the edit/add dialogs** — Phase 28 (PERM-01/02); PersonCard only
  exposes the gated affordance + `onEdit` callback here.

None of these are in-scope for Phase 25.

</deferred>

---

*Phase: 25-reusable-personcard*
*Context gathered: 2026-08-03*
