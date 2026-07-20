# Phase 9: Session Revocation via passwordChangedAt - Context

**Gathered:** 2026-07-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Resetting a password immediately invalidates any JWT issued before the reset, closing the stale-session window. Delivered via a `passwordChangedAt` timestamp on the `User` model that `getUserFromRequest` checks against each token's `iat`. Revocation mechanism is locked to `passwordChangedAt` — refresh-token rotation, server-side denylists, and multi-device logout were explicitly rejected in REQUIREMENTS.md (line 76); logout stays client-side.

**In scope:** `passwordChangedAt` column + hook wiring (SESS-01), setting it on password change (SESS-02), the `iat`-based revocation check in `getUserFromRequest` (SESS-03), and the folded-in reset-token-hashing fix (RESET-06).

**Out of scope:** any other revocation mechanism, multi-device/session management UI, JWT structure changes beyond reading `iat`.
</domain>

<decisions>
## Implementation Decisions

### Second-vs-millisecond precision (SESS-03)
- **D-01:** Compare at **whole-second granularity with a strict `<`**. Floor `passwordChangedAt` to seconds and treat a token as revoked only when `iat_seconds < passwordChangedAt_seconds`. A same-second post-reset re-login (`iat == passwordChangedAt_seconds`) stays **valid** — this is the property the roadmap's mandatory same-second boundary test pins.
- **D-02:** Accepted micro-risk: a pre-reset token issued in the *very same second* as the reset survives (a sub-1-second window). This is the standard JWT approach; do NOT add extra leeway beyond the seconds floor. Rejected the "explicit 1s grace" alternative as a strictly larger survival window.
- **Root cause to honor:** `signToken` uses `jwt.sign`, whose `iat` is Unix **seconds** (floored). `passwordChangedAt` is a millisecond-precision JS `Date`. A naive `iat_ms < passwordChangedAt_ms` comparison self-invalidates a freshly issued post-reset token. The comparison MUST normalize both sides to seconds.

### Schema migration strategy (SESS-01)
- **D-03:** **Manual, documented `ALTER TABLE`.** The plan must include the explicit `ALTER TABLE users ADD COLUMN ...` statement plus a boot-and-verify step against a pre-existing, non-force-synced dev DB — matching ROADMAP success criterion #4. No migration framework this milestone.
- **D-04:** `sequelize.sync()` never ALTERs existing tables, so CI/test (force-recreate every run) will pass while a provisioned dev/prod DB throws `Unknown column`. The manual step is the only thing that catches this — it is NOT test-catchable. Phase 11 adds columns too and repeats this same lightweight pattern. A real migration tool stays deferred to v2. Rejected `sync({ alter: true })` as risky (table reorder/rebuild near real data).

### Existing users on deploy (SESS-01/SESS-03)
- **D-05:** Column is **nullable**; `passwordChangedAt = NULL` means "no revocation point". `getUserFromRequest` treats NULL as nothing-to-revoke, so every existing user's current token stays valid until its natural JWT expiry. **No backfill** — the deploy force-logs-out nobody. Revocation begins for each user the first time they reset. Rejected backfill-to-`now()` (would evict every active session at deploy).

### Reset-token hashing — folded in (RESET-06)
- **D-06:** Fix Phase 8 review finding **WR-08** (reset tokens stored plaintext at rest) **inside Phase 9**, because it reopens the same `resetPassword` resolver — touch that file once, not twice. Store `sha256(token)` in the DB; email the **raw** token; `resetPassword` looks the user up by the hash of the incoming token.
- **D-07:** This spans BOTH resolvers: `requestPasswordReset` (Phase 8) must now persist the hash instead of the raw token, and `resetPassword` must look up by hash. Preserve everything Phase 8 established: `resetToken` absent from schema/return values, anti-enumeration message + timing floor (CR-01), single-use + 30-min expiry. The same-second/expiry/single-use tests must stay green.
- **D-08:** New requirement **RESET-06** was registered in REQUIREMENTS.md (list + traceability → Phase 9) so folding this in does not silently expand scope. Rejected backlog/mini-phase (would reopen the resolver again) and defer-to-v2 (leaves a live account-takeover-on-DB-read vector across the milestone).

