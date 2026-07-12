# Phase 5: Frontend Component Tests - Pattern Map

**Mapped:** 2026-07-12
**Files analyzed:** 5 (4 required specs + 1 optional helper)
**Analogs found:** 5 / 5 (all role-match via the Phase-4 harness; the module-mock seam itself is new — no prior `vi.mock` usage anywhere in the repo, documented under "No Analog Found")

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `frontend/src/context/AuthContext.test.jsx` | test | event-driven (context state via probe component) | `frontend/src/harness.test.jsx` (render scaffold) + `frontend/src/context/AuthContext.jsx` (subject) | role-match |
| `frontend/src/components/ProtectedRoute.test.jsx` | test | request-response (route guard / redirect) | `frontend/src/harness.test.jsx` (render scaffold) + `frontend/src/App.jsx` (real route nesting) | role-match |
| `frontend/src/pages/Login.test.jsx` | test | request-response (form submit + navigation) | `frontend/src/harness.test.jsx` (render scaffold) + `frontend/src/pages/Login.jsx` (subject) | role-match |
| `frontend/src/pages/Register.test.jsx` | test | request-response (form submit + navigation) | `frontend/src/harness.test.jsx` (render scaffold) + `frontend/src/pages/Register.jsx` (subject) | role-match |
| `frontend/test/renderWithProviders.js` (optional helper, Claude's discretion) | utility | transform (test setup) | `frontend/test/setup.js` | role-match |

All four specs share one role (`test`) and are all ultimately `request-response`/`event-driven` flows gated behind the same seam (`graphqlRequest`). There is exactly one prior frontend test file in the repo (`harness.test.jsx`, Phase 4 throwaway), so it is the analog for import style and render/query mechanics for *all four* specs. The `vi.mock` module-replacement pattern itself (D-01) has **no prior analog anywhere in the codebase** (backend tests use plain stub objects/closures, never `vi.mock` — see `backend/src/utils/auth.test.js`). That seam is documented under "No Analog Found" below, with the concrete recipe pulled directly from CONTEXT.md's locked decisions and the real `graphqlRequest` contract.

---

## Pattern Assignments

### `frontend/src/context/AuthContext.test.jsx` (test, event-driven)

**Analog:** `frontend/src/harness.test.jsx` (scaffold) + `frontend/src/context/AuthContext.jsx` (subject, read in full)

**Imports pattern** (`harness.test.jsx` lines 1-2 — explicit imports, no globals):
```javascript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
```
For this spec, extend with `vi`, `beforeEach`, `afterEach` from `vitest`, plus `userEvent` from `@testing-library/user-event`, plus the subject:
```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from './AuthContext.jsx';
```

**Render + query-by-role pattern** (`harness.test.jsx` lines 9-15 — the mechanic to mirror):
```javascript
render(<HarnessProbe />);
expect(
  screen.getByRole('heading', { name: 'Frontend test harness is wired up' })
).toBeInTheDocument();
```
Apply the same `render` → `screen.getByRole`/`getByText` shape to the probe consumer (D-06). A probe component reads directly off `useAuth()`:
```javascript
function Probe() {
  const { user, loading, isAuthenticated, login, logout } = useAuth();
  return (
    <div>
      <span>loading:{String(loading)}</span>
      <span>authed:{String(isAuthenticated)}</span>
      <span>user:{user ? user.name : 'none'}</span>
      <button onClick={() => login('ada@example.com', 'secret')}>login</button>
      <button onClick={() => logout()}>logout</button>
    </div>
  );
}
```

**Subject seam to mock** (`AuthContext.jsx` lines 30-46, 48-54, 62-69 — the exact contract the mock must satisfy):
```javascript
// me-on-mount (lines 30-46)
useEffect(() => {
  async function loadUser() {
    if (!localStorage.getItem('authToken')) { setLoading(false); return; }
    try {
      const data = await graphqlRequest(ME_QUERY);
      setUser(data.me);
    } catch { localStorage.removeItem('authToken'); }
    finally { setLoading(false); }
  }
  loadUser();
}, []);

// authenticate (lines 48-54) — used by both login() and register()
const authenticate = async (mutation, variables) => {
  const data = await graphqlRequest(mutation, variables);
  const payload = data.login || data.register;
  localStorage.setItem('authToken', payload.token);
  setUser(payload.user);
  return payload.user;
};

// logout (lines 62-69)
logout: async () => {
  try { if (localStorage.getItem('authToken')) await graphqlRequest(LOGOUT_MUTATION); }
  finally { localStorage.removeItem('authToken'); setUser(null); }
}
```
Per CONTEXT.md D-07: seed `localStorage.setItem('authToken', 'seed-token')` **before** `render()` and stub `graphqlRequest` to resolve `{ me: {...} }` to drive the authenticated-on-mount branch; render with empty `localStorage` for the baseline (no `me` call, `isAuthenticated === false`). Drive `login`/`logout` via `userEvent.click` on the probe's buttons, then assert on the rendered spans and `localStorage.getItem('authToken')`.

**Isolation:** `beforeEach(() => localStorage.clear())` local to this spec, or move to `frontend/test/setup.js` (Claude's discretion, CONTEXT.md).

---

### `frontend/src/components/ProtectedRoute.test.jsx` (test, request-response)

**Analog:** `frontend/src/harness.test.jsx` (scaffold) + `frontend/src/components/ProtectedRoute.jsx` (subject) + `frontend/src/App.jsx` (real route nesting to mirror)

**Subject branches to cover** (`ProtectedRoute.jsx` full file, 21 lines):
```javascript
export default function ProtectedRoute({ allowedRoles }) {
  const { loading, user } = useAuth();
  if (loading) return (<Box ...><CircularProgress /></Box>);
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
```

**Real route-nesting shape to mirror** (`App.jsx` lines 12-23 — how `ProtectedRoute` is composed with `MemoryRouter`-equivalent `Routes`):
```javascript
<Routes>
  <Route element={<AppLayout />}>
    <Route path="login" element={<Login />} />
    <Route element={<ProtectedRoute />}>
      <Route path="dashboard" element={<Dashboard />} />
    </Route>
  </Route>
</Routes>
```
For the test, replace `AppLayout`/real pages with a `MemoryRouter initialEntries={['/dashboard']}` wrapping a minimal `Routes` tree (`/login` route + a `ProtectedRoute` parent wrapping a `/dashboard` child that renders sentinel text), since `ProtectedRoute` itself only renders `<Outlet/>`. Since `useAuth()` is the only dependency, mock `../context/AuthContext.jsx`'s `useAuth` export directly (`vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => stubValue }))`) rather than mounting a real `AuthProvider` — simplest way to hit `loading`/`user:null`/`allowedRoles` branches independently, per CONTEXT.md discretion.

**Assertions to write:**
- `loading: true` → `screen.getByRole('progressbar')` (MUI `CircularProgress` default role).
- `user: null` → renders redirected content (the `/login` route's sentinel) via `MemoryRouter`.
- `user: { role: 'USER' }`, no `allowedRoles` → child route content (`Outlet`) renders.
- `allowedRoles: ['ADMIN']`, `user.role: 'USER'` → redirected to `/dashboard` sentinel (opportunistic, per CONTEXT.md).

---

### `frontend/src/pages/Login.test.jsx` (test, request-response)

**Analog:** `frontend/src/harness.test.jsx` (scaffold) + `frontend/src/pages/Login.jsx` (subject, full file) + `frontend/src/api/graphqlClient.js` (mock contract)

**Subject fields/copy to query by** (`Login.jsx` lines 45-70 — exact label/button text the tests must match):
```javascript
<TextField label="Email address" type="email" ... />
<TextField label="Password" type="password" ... />
<Button type="submit" ...>{loading ? 'Signing in…' : 'Sign in'}</Button>
```
`handleSubmit` (`Login.jsx` lines 14-26 — the flow under test):
```javascript
const handleSubmit = async (event) => {
  event.preventDefault();
  setError('');
  setLoading(true);
  try {
    await login(form.email, form.password);
    navigate('/dashboard');
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
};
```

**Mock seam contract** (`graphqlClient.js` lines 23-36 — what the `vi.mock` stub must faithfully reproduce):
```javascript
export async function graphqlRequest(query, variables = {}) {
  // success: returns response.data.data, e.g. { login: { token, user } }
  // failure: throws new Error(<message>) — from GraphQL errors[] or network failure
}
```
Test-side mock (D-01, D-02 — no existing repo analog, this is the new pattern to introduce):
```javascript
vi.mock('../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));
import { graphqlRequest } from '../api/graphqlClient.js';

// success path
graphqlRequest.mockResolvedValueOnce({
  login: { token: 'tok', user: { id: 1, name: 'Ada', email: 'ada@example.com', role: 'USER' } }
});

// error path
graphqlRequest.mockRejectedValueOnce(new Error('Invalid email or password.'));
```

**Navigation mock** (D-04 — no existing repo analog; partial-mock recipe, keep `AuthShell`'s `Link`/`RouterLink` real):
```javascript
const navigateSpy = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigateSpy
}));
```

**Render wrapper** (D-03 — real `AuthProvider`, no seeded token so the `me`-on-mount effect is inert):
```javascript
render(
  <AuthProvider>
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  </AuthProvider>
);
```

**Assertions:**
- Success: fill `Email address`/`Password` via `userEvent.type`, click `Sign in`, `await waitFor` for `navigateSpy` to have been called with `'/dashboard'`.
- Error: `graphqlRequest` rejects → submit → assert `screen.getByText('Invalid email or password.')` inside an element with `role="alert"` (MUI `Alert`), and `expect(navigateSpy).not.toHaveBeenCalled()`.

---

### `frontend/src/pages/Register.test.jsx` (test, request-response)

**Analog:** Same pattern as `Login.test.jsx` above; subject is `frontend/src/pages/Register.jsx` (full file, structurally identical to `Login.jsx`).

**Fields/copy specific to this page** (`Register.jsx` lines 46-73):
```javascript
<TextField label="Full name" ... />
<TextField label="Email address" type="email" ... />
<TextField label="Password" type="password" ... />
<Button type="submit" ...>{loading ? 'Creating account…' : 'Create account'}</Button>
```
`handleSubmit` calls `register(form.name, form.email, form.password)` then `navigate('/dashboard')` (lines 14-26) — identical try/catch/finally shape to `Login.jsx`; mock `graphqlRequest` to resolve `{ register: { token, user } }` or reject with an `Error`. Reuse the exact `vi.mock('../api/graphqlClient.js', ...)` and `vi.mock('react-router-dom', ...)` recipes from the `Login.test.jsx` section verbatim (same relative import depth: both pages live in `frontend/src/pages/`).

---

### `frontend/test/renderWithProviders.js` (optional helper, utility) — Claude's discretion

**Analog:** `frontend/test/setup.js` (only existing file in `frontend/test/`, shows the project's plain-ESM, no-framework style for shared test infra)

**Style to mirror** (`setup.js` lines 1-23 — plain named exports/side effects, no class wrapper, explicit imports):
```javascript
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
```
If added, keep it a small named-export function following this same plain-function convention, e.g.:
```javascript
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../src/context/AuthContext.jsx';

export function renderWithProviders(ui, { route = '/' } = {}) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </AuthProvider>
  );
}
```
Only introduce this if the four specs show real duplication after a first draft — not mandated by CONTEXT.md.

---

## Shared Patterns

### Explicit Vitest imports (no globals)
**Source:** `frontend/src/harness.test.jsx` lines 1-2
**Apply to:** All four new specs
```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
```
Never rely on injected globals (`vitest.config.js` has no `globals: true`).

### Render + query-by-role/text assertion style
**Source:** `frontend/src/harness.test.jsx` lines 9-15
**Apply to:** All four new specs
```javascript
render(<Component />);
expect(screen.getByRole('...', { name: '...' })).toBeInTheDocument();
```

### `graphqlRequest` module mock seam (new pattern, no prior analog — see below)
**Source:** Derived from `frontend/src/api/graphqlClient.js` lines 23-36 (real contract) per CONTEXT.md D-01/D-02
**Apply to:** `AuthContext.test.jsx`, `Login.test.jsx`, `Register.test.jsx` (not `ProtectedRoute.test.jsx`, which mocks `useAuth` directly instead)
```javascript
vi.mock('../api/graphqlClient.js', () => ({ graphqlRequest: vi.fn() }));
```
Path is relative to each spec's own directory — `../api/graphqlClient.js` from `src/context/` and `src/pages/` alike (both are one level under `src/`).

### `localStorage` isolation
**Source:** No existing analog (jsdom provides real `localStorage`; nothing in `frontend/test/setup.js` currently touches it)
**Apply to:** `AuthContext.test.jsx` primarily (writes/reads `authToken`); optionally global via `setup.js` `afterEach`
```javascript
beforeEach(() => localStorage.clear());
```

### RTL cleanup (already automatic)
**Source:** `frontend/test/setup.js` lines 21-23
**Apply to:** All specs automatically (global `afterEach(cleanup)` — no per-spec action needed)

---

## No Analog Found

| File/Pattern | Role | Data Flow | Reason |
|---|---|---|---|
| `vi.mock('../api/graphqlClient.js', ...)` module-replacement | test seam | event-driven | No file in the repo uses `vi.mock` anywhere (confirmed via repo-wide grep) — backend tests exclusively use plain stub objects/closures passed as function args (e.g. `backend/src/utils/auth.test.js` lines 28, 38, 48). This phase introduces the first `vi.mock` usage in the codebase. Concrete recipe given above is derived directly from CONTEXT.md D-01/D-02 and the real `graphqlRequest` contract, not from a codebase analog. |
| `vi.mock('react-router-dom', async (importOriginal) => ...)` partial mock | test seam | event-driven | Same reason — no prior partial-module-mock usage anywhere in the repo. Recipe is copied verbatim from CONTEXT.md D-04 (already fully specified there). |
| Probe-consumer-component pattern for context testing (D-06) | test | event-driven | No prior context test exists (`AuthContext.jsx` has never been tested). Pattern is fully specified in CONTEXT.md D-06/D-07; no codebase precedent to cite beyond the general render/query mechanics of `harness.test.jsx`. |

## Metadata

**Analog search scope:** `frontend/src/**`, `frontend/test/**`, `backend/src/**/*.test.js`, `backend/test/**`
**Files scanned:** `frontend/src/harness.test.jsx`, `frontend/src/context/AuthContext.jsx`, `frontend/src/api/graphqlClient.js`, `frontend/src/components/ProtectedRoute.jsx`, `frontend/src/pages/Login.jsx`, `frontend/src/pages/Register.jsx`, `frontend/src/components/AuthShell.jsx`, `frontend/src/App.jsx`, `frontend/test/setup.js`, `frontend/vitest.config.js`, `frontend/package.json`, `backend/src/resolvers/login.test.js`, `backend/src/utils/auth.test.js` (grepped all backend `*.test.js` for `vi.mock`/`vi.fn`/`vi.stubGlobal` — zero hits)
**Pattern extraction date:** 2026-07-12
