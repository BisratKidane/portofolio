# Phase 04: Frontend Test Tooling - Pattern Map

**Mapped:** 2026-07-12
**Files analyzed:** 4 (3 new, 1 modified)
**Analogs found:** 4 / 4

> This phase deliberately MIRRORS the backend harness built in Phase 1. Every new
> frontend file has a direct backend template. The job of the planner is to copy the
> backend shape and adapt it for jsdom + JSX (React plugin, jsdom env, setupFiles,
> RTL cleanup, matchMedia stub). No application runtime code is modified.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `frontend/vitest.config.js` (new) | config | request-response (build/test tooling) | `backend/vitest.config.js` + `frontend/vite.config.js` | exact (shape) + role-match (react plugin) |
| `frontend/test/setup.js` (new) | test-infra / setup | transform (per-test lifecycle) | `backend/test/globalSetup.js` (structural sibling) | role-match |
| `frontend/src/**/*.test.jsx` proof spec (new) | test | transform | `backend/src/smoke.test.js` | exact (pattern) |
| `frontend/package.json` (modified) | config | n/a | `backend/package.json` | exact |

**Note on `frontend/test/setup.js` analog quality:** the backend `globalSetup.js` is a
*process-level* `globalSetup` (runs once, DB provisioning), whereas the frontend setup
file is a *per-file* `setupFiles` module (jest-dom matchers, global stubs, `afterEach`
cleanup). They share the "dedicated `test/` infra dir, explicit vitest imports" convention
(backend D-07) but serve different Vitest lifecycle hooks — copy the *placement + import
style*, not the DB logic.

## Pattern Assignments

### `frontend/vitest.config.js` (config)

**Primary analog:** `backend/vitest.config.js` (full file, 15 lines)
**Secondary analog:** `frontend/vite.config.js` lines 1-7 (React plugin declaration to re-declare)

**Config shape to mirror** (`backend/vitest.config.js` lines 1-15):
```javascript
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.ENV_FILE = path.resolve(__dirname, '../env/test.env');
process.env.NODE_ENV = 'test';

export default defineConfig({
  test: {
    globalSetup: ['./test/globalSetup.js'],
    pool: 'forks',
    fileParallelism: false
  }
});
```

Key structural takeaways to copy:
- Import `defineConfig` from `vitest/config` (NOT `vite`).
- Export a single `defineConfig({ test: { ... } })` object.
- The backend registers its infra file via `test.globalSetup`; the frontend instead
  registers it via `test.setupFiles: ['./test/setup.js']` (per-test, not per-run — D-03).

**React plugin to re-declare** (`frontend/vite.config.js` lines 1-2, 6-7):
```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// ...
export default defineConfig({
  plugins: [react()],
```
The standalone test config must add `plugins: [react()]` so JSX transforms run in tests
(D-01). Do NOT copy the `server.proxy` block — that is dev/build only.

**Frontend-specific additions required (from D-01/D-03, no backend analog):**
```javascript
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.js']
    // globals stays OFF — explicit vitest imports (backend convention, D-03 note)
  }
});
```
The backend does not set `environment` (defaults to node) or `plugins` — these are the
net-new frontend deltas the planner must add on top of the mirrored shape.

---

### `frontend/test/setup.js` (test-infra / setup)

**Analog (placement + import convention):** `backend/test/globalSetup.js` lines 1-3

**What to copy — dedicated `test/` dir + explicit vitest imports** (`backend/test/globalSetup.js` line 1, `backend/test/guard.test.js` line 1):
```javascript
// backend/test/guard.test.js:1 — explicit named imports from 'vitest' (no globals)
import { describe, it, expect, afterEach } from 'vitest';
```
Because `globals` is off (backend convention, carried forward per D-03 note), the setup
file MUST explicitly `import { afterEach } from 'vitest'` to wire RTL cleanup — it cannot
rely on an ambient global.

**Three responsibilities the setup file must implement (D-03, no direct backend analog — this is jsdom-specific, use RESEARCH.md for exact API):**
1. Register jest-dom matchers: `import '@testing-library/jest-dom/vitest';`
2. Stub `window.matchMedia` (MUI reads it; named in success criteria — see why below).
3. Wire RTL cleanup: `import { cleanup } from '@testing-library/react';` +
   `import { afterEach } from 'vitest';` + `afterEach(() => cleanup());`

**Why `matchMedia` must be stubbed** (`frontend/src/main.jsx` lines 4, 11-12):
```javascript
import { CssBaseline, ThemeProvider } from '@mui/material';
// ...
    <ThemeProvider theme={theme}>
      <CssBaseline />
```
MUI's `ThemeProvider` / responsive components call `window.matchMedia`, which jsdom does
not implement. Any Phase 5 test rendering a MUI tree (all of them) will throw without the
stub. Add only `matchMedia` now; add `ResizeObserver`/others only if a real error surfaces
(D-03 — do not stub preemptively).

---

### `frontend/src/**/*.test.jsx` throwaway proof spec (test)

**Analog:** `backend/src/smoke.test.js` (full file, 7 lines)

**Pattern to mirror** (`backend/src/smoke.test.js` lines 1-7):
```javascript
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('runs a trivial passing assertion', () => {
    expect(1 + 1).toBe(2);
  });
});
```

