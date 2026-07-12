---
phase: 05-frontend-component-tests
reviewed: 2026-07-12T01:32:14Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - frontend/src/components/ProtectedRoute.test.jsx
  - frontend/src/context/AuthContext.test.jsx
  - frontend/src/pages/Login.test.jsx
  - frontend/src/pages/Register.test.jsx
  - frontend/test/setup.js
findings:
  critical: 0
  warning: 4
  info: 2
  total: 6
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-07-12T01:32:14Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Reviewed the four new frontend component test suites (ProtectedRoute, AuthContext,
Login, Register) plus the shared `test/setup.js`, each cross-referenced against its
source-of-truth component (`ProtectedRoute.jsx`, `AuthContext.jsx`, `Login.jsx`,
`Register.jsx`, `graphqlClient.js`).

Assessment: the tests are **correct and non-flaky** — mock hoisting is sound, module
mocks are scoped per file, `localStorage` and mocks are cleared in `beforeEach`/
`afterEach`, and each queued `mockResolvedValueOnce` is consumed within its own test.
The claimed behaviors are genuinely asserted, not rubber-stamped: login stores the
token, logout clears it, ProtectedRoute redirects/renders/loads, and Login/Register
navigate on success and show an alert on error.

However, for a milestone whose entire value proposition is "auth is protected by a
suite that fails loudly," there are meaningful **gaps in exactly the branches that
matter most for auth correctness** — the positive authorization path and the
invalid-token cleanup path are both untested — plus assertion-strength and isolation-
robustness concerns. No BLOCKERs: nothing here is incorrect, but the safety net has
holes where auth regressions could slip through.

## Warnings

### WR-01: ProtectedRoute positive role-authorization branch is never tested

**File:** `frontend/src/components/ProtectedRoute.test.jsx:50-65`
**Issue:** The suite claims to cover ProtectedRoute "role branches" (FE-02), but only
two of the three `allowedRoles` outcomes are exercised:
- `allowedRoles: undefined` → renders (line 50-56), which short-circuits on the
  `allowedRoles &&` falsy check and never reaches `.includes()`.
- `allowedRoles: ['ADMIN']` with a `USER` → redirects to `/dashboard` (line 58-65),
  the **deny** path.

The **allow** path — `allowedRoles` defined AND `allowedRoles.includes(user.role)`
returns `true` (e.g. `allowedRoles: ['USER']` with a `USER`, or `['ADMIN']` with an
`ADMIN`) → renders the protected `<Outlet />` — is never asserted. This is the single
most important authorization case (an authorized user actually seeing gated content),
and a regression that inverts the role check (`allowedRoles.includes` →
`!allowedRoles.includes`) would still pass the current suite.
**Fix:** Add a test that proves the allow branch renders:
```jsx
it('renders the protected route when the user role IS in allowedRoles', () => {
  useAuthMock.mockReturnValue({ loading: false, user: { id: 1, role: 'ADMIN' } });
  renderProtectedRoute({ allowedRoles: ['ADMIN'] });
  expect(screen.getByText('Admin Sentinel')).toBeInTheDocument();
});
```

### WR-02: AuthContext invalid/expired-token cleanup path is untested

**File:** `frontend/src/context/AuthContext.test.jsx:46-60`
**Issue:** `loadUser` in `AuthContext.jsx:36-43` has a security-relevant branch: when a
token is present but `graphqlRequest(ME_QUERY)` rejects (expired/invalid token), it
runs `localStorage.removeItem('authToken')` and leaves `user` null. The suite tests
only the happy path (`mockResolvedValueOnce({ me: ... })`, line 48). The reject/cleanup
branch — which is what protects a user from a stale or forged token silently keeping
them "logged in" — is never exercised. FE-01 claims "token/user storage + clearing";
the clear-on-invalid-token behavior is part of that contract and is unverified.
**Fix:** Add a test for the failure path:
```jsx
it('clears the stored token when the me query rejects on mount', async () => {
  localStorage.setItem('authToken', 'stale-token');
  graphqlRequest.mockRejectedValueOnce(new Error('Invalid token'));
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByText('authed:false')).toBeInTheDocument());
  expect(localStorage.getItem('authToken')).toBeNull();
});
```

