# Requirements — Milestone v1.1: Security Remediation

**Milestone goal:** Remediate the security bugs deferred from v1.0 — closing the account-takeover and brute-force vectors — while keeping the CI-enforced test suite green.

**Governing constraint (TDD):** Every requirement below is delivered test-first (red-green-refactor). Where a v1.0 test currently asserts insecure behavior, flipping it to assert the secure behavior IS the red step. No fix lands without a test that fails before it and passes after; `main` stays green.

**Traceability to v1.0:** This milestone satisfies the v1.0 deferred item `FIX-01` (fix documented security bugs) in full.

---

## v1.1 Requirements

### Password Reset Hardening (RESET) — Fix #1

- [ ] **RESET-01**: `requestPasswordReset` no longer returns the reset token in its API response — the `PasswordResetPayload` type drops the `resetToken` field and the resolver stops setting it.
- [ ] **RESET-02**: The reset token is delivered to the account owner via the mailer (see MAIL-01), containing a `${CLIENT_URL}/reset-password?token=...` link.
- [ ] **RESET-03**: `requestPasswordReset` returns the same generic message whether or not the account exists (anti-enumeration preserved).
- [ ] **RESET-04**: Reset-token single-use and expiry (30 min) behavior is preserved — proven by test, not regressed.
- [ ] **RESET-05**: The frontend `ForgotPassword` page no longer renders or links to a raw token; it shows a static "check your email" confirmation state.

### Mailer Abstraction (MAIL)

- [ ] **MAIL-01**: A pluggable mailer module exposes a single `sendMail({ to, subject, text/html })` interface that logs the message to the server console in dev/test (no network egress) and is wired for a real SMTP provider in production without a code rewrite.
- [ ] **MAIL-02**: Backend tests can assert "an email was sent" (recipient + token/link) at the mailer boundary without a live transport.

### JWT Secret Fail-Fast (SECRET) — Fix #2

- [ ] **SECRET-01**: When `NODE_ENV=production` and `JWT_SECRET` is unset or equals the insecure default `'change-me'`, the backend refuses to start (throws/exits non-zero) before serving traffic.
- [ ] **SECRET-02**: In `development` and `test`, the existing fallback still applies — the fail-fast never crashes local dev or the test suite.

### Rate Limiting (RATE) — Fix #3

- [ ] **RATE-01**: `login` is rate-limited per client IP (default: 5 attempts / 15 min); further attempts are rejected before credentials are checked.
- [ ] **RATE-02**: `register` is rate-limited per client IP (default: 5 / hour).
- [ ] **RATE-03**: `requestPasswordReset` is rate-limited per client IP (default: 5 / hour).
- [ ] **RATE-04**: Rate limiting is enforced in a layer that the in-process Apollo `executeOperation()` test harness exercises (i.e. testable without HTTP), keyed by IP + GraphQL operation name so normal queries (`me`, `dashboard`) are unaffected.
- [ ] **RATE-05**: A breach returns a clear "too many requests" error and does not leak whether the target account exists.

### Session Revocation (SESS) — Fix #4

- [ ] **SESS-01**: The `User` model gains a `passwordChangedAt` timestamp column.
- [ ] **SESS-02**: `resetPassword` sets `passwordChangedAt = now()` when the password changes.
- [ ] **SESS-03**: A JWT whose `iat` predates the user's `passwordChangedAt` is treated as unauthenticated (`getUserFromRequest` returns `null`), invalidating tokens issued before a reset. Second-vs-millisecond precision is handled correctly and proven by a same-second boundary test.

### Password Strength (PWD) — Fix #5

- [ ] **PWD-01**: `register` rejects passwords shorter than 8 characters, server-side, before hashing, surfaced through the existing GraphQL-error/`Alert` convention.
- [ ] **PWD-02**: `resetPassword` enforces the same 8-character minimum server-side.

### Email Verification (VERIFY) — Fix #6

