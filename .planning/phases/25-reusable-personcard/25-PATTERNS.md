# Phase 25: Reusable PersonCard - Pattern Map

**Mapped:** 2026-08-03
**Files analyzed:** 4 (2 new, 1 new-shared-util, 1 modified)
**Analogs found:** 4 / 4

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `frontend/src/components/person/PersonCard.jsx` | component | request-response (props-in, callback-out; no fetch) | `frontend/src/components/family/MemberNode.jsx` | role-match (same "gender-tinted card from a `member` bag" pattern; different geometry/host — canvas node vs. flowing card) |
| `frontend/src/components/person/PersonCard.test.jsx` | test | request-response (render + interaction assertions) | `frontend/src/components/manage/MemberCard.test.jsx` | exact (colocated Vitest+RTL structure, `photoClient` mock, `BASE_MEMBER` + `renderCard` helper) |
| `frontend/src/utils/genderTheme.js` | utility | transform (pure gender→color/label mapping) | `frontend/src/components/family/MemberNode.jsx` (lines 24-31, the private `genderMeta`/`MALE_TINT`/`FEMALE_TINT` block being extracted) | exact (this is a verbatim extraction, not a new pattern) |
| `frontend/src/components/family/MemberNode.jsx` (MODIFIED — import swap only) | component | request-response | itself (pre-extraction version) | exact (behavior-preserving refactor; zero test-file edits expected) |

