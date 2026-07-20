# Phase 11: Email Verification & ADMIN Race Fix - Context

**Gathered:** 2026-07-20
**Status:** Ready for planning

<domain>
## Phase Boundary

New accounts must prove ownership of their email before they receive a usable session or the ADMIN role. This closes the "first registrant becomes ADMIN" land-grab by moving the single ADMIN-slot decision from *registration order* to *verification order*. Scope: the `emailVerified` schema columns, a `verifyEmail`/`resendVerificationEmail` mutation pair, an unverified-login gate, the verification email, and the frontend `/verify-email` route + "check your email" register state. Reuses the Phase 8 mailer, Phase 9 central auth-gate + hashed-token pattern, and Phase 10 rate-limit map.

**Not in scope (own phases / deferred):** live SMTP provider account, Sequelize migration tooling, env-seeded `ADMIN_EMAIL` (VERIFY-F1), any multi-admin/role-management feature, UI redesign beyond the verify route + register state.

</domain>

<decisions>
## Implementation Decisions

### Schema & migration (VERIFY-01)
- **D-01:** Add three columns to the `User` model via the existing `sync()` model-field pattern (matches Phase 9): `emailVerified` BOOLEAN NOT NULL DEFAULT false; `emailVerificationToken` (nullable string, stores a **hash** — see D-07); `emailVerificationExpiresAt` (nullable DATE).
- **D-02:** Ship a **manual `ALTER TABLE` + boot-and-verify** step against a pre-existing, non-force-synced dev DB (carry Phase 9 D-03/D-04). `sequelize.sync()` never ALTERs an existing table, so CI (force-recreate) passes while a provisioned DB throws `Unknown column` — the manual boot-and-verify (ROADMAP SC-5) is the only catch. No migration framework this milestone.
- **D-03:** **Backfill ONLY the existing ADMIN row to `emailVerified=true`** during the migration. All other existing users get the `false` default and must re-verify before their next login. Rationale: the app has a single bootstrap ADMIN (see D-04); grandfathering just that row keeps the admin's role + active session across deploy without a broad backfill that would defeat the verification invariant for everyone else. Chosen over full no-backfill (locks out the sole admin, reopens the ADMIN slot) and full grandfather (un-gates every existing account).

