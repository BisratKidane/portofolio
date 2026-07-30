# Phase 11: Email Verification & ADMIN Race Fix - Pattern Map

**Mapped:** 2026-07-20
**Files analyzed:** 11 (10 modified, 0 net-new — all "new" logic lands inside existing files per D-01 through D-16)
**Analogs found:** 11 / 11 (all analogs are sibling code within the same file being modified, or a directly adjacent Phase 8/9/10 file)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|---------------|
| `backend/src/models/User.js` | model | CRUD | same file — `resetPasswordToken`/`resetPasswordExpiresAt` columns + `beforeValidate` hook | exact (in-file) |
| `backend/src/utils/auth.js` | utility | request-response | same file — `createResetToken`/`hashResetToken`/`resetTokenExpiry` + `requireAuth`/`getUserFromRequest` | exact (in-file) |
| `backend/src/resolvers/user.resolver.js` (register) | controller | request-response | same file — `register` mutation body | exact (in-file) |
| `backend/src/resolvers/user.resolver.js` (verifyEmail, new) | controller | request-response | same file — `resetPassword` atomic conditional UPDATE (lines 100-104) | exact (in-file) |
| `backend/src/resolvers/user.resolver.js` (resendVerificationEmail, new) | controller | request-response | same file — `requestPasswordReset` (timing-floor + generic message) | exact (in-file) |
| `backend/src/resolvers/user.resolver.js` (login gate) | controller | request-response | same file — `login` mutation body | exact (in-file) |
| `backend/src/services/mailer.js` | service | request-response | same file — `sendPasswordResetEmail` | exact (in-file) |
| `backend/src/schemas/user.schema.js` | config (SDL) | request-response | same file — `PasswordResetPayload`, `AuthPayload`, `Mutation` block | exact (in-file) |
| `backend/src/config/rateLimits.js` | config | request-response | same file — `RATE_LIMITS` map | exact (in-file) |
| `frontend/src/pages/VerifyEmail.jsx` (new) | component | request-response | `frontend/src/pages/ResetPassword.jsx` | exact |
| `frontend/src/pages/Register.jsx` | component | request-response | `frontend/src/pages/ForgotPassword.jsx` (confirmation-panel branch) | exact |
| `frontend/src/context/AuthContext.jsx` | provider | request-response | same file — `authenticate()` + `REGISTER_MUTATION`/`LOGIN_MUTATION` | exact (in-file) |
| `frontend/src/App.jsx` | route | request-response | same file — existing `<Route path="reset-password" .../>` entry | exact (in-file) |

## Pattern Assignments

### `backend/src/models/User.js` (model, CRUD)

**Analog:** same file, existing reset-token columns (lines 37-49) and hooks (lines 55-68).

**Column definition pattern** (lines 37-49):
```javascript
resetPasswordToken: {
  type: DataTypes.STRING,
  allowNull: true
},
resetPasswordExpiresAt: {
  type: DataTypes.DATE,
  allowNull: true
},
passwordChangedAt: {
  type: DataTypes.DATE(3),
  allowNull: true,
  defaultValue: null
}
```
Copy this exact shape for the three new columns (D-01): `emailVerified` (BOOLEAN, `allowNull: false`, `defaultValue: false`), `emailVerificationToken` (STRING, `allowNull: true`, stores the sha256 hash per D-08), `emailVerificationExpiresAt` (DATE, `allowNull: true`).

**Hook pattern — normalization already assumed by lookups** (lines 55-58):
```javascript
hooks: {
  beforeValidate(user) {
    if (user.email) user.email = user.email.toLowerCase().trim();
  },
```
No new hook is needed for verification — `beforeValidate` already normalizes email before any `findOne({ where: { email }})` lookup in resolvers (D-11/D-12 rely on this).

---

### `backend/src/utils/auth.js` (utility, request-response)

**Analog:** same file, `createResetToken`/`hashResetToken`/`resetTokenExpiry` (lines 41-51) for token helpers; `getUserFromRequest`/`requireAuth` (lines 9-34) for the central gate.

**Token helper pattern to clone for verification tokens** (lines 41-51):
```javascript
export function createResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function resetTokenExpiry() {
  return new Date(Date.now() + env.resetTokenExpiresMinutes * 60 * 1000);
}
```
D-08 says the verification token is the same shape with a 24h window (not env-driven per CONTEXT, but planner's discretion on whether to add an env var). A parallel `createVerificationToken`/`hashVerificationToken` (can literally alias `hashResetToken` since both are sha256 — planner's call, D-08 discretion) plus a `verificationTokenExpiry()` returning `new Date(Date.now() + 24 * 60 * 60 * 1000)` mirrors this exactly. `crypto` is already imported at the top (line 2), no new import needed.

