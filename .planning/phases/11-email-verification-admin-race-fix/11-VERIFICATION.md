---
phase: 11-email-verification-admin-race-fix
verified: 2026-07-21T11:10:00Z
status: human_needed
score: 8/8 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 7/8
  gaps_closed:
    - "VERIFY-04: ADMIN role is assigned race-safely to the first verified user only — closing the registration-speed land-grab race"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: >
      ROADMAP SC-5 phase-close sign-off: apply
      backend/migrations/manual/011-add-email-verification-columns.sql to a real pre-existing,
      non-force-synced dev database, then manually walk the 8-step register -> check-your-email ->
      verify -> dashboard flow (plus the error path and unverified-login rejection) against the
      current post-11-08 code.
    expected: >
      Migration applies with zero `Unknown column` errors, the grandfathered ADMIN still logs in,
      and the full happy-path + error-path flow works end-to-end.
    why_human: >
      Requires a running full stack against a real pre-existing dev DB and human observation of a
      multi-step UI flow — not programmatically verifiable. 11-07-SUMMARY.md reports this was
      confirmed against the pre-11-08 code; the 11-08 change is internal to verifyEmail and
      preserves the happy-path return shape, but the ROADMAP SC-5 checkbox for 11-07 remains
      formally open and should be re-confirmed to close Phase 11.
---

# Phase 11: Email Verification & ADMIN Race Fix Verification Report

**Phase Goal:** New accounts must prove ownership of their email before they receive a usable session or any chance at the ADMIN role — closing the first-user-becomes-ADMIN land-grab race.
**Verified:** 2026-07-21T11:10:00Z (re-verification after 11-08 gap closure)
**Status:** human_needed (automated VERIFY-04 gap CLOSED; ROADMAP SC-5 human checkpoint remains)
**Re-verification:** Yes — after gap closure (previous: gaps_found 7/8, VERIFY-04 failed)

## Re-Verification Summary

The prior verification (2026-07-21T08:03:00Z) found exactly one gap: VERIFY-04. The ADMIN
promotion was two separate, non-transactional autocommit statements that were independently
reproduced as non-atomic under real MySQL 8.4 concurrency (28/30 trials raised an unhandled
`ER_LOCK_DEADLOCK`, burning the losing racer's single-use token). Plan 11-08 (commits `9cbca8b`
RED, `7bb006a` GREEN, `63f7fe6` docs) closed this gap. This re-verification confirms the closure
against the actual code and tests — not the SUMMARY narrative.

**VERIFY-04 is now MET.** Score improves 7/8 → 8/8. No regressions to VERIFY-01/02/03/05/06/07/08.
The only remaining item is the ROADMAP SC-5 human checkpoint, which by nature cannot be verified
programmatically.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | VERIFY-01: `User` model gains `emailVerified`/`emailVerificationToken`/`emailVerificationExpiresAt` columns | ✓ VERIFIED | `backend/src/models/User.js`; migration `011-add-email-verification-columns.sql`; suite green |
| 2 | VERIFY-02: `register` creates an unverified user, emails a verification token, returns a message-only payload | ✓ VERIFIED | `user.resolver.js` `register` (lines 46-66) returns `{ message }` only; `register.test.js` |
| 3 | VERIFY-03: `verifyEmail(token)` flips `emailVerified`, clears token/expiry (single-use), returns `AuthPayload` | ✓ VERIFIED | `user.resolver.js` (lines 124-173); `verifyEmail.test.js` happy-path/single-use/expiry tests all pass |
| 4 | **VERIFY-04: ADMIN assigned race-safely to the first verified user only** | ✓ **VERIFIED (gap closed)** | Single `sequelize.transaction` (line 141) wraps token-consumption UPDATE + `SELECT COUNT(*) ... FOR UPDATE` (line 150) + conditional promotion (line 154), with retry-once-on-`ER_LOCK_DEADLOCK` (lines 158-169). Test independently proven to catch a regression — see below. |
| 5 | VERIFY-05: `login` rejects unverified account; unverified session rejected by protected resolvers | ✓ VERIFIED | `user.resolver.js` line 70; `auth.js` verified-gate; `login.test.js`, `auth.test.js` (unchanged, green) |
| 6 | VERIFY-06: verification token is cryptographically random, single-use, 24h expiry | ✓ VERIFIED | `auth.js` helpers; single-use proven in `verifyEmail.test.js` |
| 7 | VERIFY-07: `resendVerificationEmail` reissues a fresh token, anti-enumeration, rate-limited | ✓ VERIFIED | `user.resolver.js` (lines 174-201, unchanged by 11-08); `rateLimits.js`; `resendVerificationEmail.test.js` |
| 8 | VERIFY-08: frontend `/verify-email` route + Register confirmation state + message-only `AuthContext.register` | ✓ VERIFIED | `App.jsx`, `VerifyEmail.jsx`, `AuthContext.jsx`, `Register.jsx` — untouched by 11-08; frontend suite green |

**Score:** 8/8 truths verified

