# Phase 4: Frontend Test Tooling - Context

**Gathered:** 2026-07-12
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers the frontend **test harness** — a working Vitest runner in a
jsdom environment, wired with React Testing Library and a shared setup file that
provides the browser globals MUI/React Router need — proven end-to-end by one
sample component test that renders a component and queries it by role/text.

It does NOT write the real auth-surface component tests (AuthContext,
ProtectedRoute, Login, Register) — those are Phase 5. This phase builds the
foundation Phase 5 consumes. Per SETUP-02, running `npm test` in the frontend
workspace must execute the configured runner and report pass/fail.

</domain>

<decisions>
## Implementation Decisions

### Vitest Config Location
- **D-01:** The frontend Vitest config lives in a **standalone `frontend/vitest.config.js`**, mirroring the backend's separate `backend/vitest.config.js` (Phase 1). Keeps test config isolated from the dev/build `vite.config.js`, and keeps the two workspaces consistent. The standalone config must re-declare the `@vitejs/plugin-react` plugin (so JSX transforms in tests), set `test.environment: 'jsdom'`, and register `test.setupFiles`. (Chosen over merging a `test` block into the existing `frontend/vite.config.js`.)

### Testing Toolkit Depth
- **D-02:** Install the **full RTL kit now**, not the bare minimum: `@testing-library/react` + `jsdom` + `@testing-library/jest-dom` (rich matchers like `toBeInTheDocument`) + `@testing-library/user-event`. Phase 5 tests the Login/Register forms (typing, clicks) and will need `user-event` and rich matchers — provisioning now means Phase 5 writes tests, not tooling. All added as `frontend` devDependencies.

### jsdom Global Setup
- **D-03:** A **single shared setup file** (referenced by `test.setupFiles`) handles three things: (1) registers the `@testing-library/jest-dom` matchers so `expect(...).toBeInTheDocument()` etc. work; (2) stubs the browser globals jsdom lacks — **`window.matchMedia`** is required (called out in the success criteria; MUI reads it); add other stubs (e.g. `ResizeObserver`) only if a real runtime error surfaces, not preemptively; (3) wires RTL **`afterEach(cleanup)`** so rendered trees are unmounted between tests. This is the one place Phase 5 relies on for its component tests.

### Sample Proof Test
- **D-04:** The Phase 4 proof is a **throwaway inline component defined in the spec itself**, rendered and then queried by role/text — fully self-contained, proving render + query + jsdom + matchers without coupling to real app code. Mirrors the backend `smoke.test.js` pattern. Real components (BrandMark, AuthContext, etc.) are covered in Phase 5.

### Carried Forward from Phase 1 (backend harness)
- **Runner:** Vitest, the single runner shared across both workspaces (one tool, less config surface). Invocation is `npm test --workspace frontend`; the `test` script is added to `frontend/package.json`.
- **Test file location:** co-located `src/**/*.test.jsx` specs (backend D-06). Any shared frontend test infra (the setup file) lives in a dedicated **`frontend/test/`** directory, distinct from co-located specs (backend D-07).
- **Import style:** explicit `import { describe, it, expect } from 'vitest'` — no `globals: true` (backend convention). Note: because globals are off, the setup file must import `afterEach` from `vitest` explicitly to wire RTL cleanup.

### Claude's Discretion
- Exact version pins for Vitest and the `@testing-library/*` / `jsdom` packages — defer to research/plan; pin to versions compatible with the frontend's React 18.3 / Vite 6 / `@vitejs/plugin-react` 4.3 stack.
- Precise filename(s) within `frontend/test/` (e.g. `setup.js`) and the exact `vitest.config.js` structure — planner to determine, respecting D-01..D-03.
- The exact `test` npm-script form (e.g. `vitest run`) — mirror backend, respecting workspace invocation.
- Whether a `matchMedia` stub is best written inline or via a tiny helper — planner's call, as long as it lands in the setup file (D-03).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Prior-phase pattern to mirror (backend harness)
- `.planning/phases/01-backend-test-tooling-test-database/01-CONTEXT.md` — The backend harness decisions this phase mirrors (standalone config, co-located specs, `test/` infra dir, explicit vitest imports, throwaway proof spec).
- `backend/vitest.config.js` — The standalone-config shape to mirror for `frontend/vitest.config.js` (D-01).
- `backend/src/smoke.test.js` — The throwaway proof-spec pattern (D-04).

### Codebase maps
- `.planning/codebase/TESTING.md` — Confirms zero existing frontend test tooling; notes the axios GraphQL client (`frontend/src/api/graphqlClient.js`) as a mock candidate for Phase 5.
- `.planning/codebase/STACK.md` — Frontend stack: React 18.3, Vite 6, `@vitejs/plugin-react` 4.3, MUI 6.3, Emotion, React Router 6.28 — version constraints for pinning test deps.
- `.planning/codebase/CONVENTIONS.md` — PascalCase `.jsx` component filenames and naming the co-located `*.test.jsx` specs should match.
- `.planning/codebase/STRUCTURE.md` — Frontend directory layout for placing `frontend/test/` and co-located specs.

### Code touchpoints
- `frontend/package.json` — Where the `test` script and the `@testing-library/*` + `jsdom` + `vitest` devDependencies are added.
- `frontend/vite.config.js` — Existing dev/build config; the standalone `vitest.config.js` re-declares the React plugin it uses (D-01), and this file is NOT modified for test config.
- `frontend/src/main.jsx` / `frontend/src/context/AuthContext.jsx` — Show the MUI ThemeProvider + Router + AuthProvider wrapping that Phase 5 tests will need (and why `matchMedia` must be stubbed in D-03).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/vitest.config.js` + `backend/src/smoke.test.js` — direct templates: standalone config shape and throwaway smoke-test pattern, adapted for jsdom + JSX.
- Root `npm workspaces` setup — `npm test --workspace frontend` slots in exactly like the backend workspace's test invocation.

### Established Patterns
- ESM throughout (`"type": "module"` in `frontend/package.json`) — Vitest runs natively, no transpile step beyond the React plugin's JSX transform.
- Co-located `<name>.test.*` specs + a dedicated `test/` infra dir (backend D-06/D-07) — carried forward to the frontend.
- Explicit `vitest` imports, no globals — carried forward (affects how cleanup is wired, see D-03 note).

### Integration Points
- New code connects at `frontend/package.json` (test script + devDeps), a new `frontend/vitest.config.js`, a new `frontend/test/` setup file, and new co-located `frontend/src/**/*.test.jsx` specs.
- No application runtime code is modified — the harness renders existing/throwaway components from the outside. `frontend/vite.config.js` is left untouched (D-01).

</code_context>

<specifics>
## Specific Ideas

- `window.matchMedia` is the concrete jsdom gap to close — it is named in the phase success criteria and is read by MUI; the setup file must stub it.
- The proof spec is deliberately throwaway/inline (not a real component) so it proves the harness without pre-empting Phase 5's real component tests.
- Full toolkit (`jest-dom` + `user-event`) lands in Phase 4 specifically so Phase 5 is pure test-writing.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Coverage reporting / thresholds and watch-mode ergonomics were noted as possible extras but are explicitly out of scope for this milestone per PROJECT.md; real auth-surface component tests are Phase 5; root-level combined test command and CI are Phase 6.)

</deferred>

---

*Phase: 4-Frontend Test Tooling*
*Context gathered: 2026-07-12*
