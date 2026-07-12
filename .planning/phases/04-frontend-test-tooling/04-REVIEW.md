---
phase: 04-frontend-test-tooling
reviewed: 2026-07-12T02:46:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - frontend/vitest.config.js
  - frontend/test/setup.js
  - frontend/src/harness.test.jsx
  - frontend/package.json
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-07-12T02:46:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

This phase adds dev-only frontend test tooling: a Vitest config, a jsdom setup
file (jest-dom matchers, RTL cleanup, a `matchMedia` stub), and a single harness
smoke test. The suite runs green locally (`npm test` → 2/2 passing) and correctly
follows project conventions (explicit Vitest imports, no `globals`, 2-space
indent, ESM). No security issues and no application runtime code touched, matching
the non-destructive constraint.

Two robustness/maintainability concerns were found that undermine the phase's own
goal of a test suite that "fails loudly locally and in CI." Neither breaks the
build today, but both are reproducibility risks that surface under a clean or
strict install.

Note on Node version: `frontend/package.json` pins `engines.node: "24.x"`, which
is consistent with the root `package.json`, `backend/package.json`, and `.nvmrc`
(all `24`). The "Node 18.x" language in CLAUDE.md is stale documentation drift,
not a defect in the reviewed files — no finding raised.

## Warnings

### WR-01: `@testing-library/dom` is a required peer dependency but is not declared

**File:** `frontend/package.json:26-34`
**Issue:** The harness test uses `render` and `screen` from
`@testing-library/react` v16. In RTL v16, `@testing-library/dom` was moved from a
bundled dependency to an explicit **peer dependency** (`"@testing-library/dom":
"^10.0.0"` in its `package.json`), and the official docs require installing it as a
direct devDependency. It is missing from `frontend/package.json`'s
`devDependencies`. It currently resolves only because npm 7+ auto-installs peer
deps (verified: `node_modules/@testing-library/dom@10.4.1` is present and pinned
in the lockfile). This makes the test suite depend on implicit, install-tool-specific
behavior: under `npm ci --legacy-peer-deps`, pnpm/yarn, an older npm, or a strict
CI resolver, `@testing-library/dom` may not be installed and every RTL test fails
with a confusing "Cannot find module" / undefined `screen` error. For a phase whose
purpose is reliable CI, this dependency must be explicit.
**Fix:**
```jsonc
"devDependencies": {
  "@testing-library/dom": "^10.4.1",
  "@testing-library/jest-dom": "^6.9.1",
  "@testing-library/react": "^16.3.2",
  // ...rest unchanged
}
```

### WR-02: Separate `vitest.config.js` silently overrides `vite.config.js` and can drift

**File:** `frontend/vitest.config.js:1-10`
**Issue:** The project already has `frontend/vite.config.js` (with the React plugin
and the `/graphql` dev proxy). When a standalone `vitest.config.js` exists, Vitest
loads it **instead of** `vite.config.js` — the two are not merged. The new file
re-declares `plugins: [react()]` in isolation, so any future `resolve.alias`, env
handling, or plugin added to `vite.config.js` will apply to dev/build but be
silently absent in tests (and vice versa). That is exactly the "works in dev, fails
in test" divergence class the testing foundation is meant to prevent, and it will
be hard to diagnose because both configs look plausible. Prefer a single source of
truth.
**Fix:** Merge from the existing Vite config instead of re-declaring:
```js
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.js';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./test/setup.js']
    }
  })
);
```
(Alternatively, move the `test` block into `vite.config.js` and delete this file.)

## Info

### IN-01: No root-level `test` script to aggregate workspace suites

**File:** `package.json` (repo root, `scripts`)
**Issue:** The root `package.json` has no `test` script, so `npm test` at the repo
root is a no-op/error and does not run the frontend (or backend) suite. CLAUDE.md's
core value is tests that fail loudly "locally and in CI." If a later CI phase owns
this, no action is needed now; flagged as Info so it is not lost.
**Fix:** Add to root `scripts`: `"test": "npm run test --workspaces --if-present"`.

### IN-02: `matchMedia` stub is fixed and not resettable between tests

**File:** `frontend/test/setup.js:6-19`
**Issue:** The stub is assigned once at module load via `window.matchMedia ||
function ...` and always returns `matches: false` with no-op listeners. It is
sufficient for the current MUI-free harness, but any future test asserting
responsive behavior cannot override `matches` per test, and the stub is not reset
in `afterEach` alongside `cleanup()`. Deprecated `addListener`/`removeListener` are
retained (fine — MUI still probes them). Low impact for now.
**Fix (when responsive tests arrive):** expose a `vi.fn()`-based mock so individual
tests can set `matches`, and reset it in the existing `afterEach`.

---

_Reviewed: 2026-07-12T02:46:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
