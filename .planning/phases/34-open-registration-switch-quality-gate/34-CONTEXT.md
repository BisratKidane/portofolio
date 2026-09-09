# Phase 34: Open-Registration Switch & Quality Gate - Context

**Gathered:** 2026-09-08
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers two things, and they are different in kind.

**A switch.** An admin can turn public self-registration off from inside the app, without a redeploy, and the server — not just the UI — refuses tokenless registration while it is off. The current state is visible to admins in the same place they change it. (ADMIN-01, ADMIN-02, ADMIN-03)

**A proof.** Adversarial tests establish that the milestone's authorization boundaries actually hold: a non-admin cannot invite, approve, or reject, and cannot register tokenless while the switch is off; and a self-registered account cannot reach any authenticated resolver until both gates pass — proven against the resolvers, not against the client-side route guard. (SEC-04, SEC-05)

Plus `npm test --workspaces` green.

**Not in scope:** fixing CR-02 (deliberately accepted — see Reviewed Todos); closing Phase 33's open visual UAT items or re-running `/gsd:verify-work 32` (workflow housekeeping, run separately before milestone close); the advisory review warnings including the missing `users(role, status, emailVerified)` index; any second switch for freezing invitations; any new auth capability.

</domain>

<decisions>
## Implementation Decisions

### Where the switch is stored (ADMIN-01)

- **D-01:** A **generic `app_settings` key/value table**, added by a new numbered manual migration (`backend/migrations/manual/021-*.sql`, following the `020-add-users-relationship-note.sql` precedent). Shape is roughly `key VARCHAR(64) PRIMARY KEY, value VARCHAR(255) NOT NULL, updatedAt DATETIME NOT NULL, updatedById INT NULL`. Chosen over a dedicated typed `app_config` row so that a future flag is a row rather than another migration; the accepted cost is string values, so the read path needs a small typed accessor rather than reading the column directly.

  **This is not a contradiction of Phase 32 D-03.** That decision banned an *env-var* switch (`PUBLIC_REGISTRATION_ENABLED` or equivalent) precisely because it would require a redeploy to flip. ADMIN-01 requires the opposite property. The ban stands: do not introduce an env variable for this, and do not let an env variable override the stored value.

- **D-02:** **Fail closed, seed open.** The migration seeds the row to enabled, so a correctly-deployed system behaves exactly as production does today. But an **absent row or a failed read resolves to disabled** — invitation-only. Two reasons: an admin's deliberate "off" must never be silently undone by a wiped row or a half-applied migration, and CR-02 (account pre-hijacking, knowingly shipped) is live behind this form, so the unexpected state should be the safe one.

  **Test consequence:** this needs its own coverage. Delete the row → tokenless register refused. Make the read throw → tokenless register refused. A fail-closed default that is never exercised is a fail-open default nobody has noticed yet.

- **D-03:** **Every flip writes an `AuditLog` row** — acting admin, old value → new value, timestamp — via the existing `writeAuditLog` helper (`backend/src/utils/audit.js`). Consistent with how every other consequential admin action is already treated (APPR-04). Chosen over relying on `updatedById`/`updatedAt` alone, which overwrite history: a flag flipped off and back on during a spam incident would otherwise leave no trace of the incident.

### The admin control (ADMIN-01, ADMIN-03)

- **D-04:** The control lives at the **top of the existing `/invitations` page**. `frontend/src/pages/InvitationsPage.jsx` is 26 lines stacking `InvitePage` + `ApprovalsPage` behind `<ProtectedRoute allowedRoles={['ADMIN']}>`; the switch becomes a third stacked region above them. **No new route, no new nav entry, no new page component.** It sits where an admin already goes to manage who gets in, and the approval queue directly below it is the visible consequence of leaving the door open.

- **D-05:** **Closing is instant; opening asks for confirmation.** ADMIN-01's stated reason for existing is that "a spam wave can be stopped in seconds", so nothing may stand between the admin and shutting the door. Opening is the direction that exposes the public form, so it takes a confirmation naming what it does. The asymmetry is deliberate and derived from the requirement's own wording — do not "simplify" it to symmetric behaviour.

- **D-06:** The control shows **state plus last change** — e.g. "Public signup is OPEN — opened by Bisrat on 8 Sep" — beside the toggle. This satisfies ADMIN-03 and makes the audit trail useful at a glance rather than only in the database.

### `/register` discovery and enforcement (ADMIN-02)

