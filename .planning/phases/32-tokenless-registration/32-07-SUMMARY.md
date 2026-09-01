---
phase: 32-tokenless-registration
plan: 07
subsystem: auth
tags: [graphql, sequelize, mysql, vitest, privilege-escalation, admin-bootstrap, env-config]

# Dependency graph
requires:
  - phase: 32-tokenless-registration (plan 32-05)
    provides: hardened tokenless register branch (uniform response, name validation) whose D-03 "no feature flag on register" lock made the zero-admin bootstrap reachable anonymously
provides:
  - "env.adminEmail: optional ADMIN_EMAIL env var, lowercase/trim-normalized at load, null when unset or blank (fails closed)"
  - "verifyEmail zero-admin ADMIN bootstrap gated on an exact env.adminEmail match -- promotes nobody when ADMIN_EMAIL is unset"
  - "updateUser last-administrator guard extended to cover email changes, which de-verify the address and would transiently reopen the zero-admin window"
  - "CR-01 regression coverage in verifyEmail.test.js (unset/mismatch deny, match promotes) and updateUser.test.js (sole-admin blocked, backup-admin allowed, unverified-admin unaffected)"
  - "ADMIN_EMAIL plumbed (empty, commented) through all four env files so the fail-closed default has a discoverable open path"
affects: [32-08, 33-admin-approval-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fail-closed env-gated privilege bootstrap: an optional env var is the SOLE eligibility key for a self-service privilege grant; unset means nobody qualifies, never everybody (revives Phase 11's deferred VERIFY-F1)"
    - "Guard-scope symmetry: the last-administrator invariant is enforced on every path that can reduce the verified-admin count, not only the obvious role-change path -- an email change de-verifies and therefore decrements too"

key-files:
  created: []
  modified:
    - backend/src/config/env.js
    - backend/src/resolvers/user.resolver.js
    - backend/src/resolvers/verifyEmail.test.js
    - backend/src/resolvers/updateUser.test.js
    - README.md
    - env/local.env
    - env/remote.env
    - env/test.env
    - env/local.container.env

key-decisions:
  - "Gated on an exact equality match against the stored (already-normalized) user.email rather than a pattern/domain match, so the eligible account set is exactly one address an operator names in advance"
  - "Narrowed the pre-existing VERIFY-04 two-racer test's central assertion and documented why: with the ADMIN_EMAIL gate in place, 'exactly one of two racers becomes ADMIN' is now guaranteed by email-uniqueness plus the gate INDEPENDENT of the FOR UPDATE lock, so that assertion no longer proves lock correctness. The test now asserts the narrower claim it can still support (both racers complete without a raw deadlock, both get a usable session); lock-order contention remains proven by the preceding serialization test, which asserts no role."
  - "Kept the updateUser guard even though the ADMIN_EMAIL gate alone reduces the risk: an operator whose ADMIN_EMAIL no longer matches any account after this exact change would also be locked out of the legitimate bootstrap path"

requirements-completed: [REG-02]

# Metrics
duration: ~35min (interrupted mid-plan; closed out by orchestrator)
completed: 2026-09-01
---

# Phase 32 Plan 07: Close CR-01 Privilege Escalation Summary

**Gated `verifyEmail`'s zero-admin ADMIN bootstrap on an exact `ADMIN_EMAIL` match (fail-closed when unset) and extended `updateUser`'s last-administrator guard to email changes -- closing both confirmed windows through which an anonymous tokenless self-registrant could claim the ADMIN role.**

## Performance

- **Tasks:** 3 (all committed atomically)
- **Files modified:** 9
- **Test suite:** 503 passed / 3 skipped (67 files) on the merged result

## Accomplishments

- **Closed CR-01 window (a) — fresh deployment.** Before Phase 32, reaching `verifyEmail` at all required an admin-issued invitation (Phases 13-31), which is what made "first verified account becomes ADMIN" safe. Phase 32 opened `register` to anonymous callers with no feature flag (D-03, locked), turning that into a live race an internet caller could win. The bootstrap now promotes only the account whose stored email exactly matches `env.adminEmail`, and promotes nobody when `ADMIN_EMAIL` is unset.
- **Closed CR-01 window (b) — existing deployment.** `updateUser` let the sole verified admin change their own email, which unconditionally sets `emailVerified = false`, dropping the verified-admin count to zero and transiently reopening the bootstrap to the internet. The pre-existing last-administrator guard only covered role changes. It now covers email changes too, mirroring the role guard's exact shape (`Op.ne`, `role: 'ADMIN'`, `emailVerified: true`).
- **Preserved a safe, tested path to a first admin.** An operator who sets `ADMIN_EMAIL` to their own address before first deploy is still promoted on verifying that exact address, with status transitions, token issuance, and the audit-log-free bootstrap path unchanged.
- **Made that path discoverable, not just documented.** `ADMIN_EMAIL=` (empty, with an explanatory comment) is present in all four env files, so neither local dev nor the live Hetzner deployment is silently left with no route to an admin by the fail-closed default. README's two "first registered account becomes ADMIN" claims were corrected.

## Mutation-test evidence

Both guards were verified falsifiable by neutering them and confirming the specific test goes RED, then restoring and confirming GREEN. Both new tests were also confirmed to actually *run* by name in verbose reporter output (not silently skipped).

| Guard | Mutation applied | Result |
|-------|-----------------|--------|
| `verifyEmail` ADMIN_EMAIL gate | Reverted to `if (Number(adminCount) === 0)` | ✗ RED — both "does not promote ... when ADMIN_EMAIL is unset" and "... set to a different address" failed. The legitimate-path test correctly stayed green. |
| `updateUser` last-admin email guard | Deleted the `otherVerifiedAdmins` block entirely | ✗ RED — "blocks the sole verified administrator from changing their own email" failed. The two negative-control tests correctly stayed green. |

Restored to `HEAD` after each mutation; `git diff` confirmed clean.

## Regression check

- The invited-registrant auto-activation path (Phase 31 D-04/D-05) is provably unaffected: its pre-existing test "promotes a Pending invited registrant to Active on verification (SC-3)" passes unmodified by this plan.
- Full backend suite: 503 passed, 3 skipped, 0 failed.

## Deviations

- **Plan executed under interruption.** The executor agent completed and atomically committed all 3 tasks in its worktree but was interrupted before writing SUMMARY.md. Per the safe-resume gate's "close out manually" path, the orchestrator inspected the three commits, merged them, ran the full suite, performed the mutation testing the agent never reached, and authored this SUMMARY. No task work was redone or re-committed.
- The executor's worktree had no `node_modules` (npm workspaces install at the repo root), so it could not have run the test suite itself. All test and mutation evidence above was produced post-merge on `main`.

## Known limitations

- The VERIFY-04 two-racer test is skipped on the local MariaDB engine (pre-existing, documented in KNOWN-ISSUES.md); it runs and must pass on CI (MySQL 8.4). This plan narrowed its assertions but did not change its skip condition.
- `ADMIN_EMAIL` is read once at boot. Changing it requires a backend restart — acceptable for a bootstrap-only control.
