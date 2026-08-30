---
phase: 32-tokenless-registration
plan: 04
subsystem: auth
tags: [graphql, resolver, tdd, admin-notification, authz]

# Dependency graph
requires:
  - phase: 32-01
    provides: "users.relationshipNote column + User model field, live on the dev DB and test schema"
  - phase: 32-03
    provides: "register's tokenless branch creating real Pending/unverified users with a relationshipNote and no Invitation row"
provides:
  - "notifyAdminsOfPendingRegistration(models, { user, relationshipNote, inviterName, relationship }) -- plain-field notifier, D-13 admin-selection fix (role: ADMIN, status: Active, emailVerified: true)"
  - "verifyEmail notifies admins exactly when a verified account has NO Invitation row and is still Pending after commit (D-12)"
  - "pendingApprovals: [User!]! -- admin-only query returning Pending+email-verified self-registrations, including null-relationshipNote rows (D-11, REG-05)"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: ["associatedInvitation vs promotedInvitation -- two deliberately distinct transaction-scoped signals for 'has an Invitation row at all' vs 'was actually promoted by one'"]

key-files:
  created:
    - backend/src/resolvers/pendingApprovals.test.js
  modified:
    - backend/src/resolvers/user.resolver.js
    - backend/src/schemas/user.schema.js
    - backend/src/resolvers/verifyEmail.test.js

key-decisions:
  - "D-12: notifyAdminsOfPendingRegistration's signature changed to plain fields (user, relationshipNote, inviterName, relationship) rather than an invitation object -- lowest-friction refactor since it now matches sendPendingRegistrationEmail's own plain-field signature it forwards to; only the self-registrant caller (verifyEmail) is wired up this phase, the invited register branch still does not call it"
  - "D-13: admin-selection where-clause gained emailVerified: true (role: 'ADMIN', status: 'Active', emailVerified: true) -- the ONLY change to that where-clause; requireAdmin/isFunctioningAdmin/updateUser's last-administrator count were explicitly left untouched, per Phase 31's 31-05 scope ruling"
  - "associatedInvitation is captured unconditionally inside verifyAndPromote's transaction (set to whatever the Invitation.findOne lookup returns, even null), deliberately distinct from promotedInvitation which stays null unless the vouch actually succeeds -- verifyEmail's D-12 notifier gate reads associatedInvitation, never promotedInvitation, so an invited-but-unvouched registrant is correctly excluded from notification without being confused for a self-registrant"
  - "pendingApprovals lives in user.schema.js/user.resolver.js (not a separate extend type Query file) since the field returns User data -- more consistent with users/unlinkedUsers than with invitation.schema.js's own extend-type pattern"

requirements-completed: [REG-03, REG-05, REG-06]

# Metrics
duration: ~12min active work (3 tasks, 2 full TDD red/green cycles)
completed: 2026-08-30
---

# Phase 32 Plan 04: Admin Notification + `pendingApprovals` Query Summary

**A self-registered account becomes visible and actionable to admins the moment its owner verifies their email — `pendingApprovals` surfaces it (including a blank note) and `notifyAdminsOfPendingRegistration` emails every Active, email-verified admin, closing D-13's fourth divergent admin-selection gap.**

## Performance

