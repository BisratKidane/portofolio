---
phase: 08-mailer-abstraction-reset-token-remediation
reviewed: 2026-07-13T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - backend/package.json
  - backend/src/config/assertProductionMailConfig.js
  - backend/src/config/assertProductionMailConfig.test.js
  - backend/src/config/env.js
  - backend/src/resolvers/resetPassword.test.js
  - backend/src/resolvers/user.resolver.js
  - backend/src/schemas/user.schema.js
  - backend/src/services/mailer.js
  - frontend/src/pages/ForgotPassword.jsx
  - frontend/src/pages/ForgotPassword.test.jsx
  - frontend/src/pages/ResetPassword.jsx
  - frontend/src/pages/ResetPassword.test.jsx
findings:
  critical: 3
  warning: 8
  info: 5
  total: 16
status: issues_found
---

# Phase 8: Code Review Report

**Reviewed:** 2026-07-13
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

The headline goal of this phase — removing `resetToken` from the GraphQL contract — is achieved and verified. A codebase-wide grep confirms no schema field, resolver return value, or frontend query still exposes the token; `PasswordResetPayload` is now `{ message: String! }` only, and `resetPassword.test.js:68` pins the removal with a schema-validation test. Single-use and expiry semantics are intact and tested (`resetPassword.test.js:96,117`). The `assertProductionMailConfig` boot guard is correct for the three variables it checks.

However, three security/operational properties the phase explicitly claims are **not** actually delivered:

1. **The anti-enumeration guarantee is broken by a timing side channel.** The response *content* is identical for existing and non-existing accounts, but the *work* is not: only the existing-account branch generates a token and performs a DB `UPDATE`. The phase intent names timing explicitly as a property that must hold. It does not hold.
2. **The production boot assertion breaks the only production deploy path.** `env/remote.env` sets `NODE_ENV=production` and defines no `SMTP_*` variables, and neither the env templates, `docker-compose.yml`, nor the README were updated. `npm run docker:remote` will now crash on boot.
3. **The production SMTP transport does not enforce TLS.** With `secure` and `requireTLS` both unset on port 587, nodemailer will happily fall back to a cleartext session, putting SMTP credentials and the reset link on the wire in plaintext.

The mailer's fire-and-forget error handling is *syntactically* safe (no unhandled rejection), but it is semantically hollow: a permanent delivery failure is indistinguishable from success to the user and produces nothing but a `console.error`. `mailer.js` itself has zero test coverage — every resolver test mocks the whole module, and no test exercises the `.catch()` path the phase intent asks to be correct.

---

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: User enumeration via timing side channel in `requestPasswordReset`

**File:** `backend/src/resolvers/user.resolver.js:52-67`
**Issue:** The phase intent requires that `requestPasswordReset` "must not leak account existence via timing, error shape, or response content." Content and shape are handled; timing is not. The two branches do measurably different amounts of work:

