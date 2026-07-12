# Phase 5: Frontend Component Tests - Context

**Gathered:** 2026-07-12
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase writes **component tests** for the four auth-critical frontend
surfaces, proving they behave correctly for authenticated and unauthenticated
users. It satisfies FE-01, FE-02, FE-03, FE-04:

- **AuthContext** (FE-01): stores and exposes the token + user after login, and
  clears both on logout.
- **ProtectedRoute** (FE-02): redirects unauthenticated users away and renders
  children (the `<Outlet/>`) for authenticated users.
- **Login page** (FE-03): submits credentials and handles both the success and
  error response states.
- **Register page** (FE-04): submits registration input and handles both the
  success and error response states.

It consumes the Phase-4 harness (Vitest runner + jsdom + React Testing Library +
`@testing-library/user-event` + `@testing-library/jest-dom`, all already
installed; `frontend/vitest.config.js`; the shared `frontend/test/setup.js` with
`matchMedia` stub and RTL `afterEach(cleanup)`) and the co-located
`src/**/*.test.jsx` convention.

It does NOT modify any application runtime code (non-destructive), does NOT add
CI or a root-level combined test command (Phase 6), does NOT touch the backend
(Phases 1–3), and does NOT add browser E2E (v2 / E2E-01).

</domain>

<decisions>
## Implementation Decisions

### Network mock seam (underlies all four tests)
- **D-01:** Tests cut the network boundary by **mocking the shared
  `graphqlRequest` module** — `vi.mock('../api/graphqlClient.js')` (path
  relative to each spec) and stubbing `graphqlRequest` per test. This is the one
  function every surface flows through (AuthContext calls it directly; the pages
  reach it via `login`/`register`). No MSW dependency and no axios-level mocking.
  Rationale: the backend already integration-tests the real GraphQL layer end to
  end (Phase 3), so re-driving the network from the frontend adds little value at
  much higher setup cost. (Chosen over MSW and over mocking the axios instance.)
- **D-02:** Per test, `graphqlRequest` is stubbed to **resolve** with a
  GraphQL-shaped success payload (e.g. `{ login: { token, user } }`,
  `{ register: { ... } }`, `{ me: { id, name, email, role } }`) or to **reject**
  with an `Error` to drive the failure paths — mirroring exactly what the real
  `graphqlRequest` returns (`response.data.data`) or throws. No network, no
  axios, no `import.meta.env` involvement.

### Page test altitude (Login / Register)
- **D-03:** Login and Register are tested **through the real `AuthProvider`**
  with `graphqlRequest` mocked (D-01) — the full page → context → client slice.
  Submitting the form really calls `useAuth().login/register`, which really runs
  `authenticate()` and writes `localStorage`. Chosen over mocking `useAuth()`:
  higher confidence per line, and it reuses the same seam as the AuthContext
  test rather than introducing a second isolation strategy. (Planner: wrap each
  page in `<AuthProvider>` and a router; the AuthProvider's `me`-on-mount effect
  is inert here because no `authToken` is seeded before rendering the page.)

### Success-path / navigation assertion (Login / Register)
- **D-04:** Assert the happy path by **partial-mocking `react-router-dom`** —
  `vi.mock('react-router-dom', async (importOriginal) => ({ ...await
  importOriginal(), useNavigate: () => navigateSpy }))` — then assert
  `navigateSpy` was called with `'/dashboard'` after a successful submit. Keep
  the rest of `react-router-dom` real (`Link`, `MemoryRouter`, etc. that the
  pages/AuthShell use). Chosen over a real `MemoryRouter` + stub `/dashboard`
  route: same signal, far less scaffolding.
- **D-05:** The **error path** drives the mocked `graphqlRequest` to reject, then
  asserts (a) the MUI `<Alert severity="error">` renders with the rejected
  error's message, and (b) `navigateSpy` was **not** called — success and failure
  are the two states the success criteria name for FE-03/FE-04.

### AuthContext driving pattern (FE-01)
- **D-06:** Drive `useAuth()` via a **probe consumer component** — a tiny test
  component that calls `useAuth()`, renders `user`/`loading`/`isAuthenticated`,
  and exposes `login`/`logout` buttons wired to the context functions — driven
  with `@testing-library/user-event` (already installed). Tests the provider
  exactly as the app consumes it and stays uniform with the other three specs.
  (Chosen over `renderHook`; close call, but the probe is more representative of
  real render + DOM behavior and consistent with the page tests.)