- **D-07:** A **public, unauthenticated `publicRegistrationEnabled: Boolean!` query** drives the initial render. `frontend/src/pages/Register.jsx:89` already branches on `!token`; inside that branch it now chooses the signup form or the invitation-only message based on this query. **Plus a submit-path fallback:** if the server refuses a tokenless submit anyway, the UI swaps to the same invitation-only message rather than showing a generic error. An admin can close the door while someone is mid-form, and that race is exactly the moment the switch matters most.

  **Constraint the planner MUST honour — this is the phase's dangerous shape.** The client query and the server check are an outer guard and an inner guard on the same predicate. That is the exact bug class that has now hit this project four times across Phases 14, 15, 30, 31, 32 and 33 — most recently *inside* the agreement test built to prevent it. Both sides MUST read the same stored value through the same accessor. Do not let the client's notion of "enabled" be derived independently, cached differently, or defaulted differently from the server's. See D-12.

- **D-08:** The switch gates the **tokenless branch only**. A valid invitation token still registers normally while the door is closed. Closing the door must not silently void invitations an admin has already issued and which recipients are holding. ADMIN-01 and ADMIN-02 both scope themselves to "public self-registration" / "tokenless registration"; this is the literal reading. (A second control for freezing invitations was raised and deferred — see Deferred Ideas.)

- **D-09:** A refused tokenless `register` is **checked first and refused plainly**. The switch check runs before the email lookup, before bcrypt, before any DB write, and throws a clear message to the effect that registration is currently by invitation only. No DB touch, no timing signal, no owner-notification email for an account that will never exist.

  **Interaction with SEC-01 / Phase 32 D-08, which the planner must not get backwards:** enumeration-silence is about not revealing *whether a given email has an account*. It is not about hiding the door's state — the public `publicRegistrationEnabled` query reveals that to anyone, by design. So a plain refusal here does not weaken SEC-01. What *would* weaken it is placing this check after the uniform-response guard, where a closed-door refusal could become distinguishable from the silent path. Check the switch first, before any of that machinery runs.

- **D-10:** Accounts **already in the approval queue when the door closes stay there and remain approvable**. Closing stops new arrivals; it does not void people who already registered and verified. Stated explicitly because it is the kind of obvious that produces a bug — nothing in the switch's implementation should touch `pendingApprovals`, `approveUser`, or `rejectUser`.

### Adversarial proof (SEC-04, SEC-05)

- **D-11:** One **new, additive `security.boundaries.test.js`** in `backend/src/resolvers/` — a matrix a reviewer can read top to bottom as "here is the whole boundary", serving as the milestone's proof artifact. Existing per-resolver adversarial cases stay exactly where they are and are **not** moved: `createInvitation.test.js:102` (linked, Active, non-admin refused), `approveReject.test.js`, `setUserPassword.test.js:26`, `accountStatus.test.js:49`. The matrix covers cells they do not, and references rather than duplicates the ones they do.

- **D-12:** SEC-05 is proven by a **schema-driven sweep, not a sample**. The test enumerates every field on `type Query` and `type Mutation` from the SDL and asserts each one refuses a `Pending`, email-verified self-registrant's token — with an **explicit allowlist** for the genuinely public fields (`register`, `login`, `requestPasswordReset`, `resetPassword`, `verifyEmail`, `resendVerificationEmail`, the new `publicRegistrationEnabled`, and whatever else is actually public today; the planner establishes the real list from the schema, not from this sentence).

  **Why this shape and not a sample:** it inverts the default. A resolver added next year that forgets its guard fails this test on day one, and widening the allowlist becomes a conscious, reviewable act rather than an omission nobody sees. This is the structural mechanism the project's repeated failures call for.

  **Note on where the gate actually is:** `backend/src/utils/auth.js:33` already returns `null` from `getUserFromRequest` for any non-`Active` user, so the mechanism exists and `accountStatus.test.js:49` covers it at the chokepoint. SEC-05's contribution is proving the *consequence* holds across the whole surface, and that it keeps holding. Do not treat the existing chokepoint test as making the sweep redundant — the sweep is what checks the claim "every resolver goes through that chokepoint", which no current test asserts.

- **D-13:** **Every new boundary test is mutation-tested.** For each one, remove or weaken the guard it protects, confirm the test actually goes red, restore. Recorded in the plan as a verification step with its result, not as a good intention.

  This is not ceremony. Phase 32's CR-01 and Phase 33's repeat were both TDD'd, both green, both wrong — because the test and the guard shared the same blind spot, and nothing ever checked that the test could fail. A red-state demonstration is the only step that has caught this class every time it was run.