No other files are created or modified this phase (confirmed against CONTEXT.md's phase boundary — `/detail` page, search, grid/expand mechanics, and dialog wiring are Phases 26-28, out of scope here).

---

## Pattern Assignments

### `frontend/src/components/person/PersonCard.jsx` (component, request-response)

**Analog:** `frontend/src/components/family/MemberNode.jsx` (primary), with the status chip lifted from `frontend/src/components/family/MemberDetailPanel.jsx` and the avatar from `frontend/src/components/manage/MemberAvatarImage.jsx`.

**Imports pattern** (from `MemberNode.jsx` lines 14-18, adapted — drop `@xyflow/react`, add the new shared util and icons):
```javascript
import { Box, Chip, IconButton, Paper, Typography } from '@mui/material';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import { colors } from '../../theme.js';
import { getGeezDisplay } from '../../utils/displayName.js';
import { genderMeta } from '../../utils/genderTheme.js';
import MemberAvatarImage from '../manage/MemberAvatarImage.jsx';
```
Note the relative-path depth change: `PersonCard.jsx` lives at `components/person/`, same depth as `components/family/`, so `../../theme.js` and `../../utils/...` paths are unchanged from `MemberNode.jsx`'s own depth; only `../manage/MemberAvatarImage.jsx` (one level, not two) changes because `person/` is a sibling of `manage/`, exactly as `family/MemberNode.jsx` already does (`'../manage/MemberAvatarImage.jsx'` at line 18 — copy verbatim, same relative path).

**Card container + gender color pattern** (`MemberNode.jsx` lines 95-127 — copy the `data-gender`/`aria-label`/border+tint contract, drop the fixed 252×120 size and the `Handle`/viewer-ring/focus-root specifics per D-01/D-03):
```javascript
const { label: genderLabel, tint: genderTint } = genderMeta(member.gender);

<Paper
  elevation={0}
  data-testid={`person-card-${member.id}`}
  data-gender={genderLabel}
  aria-label={`${member.fullname}, ${genderLabel}`}
  sx={{
    // fluid, NOT the fixed 252x120 of MemberNode — width: '100%', height grows to content
    width: '100%',
    p: 2, // md spacing token (UI-SPEC.md)
    bgcolor: `${genderTint}14`,          // same 8%-alpha tint formula as MemberNode.jsx:109
    border: `2px solid ${genderTint}`,    // same 2px gender border as MemberNode.jsx:110
    borderRadius: '11px',                 // same radius as MemberNode.jsx:111
    position: 'relative',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',              // vertical card per D-01, vs. MemberNode's row layout
    gap: 1.5,
    '&:focus-visible': { outline: `2px solid ${colors.primary}`, outlineOffset: '2px' }
  }}
>
```
**Do not copy:** the `<Handle>` elements (xyflow-only), `isViewer`/`isFocusRoot`/`ancestorHiddenCount` props and their badges (family-tree-canvas-only concerns, not part of PersonCard's prop contract per UI-SPEC.md's Component Anatomy table).

**Status chip pattern** (`MemberDetailPanel.jsx` lines 63, 99-104 — copy verbatim, `isAlive` normalization + `Chip` props):
```javascript
const isAlive = member.isAlive !== false; // MemberDetailPanel.jsx:63 convention
<Chip
  size="small"
  label={isAlive ? 'Living' : 'Deceased'}
  color={isAlive ? 'success' : 'default'}
  variant="outlined"
/>
```

**Ge'ez name line pattern** (`MemberNode.jsx` lines 80, 210-214 — copy verbatim, only the `fontSize`/weight change per UI-SPEC.md typography table: 18px/700 for PersonCard vs. 16px/700 in MemberNode):
```javascript
const geez = getGeezDisplay(member);
// ...
{geez && (
  <Typography sx={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3, color: genderTint }} lang={geez.lang} noWrap>
    {geez.text}
  </Typography>
)}
```

**Latin name line pattern** (`MemberNode.jsx` lines 206-208, size bumped per UI-SPEC.md to 16/700 — same shape, `noWrap` for ellipsis truncation per D-04):
```javascript
<Typography sx={{ fontSize: 16, fontWeight: 700, lineHeight: 1.25, color: colors.ink }} noWrap>
  {member.fullname}
</Typography>
```

**Avatar composition (new — Gender Ring wraps `MemberAvatarImage`, per RESEARCH.md Pattern 2, D-09/D-10):**
```javascript
// Analog for the *wrapped component*: MemberNode.jsx:180-191 uses
// <MemberAvatarImage member={member} variant="rounded" fill /> inside a
// sized Box. PersonCard wraps the same call in a ring Box (new — no direct
// codebase analog for the ring itself, this is Phase 25's one genuinely new
// UI element per RESEARCH.md).
const RING_STYLE = { Male: 'solid', Female: 'dashed', Other: 'dotted' };

<Box
  sx={{
    width: 96, height: 96, borderRadius: '50%',
    border: `3px ${RING_STYLE[genderLabel] ?? RING_STYLE.Other} ${genderTint}`,
    padding: '3px', boxSizing: 'border-box'
  }}
>
  <Box sx={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden' }}>
    <MemberAvatarImage member={member} variant="circular" fill />
  </Box>
</Box>
```
**Critical:** key `RING_STYLE` off `genderLabel` (the normalized output of `genderMeta()`), never off raw `member.gender` — this is Pitfall 2 in RESEARCH.md (an unrecognized raw value would produce `border: 3px undefined ...`, silently dropping the ring).

**Edit affordance pattern** (`MemberCard.jsx`'s edit-button gating precedent, lines 135-139, adapted from a text `Button` to a top-right icon `IconButton` per UI-SPEC.md's layout zone 1 — the *gating condition shape* is what to copy, not the button variant):
```javascript
{member.canEdit === true && (
  <IconButton
    aria-label={`Edit ${member.fullname}`}
    onClick={() => onEdit(member)}
    sx={{ position: 'absolute', top: 8, right: 8, minWidth: 44, minHeight: 44 }}
  >
    <EditRoundedIcon />
  </IconButton>
)}
```

**Expand/child-count footer pattern** (new control shape, but the *gating idiom* — "only render when count > 0, never a disabled control" — mirrors `MemberNode.jsx`'s hidden-count badges at lines 164-176/239-251, adapted to a footer row per D-07/D-13):
```javascript
function childCountLabel(count) {
  return count === 1 ? '1 child' : `${count} children`;
}

const childCount = member.children?.length ?? 0;
{!isSpouse && childCount >= 1 && (
  <IconButton
    aria-label={expanded ? `Hide children of ${member.fullname}` : `Show children of ${member.fullname}`}
    onClick={() => onExpand(member)}
    sx={{ minWidth: 44, minHeight: 44, alignSelf: 'flex-start' }}
  >
    <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{childCountLabel(childCount)}</Typography>
    <ExpandMoreRoundedIcon sx={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
  </IconButton>
)}
```
Mirrors `MemberNode.jsx`'s `onToggleExpand`/`onToggleAncestorExpand` click-handler shape (lines 168-171: `onClick={(event) => { event.stopPropagation(); onExpand(...) }}`) — copy the `event.stopPropagation()` guard if PersonCard will ever sit inside a clickable parent (e.g., a future page-level card click-through); optional here since PersonCard has no wrapping click handler yet, but cheap defensive parity with the established idiom.

**Spouse pairing + dashed connector pattern** (adapted from `FamilyTreeCanvas.jsx` lines 340-341's SVG edge style, per RESEARCH.md Pattern 3 — CSS-only reinterpretation, no `@xyflow/react` import):
```javascript
// FamilyTreeCanvas.jsx:340-341 (SVG edge, for reference only — do not import):
//   type: 'straight',
//   style: { stroke: colors.primary, strokeWidth: 1.5, strokeDasharray: '4 3' }
//
// PersonCard's CSS-flex reinterpretation (own file, wrapping two <PersonCard>s):
<Box sx={{ display: 'flex', alignItems: 'center', gap: 0 }}>
  <PersonCard member={member} role={role} expanded={expanded} onExpand={onExpand} onEdit={onEdit} />
  {spouse && !isSpouse && (
    <>
      <Box aria-hidden="true" sx={{ width: 32, alignSelf: 'center', borderTop: `2px dashed ${colors.primary}` }} />
      <PersonCard member={spouse} isSpouse onEdit={onEdit} />
    </>
  )}
</Box>
```
**Pitfall guard (RESEARCH.md Pitfall 4):** when `isSpouse === true`, PersonCard must never read/render its own `spouse` prop or look up `member.spouses` — the spouse card is always a rendering leaf. Do not thread a `spouse` prop down recursively; the page/nav layer (Phase 26/27) is solely responsible for passing `spouse` only to the non-spouse anchor card.

**D-14 spouse selection (caller-side helper, documented for Phase 26/27 but referenced here since it defines PersonCard's prop contract):**
```javascript
function selectDisplayedSpouse(member) {
  const spouses = member.spouses || [];
  return spouses.length > 0 ? spouses[spouses.length - 1] : null;
}
```

---

### `frontend/src/utils/genderTheme.js` (utility, transform) — NEW, extracted

**Analog:** `frontend/src/components/family/MemberNode.jsx` lines 24-31 (the exact block being moved).

**Extraction — copy verbatim, only the `colors` import path changes** (from `../../theme.js` relative to `family/MemberNode.jsx`, to `../theme.js` relative to the new `utils/genderTheme.js`):
```javascript
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

---

### `frontend/src/components/family/MemberNode.jsx` (MODIFIED — behavior-preserving import swap)

**Analog:** itself, pre-extraction.

**Change 1 — delete lines 20-31** (the comment block + `MALE_TINT`/`FEMALE_TINT`/`genderMeta` local declarations).

**Change 2 — add import** (insert alongside the existing imports, e.g. after line 17):
```javascript
import { genderMeta } from '../../utils/genderTheme.js';
```

**Regression guard:** `MemberNode.test.jsx` lines 164-185 assert `data-gender`/`aria-label` for Male/Female/Other — run this file unmodified after the extraction; any required test-file edit signals the extraction broke behavior (RESEARCH.md Pitfall 1). No other line in `MemberNode.jsx` changes.

---

### `frontend/src/components/person/PersonCard.test.jsx` (test) — NEW

**Analog:** `frontend/src/components/manage/MemberCard.test.jsx` (structure) + `frontend/src/components/family/MemberNode.test.jsx` (gender/aria-label assertion style).

**Imports + mock pattern** (`MemberCard.test.jsx` lines 1-8, copy verbatim — the `photoClient` mock is required transitively because `PersonCard` renders `MemberAvatarImage`, which imports `fetchMemberPhotoBlob`):
```javascript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PersonCard from './PersonCard.jsx';

vi.mock('../../api/photoClient.js', () => ({
  fetchMemberPhotoBlob: vi.fn().mockRejectedValue(new Error('not needed in this test'))
}));
```
Note: no `ReactFlowProvider`/`ResizeObserverPolyfill` needed here (that ceremony in `MemberNode.test.jsx` lines 4, 14-24 is xyflow-specific and does not apply to `PersonCard`, which has no `<Handle>`s).

**Fixture + render-helper pattern** (`MemberCard.test.jsx` lines 10-27, extended with PersonCard's full prop contract per UI-SPEC.md's props table):
```javascript
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
  // ... one `it` block per row of RESEARCH.md's "Phase Requirements -> Test Map" table:
  // CARD-01 field omission, CARD-02 role-agnostic rendering, CARD-03 gender
  // (data-gender/aria-label/ring for Male/Female/Other/undefined), CARD-04
  // singular/plural + expand gating, SPOUSE-01 spouse pairing + no expand
  // control on the spouse, D-08 canEdit gating + onEdit(member) call.
});
```

**Gender/aria assertion style** (`MemberNode.test.jsx` lines 164-185 — copy the assertion *shape*, not the fixture, since `PersonCard`'s aria-label format is identical: `` `${fullname}, ${genderLabel}` ``):
```javascript
it('depicts a Male member via data-gender + accessible label', () => {
  renderCard({ member: { ...BASE_MEMBER, gender: 'Male' } });
  const card = screen.getByTestId('person-card-1');
  expect(card).toHaveAttribute('data-gender', 'Male');
  expect(card).toHaveAccessibleName('Ada Lovelace, Male');
});
```

**Spouse-dedup regression test** (per RESEARCH.md Pitfall 4 — pin this as an explicit assertion since it has no direct analog test elsewhere):
```javascript
it('renders exactly 2 person cards for a spouse pair, never recursing into the spouse\'s own spouse', () => {
  const spouse = { ...BASE_MEMBER, id: '2', fullname: 'Bob Lovelace', spouses: [{ id: '1' }] };
  const member = { ...BASE_MEMBER, spouses: [{ id: '2' }] };
  const { container } = renderCard({ member, spouse: { ...spouse, spouses: [member] } });
  expect(container.querySelectorAll('[data-testid^="person-card-"]').length).toBe(2);
});
```

---

## Shared Patterns

### Gender color + non-color cue (D-02/D-09/D-10/D-11)
**Source:** `frontend/src/utils/genderTheme.js` (new, extracted from `frontend/src/components/family/MemberNode.jsx` lines 24-31) + the ring composition in Pattern Assignments above.
**Apply to:** `PersonCard.jsx` only this phase (the module is shared infrastructure; `MemberNode.jsx`'s consumption is the modified-import side, not a new pattern application).
```javascript
export function genderMeta(gender) {
  if (gender === 'Male') return { label: 'Male', tint: MALE_TINT };
  if (gender === 'Female') return { label: 'Female', tint: FEMALE_TINT };
  return { label: 'Other', tint: colors.slate }; // always degrades gracefully — never returns undefined
}
```
Never re-hardcode `#3b82f6`/`#ec4899`/`#64748b` a second time anywhere — always import from this module (RESEARCH.md Anti-Pattern, explicit D-02 instruction).

### Ge'ez display derivation (D-04)
**Source:** `frontend/src/utils/displayName.js` (`getGeezDisplay`), unchanged.
**Apply to:** `PersonCard.jsx`.
```javascript
const geez = getGeezDisplay(member); // { text, lang: 'ti' } | null — never re-derive `member.geezFullname?.trim()` inline
```

### Avatar photo fetch + fallback (D-09/D-10)
**Source:** `frontend/src/components/manage/MemberAvatarImage.jsx`, unchanged, composed (not modified) by `PersonCard.jsx`.
```javascript
<MemberAvatarImage member={member} variant="circular" fill />
```
The container wrapping this call must have a definite height (its own doc comment, line 11) — the gender-ring `Box`'s `100%`/`100%` inner box satisfies this.

### 44px minimum touch target (A11Y precedent, `MemberNode.jsx`/`MemberCard.jsx`)
**Source:** `BADGE_SX` in `MemberNode.jsx` line 37-38 (`minWidth: 44, minHeight: 44`) and the avatar `ButtonBase` in `MemberCard.jsx` line 58-59.
**Apply to:** both the edit `IconButton` (top-right) and the expand control (footer) in `PersonCard.jsx`.

### Living/Deceased status chip (D-04)
**Source:** `frontend/src/components/family/MemberDetailPanel.jsx` lines 63, 99-104.
**Apply to:** `PersonCard.jsx`.

### Colocated component test structure
**Source:** `frontend/src/components/manage/MemberCard.test.jsx` (full file, structure) + `frontend/src/components/family/MemberNode.test.jsx` (gender/aria assertion style).
**Apply to:** `PersonCard.test.jsx`.

---

## No Analog Found

| File/Element | Role | Data Flow | Reason |
|--------------|------|-----------|--------|
| Gender ring (border-style-as-shape avatar wrapper, D-09) | component (sub-element of `PersonCard.jsx`) | transform (pure CSS composition) | Genuinely new UI this phase per RESEARCH.md — no existing component in the codebase encodes gender via a ring/border shape around an avatar; RESEARCH.md Pattern 2 is a from-scratch design (not extracted from an existing file), grounded only in `MemberAvatarImage.jsx`'s `fill` container contract. |
| CSS-flex dashed spouse connector (off-canvas) | component (sub-element of `PersonCard.jsx`'s spouse-pairing wrapper) | transform | The only existing dashed-connector implementation (`FamilyTreeCanvas.jsx:340-341`) is an SVG edge drawn by `@xyflow/react` inside a pan/zoom canvas — architecturally incompatible with a flowing grid (RESEARCH.md "Alternatives Considered"). The CSS `borderTop: dashed` reinterpretation borrows only the color/dash values, not a structural pattern. |

---

## Metadata

**Analog search scope:** `frontend/src/components/family/`, `frontend/src/components/manage/`, `frontend/src/components/` (root), `frontend/src/utils/`, `frontend/src/theme.js`
**Files scanned:** `MemberNode.jsx`, `MemberNode.test.jsx`, `MemberCard.jsx`, `MemberCard.test.jsx`, `MemberDetailPanel.jsx`, `MemberAvatarImage.jsx`, `MemberFallbackAvatar.jsx`, `displayName.js`, `theme.js`, `FamilyTreeCanvas.jsx` (targeted grep + read of lines 300-350 for spouse-edge styling)
**Pattern extraction date:** 2026-08-03