- **D-07:** Control the `me`-on-mount effect via **`localStorage`**: for the
  "no token → no `me` call, not authenticated" baseline, render with an empty
  `localStorage`; for flows that exercise the authenticated-on-load path, seed
  `localStorage.setItem('authToken', ...)` **before** render and stub
  `graphqlRequest` to resolve `{ me: ... }`. The **logout** assertion: after
  login (token + user present), click logout, then assert `user` is cleared,
  `isAuthenticated` is false, and `localStorage.getItem('authToken')` is `null`.

### Claude's Discretion
- **Per-test `localStorage` isolation** — clear `localStorage` between tests
  (e.g. `localStorage.clear()` in a `beforeEach`/`afterEach`, or add it to
  `frontend/test/setup.js`). Planner's call where it lives, as long as no token
  leaks across tests. jsdom provides a real `localStorage`.
- **Exact error message strings** asserted on the failure paths (D-05) — pick
  representative messages; the point is that the rejected error's `.message`
  reaches the `<Alert>`, not any specific backend string.
- **Spec file layout** — follow co-located `src/**/*.test.jsx` (Phase 4). Whether
  it's one file per surface (`AuthContext.test.jsx`, `ProtectedRoute.test.jsx`,
  `Login.test.jsx`, `Register.test.jsx`) or grouped is planner discretion; one
  per surface is the natural default.
- **Removing the Phase-4 throwaway proof spec** `frontend/src/harness.test.jsx`
  — it was explicitly throwaway (Phase 4 D-04); Phase 5 may delete it once the
  real specs land, or leave it (harmless). Planner's call.
- **Shared render helper** — whether to add a small helper (e.g. render a
  component inside `AuthProvider` + router) under `frontend/test/` to cut
  per-spec boilerplate. Add if it reduces repetition; not mandated.
- **ProtectedRoute (FE-02) wiring** — planner determines exact setup, but it
  follows directly from the locked decisions: mock/stub `useAuth()`'s return (or
  render inside a real `AuthProvider` with a seeded user) and a `MemoryRouter`
  with a `/login` and a protected child route, then assert redirect-to-`/login`
  for `user: null`, the `<CircularProgress>` for `loading: true`, and the child
  `<Outlet/>` content for an authenticated user (plus the `allowedRoles` →
  redirect-to-`/dashboard` branch, opportunistically).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 4 foundation (the harness this phase builds on)
- `.planning/phases/04-frontend-test-tooling/04-CONTEXT.md` — Locked
  frontend-harness decisions: standalone `vitest.config.js` (D-01), full RTL kit
  incl. `user-event` + `jest-dom` (D-02), shared setup file with `matchMedia`
  stub + `afterEach(cleanup)` (D-03), co-located `*.test.jsx` specs, explicit
  `vitest` imports (no globals).
- `frontend/vitest.config.js` — The runner config: `@vitejs/plugin-react`,
  `environment: 'jsdom'`, `setupFiles: ['./test/setup.js']`.
- `frontend/test/setup.js` — Shared setup: `jest-dom` matchers, `matchMedia`
  stub (MUI needs it), RTL `afterEach(cleanup)`. Extend HERE for any new global
  test infra (e.g. `localStorage.clear()`).
