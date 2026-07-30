# Phase 20: Self-Hosted Font & Theme - Pattern Map

**Mapped:** 2026-07-30
**Files analyzed:** 4 (3 edits + 1 new)
**Analogs found:** 4 / 4

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `frontend/package.json` | config | batch (dependency manifest) | `frontend/package.json` (self — existing `dependencies` block) | exact |
| `frontend/src/main.jsx` | config/bootstrap | event-driven (app init, side-effect import) | `frontend/src/main.jsx` (self — existing top-of-file imports) | exact |
| `frontend/src/theme.js` | config | transform (constant → MUI theme object) | `frontend/src/theme.js` (self — existing `FONT_SANS`/`FONT_DISPLAY` constants) | exact |
| `frontend/src/theme.test.js` (NEW) | test | request-response (pure function/constant assertion, no async) | `frontend/src/api/photoClient.test.js` | role-match (best available; both are plain-`.js`, non-component unit tests) |

All four files are edits to (or new siblings of) themselves — this phase's "closest analog" for the three edit targets is simply the current, verified content of the file being changed, since RESEARCH.md already pinned the exact before/after diffs. The one genuinely new file (`theme.test.js`) needed a cross-codebase analog search for test scaffolding conventions.

## Pattern Assignments

### `frontend/package.json` (config, batch)

**Analog:** self (existing `dependencies` block, lines 16-30)

**Current dependency declaration pattern** (lines 16-30):
```json
"dependencies": {
  "@dagrejs/dagre": "^3.0.0",
  "@emotion/react": "^11.14.0",
  "@emotion/styled": "^11.14.0",
  "@mui/icons-material": "^6.3.1",
  "@mui/material": "^6.3.1",
  "@mui/x-date-pickers": "^7.29.4",
  "@xyflow/react": "^12.11.2",
  "axios": "^1.7.9",
  "dayjs": "^1.11.21",
  "react": "^18.3.1",
  "react-dom": "^18.3.1",
  "react-easy-crop": "^6.2.3",
  "react-router-dom": "^6.28.2"
}
```

**Convention:** alphabetically sorted keys (scoped packages like `@dagrejs`, `@emotion`, `@mui`, `@xyflow` sort by their full string including the `@scope/` prefix), caret-range versions (`^x.y.z`), 2-space indent, no trailing comment.

**Exact insertion point:** `@mui/x-date-pickers` (line 22) comes before `@xyflow/react` (line 23) alphabetically; `@fontsource/noto-sans-ethiopic` sorts between `@emotion/styled` (line 19) and `@mui/icons-material` (line 20) — insert as a new line after `"@emotion/styled": "^11.14.0",` and before `"@mui/icons-material": "^6.3.1",`:
```json
"@emotion/styled": "^11.14.0",
"@fontsource/noto-sans-ethiopic": "^5.3.0",
"@mui/icons-material": "^6.3.1",
```

**Do NOT** run `npm install` from the repo root or via `slopcheck install` (per RESEARCH.md Pitfall 3) — run `npm install @fontsource/noto-sans-ethiopic --workspace frontend` so both `frontend/package.json` and the shared root `package-lock.json` are updated together in one real install, rather than hand-editing the JSON and letting the lockfile drift.

---

### `frontend/src/main.jsx` (bootstrap, event-driven side-effect import)

**Analog:** self (existing top-of-file import block, lines 1-9)

**Current import pattern** (lines 1-9):
```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import theme from './theme.js';
```

**Convention:** third-party package imports first (React core → routing → MUI → MUI sub-modules), local relative imports last (`./App.jsx`, `./context/AuthContext.jsx`, `./theme.js`). No side-effect-only (no-binding) imports currently exist in this file — this phase introduces the first one.

**Exact insertion:** add the two Ethiopic-only subset CSS side-effect imports after the third-party import block and before the local relative imports (grouping with other node_modules imports, consistent with existing third-party-first ordering):
```jsx
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import '@fontsource/noto-sans-ethiopic/ethiopic-400.css';
import '@fontsource/noto-sans-ethiopic/ethiopic-700.css';
import App from './App.jsx';
```

