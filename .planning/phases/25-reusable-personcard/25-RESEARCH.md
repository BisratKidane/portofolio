# Phase 25: Reusable PersonCard - Research

**Researched:** 2026-08-03
**Domain:** React/MUI presentational component (frontend-only), colocated Vitest+RTL testing
**Confidence:** HIGH

## Summary

`PersonCard` is a pure, props-only MUI 6 component with zero new dependencies — every
building block it needs (`MemberAvatarImage`, `MemberFallbackAvatar`, `getGeezDisplay`,
`colors`, Vitest, RTL) already exists in the repo and is installed. The main engineering
work is **extraction, not creation**: the gender→color mapping (`genderMeta`/`MALE_TINT`/
`FEMALE_TINT`) is currently a private, unexported implementation detail of `MemberNode.jsx`
and must be pulled into a shared module before `PersonCard` can reuse it without
re-hardcoding hex values (CONTEXT.md D-02 explicitly asks for this). The gendered avatar
RING (D-09) is new UI not present anywhere in the codebase today — it composes cleanly as a
wrapping `Box` with a `border-style`/`borderRadius` sized ~4-8px larger than
`MemberAvatarImage`'s own box, since `MemberAvatarImage` already renders correctly at 100%
of any sized container. The dashed spouse connector (D-12) is currently drawn by
`@xyflow/react`'s `<Handle>`/edge-path system inside a canvas — Phase 25 needs a
CSS-only re-implementation (flex row + a pseudo-element or small dashed-border spacer
between two `PersonCard`s), since there is no canvas in the flowing `/detail` layout.

All identity/status fields the card needs already exist on the `FamilyMember` GraphQL type
(`fullname`, `geezFullname`, `gender`, `isAlive`, `photoUrl`, `children`, `spouses`,
`canEdit`) — confirmed in `backend/src/schemas/familyMember.schema.js` and Phase 24's
completed read layer (`canEdit` resolver at `familyMember.resolver.js:353`). No backend
changes are needed this phase.

**Primary recommendation:** Build `PersonCard` as a single presentational component in
`frontend/src/components/person/PersonCard.jsx` (new folder, since this is neither a
`/family` nor a `/manage` component — see Architectural Responsibility Map). Extract
`genderMeta`/`MALE_TINT`/`FEMALE_TINT` into a new shared module
(`frontend/src/utils/genderTheme.js`) that both `MemberNode.jsx` and `PersonCard.jsx`
import, updating `MemberNode.jsx`'s import only (a pure refactor — its rendered output and
tests must not change). Ship `PersonCard.test.jsx` colocated, following the exact
`MemberNode.test.jsx`/`MemberCard.test.jsx` structure (top-level `BASE_MEMBER` fixture +
`renderCard(overrides)` helper + `vi.mock('../../api/photoClient.js', ...)`).

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** PersonCard is a fresh vertical `/detail` card (avatar prominent, name + fields
  stacked below), NOT a reuse of `/family`'s fixed 252×120 `MemberNode` nor `/manage`'s
  horizontal `MemberCard` row. It reuses the shared conventions (gender tint, dashed spouse
  connector, `MemberAvatarImage`, `getGeezDisplay`) but its own roomier geometry.
- **D-02:** Gender is signaled with the same convention as `/family`: a gender-colored
  border + soft background tint on the whole card (Male ≈ `#3b82f6`, Female ≈ `#ec4899`,
  Other ≈ slate). This is the color half of CARD-03 and MUST be paired with the non-color
  cue in D-07/D-09.
- **D-03:** One card size/design for all three roles (head, children, grandchildren) per
  CARD-02. Width is fluid; height grows to fit content. No separate "head" size variant.
- **D-04:** The card shows: avatar, Latin `fullname`, Ge'ez name (via `getGeezDisplay`, only
  when present), a relationship-to-main-person role label, and a Living/Deceased status
  (from `isAlive`). Every field renders only when it has a value.
- **D-05:** The role label ("Head"/"Child"/"Grandchild") is derived from the card's
  position in the current view, supplied as a `role` prop by the page/nav layer (Phase
  26/27). It is NOT the mother's-name line and NOT marital status.
- **D-06 (scope trim — do NOT flag as defect):** No birth year on the card. Deliberately
  omits birth year, address, and phone even when present. "Death info" is satisfied by the
  Deceased state of the status chip.
- **D-07:** A child-count + expand affordance runs along the card's bottom edge, shown only
  when the person has ≥1 child (never `0 children`, never a disabled/empty control). Count
  copy is singular/plural: `1 child` / `N children`. The control communicates
  expanded-vs-collapsed state visibly (chevron direction/rotation). Count derives from
  `children` array length (no `childCount` field). PersonCard exposes `onExpand`/`expanded`;
  actual expand behavior is Phase 27.
- **D-08:** An admin edit icon button sits top-right, rendered only when
  `member.canEdit === true`. Calls `onEdit(member)`. Wiring to `EditMemberDialog` is Phase
  28 — Phase 25 renders the gated affordance and exposes the callback only.
- **D-09:** Gender gets a visible non-color cue via the avatar's ring SHAPE — border style
  around the avatar encodes gender (e.g. solid = Male, dashed = Female, dotted = Other) —
  always present, works over a real photo or the fallback.
- **D-10:** The existing gendered `MemberFallbackAvatar` additionally serves as a visible
  gender cue for no-photo cards. It's decorative (`aria-hidden`), complementing D-09's ring
  and D-11's aria-label.
- **D-11:** Gender is also exposed via the card's `aria-label` (and `data-gender` for
  tests), mirroring `MemberNode`.
- **D-12:** A person's spouse renders as a second full PersonCard beside the person, joined
  by the same dashed spouse connector `/family` uses. Spouses are lateral and never count
  toward the 3-generation cap.
- **D-13:** The spouse card carries NO child-count/expand control (likely via
  `isSpouse`/`canExpand={false}` prop on the same component).
