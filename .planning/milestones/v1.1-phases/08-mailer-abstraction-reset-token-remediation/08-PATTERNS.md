# Phase 8: Mailer Abstraction & Reset-Token Remediation - Pattern Map

**Mapped:** 2026-07-13
**Files analyzed:** 8 (3 new, 5 modified)
**Analogs found:** 7 exact/role-match, 1 no-analog (net-new `services/` directory pattern, guided by ARCHITECTURE.md + Phase 7's `assertProductionSecrets`)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `backend/src/services/mailer.js` (new) | service (external-integration boundary) | request-response (async side effect, fire-and-forget) | `backend/src/utils/auth.js` (module shape) + `backend/src/config/assertProductionSecrets.js` (boot-assertion shape) | role-match — first file in a new directory, no direct service-role analog exists |
| `backend/src/schemas/user.schema.js` (`PasswordResetPayload`) | schema (SDL) | transform | itself — current `PasswordResetPayload` type | exact |
| `backend/src/resolvers/user.resolver.js` (`requestPasswordReset`) | resolver | CRUD / request-response | itself — current `requestPasswordReset`/`resetPassword` bodies; `assertPasswordStrength` import-and-call convention from Phase 7 | exact |
| `backend/src/resolvers/resetPassword.test.js` | test (resolver integration) | request-response | itself — current suite; `vi.mock()` shape has no in-repo precedent yet | role-match (mocking is net-new to this file, pattern borrowed from Vitest conventions) |
| `backend/src/config/env.js` (SMTP vars + boot assertion) | config | transform (import-time) | `backend/src/config/assertProductionSecrets.js` + its call site at `env.js:34` | exact — D-03 explicitly mirrors this |
| `frontend/src/pages/ForgotPassword.jsx` | component (page) | request-response | itself — current file; confirmation-panel unmount pattern is net-new but follows existing conditional-render idiom | role-match |
| `frontend/src/pages/ResetPassword.jsx` | component (page) | request-response | itself — current file; `useSearchParams()` is net-new to this file | role-match |
| `frontend/src/pages/ForgotPassword.test.jsx` (new) | test (RTL component) | request-response | `frontend/src/pages/Login.test.jsx` / `Register.test.jsx` | exact |
| `frontend/src/pages/ResetPassword.test.jsx` (new) | test (RTL component) | request-response | `frontend/src/pages/Login.test.jsx` / `Register.test.jsx` (router wrapping) — needs `useSearchParams` addition | exact (base shape), role-match (router param seeding is new) |
| `backend/package.json` (nodemailer dependency) | config | n/a | itself — current `dependencies` block | exact |

## Pattern Assignments

### `backend/src/services/mailer.js` (new — service, request-response/fire-and-forget)

**No direct analog** — this is the first file in a new `backend/src/services/` directory (confirmed via `ls`: directory does not exist yet). Per `.planning/research/ARCHITECTURE.md` (§"Mailer abstraction"), this is a deliberate one-off deviation from the flat `utils/` convention because it is an external-integration boundary with a swappable transport, not a pure helper.

**Module-shape analog — plain named exports, no classes** (`backend/src/utils/auth.js`, full file, 37 lines):
```javascript
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../config/env.js';

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}
```
Copy this shape: `import nodemailer from 'nodemailer';` + `import { env } from '../config/env.js';` at the top, then plain `export async function sendMail(...)` / `export async function sendPasswordResetEmail(...)` — no default export, no class wrapper, consistent with every other backend module (`auth.js`, `assertProductionSecrets.js`, `corsOptions.js`).

**Env-driven branch-by-NODE_ENV analog** — `backend/src/config/database.js:8` is the one existing precedent for conditionally switching behavior on `env.nodeEnv`:
```javascript
logging: env.nodeEnv === 'development' ? console.log : false
```
For D-03/D-04, mirror this ternary style for transport selection (`env.nodeEnv === 'production' ? smtpTransportConfig : { jsonTransport: true }`) and for the dev-only `console.log` gate in `sendMail()` (D-04: log only when `nodeEnv === 'development'`, silent in `test`).

**Boot-assertion pattern to mirror exactly (D-03)** — `backend/src/config/assertProductionSecrets.js` (full file, 5 lines):
```javascript
export function assertProductionSecrets({ nodeEnv, jwtSecret }) {
  if (nodeEnv === 'production' && (!jwtSecret || jwtSecret === 'change-me')) {
    throw new Error('JWT_SECRET must be set to a non-default value in production.');
  }
}
```
Its call site in `backend/src/config/env.js:34` (last line of the file, after the `env` object is fully built):
```javascript
assertProductionSecrets({ nodeEnv: env.nodeEnv, jwtSecret: env.jwtSecret });
```
And its unit-test shape, `backend/src/config/assertProductionSecrets.test.js` (full file, 26 lines) — five cases covering all NODE_ENV/value quadrants:
```javascript
import { describe, it, expect } from 'vitest';
import { assertProductionSecrets } from './assertProductionSecrets.js';

describe('assertProductionSecrets', () => {
  it('throws when nodeEnv is production and jwtSecret is unset', () => {
    expect(() => assertProductionSecrets({ nodeEnv: 'production', jwtSecret: undefined })).toThrow();
  });
  it('does not throw when nodeEnv is test, even with the insecure default secret', () => {
    expect(() => assertProductionSecrets({ nodeEnv: 'test', jwtSecret: 'change-me' })).not.toThrow();
  });
  it('does not throw when nodeEnv is development and jwtSecret is unset', () => {
    expect(() => assertProductionSecrets({ nodeEnv: 'development', jwtSecret: undefined })).not.toThrow();
  });
});
```
D-03's SMTP boot-refusal function (e.g. `assertProductionMailConfig({ nodeEnv, smtpHost, smtpUser, smtpPass })` — exact name is Claude's Discretion per CONTEXT.md) must be a **pure function, plain-argument-object shape, in its own file** (matching `assertProductionSecrets.js`'s one-function-per-file convention, not folded into `mailer.js` itself — keeps it independently unit-testable exactly like the JWT precedent, and importable from `env.js` without pulling `nodemailer` into `env.js`'s import graph). Gate strictly on `nodeEnv === 'production'` — must never fire in `test`/`development` (Phase 7 PITFALLS entry 5, explicitly cross-referenced in CONTEXT.md D-03).

