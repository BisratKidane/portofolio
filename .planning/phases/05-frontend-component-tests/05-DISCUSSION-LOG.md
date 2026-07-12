# Phase 5: Frontend Component Tests - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-12
**Phase:** 5-Frontend Component Tests
**Areas discussed:** Network mock seam, Page test altitude, Success/nav assertion, AuthContext driving

---

## Network mock seam

| Option | Description | Selected |
|--------|-------------|----------|
| Mock graphqlRequest | vi.mock the shared module; stub graphqlRequest per test. One function all four surfaces flow through; no new dep; backend already integration-tests the real GraphQL layer. | ✓ |
| Add MSW | Intercept at fetch/XHR layer, most realistic, but a new devDependency + handler setup that duplicates backend coverage. | |
| Mock axios instance | Stub the axios client below graphqlRequest; couples to axios internals + error-mapping logic, more brittle. | |

**User's choice:** Mock graphqlRequest (recommended)
**Notes:** Central decision — underlies all four tests. Justified by Phase 3 already owning real GraphQL-layer coverage.

---

## Page test altitude

| Option | Description | Selected |
|--------|-------------|----------|
| Real AuthProvider + mocked seam | Render Login/Register inside the real AuthProvider with graphqlRequest mocked; full page→context→client slice. | ✓ |
| Mock useAuth() | Replace useAuth() with a fake { login, register }; isolates the page but skips the context wiring. | |

**User's choice:** Real AuthProvider + mocked seam (recommended)
**Notes:** Reuses the same seam as the AuthContext test; highest confidence per line.

---

## Success/nav assertion

| Option | Description | Selected |
|--------|-------------|----------|
| Mock useNavigate | Partial-mock react-router-dom; assert navigate called with '/dashboard' on success, not called on error. | ✓ |
| Real MemoryRouter + routes | Wrap in a MemoryRouter with a stub /dashboard route and assert its content renders. More setup for the same signal. | |

**User's choice:** Mock useNavigate (recommended)
**Notes:** Keep the rest of react-router-dom real (Link, MemoryRouter used by pages/AuthShell).

---

## AuthContext driving

| Option | Description | Selected |
|--------|-------------|----------|
| Probe consumer component | Tiny test component calls useAuth(), renders values, exposes login/logout buttons driven with user-event; seed localStorage before render for me-on-mount. | ✓ |
| renderHook | @testing-library/react renderHook; call login/logout via act(). Cleaner for a pure hook, less representative of real render. | |

**User's choice:** Probe consumer component (recommended)
**Notes:** Uniform with the other three specs; user-event already installed. Close call vs renderHook.

---

## Claude's Discretion

- Per-test `localStorage` isolation (where `localStorage.clear()` lives).
- Exact error message strings asserted on the failure paths.
- Spec file layout (one file per surface is the natural default).
- Removing the Phase-4 throwaway `frontend/src/harness.test.jsx` once real specs land.
- Whether to add a shared render helper under `frontend/test/`.
- ProtectedRoute (FE-02) exact wiring — follows directly from the locked seam + router decisions.

## Deferred Ideas

None — discussion stayed within phase scope. (Root command + CI → Phase 6; browser E2E → v2/E2E-01; coverage/lint gates → v2/QUAL-01/02; non-auth surfaces out of scope.)