- [ ] **VERIFY-01**: The `User` model gains `emailVerified` (boolean, default false), `emailVerificationToken`, and `emailVerificationExpiresAt` columns.
- [ ] **VERIFY-02**: `register` creates an unverified user, sends a verification email via the mailer, and returns a message-only payload — no JWT, no session, no ADMIN role granted at registration time.
- [ ] **VERIFY-03**: A new `verifyEmail(token)` mutation flips `emailVerified` to true, clears the token/expiry (single-use), and returns an `AuthPayload` so the user lands logged in.
- [ ] **VERIFY-04**: ADMIN role is assigned at verification time to the first *verified* user only — closing the registration-speed land-grab race.
- [ ] **VERIFY-05**: `login` rejects an unverified account with a clear message after password validation succeeds.
- [ ] **VERIFY-06**: The verification token is cryptographically random, single-use, and time-limited (24 h expiry).
- [ ] **VERIFY-07**: A `resendVerificationEmail(email)` mutation reissues a fresh token/email for an unverified account, so an expired/lost verification email is recoverable without re-registration.
- [ ] **VERIFY-08**: The frontend gains a `/verify-email` route that reads the token from the query string, calls `verifyEmail`, and logs the user in on success; `Register` no longer auto-navigates to the dashboard but shows a "check your email" state; `AuthContext` handles the message-only register response without setting a session.

### CORS Hardening (CORS) — Fix #7

- [ ] **CORS-01**: A rejected CORS origin is logged server-side but the error returned to the client is generic — the rejected origin value is no longer echoed to the browser.

---

## Future Requirements (Deferred)

- **RATE-F1**: Operation-aware graduated limits / a coarse IP-only `express-rate-limit` guard on the whole `/graphql` endpoint as defense-in-depth (needs a new supertest/HTTP harness) — build only if blanket limiting proves too coarse.
- **VERIFY-F1**: Env-seeded initial admin (`ADMIN_EMAIL`) as belt-and-suspenders on top of verification-gated role assignment.
- **UX-F1**: Frontend-specific friendly 429 message and a password-strength meter (pure UI polish; guarded by the "no UI redesign" constraint).

## Out of Scope

- **Live email provider account** (SES/SendGrid/Postmark credentials) — v1.1 ships the pluggable mailer with a dev console driver; standing up a real account is a deployment concern.
- **Refresh-token rotation / server-side token denylist / multi-device logout** — `passwordChangedAt` is the chosen revocation mechanism; logout stays client-side.
- **MFA / OAuth / social login** — no new auth methods this milestone.
- **CAPTCHA / bot detection** — rate limiting is the chosen brute-force mitigation.
- **Password composition rules, history, rotation** — NIST-discouraged; length-only minimum.
- **Sequelize migrations** — new columns added via the existing `sync()` model-field pattern; migration tooling is a separate infra-hardening milestone. (Note: `sync()` without `alter` will not add columns to an already-provisioned DB — a manual boot-and-verify acceptance step covers this, per research.)
- **GraphQL query depth/complexity limiting** — separate pre-existing concern, not an auth-brute-force vector.
- **UI redesign** — frontend changes limited to what the security fixes require (reset flow, verify route, register state).

---

## Traceability

Every v1.1 requirement mapped to exactly one phase. Coverage: 28/28.

| REQ-ID | Phase |
|--------|-------|
| CORS-01 | Phase 7 |
| SECRET-01 | Phase 7 |
| SECRET-02 | Phase 7 |
| PWD-01 | Phase 7 |
| PWD-02 | Phase 7 |
| MAIL-01 | Phase 8 |
| MAIL-02 | Phase 8 |
| RESET-01 | Phase 8 |
| RESET-02 | Phase 8 |
| RESET-03 | Phase 8 |
| RESET-04 | Phase 8 |
| RESET-05 | Phase 8 |
| SESS-01 | Phase 9 |
| SESS-02 | Phase 9 |
| SESS-03 | Phase 9 |
| RATE-01 | Phase 10 |
| RATE-02 | Phase 10 |
| RATE-03 | Phase 10 |
| RATE-04 | Phase 10 |
| RATE-05 | Phase 10 |
| VERIFY-01 | Phase 11 |
| VERIFY-02 | Phase 11 |
| VERIFY-03 | Phase 11 |
| VERIFY-04 | Phase 11 |
| VERIFY-05 | Phase 11 |
| VERIFY-06 | Phase 11 |
| VERIFY-07 | Phase 11 |
| VERIFY-08 | Phase 11 |