- **D-14:** Scope stays **SC-5 as written**: this phase is done when ADMIN-01..03 and SEC-04..05 are delivered and `npm test --workspaces` is green. Phase 33's two open visual UAT items, the pending `/gsd:verify-work 32` re-check of SEC-01, and the advisory review warnings are **not** absorbed here. They are workflow housekeeping to run before the milestone closes; folding them in would blur what this phase actually proved.

### Claude's Discretion

- The exact setting key name, the migration file's slug, and whether the typed accessor caches (the read is on a rate-limited path and a rarely-loaded public page — caching is optional, but if it caches, the client and server must still share one source per D-07).
- The mutation's name and signature for flipping the switch, and its return shape.
- Visual composition of the admin control — which MUI primitives, spacing, how the OPEN/CLOSED state is signalled — following the app's existing surface treatment. `/gsd:ui-phase 34` will produce the design contract (ROADMAP marks this phase **UI hint: yes**).
- Exact copy for the confirmation dialog, the OPEN/CLOSED state line, the server's refusal message, and the invitation-only message shown on `/register`.
- Whether the new public `publicRegistrationEnabled` query is rate-limited. It is a trivially cheap read on an already CORS-restricted endpoint; the existing AST-keyed rate-limit plugin makes adding it cheap if the planner judges it worthwhile.
- Whether the switch state is ever surfaced to non-admins. Today only admins reach `/invitations` at all, so the default is no.
- Test-file placement for the switch's own coverage (resolver tests, component tests), and whether the schema sweep's allowlist is itself pinned by a second assertion against an expected literal set.

### Folded Todos

None folded. See Reviewed Todos below.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### This milestone's requirements and roadmap
- `.planning/REQUIREMENTS.md` — ADMIN-01, ADMIN-02, ADMIN-03, SEC-04, SEC-05 are this phase's requirements; SEC-01/SEC-02/SEC-03 and REG-07 constrain how the tokenless path may be touched.
- `.planning/ROADMAP.md` § Phase 34 — the five success criteria, verbatim, including "UI hint: yes".
- `.planning/PROJECT.md` § Current Milestone: v4.1 — the two-door model and what is explicitly out of scope this milestone.

### Prior phase decisions that bind this phase
- `.planning/phases/32-tokenless-registration/32-CONTEXT.md` — **D-03** (no env-var feature switch; D-01 above explains why an in-app switch is not a reversal), **D-08** (enumeration-silence scoped to the tokenless branch; D-09 above explains the ordering constraint this creates), **D-09** (bcrypt-before-lookup timing defence, which the new first-thing switch check sits in front of).
- `.planning/phases/33-public-signup-form-approval-queue/33-CONTEXT.md` — **D-01** (the signup password is the working credential; CR-02 accepted), **D-04** and its hard constraint on client-guard/server-guard agreement — the direct ancestor of D-07's constraint here, **D-10** (`pendingApprovals` is the one queue; `pendingRegistrations` is deleted).
- `.planning/phases/31-invitations-become-admin-only/31-CONTEXT.md` — **D-01/D-02** (`requireAdmin` on `createInvitation` and `myInvitations`) and **D-04/D-05** (invited registrants auto-activate on verification) — both are cells in the SEC-04 matrix.

### Review findings and accepted risk
- `.planning/todos/pending/20260903-cr02-account-pre-hijacking.md` — open, deliberately accepted, **not** fixed in this phase.
- `.planning/phases/32-tokenless-registration/32-REVIEW.md` — CR-01, the origin of the client/server guard-divergence bug class.
- `.planning/phases/33-public-signup-form-approval-queue/33-REVIEW.md` — WR-01, the missing `users(role, status, emailVerified)` index, explicitly **not** in scope per D-14.
- `.planning/quick/260908-geq-p33-validator-parity/` — the most recent recurrence of the guard-divergence class and how it was closed (call the same function; mutation-test the agreement).

### Codebase maps
- `.planning/codebase/TESTING.md` — the test infrastructure the new matrix file joins.
- `.planning/codebase/ARCHITECTURE.md` — the resolver/context/auth layering the SEC-05 sweep asserts over.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `backend/src/utils/audit.js` — `writeAuditLog(models, { action, actorUserId, targetUserId, metadata }, options)`. D-03's flip audit uses it directly; no new helper needed.
- `backend/src/utils/auth.js:42` — `requireAdmin(user)` already throws `'Admin access is required.'`. The switch mutation uses it unchanged; no new guard.
- `backend/src/utils/auth.js:33` — `getUserFromRequest` already returns `null` for `!emailVerified` or `status !== 'Active'`. **SEC-05's gate already exists**; this phase proves its reach, it does not build it.
- `backend/migrations/manual/020-add-users-relationship-note.sql` — the immediate precedent for D-01's migration `021`: numbered, hand-written, portable SQL.
- `frontend/src/pages/InvitationsPage.jsx` — 26 lines, `<Stack>` of `InvitePage` + `ApprovalsPage`. D-04's switch is a third region in that stack.
- Existing per-resolver adversarial tests — `createInvitation.test.js:102`, `setUserPassword.test.js:26`, `approveReject.test.js`, `accountStatus.test.js:49`. They establish the actor-construction idiom the matrix file should reuse rather than reinvent.

