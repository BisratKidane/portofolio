# Phase 21: Shared Display Helper - Pattern Map

**Mapped:** 2026-07-30
**Files analyzed:** 2 (new)
**Analogs found:** 2 / 2 (both role-match; no exact same-file-type analog exists since this is the first file in a new `utils/` directory)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `frontend/src/utils/displayName.js` | utility | transform (pure derivation, no I/O) | `frontend/src/components/family/MemberNode.jsx` (idiom: `formatDate()`, lines 24-29) + `frontend/src/api/photoClient.js` (module shape: named ES-module exports) | role-match (idiom exact, module-shape exact; no pre-existing `utils/` file to match directory placement) |
| `frontend/src/utils/displayName.test.js` | test | transform (unit test, no render) | `frontend/src/api/photoClient.test.js` | exact (same non-React, plain-function Vitest shape) |

`frontend/src/utils/` does not currently exist — confirmed via `ls frontend/src` (only `App.jsx`, `api/`, `assets/`, `components/`, `context/`, `main.jsx`, `pages/`, `theme.js`, `theme.test.js`). This phase creates the directory with its first file.

## Pattern Assignments

### `frontend/src/utils/displayName.js` (utility, transform)

**Analog 1 (return-shape idiom):** `frontend/src/components/family/MemberNode.jsx`

**Null-or-value idiom** (lines 24-29):
```javascript
function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString();
}
```
This is the exact precedent the new helper mirrors: guard clause returns `null` for "nothing to render," bare value otherwise. `displayName.js` extends this to a small payload object (`{ text, lang }`) instead of a bare string, because two properties must travel together (locked decision: `null | { text, lang: 'ti' }`).

**Consumer usage this idiom enables** (line 65, mother-name row):
```javascript
const motherName = member.mother?.fullname || member.mothersname;
```
And the conditional-render pattern applied to `formatDate`'s output (lines 193-197):
```jsx
{birthday && (
  <Typography sx={ROW_SX} noWrap>
    {birthday}
  </Typography>
)}
```
This is the exact `{value && <Typography>...}` idiom that `{geez && <Typography lang={geez.lang}>{geez.text}</Typography>}` will replicate in Phase 22 — confirms the `null`-falsy return shape is sufficient and requires no unwrapping at call sites.

Latin fullname render for reference (untouched by this helper, line 189-191):
```jsx
<Typography sx={{ fontSize: 14, fontWeight: 600 }} noWrap>
  {member.fullname}
</Typography>
```
The helper must NOT touch or duplicate this — `member.fullname` stays exactly as-is; the helper only ever derives from `member.geezFullname`.

**Analog 2 (module structure / export convention):** `frontend/src/api/photoClient.js`

**Named-export, no-default-required-for-utility pattern** (lines 1-7):
```javascript
import axios from 'axios';

export function attachAuthHeader(config) {
  const token = localStorage.getItem('authToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
}
```
Shows the project convention for a plain pure(ish) exported function living outside `components/`: named `export function`, no class wrapper, top-level statement, JSDoc optional. `displayName.js` follows this shape but has zero imports (no axios/library needed) and zero side effects (fully pure, unlike `attachAuthHeader` which reads `localStorage`).

**Concrete implementation to write** (per locked decisions + RESEARCH.md precedent synthesis):
```javascript
// frontend/src/utils/displayName.js
export const GEEZ_LANG = 'ti';

/**
 * Derives the Ge'ez display name for a family member, or null if absent.
 * Reads the server-derived geezFullname (Phase 18/19 VIRTUAL) — does not
 * recompute a join from geezFirstname/geezLastname (avoids duplicating
 * that logic in a second place; mirrors MemberNode.jsx's formatDate()
 * null-or-value idiom).
 * @param {{ geezFullname?: string | null }} member
 * @returns {{ text: string, lang: string } | null}
 */
export function getGeezDisplay(member) {
  const text = member?.geezFullname?.trim();
  if (!text) return null;
  return { text, lang: GEEZ_LANG };
}
```

**Data-flow note:** the helper reads ONLY `member.geezFullname` (locked decision — does NOT recompute from `geezFirstname`/`geezLastname`). It owns only the Ge'ez half; `member.fullname` (Latin) is never read or written by this helper — that stays entirely with existing render surfaces, unchanged.

---

### `frontend/src/utils/displayName.test.js` (test, transform)

**Analog:** `frontend/src/api/photoClient.test.js`

**Full test file** (lines 1-22, colocated `.js` pure-function Vitest test with no React render):
```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { attachAuthHeader } from './photoClient.js';

beforeEach(() => {
  localStorage.clear();
});

describe('attachAuthHeader', () => {
  it('adds Authorization: Bearer <token> when a token is stored', () => {
    localStorage.setItem('authToken', 'my-token');

    const config = attachAuthHeader({ headers: {} });

    expect(config.headers.Authorization).toBe('Bearer my-token');
  });

  it('leaves headers.Authorization unset when no token is stored', () => {
    const config = attachAuthHeader({ headers: {} });

    expect(config.headers.Authorization).toBeUndefined();
  });
});
```