**Central gate insertion point** (lines 9-34):
```javascript
export async function getUserFromRequest(req, models) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    return null;
  }

  const user = await models.User.findByPk(payload.sub); // DB errors propagate as real errors
  if (!user) return null;

  if (user.passwordChangedAt) {
    const changedAtSeconds = Math.floor(user.passwordChangedAt.getTime() / 1000);
    if (payload.iat < changedAtSeconds) return null;
  }

  return user;
}
```
D-07 requires an unverified-user rejection here (mirroring the `passwordChangedAt` check style — return `null` to degrade to "not logged in", consistent with the file's established error-handling convention of silently normalizing auth failures rather than throwing). Insert an `if (!user.emailVerified) return null;` check in the same guard-clause style, after the `passwordChangedAt` check (or before — order doesn't matter since both are `return null`).

`requireAuth`/`requireAdmin` (lines 32-38) stay unchanged — they operate on whatever `getUserFromRequest` already filtered.

---

### `backend/src/resolvers/user.resolver.js` — `register` (controller, request-response)

**Analog:** same file, current `register` (lines 35-50).

**Current pattern** (lines 35-50):
```javascript
register: async (_parent, { name, email, password }, { models }) => {
  assertPasswordStrength(password);

  const existingUser = await models.User.findOne({ where: { email: email.toLowerCase().trim() } });
  if (existingUser) throw new Error('A user with this email already exists.');

  const userCount = await models.User.count();
  const user = await models.User.create({
    name,
    email,
    passwordHash: password,
    role: userCount === 0 ? 'ADMIN' : 'USER'
  });

  return { token: signToken(user), user };
},
```
Per D-10: remove the `userCount`/`role` assignment entirely (ADMIN assignment moves to `verifyEmail`, D-04/D-05) and remove `signToken`/`{ token, user }` return. Instead: create the user unverified with a hashed verification token + expiry (same field-setting pattern as `requestPasswordReset` at lines 67-70), fire `sendVerificationEmail` fire-and-forget with `.catch()` (mirrors lines 72-74 `sendPasswordResetEmail(...).catch(...)`), and return `{ message: <copy> }` — same shape as `PasswordResetPayload`.

---

### `backend/src/resolvers/user.resolver.js` — `verifyEmail` (new mutation, controller, request-response)

**Analog:** same file, `resetPassword` (lines 88-106) — this is the explicit template called out in CONTEXT.md D-05.