### Established Patterns

- **No settings infrastructure exists.** `backend/src/models/` holds only `User`, `Invitation`, `FamilyMember`, `Spouse`, `AuditLog`. There is no key/value table, no config resolver, no flag of any kind anywhere in `backend/src` or `frontend/src`. D-01's table and its Sequelize model are genuinely new — there is no house style to copy, so follow the shape of `AuditLog` (simple model, thin helper).
- **Aggregator barrels** — a new model, schema, and resolver must be registered in `backend/src/models/index.js`, `backend/src/schemas/index.js`, and `backend/src/resolvers/index.js`. Whether the switch gets its own `setting.*` module trio or joins an existing one is the planner's call.
- **Guards throw, they don't return** — `requireAdmin`/`requireAuth` throw synchronously at the top of resolver bodies. D-09's switch check follows the same idiom, placed above everything else in the tokenless branch.
- **Frontend has no GraphQL client library** — plain axios POST with raw query strings via `frontend/src/api/graphqlClient.js`. D-07's `publicRegistrationEnabled` query is a string constant, fetched with `graphqlRequest`, exactly like `ME_QUERY` in `AuthContext.jsx`.

### Integration Points

- `backend/src/resolvers/user.resolver.js:178` — `register`'s single resolver, branching on `token` at `:181`. D-09's check goes in the tokenless branch, ahead of the email pre-validation added by Plan 32-13 at `:263`.
- `backend/src/schemas/user.schema.js:52` (`type Query`) and `:60` (`type Mutation`) — where `publicRegistrationEnabled` and the flip mutation are declared, and the exact SDL the D-12 sweep enumerates.
- `frontend/src/pages/Register.jsx:89` — the `if (!token)` branch whose contents become conditional on D-07's query.
- `backend/vitest.config.js` `globalSetup` — the new `app_settings` table must exist under `sequelize.sync({ force: true })`, which means a Sequelize model, not migration SQL alone. Both are needed: the model for tests and dev, the migration for production.

</code_context>

<specifics>
## Specific Ideas

- **"Public signup is OPEN — opened by Bisrat on 8 Sep"** — the shape D-06 asks for: state first, in plain words, with attribution.
- **The allowlist as the security surface.** D-12's value is not the sweep, it is that the sweep forces every public field to be named in one visible list. A field is authenticated unless someone deliberately writes it down.
- **A flag for the planner (F-01):** D-03 chose the `AuditLog` as the history mechanism, over denormalized columns. D-06 then needs "who last changed it and when" rendered cheaply on page load. Those two do not automatically compose. Resolve it one way and say which: either read the latest matching `AuditLog` entry for the display, or keep `updatedById`/`updatedAt` on the settings row as a denormalized convenience *in addition to* the audit row. Do not silently drop the audit row in favour of the columns — D-03 chose history deliberately.

</specifics>

<deferred>
## Deferred Ideas

- **A second switch to freeze outstanding invitations.** Raised while deciding D-08. Today closing the public door leaves invited registration fully working, which is the intended behaviour; a separate "freeze invitations too" control would be a new capability and belongs in its own phase.
- **Absorbing the milestone's open debt into this phase** — Phase 33's two visual UAT items, the `/gsd:verify-work 32` SEC-01 re-check, and the advisory warnings including the missing `users(role, status, emailVerified)` index. Considered and rejected as this phase's work (D-14); they run as separate closing steps before the milestone completes.

### Reviewed Todos (not folded)

- **CR-02 — tokenless register enables account pre-hijacking** (`.planning/todos/pending/20260903-cr02-account-pre-hijacking.md`, matched this phase at 0.6). Surfaced again because Phase 34 is the milestone's quality gate and the vulnerability is now live behind a public form. **Reviewed and deliberately not folded** — Phase 33's D-01 stands: the signup password is the account's working credential. The todo stays open and annotated; v4.1 ships with the risk documented rather than hidden. This is a live vulnerability the milestone chose to accept, not closed work and not an oversight.

</deferred>

---

*Phase: 34-open-registration-switch-quality-gate*
*Context gathered: 2026-09-08*
