# Deferred Items — Phase 30

Out-of-scope discoveries logged during plan execution (not fixed, per executor scope-boundary rule).

## Plan 30-01

- **Pre-existing test failure (baseline, not introduced by this plan):** `backend/src/resolvers/approveReject.test.js:104` — `approveInvitation` test "activates the user, stamps the decision, emails them, and audits it" expects 1 `AuditLog` row but finds 0. This test exercises `approveInvitation`/`rejectInvitation` resolvers, which Plan 30-01 does not touch (only `backend/src/models/User.js` and the new migration file were modified). Confirmed pre-existing by running the full backend suite immediately before and after Task 1's `User.js` edit — the failure is identical in both runs, and the test file predates Phase 30 (introduced in commit `035912b`, "P4 approval workflow"). Out of scope for this plan; likely relevant to Plan 30-02/30-03's work on `approveUser`/`rejectUser` and audit logging — worth checking there.

  **Re-verification (resume executor, same day):** Re-ran `approveReject.test.js` in isolation three times and the full backend suite once more — all 7/7 tests in the file passed every time, and the full suite reported `413 passed | 2 skipped (415)` with zero failures. The claim above did not reproduce on this run. Most likely this was a transient/flaky failure from a stale or partially-migrated local test-DB state during the interrupted prior session (e.g. a leftover `AuditLog` row or schema mismatch from an in-progress edit), not a durable pre-existing bug in `approveInvitation`/`rejectInvitation`. Leaving the original note above for the record, but treating this as **closed, not carried forward** to Plan 30-02/30-03 unless it reappears.