**Atomic conditional UPDATE pattern to clone** (lines 88-106):
```javascript
resetPassword: async (_parent, { token, password }, { models }) => {
  const hashed = hashResetToken(token);
  const user = await models.User.findOne({ where: { resetPasswordToken: hashed } });
  if (!user || !user.resetPasswordExpiresAt || user.resetPasswordExpiresAt < new Date()) {
    throw new Error('The password reset token is invalid or has expired.');
  }

  assertPasswordStrength(password);

  // Atomic conditional update: only succeeds if the token is still the one we just read.
  // This closes the read-then-write race where two concurrent requests could both pass
  // the findOne/expiry check and both save() successfully (WR-02).
  const [affectedCount] = await models.User.update(
    { passwordHash: password, resetPasswordToken: null, resetPasswordExpiresAt: null },
    { where: { id: user.id, resetPasswordToken: hashed }, individualHooks: true }
  );
  if (affectedCount === 0) throw new Error('The password reset token is invalid or has expired.');
  return true;
}
```
`verifyEmail(token)` follows the identical shape: look up by `hashVerificationToken(token)`, validate expiry, then run a conditional `models.User.update({ emailVerified: true, emailVerificationToken: null, emailVerificationExpiresAt: null }, { where: { id: user.id, emailVerificationToken: hashed } })` guarding single-use (same race class as `resetPassword`'s WR-02 comment references).

For the D-05 ADMIN race fix specifically, extend this same atomic-UPDATE technique with a raw/literal `WHERE NOT EXISTS (...)` condition (Sequelize `Op`/literal or raw SQL) so `role='ADMIN'` is only set if no verified ADMIN exists yet — this is the piece CONTEXT.md flags as "mirrors the atomic conditional update already used in resetPassword (lines 100-104)". Whether this is one combined `UPDATE` or two sequential atomic steps is explicit Claude's-discretion (see CONTEXT.md).

Return value should be `{ token: signToken(user), user }` (an `AuthPayload`) per D-11 — reuse `signToken` (already imported, line 1).

---

### `backend/src/resolvers/user.resolver.js` — `resendVerificationEmail` (new mutation, controller, request-response)

**Analog:** same file, `requestPasswordReset` (lines 60-87) — generic-message + timing-floor template.

**Pattern to clone** (lines 60-87):
```javascript
requestPasswordReset: async (_parent, { email }, { models }) => {
  const startedAt = Date.now();

  const issueResetToken = async () => {
    const user = await models.User.findOne({ where: { email: email.toLowerCase().trim() } });
    if (!user) return;

    const resetToken = createResetToken();
    user.resetPasswordToken = hashResetToken(resetToken);
    user.resetPasswordExpiresAt = resetTokenExpiry();
    await user.save();

    sendPasswordResetEmail({ to: user.email, token: resetToken }).catch((err) => {
      console.error('Failed to send password reset email:', err);
    });
  };

  try {
    await issueResetToken();
  } catch (err) {
    console.error('Failed to issue password reset token:', err);
  }

  const elapsed = Date.now() - startedAt;
  if (elapsed < MIN_RESET_RESPONSE_MS) await delay(MIN_RESET_RESPONSE_MS - elapsed);

  return { message: RESET_REQUEST_MESSAGE };
}
```
`resendVerificationEmail` mirrors this exactly: the inner closure only reissues a token if a user exists **and is not already verified** (D-12: already-verified accounts get the same generic message, no email), same `startedAt`/`delay`/`MIN_RESET_RESPONSE_MS` timing-floor (module constant, line 7), and returns the same generic-message shape (define a sibling constant like `const RESEND_VERIFICATION_MESSAGE = 'If an unverified account exists, a verification link has been sent.';` next to `RESET_REQUEST_MESSAGE` at line 5).

---

### `backend/src/resolvers/user.resolver.js` — `login` gate (controller, request-response)

**Analog:** same file, current `login` (lines 51-55).

**Current pattern** (lines 51-55):
```javascript
login: async (_parent, { email, password }, { models }) => {
  const user = await models.User.findOne({ where: { email: email.toLowerCase().trim() } });
  if (!user || !(await user.validatePassword(password))) throw new Error('Invalid email or password.');
  return { token: signToken(user), user };
},
```
Per D-07: insert the unverified-account check **after** password validation succeeds (so the error timing doesn't leak "this email exists but is unverified" before a valid-password check — matches the file's existing pattern of combining both failure conditions into one generic `Invalid email or password.` throw for the *first* check, then a distinct, explicit message for the *second*): `if (!user.emailVerified) throw new Error('Please verify your email before signing in.');` placed between the password check and the `return`.

---

### `backend/src/services/mailer.js` (service, request-response)

**Analog:** same file, `sendPasswordResetEmail` (lines 30-36).

**Pattern to clone** (lines 30-36):
```javascript
export async function sendPasswordResetEmail({ to, token }) {
  const link = `${env.clientUrl}/reset-password?token=${token}`;
  const subject = 'Reset your password';
  const text = `We received a request to reset your password.\n\nOpen this link to choose a new one:\n${link}\n\nThis link expires in ${env.resetTokenExpiresMinutes} minutes. If you did not request a reset, you can ignore this email.`;

  return sendMail({ to, subject, text });
}
```
`sendVerificationEmail({ to, token })` is a copy-shaped sibling: link = `${env.clientUrl}/verify-email?token=${token}` (D-09), subject e.g. `'Verify your email'`, body references the 24h expiry window (hardcode "24 hours" text, or reference a new env/constant per the token-helper's location, itself Claude's discretion). Calls the same shared `sendMail()` (line 20-28) — no changes needed to `sendMail` or `buildTransportOptions` (lines 4-16), `jsonTransport` in dev/test already applies (line 5).

---

### `backend/src/schemas/user.schema.js` (config/SDL, request-response)

**Analog:** same file, `PasswordResetPayload` (lines 21-23) for the message-only shape; `Mutation` block (lines 37-43) for wiring new mutations.

**Message-only payload pattern** (lines 21-23):
```graphql
type PasswordResetPayload {
  message: String!
}
```
Per D-10 discretion, either reuse `PasswordResetPayload` directly for `register`'s new return type, or add a distinct `RegisterPayload { message: String! }` — both are structurally identical to this existing type. Must never expose `token`/`user` fields (unlike `AuthPayload`, lines 16-19).

**Mutation block to extend** (lines 37-43):
```graphql
type Mutation {
  register(name: String!, email: String!, password: String!): AuthPayload!
  login(email: String!, password: String!): AuthPayload!
  logout: Boolean!
  requestPasswordReset(email: String!): PasswordResetPayload!
  resetPassword(token: String!, password: String!): Boolean!
}
```
Change `register(...): AuthPayload!` to `register(...): RegisterPayload!` (or reused message type, D-10). Add `verifyEmail(token: String!): AuthPayload!` (returns full session per D-11) and `resendVerificationEmail(email: String!): PasswordResetPayload!` (or the same reused message type, matching `requestPasswordReset`'s shape per D-12).

---

### `backend/src/config/rateLimits.js` (config, request-response)

**Analog:** same file, `RATE_LIMITS` map — the file's own comment (lines 4-5) explicitly anticipates this Phase 11 addition.

**Pattern to extend** (lines 1-10):
```javascript
// Single edit point for tuning any threshold below. A GraphQL Mutation field name absent from
// this map is treated as unlimited by the consuming plugin (Plan 10-02) — do not add `logout`,
// `me`, or `dashboard` here.
// Phase 11 will add `resendVerificationEmail` as one more entry to this same object — out of
// scope for Phase 10, do not add it now.
export const RATE_LIMITS = {
  login: { max: 5, windowMs: 15 * 60 * 1000 },
  register: { max: 5, windowMs: 60 * 60 * 1000 },
  requestPasswordReset: { max: 5, windowMs: 60 * 60 * 1000 }
};
```
Add one entry: `resendVerificationEmail: { max: 5, windowMs: 60 * 60 * 1000 }` (matches `register`/`requestPasswordReset` shape exactly, D-13). Also update/remove the now-stale comment referencing "Phase 11 will add" since this phase is doing it.

---

### `frontend/src/pages/VerifyEmail.jsx` (new, component, request-response)

**Analog:** `frontend/src/pages/ResetPassword.jsx` (full file, 84 lines) — explicit D-14 template for the `?token=` read via `useSearchParams`.

**Imports pattern** (lines 1-5):
```jsx
import { useState } from 'react';
import { Alert, Box, Button, Link, Stack, TextField, Typography } from '@mui/material';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { graphqlRequest } from '../api/graphqlClient.js';
import AuthShell from '../components/AuthShell.jsx';
```

**Token-from-URL pattern** (lines 13-20):
```jsx
export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get('token');

  const [form, setForm] = useState({ token: tokenFromUrl || '', password: '' });
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
```

**Submit + error/success handling pattern** (lines 22-35):
```jsx
const handleSubmit = async (event) => {
  event.preventDefault();
  setError('');
  setSuccess(false);
  setLoading(true);
  try {
    await graphqlRequest(RESET_PASSWORD, form);
    setSuccess(true);
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
};
```
For `VerifyEmail.jsx`: since D-14 says success should establish a session (store token, set user, then navigate to dashboard) rather than just show a static success `<Alert>`, use `useAuth()` (see `AuthContext.jsx` pattern below) instead of a raw `graphqlRequest` call — call something like `verifyEmail(tokenFromUrl)` from context, then `navigate('/dashboard')` on success, mirroring `Register.jsx`'s `handleSubmit` navigate-on-success pattern (see below) rather than `ResetPassword.jsx`'s static-alert pattern. On missing/invalid token, show the same `<Alert severity="error">{error}</Alert>` idiom (line 52 in ResetPassword.jsx) with a "Return to sign in" footer link (`AuthShell` footer prop, lines 42-48).

Should probably auto-run verification on mount (via `useEffect`) rather than requiring a form submit, since the token is expected to always come from the emailed link (`ResetPassword.jsx` still shows a manual `TextField` fallback for when `tokenFromUrl` is absent — the same optional fallback pattern, lines 58-66, can be reused if a token-paste UI is wanted, though D-14 doesn't require it).

---

### `frontend/src/pages/Register.jsx` (modified, component, request-response)

**Analog:** `frontend/src/pages/ForgotPassword.jsx` (full file, 78 lines) — explicit D-15 template for the confirmation-panel branch.

**Confirmation-panel conditional-render pattern** (lines 47-75):
```jsx
<Stack spacing={2.25}>
  {error && <Alert severity="error">{error}</Alert>}
  {result ? (
    <>
      <Alert severity="success">{result.message}</Alert>
      <Button component={RouterLink} to="/reset-password" variant="outlined" size="large" fullWidth>
        Continue to reset password
      </Button>
    </>
  ) : (
    <Box component="form" onSubmit={handleSubmit} noValidate>
      <Stack spacing={2.25}>
        {/* form fields */}
      </Stack>
    </Box>
  )}
</Stack>
```
And the `handleSubmit` that stores the message-only result instead of navigating (lines 19-31):
```jsx
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
`Register.jsx`'s current `handleSubmit` (lines 14-26) calls `navigate('/dashboard')` on success — per D-15/D-16 this must change to: call `register(...)` from context (which now resolves to `{ message }`, no session), store that message in local state (`const [result, setResult] = useState(null)`), and remove the `useNavigate`/`navigate('/dashboard')` call entirely. Replace the unconditional form-render (current lines 42-76) with the same `{result ? <confirmation> : <form>}` ternary shown above, swapping the "Continue to reset password" button for copy appropriate to "check your email" (D-15 discretion) — no dashboard button, since the user isn't authenticated yet.

---

### `frontend/src/context/AuthContext.jsx` (provider, request-response)

**Analog:** same file — `authenticate()` helper (lines 48-54) and the `REGISTER_MUTATION`/`LOGIN_MUTATION` constants (lines 12-22) are both the site of the D-16 break and the template for the new `verifyEmail` call.

**Current shared-session-establishing helper** (lines 48-54):
```jsx
const authenticate = async (mutation, variables) => {
  const data = await graphqlRequest(mutation, variables);
  const payload = data.login || data.register;
  localStorage.setItem('authToken', payload.token);
  setUser(payload.user);
  return payload.user;
};
```
Per D-16: `data.register` no longer has `.token`/`.user` (it's `{ message }` now), so `register` must stop calling `authenticate()`. Two changes:
1. Add a plain (non-session) `register` implementation: `register: (name, email, password) => graphqlRequest(REGISTER_MUTATION, { name, email, password }).then((data) => data.register)` — returns `{ message }` directly, no `localStorage`/`setUser` touch.
2. Extend `authenticate()` to also recognize `data.verifyEmail` (which *does* return `{ token, user }` per D-11): `const payload = data.login || data.verifyEmail;` — drop `data.register` from this line since register no longer returns a session shape. Add a new exported action `verifyEmail: (token) => authenticate(VERIFY_EMAIL_MUTATION, { token })`, following the exact same call convention as `login`/current `register` (line 60-61):
```jsx
login: (email, password) => authenticate(LOGIN_MUTATION, { email, password }),
register: (name, email, password) => authenticate(REGISTER_MUTATION, { name, email, password }),
```

**Mutation string constant pattern** (lines 12-22):
```jsx
const REGISTER_MUTATION = `
  mutation Register($name: String!, $email: String!, $password: String!) {
    register(name: $name, email: $email, password: $password) { token user { id name email role } }
  }
`;
```
`REGISTER_MUTATION`'s selection set changes to `{ message }` (matching `REQUEST_RESET`'s shape in `ForgotPassword.jsx` line 7-11: `requestPasswordReset(email: $email) { message }`). Add a new `VERIFY_EMAIL_MUTATION` constant following the same SCREAMING_SNAKE_CASE `_MUTATION` naming convention, with `{ token user { id name email role } }` selection set (same as `LOGIN_MUTATION`, lines 12-16).

---

### `frontend/src/App.jsx` (route, request-response)

**Analog:** same file, existing `reset-password` route registration (line 18).

**Current route table** (lines 10-25):
```jsx
<Route element={<AppLayout />}>
  <Route index element={<Navigate to="/dashboard" replace />} />
  <Route path="login" element={<Login />} />
  <Route path="register" element={<Register />} />
  <Route path="forgot-password" element={<ForgotPassword />} />
  <Route path="reset-password" element={<ResetPassword />} />
  <Route element={<ProtectedRoute />}>
    <Route path="dashboard" element={<Dashboard />} />
  </Route>
</Route>
```
Add `import VerifyEmail from './pages/VerifyEmail.jsx';` alongside the other page imports (lines 4-8, alphabetically it sorts after `Register` and before... actually import block isn't alphabetized strictly — `Dashboard, ForgotPassword, Login, Register, ResetPassword` is alphabetical; insert `VerifyEmail` after `ResetPassword`). Add `<Route path="verify-email" element={<VerifyEmail />} />` as a sibling of `reset-password`, outside `ProtectedRoute` (unauthenticated users must be able to reach it).

---

## Shared Patterns

### Hashed-token-at-rest + timing-floor discipline
**Source:** `backend/src/utils/auth.js` (lines 41-51) + `backend/src/resolvers/user.resolver.js` (lines 60-87, `requestPasswordReset`)
**Apply to:** `verifyEmail`, `resendVerificationEmail`
Token is generated raw (`crypto.randomBytes(32).toString('hex')`), emailed raw, but only the sha256 hash is ever persisted or looked up against. Generic-message responses (`resendVerificationEmail`) additionally pad response time to a fixed floor (`MIN_RESET_RESPONSE_MS`, line 7) to avoid an enumeration timing side-channel — reuse the same constant or a sibling one.

### Fire-and-forget mailer calls with `.catch()` logger
**Source:** `backend/src/resolvers/user.resolver.js` lines 72-74
```javascript
sendPasswordResetEmail({ to: user.email, token: resetToken }).catch((err) => {
  console.error('Failed to send password reset email:', err);
});
```
**Apply to:** `register` (D-10) and `resendVerificationEmail` (D-12) calling `sendVerificationEmail` — never `await` the send itself in the request path (avoids leaking mail-send timing/errors to the caller).

### Atomic conditional UPDATE for race-safety
**Source:** `backend/src/resolvers/user.resolver.js` lines 100-104 (`resetPassword`)
```javascript
const [affectedCount] = await models.User.update(
  { passwordHash: password, resetPasswordToken: null, resetPasswordExpiresAt: null },
  { where: { id: user.id, resetPasswordToken: hashed }, individualHooks: true }
);
if (affectedCount === 0) throw new Error('The password reset token is invalid or has expired.');
```
**Apply to:** `verifyEmail`'s token-consumption (single-use enforcement) and the D-05 ADMIN-slot assignment (extended with a `NOT EXISTS` sub-condition or `Op.and` literal to guard the single-ADMIN invariant under concurrent verification).

### Central auth-gate as silent `return null`, not throw
**Source:** `backend/src/utils/auth.js` lines 9-30 (`getUserFromRequest`)
**Apply to:** the new `emailVerified` check in the same function (D-07) — follow the established convention that `getUserFromRequest` degrades failures to "not logged in" (`return null`) rather than throwing; `requireAuth`/resolvers are what turn "no user" into a thrown GraphQL error.

### Message-only GraphQL payload shape
**Source:** `backend/src/schemas/user.schema.js` lines 21-23 (`PasswordResetPayload { message: String! }`)
**Apply to:** `register`'s new return type and `resendVerificationEmail`'s return type — both must expose only `message`, never `token`/`user`.

### AuthShell wrapper + Alert-based error/success surfacing
**Source:** `frontend/src/components/AuthShell.jsx` (used by all four existing auth pages); error via `<Alert severity="error">{error}</Alert>` pattern seen identically in `ResetPassword.jsx` line 52, `ForgotPassword.jsx` line 48, `Register.jsx` line 44.
**Apply to:** `VerifyEmail.jsx` (new page) and `Register.jsx`'s modified confirmation branch — both must use `AuthShell` for chrome and the same inline `<Alert>` idiom for errors/success (D-17: no dedicated UI for the unverified-login/throttle errors — they ride the existing `<Alert>` in `Login.jsx`, which needs no change beyond the backend already returning a distinct `Error` message).

## No Analog Found

None — every file in scope has a direct in-file or sibling-file analog per the CONTEXT.md canonical refs.

## Metadata

**Analog search scope:** `backend/src/{models,utils,resolvers,services,schemas,config}`, `frontend/src/{pages,context,App.jsx}`, `backend/test/helpers.js` (for test-harness awareness only, not a pattern target)
**Files scanned:** 12 (User.js, auth.js, user.resolver.js, mailer.js, user.schema.js, rateLimits.js, env.js, ResetPassword.jsx, ForgotPassword.jsx, Register.jsx, AuthContext.jsx, App.jsx) + test/helpers.js
**Pattern extraction date:** 2026-07-20