- `frontend/src/harness.test.jsx` — The throwaway proof spec pattern
  (render + query-by-role/text with explicit `vitest` imports) to mirror; may be
  removed once real specs land (see Claude's Discretion).

### Code under test (read to write the specs)
- `frontend/src/context/AuthContext.jsx` — `AuthProvider` + `useAuth`. The
  `me`-on-mount `useEffect` (fires only when `authToken` in `localStorage`),
  `authenticate()` (writes `localStorage.setItem('authToken', payload.token)`,
  `setUser`), `login`/`register`/`logout`, `isAuthenticated`, and the
  `ME_QUERY`/`LOGIN_MUTATION`/`REGISTER_MUTATION`/`LOGOUT_MUTATION` strings. The
  seam it depends on is `graphqlRequest` (D-01).
- `frontend/src/api/graphqlClient.js` — The mock target (D-01): `graphqlRequest`
  returns `response.data.data` or throws an `Error` (from `errors[]` or a
  network failure). This is the contract stubs must mimic (D-02).
- `frontend/src/components/ProtectedRoute.jsx` — `loading → <CircularProgress>`,
  `!user → <Navigate to="/login" replace/>`, `allowedRoles` mismatch →
  `<Navigate to="/dashboard" replace/>`, else `<Outlet/>`. Uses `useAuth`.
- `frontend/src/pages/Login.jsx` — `handleSubmit` → `login(email,password)` →
  `navigate('/dashboard')`; `catch` sets `error` → MUI `<Alert>`; `finally`
  resets loading. Fields: `TextField` "Email address" / "Password", submit
  button "Sign in" / "Signing in…".
- `frontend/src/pages/Register.jsx` — Same shape with `register(name,email,
  password)`; fields "Full name" / "Email address" / "Password", button "Create
  account" / "Creating account…".
- `frontend/src/components/AuthShell.jsx` — Presentational wrapper the pages
  render inside (uses `react-router-dom` `Link`); relevant to what the partial
  `react-router-dom` mock (D-04) must keep real.

### Codebase maps
- `.planning/codebase/TESTING.md` — Notes the axios GraphQL client as the mock
  candidate for frontend component tests (confirms the D-01 seam).
- `.planning/codebase/CONVENTIONS.md` — PascalCase `.jsx` naming the co-located
  `*.test.jsx` specs must match; `handle`-prefixed handlers.
- `.planning/codebase/STACK.md` — React 18.3 / Vite 6 / MUI 6.3 / React Router
  6.28 versions the tests run against.

### Requirements
- `.planning/REQUIREMENTS.md` — FE-01..FE-04 (the four surfaces + their
  success/error states).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/test/setup.js` — provides `jest-dom` matchers, `matchMedia`, and RTL
  cleanup for free; the place to add `localStorage` isolation if desired.
- `@testing-library/user-event` — already installed (Phase 4 D-02) for driving
  form typing/clicks (Login/Register submits, AuthContext probe buttons).
- `graphqlRequest` as a single mock seam — one `vi.mock` covers AuthContext and
  (transitively) both pages.

### Established Patterns
- ESM + native Vitest; explicit `import { describe, it, expect, vi } from
  'vitest'` (no globals) — mirror `frontend/src/harness.test.jsx`.
- Co-located `<Name>.test.jsx` specs beside the components under test.
- Resolvers/context flow through `graphqlRequest`; the frontend has no GraphQL
  client library (plain axios wrapper), so the mock seam is a plain module mock.

### Integration Points
- New spec files only under `frontend/src/**/*.test.jsx` (four surfaces),
  optionally a small render helper under `frontend/test/`. No application source
  is modified — components are rendered from the outside with the network seam
  and (for pages) `useNavigate` mocked.

</code_context>

<specifics>
## Specific Ideas

- Mock seam: `vi.mock('../api/graphqlClient.js')` → stub `graphqlRequest` to
  resolve `{ login: { token, user } }` / `{ register: {...} }` / `{ me: {...} }`
  or reject `new Error('...')`.
- Nav: `vi.mock('react-router-dom', async (io) => ({ ...await io(), useNavigate:
  () => navigateSpy }))`; assert `navigateSpy` called with `'/dashboard'` on
  success, NOT called on error.
- Page error path: reject `graphqlRequest` → assert the `<Alert>` shows the
  error message.
- AuthContext logout: after a login sets token+user, click logout → assert
  `user` cleared, `isAuthenticated` false, `localStorage.getItem('authToken')`
  is `null`.
- AuthContext `me`-on-mount: seed `localStorage.setItem('authToken', 't')` before
  render + stub `graphqlRequest` → `{ me: {...} }` to exercise the load-on-mount
  authenticated path; empty `localStorage` → not authenticated, no `me` call.
- ProtectedRoute: `MemoryRouter` with `/login` + a protected child route; assert
  redirect for `user:null`, `<CircularProgress>` for `loading:true`, child
  content for an authenticated user.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

- Root-level combined test command + GitHub Actions CI are Phase 6 (SETUP-03,
  CI-01..03).
- Browser E2E (register → login → protected route) is v2 / E2E-01.
- Coverage reporting / thresholds and lint/format gates are v2 (QUAL-01/02).
- Testing non-auth surfaces (Dashboard, ForgotPassword, ResetPassword,
  AppLayout) is out of scope — this phase covers only the four auth-critical
  surfaces named in FE-01..04.

</deferred>

---

*Phase: 5-Frontend Component Tests*
*Context gathered: 2026-07-12*