- **Non-existent email:** one `SELECT`, then immediate `return { message }`.
- **Existing email:** one `SELECT`, plus `crypto.randomBytes(32)`, plus a full `user.save()` round-trip (an `UPDATE` against MySQL, including Sequelize's `beforeValidate`/`beforeUpdate` hook chain).

A DB write round-trip is on the order of 0.5–5 ms and is statistically separable from the no-write path over a modest number of samples. An unauthenticated attacker can therefore enumerate registered accounts by submitting candidate emails and timing the response — which is precisely the account-existence oracle this phase was meant to close. The `sendPasswordResetEmail(...)` call being fire-and-forget helps (the SMTP latency does not land in the response), but it does not remove the write-path delta.

Note the interaction with WR-01: "fixing" the fire-and-forget by simply `await`ing the send would make this leak dramatically *worse* (SMTP round-trip only on the existing-account path). Fix CR-01 first.

**Fix:** Normalize the latency of both branches. The cleanest option is to floor the handler at a fixed budget so both paths return at the same time:

```js
requestPasswordReset: async (_parent, { email }, { models }) => {
  const message = 'If the account exists, a password reset link has been sent.';
  const MIN_RESPONSE_MS = 250;
  const startedAt = Date.now();

  const work = async () => {
    const user = await models.User.findOne({ where: { email: email.toLowerCase().trim() } });
    if (!user) return;

    const resetToken = createResetToken();
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpiresAt = resetTokenExpiry();
    await user.save();

    sendPasswordResetEmail({ to: user.email, token: resetToken }).catch((err) => {
      console.error('Failed to send password reset email:', err);
    });
  };

  await work();

  const elapsed = Date.now() - startedAt;
  if (elapsed < MIN_RESPONSE_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_RESPONSE_MS - elapsed));
  }

  return { message };
}
```

Add a regression test asserting that the p50 response time for a known-missing email is within tolerance of a known-existing email.

---

### CR-02: Production boot guard breaks the production deploy — no `SMTP_*` wiring shipped

**File:** `backend/src/config/env.js:41-46` (guard), `env/remote.env` (missing config)
**Issue:** `assertProductionMailConfig` throws unless `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASS` are all set whenever `NODE_ENV === 'production'`. `env/remote.env` — the file consumed by the `docker:remote` deploy path — sets `NODE_ENV=production` (line 1) and defines **none** of those three variables. Neither `env/remote.env`, `docker-compose.yml`, nor the README were updated in this phase. Result: the backend container now exits at import time with `SMTP_HOST, SMTP_USER, and SMTP_PASS must be set in production.` and `restart: unless-stopped` will crash-loop it.

The fail-fast itself is correct and desirable; shipping it without the corresponding configuration is a self-inflicted outage. This is a hard deploy break introduced by this phase, not a hypothetical.

**Fix:** Add the variables to `env/remote.env` (and document them as required) plus a commented placeholder block in the other env templates:

```env
# env/remote.env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=__set_me__
SMTP_FROM=no-reply@your-real-domain.com
```

Also add a README section documenting the new required production variables and remove the now-false note at `README.md:141` (see IN-04).

---

### CR-03: Production SMTP transport does not enforce TLS — credentials and reset links can travel in cleartext

**File:** `backend/src/services/mailer.js:4-12`
**Issue:** The production transport is configured with only `host`, `port`, and `auth`:

```js
{ host: env.smtpHost, port: env.smtpPort, auth: { user: env.smtpUser, pass: env.smtpPass } }
```

`secure` is unset, so nodemailer defaults it to `false` for the default port 587. `requireTLS` is also unset. In that configuration nodemailer will *attempt* STARTTLS opportunistically but will **proceed over an unencrypted connection if the server does not advertise it** — which is exactly the condition an active network attacker induces (STARTTLS stripping). The traffic at risk is the SMTP `AUTH` exchange (the mail account password, in plaintext or base64) and the message body, which contains a live single-use password-reset link. That is a direct account-takeover path.

Additionally, if an operator sets `SMTP_PORT=465` (implicit TLS), the current config still sends `secure: false` and the connection will hang or fail, because 465 requires TLS from the first byte.

**Fix:**

```js
const transporter = nodemailer.createTransport(
  env.nodeEnv === 'production'
    ? {
        host: env.smtpHost,
        port: env.smtpPort,
        secure: env.smtpPort === 465,   // implicit TLS on 465
        requireTLS: true,               // refuse to send if STARTTLS is unavailable
        auth: { user: env.smtpUser, pass: env.smtpPass }
      }
    : { jsonTransport: true }
);
```

---

## Warnings

### WR-01: Delivery failure is invisible — user is told the link "has been sent" when it was not

**File:** `backend/src/resolvers/user.resolver.js:62-66`
**Issue:** The send is fire-and-forget with a bare `.catch()` that only writes to `console.error`. Consequences:

- The user is unconditionally told a link was sent, even on a permanent failure (bad recipient, auth failure, rejected sender domain). They will wait for an email that never arrives with no path to recovery.
- The reset token has already been committed to the DB and remains live for `RESET_TOKEN_EXPIRES_MINUTES`, unreachable by anyone.
- A total SMTP outage produces zero signal beyond unstructured stderr lines — no metric, no alert, no retry.

Note this is a genuine tension with the anti-enumeration requirement (you cannot surface "send failed" to the caller without leaking that the account exists). The resolution is *out-of-band* observability, not a different response.

**Fix:** Keep the response generic and the send off the response path, but make failures actionable — emit a structured, counted error and (ideally) push onto a retry queue:

```js
sendPasswordResetEmail({ to: user.email, token: resetToken }).catch((err) => {
  console.error(JSON.stringify({
    event: 'password_reset_email_failed',
    userId: user.id,
    error: err.message,
    code: err.code
  }));
  // TODO: increment a metric / enqueue for retry so outages are detectable
});
```

Do **not** "fix" this by awaiting the send — see CR-01.

---

### WR-02: `clientUrl` is unvalidated in production — reset links can point at `localhost`

**File:** `backend/src/services/mailer.js:25`, `backend/src/config/env.js:13-22`
**Issue:** The reset link is built from `env.clientUrl`, which resolves to `process.env.CLIENT_URL || clientOrigins[0]`, and `clientOrigins` itself falls back to `'http://localhost:5173'` when neither `CLIENT_ORIGINS` nor `CLIENT_URL` is set. `assertProductionMailConfig` does not check `clientUrl`. A production deployment that sets SMTP correctly but forgets `CLIENT_URL` will pass the boot guard and then email every user a reset link pointing at `http://localhost:5173/reset-password?token=...` — a silently broken reset flow with no startup error.

**Fix:** Extend the boot assertion to cover the link base:

```js
export function assertProductionMailConfig({ nodeEnv, smtpHost, smtpUser, smtpPass, clientUrl }) {
  if (nodeEnv !== 'production') return;
  if (!smtpHost || !smtpUser || !smtpPass) {
    throw new Error('SMTP_HOST, SMTP_USER, and SMTP_PASS must be set in production.');
  }
  if (!clientUrl || clientUrl.includes('localhost')) {
    throw new Error('CLIENT_URL must be set to a public URL in production (used to build password-reset links).');
  }
}
```

---

### WR-03: `SMTP_FROM` defaults to an unroutable domain and is not asserted in production

**File:** `backend/src/config/env.js:30`, `backend/src/config/assertProductionMailConfig.js:2`
**Issue:** `smtpFrom` defaults to `'no-reply@portfolio.local'`. `.local` is a reserved mDNS TLD, so it can never pass SPF/DKIM/DMARC alignment. A production deploy that sets `SMTP_HOST/USER/PASS` but forgets `SMTP_FROM` passes the boot guard and then has every reset email either rejected outright by the relay or dropped into spam — again with no startup error and no in-app signal (WR-01 ensures the failure is invisible).

**Fix:** Add `smtpFrom` to the required-in-production set in `assertProductionMailConfig`, or at minimum reject the `.local` default:

```js
if (!smtpFrom || smtpFrom.endsWith('.local')) {
  throw new Error('SMTP_FROM must be set to a deliverable address in production.');
}
```

---

### WR-04: No rate limiting on `requestPasswordReset` — mail-bomb and reset-token-churn DoS

**File:** `backend/src/resolvers/user.resolver.js:52-67`
**Issue:** The mutation is unauthenticated and unthrottled, and every successful call **overwrites** `resetPasswordToken` and `resetPasswordExpiresAt`. Two abuse vectors:

1. An attacker who knows a victim's email can trigger unlimited reset emails to that address (mail bombing / sender-reputation damage / SMTP quota exhaustion).
2. An attacker hammering the endpoint continuously invalidates the victim's in-flight reset token, making it impossible for the victim to ever complete a legitimate reset (they click a link whose token was overwritten milliseconds later).

This phase is the reset-flow hardening phase; shipping the mailer without any throttle is where the throttle belongs.

**Fix:** Add per-IP and per-email rate limiting (e.g. `express-rate-limit` on the `/graphql` route keyed by operation, or a cooldown check in the resolver: if `resetPasswordExpiresAt` is still comfortably in the future, return the generic message without regenerating or re-sending). Note any cooldown branch must be latency-normalized per CR-01.

---

### WR-05: `mailer.js` has zero test coverage, and the `.catch()` error path is untested

**File:** `backend/src/services/mailer.js` (no test file), `backend/src/resolvers/resetPassword.test.js:4-6`
**Issue:** `resetPassword.test.js` mocks `../services/mailer.js` wholesale, and `assertProductionMailConfig.test.js` only covers the pure assertion function. Nothing in the suite exercises `mailer.js` itself. Specifically untested:

- Transport selection (`production` → SMTP vs. everything else → `jsonTransport`).
- Reset-link construction (`${env.clientUrl}/reset-password?token=${token}`) — a typo here silently ships broken links to every user, and CR-03/WR-02 both live in this untested code.
- **The `.catch()` path in the resolver.** The phase intent explicitly asks for "the correctness of the mailer's error handling (the send is fire-and-forget with a `.catch()`)", yet no test asserts that `requestPasswordReset` still returns the generic message — and still returns `errors: undefined` — when `sendPasswordResetEmail` rejects. That is the single most important behavior of the design and it is unverified.

**Fix:** Add to `resetPassword.test.js`:

```js
it('still returns the generic message when the mailer rejects', async () => {
  await createTestUser({ email: 'mailer-down@example.com' });
  sendPasswordResetEmail.mockRejectedValueOnce(new Error('SMTP unavailable'));

  const response = await graphql(REQUEST_RESET_MUTATION, { email: 'mailer-down@example.com' });

  expect(response.errors).toBeUndefined();
  expect(response.data.requestPasswordReset.message).toBe(
    'If the account exists, a password reset link has been sent.'
  );
});
```

And add a `mailer.test.js` covering link construction and `jsonTransport` selection outside production.

---

### WR-06: Password reset does not invalidate existing sessions

**File:** `backend/src/resolvers/user.resolver.js:68-81`, `backend/src/utils/auth.js:9-20`
**Issue:** `resetPassword` rotates the password hash and clears the reset token, but issued JWTs remain valid until `JWT_EXPIRES_IN` (default `1d`) because `getUserFromRequest` only verifies the signature and looks up `payload.sub` — there is no per-user token generation counter. The primary reason a user resets their password is that they believe an attacker has access; under this implementation the reset does **not** evict the attacker's existing session, which remains live for up to a day. This substantially undercuts the account-recovery value of the whole flow that this phase is hardening.

**Fix:** Add a `tokenVersion` integer column to `User` (default 0). Include it in the JWT payload in `signToken`, increment it in `resetPassword` (and ideally on any password change), and reject tokens whose `tokenVersion` claim does not match the persisted value in `getUserFromRequest`.

---

### WR-07: Reset emails are silently dropped in every non-production environment, and logged in cleartext in `development`

**File:** `backend/src/services/mailer.js:4-19`
**Issue:** Two coupled problems in the environment branching:

- The transport is real SMTP **only** when `nodeEnv === 'production'`; every other value (including `staging`, `preprod`, or an unset `NODE_ENV` that defaults to `'development'`) gets `jsonTransport: true`, which serializes the message and delivers nothing. A staging environment would have a completely non-functional password reset with no error anywhere.
- The debug `console.log` is gated on `nodeEnv === 'development'` and prints `body=${text}` — i.e. the full reset link including the live token. Combined with the above, a deployed environment left at the default `NODE_ENV` writes reset tokens in cleartext to the log aggregator while delivering no mail. Anyone with log-read access can take over any account.

**Fix:** Decouple the two decisions. Select the transport on whether SMTP is configured (`env.smtpHost ? smtp : jsonTransport`) rather than on `nodeEnv`, and gate the token log behind an explicit opt-in flag rather than an environment name:

```js
const transporter = nodemailer.createTransport(
  env.smtpHost
    ? { host: env.smtpHost, port: env.smtpPort, secure: env.smtpPort === 465, requireTLS: true,
        auth: { user: env.smtpUser, pass: env.smtpPass } }
    : { jsonTransport: true }
);

if (env.mailDebug) {  // MAIL_DEBUG=true, never set outside a dev machine
  console.log(`[mailer] to=${to} subject=${subject} body=${text}`);
}
```

---

### WR-08: Reset tokens are stored in the database in plaintext

**File:** `backend/src/resolvers/user.resolver.js:57-58`, `backend/src/models/User.js:37-40`
**Issue:** `createResetToken()` produces 32 bytes of CSPRNG hex (good), but the raw value is written straight into `users.resetPasswordToken` and compared by equality at `user.resolver.js:69`. Anyone with read access to the `users` table — a SQL-injection read primitive, a leaked backup, an over-privileged analytics replica, a DBA — can mint a valid reset for any account with a pending request and take it over. The password itself is bcrypt-hashed at cost 12; the credential that can *replace* the password is not protected at all. Since this phase exists specifically to stop the reset token from being handed to attackers, leaving it in cleartext at rest is an inconsistent threat model.

**Fix:** Store only a digest. Email the raw token; persist `sha256(token)`; look up by digest.

```js
// utils/auth.js
export function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// requestPasswordReset
const resetToken = createResetToken();
user.resetPasswordToken = hashResetToken(resetToken);   // store digest
// ... sendPasswordResetEmail({ to: user.email, token: resetToken })  // email the raw value

// resetPassword
const user = await models.User.findOne({ where: { resetPasswordToken: hashResetToken(token) } });
```

(SHA-256 without a work factor is appropriate here — the token has 256 bits of entropy, so it is not brute-forceable.)

---

## Info

### IN-01: Dead `html` parameter in `sendMail`

**File:** `backend/src/services/mailer.js:14-15`
**Issue:** `sendMail` destructures an `html` parameter, but the only caller (`sendPasswordResetEmail`, line 29) never supplies it, so `html: undefined` is always passed to nodemailer. Either an HTML body was intended and dropped, or the parameter is vestigial.
**Fix:** Either supply an HTML variant in `sendPasswordResetEmail` (better deliverability and click-through for a reset link) or drop the parameter.

### IN-02: "Continue to reset password" button dead-ends into a manual-paste form

**File:** `frontend/src/pages/ForgotPassword.jsx:52-54`
**Issue:** On success the page renders a "Continue to reset password" button linking to `/reset-password` with no `?token=`. Since the token is now delivered exclusively by email (and that email link already carries `?token=`), a user who clicks this button lands on `ResetPassword` showing a "Reset token" field they have no way to fill from the UI. This is a leftover from the old flow where the token was displayed on screen; it now leads users into a dead end.
**Fix:** Replace the button with copy directing the user to check their inbox, or remove it.

### IN-03: `ResetPassword` submits an empty token when `?token=` is present but blank

**File:** `frontend/src/pages/ResetPassword.jsx:15-17,58`
**Issue:** `tokenFromUrl` is read once into `useState` (later `searchParams` changes will not re-seed the form — acceptable for this page, but note it). More relevantly, `?token=` with an empty value yields `''`, which is falsy, so line 58 renders the paste field — but if the user submits without typing, `form.token` is `''` and the client fires a `resetPassword(token: "")` mutation. The server then runs `findOne({ where: { resetPasswordToken: '' } })`. Harmless today (no row stores an empty-string token), but it is an avoidable unauthenticated DB query on unvalidated input.
**Fix:** Guard the submit handler: `if (!form.token.trim()) { setError('A reset token is required.'); return; }`.

### IN-04: README still documents the removed behavior

**File:** `README.md:141`
**Issue:** The README still states: "Password reset currently returns a development reset token from the GraphQL mutation ... For production, connect `requestPasswordReset` to an email provider and avoid returning the token to the browser." This phase did exactly that; the note is now false and the required `SMTP_*` variables are documented nowhere.
**Fix:** Replace the note with the new email-based flow and the list of required production environment variables (see CR-02).

### IN-05: `assertProductionMailConfig` accepts whitespace-only values

**File:** `backend/src/config/assertProductionMailConfig.js:2`
**Issue:** The guard uses bare truthiness, so `SMTP_HOST=" "` passes and the app boots with a non-functional (but "configured") mailer. `env.js` does not trim these values either.
**Fix:** Trim before checking: `const missing = [smtpHost, smtpUser, smtpPass].some((v) => !v || !String(v).trim());`

---

_Reviewed: 2026-07-13_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
