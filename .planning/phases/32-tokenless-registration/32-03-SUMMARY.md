---
phase: 32-tokenless-registration
plan: 03
subsystem: auth
tags: [graphql, resolver, tdd, bcrypt, enumeration-defense, rate-limit]

# Dependency graph
requires:
  - phase: 32-01
    provides: "users.relationshipNote column + User model's explicit-flag beforeCreate guard (models.User.create(values, { passwordAlreadyHashed: true }))"
  - phase: 32-02
    provides: "mailer.js's sendRegistrationAttemptEmail (D-10 owner-notification template) + escapeHtml-protected sendPendingRegistrationEmail self-registration copy branch"
provides:
  - "register(token: String, name: String!, email: String, password: String!, relationshipNote: String): RegisterPayload! -- tokenless self-registration is live (REG-02, D-01)"
  - "assertRelationshipNoteLength(note) -- 500-char server-side cap (backend/src/utils/relationshipNotePolicy.js)"
  - "Enumeration-silent, timing-safe tokenless register branch: identical message on taken/free outcomes, bcrypt computed before the existing-user lookup (SEC-01, D-08, D-09)"
  - "Invited branch proven byte-identical under a hostile-email adversarial test (D-02)"
affects: [32-04]

# Tech tracking
tech-stack:
  added: []
  patterns: ["single register field branching on token presence (if (token) {...} else {...}), no second GraphQL mutation", "precompute-before-lookup timing-safety pattern (bcrypt.hash before the existing-user SELECT)"]

key-files:
  created:
    - backend/src/utils/relationshipNotePolicy.js
  modified:
    - backend/src/schemas/user.schema.js
    - backend/src/resolvers/user.resolver.js
    - backend/src/resolvers/register.test.js
    - backend/src/resolvers/rateLimit.test.js

key-decisions:
  - "D-01: register stays a single GraphQL field with token/email/relationshipNote all optional, rather than a second mutation -- SEC-02's rate limit and every existing invited-branch guarantee apply by construction"
  - "D-02: the invited branch's local `const email = invitation.invitedEmail` deliberately shadows the destructured `email` argument -- proven by a hostile-email adversarial test (valid token + attacker@evil.com still lands the account at the invitation's own invitedEmail)"
  - "D-09: bcrypt.hash(password, 12) runs before models.User.findOne in the tokenless branch so both taken/free outcomes pay the same cost; proven by a call-order spy test with an explicit guard that the spy actually intercepted the call before comparing invocationCallOrder"
  - "REG-03 only partially closed by this plan: relationshipNote is stored (this plan), but 'shown to admins at approval time' is Plan 32-04's job -- left REG-03 unchecked in REQUIREMENTS.md, following Plan 32-01's precedent of not asserting a requirement end-to-end before it actually is"

requirements-completed: [REG-02, REG-07, SEC-01, SEC-02]

# Metrics
duration: ~15min active work (TDD red/green + regression coverage)
completed: 2026-08-30
---

# Phase 32 Plan 03: Tokenless `register` Mutation Summary

**`register` now accepts a call with no invitation token, creating a Pending/unverified account from the caller's own email — enumeration-silent and timing-safe on that branch only, with the invited branch proven byte-identical under a hostile-email adversarial test.**

## Performance

- **Duration:** ~15 min active work across 3 tasks (schema + policy util, TDD resolver implementation, rate-limit + note-edge-case regression coverage)
- **Started:** 2026-08-30T20:40:33+02:00
- **Completed:** 2026-08-30T20:55:16+02:00
- **Tasks:** 3 (1 auto, 1 auto/tdd, 1 auto/tdd)
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments

