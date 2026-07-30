---
phase: 08-mailer-abstraction-reset-token-remediation
verified: 2026-07-13T22:15:00Z
status: passed
score: 8/8 must-haves verified
overrides_applied: 0
---

# Phase 8: Mailer Abstraction & Reset-Token Remediation Verification Report

**Phase Goal:** Password reset tokens are never exposed via the API — they reach only the account owner, via a pluggable mailer — closing the documented account-takeover vector.
**Verified:** 2026-07-13T22:15:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `sendMail({ to, subject, text/html })` logs the composed message to the server console in dev/test with zero network egress, and a test can assert "an email was sent" without a live transport (SC-1, MAIL-01/02) | VERIFIED | `backend/src/services/mailer.js:4-16` selects `{ jsonTransport: true }` for any non-production `nodeEnv`; `console.log` gated on `env.nodeEnv === 'development'` (line 23-25), silent in test. `resetPassword.test.js:4-6` `vi.mock('../services/mailer.js', ...)` + call-argument assertions at lines 59-61, 71 prove the mailer boundary is assertable without live SMTP. |
| 2 | `requestPasswordReset`'s response no longer contains a `resetToken` field at the schema level — querying it is a GraphQL validation error (SC-2, RESET-01) | VERIFIED | `backend/src/schemas/user.schema.js:21-23` — `PasswordResetPayload { message: String! }`, no `resetToken` field. `resetPassword.test.js:105-110` queries `REQUEST_RESET_WITH_TOKEN_FIELD` (selects `resetToken`) and asserts `response.errors` is defined and `response.data` is falsy — confirmed passing. |
| 3 | The mailer is called with the exact token persisted to `user.resetPasswordToken`, and only for accounts that actually exist (SC-3, RESET-02) | VERIFIED | `backend/src/resolvers/user.resolver.js:60-75` — `issueResetToken()` returns early on `!user` (mailer never called), and calls `sendPasswordResetEmail({ to: user.email, token: resetToken })` after `await user.save()`. `resetPassword.test.js:59-61` asserts `toHaveBeenCalledWith({ to: user.email, token: user.resetPasswordToken })` (call-argument match, not just call count); line 71 asserts `not.toHaveBeenCalled()` for the nonexistent-account branch. |
| 4 | `requestPasswordReset` returns the identical generic message regardless of account existence, and single-use + 30-minute expiry are regression-proofed (SC-4, RESET-03/04) | VERIFIED | `RESET_REQUEST_MESSAGE` constant returned unconditionally at `user.resolver.js:86`. `resetPassword.test.js:133-152` (reuse of a consumed token rejected) and `:154-172` (expired token rejected, password unchanged) both pass. |
| 5 | `ForgotPassword.jsx` no longer renders a raw token or a token-gated "continue to reset" button; shows a static confirmation with a persistent link to `/reset-password` (SC-5, RESET-05) | VERIFIED | `frontend/src/pages/ForgotPassword.jsx:47-74` — success branch is an unconditional ternary rendering `Alert` + unconditional `Button` linking to `/reset-password`; no `resetToken` reference anywhere in the file (`grep -c resetToken` = 0). `ForgotPassword.test.jsx` asserts the email field/button unmount, no raw-token pattern renders, and the "continue to reset" link renders unconditionally. `ResetPassword.jsx:14-17,58-66` reads `?token=` via `useSearchParams()`, hides the manual field when present, falls back otherwise; `ResetPassword.test.jsx` covers both cases. |
| 6 | Production boot refuses to start when SMTP config is missing/incomplete, and never fires in test/development (MAIL-01, D-03) | VERIFIED | `backend/src/config/assertProductionMailConfig.js` — allowlist-of-one on `nodeEnv === 'production'`; wired into `env.js:41-46`. `08-01-SUMMARY.md` records a manual `NODE_ENV=production` boot attempt exiting non-zero with the expected message; full backend suite (67/67) currently green under `NODE_ENV=test` with zero SMTP vars set, confirming the guard never fires outside production. |
| 7 | Anti-enumeration is not undermined by a response-timing side channel (implicit in "closing the documented account-takeover vector") | VERIFIED (post-review fix) | Code review (08-REVIEW.md CR-01) found the two branches did measurably different DB work, reopening a timing oracle. Fixed in commit `5fad2ac`: both paths floored at `MIN_RESET_RESPONSE_MS = 250` (`user.resolver.js:7,60-86`). Regression test `resetPassword.test.js:74-103` samples 5 existing vs. 5 missing requests and asserts median latency difference `< 50ms`. Full suite re-run confirms passing (67/67). |
| 8 | The production SMTP transport enforces encryption, and the production deploy path (`env/remote.env`, `docker-compose.yml`, README) is configured so the boot guard doesn't crash-loop the only production deploy path | VERIFIED (post-review fix) | Review found CR-02 (env/remote.env had `NODE_ENV=production` with zero `SMTP_*` vars, crash-looping `docker:remote`) and CR-03 (no `secure`/`requireTLS`, cleartext STARTTLS-stripping possible). Fixed in `b6193e3` (`buildTransportOptions` — `secure: port === 465`, `requireTLS: true` otherwise, new `mailer.test.js` covering ports 25/465/587/2525) and `ce1efd4` (placeholder `SMTP_*` values added to `env/remote.env`, commented placeholders in dev templates, `docker-compose.yml` passthrough, README "Email configuration" section). Verified via `git show` diffs and current file contents. |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/services/mailer.js` | `sendMail`/`sendPasswordResetEmail` exports, nodemailer-backed, env-driven transport | VERIFIED | Both exports present, `buildTransportOptions` extracted (TLS-safe), wired to `env.js` |
| `backend/src/config/assertProductionMailConfig.js` | Pure fail-fast assertion mirroring `assertProductionSecrets` | VERIFIED | Exists, one condition, `nodeEnv === 'production'` allowlist-of-one |
| `backend/src/config/assertProductionMailConfig.test.js` | Unit tests, nodeEnv x SMTP-completeness quadrants | VERIFIED | Present, part of green backend suite |
| `backend/src/schemas/user.schema.js` | `PasswordResetPayload` with `resetToken` deleted | VERIFIED | `{ message: String! }` only |
| `backend/src/resolvers/user.resolver.js` | `requestPasswordReset` drops `resetToken`, calls mailer fire-and-forget, latency-normalized | VERIFIED | `sendPasswordResetEmail` imported and called; `MIN_RESET_RESPONSE_MS` floor present |
| `backend/src/resolvers/resetPassword.test.js` | `vi.mock()`-based mailer call-argument assertions + single-use/expiry + timing regression | VERIFIED | All present and passing |
| `frontend/src/pages/ForgotPassword.jsx` + `.test.jsx` | Confirmation-panel UI, no `resetToken` | VERIFIED | 0 `resetToken` references; 3 RTL tests passing |
| `frontend/src/pages/ResetPassword.jsx` + `.test.jsx` | `useSearchParams()`-driven token field | VERIFIED | `useSearchParams` used twice (import + call); 2 RTL tests passing |
| `backend/src/services/mailer.test.js` | Transport-option TLS coverage (added during review remediation, not originally planned) | VERIFIED | 4 tests covering jsonTransport selection and TLS enforcement across ports |
| `env/remote.env`, `docker-compose.yml`, `README.md` | Production SMTP config plumbed end-to-end | VERIFIED | Placeholder SMTP vars present, docker-compose passthrough added, README "Email configuration" section added |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `env.js` | `assertProductionMailConfig.js` | call at bottom of `env.js` | WIRED | `env.js:41-46` |
| `mailer.js` | `env.js` | `env.nodeEnv` branch selects transport | WIRED | `buildTransportOptions({ nodeEnv, ... })` |
| `user.resolver.js` | `mailer.js` | `import { sendPasswordResetEmail }` + fire-and-forget call | WIRED | `user.resolver.js:3,72-74` |
| `resetPassword.test.js` | `mailer.js` | `vi.mock('../services/mailer.js', ...)` | WIRED | Intercepts resolver's direct import; call-argument assertions pass |
| `ForgotPassword.jsx` | `requestPasswordReset` mutation | `graphqlRequest(REQUEST_RESET, { email })`, selection `{ message }` | WIRED | Confirmed by test asserting exact mutation string |
| `ResetPassword.jsx` | `react-router-dom` | `useSearchParams().get('token')` seeds `form.token` | WIRED | Confirmed by URL-seeded RTL test |
| Emailed link (`sendPasswordResetEmail`) | `ResetPassword.jsx` | `${env.clientUrl}/reset-password?token=...` → `useSearchParams()` read | WIRED | Link shape in `mailer.js:31` matches the `?token=` param `ResetPassword.jsx` reads |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full backend suite green | `npm test --workspace backend` | 15 files / 67 tests passed | PASS |
| Full frontend suite green | `npm test --workspace frontend` | 6 files / 17 tests passed | PASS |
| No `resetToken` in frontend pages or GraphQL schema | `grep -rn resetToken frontend/src/pages/*.jsx backend/src/schemas` | 0 matches | PASS |
| Fix commits actually contain claimed changes | `git show 5fad2ac / b6193e3 / ce1efd4` | Diffs match SUMMARY/execution_history claims | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|--------------|-------------|--------------|--------|----------|
| MAIL-01 | 08-01 | Pluggable mailer, zero-egress dev/test, SMTP-wired production | SATISFIED | `mailer.js`, `assertProductionMailConfig.js` |
| MAIL-02 | 08-03 | Backend tests assert "email sent" at mailer boundary without live transport | SATISFIED | `vi.mock()` + call-argument assertions in `resetPassword.test.js` |
| RESET-01 | 08-03 | `resetToken` dropped from `PasswordResetPayload` at schema level | SATISFIED | Schema-level deletion confirmed; validation-error test passes |
| RESET-02 | 08-03 | Reset token delivered via mailer with `${CLIENT_URL}/reset-password?token=...` link | SATISFIED | `sendPasswordResetEmail` link construction; `ResetPassword.jsx` reads it |
| RESET-03 | 08-03 | Identical generic message regardless of account existence | SATISFIED | `RESET_REQUEST_MESSAGE` constant, both branches; timing oracle also closed (CR-01) |
| RESET-04 | 08-03 | Single-use + 30-min expiry preserved, regression-proofed | SATISFIED | Two dedicated regression tests passing |
| RESET-05 | 08-02 | `ForgotPassword` shows static confirmation, no raw token rendering | SATISFIED | Confirmation-panel ternary, RTL regression tests |

