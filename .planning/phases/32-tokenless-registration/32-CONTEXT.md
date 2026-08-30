# Phase 32: Tokenless Registration - Context

**Gathered:** 2026-08-30
**Status:** Ready for planning

<domain>
## Phase Boundary

`register` accepts a call with no invitation token and safely creates a `Pending`, unverified
account from the caller's own email — reusing the invited path's password rules, email
normalisation, and verification-token handling (REG-07), storing a relationship note the admin
will judge on (REG-03), giving an enumeration-safe response and notifying the real owner
(SEC-01), inheriting the existing per-IP rate limit (SEC-02), and capping and safely rendering
the note (SEC-03). Verifying such an account leaves it `Pending`, makes it visible to admins,
and notifies them (REG-05, REG-06).

**Out of scope this phase:** the public signup form and the rebuilt account-shaped approval UI
(Phase 33), and any change to how invited registrants behave (settled in Phase 31).

</domain>

<decisions>
## Implementation Decisions

### Mutation shape
- **D-01:** One `register` mutation with an optional token — `register(token: String, name: String!, email: String, password: String!, relationshipNote: String): RegisterPayload!` — branching on token presence inside the single resolver (`backend/src/schemas/user.schema.js:59`, `backend/src/resolvers/user.resolver.js:114`). Not a second `selfRegister` mutation and not an input object. This is the literal reading of REG-07's "no second, weaker implementation": the shared password/normalisation/verification-token code is the *same lines*, not two callers of a helper. The accepted cost is conditional argument validation (`email` required iff no token) that GraphQL's type system cannot express — it lives in the resolver.
- **D-02:** On the invited branch the `email` argument is **never read**. The account is created at `invitation.invitedEmail` exactly as today, so the invited path stays byte-identical. This is a security boundary, not a style choice: Phase 31 D-04/D-05 auto-activate invited registrants on verification, so an `email` argument that could override `invitedEmail` would let a caller redirect an admin's vouch to an address the admin never approved. Needs an explicit regression test — "token + hostile email still creates the account at `invitedEmail`".
- **D-03:** No feature flag. The tokenless branch is live the moment the code deploys; the existing gates are the protection (per-IP rate limit 5/hour, `status: 'Pending'`, `emailVerified: false`, admin approval before `Active`). Deploys are manual via `docker-deploy`, so deployment timing is the gate. Do **not** add `PUBLIC_REGISTRATION_ENABLED` or any equivalent env switch.

### Relationship note (REG-03, SEC-03)
- **D-04:** The note lives in a new nullable column on `users`, added by migration `backend/migrations/manual/020-...sql`. This follows Phase 30 D-04's precedent exactly, and for the same stated reason: a self-registrant has no invitation row, so the account needs its own record. **Explicitly rejected:** creating a synthetic `Invitation` row with a null `inviterId` — Phase 31 D-05 auto-activates on the mere existence of an `Invitation` row with `registeredUserId`, so a synthetic row would silently auto-activate a self-registrant with nobody vouching. That is precisely the CR-01 defect Phase 31 spent two gap-closure rounds fixing.
- **D-05:** `VARCHAR(500)` **and** an explicit server-side length assertion in the resolver, mirroring the `assertPasswordStrength` idiom in `backend/src/utils/passwordPolicy.js`. Belt and braces: the explicit check produces a readable GraphQL error, the column type stops anything that bypasses the resolver. Note that `invitationNote` is `TEXT` with no validation at all today (`backend/src/models/Invitation.js:17`), so this cap is new work, not a copy of an existing rule.
- **D-06:** The note is **optional** on the tokenless path — an empty or absent note is accepted and the account is still created. (Chosen against the recommendation of requiring it; see F-01 for the consequence the planner must handle.)
- **D-07:** Add an `escapeHtml` utility and apply it to **every** interpolated value in **every** function in `backend/src/services/mailer.js`. There is currently no escaping anywhere in that file and no escape helper in the codebase — `${note}`, `${newUserName}`, `${relationship}`, `${reason}` all go into HTML raw (`mailer.js:100`, `:109-125`). This phase makes both the note and the registrant's own name attacker-controlled and feeds them into an email sent to every administrator, which is why SEC-03 names the notification email. Doing the whole file also closes Phase 30's still-open WR-07 (unescaped rejection reason).