### WR-03: Login/Register success tests never assert the typed credentials reach the API

**File:** `frontend/src/pages/Login.test.jsx:37-52`, `frontend/src/pages/Register.test.jsx:37-53`
**Issue:** The success tests type into the fields and assert `navigateSpy` was called
with `/dashboard`, but `graphqlRequest` is mocked to resolve regardless of its
arguments and is never inspected. As a result a real wiring regression — e.g. the form
sending an empty email, swapping name/email, or passing stale state — would still
navigate and pass the test. The test proves "submit → navigate" but not "the user's
input was actually submitted," which is the substance of a login/registration flow.
**Fix:** Assert the mock was called with the typed values, e.g.:
```jsx
expect(graphqlRequest).toHaveBeenCalledWith(
  expect.stringContaining('login'),
  { email: 'ada@example.com', password: 'secret123' }
);
```
(and the `register` equivalent with `{ name, email, password }`).

### WR-04: Suite relies on `clearAllMocks` not draining the `mockResolvedValueOnce` queue

**File:** `frontend/src/context/AuthContext.test.jsx:26-29`, `frontend/src/pages/Login.test.jsx:21-24`, `frontend/src/pages/Register.test.jsx:21-24`
**Issue:** Every test uses `vi.clearAllMocks()` in `beforeEach`. `clearAllMocks()` resets
call history but does **not** reset queued implementations added via
`mockResolvedValueOnce`/`mockRejectedValueOnce`. The suite currently works only because
every queued value happens to be consumed inside the same test. This is fragile for a
"test foundation" whose goal is reliability: if a future edit adds an unconsumed
`...Once` (e.g. a test that mounts but never triggers the mutation), the leftover
resolution silently leaks into the next test's first `graphqlRequest` call and produces
a confusing cross-test failure or false pass. The isolation guarantee is implicit, not
enforced.
**Fix:** Use `vi.resetAllMocks()` in `beforeEach` (drains the once-queue and clears
implementations), or set an explicit default implementation per test. Prefer
`resetAllMocks` for the mutation-driven suites (AuthContext/Login/Register). Note
ProtectedRoute.test uses `mockReturnValue` (overwritten each test), so it is unaffected.

## Info

### IN-01: Login and Register test files are near-verbatim duplicates

**File:** `frontend/src/pages/Login.test.jsx:1-68`, `frontend/src/pages/Register.test.jsx:1-68`
**Issue:** The two files are identical except for the mutation key (`login`/`register`),
one extra "Full name" field, button label, and error string. The `vi.hoisted` navigate
spy, the `react-router-dom` mock, the `beforeEach`, and the `renderX` helper are copied
verbatim. Divergence risk as the suite grows.
**Fix:** Optional — extract a shared `renderWithProviders`/navigate-spy helper into
`frontend/test/` and import it into both suites. Low priority; duplication in tests is
often acceptable for readability.

### IN-02: Login/Register success tests don't assert the error alert is absent

**File:** `frontend/src/pages/Login.test.jsx:37-52`, `frontend/src/pages/Register.test.jsx:37-53`
**Issue:** The success tests confirm navigation but not that no `role="alert"` was
rendered, and the button's `disabled`/loading-label transition (`Signing in…` /
`Creating account…` from `Login.jsx:69` / `Register.jsx:72`) is never checked. These are
minor UI states within the FE-03/FE-04 "success + error states" scope.
**Fix:** Optional — add `expect(screen.queryByRole('alert')).not.toBeInTheDocument()` to
the success cases; optionally assert the loading label appears mid-submit.

---

_Reviewed: 2026-07-12T01:32:14Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
