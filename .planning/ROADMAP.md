# Roadmap: Portfolio Auth App — Testing Foundation

## Milestones

- ✅ **v1.0 Full-Stack Testing Safety Net** — Phases 1–6 (shipped 2026-07-12)
- 🚧 **v1.1 Security Remediation** — Phases 7–11 (in progress)

## Phases

<details>
<summary>✅ v1.0 Full-Stack Testing Safety Net (Phases 1–6) — SHIPPED 2026-07-12</summary>

- [x] Phase 1: Backend Test Tooling & Test Database (2/2 plans) — completed 2026-07-11
- [x] Phase 2: Backend Unit Tests (2/2 plans) — completed 2026-07-11
- [x] Phase 3: Backend Integration Tests (3/3 plans) — completed 2026-07-11
- [x] Phase 4: Frontend Test Tooling (1/1 plan) — completed 2026-07-12
- [x] Phase 5: Frontend Component Tests (3/3 plans) — completed 2026-07-12
- [x] Phase 6: Root Orchestration & CI Pipeline (2/2 plans) — completed 2026-07-12

Full detail archived in [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md).

</details>

### 🚧 v1.1 Security Remediation (In Progress)

**Milestone Goal:** Remediate the security bugs deferred from v1.0 — closing the account-takeover and brute-force vectors — while keeping the CI-enforced test suite green. Every fix is TDD'd red-green-refactor; v1.0 tests that document a bug are flipped to assert the fixed behavior.

- [ ] **Phase 7: Foundation Hardening — CORS, JWT Fail-Fast & Password Strength** - Independent, low-risk fixes that prove the v1.1 TDD rhythm and stand up an HTTP-level test harness reused by later phases
- [ ] **Phase 8: Mailer Abstraction & Reset-Token Remediation** - Reset tokens are delivered via a pluggable mailer and dropped from the API entirely
- [ ] **Phase 9: Session Revocation via passwordChangedAt** - A password reset invalidates JWTs issued beforehand
- [ ] **Phase 10: Rate Limiting on Auth Mutations** - login/register/requestPasswordReset are throttled per-IP without affecting normal usage
- [ ] **Phase 11: Email Verification & ADMIN Race Fix** - Registration requires proven email ownership before a session or the ADMIN role is granted

## Phase Details

### Phase 7: Foundation Hardening — CORS, JWT Fail-Fast & Password Strength
**Goal**: The app refuses insecure configurations and weak passwords before they can cause harm, without ever crashing dev/test — and a new HTTP-level test harness exists for the Express-layer concerns the in-process GraphQL test helper can't reach.
**Depends on**: Nothing (first phase of v1.1; builds on the v1.0 test suite/harness)
**Requirements**: CORS-01, SECRET-01, SECRET-02, PWD-01, PWD-02
**Success Criteria** (what must be TRUE):
  1. A rejected CORS origin never appears in the client-facing error response (only in server-side logs), proven by a new HTTP-level (supertest) test against an importable Express `app`.
  2. Starting the backend with `NODE_ENV=production` and an unset or default (`'change-me'`) `JWT_SECRET` refuses to boot (throws/exits non-zero) before serving traffic.
  3. `NODE_ENV=test` and `NODE_ENV=development` boot normally with the existing weak/shared secret — the full v1.0 test suite (51 tests) stays green after this change lands.
  4. `register` rejects passwords shorter than 8 characters, server-side, before hashing, surfaced through the existing GraphQL-error/`Alert` convention.
  5. `resetPassword` enforces the same 8-character minimum server-side.
**Plans**: 2 plans
Plans:
- [ ] 07-01-PLAN.md — HTTP test harness (importable app + supertest) and CORS-01 origin-echo fix
- [ ] 07-02-PLAN.md — JWT-secret production fail-fast (SECRET-01/02) and 8-char password minimum (PWD-01/02)

### Phase 8: Mailer Abstraction & Reset-Token Remediation
**Goal**: Password reset tokens are never exposed via the API — they reach only the account owner, via a pluggable mailer — closing the documented account-takeover vector.
**Depends on**: Phase 7 (reuses the harness/TDD rhythm; otherwise independent)
**Requirements**: MAIL-01, MAIL-02, RESET-01, RESET-02, RESET-03, RESET-04, RESET-05
**Success Criteria** (what must be TRUE):
  1. `sendMail({ to, subject, text/html })` logs the composed message to the server console in dev/test with zero network egress, and a test can assert "an email was sent" (recipient + token/link) without a live transport.
  2. `requestPasswordReset`'s response no longer contains a `resetToken` field at the schema level — querying it is a GraphQL validation error, not a resolver returning `null`.
  3. The mailer is called with the exact token persisted to the user's `resetPasswordToken` column (not a stand-in value), and is invoked only for accounts that actually exist.
  4. `requestPasswordReset` still returns the identical generic message whether or not the account exists, and reset-token single-use + 30-minute expiry behavior is regression-proofed by test.
  5. The `ForgotPassword` page no longer renders a raw token or a token-gated "continue to reset" button; it shows a static "check your email" confirmation with a persistent link to `/reset-password`.
**Plans**: TBD
**UI hint**: yes