No orphaned requirements — REQUIREMENTS.md maps exactly MAIL-01, MAIL-02, RESET-01..05 to Phase 8, and all seven appear in the combined `requirements:` frontmatter of plans 08-01/08-02/08-03.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/src/resolvers/user.resolver.js` / `backend/src/models/User.js` | n/a | Reset tokens stored in the `users` table in plaintext (WR-08, 08-REVIEW.md), not hashed at rest | ℹ️ Info / Known limitation — NOT a phase-8 blocker | This is a DB-at-rest concern, distinct from "exposed via the API" (the vector this phase's goal and REQUIREMENTS.md RESET-01..05 explicitly target). Anyone with direct DB read access (SQLi, leaked backup, over-privileged replica) can mint a valid reset for any account with a pending request. Recommend tracking as a follow-up hardening item (e.g., store `sha256(token)`, email the raw value) — not required to close the phase's stated goal, but worth an explicit backlog entry since it is a real account-takeover path once the original one is fixed. |
| `frontend/src/pages/ForgotPassword.jsx:52-54` | — | "Continue to reset password" button links to `/reset-password` with no `?token=`, dead-ending into a manual-paste field the UI gives no way to fill (IN-02, 08-REVIEW.md) | ℹ️ Info | UX rough edge, not a security issue — user can still paste the emailed token manually. Non-blocking. |
| `backend/src/resolvers/user.resolver.js` (mailer `.catch()`) | 72-74 | Mailer delivery failures are only logged server-side (`console.error`), invisible to the user or any monitoring (WR-01, WR-05, 08-REVIEW.md) | ℹ️ Info | Deliberate design tension (can't surface "send failed" without leaking account existence) — acknowledged by the review as requiring out-of-band observability, not a response-shape change. Not a phase-8 blocker. |

No `TBD`/`FIXME`/`XXX` debt markers found in any file modified by this phase.

### Human Verification Required

None. No `<human-check>` blocks were deferred from any plan in this phase (only checkpoint was Task 1 of 08-01, the nodemailer package-legitimacy gate, which is a completed, documented human approval — not a deferred item). Real SMTP delivery end-to-end is explicitly out of scope for this milestone (REQUIREMENTS.md "Out of Scope: Live email provider account").

### Gaps Summary

No gaps. All 5 ROADMAP success criteria and all 7 requirement IDs (MAIL-01, MAIL-02, RESET-01..05) are verified against the actual codebase, not just SUMMARY.md claims. The code review (08-REVIEW.md) found 3 Critical issues after the original 3 plans landed — a timing side-channel that reopened the anti-enumeration guarantee, a production-deploy-breaking boot assertion, and a missing-TLS SMTP transport. All three were independently confirmed fixed by inspecting the actual diffs of commits `5fad2ac`, `b6193e3`, and `ce1efd4` (not just trusting the execution_history note), and the full test suite (67 backend / 17 frontend) passes after the fixes.

The review's remaining Warning/Info findings (WR-02 through WR-08, IN-01 through IN-05) were deliberately left open per the user's explicit instruction and are documented above under Anti-Patterns for visibility. Of these, WR-08 (plaintext reset-token storage at rest) is the most security-relevant, but it addresses a different threat vector (DB read access) than the one this phase's goal and REQUIREMENTS.md explicitly target (API exposure) — it does not undermine the phase goal as literally stated, but is flagged here as a recommended follow-up item that has no current owner in the roadmap (Phases 9-11 do not address it).

---

_Verified: 2026-07-13T22:15:00Z_
_Verifier: Claude (gsd-verifier)_
