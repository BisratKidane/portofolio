---
phase: 31-invitations-become-admin-only
plan: 02
subsystem: auth
tags: [graphql, sequelize, transaction, invitations, apollo, vitest]

# Dependency graph
requires:
  - phase: 30-approval-moves-to-the-account
    provides: "approval.resolver.js's transactional dual-row update shape (target.update/invitation.update inside sequelize.transaction), which this plan's promotion reuses a trimmed subset of"
provides:
  - "verifyEmail promotes an invited, Pending registrant to Active inside its existing transaction, keyed on Invitation.registeredUserId, guarded to only ever promote from Pending (never resurrecting Rejected/Disabled)"
  - "The promotion commits before verifyEmail's outer user.reload()/return, so the mutation response always reflects the post-commit Active status in the same round-trip"
  - "A fire-and-forget invitation.activated audit row for every auto-activation"
  - "register no longer emails admins on the invited path and its success message no longer promises admin review"
affects: [32-tokenless-registration, 33-account-shaped-approval-queue]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Auto-activation guard: a two-step Invitation.findOne(registeredUserId) inside an existing transaction, followed by a conditional User.update(where: { id, status: 'Pending' }) -- promotes only from Pending, silently no-ops otherwise (no thrown error, since verification itself must still succeed for a Rejected/Disabled account)"
    - "Deadlock-retry-safe promotion flag: promotedInvitation is reset to null at the top of the catch block before a retry, since a first attempt that threw never committed"

key-files:
  created: []
  modified:
    - backend/src/resolvers/user.resolver.js
    - backend/src/resolvers/verifyEmail.test.js
    - backend/src/resolvers/register.test.js

key-decisions:
  - "Promotion keys on Invitation.registeredUserId alone, never on Invitation.status (D-05/D-08) -- Invitation.status intentionally stays 'Registered' forever on the invited path, so gating on the FK is the only correct lookup"
  - "No approvedAt/approvedBy stamp and no Invitation.status write on promotion (D-08/D-12) -- nobody decided; the admin vouched at invite time, so approval.resolver.js's approve-specific fields don't apply here"
  - "register's success message drops the admin-review promise (D-13): 'Registration received. Verify your email to activate your account.'"
  - "notifyAdminsOfPendingRegistration's function definition and sendPendingRegistrationEmail import are left completely untouched -- only the call site inside register is removed, since Phase 32 reuses both for self-registration"

requirements-completed: [INVITE-03]

# Metrics
duration: 35min
completed: 2026-08-28
---

# Phase 31 Plan 02: verifyEmail Auto-Activation Summary

**`verifyEmail` promotes an invited, Pending registrant straight to Active inside its existing transaction via a registeredUserId-keyed Invitation lookup, with `register` no longer emailing admins or promising a review it will never perform.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-08-28T16:19:00Z (approx, first Read call)
- **Completed:** 2026-08-28T16:29:41Z
- **Tasks:** 2 completed
- **Files modified:** 3

## Accomplishments
- `verifyEmail`'s transaction now looks up the matching `Invitation` by `registeredUserId` and conditionally promotes the account from `Pending` to `Active` in the same commit as token consumption and the ADMIN-slot decision — no second round trip, no window where the response could describe a stale `Pending` account (F-03).
- `Rejected`/`Disabled` invited accounts that re-verify their email keep their status — verification succeeds, promotion is silently skipped (D-06), pinned by two dedicated tests.
- `Invitation.status` is never touched by the promotion (D-08) — confirmed by a dedicated test reading the row back after promotion.
- A fire-and-forget `invitation.activated` audit row is written after the transaction commits, giving the same "why did this become Active" answerability as the existing `user.approved`/`user.rejected` audit trail.
- `register` no longer calls `notifyAdminsOfPendingRegistration` on the invited path and its success message stops promising admin review, while the helper function and its mailer import stay untouched for Phase 32.

## Task Commits

Each task was committed atomically (TDD: test → feat):

1. **Task 1: verifyEmail Pending -> Active promotion** — RED `b8dd8e4` (test), GREEN `cc30db0` (feat)
2. **Task 2: register drops admin notification, reworded message** — RED `656c743` (test), GREEN `a353f80` (feat)