### VERIFY-04 Closure — Independently Confirmed (Not Taken on Faith)

**Code analysis (`backend/src/resolvers/user.resolver.js:124-173`):**
- Token lookup + expiry check remain outside the transaction (pure read, unchanged error message).
- `verifyAndPromote` (line 140) runs three steps inside one `sequelize.transaction`:
  1. Conditional token-consumption `User.update({...}, { where: { id, emailVerificationToken: hashed }, individualHooks: true, transaction: t })` — throws the existing "invalid or has expired" message on `affectedCount === 0`.
  2. `SELECT COUNT(*) AS adminCount FROM users WHERE role = 'ADMIN' AND emailVerified = true FOR UPDATE` — a genuine locking read on the same transaction (line 150).
  3. `User.update({ role: 'ADMIN' }, { where: { id }, transaction: t })` only when `Number(adminCount) === 0` — promotion is a Sequelize update inside `t`, never a separate autocommit JOIN.
- `isDeadlock` (line 158) matches `error.original?.code`/`error.parent?.code === 'ER_LOCK_DEADLOCK'`; on a first deadlock the whole transaction is retried exactly once (line 168). Because nothing commits until the transaction succeeds, the single-use token is NOT consumed on rollback, so the retry's conditional UPDATE still finds the token and re-runs idempotently — the losing racer receives a valid `AuthPayload` instead of a burned token + raw SQL error. Return shape `signToken(user)` after `user.reload()` unchanged (line 172).
- The misleading "functionally identical" comment is gone (grep = 0); the replacement comment (lines 133-139) accurately describes the transaction/locking-read/retry guarantee.

**Regression-catch proof (this verifier ran it, did not trust the SUMMARY):**
I temporarily reverted `verifyEmail` to the exact pre-fix two-statement autocommit form and re-ran
`verifyEmail.test.js` three times. The VERIFY-04 test (Test B) failed all 3/3 with
`"Deadlock found when trying to get lock; try restarting transaction"` — the same failure mode the
prior verification reproduced. Restoring the fix returned the suite to green (working tree confirmed
clean via `git status`). This proves the test is a real regression guard: it fails if the
transaction/`FOR UPDATE` atomicity is removed.

### Test-Deviation Judgment (documented in 11-08-SUMMARY)

The plan specified a single-verifier SLEEP/`FOR UPDATE` Test A/B. The executor documented a
deviation: the plan's literal Test A cannot produce a real RED against the pre-fix resolver (no
index on `role` → full-table locks; autocommit statements don't sustain a lock across an
interleaving window), and a bare `Promise.all` passes regardless of fix status. The delivered tests
are:
- **Test A** (`verifyEmail.test.js:109-153`): a raw `mysql2` connection holds the exact
  `FOR UPDATE` admin-count read across a `SLEEP(0.3)` window; a concurrent real verifier is asserted
  to resolve only after the holder commits. A contention/serialization proof (passes pre- and
  post-fix); satisfies the `FOR UPDATE`/`SLEEP` acceptance and documents serialization.
- **Test B** (`verifyEmail.test.js:162-222`): the deterministic RED. Two real verifiers are pinned
  at their admin-count read by a raw connection holding an exclusive lock on a shared non-admin
  *anchor* row that every admin-count scan must read but no primary-key token UPDATE touches;
  releasing it fires both promotions simultaneously, forcing the symmetric lock-order deadlock. It
  asserts neither racer surfaces an error, both keep a usable `token`, and exactly one becomes ADMIN.