**Fire-and-forget call pattern (D-08)** — no existing analog in this codebase (every current async call in resolvers is `await`ed). This is net-new; CONTEXT.md's own excerpt is the concrete shape to implement:
```javascript
sendPasswordResetEmail({ to: user.email, token: resetToken }).catch((err) => {
  console.error('Failed to send password reset email:', err);
});
```
`console.error` here has a direct precedent in intent (server-side-only diagnostic logging) with `corsOriginValidator`'s `console.warn` (see Shared Patterns below), even though the exact call is new.

---

### `backend/src/schemas/user.schema.js` (schema/SDL, transform)

**Analog:** itself — current `PasswordResetPayload` type (`backend/src/schemas/user.schema.js:21-24`):
```graphql
type PasswordResetPayload {
  message: String!
  resetToken: String
}
```
Per RESET-01/D-recommendation (keep the type, drop the field), delete `resetToken: String` from the SDL — a **schema-level** deletion, not a resolver-level null. Result:
```graphql
type PasswordResetPayload {
  message: String!
}
```
No other type in this file needs touching; `Mutation.requestPasswordReset(email: String!): PasswordResetPayload!` (`:42`) keeps its signature unchanged.

---

### `backend/src/resolvers/user.resolver.js` (resolver, CRUD/request-response)