**Pattern to copy exactly:**
1. Import line: `import { describe, it, expect } from 'vitest';` — no `beforeEach`/`localStorage` needed for `displayName.test.js` since the helper is fully pure (no module-level state to reset between tests, unlike `attachAuthHeader` which touches `localStorage`).
2. Sibling-module import with explicit `.js` extension: `import { attachAuthHeader } from './photoClient.js';` → mirror as `import { getGeezDisplay, GEEZ_LANG } from './displayName.js';`
3. Single top-level `describe('<functionName>', () => { ... })` block, one `it(...)` per case, `expect(...).toBe(...)` / `.toBeNull()` / `.toEqual(...)` assertions — no setup/teardown boilerplate needed beyond what the function itself requires.

**Concrete test matrix to write** (none / partial / all-filled, per locked decisions — partial means only one Ge'ez part was ever set, so `geezFullname` already contains just that one part; the helper never sees "parts," only the pre-joined field):
```javascript
import { describe, it, expect } from 'vitest';
import { getGeezDisplay, GEEZ_LANG } from './displayName.js';

describe('getGeezDisplay', () => {
  it('returns null when geezFullname is null (none case)', () => {
    expect(getGeezDisplay({ geezFullname: null })).toBeNull();
  });

  it('returns null when geezFullname is undefined (field omitted from selection)', () => {
    expect(getGeezDisplay({})).toBeNull();
  });

  it('returns null when geezFullname is an empty string (defensive, not just null-check)', () => {
    const result = getGeezDisplay({ geezFullname: '' });
    expect(result).toBeNull();
    expect(result).not.toBe('');
  });

  it('returns null when geezFullname is whitespace-only', () => {
    expect(getGeezDisplay({ geezFullname: '   ' })).toBeNull();
  });

  it('returns { text, lang } when a single Ge\'ez part is present (partial case)', () => {
    const result = getGeezDisplay({ geezFullname: 'ጃነ' });
    expect(result).toEqual({ text: 'ጃነ', lang: 'ti' });
  });

  it('returns { text, lang } when both Ge\'ez parts are present (all-filled case)', () => {
    const result = getGeezDisplay({ geezFullname: 'ጃነ ዶ' });
    expect(result).toEqual({ text: 'ጃነ ዶ', lang: 'ti' });
  });

  it('always tags the lang as the exported GEEZ_LANG constant, not a hard-coded literal', () => {
    const result = getGeezDisplay({ geezFullname: 'ጃነ ዶ' });
    expect(result.lang).toBe(GEEZ_LANG);
  });
});
```

---

## Shared Patterns

### Null-or-payload return shape
**Source:** `frontend/src/components/family/MemberNode.jsx` lines 24-29 (`formatDate`)
**Apply to:** `displayName.js`'s `getGeezDisplay` — same guard-clause-returns-null idiom, extended to an object payload.
```javascript
function formatDate(dateStr) {
  if (!dateStr) return null;
  ...
  return d.toLocaleDateString();
}
```

### Plain named-export utility module (no class, no default export requirement)
**Source:** `frontend/src/api/photoClient.js` lines 1-7 (`attachAuthHeader`)
**Apply to:** `displayName.js` — top-level `export function` / `export const`, no wrapping object, no side effects for this helper (unlike `photoClient.js`, which does have a side-effecting axios client below the pure `attachAuthHeader` export — `displayName.js` needs none of that, since it has no network/localStorage concern).

### Colocated plain-function Vitest test (no React render, explicit `.js` import extension)
**Source:** `frontend/src/api/photoClient.test.js` (whole file)
**Apply to:** `displayName.test.js` — `describe`/`it`/`expect` only, sibling import with `.js` extension, no `render()`/`screen` from React Testing Library (this is not a component test).

## No Analog Found

None — both files have a clear, directly-applicable role-match analog. The only gap is that `frontend/src/utils/` has no prior sibling file to match directory-level conventions against; RESEARCH.md already confirms (Open Question 2) that no `index.js` barrel is warranted here, since the frontend does not use barrels anywhere (per CLAUDE.md Module Design conventions) and there is no mechanical need (unlike the backend's Apollo/Sequelize aggregation requirement).

## Metadata

**Analog search scope:** `frontend/src/components/family/`, `frontend/src/api/` (existing pure-function and null-or-value idiom precedents); `frontend/src/utils/` confirmed absent via directory listing.
**Files scanned:** 4 (`21-RESEARCH.md`, `MemberNode.jsx`, `photoClient.js`, `photoClient.test.js`)
**Pattern extraction date:** 2026-07-30