- **Duration:** ~12 min active work across 3 tasks (plain-field refactor + D-13 fix, TDD wiring into verifyEmail, TDD pendingApprovals query)
- **Started:** 2026-08-30T19:07:04Z
- **Completed:** 2026-08-30T19:17:50Z
- **Tasks:** 3 (1 auto, 2 auto/tdd)
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- `notifyAdminsOfPendingRegistration`'s signature changed from `(models, { invitation, user })` to plain fields `(models, { user, relationshipNote, inviterName, relationship })` — a self-registrant caller (no `invitation` object) can now call it directly, matching `sendPendingRegistrationEmail`'s own plain-field shape it forwards to (D-12 discretion).
- D-13 closed: the admin-selection where-clause is now `{ role: 'ADMIN', status: 'Active', emailVerified: true }` — an admin whose own email is unverified no longer receives the notification, matching every other admin guard in this codebase (`requireAdmin`, `isFunctioningAdmin`, `updateUser`'s last-administrator count). This is the exact class of gap Phase 31's `vouchedByAdmin` fix closed, now closed for this fourth divergent admin definition.
- `verifyEmail`'s transaction now captures `associatedInvitation` — whether ANY `Invitation` row exists for the verifying user, independent of vouching outcome — as a signal deliberately distinct from the pre-existing `promotedInvitation` (which stays `null` unless the vouch actually succeeds, even when an Invitation row exists). After `user.reload()`, a fire-and-forget call to `notifyAdminsOfPendingRegistration` fires exactly when `!associatedInvitation && user.status === 'Pending'` — never for an invited registrant (always has an Invitation row, promoted or not) and never for an already-Active account.
- New admin-only `pendingApprovals: [User!]!` query (`user.schema.js` + `user.resolver.js`) returns exactly `{ status: 'Pending', emailVerified: true }` users, mirroring the `users`/`unlinkedUsers` `requireAdmin`-then-single-`findAll` shape and reusing the same two-condition eligibility rule `invitation.resolver.js`'s `pendingRegistrations` already applies as a sub-query. A `null` `relationshipNote` is explicitly proven to still appear (F-01) — an empty note is a normal state, not filtered out. Coexists with the untouched `pendingRegistrations` query (D-11).
- `User.relationshipNote` is now exposed to `pendingApprovals`'s admin caller, closing REG-03's remaining half ("shown to admins at approval time") — Plan 32-03 only closed the storage half.

## Task Commits

Each task was committed atomically:

1. **Task 1: `notifyAdminsOfPendingRegistration` plain-field refactor + D-13 admin fix** — `ccc7beb` (refactor)
2. **Task 2 (TDD, RED): failing D-12/D-13 admin-notification tests for `verifyEmail`** — `f1c3750` (test)
   **Task 2 (TDD, GREEN): wire D-12 into `verifyEmail`** — `1d80af9` (feat)
3. **Task 3 (TDD, RED): failing `pendingApprovals` query coverage** — `16b1ea9` (test)
   **Task 3 (TDD, GREEN): `pendingApprovals` query implementation** — `eff5b3e` (feat)

_Both TDD tasks have the expected two commits each: `test(...)` (RED) then `feat(...)` (GREEN), no refactor step needed on either. Task 2's RED run showed 2 of 4 new tests failing against the pre-wiring resolver (the "was called" assertions); the 2 "was NOT called" assertions passed trivially at RED (correct, since the notifier had no caller yet) and continued to pass at GREEN alongside the newly-passing "was called" assertions._

## Files Created/Modified

- `backend/src/resolvers/user.resolver.js` — `notifyAdminsOfPendingRegistration` refactored to plain-field args + D-13 where-clause fix; `verifyEmail` gained `associatedInvitation` tracking + the D-12 fire-and-forget notifier call; `Query.pendingApprovals` added
- `backend/src/schemas/user.schema.js` — `pendingApprovals: [User!]!` added to `type Query`
- `backend/src/resolvers/verifyEmail.test.js` — new `vi.mock('../services/mailer.js', ...)` block (this file had none before — `verifyEmail` never called the mailer prior to this plan) + `beforeEach(() => vi.clearAllMocks())` + new `describe('admin notification on self-registration verification (D-12, D-13)', ...)` block (4 tests)
- `backend/src/resolvers/pendingApprovals.test.js` — new colocated test file, 5 tests covering the query's full `<behavior>` contract

## Decisions Made

- Kept `notifyAdminsOfPendingRegistration` as a single parametrized function rather than splitting into two (invited-caller vs self-registrant-caller) — matches this codebase's established "one function per notifier" convention (`sendPendingRegistrationEmail` itself serves one template regardless of caller), avoiding duplicated `admins.length === 0` guard / `Promise.all` dispatch logic.
- `associatedInvitation` is read (not `promotedInvitation`) for D-12's notification gate specifically because an invited-but-unvouched registrant (has an `Invitation` row, stays `Pending`) must NOT be treated as a self-registrant and notified — `promotedInvitation` alone cannot distinguish "no invitation exists" from "an invitation exists but vouching failed"; both leave it `null`.
- `pendingApprovals` placed in `user.schema.js`/`user.resolver.js` rather than a cross-file `extend type Query` block, since the field's data and filter shape live entirely on `User`, matching `users`/`unlinkedUsers`'s home rather than `invitation.schema.js`'s pattern.
- Marked REG-03, REG-05, REG-06 complete in `REQUIREMENTS.md` — all three are now genuinely closed end-to-end by this plan (REG-03's "shown to admins at approval time" half was the one piece Plan 32-03 explicitly left open).

## Deviations from Plan

None — plan executed exactly as written. All acceptance criteria greps and test assertions matched on the first implementation attempt for every task; no auto-fixes, no blocking issues, no architectural questions.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required, no package installs.

## Threat Flags

None — every trust boundary touched by this plan (`verifyEmail`'s post-commit notifier, `pendingApprovals`'s admin-only read) is exactly the boundary the plan's own `<threat_model>` (T-32-13 through T-32-16) already covers; no new surface introduced beyond what was planned.

## Next Phase Readiness

- Full backend suite confirmed green in isolation: 65/65 test files, 473/473 non-skipped tests, 0 failures, 3 skips (pre-existing MariaDB-local-vs-MySQL-8.4-CI/prod engine-gated skips, documented in `KNOWN-ISSUES.md`, unrelated to this plan).
- Phase 32's backend work is now feature-complete against its own plan set (32-01 through 32-04): migration + guard, mailer escaping, tokenless `register`, and the admin-facing approval-queue/notification loop this plan closes.
- No frontend consumer of `pendingApprovals` exists yet — this plan is backend-only per its own scope (schema + resolver + tests); wiring an admin UI surface against this query is out of this plan's scope.

---
*Phase: 32-tokenless-registration*
*Completed: 2026-08-30*
