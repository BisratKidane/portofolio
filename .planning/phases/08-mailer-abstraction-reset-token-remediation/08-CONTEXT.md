# Phase 8: Mailer Abstraction & Reset-Token Remediation - Context

**Gathered:** 2026-07-13
**Status:** Ready for planning

<domain>
## Phase Boundary

The password reset token stops flowing back through the API and instead reaches only the account owner, via a pluggable mailer. Four coupled changes:

1. **MAIL-01/02** — a new `backend/src/services/mailer.js` exposing `sendMail()` + `sendPasswordResetEmail()`, backed by nodemailer, with zero network egress in dev/test and a real SMTP transport in production.
2. **RESET-01/02/03/04** — `resetToken` deleted from `PasswordResetPayload` at the **schema level** (not resolver-level nulling); the token is delivered only by email as a `${CLIENT_URL}/reset-password?token=...` link; the generic anti-enumeration message and the single-use + 30-minute expiry behavior are preserved and regression-proofed by test.
3. **RESET-05** — `ForgotPassword.jsx` stops rendering the raw token and the token-gated "Continue to reset" button; it shows a static confirmation instead.
4. **Emailed-link follow-through** — `ResetPassword.jsx` reads the token from the URL query param so the emailed link is a working one-click flow rather than decoration.

Every change is TDD'd red-green-refactor, per the Phase 7 rhythm.

**Out of scope:** standing up a real SMTP/SES/SendGrid account (deployment concern, explicitly deferred in PROJECT.md); `passwordChangedAt` session revocation (Phase 9); rate limiting (Phase 10); email verification (Phase 11).

</domain>

<decisions>
## Implementation Decisions

### Mailer Implementation
- **D-01:** Build on **`nodemailer@^9.0.3`** (new backend runtime dependency) using `jsonTransport` in dev/test. Accepted over a hand-rolled zero-dep mailer — this reverses the Phase 7 D-03 precedent deliberately: MAIL-01 requires the mailer to be "wired for a real SMTP provider in production without a code rewrite," and with nodemailer that is a transport-config swap rather than writing an SMTP client by hand later.
- **D-02:** `backend/src/services/mailer.js` exposes **two** functions:
  - `sendMail({ to, subject, text, html })` — the generic transport primitive.
  - `sendPasswordResetEmail({ to, token })` — a thin wrapper that owns the subject, body, and reset-link composition, and calls `sendMail()`.

  The resolver calls the **wrapper**, not `sendMail()` directly. Email copy lives with the mailer, not inside `user.resolver.js`. Phase 11's `sendVerificationEmail()` slots in alongside it, reusing `sendMail()`.
- **D-03:** Transport is selected by `NODE_ENV`:
  - `development` / `test` → `jsonTransport` (composes the message, zero network egress).
  - `production` → SMTP transport built from env vars.
  - **Production with missing/incomplete SMTP env refuses to boot** (throws/exits non-zero before serving traffic) — deliberately symmetric with Phase 7's `assertProductionSecrets()`. Rationale: a prod deploy must never silently swallow reset emails. This must never fire in `test`/`development` (same gating discipline as SECRET-01; see Phase 7 PITFALLS entry 5).
- **D-04:** `sendMail()` `console.log`s the composed message (recipient, subject, body including the reset link) **only when `nodeEnv === 'development'`**. It stays silent in `test` — tests assert at the mailer boundary (D-05), so printing fake emails across a 50+ test suite is pure noise. SC-1's "dev/test" is satisfied by *zero egress + assertable*; human-readable console output goes where a human is actually watching.

### Mailer Test Seam (MAIL-02)
- **D-05:** Resolver tests **`vi.mock()` the mailer module**. `resetPassword.test.js` asserts `sendPasswordResetEmail` was called with `{ to: <the requested email>, token: <the exact value now persisted in user.resetPasswordToken> }` — **assert call arguments, not call count** (SC-3, and the explicit over-mocking warning in SUMMARY.md §Phase 3). The real nodemailer never runs in tests.
- **D-06:** Also assert the **negative**: for an email with no matching account, `sendPasswordResetEmail` is **not called at all** (SC-3: "invoked only for accounts that actually exist"), while the response message stays identical (RESET-03).
- **D-07:** **No dedicated `mailer.test.js`.** User explicitly declined a direct unit test of the real link-composition against `jsonTransport`. Accepted consequence: a typo in the reset-link template is not caught by CI at the mailer boundary. Partially mitigated because `ResetPassword.test.jsx` (D-10) pins the *reading* half of the `?token=` contract. If the planner finds this test is nearly free to add, it is welcome — but it is not required.
- **D-08:** `requestPasswordReset` sends **fire-and-forget**: it kicks off `sendPasswordResetEmail(...)` without awaiting, attaches a `.catch()` that logs the failure server-side, and returns the generic message immediately. Rationale: awaiting real SMTP makes existing accounts respond measurably slower than nonexistent ones — a timing side-channel that partly undoes RESET-03's anti-enumeration guarantee — and a dead SMTP box would otherwise surface as a GraphQL error only for accounts that exist, which is a second, louder oracle.
  - **Test consequence:** the resolver test must not assert the mock synchronously. Use Vitest's **`await vi.waitFor(() => expect(sendPasswordResetEmail).toHaveBeenCalledWith(...))`** rather than a raw microtask flush — deterministic, not flaky.