- **D-14:** At most ONE spouse is shown — the last/most recent entry in the `spouses`
  array.

### Claude's Discretion

- Exact ring-style mapping to genders (solid/dashed/dotted vs another shape set), ring
  thickness, and how the ring composes with `MemberAvatarImage`.
- Precise avatar shape (circle vs rounded-square) and card padding/spacing.
- Exact dashed-connector rendering technique off-canvas (CSS pseudo-element / small flex
  spacer with a dashed rule) — reuse `/family`'s visual language.
- Chevron/expand iconography and the status-chip styling (may mirror
  `MemberDetailPanel`'s `Living`/`Deceased` chip).
- Which `spouses`-array index counts as "last" if ordering is ambiguous — default to the
  final array element; confirm ordering during implementation.

### Deferred Ideas (OUT OF SCOPE)

- Birth year / address / phone on the card — intentionally omitted (D-06).
- Multiple concurrent spouses — not modeled in this family (D-14).
- Larger emphasized "head" card variant — rejected for D-03.
- Wiring the edit/add dialogs — Phase 28 (PERM-01/02); PersonCard only exposes the gated
  affordance + `onEdit` callback here.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CARD-01 | Person card renders avatar, Latin name, Ge'ez name (when present), gender, birth/death info, relationship info, other supported info — only fields with a value | Field list confirmed against `FamilyMember` schema; D-06 scopes birth/address/phone out intentionally. See "Component Anatomy" and "Field-by-field source map" below. |
| CARD-02 | Same reusable component used for head, children, and grandchildren | D-03: one size, `role` prop varies the label only. See Architecture Patterns. |
| CARD-03 | Gender shown via existing conventions + non-color cue, never color alone, graceful unknown-gender degradation | D-02 (color) + D-09 (ring shape) + D-11 (aria-label/data-gender). See "Gender Cue Composition" pattern below. |
| CARD-04 | Child count shown only when ≥1 child, singular/plural copy, expand control gated the same way | D-07. `children.length` derivation confirmed (Phase 24 D-05, no `childCount` field). See Code Examples. |
| SPOUSE-01 | Spouse(s) surfaced alongside each displayed person via existing partnered/connector convention; lateral, non-generation-counting | D-12/D-13/D-14. See "Dashed Spouse Connector Adaptation" pattern below. |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Person field rendering (name, Ge'ez, gender, status) | Frontend / Client (React component) | — | Pure presentational logic, no data-fetching; consumes props only |
| Gender color/ring/aria cue | Frontend / Client | — | Visual + accessibility concern entirely inside the component |
| Avatar photo fetch + fallback | Frontend / Client (`MemberAvatarImage`) | API / Backend (photo route, already built) | `PersonCard` composes the existing avatar component; the authenticated photo fetch itself is out of this phase's scope (already implemented) |
| Spouse pairing + connector rendering | Frontend / Client | — | Purely a layout/CSS concern this phase; data (`spouses[]`) is already on the `member` prop passed in by the caller |
| Expand/edit callback wiring | Frontend / Client (exposes callbacks only) | API / Backend (Phase 28 for edit persistence, Phase 27 for expand data-fetch) | Phase 25 renders gated affordances and no-ops the callbacks; actual behavior lives in later phases per CONTEXT.md phase boundary |
| `canEdit` authorization signal | API / Backend (Phase 24, already resolved) | Frontend / Client (gates UI only) | Server is authoritative (PERM-03); PersonCard's gate is UI-only and must never be treated as enforcement |
| Data-fetching / GraphQL queries for card content | API / Backend + page/nav layer (Phase 26/27) | — | Explicitly out of scope — PersonCard takes `member` as a prop, never fetches |

## Standard Stack

### Core

| Library | Version (installed) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.3.1 | Component runtime | Already the app's UI library |
| MUI (`@mui/material`) | 6.5.0 | `Paper`/`Box`/`Typography`/`Chip`/`IconButton` primitives | House convention; every sibling card (`MemberNode`, `MemberCard`, `MemberDetailPanel`) is built from these same primitives |
| `@mui/icons-material` | 6.5.0 | `ExpandMoreRounded` (expand chevron), `EditRounded` (edit button) | `[VERIFIED: npm registry]` — confirmed present at `node_modules/@mui/icons-material/ExpandMoreRounded.js` and `EditRounded.js` (root-hoisted via npm workspaces) |
| Emotion (`@emotion/react`, `@emotion/styled`) | 11.14.0 | `sx` prop CSS-in-JS engine underlying MUI | Already the app's styling layer |

### Supporting (reused, not new)

| Library / Module | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `frontend/src/components/manage/MemberAvatarImage.jsx` | n/a (in-repo) | Authenticated photo fetch + gendered fallback avatar, `variant`/`fill` props | Always — the card's avatar zone |
| `frontend/src/components/MemberFallbackAvatar.jsx` | n/a (in-repo) | Gendered no-photo illustration (`aria-hidden`) | Rendered internally by `MemberAvatarImage` when `photoUrl` is absent — no direct import needed by `PersonCard` |
| `frontend/src/utils/displayName.js` (`getGeezDisplay`) | n/a (in-repo) | Ge'ez name derivation, returns `{ text, lang: 'ti' } \| null` | Always — never re-derive the Ge'ez precedence rule |
| `frontend/src/theme.js` (`colors`) | n/a (in-repo) | `colors.primary`, `colors.slate`, `colors.paper`, `colors.line`, `colors.ink` | Non-gender theming (focus ring, control accent, card background) |

### Testing

| Library | Version (installed) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vitest | 4.1.10 | Test runner (`vitest run`, `frontend/vitest.config.js`) | Already configured project-wide; `[VERIFIED: npm registry]` confirmed at `node_modules/vitest/package.json` |
| `@testing-library/react` | 16.3.2 | `render`, `screen` | Already used by every sibling `*.test.jsx` |
| `@testing-library/user-event` | 14.6.1 | Simulated click/keyboard interaction (expand/edit button tests) | Same |
| `@testing-library/jest-dom` (via `test/setup.js`) | 6.9.1 | `toBeInTheDocument`, `toHaveAttribute`, `toHaveAccessibleName` matchers | Same |
| jsdom | 26.0.0 | DOM environment (`vitest.config.js` `environment: 'jsdom'`) | Same |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| CSS border-style ring composed as a wrapper `Box` | A dedicated MUI `Badge`/`Avatar` `overlap` prop | `Badge` is built for small corner indicators, not a full perimeter ring around a variable-size avatar — a plain `Box` with `border` is simpler and matches D-09's literal ask ("border style around the avatar") |
| Flex row + dashed CSS border spacer for the spouse connector | Reusing `@xyflow/react` outside its canvas | `@xyflow/react` requires a `ReactFlowProvider` + viewport/pan-zoom context; forcing it into a static flowing grid for a single decorative line is architecturally wrong-tiered and adds a heavy runtime dependency to a leaf component that should stay presentational |
| No new package | — | No installation needed this phase — every dependency is already in `package.json`/installed |

**Installation:**
```bash
# No new packages required — all dependencies already installed.
```

**Version verification:** All versions above were read directly from installed
`node_modules/*/package.json` files (`npm view` was not needed since the packages are
already present and resolved in this monorepo's root-hoisted `node_modules`), which is
stronger than a registry lookup for "is this the version actually running." Confirmed:
`@mui/material` 6.5.0, `@mui/icons-material` 6.5.0 (root `node_modules`), `vitest` 4.1.10,
`@testing-library/react` 16.3.2 (also root-hoisted).

## Package Legitimacy Audit

**Not applicable this phase.** No new external packages are being installed — `PersonCard`
is built entirely from dependencies already present in `package.json` (MUI, Emotion,
Vitest, RTL) and in-repo modules. Skipping the slopcheck/registry-verification gate is
correct here per the protocol ("Every phase that installs external packages must run..." —
this phase installs none).

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  Phase 26/27 page/nav layer (NOT this phase)                    │
│  - fetches FamilyMember via GraphQL (familyHead/familyMember)    │
│  - computes `role` ("Head"/"Child"/"Grandchild") from position   │
│  - tracks `expanded` state, supplies onExpand/onEdit callbacks   │
└───────────────────────────┬───────────────────────────────────────┘
                             │ props: member, role, spouse, isSpouse,
                             │        expanded, onExpand, onEdit
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  PersonCard (THIS PHASE)                                         │
│                                                                   │
│  member ──► field presence checks ──► conditional render        │
│                │                                                 │
│                ├─► gender ──► genderTheme.js (shared, extracted) │
│                │              ──► border + tint (D-02)          │
│                │              ──► aria-label + data-gender (D-11)│
│                │                                                 │
│                ├─► photoUrl/gender ──► ring Box (D-09)          │
│                │                       wraps MemberAvatarImage   │
│                │                       (existing component)      │
│                │                                                 │
│                ├─► geezFullname ──► getGeezDisplay() ──► Ge'ez  │
│                │                    line (existing util)         │
│                │                                                 │
│                ├─► isAlive ──► Living/Deceased Chip (D-04)      │
│                │                                                 │
│                ├─► canEdit ──► top-right edit IconButton (D-08) │
│                │               onClick ──► onEdit(member)        │
│                │                                                 │
│                └─► children.length ≥ 1 && !isSpouse             │
│                    ──► footer expand control (D-07/D-13)         │
│                        onClick ──► onExpand(member)              │
│                                                                   │
│  spouse prop present? ──► render 2nd <PersonCard isSpouse />    │
│                            + dashed connector spacer (D-12)      │
└───────────────────────────┬───────────────────────────────────────┘
                             │ onExpand(member) / onEdit(member)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 27 (expand→refetch children) / Phase 28 (EditMemberDialog)│
│  — no-op / logged this phase, real wiring later                 │
└─────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
frontend/src/
├── components/
│   ├── person/                       # NEW folder — not /family, not /manage
│   │   ├── PersonCard.jsx            # the component this phase ships
│   │   └── PersonCard.test.jsx       # colocated Vitest+RTL tests
│   ├── family/
│   │   └── MemberNode.jsx            # MODIFIED: import genderMeta from utils/genderTheme.js
│   ├── manage/
│   │   ├── MemberAvatarImage.jsx     # unchanged, reused
│   │   └── MemberCard.jsx            # unchanged, reference only
│   └── MemberFallbackAvatar.jsx      # unchanged, reused (transitively via MemberAvatarImage)
└── utils/
    ├── genderTheme.js                # NEW — extracted from MemberNode.jsx
    └── displayName.js                # unchanged, reused
```

**Why `components/person/`, not `components/family/` or `components/manage/`:** D-01
explicitly rejects reusing either existing card; this is a third, page-agnostic surface for
`/detail` (Phase 26). Placing it in `family/` or `manage/` would misleadingly suggest it's
owned by one of those pages' conventions when it is deliberately neither.

### Pattern 1: Shared Gender Theme Extraction (supports D-02)

**What:** Move `genderMeta`, `MALE_TINT`, `FEMALE_TINT` out of `MemberNode.jsx` (currently
unexported, file-local) into a new shared module.

**When to use:** Any component that needs to render the app's gender→color convention.
`MemberNode.jsx` and `PersonCard.jsx` both import from here after this phase.

**Example:**
```javascript
// Source: extracted verbatim from frontend/src/components/family/MemberNode.jsx:24-31
// NEW FILE: frontend/src/utils/genderTheme.js
import { colors } from '../theme.js';

export const MALE_TINT = '#3b82f6';
export const FEMALE_TINT = '#ec4899';

export function genderMeta(gender) {
  if (gender === 'Male') return { label: 'Male', tint: MALE_TINT };
  if (gender === 'Female') return { label: 'Female', tint: FEMALE_TINT };
  return { label: 'Other', tint: colors.slate };
}
```
```javascript
// MemberNode.jsx — replace the in-file definitions (lines 24-31) with:
import { genderMeta } from '../../utils/genderTheme.js';
// (delete the local MALE_TINT/FEMALE_TINT/genderMeta declarations)
```

**Regression guard:** `MemberNode.test.jsx` already asserts `data-gender`/`aria-label`
output for Male/Female/Other (lines 164-185) — this refactor must keep all of those
assertions green with zero test-file changes, proving the extraction is behavior-preserving.

### Pattern 2: Gender Ring Composition Over `MemberAvatarImage` (supports D-09/D-10)

**What:** `MemberAvatarImage` already fills 100% of a sized container (`fill` prop) or a
fixed `size` box. Wrap it in a `Box` whose own `border` (not `MemberAvatarImage`'s) encodes
gender by style, sized slightly larger than the avatar so the ring reads as a distinct
perimeter rather than the avatar's own edge.

**When to use:** Avatar zone of `PersonCard` (works identically whether `MemberAvatarImage`
renders a real photo, a `Skeleton` (loading), or `MemberFallbackAvatar` (no photo) — the
ring is a sibling-level wrapper, never touches `MemberAvatarImage`'s internals).

**Example:**
```jsx
// Pattern derived from MemberAvatarImage.jsx's `fill` container contract
// (frontend/src/components/manage/MemberAvatarImage.jsx:12-13: "The container
// must have a definite height") + genderTheme.js (Pattern 1).
const RING_STYLE = { Male: 'solid', Female: 'dashed', Other: 'dotted' };

function GenderRing({ gender, tint, size = 96, children }) {
  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: `3px ${RING_STYLE[gender] ?? RING_STYLE.Other} ${tint}`,
        padding: '3px',   // gap between ring and avatar so the style (dashed/dotted) is legible
        boxSizing: 'border-box'
      }}
    >
      <Box sx={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden' }}>
        {children}
      </Box>
    </Box>
  );
}

// Usage inside PersonCard:
<GenderRing gender={genderLabel} tint={genderTint}>
  <MemberAvatarImage member={member} variant="circular" fill />
</GenderRing>
```
**Why this composes safely:** `MemberAvatarImage`'s `fill` mode only requires "the container
must have a definite height" (its own doc comment) — the inner `Box` here provides exactly
that (`100%`/`100%` of the ring's padded interior), so no internal layout or fallback logic
inside `MemberAvatarImage`/`MemberFallbackAvatar` needs to change.

### Pattern 3: Dashed Spouse Connector Off-Canvas (supports D-12)

**What:** `/family`'s dashed connector is a `@xyflow/react` `straight` edge with
`strokeDasharray: '4 3'` and `stroke: colors.primary`, drawn on an SVG canvas
(`FamilyTreeCanvas.jsx:341`). `/detail` has no canvas — the flowing-grid equivalent is a
horizontal flex row (person card + connector spacer + spouse card) using a CSS
border-style, not an SVG path.

**When to use:** Whenever `spouse` prop is present and `isSpouse` is false (the connector
sits between the anchor person and their spouse, never doubled).

**Example:**
```jsx
// CSS-only reinterpretation of FamilyTreeCanvas.jsx's spouse edge styling
// (stroke: colors.primary, strokeDasharray: '4 3') for a flex layout, not SVG.
<Box sx={{ display: 'flex', alignItems: 'center', gap: 0 }}>
  <PersonCard member={member} role={role} canEdit={member.canEdit} /* ...expand props */ />
  {spouse && (
    <>
      <Box
        aria-hidden="true"
        sx={{
          width: 32,               // xl spacing token (UI-SPEC.md)
          alignSelf: 'center',
          borderTop: `2px dashed ${colors.primary}`
        }}
      />
      <PersonCard member={spouse} isSpouse />
    </>
  )}
</Box>
```
**Responsive note:** On mobile (1/row per Phase 27's grid), this flex row should wrap to a
vertical stack; the connector then becomes a short vertical dashed rule
(`borderLeft` instead of `borderTop`) — flag this responsive variant for Phase 27
(the grid/nav phase), since Phase 25 only needs to prove the connector renders in the
default flowing case.

### Pattern 4: Colocated Component Test (Vitest + RTL) — mirrors `MemberCard.test.jsx`

**What:** Every sibling card test file follows this exact shape: import the component +
`vi`, `describe`/`it`/`expect` from `vitest`, `render`/`screen` from RTL,
`vi.mock('../../api/photoClient.js', ...)` (needed transitively because `PersonCard` renders
`MemberAvatarImage`, which imports `fetchMemberPhotoBlob`), a top-level `BASE_MEMBER`
fixture, and a `renderCard(overrides)` helper that spreads default props.

**When to use:** `PersonCard.test.jsx`.

**Example:**
```javascript
// Source: pattern extracted verbatim from
// frontend/src/components/manage/MemberCard.test.jsx:1-27
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PersonCard from './PersonCard.jsx';

vi.mock('../../api/photoClient.js', () => ({
  fetchMemberPhotoBlob: vi.fn().mockRejectedValue(new Error('not needed in this test'))
}));

const BASE_MEMBER = {
  id: '1',
  fullname: 'Ada Lovelace',
  gender: 'Female',
  isAlive: true,
  geezFullname: null,
  photoUrl: null,
  children: [],
  spouses: [],
  canEdit: false
};

function renderCard(overrides = {}) {
  const props = {
    member: BASE_MEMBER,
    role: 'Head',
    expanded: false,
    onExpand: vi.fn(),
    onEdit: vi.fn(),
    ...overrides
  };
  const utils = render(<PersonCard {...props} />);
  return { ...props, ...utils };
}

describe('PersonCard', () => {
  it('renders the full name', () => {
    renderCard();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });
  // ... see "Validation Architecture" below for the full assertion list
});
```

### Anti-Patterns to Avoid

- **Re-deriving the gender→color map inline in `PersonCard.jsx`:** CONTEXT.md D-02
  explicitly calls this out — extract, don't re-hardcode. A second hardcoded copy of
  `#3b82f6`/`#ec4899` is exactly the drift risk the shared module prevents.
- **Re-deriving Ge'ez precedence logic:** always call `getGeezDisplay(member)`; never
  inline `member.geezFullname?.trim()` checks (v3.0 Phase 21 already centralized this for
  the same drift-prevention reason cited in `STATE.md`).
- **Rendering `0 children` or a disabled expand icon:** D-07/CARD-04 forbid this outright —
  the entire footer control zone must be conditionally omitted, not conditionally disabled.
- **Treating `canEdit` as authorization:** the UI gate is cosmetic; the server's
  `canEdit`/`editMember` resolver check (Phase 24) is the only real enforcement. Never skip
  rendering the gate correctly on the theory that "the server checks anyway."
- **Importing `@xyflow/react` into `PersonCard`:** the canvas/edge system is architecturally
  scoped to `/family`; pulling it into a flowing-grid leaf component for one dashed line
  would invert the dependency direction and drag in a heavy provider requirement (see
  Alternatives Considered).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Ge'ez name display + lang tagging | A new "does this member have a Ge'ez name" check | `getGeezDisplay(member)` (`utils/displayName.js`) | Centralizes the precedence rule (Phase 21); a second implementation risks silent drift already flagged as a known project risk in `STATE.md` |
| Authenticated photo fetch + skeleton/fallback state machine | A new avatar component | `MemberAvatarImage` (`variant`/`fill` props) | Already handles blob-URL fetch, revoke-on-unmount, loading skeleton, and silent-fallback-on-error; re-implementing loses all of that for free |
| Gendered "no photo" illustration | A new SVG/icon set | `MemberFallbackAvatar` (rendered internally by `MemberAvatarImage`) | Already ships Male/Female illustrations + a neutral SVG fallback, `aria-hidden` correctly |
| Singular/plural count copy | Inline ternary duplicated per call site | A tiny local helper inside `PersonCard.jsx`, e.g. `` `${n} ${n === 1 ? 'child' : 'children'}` `` | Trivial enough not to need a shared util, but MUST exist as a single function inside the component, not inlined at multiple JSX call sites, to avoid a copy-paste pluralization bug |

**Key insight:** This phase's biggest risk isn't missing library functionality — it's
*re-implementing conventions that already exist elsewhere in this codebase* slightly
differently (a second gender-color map, a second Ge'ez-precedence check). The planner
should treat "did I import the shared helper?" as a stronger correctness signal than "does
this render the right pixels?".

## Common Pitfalls

### Pitfall 1: Breaking `MemberNode.jsx`'s existing tests during gender-theme extraction

**What goes wrong:** Extracting `genderMeta`/`MALE_TINT`/`FEMALE_TINT` into
`utils/genderTheme.js` and updating `MemberNode.jsx`'s import accidentally changes an
export shape or introduces a circular import with `theme.js`.

**Why it happens:** `genderMeta` currently reads `colors.slate` from `../../theme.js`
(relative to `family/MemberNode.jsx`); the new shared file at `utils/genderTheme.js` needs
a different relative path (`../theme.js`) to the same `theme.js`.

**How to avoid:** After extraction, run the full `MemberNode.test.jsx` suite unchanged — it
already asserts `data-gender`/`aria-label` for Male/Female/Other (lines 164-185) — zero
test file edits should be needed if the extraction is truly behavior-preserving.

**Warning signs:** Any change required inside `MemberNode.test.jsx` during this phase is a
signal the extraction altered behavior, not just location.

### Pitfall 2: Gender ring "always present" contract breaking for `gender: undefined`

**What goes wrong:** CARD-03 requires the layout to degrade gracefully for
unknown/undefined gender. If the ring style lookup (`RING_STYLE[gender]`) returns
`undefined` for an unexpected gender value, the `border` CSS shorthand becomes invalid
(`3px undefined #64748b`) and silently fails to render any border at all — breaking the
"always present" guarantee.

**Why it happens:** The GraphQL `Gender` enum only allows `Male | Female | Other`, but
defensive component code should not assume the prop is always one of exactly these three
strings (e.g. a stale cached value, or a test fixture typo).

**How to avoid:** Always fall back through `genderMeta()` (Pattern 1) first, which already
normalizes any non-Male/non-Female value to `{ label: 'Other', tint: colors.slate }` — then
key the ring-style lookup off `genderMeta`'s normalized `label`, never off the raw
`member.gender` value directly.

**Warning signs:** A test with `gender: undefined` or `gender: 'Unknown'` should still show
a visible (dotted, slate) ring — if the border disappears entirely, this pitfall has been
hit.

### Pitfall 3: Female Ge'ez-name-line contrast borderline on AA (flagged in UI-SPEC.md)

**What goes wrong:** UI-SPEC.md explicitly flags that `#ec4899` (female tint) on white
background at 18px/700 weight is borderline for WCAG AA — this affects the Ge'ez name
*text* color (which is tinted per the `/family` convention), not the border/ring, which is
decorative and not subject to text-contrast rules.

**Why it happens:** The same hex value is reused for both the border (fine — decorative,
no contrast requirement) and the Ge'ez name text (subject to WCAG 1.4.3 text contrast).

**How to avoid:** This phase should implement per UI-SPEC.md's stated mitigation path: keep
the lighter tint for the border/fill, and only darken the *text*-color usage if Phase 29's
formal AA check fails. Do not preemptively change the border/tint value — that would
desync the card from `/family`'s established color language for no confirmed reason. Flag
this as an open item for Phase 29, not something to "fix" speculatively in Phase 25.

**Warning signs:** If the planner asks "should we darken `#ec4899` everywhere," the answer
per UI-SPEC.md is no — only the text-line usage is even a candidate, and only if Phase 29
confirms an actual AA failure.

### Pitfall 4: Rendering a spouse's own spouse recursively

**What goes wrong:** If `PersonCard` naively renders `spouse.spouses[0]` when given a
spouse member, it could recurse into rendering the spouse's spouse (which, in a
symmetric `spouses[]` array, is the original person again) — creating an infinite loop or
duplicate cards.

**Why it happens:** The `spouses` array on `FamilyMember` is bidirectional/symmetric by
design (each side lists the other) — the same shape that
`familyTree.assembly.js`'s `seenSpousePairs` dedup logic (lines 239-251) has to guard
against for edge generation.

**How to avoid:** `isSpouse` (D-13) must gate not just "hide the expand control" but also
"never read/render this card's own `spouse` prop" — the spouse card is always a leaf in the
pairing, never a new branch point. The page/nav layer (Phase 26/27) is responsible for only
ever passing a `spouse` prop to a non-spouse `PersonCard`; `PersonCard` itself should treat
`isSpouse === true` as "ignore any spouse-lookup entirely," as defense in depth.

**Warning signs:** A test rendering a spouse pair where each member's `spouses` array
contains the other should produce exactly 2 `PersonCard` DOM roots, never 3+.

## Code Examples

### Field-by-field source map (for CARD-01 "only fields with a value")

```javascript
// All derivations live inside PersonCard.jsx — this table documents the
// exact source expression per field, so the planner can write one
// conditional-render clause per row.

// Latin name  — always present (fullname: String! is non-null in schema)
member.fullname

// Ge'ez name — only when present
const geez = getGeezDisplay(member); // { text, lang: 'ti' } | null
{geez && <Typography lang={geez.lang}>{geez.text}</Typography>}

// Gender — always resolved (Gender enum is non-null), never omitted
const { label: genderLabel, tint: genderTint } = genderMeta(member.gender);

// Status chip — isAlive: Boolean! is non-null, chip always renders
const isAlive = member.isAlive !== false; // matches MemberDetailPanel.jsx:63 convention
<Chip label={isAlive ? 'Living' : 'Deceased'} color={isAlive ? 'success' : 'default'} />

// Role label — only when the `role` prop is supplied (page/nav layer decision, D-05)
{role && <Typography>{role}</Typography>}

// Child count + expand — only when NOT isSpouse AND children.length >= 1 (D-07/D-13)
const childCount = member.children?.length ?? 0;
{!isSpouse && childCount >= 1 && (
  <ExpandControl count={childCount} expanded={expanded} onClick={() => onExpand(member)} />
)}

// Edit affordance — only when canEdit === true (D-08); canEdit is resolved server-side
{member.canEdit === true && (
  <IconButton aria-label={`Edit ${member.fullname}`} onClick={() => onEdit(member)}>
    <EditRoundedIcon />
  </IconButton>
)}
```

### Singular/plural child-count copy (D-07/CARD-04)

```javascript
// Source: house convention inferred from UI-SPEC.md Copywriting Contract
// ("1 child (singular) / {N} children (plural)")
function childCountLabel(count) {
  return count === 1 ? '1 child' : `${count} children`;
}

// Accessible name flips per UI-SPEC.md States table:
function expandAccessibleName(expanded, fullname) {
  return expanded ? `Hide children of ${fullname}` : `Show children of ${fullname}`;
}
```

### Spouse selection (D-14 — last entry)

```javascript
// Called by the page/nav layer (Phase 26/27) when constructing the `spouse` prop --
// documented here since PersonCard's contract assumes at most one spouse is ever passed.
function selectDisplayedSpouse(member) {
  const spouses = member.spouses || [];
  return spouses.length > 0 ? spouses[spouses.length - 1] : null;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Spouse rendered via `@xyflow/react` `Handle`s + a `straight` dashed SVG edge on a pan/zoom canvas | CSS flex row + dashed `border` spacer (this phase) | Phase 25 (2026-08) | `/detail` has no canvas context, so the SVG-edge technique cannot be reused directly — this is a deliberate reinterpretation, not a regression |
| Gender color map defined per-component (`MemberNode.jsx` only had it) | Shared `utils/genderTheme.js`, imported by both `MemberNode.jsx` and `PersonCard.jsx` | Phase 25 (2026-08) | Prevents the two cards' gender colors from silently drifting apart over time |

**Deprecated/outdated:** None — this is additive; no existing component's public behavior
changes except the internal (non-breaking) refactor of `MemberNode.jsx`'s gender-color
import source.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Ring border-style mapping (solid=Male/dashed=Female/dotted=Other) is a reasonable default, per CONTEXT.md's own example phrasing ("e.g. solid = Male, dashed = Female, dotted = Other") — but CONTEXT.md explicitly leaves the exact mapping to Claude's Discretion | Pattern 2 / Architecture Patterns | Low — CONTEXT.md itself flags this as discretionary; if the UI checker/human prefers a different shape mapping, it's a same-phase cosmetic swap, not a structural rework |
| A2 | New component folder `components/person/` (vs. e.g. flat `components/PersonCard.jsx`) is the right home | Recommended Project Structure | Low — purely organizational; easy to move before the planner locks task file paths, but should be confirmed since it's a new top-level folder pattern not seen elsewhere (existing folders are `family/`, `manage/`, `dashboard/`) |
| A3 | Ring thickness of 3px + 3px padding gap (6px total added diameter) satisfies UI-SPEC.md's stated "2-3px" ring guidance while keeping the dashed/dotted style visually legible at typical avatar sizes (~64-96px) | Pattern 2 | Low — a purely visual tuning value; if too thin, the dashed/dotted distinction may not read clearly at small avatar sizes, correctable in review without a structural change |

**If this table is empty:** N/A — see rows above. All three assumptions are low-risk,
cosmetic/organizational choices explicitly left to discretion by CONTEXT.md, not
compliance-sensitive or hard-to-reverse decisions.

## Open Questions

1. **Exact avatar/card pixel sizing (diameter, card min/max width) for the fluid D-03
   layout**
   - What we know: UI-SPEC.md gives a spacing scale (8px unit) and typography sizes, and
     states the card is fluid-width/height-to-content with no fixed pixel box.
   - What's unclear: No exact avatar diameter or card min-width is specified anywhere (by
     design — D-03 defers "size variant" concerns and UI-SPEC.md leaves "precise avatar
     shape... and card padding/spacing" to Claude's Discretion).
   - Recommendation: Planner should pick concrete values during implementation (e.g. 88px
     or 96px avatar) and treat them as adjustable CSS constants, not hardcoded magic numbers
     scattered through JSX — this keeps Phase 27's grid integration free to tune spacing
     without touching `PersonCard.jsx`'s internals.

2. **Whether `PersonCard` needs a `data-testid` convention beyond `data-gender`**
   - What we know: `MemberNode.jsx` uses `data-testid={`member-node-${member.id}`}` for
     canvas-level node lookup (needed because xyflow wraps nodes); `MemberCard.jsx` has no
     such testid and relies on `screen.getByText`/`getByRole` queries instead.
   - What's unclear: Since `PersonCard` renders in a flowing grid (not a canvas), it likely
     doesn't need a canvas-specific testid, but Phase 26/27's page-level tests (rendering
     multiple `PersonCard`s in a grid) may want a stable `data-testid` to disambiguate
     duplicate names (e.g. two people both named "John").
   - Recommendation: Add `data-testid={`person-card-${member.id}`}` proactively (cheap,
     matches `MemberNode`'s precedent, and de-risks Phase 26/27's grid-level tests) even
     though Phase 25's own colocated tests may not strictly need it.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Vitest runner | ✓ | (per `.nvmrc`, 18.x pinned; root `package.json` declares `24.x` for frontend — pre-existing repo inconsistency, not introduced by this phase) | — |
| `@mui/material` | Component primitives | ✓ | 6.5.0 | — |
| `@mui/icons-material` | `ExpandMoreRounded`, `EditRounded` | ✓ | 6.5.0 | — |
| Vitest | Test runner | ✓ | 4.1.10 | — |
| `@testing-library/react` + `user-event` + `jest-dom` | Component tests | ✓ | 16.3.2 / 14.6.1 / 6.9.1 | — |
| `@xyflow/react` | NOT required by this phase (canvas-only, `/family`) | ✓ (already installed for other phases) | 12.11.2 | N/A — deliberately not imported into `PersonCard` |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None — everything required is already installed.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 + `@testing-library/react` 16.3.2 + jsdom 26.0.0 |
| Config file | `frontend/vitest.config.js` (environment: jsdom, setupFiles: `./test/setup.js`) |
| Quick run command | `npx vitest run src/components/person/PersonCard.test.jsx --workspace frontend` (or `cd frontend && npx vitest run src/components/person/PersonCard.test.jsx`) |
| Full suite command | `npm test --workspace frontend` (runs `vitest run` — currently 310/310 green per STATE.md) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CARD-01 | Renders fullname, Ge'ez name (when present), gender cue, status chip, role label — each omitted when absent | component | `npx vitest run src/components/person/PersonCard.test.jsx -t "field"` | ❌ Wave 0 (new file) |
| CARD-02 | Same component renders correctly regardless of `role` prop value (Head/Child/Grandchild) — no branching by role beyond the label text | component | `npx vitest run src/components/person/PersonCard.test.jsx -t "role"` | ❌ Wave 0 |
| CARD-03 | `data-gender` attribute + `aria-label` include gender for Male/Female/Other/undefined; ring is visually present (border style asserted via `toHaveStyle`) for all four cases | component | `npx vitest run src/components/person/PersonCard.test.jsx -t "gender"` | ❌ Wave 0 |
| CARD-04 | Expand control + count text render only when `children.length >= 1`; singular `1 child` vs plural `N children`; hidden entirely at 0; chevron/aria-name flips with `expanded` | component | `npx vitest run src/components/person/PersonCard.test.jsx -t "expand"` | ❌ Wave 0 |
| SPOUSE-01 | `spouse` prop renders a second `PersonCard` with `isSpouse`; spouse card has no expand control even if it has children; dashed connector element present between the two | component | `npx vitest run src/components/person/PersonCard.test.jsx -t "spouse"` | ❌ Wave 0 |
| D-08 (canEdit gate) | Edit `IconButton` renders only when `member.canEdit === true`; calls `onEdit(member)` on click | component | `npx vitest run src/components/person/PersonCard.test.jsx -t "edit"` | ❌ Wave 0 |
| Regression: gender-theme extraction | `MemberNode.jsx`'s existing gender assertions (lines 164-185) remain green after importing from the new shared `utils/genderTheme.js` | component (existing) | `npx vitest run src/components/family/MemberNode.test.jsx` | ✅ (existing file, zero edits expected) |

### Sampling Rate

- **Per task commit:** `npx vitest run src/components/person/PersonCard.test.jsx` (and
  `src/components/family/MemberNode.test.jsx` if the gender-theme extraction task touches
  `MemberNode.jsx` in the same commit).
- **Per wave merge:** `npm test --workspace frontend` (full 310+ test suite).
- **Phase gate:** Full suite green before `/gsd:verify-work` — matches this project's
  established convention (every prior phase's SUMMARY.md reports an "N/N frontend tests
  green" gate).

### Wave 0 Gaps

- [ ] `frontend/src/components/person/PersonCard.jsx` — the component itself (no existing
      file to extend)
- [ ] `frontend/src/components/person/PersonCard.test.jsx` — colocated tests (no existing
      file)
- [ ] `frontend/src/utils/genderTheme.js` — new shared module (extracted from
      `MemberNode.jsx`)
- [ ] No new test framework/config needed — `vitest.config.js` and `test/setup.js` already
      cover any new `*.test.jsx` file under `frontend/src/**` by glob convention (Vitest's
      default `include` pattern picks up any `*.test.jsx` regardless of folder).

## Security Domain

> `security_enforcement` is not explicitly set to `false` in `.planning/config.json`, so
> this section is included per protocol, scoped honestly to what this phase actually
> touches (a presentational component with no new data access).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Not touched — `PersonCard` receives an already-resolved `member` prop; no auth logic in this component |
| V3 Session Management | No | Not touched |
| V4 Access Control | Partially — UI-gate only | `member.canEdit === true` gates the edit button's *visibility*, but this is explicitly a cosmetic affordance, not enforcement (D-08). The authoritative check is the backend's `canEdit` field resolver (Phase 24, `familyMember.resolver.js:353`, `Boolean(user?.role === 'ADMIN')`) plus the `editMember` mutation's own server-side guard — both already shipped, both out of this phase's scope. Nothing in this phase should be described or tested as "the security boundary" — it is UI polish sitting in front of an existing, separately-tested server boundary. |
| V5 Input Validation | No | `PersonCard` renders read-only display data; it accepts no user input this phase (no forms, no text fields) |
| V6 Cryptography | No | Not touched |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| UI-only authorization mistaken for real enforcement (a non-admin user could, in principle, force-render the edit button via devtools and attempt the mutation anyway) | Elevation of Privilege | Already mitigated server-side — Phase 24's `canEdit` resolver + the pre-existing `editMember` mutation's admin guard (unchanged by this phase). This phase's only obligation is to NOT claim the UI gate is sufficient on its own — documented explicitly in Anti-Patterns above. |
| XSS via unsanitized member name/Ge'ez text rendered as raw HTML | Tampering / Information Disclosure | Not a risk here — all text (`fullname`, `geezFullname`, role label) is rendered via React `Typography` children (auto-escaped JSX text nodes), never via `dangerouslySetInnerHTML`. No new pattern needed; this simply must not regress. |

## Sources

### Primary (HIGH confidence — direct in-repo file reads this session)

- `frontend/src/components/family/MemberNode.jsx` — gender convention, avatar-fill pattern,
  aria-label/data-gender precedent, `<Handle>` spouse-edge wiring (read in full)
- `frontend/src/components/manage/MemberCard.jsx` — Ge'ez name stack, edit-button gating,
  colocated test structure precedent (read in full)
- `frontend/src/components/family/MemberDetailPanel.jsx` — Living/Deceased chip pattern,
  `formatBirth` (confirmed NOT used per D-06) (read in full)
- `frontend/src/components/manage/MemberAvatarImage.jsx` — `variant`/`fill` contract,
  fetch/skeleton/fallback state machine (read in full)
- `frontend/src/components/MemberFallbackAvatar.jsx` — gendered illustration, `aria-hidden`
  contract (read in full)
- `frontend/src/utils/displayName.js` — `getGeezDisplay` full implementation (read in full)
- `frontend/src/theme.js` — `colors` object, full palette (read in full)
- `frontend/src/components/family/FamilyTreeCanvas.jsx` — dashed spouse-edge styling
  (`strokeDasharray: '4 3'`, `stroke: colors.primary`) (read in full)
- `frontend/src/components/family/familyTree.assembly.js` /
  `familyTree.layout.js` — spouse-pair dedup (`seenSpousePairs`) and layout spacing
  constants (`SPOUSE_GAP`, `COUPLE_W`) (grepped + read relevant sections)
- `backend/src/schemas/familyMember.schema.js` — full `FamilyMember` type + `canEdit` field
  (read in full)
- `.planning/phases/24-backend-read-layer-for-detail/24-PATTERNS.md` — confirms `canEdit`
  resolver shape and completed status (read in full)
- `frontend/src/components/family/MemberNode.test.jsx`,
  `frontend/src/components/manage/MemberCard.test.jsx` — colocated test pattern (read in
  full)
- `frontend/test/setup.js`, `frontend/vitest.config.js` — test environment config (read in
  full)
- `frontend/package.json`, root `node_modules/@mui/icons-material/package.json`,
  `node_modules/vitest/package.json`, `node_modules/@testing-library/react/package.json` —
  installed version numbers (read directly, `[VERIFIED: npm registry]` — package existence
  and version confirmed via installed `node_modules`, not merely `npm view`)
- `node_modules/@mui/icons-material/ExpandMoreRounded.js`,
  `node_modules/@mui/icons-material/EditRounded.js` — confirmed present on disk (bash `ls`)

### Secondary (MEDIUM confidence)

- None — no WebSearch/Context7 lookups were needed; this phase's entire technical surface
  (MUI, Vitest, RTL) is already installed and directly inspectable in-repo, and the domain
  knowledge required is 100% in-codebase convention-following rather than external library
  research.

### Tertiary (LOW confidence)

- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every dependency read directly from installed `node_modules`, zero
  external/training-data package claims
- Architecture: HIGH — every pattern (gender theme, avatar composition, spouse connector,
  test structure) is extracted from an in-repo file read in full this session, not inferred
- Pitfalls: HIGH — all four pitfalls are grounded in specific, cited code (existing test
  assertions, UI-SPEC.md's own flagged contrast concern, the `spouses[]` symmetric-array
  shape visible in `familyTree.assembly.js`)

**Research date:** 2026-08-03
**Valid until:** 30 days (stable in-repo conventions; no external API surface to go stale)
