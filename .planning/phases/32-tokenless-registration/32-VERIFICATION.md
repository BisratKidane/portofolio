---
phase: 32-tokenless-registration
verified: 2026-08-30T19:49:34Z
status: gaps_found
score: 4/5 must-haves verified
overrides_applied: 0
gaps:
  - truth: "An email that already has an account gets a response indistinguishable from one that does not, and the real owner is emailed that someone tried to register with their address."
    status: failed
    reason: >
      CR-01 (confirmed by independent live reproduction against the test database, not just
      code inspection). The tokenless branch's free-email path falls through to an unguarded
      `models.User.create(...)` with no pre-lookup validation of `name` (or `email` shape).
      Any create failure surfaces as a raw GraphQL error while the taken-email branch always
      returns the fixed success message with no DB write. This is a one-request, deterministic
      existence oracle -- exactly the class of side channel SEC-01/D-08 exists to close.
      Independently reproduced (script run against the live test DB, then deleted; working
      tree left clean):
        name = 'A'.repeat(300), email = taken-probe@example.com
          => {"data":{"register":{"message":"Registration received. Verify your email to activate your account."}}}
        name = 'A'.repeat(300), email = free-probe@example.com
          => {"errors":[{"message":"Data too long for column 'name' at row 1", "extensions":{"code":"INTERNAL_SERVER_ERROR"}}]}
      The same class also fires on the duplicate-insert race (unique-constraint "Validation
      error") and -- on any deploy target where manual migration 020 has not been applied --
      on EVERY free-email registration ("Unknown column 'relationshipNote'"), which would open
      the oracle wide in production while the full test suite (473/3 skipped, all green) stays
      green locally. This is precisely a case where 100% green tests coexist with a violated
      must-have: register.test.js's enumeration test (line 179-199) only asserts the message
      for well-formed inputs and never exercises a create-failure input, so nothing pins the
      oracle shut.
    artifacts:
      - path: backend/src/resolvers/user.resolver.js
        issue: >
          Lines 220-260 (tokenless branch): `assertRelationshipNoteLength` and `if (!email)`
          run before the lookup (correctly placed), but `name` has no length/emptiness
          validation anywhere on this path, and the `models.User.create` call at lines
          249-260 has no try/catch. A DB-layer failure on the free-email path is the only
          thing that distinguishes it from the taken-email path's guaranteed-silent success.
    missing:
      - "Validate name (trim, require non-empty, cap at 255) before the existing-user lookup on the tokenless branch, so create-time failures cannot become a distinguishing side channel"
      - "Wrap the free-email models.User.create call in try/catch and return the identical success message on any failure (never propagate ORM/DB error text to an unauthenticated caller) -- this also closes WR-02 (raw MySQL/Sequelize error strings leaking column names and ORM identity to anonymous callers)"
      - "Add a regression test asserting the taken-email and free-email responses are byte-identical under a hostile long-name payload (300+ chars) -- this is what would have caught CR-01 and is the fix register.test.js's existing enumeration test (line 179) does not attempt"
      - "Secondary, same success criterion: WR-01's residual timing gap -- the free path additionally awaits a committed INSERT the taken path does not (measured median 217.2ms vs 215.9ms over 12 paired samples, near-disjoint distributions). Apply the same MIN_RESET_RESPONSE_MS-style floor this file already uses for requestPasswordReset to register's tokenless branch."
  - truth: "REG-03 and SEC-03 are marked [x] (fully complete) in REQUIREMENTS.md for Phase 32"
    status: partial
    reason: >
      Both requirements have a UI-facing clause this backend-only phase does not deliver.
      REG-03: "The relationship note ... is stored with the account and shown to admins at
      approval time." Storage is done (users.relationshipNote, migration 020) and the field is
      exposed via GraphQL (pendingApprovals). But nothing in this phase renders it in the admin
      UI -- ROADMAP.md's own Phase 33 success criterion 3 explicitly assigns "The admin queue
      lists each waiting account with name, email, relationship note, and registration time" to
      Phase 33, not Phase 32. SEC-03: "...length-capped on the server and rendered safely
      everywhere it is shown -- the admin UI and the admin notification email included." The
      email half is done (escapeHtml applied, verified by test). The admin UI half cannot be
      "rendered safely" because no admin UI renders it yet -- it does not exist until Phase 33.
      REQUIREMENTS.md's traceability table maps both IDs to "Phase 32" only (no Phase 33 row),
      so marking them fully [x] overstates what this phase delivered; a reader trusting the
      checkbox would believe an admin can already see the note in the UI today, which is false.
    artifacts: []
    missing:
      - "Correct REQUIREMENTS.md: either split REG-03/SEC-03 into backend/UI halves with the UI half tracked against Phase 33, or leave both unchecked until Phase 33 ships the admin queue UI and its render-safety"
deferred: []
human_verification: []
---

# Phase 32: Tokenless Registration Verification Report

**Phase Goal:** `register` accepts a call with no invitation token and safely creates a `Pending`, unverified account -- reusing the invited path's password rules, email normalisation, and verification-token handling, with enumeration-safe responses, admin notification on verification, and the existing per-IP rate limit applied.
**Verified:** 2026-08-30T19:49:34Z
**Status:** gaps_found
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `register` with no token creates a `Pending`, unverified account from the user's own email, storing the relationship note | VERIFIED | `user.resolver.js:220-260` tokenless branch creates `status: 'Pending'`, `emailVerified` defaults false, `relationshipNote: relationshipNote \|\| null`. Confirmed by `register.test.js:160-177` (passing) and independently by re-running `npm test -w backend -- src/resolvers/register.test.js` (16/16 pass). |
| 2 | An email that already has an account gets a response indistinguishable from one that does not, and the real owner is emailed | FAILED | CR-01. Confirmed live: identical hostile input (300-char name) produces a success message for a taken email and a raw DB error for a free email. Independently reproduced against the live test DB (see gap above), not merely inferred from the code review. `user.resolver.js:249-260`'s `models.User.create` has no try/catch and no pre-lookup `name` validation. |
| 3 | An unverified self-registration is absent from the approval queue; verifying the email puts it there and notifies administrators | VERIFIED | `pendingApprovals` filters `status: 'Pending', emailVerified: true` (`user.resolver.js:134-140`, `pendingApprovals.test.js:57-71` proves an unverified row is excluded). `verifyEmail` fires `notifyAdminsOfPendingRegistration` when `!associatedInvitation && user.status === 'Pending'` (`user.resolver.js:445-453`), proven by `verifyEmail.test.js` (passing, `vi.waitFor`-gated). Caveat (WR-05, not blocking this truth): `pendingApprovals` has no Invitation-row filter, so an unvouched invited registrant can appear in both `pendingApprovals` and `pendingRegistrations` simultaneously -- a queue-definition inconsistency, not a REG-05/REG-06 violation (self-registrations still behave correctly). |
| 4 | Password rules, email normalisation, and verification-token handling on the tokenless path run the same code as the invited path -- no second, weaker implementation | VERIFIED | `assertPasswordStrength(password)` runs once before the token/no-token branch (`user.resolver.js:153`). Email normalisation is enforced by the single model-level `beforeValidate` hook (`User.js:88-90`), which fires for every `User.create` regardless of branch. `createVerificationToken`/`hashVerificationToken`/`verificationTokenExpiry` are the identical imported functions on both branches (`user.resolver.js:176-188` vs `:243-256`). Caveat (WR-04, does not affect this specific truth's literal scope): the invited branch silently discards `relationshipNote` and never applies its cap -- a related but separate quality issue on `relationshipNote` handling, not on password/normalisation/verification-token handling. |
| 5 | The existing per-IP registration rate limit applies to the tokenless path, and the relationship note is length-capped server-side | VERIFIED | `rateLimit.test.js:208-...` ("rejects the 6th tokenless register attempt from the same IP within the window (SEC-02)") passes -- direct test, not argument alone. `assertRelationshipNoteLength` (`relationshipNotePolicy.js`) throws above 500 chars, called before the lookup (`user.resolver.js:224`); `register.test.js:247-259` proves rejection and zero row creation. Caveats, non-blocking: WR-08 (cap counts UTF-16 code units, safe-direction only -- over-rejects astral input, e.g. 400 emoji refused, but never permits DB overflow); WR-10 (no dedicated unit-test file for the policy module, boundary cases at exactly 500/non-string input untested). |

**Score:** 4/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/migrations/manual/020-add-users-relationship-note.sql` | ALTER TABLE adding `relationshipNote VARCHAR(500) NULL` | VERIFIED | File exists; single ALTER statement. Independently confirmed applied to the real local dev DB via a live `information_schema` query: `relationshipNote \| varchar(500) \| YES`. |
| `backend/src/models/User.js` | `relationshipNote` field + explicit-flag `beforeCreate` guard | VERIFIED | `relationshipNote: { type: DataTypes.STRING(500), allowNull: true }` (line 79); `beforeCreate(user, options)` skips hashing only when `options.passwordAlreadyHashed` is set (lines 105-109); no `BCRYPT_HASH_PATTERN` or content-sniffing anywhere in the file. |
| `backend/src/models/User.test.js` | Regression tests for the guard | VERIFIED | `npm test -w backend -- src/models/User.test.js` passes (part of the 60/62-test run confirmed independently); identity-check test for the explicit-flag path and the bcrypt-shaped-plaintext-still-hashed test both present. |
| `backend/src/utils/escapeHtml.js` | Pure HTML-entity escape utility | VERIFIED | Exports `escapeHtml`; tests pass; used at 10+ interpolation sites in `mailer.js` (`grep -c "escapeHtml("` = matches plan's "at least 10" bar). |
| `backend/src/services/mailer.js` | Escaped templates + `sendRegistrationAttemptEmail` + self-registration copy branch | VERIFIED | `sendPendingRegistrationEmail`'s `inviterName`-branch confirmed at `mailer.js:109-140` ("registered directly" vs "registered via an invitation from"); `sendRegistrationAttemptEmail` exists at `mailer.js:186-199`, escapes `name`. |
| `backend/src/schemas/user.schema.js` | `register(token: String, ..., email: String, ..., relationshipNote: String)` + `User.relationshipNote` + `pendingApprovals` | VERIFIED | Confirmed literal signature present (line 61); `relationshipNote: String` on `User` type (line 22); `pendingApprovals: [User!]!` on `Query` (line 57). |
| `backend/src/utils/relationshipNotePolicy.js` | `assertRelationshipNoteLength` | VERIFIED (functionally) with quality caveats | Exists, exports the function, enforced in the resolver. WR-08 (UTF-16 length counting) and WR-10 (no dedicated test file) are real but non-blocking quality gaps -- see truth 5 above. |
| `backend/src/resolvers/user.resolver.js` | `register`'s tokenless branch, `notifyAdminsOfPendingRegistration`, `pendingApprovals` resolver | VERIFIED to exist/wired, but contains a live security defect | The tokenless branch, D-13 admin-selection fix, and D-12 wiring are all present and functionally correct for well-formed input. CR-01 (see gap above) means the branch is not safe against adversarial input -- this is a defect in an otherwise-complete implementation, not a missing/stub artifact. |
| `backend/src/resolvers/register.test.js`, `rateLimit.test.js`, `verifyEmail.test.js`, `pendingApprovals.test.js` | Test coverage per plan | VERIFIED (exist, pass) | Confirmed by direct re-execution: register.test.js 16/16, rateLimit.test.js/verifyEmail.test.js/pendingApprovals.test.js/User.test.js/mailer.test.js/escapeHtml.test.js combined 60 passed + 2 skipped. Full backend suite independently re-run: 473 passed, 3 skipped, 65 files, exit 0 -- matches the orchestrator's reported total exactly. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `register` (tokenless, taken-email) | `mailer.js` | `sendRegistrationAttemptEmail(...)` fire-and-forget `.catch()` | WIRED | `user.resolver.js:235-237`; `register.test.js:192-198` asserts the call via `vi.waitFor`, not a bare read. |
| `register` (tokenless, free-email) | `models/User.js` | `models.User.create(values, { passwordAlreadyHashed: true })` | WIRED | `user.resolver.js:249-260`; end-to-end proof via `register.test.js:206-221` (login with original plaintext password after manual verify/activate succeeds). |
| `verifyEmail` | `notifyAdminsOfPendingRegistration` | fire-and-forget call gated on `!associatedInvitation && user.status === 'Pending'` | WIRED | `user.resolver.js:449-453`; `verifyEmail.test.js` D-12/D-13 cases pass (confirmed in independent re-run). |
| `schema.js Query.pendingApprovals` | `user.resolver.js Query.pendingApprovals` | `requireAdmin(user)` + two-condition `where` | WIRED | `user.resolver.js:134-140`; `pendingApprovals.test.js` (5/5 cases pass, confirmed). |

### Data-Flow Trace (Level 4)

Not separately applicable -- this phase has no frontend component rendering fetched data; `pendingApprovals` is a backend query verified end-to-end against a real Sequelize/MySQL query (not a static return) by `pendingApprovals.test.js`, which creates real rows via `createTestUser` and asserts they round-trip through the resolver.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| SEC-01 enumeration silence under adversarial input | Standalone Apollo `executeOperation` script against the live test DB: `register({name: 'A'.repeat(300), email: <taken>})` vs `register({name: 'A'.repeat(300), email: <free>})` | Taken -> success message; Free -> `{"errors":[{"message":"Data too long for column 'name' at row 1", "extensions":{"code":"INTERNAL_SERVER_ERROR"}}]}` | FAIL (confirms CR-01; probe script written to a scratch location, executed, then deleted -- `git status` on `backend/` confirmed clean afterward) |
| No `PUBLIC_REGISTRATION_ENABLED` feature flag exists (D-03) | `grep -rn "PUBLIC_REGISTRATION_ENABLED" backend/` | No matches | PASS |
| Full backend suite | `npm test --workspace backend` | `473 passed \| 3 skipped (476)`, 65 files, exit 0 | PASS (green, but does not detect CR-01 -- see gap reasoning) |

### Probe Execution

No conventional `scripts/*/tests/probe-*.sh` files exist in this repository and none are declared in the Phase 32 plans/summaries. Skipped per Step 7c's discovery step; the ad-hoc behavioral spot-check above serves the equivalent verification purpose for this phase's central security claim.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| REG-02 | 32-03 | `register` accepts no-token, creates Pending/unverified account | SATISFIED | Truth 1 above |
| REG-03 | 32-01, 32-03, 32-04 | Note stored with account AND shown to admins at approval time | PARTIAL | Storage half satisfied (`relationshipNote` column + GraphQL field + `pendingApprovals` exposure). "Shown to admins" (UI rendering) is explicitly Phase 33's scope per ROADMAP.md's own Phase 33 SC3 ("The admin queue lists each waiting account with name, email, relationship note..."). Marking `[x]` in REQUIREMENTS.md today is premature -- recommend downgrading to partial/deferred until Phase 33 ships. |
| REG-05 | 32-04 | Unverified self-registration never in approval queue | SATISFIED | Truth 3 above; `pendingApprovals.test.js:57-71` |
| REG-06 | 32-04 | Verifying moves it into the queue and notifies admins | SATISFIED | Truth 3 above |
| REG-07 | 32-03 | Password/normalisation/verification-token code shared, not duplicated weaker | SATISFIED | Truth 4 above |
| SEC-01 | 32-03 | Enumeration-safe response + real owner notified | BLOCKED | CR-01 -- see gap. The real-owner-notification half works; the "indistinguishable response" half is broken under adversarial input. |
| SEC-02 | 32-03 | Existing per-IP rate limit covers tokenless path | SATISFIED | Truth 5 above; direct test `rateLimit.test.js:208` |
| SEC-03 | 32-01, 32-02, 32-03 | Note length-capped server-side + rendered safely everywhere shown (admin UI + notification email) | PARTIAL | Length cap satisfied (safe-direction, WR-08 caveat noted). Email escaping satisfied (`escapeHtml` applied and tested). "The admin UI" clause, named explicitly in the requirement text, is undelivered -- no admin UI exists yet to render the note at all, safely or otherwise. Recommend downgrading to partial/deferred until Phase 33's admin queue UI ships, at which point this requirement's UI-escaping half can be verified. |

No orphaned requirements: all 8 requirement IDs declared across the four plans (`grep "requirements:"`) match the 8 IDs REQUIREMENTS.md maps to "Phase 32", with no additional Phase-32-mapped ID left unclaimed by any plan.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/src/resolvers/user.resolver.js` | 249-260 | Unguarded DB write on the security-critical enumeration-silent branch, no pre-lookup `name` validation | Blocker | CR-01 -- see gap. This is the single finding that determines this phase's status. |
| `backend/src/resolvers/user.resolver.js` | 228-275 | Residual timing divergence: free path awaits a committed INSERT, taken path awaits nothing | Warning | WR-01. Weakens (does not defeat outright, given CR-01 already defeats it) the SEC-01 timing-safety claim; ~1.3ms median delta, near-disjoint distributions measured by the reviewer. |
| `backend/src/resolvers/user.resolver.js` | 249-260 | Raw ORM/MySQL error text (`Data too long for column 'name'`, `Validation error`) reaches an unauthenticated caller | Warning | WR-02, a direct consequence of CR-01's missing try/catch; discloses internal schema/ORM identity. |
| `backend/src/resolvers/user.resolver.js` | 152, 181-189, 249-260 | `name` accepted blank/whitespace-only on both branches; inconsistent with `updateUser`'s own `if (!trimmed) throw` rule in the same file | Warning | WR-03. Produces blank-named rows visible in the future admin queue UI and in notification email subjects/bodies. |
| `backend/src/resolvers/user.resolver.js` | 152, 155-218 | Invited branch destructures but never reads/validates/persists `relationshipNote`, silently discarding it (and skipping the 500-char cap) even though the GraphQL schema accepts it on every `register` call | Warning | WR-04. Silent data loss for an invitee who fills in the note field; inconsistency in what "reuse the same code" means for this one field. |
| `backend/src/resolvers/user.resolver.js` | 128-140 | `pendingApprovals`'s docstring claims "self-registrations" but the query has no Invitation-row filter, so unvouched invited registrants can double-count into both `pendingApprovals` and `pendingRegistrations` | Warning | WR-05. Contradicts its own documentation; untested by `pendingApprovals.test.js`. |
| `backend/src/resolvers/user.resolver.js`, `mailer.js` | 235-237, 449-453; `mailer.js:186-199` | No per-recipient throttle on `sendRegistrationAttemptEmail` or the D-12 admin fan-out, only the existing per-IP limiter | Warning | WR-06. Rotating-IP mail-bomb surface against a real account holder's inbox and against admin inboxes; burns sending reputation, not a confidentiality break. |
| `backend/src/services/mailer.js` | 41 | `renderHtml`'s `ctaUrl` interpolates into an `href` attribute completely unescaped -- the one interpolation site `escapeHtml`'s own docstring says it is not for | Warning | WR-07. Latent (every current caller passes a server-derived URL), but the shared template's contract is not enforced at the sink. |
| `backend/src/utils/relationshipNotePolicy.js` | 7 | `note.length > 500` counts UTF-16 code units, not characters; over-rejects astral input (400 emoji refused although the column would hold them) | Warning | WR-08. Safe-direction only (never permits overflow) -- Ge'ez script is BMP and unaffected -- but the cap does not mean what its comment claims. |
| `backend/src/resolvers/register.test.js` | 179-199 | Enumeration-silence test checks only the message + row count + notification call, not response-object equality or absence of free-path side effects on the taken path | Warning | WR-09. This is exactly the gap that let CR-01 ship with a fully green suite. |
| `backend/src/utils/relationshipNotePolicy.js` | (whole file) | No dedicated `.test.js`, unlike every sibling policy module (`escapeHtml.js`, `passwordPolicy.js`) | Warning | WR-10. Boundary (500/501), null/undefined/empty-string, and non-string-input behavior are unpinned outside one integration test. |
| `backend/migrations/manual/020-add-users-relationship-note.sql` | 26-27 | Not idempotent (`ADD COLUMN` without `IF NOT EXISTS`), no down-path, no boot-time guard if a target DB never received it | Warning | WR-11. Directly compounds CR-01: a fresh deploy that misses this manual step turns the oracle into "every free-email registration fails" while taken emails still silently succeed. Confirmed applied to the local dev DB used for this verification (independently re-queried), so not live in this environment today. |
| `backend/src/resolvers/user.resolver.js` | 38-59 | `inviterName`/`relationship` params of `notifyAdminsOfPendingRegistration` are dead this phase (only the self-registrant caller exists) | Info | IN-03. Documented forward-compatibility, acceptable as-is. |
| `backend/src/resolvers/user.resolver.js` | 455 | `verifyEmail` unconditionally mints a signed JWT for a still-`Pending` self-registrant | Info | IN-04. Inert today (`getUserFromRequest` rejects non-Active users), pre-existing pattern, blast radius increased by this phase's larger Pending population. |

No `TBD`/`FIXME`/`XXX` debt markers found in any file modified by this phase.

### Human Verification Required

None. Every must-have truth for this phase is either mechanically verifiable (and was verified, including live reproduction of the one failing truth) or already covered by the automated test suite. This is a backend-only phase with no new UI surface to eyeball.

### Gaps Summary

**One blocking gap (CR-01):** the phase's central security claim -- "an email that already has an account gets a response indistinguishable from one that does not" -- does not hold under adversarial input. I independently reproduced this against the live test database (not merely trusting 32-REVIEW.md's narrative): a 300-character `name` produces a success message for a taken email and a raw `"Data too long for column 'name' at row 1"` GraphQL error for a free email, in the exact same call shape. This is a one-request, unauthenticated existence oracle -- the precise attack SEC-01/D-08 exists to close -- and it survives a fully green test suite (473 passed, 3 skipped, independently re-run) because `register.test.js`'s enumeration test only exercises well-formed input. The same missing-validation root cause also: (a) creates a duplicate-insert race that leaks existence via a different error string, (b) would turn the entire tokenless path into an oracle on any deploy target where manual migration 020 was skipped, and (c) leaks raw ORM/DB error text to anonymous callers (WR-02). The fix is scoped and mechanical (validate `name` before the lookup, wrap the create in try/catch, return the identical message on failure) -- see 32-REVIEW.md's CR-01 section for a ready-to-adapt patch -- but it is not optional: Success Criterion 2 and requirement SEC-01 are not met as shipped.

**One documentation-accuracy gap (non-blocking to the phase's own ROADMAP success criteria, but worth correcting):** REQUIREMENTS.md marks REG-03 and SEC-03 fully `[x]` for Phase 32, but both requirements' full text includes an "admin UI" clause (REG-03: "shown to admins at approval time"; SEC-03: "rendered safely everywhere it is shown -- the admin UI ... included") that this backend-only phase does not and cannot deliver -- ROADMAP.md's own Phase 33 success criterion 3 explicitly owns "the admin queue lists each waiting account with ... relationship note." The backend/data half of both requirements is genuinely done (storage, GraphQL exposure, email escaping); the UI half is not. Recommend correcting REQUIREMENTS.md to reflect partial completion rather than a flat checkmark, so a reader does not assume an admin can already see the note in the UI today.

All four plans' own individual must-haves (schema signature, model field, escaping utility, mailer templates, D-13 admin-selection fix, D-12 wiring, `pendingApprovals` query) are genuinely implemented, tested, and wired -- this is not a stub/scaffolding phase. The gap is a single, specific, well-understood security defect in an otherwise substantially complete implementation, plus a requirement-tracking overclaim. Both are actionable without re-architecting any of the four plans' work.

---

_Verified: 2026-08-30T19:49:34Z_
_Verifier: Claude (gsd-verifier)_
