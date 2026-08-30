---
status: partial
phase: 31-invitations-become-admin-only
source: [31-VERIFICATION.md]
started: 2026-08-30T09:55:00Z
updated: 2026-08-30T09:55:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Confirm the '31-05, TOCTOU lock' test passes on CI (MySQL 8.4)

The test `refuses to promote a Pending registrant when the inviter is demoted to USER
concurrently with redemption (31-05, TOCTOU lock)` in
`backend/src/resolvers/verifyEmail.test.js` is `ctx.skip`-gated on `isMariaDB()`, so it never
runs on the local MariaDB dev database. CI runs MySQL 8.4, where the gate does not fire — that
is the only place its RED/GREEN distinction can currently be observed.

Both the executor and the verifier independently reproduced the same local limitation: MariaDB
raises `Record has changed since last read in table 'users'` at an unrelated *upstream*
statement (the admin-slot unindexed `COUNT(*) ... FOR UPDATE` full-table scan) before the code
path this fix touches is reached — byte-for-byte identical output in both the neutered and the
fixed state. `gh run list` shows no CI run yet for commits `39170c9`, `7ff6ef3`, `bef8b98`.

expected: >
  The test passes on CI. Optionally, for the full mutation-test-the-guard evidence the plan's
  third must-have demands: on a scratch branch revert `lock: t.LOCK.UPDATE` back to a plain
  `{ transaction: t }` in `verifyAndPromote` (`backend/src/resolvers/user.resolver.js:297-300`)
  and re-run on CI — exactly this one test should go red, matching the clean local result
  already obtained for the sibling `emailVerified` guard.
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