**Plan metadata:** commit pending (this SUMMARY + STATE/ROADMAP are handled by the orchestrator after merge, per worktree isolation)

## Files Created/Modified
- `backend/src/resolvers/user.resolver.js` — `verifyEmail`'s transaction gains the D-04/D-05/D-06/D-07 promotion + `invitation.activated` audit call; `register` drops its `notifyAdminsOfPendingRegistration` call and reworded its success message (D-11, D-13)
- `backend/src/resolvers/verifyEmail.test.js` — added `status` to the mutation's selected fields; added SC-3 happy-path promotion test, two D-06 non-resurrection tests (Rejected, Disabled), and a D-08 Invitation.status-unchanged assertion
- `backend/src/resolvers/register.test.js` — flipped the admin-notification assertion to `not.toHaveBeenCalled()`, renamed the test, and pinned `data.register.message` to its exact new wording

## Decisions Made
- Promotion lookup uses a plain `models.Invitation.findOne({ where: { registeredUserId: user.id }, transaction: t })` with no row lock — unlike `approveUser`'s TOCTOU-sensitive guard, nothing else can concurrently re-decide an invitation mid-verification, so the lock ceremony from `approval.resolver.js` doesn't apply here (per 31-PATTERNS.md's Shared Patterns section).
- `promotedInvitation` is declared in the outer resolver scope and explicitly reset to `null` at the top of the deadlock-retry `catch` block, since a first attempt that threw never actually committed anything.

## Deviations from Plan

None - plan executed exactly as written. Both tasks matched their `<action>` specifications precisely; no architectural changes, no missing critical functionality beyond what the plan already specified, and no blocking issues required a fix outside the plan's scope.

## Issues Encountered

The shared backend test database (`portofolio_test`) is contended by other parallel worktree-isolated executor agents also running `sequelize.sync({ force: true })`/`sequelize.drop()` in `backend/test/globalSetup.js` during this same window. This produced several transient `Table '...' doesn't exist` failures unrelated to this plan's code — each resolved on retry once the sibling agent's own sync/drop cycle completed. All required verification commands (`verifyEmail.test.js`, `register.test.js`, plus `approveReject.test.js` and `createInvitation.test.js` for regression coverage) ultimately passed cleanly: 40/41 passed, 1 skipped (MariaDB-gated, expected per KNOWN-ISSUES.md).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- INVITE-03 is now provably true at the resolver layer: an invited, `Pending` registrant who verifies their email is handed back an `Active`-status user and a working token in the same call, with zero admin mutation in between.
- Phase 32 (tokenless self-registration) can safely reuse `notifyAdminsOfPendingRegistration`/`sendPendingRegistrationEmail` exactly as they are — this plan deliberately left both untouched.
- Phase 33 (account-shaped approval queue) inherits an `Invitation.status` that stays `'Registered'` forever on the invited path (D-08) and a fresh `invitation.activated` audit action alongside the existing `invitation.registered`/`user.approved`/`user.rejected` entries.
- Not addressed by this plan (belongs to 31-01 or a sibling plan in this same phase): `createInvitation`/`myInvitations` guard swaps to `requireAdmin`, the `/invitations` route/nav ADMIN-gating, and `pendingRegistrations`' D-09 filter narrowing. This plan's scope was strictly INVITE-03 (verifyEmail promotion + register cleanup) per its frontmatter `requirements: [INVITE-03]`.

---
*Phase: 31-invitations-become-admin-only*
*Completed: 2026-08-28*

## Self-Check: PASSED

- FOUND: backend/src/resolvers/user.resolver.js
- FOUND: backend/src/resolvers/verifyEmail.test.js
- FOUND: backend/src/resolvers/register.test.js
- FOUND: .planning/phases/31-invitations-become-admin-only/31-02-SUMMARY.md
- FOUND: commit b8dd8e4 (test: RED, Task 1)
- FOUND: commit cc30db0 (feat: GREEN, Task 1)
- FOUND: commit 656c743 (test: RED, Task 2)
- FOUND: commit a353f80 (feat: GREEN, Task 2)
- FOUND: commit f9f13c2 (docs: SUMMARY.md)