### Phase 9: Session Revocation via passwordChangedAt
**Goal**: Resetting a password immediately invalidates any JWT issued before the reset, closing the stale-session window.
**Depends on**: Phase 8 (touches the same `resetPassword` resolver — sequenced immediately after so that resolver is modified once, not re-touched with unrelated changes interleaved)
**Requirements**: SESS-01, SESS-02, SESS-03
**Success Criteria** (what must be TRUE):
  1. The `User` model has a `passwordChangedAt` column, set only inside the existing `changed('passwordHash')`-guarded hook branch (untouched by unrelated field updates like `role` or `name`).
  2. `resetPassword` sets `passwordChangedAt = now()` when the password actually changes.
  3. A JWT whose `iat` predates the user's `passwordChangedAt` is treated as unauthenticated by `getUserFromRequest` (protected resolvers see a `null` user) — proven by a mandatory same-second boundary test: reset the password and immediately re-login with the new password in the same wall-clock second, and the newly issued token remains valid.
  4. Manual acceptance (not test-catchable): booting the backend against a pre-existing, non-force-synced local dev database with an already-provisioned `users` table produces zero `Unknown column` SQL errors — documented explicitly, since `sequelize.sync()` never alters existing tables and the CI/test database's force-recreate-every-run behavior cannot surface this gap.
**Plans**: TBD

### Phase 10: Rate Limiting on Auth Mutations
**Goal**: Brute-force, enumeration, and reset-token-guessing attempts against `login`, `register`, and `requestPasswordReset` are throttled per client IP, without affecting normal app usage.
**Depends on**: Phase 8, Phase 9 (built after `login`/`register`/`requestPasswordReset` reach their final v1.1 resolver shape, so rate-limit tests aren't rewritten when those resolvers change underneath them)
**Requirements**: RATE-01, RATE-02, RATE-03, RATE-04, RATE-05
**Success Criteria** (what must be TRUE):
  1. `login` is rejected with a rate-limit error after 5 attempts per IP within 15 minutes; further attempts are rejected before credentials are checked.
  2. `register` and `requestPasswordReset` are each rejected after 5 attempts per IP within their respective windows (per hour).
  3. Rate limiting is implemented as an Apollo Server plugin (`didResolveOperation`, keyed by `${clientIp}:${operationName}`) and is exercised by the existing in-process `executeOperation()` test harness — no HTTP boot required to test it.
  4. An interleaved `me`/`dashboard` query in the same window is unaffected by `login`'s rate limit — a burst of ordinary queries never triggers a 429.
  5. A breach returns a generic "too many requests" error, and the attempt-count that triggers a 429 is identical for a real account and a nonexistent one (no new enumeration oracle), proven by a dedicated test.
**Plans**: TBD

### Phase 11: Email Verification & ADMIN Race Fix
**Goal**: New accounts must prove ownership of their email before they receive a usable session or any chance at the ADMIN role — closing the first-user-becomes-ADMIN land-grab race.
**Depends on**: Phase 8 (reuses the mailer built there), Phase 9 (reuses the `getUserFromRequest`/`requireAuth` central-check pattern for the verification gate), Phase 10 (rate-limit config map is designed to absorb `resendVerificationEmail` as a one-line addition)
**Requirements**: VERIFY-01, VERIFY-02, VERIFY-03, VERIFY-04, VERIFY-05, VERIFY-06, VERIFY-07, VERIFY-08
**Success Criteria** (what must be TRUE):
  1. `register` creates an unverified user (`emailVerified: false`), sends a verification email via the mailer, and returns a message-only payload — no JWT, no session, no ADMIN role granted at registration time.
  2. `verifyEmail(token)` validates a cryptographically random, single-use, 24-hour-expiry token, flips `emailVerified` to true, clears the token/expiry, and returns an `AuthPayload` that logs the user in — and ADMIN is assigned only at verification time to the first *verified* user (registering first no longer wins the role if a later registrant verifies first).
  3. `login` rejects an unverified account with a clear message after password validation succeeds, and an unverified user's session is rejected by a protected resolver (e.g. `dashboard`) — not merely hidden in the UI.
  4. `resendVerificationEmail(email)` reissues a fresh, single-use, 24-hour-expiry token for an unverified account, so a lost/expired verification email is recoverable without re-registration.
  5. The frontend `/verify-email` route reads the token, calls `verifyEmail`, and logs the user in on success; `Register` shows a "check your email" state instead of auto-navigating to the dashboard; `AuthContext` handles the message-only register response without setting a session. Manual acceptance: booting the backend against a pre-existing, non-force-synced local dev database with the new `emailVerified`/`emailVerificationToken`/`emailVerificationExpiresAt` columns produces zero `Unknown column` SQL errors.
**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Backend Test Tooling & Test Database | v1.0 | 2/2 | Complete | 2026-07-11 |
| 2. Backend Unit Tests | v1.0 | 2/2 | Complete | 2026-07-11 |
| 3. Backend Integration Tests | v1.0 | 3/3 | Complete | 2026-07-11 |
| 4. Frontend Test Tooling | v1.0 | 1/1 | Complete | 2026-07-12 |
| 5. Frontend Component Tests | v1.0 | 3/3 | Complete | 2026-07-12 |
| 6. Root Orchestration & CI Pipeline | v1.0 | 2/2 | Complete | 2026-07-12 |
| 7. Foundation Hardening — CORS, JWT Fail-Fast & Password Strength | v1.1 | 0/? | Not started | - |
| 8. Mailer Abstraction & Reset-Token Remediation | v1.1 | 0/? | Not started | - |
| 9. Session Revocation via passwordChangedAt | v1.1 | 0/? | Not started | - |
| 10. Rate Limiting on Auth Mutations | v1.1 | 0/? | Not started | - |
| 11. Email Verification & ADMIN Race Fix | v1.1 | 0/? | Not started | - |