**Analog:** itself — current `requestPasswordReset` body (`backend/src/resolvers/user.resolver.js:51-65`):
```javascript
requestPasswordReset: async (_parent, { email }, { models }) => {
  const user = await models.User.findOne({ where: { email: email.toLowerCase().trim() } });
  const message = 'If the account exists, a password reset token has been generated.';
  if (!user) return { message, resetToken: null };

  const resetToken = createResetToken();
  user.resetPasswordToken = resetToken;
  user.resetPasswordExpiresAt = resetTokenExpiry();
  await user.save();

  return {
    message,
    resetToken
  };
},
```
Rewrite per D-08/D-11: drop `resetToken` from both return branches, update the message constant, call `sendPasswordResetEmail` fire-and-forget **after** `await user.save()` (so the persisted token and the emailed token are provably the same value, per CONTEXT.md's Integration Points):
```javascript
requestPasswordReset: async (_parent, { email }, { models }) => {
  const user = await models.User.findOne({ where: { email: email.toLowerCase().trim() } });
  const message = 'If the account exists, a password reset link has been sent.';
  if (!user) return { message };

  const resetToken = createResetToken();
  user.resetPasswordToken = resetToken;
  user.resetPasswordExpiresAt = resetTokenExpiry();
  await user.save();

  sendPasswordResetEmail({ to: user.email, token: resetToken }).catch((err) => {
    console.error('Failed to send password reset email:', err);
  });

  return { message };
},
```

**Existing named-import convention to extend** (`backend/src/resolvers/user.resolver.js:1-2`) — this is exactly the pattern Phase 7 already used to wire in `assertPasswordStrength`, and the one D-02 (resolver calls the mailer *wrapper*, not `sendMail` directly) must follow:
```javascript
import { createResetToken, requireAdmin, requireAuth, resetTokenExpiry, signToken } from '../utils/auth.js';
import { assertPasswordStrength } from '../utils/passwordPolicy.js';
```
Add: `import { sendPasswordResetEmail } from '../services/mailer.js';` — direct module import per ARCHITECTURE.md's explicit "(b) direct-import + `vi.mock()`" recommendation, **not** added to the Apollo `context()` object.

**`resetPassword` mutation is unchanged this phase** (`:66-79`) — RESET-04's regression tests exercise existing single-use/expiry behavior, no resolver edits needed there.

---

### `backend/src/resolvers/resetPassword.test.js` (test, resolver integration)

**Analog:** itself, full current file (71 lines) — copy its `describe`/`beforeEach(resetTables)`/`graphql()`-helper shape exactly; only the assertions and mocking change.

**Current shape to preserve structurally:**
```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';

const REQUEST_RESET_MUTATION = `
  mutation RequestPasswordReset($email: String!) {
    requestPasswordReset(email: $email) {
      message
      resetToken
    }
  }
`;

beforeEach(resetTables);
```
Two required edits per CONTEXT.md/D-11:
1. Remove `resetToken` from `REQUEST_RESET_MUTATION`'s selection set — querying it becomes a GraphQL *validation* error (SC-2), so it must not appear in any test's query string.
2. Update both verbatim message assertions from `'If the account exists, a password reset token has been generated.'` to `'If the account exists, a password reset link has been sent.'` (exact current assertions at `:31-33` and `:44-46`).

**`createTestUser()` override shape already supports RESET-04** — confirmed live in this file (`:52-57`), no helper change needed:
```javascript
const user = await createTestUser({
  email: 'reset-me@example.com',
  resetPasswordToken: 'a-valid-reset-token',
  resetPasswordExpiresAt: new Date(Date.now() + 30 * 60 * 1000)
});
```
`backend/test/helpers.js`'s `createTestUser` (full function, `:26-34`) spreads `overrides` last, so any `User` column — including `resetPasswordExpiresAt` set to a *past* date for an expiry-regression test, or a second `resetPassword` call reusing an already-consumed token for a single-use-regression test — works with zero helper changes:
```javascript
export async function createTestUser(overrides = {}) {
  return models.User.create({
    name: 'Test User',
    email: `test-${Date.now()}@example.com`,
    passwordHash: 'Password123!',
    role: 'USER',
    ...overrides
  });
}
```

**`vi.mock()` mailer-mocking shape (D-05/D-06/D-08)** — no existing precedent in this repo (no module has been `vi.mock()`'d yet in any backend test); this is the one genuinely net-new testing pattern this phase introduces. Concrete shape (per CONTEXT.md `<specifics>` and ARCHITECTURE.md's explicit recommendation (b)):
```javascript
import { vi } from 'vitest';

vi.mock('../services/mailer.js', () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined)
}));

import { sendPasswordResetEmail } from '../services/mailer.js';
```
Assert call arguments, not call count, and use `vi.waitFor` because the resolver call is fire-and-forget (D-08):
```javascript
await user.reload();
await vi.waitFor(() =>
  expect(sendPasswordResetEmail).toHaveBeenCalledWith({ to: user.email, token: user.resetPasswordToken })
);
```
Negative case (D-06) — for a non-existing email, assert the mailer is never invoked, while the message stays identical:
```javascript
expect(sendPasswordResetEmail).not.toHaveBeenCalled();
```
Place `vi.mock(...)` at module scope (top of the file, before any `describe`), matching Vitest's hoisting requirement — this is the first file in the repo to need `vi.mock`, so there is no in-repo precedent for hoisting placement; follow standard Vitest convention (mock calls are hoisted above imports automatically, but the `vi.mock()` factory call itself must appear before the `describe` blocks that rely on it, as shown above).

---

### `backend/src/config/env.js` (config, transform/import-time)

**Analog:** itself, current full file (35 lines) — the exact template D-03 must mirror, per CONTEXT.md's canonical ref.

**Current `env` object + existing assertion call** (`backend/src/config/env.js:17-34`):
```javascript
export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  clientUrl: process.env.CLIENT_URL || clientOrigins[0],
  clientOrigins,
  jwtSecret: process.env.JWT_SECRET || 'change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  resetTokenExpiresMinutes: Number(process.env.RESET_TOKEN_EXPIRES_MINUTES || 30),
  database: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    name: process.env.DB_NAME || 'portofolio',
    user: process.env.DB_USER || 'portofolio',
    password: process.env.DB_PASSWORD || 'portofolio'
  }
};

assertProductionSecrets({ nodeEnv: env.nodeEnv, jwtSecret: env.jwtSecret });
```
And the import at the top of the file (`:4`):
```javascript
import { assertProductionSecrets } from './assertProductionSecrets.js';
```

**Required edits, following this exact shape:**
1. Add SMTP env vars as new top-level `env` fields, same `process.env.X || <default>` idiom as every other field (e.g. `smtpHost: process.env.SMTP_HOST || ''`, `smtpPort: Number(process.env.SMTP_PORT || 587)`, `smtpUser: process.env.SMTP_USER || ''`, `smtpPass: process.env.SMTP_PASS || ''` — exact names are Claude's Discretion per CONTEXT.md).
2. Add a second import line, same style as line 4: `import { assertProductionMailConfig } from './assertProductionMailConfig.js';` (or chosen name).
3. Add a second assertion call directly below the existing one at the bottom of the file:
```javascript
assertProductionSecrets({ nodeEnv: env.nodeEnv, jwtSecret: env.jwtSecret });
assertProductionMailConfig({ nodeEnv: env.nodeEnv, smtpHost: env.smtpHost, smtpUser: env.smtpUser, smtpPass: env.smtpPass });
```
This ordering/adjacency is exactly what CONTEXT.md's canonical ref specifies ("wired at boot alongside the existing `assertProductionSecrets(...)` call at `:34`").

**Critical constraint carried forward from Phase 7 PATTERNS.md:** `env.js` executes at module-import time; the new assertion must be gated identically to `assertProductionSecrets` (`nodeEnv === 'production'` only) or it breaks every backend test in one commit — `backend/vitest.config.js:7` sets `process.env.NODE_ENV = 'test'` globally before any test file loads, so the entire 50+-test suite imports `env.js` under `NODE_ENV=test` on every run.

---

### `frontend/src/pages/ForgotPassword.jsx` (component/page, request-response)

**Analog:** itself — current full file (91 lines), shown above under Read output.

**GraphQL operation constant convention** (`:7-11`, matches the SCREAMING_SNAKE_CASE `_MUTATION`/inline-string convention used across `AuthContext.jsx`/`Login.jsx`/`Register.jsx`):
```javascript
const REQUEST_RESET = `
  mutation RequestPasswordReset($email: String!) {
    requestPasswordReset(email: $email) { message resetToken }
  }
`;
```
Drop `resetToken` from the selection set (`:9`) — becomes:
```javascript
const REQUEST_RESET = `
  mutation RequestPasswordReset($email: String!) {
    requestPasswordReset(email: $email) { message }
  }
`;
```

**Token `<Box>` to delete** (`:53-67`) and **token-gated button to delete** (`:82-86`) — both conditional on `result.resetToken` / `result?.resetToken`, which no longer exists on the response shape once the schema field is dropped.

**Confirmation-panel replacement (D-12)** — no existing "form unmounts entirely on success" precedent in this codebase (`Login.jsx`/`Register.jsx` both `navigate()` away on success rather than swapping in place); the closest structural precedent is this very file's existing `{result && (...)}` conditional block (`:50-69`), which already demonstrates "success state replaces part of the tree" — extend that same `result`-gated conditional to replace the *entire* `<Stack>` contents (email field + submit button unmount, not just an added `<Alert>`), per D-12's "no conditional-render branch left that could leak a token" rationale:
```javascript
{result ? (
  <Stack spacing={2.25}>
    <Alert severity="success">{result.message}</Alert>
    <Link component={RouterLink} to="/reset-password">
      Already have a reset link? Continue to reset password
    </Link>
    <Typography variant="body2" color="text.secondary">
      Remembered it? <Link component={RouterLink} to="/login">Back to sign in</Link>
    </Typography>
  </Stack>
) : (
  <Box component="form" onSubmit={handleSubmit} noValidate>
    {/* existing email field + submit button, unchanged */}
  </Box>
)}
```
(Illustrative shape only — exact confirmation-panel copy is Claude's Discretion per CONTEXT.md `## Claude's Discretion`.) Subtitle at `:37` (`"Enter your email and we'll generate a reset token for you."`) must be rewritten to not describe the internal token mechanic (D-12).

**`try/catch/finally` + `<Alert severity="error">` convention** (`:19-31`) — unchanged, follows the codebase-wide error-handling convention documented in CLAUDE.md ("Async handlers wrap calls in try/catch/finally... error message... via MUI `<Alert>`"):
```javascript
const handleSubmit = async (event) => {
  event.preventDefault();
  setError('');
  setLoading(true);
  try {
    const data = await graphqlRequest(REQUEST_RESET, { email });
    setResult(data.requestPasswordReset);
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
};
```

---

### `frontend/src/pages/ResetPassword.jsx` (component/page, request-response)

**Analog:** itself — current full file (78 lines), shown above under Read output.

**Manual "Reset token" field to conditionally hide** (`:55-61`):
```javascript
<TextField
  label="Reset token"
  value={form.token}
  onChange={(e) => setForm({ ...form, token: e.target.value })}
  required
  fullWidth
/>
```
Per D-09, wrap this field in a conditional keyed on whether `useSearchParams()` returned a `token` param — when present, hide the field entirely and seed `form.token` from the URL on mount instead:
```javascript
const [searchParams] = useSearchParams();
const tokenFromUrl = searchParams.get('token');

const [form, setForm] = useState({ token: tokenFromUrl || '', password: '' });

// ...in the JSX:
{!tokenFromUrl && (
  <TextField
    label="Reset token"
    value={form.token}
    onChange={(e) => setForm({ ...form, token: e.target.value })}
    required
    fullWidth
  />
)}
```
`useSearchParams` import — no existing usage in this codebase (`react-router-dom` is currently only used for `<Link>`/`RouterLink`/`useNavigate`/`MemoryRouter` elsewhere), but it is the same package already a dependency (`frontend/package.json`), so this is a new named import from an existing dependency, not a new package:
```javascript
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
```

**Rest of the file (`handleSubmit`, success/error `<Alert>`, submit button) is unchanged** — same `try/catch/finally` convention as `ForgotPassword.jsx`.

---

### `frontend/src/pages/ForgotPassword.test.jsx` (new — test, RTL component)

**Analog:** `frontend/src/pages/Login.test.jsx` (full file, 67 lines) — copy this shape exactly (mock setup, `renderX()` helper, `beforeEach`).

**Mock + render-helper shape to copy verbatim** (`frontend/src/pages/Login.test.jsx:1-34`):
```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.jsx';
import Login from './Login.jsx';

vi.mock('../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));

import { graphqlRequest } from '../api/graphqlClient.js';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

function renderLogin() {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    </AuthProvider>
  );
}
```
For `ForgotPassword.test.jsx`: swap `Login` → `ForgotPassword`, drop the `useNavigate` mock block (`ForgotPassword` never navigates on success — D-12 keeps the user on the same page), keep `vi.mock('../api/graphqlClient.js', ...)` and the `AuthProvider`+`MemoryRouter` wrapping (needed because `AuthShell`'s footer link and the confirmation panel's `RouterLink` both require router context; `AuthProvider` wrapping matches the sibling tests even though `ForgotPassword` doesn't consume auth context directly — consistency with the established render-helper shape).

**Required assertions per D-10:**
```javascript
graphqlRequest.mockResolvedValueOnce({
  requestPasswordReset: { message: 'If the account exists, a password reset link has been sent.' }
});

renderForgotPassword();

await userEvent.type(screen.getByLabelText('Email address', { exact: false }), 'ada@example.com');
await userEvent.click(screen.getByRole('button', { name: /send/i }));

expect(await screen.findByText('If the account exists, a password reset link has been sent.')).toBeInTheDocument();
expect(screen.queryByRole('button', { name: /continue to reset/i })).not.toBeInTheDocument();
expect(screen.queryByText(/^[a-f0-9]{16,}$/)).not.toBeInTheDocument(); // no raw token ever rendered
```
This is the direct regression guard CONTEXT.md calls for: "after a successful submit, the static confirmation renders **and no raw token / no token-gated button is ever rendered**."

---

### `frontend/src/pages/ResetPassword.test.jsx` (new — test, RTL component)

**Analog:** `frontend/src/pages/Login.test.jsx` / `Register.test.jsx`, same mock/render shape as above, **plus** a router param-seeding pattern neither existing test file needs (both currently render `<MemoryRouter>` with no `initialEntries`).

**Router param seeding (net-new to this codebase's tests)** — `MemoryRouter` accepts `initialEntries` to seed the URL `ResetPassword.jsx`'s `useSearchParams()` reads:
```javascript
function renderResetPassword(initialEntries = ['/reset-password']) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <ResetPassword />
      </MemoryRouter>
    </AuthProvider>
  );
}
```
Two required cases per D-10:
```javascript
describe('ResetPassword page', () => {
  it('hides the token field and submits the URL token when ?token= is present', async () => {
    graphqlRequest.mockResolvedValueOnce({ resetPassword: true });

    renderResetPassword(['/reset-password?token=abc']);

    expect(screen.queryByLabelText('Reset token', { exact: false })).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('New password', { exact: false }), 'newpassword123');
    await userEvent.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() =>
      expect(graphqlRequest).toHaveBeenCalledWith(expect.any(String), { token: 'abc', password: 'newpassword123' })
    );
  });

  it('shows the paste field when no token is in the URL', () => {
    renderResetPassword(['/reset-password']);
    expect(screen.getByLabelText('Reset token', { exact: false })).toBeInTheDocument();
  });
});
```
Do **not** mock `react-router-dom`'s `useNavigate` here (unlike `Login.test.jsx`/`Register.test.jsx`) unless `ResetPassword.jsx` is also changed to navigate on success — current file does not navigate (`success` state stays in-page), so the `vi.mock('react-router-dom', ...)` block from `Login.test.jsx:16-19` is not needed; only `MemoryRouter` wrapping is required, matching `initialEntries` usage.

---

### `backend/package.json` (config)

**Analog:** itself — current `dependencies` block (`backend/package.json:16-27`):
```json
"dependencies": {
  "@apollo/server": "^4.11.3",
  "bcryptjs": "^2.4.3",
  "cors": "^2.8.5",
  "dotenv": "^16.4.7",
  "express": "^4.21.2",
  "graphql": "^16.10.0",
  "jsonwebtoken": "^9.0.2",
  "mysql2": "^3.11.5",
  "sequelize": "^6.37.5",
  "uuid": "^11.0.3"
}
```
Add `"nodemailer": "^9.0.3"` (D-01, alphabetical insertion between `mysql2` and `sequelize`, matching the existing alphabetized ordering). Install via workspace flag, matching STACK.md's documented command: `npm install --workspace backend nodemailer@^9.0.3`. Note `supertest@^7.2.2` is already present in `devDependencies` (Phase 7 added it) — no devDependency change needed this phase.

---

## Shared Patterns

### Throw-plain-Error / generic-message convention
**Source:** `backend/src/resolvers/user.resolver.js:30,44,69`
**Apply to:** any new resolver-level error paths this phase touches (none expected beyond what exists — `requestPasswordReset` stays non-throwing for the anti-enumeration guarantee).
```javascript
if (existingUser) throw new Error('A user with this email already exists.');
```

### Env-gated boot assertion (pure function, plain-argument object)
**Source:** `backend/src/config/assertProductionSecrets.js` (full file) + its call site `backend/src/config/env.js:34`
**Apply to:** D-03's SMTP production-boot-refusal function.
```javascript
export function assertProductionSecrets({ nodeEnv, jwtSecret }) {
  if (nodeEnv === 'production' && (!jwtSecret || jwtSecret === 'change-me')) {
    throw new Error('JWT_SECRET must be set to a non-default value in production.');
  }
}
```
Must never fire outside `nodeEnv === 'production'` — the entire backend test suite imports `env.js` under `NODE_ENV=test` (`backend/vitest.config.js:7`).

### Console logging as server-side-only diagnostic (never surfaced to client)
**Source:** `backend/src/config/corsOptions.js:4` (`console.warn`), `backend/src/config/database.js:8` (conditional `console.log`)
**Apply to:** `sendMail()`'s dev-only composed-message log (D-04) and the fire-and-forget `.catch()` failure log (D-08).
```javascript
console.warn(`CORS rejected origin: ${origin}`);
```

### RTL component test shape (render helper + mocked `graphqlRequest`)
**Source:** `frontend/src/pages/Login.test.jsx` (full file), `frontend/src/pages/Register.test.jsx` (full file)
**Apply to:** `ForgotPassword.test.jsx`, `ResetPassword.test.jsx`.
```javascript
vi.mock('../api/graphqlClient.js', () => ({ graphqlRequest: vi.fn() }));
import { graphqlRequest } from '../api/graphqlClient.js';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});
```

### GraphQL operation constants at module scope
**Source:** `frontend/src/pages/ForgotPassword.jsx:7-11`, `frontend/src/pages/ResetPassword.jsx:7-11`, `frontend/src/context/AuthContext.jsx:6-24`
**Apply to:** no change in shape needed — only the `ForgotPassword.jsx` constant's selection set shrinks (drop `resetToken`).

## No Analog Found

| File/Change | Role | Data Flow | Reason |
|---|---|---|---|
| `backend/src/services/mailer.js` directory placement | service | request-response | First file in `backend/src/services/` — confirmed via `ls backend/src/` (only `config`, `models`, `resolvers`, `schemas`, `utils` exist today). Follow ARCHITECTURE.md's explicit rationale (external-integration boundary, not a pure `utils/` helper) rather than an in-repo precedent. |
| `vi.mock()` module-mocking in any backend test | test | n/a | No backend test in this repo currently uses `vi.mock()` — every existing test either hits the real in-memory/test DB via `graphql()`/`createTestUser()` or unit-tests a pure function directly. `resetPassword.test.js`'s mailer mock (D-05/D-06) is the first use of Vitest's mocking API in the backend workspace; follow standard Vitest conventions (module-scope `vi.mock()` call, hoisted above the tested import) rather than an in-repo pattern. |
| `useSearchParams()` in any frontend component | hook usage | n/a | `react-router-dom` is used elsewhere only for `<Link>`, `useNavigate`, `MemoryRouter`, `<Navigate>` (`ProtectedRoute.jsx`) — `useSearchParams` has zero prior usage in this codebase. It is the same already-installed package, so no new dependency, just a new hook import. |
| `MemoryRouter initialEntries` seeding in tests | test | n/a | `Login.test.jsx`/`Register.test.jsx` both render `<MemoryRouter>` with no `initialEntries` (default `['/']`) since neither page reads URL params. `ResetPassword.test.jsx` is the first test needing seeded routes. |

## Metadata

**Analog search scope:** `backend/src/**`, `backend/test/**`, `backend/package.json`, `frontend/src/pages/**`, `frontend/test/**`, `frontend/vitest.config.js`, `.planning/research/{ARCHITECTURE,STACK}.md`, `.planning/phases/07-*/07-PATTERNS.md`
**Files scanned:** `backend/src/config/env.js`, `backend/src/config/assertProductionSecrets.js`, `backend/src/config/assertProductionSecrets.test.js`, `backend/src/config/corsOptions.js`, `backend/src/config/database.js`, `backend/src/resolvers/user.resolver.js`, `backend/src/resolvers/resetPassword.test.js`, `backend/src/schemas/user.schema.js`, `backend/src/utils/auth.js`, `backend/src/utils/passwordPolicy.js`, `backend/test/helpers.js`, `backend/vitest.config.js`, `backend/package.json`, `frontend/src/pages/Login.test.jsx`, `frontend/src/pages/Register.test.jsx`, `frontend/src/pages/ForgotPassword.jsx`, `frontend/src/pages/ResetPassword.jsx`, `frontend/vitest.config.js`, `frontend/test/setup.js`
**Pattern extraction date:** 2026-07-13
