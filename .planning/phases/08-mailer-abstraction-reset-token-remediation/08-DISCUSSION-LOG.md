# Phase 8: Mailer Abstraction & Reset-Token Remediation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-13
**Phase:** 8-Mailer Abstraction & Reset-Token Remediation
**Areas discussed:** Mailer implementation, Mailer test seam, Reset link + paste flow, Copy + confirmation state

---

## Mailer Implementation

### Q1 — How should the mailer be built?

| Option | Description | Selected |
|--------|-------------|----------|
| nodemailer + jsonTransport | Research rec. `nodemailer@^9` as a backend dep; jsonTransport in dev/test (zero egress, inspectable object); prod swaps in SMTP via env — config change, not a rewrite. Cost: 1 new runtime dep. | ✓ |
| Hand-rolled `sendMail()` | Zero new deps, matching the Phase 7 D-03 call. console.log + in-memory outbox. Prod SMTP is a documented TODO behind the same interface. | |
| Hand-rolled + transport hook | Zero deps now, but `sendMail()` dispatches through a swappable transport (console in dev/test, `smtp` branch that throws in prod). | |

**User's choice:** nodemailer + jsonTransport
**Notes:** Deliberately reverses the Phase 7 D-03 precedent (where the researcher's `validator` package was rejected in favor of a hand-rolled helper). The difference: MAIL-01 explicitly requires production wiring "without a code rewrite," which nodemailer delivers as a transport swap.

### Q2 — What surface does the mailer module expose to the resolver?

| Option | Description | Selected |
|--------|-------------|----------|
| `sendMail` only | Resolver composes subject/body/link itself. Minimal surface, but email copy lands in `user.resolver.js` and Phase 11 would duplicate the composing logic. | |
| `sendMail` + `sendPasswordResetEmail` | Research rec. `sendMail()` is the generic primitive; `sendPasswordResetEmail({to, token})` owns subject/body/link. Phase 11 adds `sendVerificationEmail` alongside. | ✓ |

**User's choice:** sendMail + sendPasswordResetEmail

### Q3 — Transport selection, and production with missing SMTP env?

| Option | Description | Selected |
|--------|-------------|----------|
| NODE_ENV picks it; prod fails fast | dev/test → jsonTransport. production → SMTP from env; missing SMTP env in production **refuses to boot**, symmetric with Phase 7's `assertProductionSecrets()`. A prod deploy can never silently swallow reset emails. | ✓ |
| NODE_ENV picks it; prod degrades | Same selection, but missing SMTP env in prod falls back to jsonTransport with a loud `console.warn`. Prod still boots; emails go nowhere. | |
| `MAIL_TRANSPORT` env var | Explicit `json\|smtp` var, defaulting to json. Decouples transport from NODE_ENV (staging against real SMTP). One more env var to get wrong. | |

**User's choice:** NODE_ENV picks it; prod fails fast

### Q4 — Who console.logs the composed message, and does the test run print too?

| Option | Description | Selected |
|--------|-------------|----------|
| Log in dev only, silent in test | `sendMail` logs when `nodeEnv === 'development'`. Test stays silent — tests assert at the mailer boundary, so printing 50+ tests' worth of fake emails is noise. SC-1's "dev/test" satisfied by zero-egress + assertable. | ✓ |
| Log in both dev and test | Literal reading of SC-1: log whenever transport is jsonTransport. Noisy test output, but no NODE_ENV branch inside `sendMail`. | |
| Log in dev, test opts in | Silent in test by default; `MAIL_DEBUG=1` turns printing on for debugging. | |

**User's choice:** Log in dev only, silent in test

---

## Mailer Test Seam

### Q1 — How does a backend test assert "an email was sent to X containing token Y"?

| Option | Description | Selected |
|--------|-------------|----------|
| `vi.mock` the mailer module | Research rec. `vi.mock('../services/mailer.js')`; assert `sendPasswordResetEmail` called with `{ to, token: <exact value in user.resetPasswordToken> }`. Real nodemailer never runs in tests. Standard Vitest idiom; no test-only state in production code. | ✓ |
| In-memory outbox | Module-level `sentMail[]` + exported `clearOutbox()`. Exercises real nodemailer composition (catches a broken link template). Cost: test-only state in prod code + module-singleton reset discipline. | |
| Assert on jsonTransport result | `sendMail` returns the composed message JSON; test parses `info.message`. Most "real," but the resolver can't hand the result back to the test without changing the mutation's return shape. | |

**User's choice:** vi.mock the mailer module

### Q2 — With the mailer mocked, nothing exercises the real link-composition. Add a direct unit test of `mailer.js`?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — `mailer.test.js` | Calls the real `sendPasswordResetEmail` against jsonTransport; asserts recipient, subject, and body containing `${CLIENT_URL}/reset-password?token=<token>` exactly. Closes the gap `vi.mock` leaves. | |
| No — resolver test only | Trust the template. Only the resolver→mailer contract is tested. A broken reset link would be invisible to CI. | ✓ |

**User's choice:** No — resolver test only
**Notes:** Accepted risk, recorded as D-07. Partially mitigated by `ResetPassword.test.jsx`, which pins the *reading* half of the `?token=` contract. Logged as a deferred idea worth revisiting in Phase 11, when a second email template starts sharing `sendMail()`.

### Q3 — Should `requestPasswordReset` await the mail send?

| Option | Description | Selected |
|--------|-------------|----------|
| Await it, accept timing skew | Simplest; test asserts the mock synchronously. But existing accounts respond measurably slower than nonexistent ones (timing oracle), and a send failure surfaces as a GraphQL error only for accounts that exist (a second oracle). | |
| Fire-and-forget with `.catch()` | Constant-time response regardless of account existence; a dead SMTP box can never leak existence via error. Cost: the resolver test must await the mock rather than assert synchronously. | ✓ |
| You decide | Let the planner pick based on test determinism. | |

**User's choice:** Fire-and-forget with `.catch()`
**Notes:** Flakiness concern resolved in-discussion — the test uses Vitest's `vi.waitFor()` to await the mock call, not a raw microtask flush.

---

## Reset Link + Paste Flow

### Q1 — What happens when the user clicks the emailed `/reset-password?token=...` link?

Surfaced during codebase scout: `ResetPassword.jsx:55-61` has a manual "Reset token" paste field and reads nothing from the URL, so the link RESET-02 specifies would land the user on a form they still have to paste into.

| Option | Description | Selected |
|--------|-------------|----------|
| Prefill from query param | `useSearchParams()` prefills the token field, still editable so manual paste keeps working. Emailed link becomes a real one-click flow. | |
| Prefill and hide the field | Same read, but when a token is in the URL the field is hidden entirely — user sees only "New password." Paste field appears only when there's no token in the URL. Cleanest UX. | ✓ |
| Leave the paste field alone | Ship mailer + schema change only; user pastes the token from the email body. Zero frontend risk, but the emailed link is decoration and needs a follow-up phase. | |

**User's choice:** Prefill and hide the field

### Q2 — Which frontend pages get RTL tests this phase?

| Option | Description | Selected |
|--------|-------------|----------|
| Both pages | `ForgotPassword.test.jsx` (confirmation renders; no raw token / no token-gated button ever renders — a regression guard on the exact vulnerability) + `ResetPassword.test.jsx` (with `?token=abc`, field hidden and mutation called with `abc`; without it, paste field renders). | ✓ |
| ForgotPassword only | Test the page named in RESET-05; `ResetPassword`'s query-param read ships untested — and it's the one carrying the token. | |

**User's choice:** Both pages

---

## Copy + Confirmation State

### Q1 — New generic message for `requestPasswordReset`?

The current string — `If the account exists, a password reset token has been generated.` — is asserted verbatim twice in `resetPassword.test.js` and describes a mechanic users will never see.

| Option | Description | Selected |
|--------|-------------|----------|
| `If the account exists, a password reset link has been sent.` | Minimal edit; same anti-enumeration hedge, same terse tone as the existing error strings. Existing tests update to the new constant. | ✓ |
| `If an account exists for that email, we've sent a password reset link.` | Warmer, more conventional product copy; less terse than the codebase's existing strings. | |
| Keep the current string | Zero test churn, but actively misleading — users never see a token. | |

**User's choice:** `If the account exists, a password reset link has been sent.`

### Q2 — What does `ForgotPassword` render after a successful submit?

| Option | Description | Selected |
|--------|-------------|----------|
| Replace the form with a confirmation panel | Email field and submit button unmount; card shows the generic message, a persistent `/reset-password` link, and the "Back to sign in" footer. Nothing token-shaped *can* render — no branch left that could. | ✓ |
| Keep the form, show a success Alert | Current shape minus the token box. Smaller diff, but preserves the exact conditional-render structure that leaked the token in the first place. | |

**User's choice:** Replace the form with a confirmation panel

---

## Claude's Discretion

- Whether `PasswordResetPayload` survives as a single-field `{ message: String! }` type or collapses into a different return shape (recommendation recorded in CONTEXT.md: keep the type). Either way the `resetToken` field is deleted from the SDL, not nulled in the resolver.
- Exact SMTP env-var names and the shape of the production boot assertion.
- Whether the reset email is text-only or text + html; the subject line and body copy.
- The rewritten `ForgotPassword` subtitle and confirmation-panel copy.
- Exact file/function names beyond `services/mailer.js`, `sendMail`, `sendPasswordResetEmail`.

## Deferred Ideas

- **A dedicated `mailer.test.js`** asserting real link-composition against jsonTransport — declined this phase (Q2 of Mailer Test Seam). Worth revisiting in Phase 11, when `sendVerificationEmail` makes the composition layer carry real weight.
- **A live SMTP/SES/SendGrid account** — a deployment concern, explicitly deferred out of this milestone per PROJECT.md. Phase 8 leaves production wired-but-unconfigured (and boot-refusing), which is exactly what that deferral implies.
