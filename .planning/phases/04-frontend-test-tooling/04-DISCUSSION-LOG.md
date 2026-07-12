# Phase 4: Frontend Test Tooling - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-12
**Phase:** 4-Frontend Test Tooling
**Areas discussed:** Vitest config location, Testing toolkit depth, jsdom global setup, Sample proof test

---

## Vitest Config Location

| Option | Description | Selected |
|--------|-------------|----------|
| Standalone vitest.config.js | Separate `frontend/vitest.config.js` mirroring the backend; re-declares the React plugin; keeps test config isolated from dev/build; consistent with Phase 1. | ✓ |
| Merge into vite.config.js | Add a `test` block to the existing `frontend/vite.config.js` — Vitest's native pattern, plugin already wired, but test config sits inside dev/build config. | |

**User's choice:** Standalone vitest.config.js
**Notes:** Chosen for cross-workspace consistency with the backend harness (Phase 1).

---

## Testing Toolkit Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Full kit now | `@testing-library/react` + jsdom + `@testing-library/jest-dom` + `@testing-library/user-event` installed now, so Phase 5 writes tests not tooling. | ✓ |
| Minimum only | Just `@testing-library/react` + jsdom for the sample test; defer matchers and user-event to Phase 5. | |

**User's choice:** Full kit now
**Notes:** Phase 5 tests Login/Register forms (typing, clicks) and needs user-event + rich matchers.

---

## jsdom Global Setup

| Option | Description | Selected |
|--------|-------------|----------|
| Full setup file | One setupFiles module: registers jest-dom matchers, stubs matchMedia (others only on real error), wires RTL afterEach(cleanup). | ✓ |
| Matchers auto-import only | Use `@testing-library/jest-dom/vitest` auto-registration + Vitest built-in cleanup, add only a matchMedia stub. | |
| Minimal — matchMedia only | Stub only matchMedia; defer matchers and cleanup wiring to Phase 5. | |

**User's choice:** Full setup file
**Notes:** One place Phase 5 relies on; matchMedia explicitly required per success criteria.

---

## Sample Proof Test

| Option | Description | Selected |
|--------|-------------|----------|
| Throwaway component | Render a tiny inline component defined in the spec, query by role/text; self-contained, mirrors backend smoke.test.js. | ✓ |
| Real component (BrandMark) | Render an existing trivial component to prove RTL against real app code; stronger signal but overlaps Phase 5 and couples to a file. | |

**User's choice:** Throwaway component
**Notes:** Keeps the proof self-contained; real components covered in Phase 5.

---

## Claude's Discretion

- Exact version pins for Vitest and `@testing-library/*` / `jsdom` (compatible with React 18.3 / Vite 6 / plugin-react 4.3).
- Precise filename(s) within `frontend/test/` and exact `vitest.config.js` structure.
- Exact `test` npm-script form (mirror backend `vitest run`).
- Inline vs helper form of the `matchMedia` stub, as long as it lands in the setup file.

## Deferred Ideas

None — discussion stayed within phase scope. Coverage reporting/thresholds and watch-mode ergonomics are out of scope for this milestone (PROJECT.md); real auth-surface component tests are Phase 5; root-level combined test command and CI are Phase 6.
