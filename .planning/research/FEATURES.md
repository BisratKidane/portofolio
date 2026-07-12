# Feature Research

**Domain:** Security remediation for an existing email+password auth app (Express 4 + Apollo Server 4 GraphQL, Sequelize/MySQL, React/MUI)
**Researched:** 2026-07-12
**Confidence:** HIGH (OWASP-backed for the 5 well-established auth patterns) / MEDIUM (GraphQL-specific rate-limiting shape, which has no single dominant convention)

## Feature Landscape

### Table Stakes (Must-Have For Each Fix To Be Real)

These are the minimum behaviors without which the fix doesn't actually close the vulnerability it targets. Cutting any of these means shipping a fix that looks done but isn't.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **(1) `requestPasswordReset` returns generic message only, no `resetToken` field** | OWASP Forgot Password Cheat Sheet: same response for existent/non-existent accounts, and the token itself must never cross the network to the requester | LOW | Drop `resetToken` from `PasswordResetPayload` in `backend/src/schemas/user.schema.js:21-24`; stop setting it in `backend/src/resolvers/user.resolver.js:58-61`. Message stays identical for both branches (already true today). |
| **(1) Pluggable mailer interface: `sendMail({ to, subject, text/html })`, dev impl logs to console** | Project decision: "same mailer backs email verification" — needs a single abstraction reused by fix #1 and fix #6 | LOW-MEDIUM | New module, e.g. `backend/src/utils/mailer.js`, exporting one function swapped by `NODE_ENV`/an explicit `MAIL_DRIVER` env var. Console-log driver for dev/test, a stub "not configured" driver for prod until a real provider is wired (out of scope this milestone). No new runtime dependency required — `console.log`/plain SMTP via Node's `nodemailer` are both viable; see Differentiators. |
| **(1) Reset token single-use** | OWASP: token invalidated the instant it's consumed | LOW | Already implicit — `resetPassword` clears `resetPasswordToken`/`resetPasswordExpiresAt` on success (`user.resolver.js:70-71`). No new work, just don't regress it. |
| **(1) Reset token expiry enforced** | OWASP: short-lived window (15–60 min) | LOW | Already implemented via `resetPasswordExpiresAt` + `resetTokenExpiry()` (`auth.js:35-37`, default 30 min via `RESET_TOKEN_EXPIRES_MINUTES`). Keep as-is; just confirm the check still fires (`user.resolver.js:65-67`). |
| **(1) Frontend ForgotPassword no longer renders a token** | The whole point of the fix is removing the attacker-visible token from the UI | LOW | `frontend/src/pages/ForgotPassword.jsx` currently displays `result.resetToken` (lines 53-67, 82-86) and has a "Continue to reset" button gated on having the token. Replace with a static "check your email" success message; drop the `resetToken` field from the `REQUEST_RESET` GraphQL query string (line 9) since the schema no longer returns it. |
| **(2) Fail-fast on missing/default `JWT_SECRET` in production** | A guessable, publicly-known fallback (`'change-me'`) lets anyone forge admin JWTs — this is the single highest-severity bug in the app | LOW | In `backend/src/config/env.js`, after building `env`, add: if `env.nodeEnv === 'production'` and (`!process.env.JWT_SECRET` or `process.env.JWT_SECRET === 'change-me'`) → `throw`/`process.exit(1)` before the server starts listening. Must NOT affect `development`/`test` env — the existing fallback stays for local dev and the test suite. |
| **(3) Rate limit `login`, `register`, `requestPasswordReset`** | Without this, JWT-forging is closed but credential stuffing, account enumeration via timing/response, and reset-token guessing are all still open | MEDIUM | Single GraphQL endpoint (`/graphql`) makes route-based limiters (the default `express-rate-limit` pattern) insufficient — need to key off the GraphQL operation name, not the URL. See Architecture note below. |
| **(3) 429 response on limit breach, not a silent GraphQL 200** | Correct HTTP semantics for "too many requests"; matches `express-rate-limit`'s default behavior and is simplest to implement/test | LOW-MEDIUM | Implement as Express middleware placed before `expressMiddleware(apollo, ...)` in `backend/src/server.js`, short-circuiting with `res.status(429)` before the request reaches Apollo. Frontend's `graphqlRequest` (`frontend/src/api/graphqlClient.js:23-36`) will surface this via the generic axios-error catch branch (axios throws on non-2xx); the message won't be pretty ("Request failed with status code 429") unless the frontend adds a specific case — treat that polish as a Differentiator, not required for the fix to be correct. |
| **(3) Anti-enumeration: rate limit key is IP (not email/username)** | Keying solely by attempted email/username lets an attacker rotate the *target* to bypass the limiter while still hammering one IP; keying by IP (optionally +email as a secondary/combined key) is the standard mitigation | LOW | `express-rate-limit`'s default `keyGenerator` is IP-based already — just ensure custom logic doesn't accidentally key by request body email alone. |
| **(4) `passwordChangedAt` column on `User`** | Needed as the timestamp JWTs are compared against | LOW | New Sequelize column, nullable or defaulting to `createdAt`. Migration path: this app uses `sequelize.sync()` (no migrations, per `CONCERNS.md`) so this is just a new field in `backend/src/models/User.js`, no migration tooling needed this milestone. |
| **(4) `resetPassword` sets `passwordChangedAt = now()`** | This is the actual revocation trigger the fix is about | LOW | Add in `backend/src/resolvers/user.resolver.js` `resetPassword` mutation, alongside clearing the reset token fields. |
| **(4) Token verification rejects JWTs issued before `passwordChangedAt`** | Without this check, setting the column does nothing — old tokens keep working | LOW-MEDIUM | In `backend/src/utils/auth.js`, `getUserFromRequest` needs the JWT's `iat` claim (jsonwebtoken sets this automatically in seconds) compared against `user.passwordChangedAt`. If `iat * 1000 < passwordChangedAt`, treat as unauthenticated — follow the existing pattern of swallowing to `null` rather than throwing (matches current error-handling convention: `try {...} catch { return null; }`). |
| **(5) Server-side minimum length check on `register.password` and `resetPassword.password`** | Client-side-only validation (current state: HTML `required` only) is trivially bypassed via direct GraphQL calls — CONCERNS.md flags this explicitly | LOW | Add validation in the resolver before the value reaches `passwordHash` (both `register` at `user.resolver.js:25-37` and `resetPassword` at `:63-74`). Reasonable minimum for a portfolio app: **8 characters minimum**, no forced complexity rules (NIST 800-63B explicitly recommends length over complexity/rotation rules — see Password Strength section below). |
| **(5) Validation error surfaces through the same `throw new Error(...)` + GraphQL-error convention** | Matches existing error-handling style (`user.resolver.js:27,41`), consumed by frontend's existing `Alert severity="error"` pattern with zero new frontend plumbing | LOW | No schema changes needed — password stays `String!`, validation is resolver-level, not schema-level. |
| **(6) `emailVerified` boolean + verification token/expiry columns on `User`** | Needed to model the unverified→verified state transition | LOW-MEDIUM | New columns: `emailVerified` (boolean, default `false`), `emailVerificationToken` (string, nullable), `emailVerificationExpiresAt` (date, nullable) — mirrors the existing `resetPasswordToken`/`resetPasswordExpiresAt` pattern already in the model, so it's an established convention in this codebase, not a new one. |
| **(6) `register` does NOT grant a usable session or ADMIN role until verified** | This is the actual fix for the land-grab race — if `register` still returns an `AuthPayload` with a working JWT immediately, the "verification" is theater; the real fix moves the ADMIN-assignment race to *verification order*, not *registration order*, which raises the bar from "fastest HTTP request" to "controls the target inbox" | MEDIUM | Recommended flow (see Architecture Decision below): `register` creates an unverified user (`role` not yet finalized or deferred), sends verification email, returns a message-only payload (no token). A new `verifyEmail(token: String!): AuthPayload!` mutation flips `emailVerified = true`, and — only at that point — assigns `role: 'ADMIN'` if this is the first *verified* user, then returns the JWT. This changes the `AuthPayload` contract for `register` (schema change) — flag as the highest-complexity item in this milestone. |
| **(6) `login` rejects unverified accounts with a clear (non-enumerating-because-it's-their-own-email) error** | An unverified account must not be usable — otherwise verification is decorative | LOW | Add a check in `login` (`user.resolver.js:39-43`) after password validation succeeds: if `!user.emailVerified`, throw `'Please verify your email before logging in.'` This is safe to be specific (not a generic message) because the caller has already proven they know the correct password for that account — no new enumeration surface. |
| **(6) Verification token is single-use, time-limited, and cryptographically random** | Same reasoning as the reset token — this is a bearer credential that grants role escalation for the first user | LOW | Reuse `createResetToken()`-style generation (`crypto.randomBytes(32).toString('hex')`) and a similar `*ExpiresAt` pattern; a reasonable expiry is longer than password reset (e.g. 24h, since it's lower time-sensitivity than a takeover token) — this is a judgment call for the requirements phase, not fixed by external standard. |
| **(6) Frontend Register flow updated: no longer auto-navigates to `/dashboard`, shows "check your email" state** | `Register.jsx` currently calls `register()` then immediately `navigate('/dashboard')` (lines 19-20) — this breaks once `register` stops returning a token | MEDIUM | `frontend/src/context/AuthContext.jsx`'s `authenticate()` helper (lines 48-54) assumes `data.login \|\| data.register` always has `.token`/`.user` — needs a distinct code path for register (message-only response, no `localStorage.setItem`, no `setUser`). New verification landing page/route needed to call `verifyEmail` when the user clicks the emailed link — this is the single largest frontend surface in this milestone. |
| **(7) CORS rejection returns a generic error, origin logged server-side only** | Minor info-disclosure fix but explicitly in scope | LOW | In `backend/src/server.js:17-23`, change `callback(new Error(\`Origin ${origin} is not allowed by CORS.\`))` to `console.error(...)` (or equivalent) server-side, then `callback(new Error('Not allowed by CORS.'))` (or `callback(null, false)`) to the client — no origin value in the message that reaches the browser. |

### Differentiators (Nice-to-Have, Raises Quality But Not Required For The Fix To Be Correct)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Operation-aware (not just IP-aware) rate limiting via GraphQL operation name parsing** | Blanket `/graphql` rate limiting either over-throttles legitimate `dashboard`/`me` polling or under-throttles auth mutations if limits are set loose enough to accommodate normal use | MEDIUM-HIGH | Requires inspecting `req.body.query`/`operationName` in Express middleware before Apollo executes, and running separate `express-rate-limit` instances (different windows) keyed per-operation. More correct, more moving parts — reasonable to defer if a single conservative `/graphql`-wide limiter is judged "good enough" for a portfolio app's threat model. |
| **`resendVerificationEmail` mutation** | Handles the case where the verification email is lost/expired without forcing a full re-registration | LOW-MEDIUM | Natural follow-up to fix #6 but not required for the land-grab race to be closed — the base flow (verify once, from the original token) is sufficient for correctness. |
| **Env-seeded initial admin (e.g. `ADMIN_EMAIL` matched at verification time, or a one-off seed script)** | Fully closes the land-grab race (no ambiguity about "first verified user" if concurrent verifications land near-simultaneously) and gives operators deterministic control over who the first admin is | LOW-MEDIUM | `CONCERNS.md` recommends this as an "and/or" alternative to verification. PROJECT.md's stated fix is verification-only, so treat this as an enhancement to flag for the requirements phase, not assume it's in scope. |
| **`nodemailer` as the mailer implementation (vs. hand-rolled console-log module)** | Gives a real, swappable transport (SMTP/Stream/JSON transports) with a well-known interface, "wired for prod" is closer to literally true | LOW-MEDIUM | Adds a new dependency; a minimal hand-rolled `sendMail()` function achieves the same "pluggable, console-logs in dev" requirement with zero new dependencies. Either satisfies the table-stakes requirement — this is an implementation choice for the requirements/design phase. |
| **Frontend-specific 429 error message** | Better UX than the raw axios "Request failed with status code 429" string | LOW | Small addition to `graphqlClient.js`'s existing error-branching (`frontend/src/api/graphqlClient.js:30-34`) mirroring the existing 'Network Error' special-case. |
| **Password strength meter / live feedback in the UI** | Improves UX for the 8-character-minimum rule | LOW-MEDIUM | Pure frontend polish on `Register.jsx`/`ResetPassword.jsx`; PROJECT.md's "no UI redesign" constraint argues against spending milestone budget here beyond a plain error message. |
| **Audit log of rate-limit hits / failed logins** | Useful operational signal for a "hardening" milestone | MEDIUM | No logging infrastructure exists yet (`CONCERNS.md`: "No logging/monitoring/error tracking"); building one is arguably a separate concern from the 7 targeted fixes. |

### Anti-Features (Explicitly Out Of Scope — Do Not Build)

| Feature | Why It Seems Appealing | Why It's Out Of Scope Here | Alternative |
|---------|------------------------|------------------------------|-------------|
| **Refresh-token rotation / short-lived access token + refresh token pair** | "Real" session revocation (logout-everywhere, per-device sessions) | PROJECT.md Out of Scope: explicitly deferred; `passwordChangedAt` revocation is the chosen mechanism for this milestone | `passwordChangedAt` invalidates all tokens issued before a password reset; a leaked-but-not-reset token still lives until natural JWT expiry (`env.jwtExpiresIn`, default 1 day) — this is a documented, accepted limitation, not a gap to silently close |
| **"Logout" that revokes the specific token server-side (denylist/blacklist)** | Matches user intuition that "logout" should invalidate that exact token everywhere | No token store/denylist infrastructure exists; adding one is architecturally equivalent to session-based auth, contradicts the stateless-JWT design decision already made | `logout` stays client-side-only (clears `localStorage`) exactly as it is today (`frontend/src/context/AuthContext.jsx:62-69`) — only a password change (via reset) invalidates tokens |
| **MFA / TOTP / SMS 2FA** | Common "next step" after basic auth hardening | PROJECT.md Out of Scope: no new auth methods this milestone | None — not needed to close any of the 7 named vulnerabilities |
| **OAuth / social login** | Common "modernization" ask | PROJECT.md Out of Scope | None |
| **Live email provider integration (SES/SendGrid/Postmark account + API keys)** | Makes the mailer "actually work" in production today | PROJECT.md Out of Scope: "standing up an actual...account is a deployment concern, not this milestone" | Pluggable mailer interface with a dev console-log driver + a prod driver stub that's wired but not credentialed |
| **CAPTCHA / bot-detection on register or login** | Common brute-force mitigation alongside rate limiting | Not named in the 7 target fixes; adds a new frontend dependency and UX friction beyond "no UI redesign" constraint | Rate limiting (fix #3) is the chosen brute-force mitigation for this milestone |
| **Password complexity rules (must contain uppercase/number/symbol)** | Feels like "stronger" security | NIST 800-63B explicitly recommends against forced-composition rules — they push users toward predictable patterns (`Password1!`) without materially raising entropy, and add implementation/test surface for no security benefit | Length-only minimum (8 chars) plus optional "check against common-password list" as a possible differentiator, not composition rules |
| **Full GraphQL query complexity/depth limiting** | Adjacent DoS-hardening concern, sometimes bundled with "rate limiting" work | Not one of the 7 named fixes; `CONCERNS.md` notes it as a separate, pre-existing architectural gap (no DataLoader, no depth limiting) unrelated to the auth-brute-force vectors this milestone targets | Leave as a documented, separate concern for a future infra-hardening milestone |
| **Sequelize migrations for the new columns (`passwordChangedAt`, `emailVerified`, etc.)** | "Correct" way to evolve a production schema | PROJECT.md Out of Scope: migration tooling is explicitly deferred to a separate infra-hardening milestone; app currently relies on `sequelize.sync()` | New fields added directly to the model files; `sync()` picks them up automatically, consistent with how `resetPasswordToken`/`resetPasswordExpiresAt` were added previously |

## Feature Dependencies

```
(2) JWT secret fail-fast
    └──independent── (no dependency on other fixes; pure startup guard)

(7) CORS generic error
    └──independent── (isolated to server.js CORS middleware)

(5) Password strength validation
    └──independent── (resolver-level guard, no schema/model changes)

(1) Reset-token exposure fix
    └──requires──> Pluggable mailer interface
                       └──shared-by──> (6) Email verification (same mailer, different template)

(4) passwordChangedAt revocation
    └──touches-same-resolver-as──> (1) resetPassword (both modify the resetPassword mutation body)
    └──independent-of──> (6) email verification (different fields, different mutations)

(6) Email verification
    └──requires──> Pluggable mailer interface (shared with #1)
    └──changes-contract-of──> register mutation (AuthPayload → message-only response)
                                   └──requires-frontend-update──> AuthContext.authenticate(), Register.jsx
    └──changes-behavior-of──> login mutation (adds emailVerified gate)
    └──adds-new-mutation──> verifyEmail(token) — new schema + resolver + frontend route

(3) Rate limiting
    └──wraps──> login, register, requestPasswordReset (adds Express-level middleware in front of all three; no resolver changes required)
```

### Dependency Notes

- **(1) and (6) share the mailer:** Build the pluggable mailer interface once; fix #1 (reset email) and fix #6 (verification email) are two call sites/templates against the same abstraction. Sequencing these together (or the mailer first, standalone) avoids building it twice.
- **(6) is the only fix that changes an existing GraphQL contract** (`register`'s return shape) and therefore the only fix requiring frontend `AuthContext`/`Register.jsx` rework beyond a single page's display logic. This makes it the highest-complexity, highest-blast-radius item — plan it as its own phase, not bundled casually with smaller fixes.
- **(4) and (1) touch the same resolver function** (`resetPassword`) — implementing them in the same pass avoids re-touching that function twice, but they are logically independent (revocation doesn't require the mailer, and the mailer doesn't require revocation).
- **(3) rate limiting is purely additive** at the Express layer — it doesn't require changes to resolver logic for login/register/requestPasswordReset themselves, only middleware in `backend/src/server.js` in front of the `/graphql` route (or an operation-aware variant, see Differentiators).
- **(2) and (7) are fully independent** of everything else and of each other — safe to implement/test in isolation, good low-risk starting points.

## Account State Model for Email Verification (Fix #6) — Detailed

This is the largest new flow this milestone introduces, so the state model matters more than the other 6 fixes.

**States:**
1. `UNVERIFIED` (new user, `emailVerified: false`) — created by `register`. Has a role placeholder but should NOT be treated as `ADMIN` for authorization purposes even if a role value is stored, until verified (see role-assignment timing below).
2. `VERIFIED` (`emailVerified: true`) — reached via `verifyEmail(token)`. Only verified users can `login` or hold a meaningful `ADMIN` role.

**What an unverified user can do:**
- Nothing authenticated. `register` does not return a JWT (recommended — see below), so there is no session to exercise. If the design instead chooses to issue a JWT immediately at registration (alternative flow), then every resolver behind `requireAuth`/`requireAdmin` must additionally check `emailVerified` — this is strictly more places to enforce the same rule and is not recommended for a small codebase; blocking at `login` is a single choke point.
- Can request a new email if the original was lost — only if the `resendVerificationEmail` differentiator is built; otherwise the token's expiry window is the only recovery path (re-register is blocked by the existing unique-email constraint, so an expired unverified account without resend is a dead end worth flagging to the requirements phase).

**Verification link/token flow:**
1. `register(name, email, password)` → creates `User` with `emailVerified: false`, generates `emailVerificationToken` + `emailVerificationExpiresAt`, sends verification email via the mailer (dev: logged to console, containing a URL like `${CLIENT_URL}/verify-email?token=...`), returns a message-only payload (no `token`, no `user`, or a minimal `{ message }` shape — schema change required).
2. User clicks the link → frontend `/verify-email` route reads `token` from the query string, calls `verifyEmail(token)`.
3. `verifyEmail(token)` resolver: looks up user by `emailVerificationToken`, checks not expired, sets `emailVerified: true`, clears the token/expiry fields (single-use, same pattern as password reset), determines role (`ADMIN` if this is the first verified user — count verified users, not all rows), returns `AuthPayload!` (token + user) so the user lands logged-in immediately after verifying.
4. `login(email, password)`: after password validation succeeds, check `emailVerified`; if false, reject with a specific error (safe — see Table Stakes).

**Interaction with "first user becomes ADMIN":**
- **Recommended (matches PROJECT.md's stated fix):** Move the ADMIN-assignment check from registration time to verification time, and count against verified users only. This closes the *registration-speed* race (junk/unverified registrations can no longer camp the ADMIN slot) but does not fully eliminate a race if two people register and verify near-simultaneously — it raises the bar from "send one HTTP request first" to "control a real inbox and click first," which is the standard, proportionate mitigation for a portfolio-scale app.
- **Stronger alternative (Differentiator, not assumed in scope):** Combine with an env-seeded admin (`ADMIN_EMAIL` env var checked at verification time, or a separate seed script) to fully deterministic-ize the first admin regardless of registration/verification races. Flag this for the requirements phase as an optional enhancement, since `CONCERNS.md` presents it as an "and/or," while PROJECT.md's Active requirements list only names verification.
- **Not recommended:** Leaving role assignment at registration time while merely gating login on verification. This still lets an attacker's *unverified* registration permanently occupy the ADMIN role in the database (just unable to log in until they also verify) — it doesn't close the race, it only adds a login gate on top of an already-compromised role assignment.

## Password Strength — Reasonable Minimum For A Portfolio App

Per NIST SP 800-63B (current, widely-adopted guidance across the industry — favor length over composition rules):

- **Minimum length: 8 characters.** This is NIST's floor recommendation and is achievable with a single resolver-level check on both `register` and `resetPassword`.
- **No forced composition rules** (no mandatory uppercase/digit/symbol) — composition rules are explicitly discouraged by current guidance; they degrade usability without proportionally improving resistance to guessing, and adding them increases test surface for a portfolio-scope fix.
- **No maximum-length-driven truncation surprises**: bcrypt (used here via `bcryptjs`) silently truncates inputs beyond 72 bytes — not a new concern introduced by this fix, but worth a one-line awareness note if the requirements phase wants to cap max length (e.g. 128 chars) to avoid relying on bcrypt's silent truncation behavior. Optional, not required for fix #5 to be correct.
- **No password history / rotation requirements** — also discouraged by current guidance and unrelated to any of the 7 named fixes; do not add.

## Rate Limiting — Sensible Limits (Judgment Call, No Single External Standard For GraphQL)

There is no single authoritative "correct number" the way there is for token expiry (OWASP gives ranges) — these are reasonable, commonly-cited starting points for a small app, to be finalized in the requirements phase:

| Mutation | Suggested Window | Suggested Limit | Reasoning |
|----------|------------------|------------------|-----------|
| `login` | 15 min | 5–10 attempts per IP | Standard brute-force mitigation range cited across OWASP Authentication Cheat Sheet-adjacent guidance and common `express-rate-limit` examples |
| `register` | 1 hour | 5–10 per IP | Prevents mass account creation / spam registration abuse; looser than login since it's a lower-frequency legitimate action |
| `requestPasswordReset` | 1 hour | 3–5 per IP (and reasonably, per email) | Tightest limit — this endpoint is both an enumeration vector and (pre-fix-#1) was the token-exposure vector; keeping it tight limits reset-token-guessing exposure even after fix #1 removes the token from the response |

**Response contract:** HTTP 429 from Express middleware in front of Apollo (table stakes, see above) is simplest and is what `express-rate-limit` does natively. A GraphQL-error-shaped 200 response is a viable alternative some GraphQL-specific tooling (`graphql-rate-limit-directive`) produces instead, but is more implementation work for this single-endpoint app and isn't required by any external standard — flag as a requirements-phase decision, default recommendation is 429.

## MVP Definition

### Launch With (v1.1 — all 7 fixes, all Table Stakes rows above)

Every fix in this milestone is itself already a minimum/must-have (these are all remediations of documented, tracked vulnerabilities in `KNOWN-ISSUES.md`/`CONCERNS.md` — none of the 7 are optional or gradually-rollout-able):

- [ ] Fix #1 — resetToken removed from API + frontend, pluggable mailer built
- [ ] Fix #2 — JWT secret fail-fast in production
- [ ] Fix #3 — rate limiting on login/register/requestPasswordReset, 429 response
- [ ] Fix #4 — passwordChangedAt revocation wired into resetPassword + token verification
- [ ] Fix #5 — 8-char minimum password validation on register + resetPassword
- [ ] Fix #6 — email verification gating login + ADMIN assignment, register contract change, new verifyEmail mutation + frontend route
- [ ] Fix #7 — CORS rejection stops echoing origin to client

### Add After Validation (Differentiators, candidate for a fast-follow inside v1.1 or immediately after)

- [ ] Operation-aware rate limiting (if blanket `/graphql` limiting proves too coarse in practice)
- [ ] `resendVerificationEmail` mutation
- [ ] Frontend-specific 429 error message
- [ ] Env-seeded initial admin (belt-and-suspenders on top of verification-gated role assignment)

### Future Consideration (Explicitly Deferred, Per PROJECT.md Out of Scope)

- [ ] Refresh-token rotation / true multi-device logout
- [ ] Live email provider account
- [ ] MFA / OAuth
- [ ] Sequelize migrations
- [ ] GraphQL query complexity/depth limiting
- [ ] CAPTCHA

## Feature Prioritization Matrix

| Fix | User/Security Value | Implementation Cost | Priority |
|-----|---------------------|----------------------|----------|
| (2) JWT secret fail-fast | HIGH (closes the single worst bug — forgeable admin tokens) | LOW | P1 |
| (1) Reset-token exposure | HIGH (closes documented account-takeover vector) | MEDIUM (mailer + schema + frontend) | P1 |
| (6) Email verification | HIGH (closes admin land-grab race) | HIGH (contract change, new flow, most frontend work) | P1 |
| (4) passwordChangedAt revocation | MEDIUM-HIGH (limits blast radius of a leaked token after reset) | LOW-MEDIUM | P1 |
| (3) Rate limiting | MEDIUM-HIGH (closes brute-force/enumeration) | MEDIUM (GraphQL-aware middleware) | P1 |
| (5) Password strength | MEDIUM (baseline hygiene, low attacker cost saved but standard expectation) | LOW | P1 |
| (7) CORS generic error | LOW (minor info disclosure only, per CONCERNS.md's own severity rating) | LOW | P1 (trivial, no reason to defer) |

All 7 are P1 for this milestone — they were selected specifically because they're the previously-deferred, documented vulnerabilities; there's no P2/P3 tier within the named scope. The Differentiators table above is the actual P2/P3 tier for a requirements phase that wants to size a "stretch" list.

## Sources

- [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) — HIGH confidence: single-use tokens, 15–60 min expiry, generic anti-enumeration messaging (verified against current codebase behavior, which already implements expiry/single-use correctly and just needs the token removed from the response)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) — MEDIUM confidence (referenced via search summary, not directly fetched): rate-limiting and lockout guidance
- [OWASP Testing for Weak Password Change or Reset Functionalities](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/04-Authentication_Testing/09-Testing_for_Weak_Password_Change_or_Reset_Functionalities) — MEDIUM confidence, supports token invalidation-on-use requirement
- NIST SP 800-63B password guidance (length over composition, no forced rotation) — HIGH confidence, well-established industry consensus reflected across current OWASP and NIST-derived guidance; not independently re-fetched this session but consistent with prior verified knowledge and the OWASP cheat sheets surfaced above
- [graphql-rate-limit-directive (npm)](https://www.npmjs.com/package/graphql-rate-limit-directive) / [graphql-rate-limit (GitHub, ravangen)](https://github.com/ravangen/graphql-rate-limit) — MEDIUM confidence: confirms there is no single dominant Express+Apollo rate-limiting convention for GraphQL; operation-name-aware limiting via custom middleware or a rate-limit directive library are both real, used patterns, not a niche approach — supports treating this milestone's choice (Express-layer middleware vs GraphQL-directive) as a requirements-phase decision rather than a fixed answer
- [Nodemailer official docs — Stream Transport](https://nodemailer.com/transports/stream) — HIGH confidence: confirms a dev-mode transport that avoids sending real email exists as a standard, well-documented pattern if the requirements phase chooses `nodemailer` over a hand-rolled mailer module
- Codebase: `.planning/PROJECT.md`, `.planning/codebase/CONCERNS.md`, `backend/src/resolvers/user.resolver.js`, `backend/src/schemas/user.schema.js`, `backend/src/models/User.js`, `backend/src/utils/auth.js`, `backend/src/server.js`, `backend/src/config/env.js`, `frontend/src/pages/ForgotPassword.jsx`, `frontend/src/pages/Register.jsx`, `frontend/src/context/AuthContext.jsx`, `frontend/src/api/graphqlClient.js`, `KNOWN-ISSUES.md` — HIGH confidence, directly read this session, ground-truth for all "existing behavior" and "files touched" claims

---
*Feature research for: security remediation on an existing email+password auth GraphQL app*
*Researched: 2026-07-12*