**Critical — do NOT import** `@fontsource/noto-sans-ethiopic/400.css` (unqualified). Only the `ethiopic-` prefixed subset files. Per RESEARCH.md Pitfall 2, the plain `400.css` bundles three `@font-face` blocks (ethiopic + latin-ext + latin) under the same family name, duplicating Inter's coverage.

No error handling, auth, or validation pattern applies to this file/edit — it is a pure side-effect CSS import, same class as the existing `@mui/x-date-pickers/AdapterDayjs` import (also a bare module-registration import with no local binding used directly by name elsewhere).

---

### `frontend/src/theme.js` (config, transform)

**Analog:** self (existing `FONT_SANS`/`FONT_DISPLAY` constants, lines 32-33)

**Current constants (BEFORE)** (lines 32-33):
```js
const FONT_SANS = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const FONT_DISPLAY = '"Sora", "Inter", system-ui, sans-serif';
```

**Required edit (AFTER)** — insert `"Noto Sans Ethiopic"` immediately after the existing Latin brand font(s) and before any OS-fallback font:
```js
const FONT_SANS = '"Inter", "Noto Sans Ethiopic", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const FONT_DISPLAY = '"Sora", "Noto Sans Ethiopic", "Inter", system-ui, sans-serif';
```

**Convention:** module-private (non-exported) `const` string literals, consumed only within the same file at `typography.fontFamily` (line 50, uses `FONT_SANS`) and the `h1`-`h6` variant blocks (lines 51-56, use `FONT_DISPLAY`). No other file imports these two constants directly.

**Ordering rule (do not violate — RESEARCH.md Pitfall 1):** `[existing Latin font(s), "Noto Sans Ethiopic", OS-fallback fonts]`. Do not place `"Noto Sans Ethiopic"` first in either list — that would let the browser prefer Ethiopic glyph shapes for shared/Latin codepoints, regressing existing Latin rendering.

**No exports change needed for the theme.js edit itself** — only the two string literals change; the `createTheme({...})` call block (lines 35-120) and `export default theme` (line 130) are untouched. However, see the test file section below: `theme.test.js` needs a way to observe these strings, and the two constants are currently module-private.

---

### `frontend/src/theme.test.js` (NEW — test, request-response/pure-assertion)

**Analog:** `frontend/src/api/photoClient.test.js` (full file, 23 lines — read completely, reproduced below)

**Full analog content** (`frontend/src/api/photoClient.test.js`, lines 1-23):
```js
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

**Why this is the closest analog:** it is the only plain-`.js` (non-`.jsx`, no React rendering, no MUI, no RTL `render()`) unit test in the codebase — same category as `theme.test.js` will be (asserting on a plain JS module's exported/derived value, not testing a rendered component). `familyTree.layout.test.js`/`familyTree.assembly.test.js` are also plain `.js` tests but are much larger (106-348 lines) and test graph-layout algorithms — not a good scaffolding match for a small constant-assertion test. All `.jsx` test files (`Login.test.jsx`, `MemberNode.test.jsx`, etc.) additionally import `@testing-library/react`'s `render`/`screen`, which is unnecessary here.

**Pattern to copy:**
- `import { describe, it, expect } from 'vitest';` at the top (no `beforeEach`/`localStorage` needed for `theme.test.js` — this app-specific need is unique to `photoClient.test.js`; theme has no localStorage dependency).
- Import the file under test with a relative path + explicit `.js` extension: `import theme from './theme.js';` (matches this repo's import-organization convention — no path aliases anywhere, explicit extensions always).
- `describe('<subject>', () => { it('<behavior, plain English>', () => { ... }); });` nesting, one assertion focus per `it` block.
- Assertions use direct Vitest matchers (`toBe`, `toBeUndefined`) — no custom assertion helpers exist in this codebase.

**Handling the module-private constant problem (per RESEARCH.md Wave 0 Gaps note):** `FONT_SANS`/`FONT_DISPLAY` are not exported from `theme.js`. Per RESEARCH.md's own recommendation, the **lower-risk path or the export path** — pick one explicitly in the plan:
- **Option A (no source change beyond the font-stack edit itself):** assert indirectly via the default-exported `theme` object's derived typography, e.g. `theme.typography.fontFamily` (reflects `FONT_SANS`) and `theme.typography.h1.fontFamily` (reflects `FONT_DISPLAY`).
- **Option B:** add `export` to the two `const` declarations in `theme.js` and import them directly by name — slightly clearer test code, but is an additional source-file change beyond what RESEARCH.md scoped as "two edited lines."

**Recommended concrete test body** (Option A — matches RESEARCH.md's stated lower-risk preference, and requires zero additional edit to `theme.js` beyond the font-stack strings):
```js
import { describe, it, expect } from 'vitest';
import theme from './theme.js';