### Claude's Discretion
- Exact column type/name detail (`passwordChangedAt` DATE vs DATETIME), where the seconds-flooring helper lives, and the hash column naming are implementation choices for the planner/executor — as long as the locked behaviors above hold.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase requirements & roadmap
- `.planning/REQUIREMENTS.md` §Session Revocation (SESS-01/02/03) and §Password Reset Hardening (RESET-06, newly added) — the locked requirement text, including the second-vs-ms boundary-test mandate.
- `.planning/ROADMAP.md` §"Phase 9: Session Revocation via passwordChangedAt" — the 4 success criteria, especially #3 (same-second boundary test) and #4 (manual non-force-synced DB boot verification).

### Phase 8 carry-over (must not regress)
- `.planning/phases/08-mailer-abstraction-reset-token-remediation/08-REVIEW.md` — finding **WR-08** (plaintext reset token at rest) is what RESET-06 closes; also documents CR-01 (anti-enumeration timing floor) which RESET-06 must preserve.
- `.planning/phases/08-mailer-abstraction-reset-token-remediation/08-VERIFICATION.md` — the Phase 8 security properties that must stay true.

### Code touch points
- `backend/src/utils/auth.js` — `signToken` (`iat` in seconds), `getUserFromRequest` (where the revocation check lands), `createResetToken`/`resetTokenExpiry`.
- `backend/src/models/User.js` — `hooks.beforeUpdate` guards on `user.changed('passwordHash')`; `passwordChangedAt` must be set **only** inside that guarded branch.
- `backend/src/resolvers/user.resolver.js` — `resetPassword` (sets `passwordChangedAt`, looks up by token hash) and `requestPasswordReset` (persists token hash).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getUserFromRequest` (`backend/src/utils/auth.js`) already decodes the JWT payload via `jwt.verify` — the decoded payload exposes `iat`. The revocation check adds a comparison after `findByPk`, using the already-verified payload; no new decode needed.
- `User.beforeUpdate` hook already gates password work on `user.changed('passwordHash')` — the exact guarded branch where `passwordChangedAt` should be stamped, so unrelated `role`/`name` updates never bump it (SESS-01 success criterion #1).
- `crypto` is already imported in `auth.js` (`createResetToken` uses `randomBytes`) — `sha256` hashing for RESET-06 reuses the same module.

### Established Patterns
- Auth failures degrade to `null` (not thrown) in `getUserFromRequest` — the revocation check MUST follow this: a token failing the `iat` check returns `null`, not an error.
- TDD red-green is the milestone norm; SESS-03 and RESET-06 each need a failing test first (see [[tdd-red-green-refactor]]).
- Sequelize model fields via `DataTypes` object literals; hooks are inline in the `init` options.

### Integration Points
- `getUserFromRequest` is called per-request in the Apollo `context` function (`backend/src/server.js`) — the revocation check is on the hot path for every authenticated request; keep it a cheap in-memory comparison (no extra query).
- `resetPassword` already loads the user and saves the new `passwordHash`; setting `passwordChangedAt` piggybacks on the existing `user.save()` via the hook.
</code_context>

<specifics>
## Specific Ideas

- Mandatory boundary test (roadmap #3): reset the password, then immediately re-login with the new password **in the same wall-clock second**, and assert the newly issued token is still accepted. This is the regression pin for D-01/D-02 — without the seconds-floor it fails.
- Manual acceptance (roadmap #4): boot the backend against a pre-existing, non-force-synced local dev DB with an already-provisioned `users` table and confirm zero `Unknown column` errors. Must be documented as a manual step in the plan, not assumed from green CI.
</specifics>

<deferred>
## Deferred Ideas

- **Real migration framework** (sequelize-cli / umzug) — considered for covering Phases 9 and 11 at once; deferred to v2, consistent with the existing STATE.md deferred-items list. Manual documented ALTER is proportionate for this milestone.
- **Refresh-token rotation / server-side denylist / multi-device logout** — explicitly out of scope per REQUIREMENTS.md line 76; `passwordChangedAt` is the chosen mechanism.
</deferred>

---

*Phase: 9-session-revocation-via-passwordchangedat*
*Context gathered: 2026-07-20*