### Reset Link & the Paste Flow
- **D-09:** `ResetPassword.jsx` reads the token from the URL via `useSearchParams()` (react-router-dom is already a dependency).
  - **Token present in URL** → the "Reset token" text field is **hidden entirely**; the user sees only the "New password" field. The token from the URL is submitted with the mutation.
  - **No token in URL** (direct navigation to `/reset-password`) → the paste field renders as it does today. This is the fallback path that SC-5's persistent link from `ForgotPassword` leads to.
- **D-10:** **Both** frontend pages get RTL tests this phase (both have zero coverage today, and both change). Follow the existing `Login.test.jsx` / `Register.test.jsx` pattern.
  - `ForgotPassword.test.jsx` — after a successful submit, the static confirmation renders **and no raw token / no token-gated button is ever rendered**. This is a direct regression guard on the exact vulnerability being closed.
  - `ResetPassword.test.jsx` — with `?token=abc` in the URL, the token field is absent and the mutation is called with `abc`; with no query param, the paste field renders.

### Copy & Confirmation State
- **D-11:** The generic message returned by `requestPasswordReset` for **both** existing and nonexistent accounts becomes exactly:

  `If the account exists, a password reset link has been sent.`

  (Replaces `If the account exists, a password reset token has been generated.` — which described an internal mechanic users will never see.) The two existing verbatim assertions in `backend/src/resolvers/resetPassword.test.js` update to this new constant. Terse tone matches the existing error strings (`A user with this email already exists.`).
- **D-12:** On successful submit, `ForgotPassword.jsx` **replaces the form with a confirmation panel** — the email field and submit button unmount. The card shows the generic message, a persistent link to `/reset-password` (for users who prefer to paste the token), and the existing "Back to sign in" footer. Chosen over keeping the form with a success `<Alert>`: unmounting the form means there is no conditional-render branch left that *could* leak a token — the structural guarantee, not just the absence of the leak. The page subtitle ("Enter your email and we'll generate a reset token for you.") must be rewritten to match.

### Claude's Discretion
- Whether `PasswordResetPayload` survives as a single-field `{ message: String! }` type or collapses into a scalar/different return shape. **Recommendation: keep the type** — it satisfies SC-2 (querying `resetToken` becomes a GraphQL *validation* error), and it minimizes churn in the frontend query. Either way the `resetToken` field must be **deleted from the SDL**, not nulled in the resolver.
- Exact SMTP env-var names (`SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` or similar), where they surface on the `env` object, and the shape of the production assertion (a pure exported function called at boot, per the Phase 7 `assertProductionSecrets` pattern).
- Whether the reset email is text-only or text + html, and the exact subject line and body copy.
- The rewritten `ForgotPassword` subtitle and confirmation-panel copy.
- Exact file/function names beyond `services/mailer.js`, `sendMail`, `sendPasswordResetEmail`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/ROADMAP.md` §"Phase 8: Mailer Abstraction & Reset-Token Remediation" — goal, 5 success criteria (SC-1..SC-5), dependency note (Phase 9 touches the same `resetPassword` resolver next).
- `.planning/REQUIREMENTS.md` — MAIL-01, MAIL-02, RESET-01..RESET-05 (exact acceptance wording).

### Security Research (governing synthesis for this milestone)
- `.planning/research/SUMMARY.md` — **primary**. §"Phase 3: Mailer Abstraction & Reset-Token Remediation" (rationale / delivers / avoids — including the explicit "mailer test over-mocking: assert call *arguments*, e.g. token match against `user.resetPasswordToken`, not just call count" warning, and "this frontend page has zero existing test coverage today — add one in this phase, don't defer it"). Also §"Recommended Stack" for the nodemailer rationale.
- `.planning/research/STACK.md` — `nodemailer@^9.0.3` row (jsonTransport/streamTransport zero-egress mode; CJS-in-ESM interop is fine); the "hand-rolled console.log mailer" alternative and why it was rejected; the "no live SMTP account this milestone" entry under What NOT to Use.
- `.planning/research/ARCHITECTURE.md` — the `services/` directory rationale (deliberate deviation from flat `utils/` because this is an external-integration boundary) and the direct-import + `vi.mock()` injection pattern (not Apollo context injection).
- `.planning/research/PITFALLS.md` — the fail-fast-must-be-production-only pitfall (applies verbatim to D-03's SMTP assertion, not just to JWT).

### Prior phase context (carried forward)
- `.planning/phases/07-foundation-hardening-cors-jwt-fail-fast-password-strength/07-CONTEXT.md` — D-05 (`assertProductionSecrets` as a pure exported assertion, unit-testable with plain arguments, gated strictly on `production`) is the template D-03's SMTP boot assertion must follow.

### Code touched this phase
- `backend/src/schemas/user.schema.js:21-24` — `PasswordResetPayload`; the `resetToken: String` field is deleted here (RESET-01, SC-2).
- `backend/src/resolvers/user.resolver.js:51-65` — `requestPasswordReset`; stops returning `resetToken`, calls `sendPasswordResetEmail` fire-and-forget for existing accounts only.
- `backend/src/resolvers/resetPassword.test.js` — existing suite; two verbatim message assertions update to D-11's string, and the `resetToken` selection is removed from `REQUEST_RESET_MUTATION` (it becomes a validation error). RESET-04's single-use + 30-min expiry regression tests are added here.
- `backend/src/config/env.js` — SMTP env vars surface here; the production mailer assertion is wired at boot alongside the existing `assertProductionSecrets(...)` call at `:34`.
- `frontend/src/pages/ForgotPassword.jsx` — drop `resetToken` from the query (`:9`), delete the token `<Box>` (`:53-67`) and the token-gated "Continue to reset" button (`:82-86`), replace the form with the confirmation panel.
- `frontend/src/pages/ResetPassword.jsx:55-61` — the manual "Reset token" field; prefilled from and hidden by the `?token=` query param.
- **New:** `backend/src/services/mailer.js`, `frontend/src/pages/ForgotPassword.test.jsx`, `frontend/src/pages/ResetPassword.test.jsx`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/test/helpers.js` — `graphql()`, `resetTables()`, `createTestUser()`. `createTestUser()` already accepts `resetPasswordToken` / `resetPasswordExpiresAt` overrides (see `resetPassword.test.js:53-57`), so RESET-04's expiry and single-use regression tests need no new helper.
- `frontend/src/pages/Login.test.jsx` and `Register.test.jsx` — the established RTL + jsdom pattern (render, `userEvent`, mocked `graphqlRequest`). Both new frontend test files copy this shape directly.
- `backend/src/utils/auth.js` — `createResetToken()` and `resetTokenExpiry()` already exist and are unchanged; the token value they produce is exactly what must be handed to `sendPasswordResetEmail` (SC-3).
- `env.clientUrl` is already on the `env` object (`backend/src/config/env.js:20`) — the reset-link base URL needs no new config.