- `register`'s GraphQL signature changed to `register(token: String, name: String!, email: String, password: String!, relationshipNote: String): RegisterPayload!` — token and email both optional, name and password stay required (D-01). `User` type gained `relationshipNote: String` for Plan 32-04's `pendingApprovals` query.
- New `backend/src/utils/relationshipNotePolicy.js` exports `assertRelationshipNoteLength`, mirroring `passwordPolicy.js`'s exact single-guard-clause shape, enforcing the 500-char cap that matches migration 020's `VARCHAR(500)` column (D-05).
- `register`'s body now branches on `if (token) { ...unchanged invited path... } else { ...new tokenless path... }`. The invited path's every line is byte-identical to before — including the local `const email = invitation.invitedEmail` that shadows the caller-supplied `email` argument, proven by a new adversarial test (valid token + `attacker@evil.com` still creates the account at the invitation's own `invitedEmail`, D-02).
- Tokenless branch: validates the relationship note length, requires `email` (`'Email is required.'` when absent), normalizes it, computes `bcrypt.hash(password, 12)` **before** the existing-user lookup (D-09 — proven by a call-order spy test, not wall-clock timing), then either (a) taken email: fires `sendRegistrationAttemptEmail` at the *resolved existing account's own* email/name fire-and-forget, returns the identical success message, writes no row and no audit log; or (b) free email: creates a `Pending`/unverified `USER` via `models.User.create(values, { passwordAlreadyHashed: true })` — reusing Plan 32-01's explicit-flag guard so the precomputed hash is never re-hashed — reusing the exact same `createVerificationToken`/`hashVerificationToken`/`verificationTokenExpiry`/`writeAuditLog` calls the invited path uses (REG-07), no second implementation.
- Both outcomes return the byte-identical literal string `'Registration received. Verify your email to activate your account.'` (D-08, SEC-01).
- SEC-02 proven directly: a new rate-limit test drives 6 tokenless register calls from the same IP and asserts the 6th is blocked with `TOO_MANY_REQUESTS_MESSAGE` — inherited structurally since the rate-limit plugin keys on the GraphQL field name (`register`) before the resolver runs at all, so no separate/weaker limiter path exists.
- D-05/D-06/F-01 regression tests: a 501-char note is rejected server-side with zero rows created; an omitted note is accepted and stored as `null`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema signature (D-01) + relationshipNotePolicy (D-05) + confirm no frontend change is needed** — `d437362` (feat)
2. **Task 2 (TDD, RED): failing tests for the tokenless register branch** — `a2c95c1` (test)
   **Task 2 (TDD, GREEN): implement register's tokenless branch** — `2d7e778` (feat)
3. **Task 3: SEC-02 tokenless rate-limit + D-05/D-06 note edge-case coverage** — `1d43d03` (test)
4. **Fix: reword a resolver comment that broke the plan's own D-03 grep verification** — `7ae68ab` (fix, discovered during final verification, not a separate task)

_Task 2's TDD gate is complete: `test(...)` (a2c95c1) then `feat(...)` (2d7e778), no refactor step needed. Task 3 is labeled `tdd="true"` in the plan but its behavior (note-length cap, note-optionality, rate-limit inheritance) was already implemented by Task 2's resolver body — see TDD Gate Compliance below._

## Files Created/Modified

- `backend/src/utils/relationshipNotePolicy.js` — new, exports `assertRelationshipNoteLength`
- `backend/src/schemas/user.schema.js` — `register`'s signature widened; `User.relationshipNote: String` added
- `backend/src/resolvers/user.resolver.js` — `register` wraps the unchanged invited-path body in `if (token) {...}`, adds the tokenless `else` branch; new imports (`bcrypt`, `assertRelationshipNoteLength`, `sendRegistrationAttemptEmail`)
- `backend/src/resolvers/register.test.js` — `REGISTER_MUTATION` updated to the new optional-arg shape; new `describe('register (tokenless)', ...)` block (7 tests); D-02 adversarial test added to the existing invited-branch describe block
- `backend/src/resolvers/rateLimit.test.js` — `REGISTER_MUTATION` updated to match; new tokenless SEC-02 test added to the existing `describe('register rate limiting (RATE-02)', ...)` block

## Decisions Made

- Kept `register` as a single GraphQL field rather than adding a second mutation — every existing guarantee (rate limit, schema validation) applies to the tokenless path by construction, with zero duplicated enforcement surface (D-01).
- Used `if (token) {...} else {...}` rather than an early return, matching the plan's literal instruction and keeping the invited branch's scope (and its `email` shadow) visually contained.
- Did not mark REG-03 complete in `REQUIREMENTS.md` — its text requires the note be "shown to admins at approval time," which is Plan 32-04's job; this plan only closes the storage half. Marked REG-02, REG-07, SEC-01, SEC-02 complete (SEC-03 was already marked by Plan 32-02).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Explanatory comment literally contained the string being grepped for by the plan's own D-03 verification**
- **Found during:** Final plan-level verification (`grep -c "PUBLIC_REGISTRATION_ENABLED" -r backend/` was specified to return 0)
- **Issue:** The `register` resolver's leading comment explained "No `PUBLIC_REGISTRATION_ENABLED` flag exists anywhere" — while true, the literal string match made the plan's own automated verification command return a false positive (count 1, not 0).
- **Fix:** Reworded the comment to convey the same guarantee ("No environment-gated feature switch guards this branch") without the literal token.
- **Files modified:** `backend/src/resolvers/user.resolver.js`
- **Commit:** `7ae68ab`

**2. [Rule 3 - Blocking] Full backend suite showed 1 failure when run concurrently with a separate scoped test invocation**
- **Found during:** Post-Task-2 due-diligence full-suite run
- **Issue:** `npm test -w backend` (background) and a scoped `npm test -w backend -- <2 files>` run I started immediately after both hit the same MySQL test database's schema-sync path simultaneously, producing `Table 'portofolio_test.family_members' doesn't exist` in one unrelated test file (`familyMember.addSpouse.test.js`) — a known concurrent-DB-access flake pattern (see project memory: "Backend test resetTables flake").
- **Fix:** Waited for the background run to finish, then re-ran the full suite once, in isolation: 464/464 passed, 3 skipped (known engine-gated skips). Confirmed this was a flake from running two vitest processes against the same test DB at once, not a real regression from this plan's changes.
- **Files modified:** none (no code change — environmental/procedural)
- **Verification:** full suite green in isolation

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking-environmental)
**Impact on plan:** No scope creep. Both deviations were caught and closed during this plan's own verification steps, not carried forward.

## TDD Gate Compliance

- **Task 2** (`tdd="true"`): full RED → GREEN cycle. RED commit `a2c95c1` added 5 new tests against the tokenless behavior; all 5 failed against the invited-only resolver (confirmed: `TypeError`/wrong-message failures, not accidental passes). GREEN commit `2d7e778` implemented the tokenless branch; all 14 tests in `register.test.js` passed afterward. No refactor step needed.
- **Task 3** (`tdd="true"`): the plan's own action text scopes Task 3 to *adding regression tests* for behavior Task 2's implementation already covers (Task 2's action explicitly includes `assertRelationshipNoteLength` as its first tokenless-branch step and `relationshipNote || null` in the create call). When Task 3's new tests (SEC-02 rate-limit, D-05 note-too-long, D-06 note-omitted) were written, they passed on first run with no further implementation change — this is the plan's intended shape (proving already-built behavior with a direct test "not argument alone," per the plan's own `<done>` criterion for Task 3), not an accidental RED-phase pass against unwritten code. No implementation commit was needed for Task 3; only a single `test(...)` commit (`1d43d03`).

## Issues Encountered

None beyond the two auto-fixed deviations above.

## User Setup Required

None — no external service configuration required. `bcryptjs` is an existing direct dependency already used elsewhere in this codebase; no package installs occurred in this plan.

## Next Phase Readiness

- Plan 32-04 can now build `pendingApprovals`/admin-facing display against a real `relationshipNote` field exposed on the `User` GraphQL type and a working tokenless `register` mutation creating real `Pending` rows.
- REG-03 remains open in `REQUIREMENTS.md`, explicitly deferred to Plan 32-04 (admin-facing display of the stored note).
- Full backend suite confirmed green in isolation (464/464 non-skipped tests, 0 failures) — no regression risk carried forward.

---
*Phase: 32-tokenless-registration*
*Completed: 2026-08-30*

## Self-Check: PASSED

All claimed files verified present on disk:
- FOUND: backend/src/utils/relationshipNotePolicy.js
- FOUND: backend/src/schemas/user.schema.js
- FOUND: backend/src/resolvers/user.resolver.js
- FOUND: backend/src/resolvers/register.test.js
- FOUND: backend/src/resolvers/rateLimit.test.js
- FOUND: .planning/phases/32-tokenless-registration/32-03-SUMMARY.md

All claimed commit hashes verified present in git log:
- FOUND: d437362 (feat: schema signature + relationshipNotePolicy)
- FOUND: a2c95c1 (test: tokenless register RED)
- FOUND: 2d7e778 (feat: tokenless register GREEN)
- FOUND: 1d43d03 (test: SEC-02 + D-05/D-06 coverage)
- FOUND: 7ae68ab (fix: D-03 grep-match comment reword)