describe('theme font stack', () => {
  it('includes Noto Sans Ethiopic in FONT_SANS after the Latin font and before OS fallbacks', () => {
    const stack = theme.typography.fontFamily;
    const inter = stack.indexOf('Inter');
    const ethiopic = stack.indexOf('Noto Sans Ethiopic');
    const systemUi = stack.indexOf('system-ui');

    expect(ethiopic).toBeGreaterThan(-1);
    expect(ethiopic).toBeGreaterThan(inter);
    expect(ethiopic).toBeLessThan(systemUi);
  });

  it('includes Noto Sans Ethiopic in FONT_DISPLAY (h1) after Sora and before Inter/system-ui', () => {
    const stack = theme.typography.h1.fontFamily;
    const sora = stack.indexOf('Sora');
    const ethiopic = stack.indexOf('Noto Sans Ethiopic');

    expect(ethiopic).toBeGreaterThan(-1);
    expect(ethiopic).toBeGreaterThan(sora);
  });
});
```

**No error handling / validation / auth pattern applies** — `theme.js` is a static config module with no async, no I/O, no user input. The photoClient analog's `beforeEach(() => localStorage.clear())` is specific to that file's `localStorage` dependency and should NOT be copied into `theme.test.js` (no shared setup needed).

**Test runner config (shared, already in place — no new config needed):**
- `frontend/vitest.config.js` (lines 1-10): `environment: 'jsdom'`, `setupFiles: ['./test/setup.js']` — applies automatically to any new `*.test.js` under `frontend/src/`.
- `frontend/test/setup.js` (lines 1-24): imports `@testing-library/jest-dom/vitest`, polyfills `window.matchMedia`, global `afterEach` clears `localStorage` and calls RTL `cleanup()`. None of this is required by `theme.test.js`'s pure-assertion style, but it runs automatically for every test file in the suite regardless — no opt-out needed, no conflict.

---

## Shared Patterns

### Explicit relative imports with file extensions
**Source:** every file in this phase (`main.jsx` line 9 `from './theme.js'`; `photoClient.test.js` line 2 `from './photoClient.js'`)
**Apply to:** `theme.test.js`'s import of `theme.js`
```js
import theme from './theme.js';
```
No path aliases exist anywhere in this repo (confirmed in project conventions) — always use relative paths with explicit `.js`/`.jsx` extensions.

### Vitest describe/it/expect scaffolding
**Source:** `frontend/src/api/photoClient.test.js` (full file)
**Apply to:** `theme.test.js`
```js
import { describe, it, expect } from 'vitest';
```
Standard across all `*.test.js`/`*.test.jsx` files in `frontend/src/`; no custom test utilities or wrappers beyond RTL's `render`/`screen` (used only by component tests, not applicable here).

### package.json dependency block — alphabetical, caret-range
**Source:** `frontend/package.json` lines 16-30
**Apply to:** the one-line dependency addition
```json
"@fontsource/noto-sans-ethiopic": "^5.3.0",
```
Insert alphabetically between `@emotion/styled` and `@mui/icons-material`; run the real `npm install --workspace frontend` rather than hand-editing + hoping the lockfile matches (per RESEARCH.md Pitfall 3 — do not use `slopcheck install` against the repo root).

## No Analog Found

None — all four files in scope have a usable analog (three are self-analogs with RESEARCH.md-verified exact diffs; the fourth, `theme.test.js`, has a strong cross-codebase scaffolding match in `photoClient.test.js`).

## Metadata

**Analog search scope:** `frontend/src/` (all `*.test.js`/`*.test.jsx`), `frontend/package.json`, `frontend/src/main.jsx`, `frontend/src/theme.js`, `frontend/vitest.config.js`, `frontend/test/setup.js`
**Files scanned:** 31 existing test files (via `find`) + 4 edit-target files (read in full) + 1 config file + 1 setup file
**Pattern extraction date:** 2026-07-30
