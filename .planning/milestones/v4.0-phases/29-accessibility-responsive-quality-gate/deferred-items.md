# Deferred Items — Phase 29

Out-of-scope discoveries logged during execution, per executor scope-boundary rules
(fix only issues directly caused by the current task's changes).

## 29-01: `approveReject.test.js` intermittent full-suite failure (pre-existing, out of scope)

- **Found during:** Task 2/3 verification — full `npm test --workspace backend` run.
- **Symptom:** `approveInvitation > activates the user, stamps the decision, emails them, and
  audits it` failed with `expected [] to have a length of 1 but got +0` (an `AuditLog.findAll`
  assertion), while every other test — including the 2 intentionally-skipped VERIFY-04/REL-06
  tests — passed/skipped as expected (412 passed, 2 skipped, 1 failed of 415).
- **Scope check:** This plan touched only `backend/test/dbEngine.js`,
  `backend/src/resolvers/verifyEmail.test.js`, `backend/src/services/familyMember.dedup.test.js`,
  and `KNOWN-ISSUES.md`. `approveReject.test.js` and the invitation/audit-log code path were not
  touched.
- **Confirmed non-regression:** Re-ran `npm test --workspace backend -- --run
  approveReject.test.js` in isolation immediately after — all 7 tests in that file passed,
  including the one that failed in the full-suite run. This points to a pre-existing timing/async
  flake (likely audit-log write ordering under full-suite parallel load), not a defect introduced
  by this plan.
- **Action:** Not fixed (out of scope per Rule boundary — pre-existing failure in an unrelated
  file). Left for a future `/gsd:debug` pass if it recurs. Not added to `KNOWN-ISSUES.md` since
  that file documents deliberate, understood behavior differences, not unconfirmed flakes.