### Enumeration safety (SEC-01)
- **D-08:** Only the **tokenless** branch becomes silent — it returns the same success message whether or not the email already has an account. The invited branch keeps throwing `'An account with this email already exists.'` unchanged. SEC-01 scopes itself to "the public signup path", and the invited branch is not an equivalent oracle: reaching it requires a valid, unused, unexpired invitation token, so an attacker must be handed a secret before they can probe anything.
- **D-09:** Compute the bcrypt hash **before** the existing-user lookup, and pass the precomputed hash into `User.create` on the free path. Without this the identical message is defeated by timing: the `User` model's `beforeCreate` hook does the hashing, so the taken-email path runs no bcrypt at all and returns ~100ms+ faster. Care required — the `beforeCreate` hook must not double-hash an already-hashed value; this needs its own test.
- **D-10:** When the address is already taken, email the real owner: state that someone attempted a signup with their address, that no new account was created and nothing changed, and point them at password reset in case it was them. Fires only when the address actually has an account, so it can never be used to spam strangers.

### Approval queue (REG-05, REG-06)
- **D-11:** Add a **new** account-shaped query (e.g. `pendingApprovals: [User!]!`) returning users with `status: 'Pending'` AND `emailVerified: true`, carrying name, email, relationship note and registration time. Leave `pendingRegistrations` exactly as Phase 31 D-09 left it, still serving `ApprovalsPage`. SC-3 becomes verifiable against real API data this phase; Phase 33 swaps the UI onto the new field and deletes the old one. Two queue queries coexist for one phase, deliberately.
- **D-12:** The admin notification fires **after** the `verifyEmail` transaction commits, fire-and-forget with `.catch()`, matching the existing `sendVerificationEmail` and `writeAuditLog` call shapes. Condition: the account has no `Invitation` row and is still `Pending` after commit. No email is ever sent for a rolled-back verification, and a mail outage cannot block email verification. See F-02 for the mandatory test consequence.
- **D-13:** Add `emailVerified: true` to the admin selection in `notifyAdminsOfPendingRegistration` (`backend/src/resolvers/user.resolver.js:24`), which today selects on `role: 'ADMIN', status: 'Active'` only. This is the fourth divergent definition of "admin" in the codebase (Phase 31's open WR-03), and this phase is where it starts to matter — the note being mailed is now attacker-controlled, so an unverified admin address is a worse destination for it. Scope is this one where-clause only; **do not** attempt to unify all four definitions (Phase 31's 31-05 plan explicitly ruled that out: the raw-SQL `COUNT(*)` and `updateUser`'s where-clause count have different query and locking shapes, and converging them risks silently altering the last-administrator floor).

### Claude's Discretion
- The exact column name for D-04 (`relationshipNote` is the working name), and the migration file's slug.
- The precise wording of the tokenless success message (D-08), the owner-notification email copy (D-10), and the note-too-long error (D-05) — subject to D-08's constraint that the taken and free paths return an identical message.
- The name of the D-11 query field and whether it returns `[User!]!` directly or a thin wrapper type.
- How `notifyAdminsOfPendingRegistration` is refactored to serve both callers — it currently dereferences `invitation.relationshipToFamily`, `invitation.invitationNote` and `invitation.inviterId`, none of which a self-registrant has. Two functions or one with plain-field arguments is the planner's call.
- Whether the silent taken-email path writes its own audit-log action, and test-file placement for the new coverage.
- Whether `frontend/src/pages/Register.jsx` and `AuthContext.jsx`'s `REGISTER_MUTATION` change at all this phase or wait for Phase 33 — no UI is in scope, but the mutation signature moved.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` §"Phase 32: Tokenless Registration" — goal, dependency on Phase 31, and the five success criteria.
- `.planning/REQUIREMENTS.md` — REG-02 (line 29), REG-03 (30), REG-05 (32), REG-06 (33), REG-07 (34), SEC-01 (60), SEC-02 (61), SEC-03 (62).

### Decisions this phase must not contradict
- `.planning/phases/31-invitations-become-admin-only/31-CONTEXT.md` — D-04/D-05 (invited registrants auto-activate on verification, keyed on the `Invitation` row's existence — the reason D-04 here rejects a synthetic row), D-09 (`pendingRegistrations`' current filter), D-10 (`ApprovalsPage` left mounted for this phase), D-11 (`notifyAdminsOfPendingRegistration` and `sendPendingRegistrationEmail` deliberately preserved unused for this phase to reuse), D-13 (`register`'s success message already dropped the admin-review promise).
- `.planning/phases/30-approval-moves-to-the-account/30-CONTEXT.md` — D-04 (the account-columns precedent this phase's migration 020 follows), D-07/D-08 (approve/reject preconditions the new queue rows must satisfy), D-10 (why `pendingRegistrations` is still invitation-shaped).

### Known open debt this phase touches
- `.planning/phases/31-invitations-become-admin-only/31-REVIEW.md` — WR-03 (four divergent "admin" definitions; D-13 closes one), WR-07 from Phase 30 (unescaped rejection reason in email HTML; D-07 closes it). **CR-01 in that report is a pre-existing privilege-escalation chain in the `verifyEmail` admin-bootstrap block that this phase does NOT fix** — do not assume it was handled, and do not widen scope to fix it here.
- `.planning/phases/31-invitations-become-admin-only/31-HUMAN-UAT.md` — the open CI-confirmation item for Phase 31's TOCTOU lock.

### Code the phase modifies or must match
- `backend/src/resolvers/user.resolver.js` — `register` (`:114-172`), `verifyEmail`/`verifyAndPromote` (`:255-320`), `notifyAdminsOfPendingRegistration` (`:23-39`).
- `backend/src/services/mailer.js` — all templates, for D-07's escaping.
- `backend/src/utils/passwordPolicy.js` — the assertion idiom D-05 mirrors.
- `backend/src/config/rateLimits.js` — `register: { max: 5, windowMs: 1h }`; SEC-02 needs no change (see Integration Points).
- `backend/migrations/manual/019-add-users-approval-columns.sql` — the shape and manual-apply process migration 020 follows.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `assertPasswordStrength` (`backend/src/utils/passwordPolicy.js:1`) — already a standalone module called at `user.resolver.js:115`, before any token handling. REG-07 is satisfied by not forking it.
- Email normalisation — the `User` model's `beforeValidate` hook lowercases and trims (`backend/src/models/User.js` hooks block), so both paths normalise identically for free. The resolver's own `email.toLowerCase().trim()` at `:130` is for the lookup, not the write.
- `createVerificationToken` / `hashVerificationToken` / `verificationTokenExpiry` (`backend/src/utils/auth.js`) — shared by construction.
- `notifyAdminsOfPendingRegistration` + `sendPendingRegistrationEmail` — preserved unused by Phase 31 D-11 specifically for this phase. Needs the D-13 fix and a refactor to serve an invitation-less caller.
- `approveUser` / `rejectUser` (`backend/src/resolvers/approval.resolver.js`) — already account-addressed and already require `status: 'Pending'` + verified email (Phase 30 D-07/D-08), so the new queue rows are actionable with no mutation changes.

### Established Patterns
- Conditional `UPDATE ... WHERE <precondition>` + `affected === 0` is the codebase's CAS idiom (`user.resolver.js:152-156`); `lock: t.LOCK.UPDATE` is the locking-read idiom (`:297-300`). Reach for these rather than re-deriving a guard.
- Side effects after a transaction are fire-and-forget with `.catch()` (`sendVerificationEmail` at `:159`, `writeAuditLog` at `:163`). D-12 follows this.
- Manual SQL migrations in `backend/migrations/manual/`, applied by hand and confirmed via `information_schema` — never auto-run.

### Integration Points
- **SEC-02 needs no code.** `RATE_LIMITS` is keyed by GraphQL mutation field name (`register: { max: 5, windowMs: 60*60*1000 }`, `backend/src/config/rateLimits.js:7`) and the plugin keys `${clientIp}:${field}` (`backend/src/plugins/rateLimitPlugin.js:10`). Because D-01 keeps one `register` field, the tokenless path inherits the limit by construction. This still wants an explicit test proving it, not just an argument.
- `verifyEmail`'s tail is `await user.reload()` then `return { token: signToken(user), user }` (Phase 31 F-03) — D-12's notifier hooks in after the transaction and before or after that reload, but must not change what is returned.
- The new D-11 query joins the existing `requireAdmin` guard set alongside `invitations`, `pendingRegistrations`, and `users`.

</code_context>

<specifics>
## Specific Ideas

- D-02's regression test should be adversarial and explicit: a valid invitation for `alice@example.com` plus `email: "attacker@evil.com"` must still create the account at `alice@example.com`. Phase 31's auto-activation is what makes this a privilege boundary rather than a validation nicety.
- D-09's timing fix should be verified by a test that asserts the *shape* of the code (hash computed before the lookup), not by measuring wall-clock time, which would be flaky.

</specifics>

<deferred>
## Deferred Ideas

- **Public signup form and account-shaped approval UI** — Phase 33. D-11 deliberately adds the query without touching `ApprovalsPage`.
- **Unifying all four "admin" definitions** — D-13 fixes one where-clause only. The full convergence (raw-SQL `COUNT(*)`, `updateUser`'s last-administrator guard, `isFunctioningAdmin`, the notifier) remains Phase 31 WR-03 debt, explicitly ruled out of scope by 31-05.
- **CR-01, the pre-existing admin-bootstrap privilege escalation** — real, live in production, and confirmed unchanged since Phase 11 (`7bb006a feat(11-08)`). Wants its own phase; not this one.
- **Pruning or expiring dead-end registrations** — Phase 31 F-04 carried forward from Phase 30 F-02. This phase adds a second source of accounts that can sit at `Pending` forever (an unverified self-registration), which makes the gap larger but does not close it.
- **Requiring the relationship note** — D-06 chose optional. If context-free queue rows prove unworkable in Phase 33, revisiting this is a one-line server change.

</deferred>

---

## Flags for the Planner

- **F-01 (empty-note rows are now guaranteed, not hypothetical):** D-06 makes the note optional, so the D-11 query will return rows whose only context is a name and an email. The query and any Phase 33 UI must handle an empty note as a normal state, not an edge case. REG-03 calls the note "the only context an admin has to judge a stranger on" — with D-06 that context is optional, and the admin's remedy is rejection.
- **F-02 (D-12 is the fire-and-forget shape that has bitten twice):** the new admin notifier must never be asserted with a bare read straight after the mutation resolves. Phase 30's WR-05 and Phase 31-05's post-merge failure in `register.test.js` were both exactly this. Every test touching it uses `vi.waitFor`.
- **F-03 (migration 020 needs a manual apply):** following 019's process — prove on a scratch database, then apply by hand to the local dev DB and confirm via `information_schema`. Production apply is a separate, deliberate step; note that D-03 ships the open mutation on deploy, so the migration and the code must land together.
- **F-04 (local DB is MariaDB, CI and prod are MySQL 8.4):** Phase 31-05's lock test could not be proven locally for exactly this reason and is still open in `31-HUMAN-UAT.md`. Any test in this phase that depends on engine-specific behaviour must say so explicitly rather than being silently skip-gated — a skipped test is indistinguishable from a passing one.
- **F-05 (D-09 vs the model hook):** `passwordHash: password` relies on `beforeCreate` hashing it. D-09 precomputes the hash, so the create call must not let the hook hash it a second time. Verify how the hook detects an already-hashed value, or bypass it explicitly.

---

*Phase: 32-tokenless-registration*
*Context gathered: 2026-08-30*