**Verdict: the deviation is SOUND, not a weakened test.** Test B is strictly stronger than the plan's
original: it exercises two real resolvers under genuine forced interleaving and asserts the exact
three properties VERIFY-04 requires (no unhandled error, no burned token, exactly one ADMIN). My
own revert-and-run proof confirms it deterministically fails against the pre-fix resolver — the
precise property the prior verification said the old `Promise.all` test lacked. The two-symmetric-
promoter design is a legitimate consequence of the schema's InnoDB locking (no index on `role`), not
a shortcut around the invariant.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/resolvers/user.resolver.js` | `verifyEmail` atomic verify+promote | ✓ VERIFIED | Single transaction + `FOR UPDATE` + deadlock retry (lines 124-173); other resolver entry points unchanged by 11-08 |
| `backend/src/resolvers/verifyEmail.test.js` | deterministic concurrency harness | ✓ VERIFIED | Test A (SLEEP/FOR UPDATE serialization), Test B (anchor-lock two-racer RED), Test C (D-04/D-06) unmodified |
| `backend/src/models/User.js` | 3 new columns | ✓ VERIFIED | Unchanged; suite green |
| `backend/src/utils/auth.js` | token helpers + verified-gate | ✓ VERIFIED | Unchanged |
| `frontend/src/pages/VerifyEmail.jsx` / `App.jsx` / `AuthContext.jsx` / `Register.jsx` | verify-email UI | ✓ VERIFIED | Untouched by 11-08; frontend suite green |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `user.resolver.js (verifyEmail)` | MySQL admin-slot lock | `SELECT COUNT(*) ... FOR UPDATE` inside the same `sequelize.transaction` as the token UPDATE | ✓ WIRED | Confirmed at lines 141-155; locking read serializes concurrent verifiers |
| `user.resolver.js (verifyEmail)` | deadlock recovery | retry-once when `error.original/parent.code === 'ER_LOCK_DEADLOCK'` | ✓ WIRED | Lines 158-169; idempotent because nothing commits until success |
| `verifyEmail.test.js (Test B)` | `user.resolver.js (verifyEmail)` | raw mysql2 anchor-row X-lock pinning two real verifiers, released simultaneously | ✓ WIRED | Proven to fail pre-fix (3/3 this verification), pass post-fix |

### Behavioral Spot-Checks / Probe Execution

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full backend suite green | `ENV_FILE=../env/test.env npm test` | 22 files / 121 tests passed | ✓ PASS |
| Concurrency test stability (fix) | `npx vitest run src/resolvers/verifyEmail.test.js` × 4 | 7/7 passed each run (4/4) | ✓ PASS |
| RED proof (regression catch) | Reverted `verifyEmail` to pre-fix, ran test × 3 | 3/3 FAIL with `ER_LOCK_DEADLOCK` on Test B; restored fix → green | ✓ PASS (test catches regression) |
| Change scope | `git diff c1118f2 63f7fe6 -- backend/ frontend/` | Only `user.resolver.js` + `verifyEmail.test.js`; no other resolver entry points changed | ✓ PASS (no regression surface) |

### Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| VERIFY-01 | ✓ SATISFIED | Columns + migration + suite green |
| VERIFY-02 | ✓ SATISFIED | register message-only; tests green |
| VERIFY-03 | ✓ SATISFIED | verifyEmail flip/clear/AuthPayload; tests green |
| VERIFY-04 | ✓ **SATISFIED (was BLOCKED)** | Atomic transaction + locking read + deadlock retry; regression-catching test proven by revert-and-run |
| VERIFY-05 | ✓ SATISFIED | login gate + auth.js gate; tests green (unchanged) |
| VERIFY-06 | ✓ SATISFIED | crypto token, single-use, 24h; tests green |
| VERIFY-07 | ✓ SATISFIED | resend reissue + anti-enum + rate limit; tests green (unchanged) |
| VERIFY-08 | ✓ SATISFIED | frontend route/confirmation; untouched by 11-08; frontend suite green |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | Previous 🛑 blockers (misleading "functionally identical" comment; no error handling around ADMIN promotion) | RESOLVED | Comment replaced (grep=0); transaction + deadlock retry added |
| `backend/src/resolvers/user.resolver.js` | 50 | `register` returns distinct `'A user with this email already exists.'` message | ⚠️ Warning (WR-01, pre-existing, non-blocking) | Enumeration oracle; unchanged from prior report, out of VERIFY-04 scope |
| `frontend/src/pages/VerifyEmail.jsx` | 15-27 | mount effect double-fire under `React.StrictMode` | ⚠️ Warning (WR-02, dev-only, non-blocking) | Unchanged from prior report |

No `TBD`/`FIXME`/`XXX` debt markers found in any file modified by this phase.

### Human Verification Required

**ROADMAP SC-5 phase-close checkpoint (11-07 Task 3).** Apply
`backend/migrations/manual/011-add-email-verification-columns.sql` to a real pre-existing,
non-force-synced dev database, then manually walk the 8-step register → check-your-email → verify →
dashboard flow (plus error path and unverified-login rejection) against the current post-11-08 code.

- **Expected:** migration applies with zero `Unknown column` errors, grandfathered ADMIN still logs
  in, full flow works end-to-end.
- **Why human:** requires a running full stack against a real pre-existing dev DB and observation of
  a multi-step UI flow.
- **Note:** `11-07-SUMMARY.md` reports this was confirmed against the pre-11-08 code. The 11-08
  change is internal to `verifyEmail` and preserves the happy-path return shape, so the happy-path
  result should still hold — but the ROADMAP SC-5 checkbox remains formally open and should be
  re-confirmed to close Phase 11.

### Gaps Summary

The sole automated gap from the prior verification (VERIFY-04) is CLOSED. `verifyEmail` now performs
token consumption, a locking `FOR UPDATE` admin-count read, and conditional ADMIN promotion inside a
single Sequelize transaction with retry-once-on-deadlock, giving a DB-enforced "at most one ADMIN"
guarantee and preserving an authenticated session for the losing racer. The replacement concurrency
test was independently proven by this verifier (revert-and-run, 3/3) to fail against the pre-fix
resolver, so it is a genuine regression guard. All 8 phase requirements are satisfied; backend
121/121 and frontend suites are green; no regressions. The only outstanding item is the ROADMAP SC-5
human phase-close checkpoint, which is not programmatically verifiable — hence status `human_needed`
rather than `passed`. No new blockers.

---

_Verified: 2026-07-21T11:10:00Z (re-verification)_
_Verifier: Claude (gsd-verifier)_
