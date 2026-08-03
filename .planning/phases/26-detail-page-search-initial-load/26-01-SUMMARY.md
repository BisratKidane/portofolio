---
phase: 26-detail-page-search-initial-load
plan: 01
subsystem: frontend-detail-page
tags: [react, mui, react-router, graphql, tdd]
dependency-graph:
  requires:
    - "backend familyHead / familyMember(id) queries (Phase 24)"
    - "PersonCard component (Phase 25)"
  provides:
    - "frontend/src/pages/DetailPage.jsx (route component, head-id -> person-by-id load path)"
    - "loadPersonById(id) uniform person-by-id fetch, reusable by 26-02's search-select"
  affects:
    - "frontend/src/App.jsx (route table)"
    - "frontend/src/components/AppLayout.jsx (top nav)"
tech-stack:
  added: []
  patterns:
    - "FamilyTreePage.jsx page-fetch idiom: useCallback loader + .then/.catch/.finally state trio"
    - "CircularProgress loading / Alert+Retry error / Alert info empty states"
key-files:
  created:
    - frontend/src/pages/DetailPage.jsx
    - frontend/src/pages/DetailPage.test.jsx
  modified:
    - frontend/src/App.jsx
    - frontend/src/components/AppLayout.jsx
decisions: []
metrics:
  duration: "~15 min"
  completed: "2026-08-03"
---

# Phase 26 Plan 01: DetailPage Shell (Initial Load) Summary

Built the `/detail` page shell: a protected route that opens on the family head via the uniform head-id -> person-by-id load path, rendering a single Phase-25 `PersonCard` with no descendants expanded, and wired the route into `App.jsx` plus a top-nav entry point in `AppLayout.jsx`.

## What Was Built

**`frontend/src/pages/DetailPage.jsx`** — the route component for `/detail`, mirroring `FamilyTreePage.jsx`'s fetch/loading/error idiom:
- Module-scope `FAMILY_HEAD_QUERY` (`familyHead { id }`) and `FAMILY_MEMBER_QUERY` (`familyMember(id: $id) { id fullname geezFullname gender isAlive photoUrl canEdit spouses { ... } children { id } }`) query constants.
- `loadPersonById(id)` — a `useCallback` that sets loading, calls `graphqlRequest(FAMILY_MEMBER_QUERY, { id })`, sets `mainPerson` on success (or leaves it `null` for the missing-person-info branch), sets an error string on catch, clears loading in `finally`. This single function is the D-04/D-05 path that Phase 26-02's suggestion-select will reuse.
- `loadInitial()` — a `useCallback` (run in a mount `useEffect`) that calls `familyHead`; if `null`, sets a `missingHead` flag (Alert `severity="info"`, D-08); otherwise chains into `loadPersonById(familyHead.id)` (the two-round-trip happy path, D-04).
- Five render branches, in order: loading (`CircularProgress` in a centered `Box`) -> failed-request (`Alert severity="error"` + a `Retry` `Button` that re-runs `loadInitial`) -> missing-family-head (`Alert severity="info"` "No family head found") -> missing-person-info (graceful `Typography` message, never an empty card) -> the happy path: a top-region placeholder `Box` (where 26-02 mounts search) plus a centered `PersonCard` with `role="Head"`, `spouse={mainPerson.spouses?.[0]}`, `expanded={false}`, and no-op `onExpand`/`onEdit` (per the Phase 25 advisory that these are invoked unguarded).
- `mainPerson` is held only in page state — no URL param (D-05).

**`frontend/src/pages/DetailPage.test.jsx`** — 6 tests covering all five behaviors: loading spinner; the two-round-trip happy path (asserts `familyHead` is called before `familyMember`, and `familyMember` receives `{ id: '1' }`, and exactly one `person-card-1` renders with role "Head"); failed-request + working Retry; missing-family-head info alert with `familyMember` never called; missing-person-info graceful message with no `person-card-*` testid present; and a crash-guard test confirming the no-op `onExpand`/`onEdit` handlers don't throw when clicked.

**`frontend/src/App.jsx`** — added the `DetailPage` import and `<Route path="detail" element={<DetailPage />} />` inside the existing no-args `<ProtectedRoute />` group (same group as `dashboard`/`manage`/`family`), so `/detail` is auth-gated for any authenticated user, not admin-only (D-06, T-26-01).

**`frontend/src/components/AppLayout.jsx`** — added a `Detail` nav `Button` (same `sx` as the other nav links) inside the authenticated `Stack`, positioned between `Family tree` and `Manage`, with no role guard (D-07). No `pathname === '/detail'` layout flag was added — `/detail` uses the existing default `Container maxWidth="lg"` centered branch.

## Deviations from Plan

None - plan executed exactly as written.

## TDD Gate Compliance

RED gate: commit `f4d5485` (`test(26-01): add failing test for DetailPage...`) — verified failing (module resolution error, `DetailPage.jsx` did not yet exist) before any implementation.
GREEN gate: commit `8fb9069` (`feat(26-01): implement DetailPage initial-load-on-head shell`) — all 6 tests pass immediately after.
No REFACTOR commit was needed (no cleanup required post-GREEN).

## Verification

- `npm test --workspace frontend -- DetailPage` — 6/6 passed.
- `npm test --workspace frontend` (full suite) — 349/349 passed, zero regressions.
- `grep -q 'path="detail"' frontend/src/App.jsx` — matched (inside the no-args `ProtectedRoute` group, confirmed by inspection).
- `grep -q 'to="/detail"' frontend/src/components/AppLayout.jsx` — matched.
- `grep -n "onExpand={() => {}}\|onEdit={() => {}}" frontend/src/pages/DetailPage.jsx` — both no-ops present.

## Known Stubs

None. The top-region placeholder `Box` in `DetailPage.jsx` (where Phase 26-02 mounts search) is an empty layout slot, not a data stub — no props flow into it and nothing renders there yet by design; it is explicitly documented in-code as a Phase 26-02 hookup point.

## Threat Flags

None. This plan mounts `/detail` inside the existing `ProtectedRoute` group per the plan's own threat model (T-26-01, mitigated by construction) and reads only existing Phase-24 authenticated resolvers (T-26-02, accepted, no new read surface).

## Self-Check: PASSED

- FOUND: frontend/src/pages/DetailPage.jsx
- FOUND: frontend/src/pages/DetailPage.test.jsx
- FOUND: commit f4d5485 (test(26-01): add failing test...)
- FOUND: commit 8fb9069 (feat(26-01): implement DetailPage...)
- FOUND: commit ee38642 (feat(26-01): mount /detail route and add Detail nav link)