### ADMIN race fix (VERIFY-04)
- **D-04:** The model stays **single ADMIN slot** — unchanged from today's `userCount === 0 ? 'ADMIN' : 'USER'`; there is no in-app path to mint additional admins. This phase only changes *who* fills that one slot and *when*: the first **verified** user, assigned at `verifyEmail` time.
- **D-05:** Assign ADMIN via an **atomic conditional UPDATE** that sets `role='ADMIN'` only if no verified ADMIN exists yet (e.g. `UPDATE ... WHERE id=:id AND NOT EXISTS (SELECT 1 FROM users WHERE role='ADMIN' AND emailVerified=true)`, or `SELECT ... FOR UPDATE` inside a transaction). Race-safe at the DB layer — mirrors the atomic conditional update already used in `resetPassword` ([user.resolver.js:100-104](../../../backend/src/resolvers/user.resolver.js#L100-L104)). Rejected the app-level count check (read-then-write race: two concurrent verifies both read zero).
- **D-06:** **No env `ADMIN_EMAIL` anchor this phase** (VERIFY-F1 stays deferred). The existing admin is protected by the D-03 grandfather backfill instead, so the slot is not actually reopened on deploy. On a fresh install (no verified admin yet), the D-05 atomic first-verified rule assigns it.

### Verification gate (VERIFY-05, SC-3)
- **D-07 (gate):** Enforce verification at **both** points — defense-in-depth:
  - `login` rejects an unverified account **after** password validation succeeds (VERIFY-05), with a clear message (e.g. "Please verify your email before signing in.").
  - The **central** auth path (`requireAuth` / `getUserFromRequest` in [auth.js](../../../backend/src/utils/auth.js)) also rejects an unverified user, so a protected resolver like `dashboard` refuses the session — not merely hidden in the UI (SC-3). Reuses the Phase 9 central-check pattern.
  - Belt-and-suspenders note: since `register` issues no token (VERIFY-02) and `verifyEmail` is the only token source (VERIFY-03), an unverified user should never *hold* a valid token; the central gate guards the edge case anyway.

### Tokens & mailer (VERIFY-02, VERIFY-03, VERIFY-06, VERIFY-08)
- **D-08 (token):** Verification token = cryptographically random (`crypto.randomBytes(32).toString('hex')`, reuse the [auth.js:41](../../../backend/src/utils/auth.js#L41) `createResetToken` pattern), **single-use, 24h expiry**. **Stored hashed at rest (`sha256`), raw token emailed** — mirrors the Phase 9 reset-token hardening (D-06). `verifyEmail` looks the user up by `sha256(incomingToken)`, checks expiry, flips `emailVerified=true`, and clears the token/expiry (single-use).
- **D-09 (mailer):** Add a `sendVerificationEmail({ to, token })` wrapper to [services/mailer.js](../../../backend/src/services/mailer.js) alongside `sendPasswordResetEmail` (Phase 8 D-02 explicitly anticipated this). Email copy lives in the mailer; reuses `sendMail()`; link = `${env.clientUrl}/verify-email?token=${token}`; `jsonTransport` in dev/test. Send **fire-and-forget** with a `.catch()` logger (Phase 8 D-08) to avoid a timing/error side-channel.
- **D-10 (register):** `register` creates an **unverified** user, fires the verification email, and returns a **message-only payload** — no JWT, no `user`, no ADMIN granted at registration. A new/reused message-only GraphQL type is required (planner's call; must not expose `token`/`user`).
- **D-11 (verifyEmail):** `verifyEmail(token)` validates hash/expiry/single-use, flips `emailVerified`, clears the token+expiry, runs the D-05 atomic ADMIN assignment, and returns an `AuthPayload` (logs the user in).

### resendVerificationEmail (VERIFY-07)
- **D-12:** **Generic anti-enumeration response** regardless of account state (e.g. "If an unverified account exists, a verification link has been sent.") with the Phase 8 **timing-floor** discipline (D-08). Reissues a fresh single-use 24h token (hashed at rest, D-08). Already-verified / nonexistent email → same generic message, no email sent. Rejected the reveal-state variant (reintroduces the enumeration oracle the reset flow deliberately closed).
- **D-13:** Add `resendVerificationEmail` to the `RATE_LIMITS` map ([rateLimits.js](../../../backend/src/config/rateLimits.js), Phase 10 D-07) as one entry — **5 / hour**, matching `register` and `requestPasswordReset` (exact number is planner-tunable).

### Frontend (VERIFY-08)
- **D-14:** New `/verify-email` route reads `?token=` via `useSearchParams` (mirror [ResetPassword.jsx](../../../frontend/src/pages/ResetPassword.jsx), Phase 8 D-09), calls `verifyEmail`, and on success establishes the session (store token, set user) then routes to the dashboard; on failure shows an error state.
- **D-15:** `Register` no longer auto-navigates to the dashboard — it shows a **"check your email"** confirmation state (mirror the [ForgotPassword.jsx](../../../frontend/src/pages/ForgotPassword.jsx) confirmation-panel pattern, Phase 8 D-12).
- **D-16:** `AuthContext.register` must handle the **message-only** register response (no `token`/`user`) and **must not** set a session. The `REGISTER_MUTATION` and the shared `authenticate()` helper ([AuthContext.jsx:48-54](../../../frontend/src/context/AuthContext.jsx#L48-L54)) change, since `register` no longer returns `{ token, user }`; `verifyEmail` becomes the session-establishing call instead.

### Error UX
- **D-17:** The unverified-login message and any throttle errors surface through the **existing auth-page `<Alert>`** (Phase 10 D-09) — no dedicated UI.

### Claude's Discretion
- Exact column types/names; whether verification-token helpers reuse `createResetToken`/`hashResetToken` or add verification-specific analogues; the 24h-expiry helper's location.
- Exact `resendVerificationEmail` rate-limit number (recommend 5/hour, D-13).
- Whether the `emailVerified` flip and the atomic ADMIN assignment happen as one combined UPDATE/transaction or two steps — provided the single-ADMIN-slot atomicity (D-05) holds.
- The register message-only payload shape (new `RegisterPayload { message }` vs a reused/shared message type) — must never return `token`/`user`.
- Email subject/body copy, `/verify-email` page copy, and the Register "check your email" copy.
- Test structure (mock the mailer per Phase 8 D-05; assert `emailVerified` transitions; a concurrency test for the ADMIN race).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` — Phase 11 goal + Success Criteria 1–5 (the acceptance bar, incl. the SC-5 manual boot-and-verify step).
- `.planning/REQUIREMENTS.md` — VERIFY-01..08 (locked) and VERIFY-F1 (deferred), with traceability.

### Backend patterns to reuse (not rewrite)
- `backend/src/resolvers/user.resolver.js` — `register`/`login`/`resetPassword`; the atomic conditional UPDATE at lines 100-104 is the template for the race-safe ADMIN assignment (D-05).
- `backend/src/utils/auth.js` — `createResetToken`/`hashResetToken`/`resetTokenExpiry` (token analogues, D-08) and `requireAuth`/`getUserFromRequest` (central verified-gate insertion point, D-07).
- `backend/src/services/mailer.js` — `sendMail` + `sendPasswordResetEmail`; add `sendVerificationEmail` alongside (D-09).
- `backend/src/models/User.js` — add the three columns (D-01).
- `backend/src/schemas/user.schema.js` — add `verifyEmail`/`resendVerificationEmail` mutations + the message-only register payload; `AuthPayload` already exists.
- `backend/src/config/rateLimits.js` — add the `resendVerificationEmail` entry (D-13).

### Frontend patterns to reuse
- `frontend/src/context/AuthContext.jsx` — `authenticate()` + `REGISTER_MUTATION` change for the message-only register (D-16); `verifyEmail` login path.
- `frontend/src/pages/ResetPassword.jsx` — `?token=` read via `useSearchParams` → template for `/verify-email` (D-14).
- `frontend/src/pages/ForgotPassword.jsx` — confirmation-panel pattern → template for the Register "check your email" state (D-15).
- `frontend/src/pages/Register.jsx` — the page being changed (D-15).
- `frontend/src/App.jsx` — add the `/verify-email` route.

### Prior decisions carried forward
- `.planning/phases/08-mailer-abstraction-reset-token-remediation/08-CONTEXT.md` — mailer wrapper pattern (D-02), fire-and-forget + timing floor (D-08), token-in-URL frontend read (D-09), confirmation-panel (D-12), generic-message copy (D-11).
- `.planning/phases/09-session-revocation-via-passwordchangedat/09-CONTEXT.md` — manual ALTER + boot-and-verify (D-03/D-04), no-force-sync gotcha, hashed-token-at-rest (D-06).
- `.planning/phases/10-rate-limiting-on-auth-mutations/10-CONTEXT.md` — RATE_LIMITS map single-edit-point (D-07), generic error via existing Alert (D-09).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`resetPassword` atomic conditional UPDATE** ([user.resolver.js:100-104](../../../backend/src/resolvers/user.resolver.js#L100-L104)): direct template for the race-safe single-ADMIN assignment (D-05).
- **`createResetToken` / `hashResetToken` / `resetTokenExpiry`** ([auth.js:41-51](../../../backend/src/utils/auth.js#L41-L51)): the verification token is the same shape with a 24h window instead of `resetTokenExpiresMinutes`, hashed at rest.
- **`sendPasswordResetEmail`** ([mailer.js:30](../../../backend/src/services/mailer.js#L30)): copy-shaped sibling for `sendVerificationEmail`.
- **`requireAuth` / `getUserFromRequest`** ([auth.js:9-34](../../../backend/src/utils/auth.js#L9-L34)): the single insertion point for the central unverified-session gate (D-07).
- **`RATE_LIMITS` map** ([rateLimits.js:6-10](../../../backend/src/config/rateLimits.js#L6-L10)): one-line add for `resendVerificationEmail`; its own comment already flags this Phase 11 addition.
- **`ResetPassword.jsx` `useSearchParams` read** + **`ForgotPassword.jsx` confirmation panel**: templates for the `/verify-email` route and the Register "check your email" state.

### Established Patterns
- Message-only mutation payloads already exist (`PasswordResetPayload { message }`, [user.schema.js:21-23](../../../backend/src/schemas/user.schema.js#L21-L23)) — a model for the register response.
- Mailer is mocked in resolver tests (Phase 8 D-05: assert call args at the mailer boundary, real nodemailer never runs).
- `beforeValidate` lowercases/trims email ([User.js:56](../../../backend/src/models/User.js#L56)) — verification lookups should assume normalized emails.

### Integration Points
- `AuthContext.register` currently assumes `register` returns `{ token, user }` and sets a session ([AuthContext.jsx:48-54](../../../frontend/src/context/AuthContext.jsx#L48-L54)) — this contract breaks by design (D-16); `verifyEmail` takes over session establishment.
- The Apollo test harness (`backend/test/helpers.js`) and the Phase 10 rate-limit plugin already exercise these mutations — new mutations flow through the same `graphql()` helper.

</code_context>

<specifics>
## Specific Ideas

- The user explicitly probed whether the design assumes a single admin — confirmed yes, and chose to protect that single bootstrap admin by grandfathering only its row (D-03/D-06) rather than adding an env anchor or accepting the deploy demotion race.

</specifics>

<deferred>
## Deferred Ideas

- **VERIFY-F1 — env-seeded `ADMIN_EMAIL`**: an additional belt-and-suspenders way to pin the ADMIN slot. Not implemented this phase; the D-03 admin-row grandfather covers the deploy case. Revisit if multi-environment admin bootstrapping becomes a need.
- **Live SMTP provider account** (SES/SendGrid/Postmark): a deployment concern; v1.1 ships the pluggable mailer with the dev console/`jsonTransport` driver.
- **Sequelize migration tooling**: columns are added via `sync()` model fields + a manual ALTER; real migration tooling is a separate infra-hardening milestone.

None — discussion stayed within phase scope otherwise.

</deferred>

---

*Phase: 11-email-verification-admin-race-fix*
*Context gathered: 2026-07-20*