**Frontend adaptation (D-04 — throwaway inline component, render + query by role/text):**
- Keep the explicit `import { describe, it, expect } from 'vitest'` header.
- Add `import { render, screen } from '@testing-library/react';`.
- Define a throwaway inline component INSIDE the spec (do NOT import a real component like
  `BrandMark` — real components are Phase 5).
- Render it, then assert via a jest-dom matcher, e.g.
  `expect(screen.getByRole('heading', { name: /.../ })).toBeInTheDocument();`
- This proves the full chain: React plugin (JSX) + jsdom env + RTL render/query +
  jest-dom matchers + setup file wiring — end to end.

**Filename convention** (backend co-locates `src/smoke.test.js`; frontend mirrors with
`.jsx` extension per CONVENTIONS.md): place at `frontend/src/<something>.test.jsx`. This
spec is throwaway — Phase 5 deletes/replaces it with real auth-surface tests.

---

### `frontend/package.json` (modified)

**Analog:** `backend/package.json` lines 10-15, 28-31

**Test script to mirror** (`backend/package.json` line 14):
```json
"scripts": {
  "test": "vitest run"
}
```
Add `"test": "vitest run"` to `frontend/package.json` `scripts` (currently has no `test`
script — see `frontend/package.json` lines 9-14). Invocation is `npm test --workspace
frontend` from root (mirrors backend workspace invocation).

**devDependency pattern to mirror** (`backend/package.json` lines 28-31):
```json
"devDependencies": {
  "nodemon": "^3.1.9",
  "vitest": "^4.1.10"
}
```
Frontend already has `@vitejs/plugin-react` and `vite` in devDeps (`frontend/package.json`
lines 25-28). ADD (full RTL kit, D-02):
- `vitest` — pin to `^4.x` to match backend (`backend/package.json` uses `^4.1.10`).
- `jsdom`
- `@testing-library/react`
- `@testing-library/jest-dom`
- `@testing-library/user-event`

Exact version pins are Claude's Discretion (D-02/D-04 discretion) — planner pins against
React 18.3 / Vite 6 / `@vitejs/plugin-react` 4.3 (see STACK.md). `@testing-library/react`
v16 is the React 18/19-compatible line; confirm in RESEARCH.md.

## Shared Patterns

### Explicit vitest imports, no globals
**Source:** `backend/src/smoke.test.js:1`, `backend/test/guard.test.js:1`
**Apply to:** every new `.test.jsx` spec AND `frontend/test/setup.js`
```javascript
import { describe, it, expect } from 'vitest';   // specs
import { afterEach } from 'vitest';               // setup.js (for RTL cleanup)
```
`globals: true` is intentionally NOT set in the config — carried forward from backend
(D-03 note). This is the single most important cross-cutting convention: nothing is
ambient; everything from `vitest` is imported by name.

### Dedicated `test/` infra dir vs co-located specs
**Source:** `backend/test/` (globalSetup.js, guard.js, helpers.js) vs `backend/src/smoke.test.js`
**Apply to:** file placement decisions
- Shared/infra (the setup file) → `frontend/test/setup.js`.
- Actual specs → co-located `frontend/src/**/*.test.jsx`.
This split is backend D-06/D-07 carried forward.

### Standalone test config, dev/build config untouched
**Source:** `backend/vitest.config.js` exists separately from any vite build config
**Apply to:** `frontend/vitest.config.js` (new) — `frontend/vite.config.js` is NOT modified
(D-01). The React plugin is re-declared in the test config, not shared by import.

### ESM everywhere
**Source:** `"type": "module"` in both workspace `package.json` files
**Apply to:** all new files — use `import`/`export`, no `require`. Vitest runs ESM natively.

## No Analog Found

No files are fully without an analog. The jsdom-specific mechanics inside
`frontend/test/setup.js` (jest-dom registration, `matchMedia` stub, RTL `cleanup`) have no
backend equivalent because the backend runs in the node environment with a DB-provisioning
`globalSetup` instead. For those specific lines the planner should lean on RESEARCH.md /
official `@testing-library/jest-dom` + Vitest jsdom docs for exact API, while still copying
the *file placement, import style, and no-globals convention* from the backend harness.

| Concern | Role | Data Flow | Reason no code-analog |
|---------|------|-----------|-----------------------|
| jest-dom matcher registration | test-infra | transform | Backend uses node env, no DOM matchers |
| `window.matchMedia` stub | test-infra | transform | Backend has no browser globals to stub |
| RTL `afterEach(cleanup)` | test-infra | transform | Backend `globalSetup` is per-run, not per-test |

## Metadata

**Analog search scope:** `backend/` (vitest.config.js, package.json, src/smoke.test.js, test/), `frontend/` (vite.config.js, package.json, src/)
**Files scanned:** 9 (04-CONTEXT.md, backend/vitest.config.js, backend/src/smoke.test.js, backend/package.json, backend/test/globalSetup.js, backend/test/guard.test.js, frontend/vite.config.js, frontend/package.json, frontend/src/main.jsx, frontend/src/components/BrandMark.jsx)
**Pattern extraction date:** 2026-07-12