### Established Patterns
- Backend utilities are plain named exports; the new `services/` directory is a deliberate, research-endorsed one-off for external-integration boundaries (mailer), distinct from pure helpers in `utils/`.
- Resolvers `throw new Error('...')`; Apollo surfaces the message; the frontend shows it in an MUI `<Alert severity="error">`. The mailer's fire-and-forget `.catch()` (D-08) deliberately does **not** ride this path — a send failure is logged server-side and never reaches the client.
- `env.js` executes at module-import time, so D-03's production SMTP assertion must be gated exactly like `assertProductionSecrets` or it breaks every backend test in one commit.
- Frontend pages define their GraphQL operations as SCREAMING_SNAKE_CASE template-literal constants at module scope and call `graphqlRequest(OP, vars)`.

### Integration Points
- `requestPasswordReset` resolver → `sendPasswordResetEmail({ to: user.email, token: resetToken })`, called after `await user.save()` so the persisted token and the emailed token are provably the same value.
- Backend boot → SMTP env assertion, next to the existing `assertProductionSecrets(...)` call.
- Emailed link `${env.clientUrl}/reset-password?token=...` → `ResetPassword.jsx`'s `useSearchParams()` read. This is the one cross-tier contract in the phase; D-07 leaves the *composing* half of it unpinned by test, and D-10's `ResetPassword.test.jsx` pins the *reading* half.

</code_context>

<specifics>
## Specific Ideas

- Generic message verbatim: `If the account exists, a password reset link has been sent.`
- Reset link shape verbatim: `${CLIENT_URL}/reset-password?token=<token>`
- Test assertion style for the mailer: `await vi.waitFor(() => expect(sendPasswordResetEmail).toHaveBeenCalledWith({ to: ..., token: <value read back from user.resetPasswordToken> }))`.

</specifics>

<deferred>
## Deferred Ideas

- **A dedicated `mailer.test.js`** asserting the real `sendPasswordResetEmail` composition against `jsonTransport` (recipient, subject, and body containing the exact `/reset-password?token=...` link). Declined this phase (D-07). Worth revisiting when Phase 11 adds `sendVerificationEmail` — at that point two email templates share `sendMail()` and the composition layer starts carrying real weight.
- **Standing up a live SMTP/SES/SendGrid account** — explicitly a deployment concern, deferred out of this milestone per PROJECT.md. D-03 leaves production wired-but-unconfigured (and boot-refusing), which is exactly the state that deferral implies.

</deferred>

---

*Phase: 8-Mailer Abstraction & Reset-Token Remediation*
*Context gathered: 2026-07-13*
