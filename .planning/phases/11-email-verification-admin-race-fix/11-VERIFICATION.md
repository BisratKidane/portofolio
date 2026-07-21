---
phase: 11-email-verification-admin-race-fix
verified: 2026-07-21T08:03:00Z
status: gaps_found
score: 7/8 must-haves verified
overrides_applied: 0
gaps:
  - truth: "ADMIN role is assigned at verification time to the first *verified* user only — closing the registration-speed land-grab race (VERIFY-04)"
    status: failed
    reason: >
      The promotion mechanism is two separate, non-transactional autocommit statements: (1) the
      token-consumption UPDATE, then (2) a raw `UPDATE users JOIN (SELECT COUNT(*) ... WHERE
      role='ADMIN' AND emailVerified=true) ...` that promotes only if adminCount=0. This is not
      atomic under concurrency. Independently verified (not just accepting the code review's
      narrative) by running the exact SQL statement from two separate MySQL connections against
      the project's real MySQL 8.4 test database, targeting two different newly-registered users,
      fired truly simultaneously (no artificial delay) for 30 trials: 28/30 trials (93%) produced
      `ER_LOCK_DEADLOCK` on one of the two connections. The `verifyEmail` resolver has no
      try/catch or retry around this query, and it runs AFTER the token-consumption UPDATE has
      already committed — so under real concurrent verification traffic (exactly the scenario
      VERIFY-04 exists to make safe), one of the two racing users gets their single-use token
      burned and then receives a raw, unhandled "Deadlock found when trying to get lock; try
      restarting transaction" GraphQL error instead of a session, with no way to retry (the token
      is already consumed). Literal double-ADMIN promotion was not reproduced in this MySQL 8.4
      environment (0/30 trials, 0/8 SLEEP-forced trials, 0/6 higher-fan-out N=10 trials) — but the
      code comment's claim of "functionally identical atomicity/race-safety" is still
      demonstrably false: the mechanism reliably breaks under concurrency via crash + unrecoverable
      token loss rather than double promotion, which is just as disqualifying for "closing the
      race" as the reviewer's originally hypothesized failure mode. WR-03's Promise.all test in
      verifyEmail.test.js passes today because it does not force adversarial interleaving; it gives
      false confidence and would not catch either failure mode (double-admin or deadlock-crash) on
      a regression.
    artifacts:
      - path: "backend/src/resolvers/user.resolver.js"
        issue: "verifyEmail (~lines 149-157): ADMIN promotion is a second, separate autocommit raw query with no transaction, no SELECT...FOR UPDATE, no DB-enforced uniqueness backstop, and no error handling around the deadlock this verification reproduced."
      - path: "backend/src/resolvers/verifyEmail.test.js"
        issue: "The 'assigns ADMIN to exactly one of two users racing' test (lines 85-115) uses a bare Promise.all with no forced interleaving/no deadlock-detection assertion; it does not exercise or catch the failure mode this verification found."
    missing:
      - "A DB-enforced atomicity guarantee for 'at most one ADMIN' — e.g. a generated column + UNIQUE index (CR-01 Option A) or a single transaction using SELECT ... FOR UPDATE (CR-01 Option B) — so the invariant holds independent of statement-level lock semantics."
      - "Error handling (try/catch + retry-once-on-deadlock, or a transaction that can be safely retried) around the ADMIN-promotion step so a losing/deadlocked racer whose token was already legitimately consumed still receives a valid session instead of a raw unhandled SQL error and a burned, unusable token."
      - "A concurrency test that deterministically forces interleaving (e.g. a controlled delay or explicit two-connection harness, as used in this verification) instead of a bare Promise.all, so the test can actually fail if the atomicity guarantee regresses."
---

# Phase 11: Email Verification & ADMIN Race Fix Verification Report

**Phase Goal:** New accounts must prove ownership of their email before they receive a usable session or any chance at the ADMIN role — closing the first-user-becomes-ADMIN land-grab race.
**Verified:** 2026-07-21T08:03:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | VERIFY-01: `User` model gains `emailVerified`/`emailVerificationToken`/`emailVerificationExpiresAt` columns | ✓ VERIFIED | `backend/src/models/User.js:50-52`; migration `backend/migrations/manual/011-add-email-verification-columns.sql`; 120/120 backend tests pass |
| 2 | VERIFY-02: `register` creates an unverified user, emails a verification token, and returns a message-only payload — no JWT/session/ADMIN at registration | ✓ VERIFIED | `user.resolver.js` `register` (lines 46-66) creates row with `emailVerificationToken`/`emailVerificationExpiresAt`, returns `{ message }` only; `register.test.js` proves message-only payload, unverified row, hashed token, first registrant stays `USER` |
| 3 | VERIFY-03: `verifyEmail(token)` flips `emailVerified` true, clears token/expiry (single-use), returns `AuthPayload` | ✓ VERIFIED | `user.resolver.js` lines 124-138 (atomic conditional UPDATE `WHERE id AND emailVerificationToken = hashed`); `verifyEmail.test.js` proves flip, single-use rejection, expiry rejection |
| 4 | **VERIFY-04: ADMIN assigned race-safely to the first verified user only** | ✗ **FAILED** | See Gaps below — empirically reproduced concurrency failure (28/30 deadlocks under true concurrency) in the mechanism at `user.resolver.js:149-157` |
| 5 | VERIFY-05: `login` rejects unverified account after password check; unverified session rejected by protected resolvers, not just hidden in UI | ✓ VERIFIED | `user.resolver.js` line 70 (`login`); `auth.js` line 29 (`getUserFromRequest` returns `null` if `!user.emailVerified`, gating `dashboard`/`users`/`logout` via `requireAuth`); `login.test.js`, `auth.test.js` (lines 133-148) prove both halves |
| 6 | VERIFY-06: verification token is cryptographically random, single-use, 24h expiry | ✓ VERIFIED | `auth.js` `createVerificationToken` (`crypto.randomBytes(32)`), `verificationTokenExpiry` (`+24h`); single-use proven in `verifyEmail.test.js` |
| 7 | VERIFY-07: `resendVerificationEmail` reissues a fresh token, anti-enumeration, rate-limited | ✓ VERIFIED | `user.resolver.js` lines 162-189 (generic message + timing floor); `rateLimits.js` `resendVerificationEmail: { max: 5, windowMs: 1h }`; `resendVerificationEmail.test.js` proves reissue, enumeration-resistance, and `TOO_MANY_REQUESTS` |
| 8 | VERIFY-08: frontend `/verify-email` route + Register confirmation state + message-only `AuthContext.register` | ✓ VERIFIED | `App.jsx` line 20 (route outside `ProtectedRoute`); `VerifyEmail.jsx`; `AuthContext.jsx` (register returns `{message}`, `verifyEmail` establishes session via `authenticate`); `Register.jsx` confirmation panel, no `useNavigate`; frontend suite 22/22 pass; human checkpoint confirmed in `11-07-SUMMARY.md` (migration applied, zero `Unknown column` errors, full flow exercised) |

**Score:** 7/8 truths verified

### Independent Verification of CR-01 (VERIFY-04) — Not Taken on Faith

The code review (`11-REVIEW.md`, CR-01) flagged that the ADMIN promotion is two separate
autocommit statements and that the derived-table `COUNT(*)` read is not guaranteed to be a
locking read. Rather than accept this narrative or the review's own reasoning at face value,
this verification independently reproduced the failure against the project's actual running
MySQL 8.4 instance (`docker ps` confirmed `portofolio-mysql-1` healthy), using the exact SQL
from `user.resolver.js:149-157` against the real `portofolio_test` schema:

- **30 trials, two real MySQL connections, truly simultaneous (`Promise.all`, no artificial
  delay), each targeting a different newly-registered user with zero existing ADMIN:**
  28/30 trials (93%) raised `ER_LOCK_DEADLOCK` on one of the two connections. 0/30 produced two
  ADMINs.
- **8 trials with a forced 1s timing window (`SLEEP(1)` inside connection A's derived-table
  subquery, connection B starting 200ms later):** 8/8 trials raised `ER_LOCK_DEADLOCK`.
- **6 trials via the actual GraphQL layer (`server.executeOperation`, 10 concurrent new-user
  verifications via `Promise.all`, matching the app's real code path):** all 6 completed without
  error and produced exactly 1 ADMIN each — consistent with WR-03's point that the app-level test
  harness's timing does not reliably expose the underlying non-atomicity; the raw-connection test
  above proves the statement itself has no protection against genuine concurrent execution.

**Conclusion:** The specific "two ADMINs" outcome hypothesized by CR-01 was not reproduced on this
MySQL 8.4 configuration — but a different, equally disqualifying failure mode was reproduced with
high frequency: an unhandled database deadlock that crashes the mutation for one of the two
racing users *after* their single-use verification token has already been permanently consumed by
the prior (committed) UPDATE. That user is left verified-but-sessionless with a burned token and
no recovery path other than `resendVerificationEmail` overwriting an already-consumed token slot.
This empirically confirms the review's core claim — the mechanism is not atomic/race-safe — via a
concrete, reproducible, high-frequency (93%) failure under real concurrent traffic on the exact
statement shipped in this phase. **The phase's headline deliverable (VERIFY-04, "closing the
land-grab race") is not achieved.**

WR-03 is also confirmed: `verifyEmail.test.js`'s "assigns ADMIN to exactly one of two users
racing" test (lines 85-115) passed in every run performed during this verification, both before
and independent of the fix status — it does not force interleaving and would not fail if the
atomicity guarantee regressed further, or if it were never implemented. A passing test here is not
evidence of VERIFY-04 being met, exactly as flagged.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/models/User.js` | 3 new columns | ✓ VERIFIED | Lines 50-52 |
| `backend/src/utils/auth.js` | token helpers + verified-gate | ✓ VERIFIED | Lines 29 (gate), 55-65 (helpers) |
| `backend/test/helpers.js` | `createTestUser()` defaults `emailVerified: true` | ✓ VERIFIED | Line 36 |
| `backend/migrations/manual/011-add-email-verification-columns.sql` | ALTER TABLE + ADMIN backfill | ✓ VERIFIED | Present, documented, human-applied per 11-07-SUMMARY |
| `backend/src/services/mailer.js` | `sendVerificationEmail` | ✓ VERIFIED | Line 38 |
| `backend/src/schemas/user.schema.js` | `RegisterPayload`, `verifyEmail`, `resendVerificationEmail` | ✓ VERIFIED | Lines 25, 42, 47-48 |
| `backend/src/config/rateLimits.js` | `resendVerificationEmail` entry | ✓ VERIFIED | Line 9 |
| `backend/src/resolvers/user.resolver.js` | register/login/verifyEmail/resendVerificationEmail | ⚠️ PARTIAL | register/login/resendVerificationEmail substantive and wired; **verifyEmail's ADMIN-promotion block is present but not race-safe** (see gap) |
| `frontend/src/context/AuthContext.jsx` | message-only register + verifyEmail session action | ✓ VERIFIED | Lines 20, 26, 56-68 |
| `frontend/src/pages/VerifyEmail.jsx` | `/verify-email` page | ✓ VERIFIED | Full file; auto-verify on mount |
| `frontend/src/App.jsx` | `/verify-email` route outside `ProtectedRoute` | ✓ VERIFIED | Line 20 |
| `frontend/src/pages/Register.jsx` | confirmation panel, no auto-navigate | ✓ VERIFIED | Per 11-07-SUMMARY + Register.test.jsx passing |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `App.jsx` | `VerifyEmail.jsx` | `<Route path="verify-email" element={<VerifyEmail />}/>` sibling of `reset-password`, outside `ProtectedRoute` | ✓ WIRED | Confirmed |
| `VerifyEmail.jsx` | `AuthContext.verifyEmail` | `useAuth().verifyEmail(token)` on mount | ✓ WIRED | Confirmed |
| `AuthContext.verifyEmail` | `authenticate()` helper | delegates to same session-establishing path as `login` | ✓ WIRED | Confirmed, `data.login \|\| data.verifyEmail` |
| `user.resolver.js (register)` | `mailer.sendVerificationEmail` | fire-and-forget `.catch()` with raw token | ✓ WIRED | Confirmed |
| `user.resolver.js (resendVerificationEmail)` | `rateLimits.js` | operation-name-keyed rate-limit plugin | ✓ WIRED | Confirmed via `resendVerificationEmail.test.js` `TOO_MANY_REQUESTS` test |
| `user.resolver.js (verifyEmail)` | ADMIN-promotion atomicity guarantee | single-statement `UPDATE...JOIN` derived-table COUNT | ✗ **NOT WIRED TO A REAL GUARANTEE** | Statement exists and runs, but provides no enforced atomicity under concurrency (see gap) |

### Behavioral Spot-Checks / Probe Execution

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full backend suite green | `ENV_FILE=../env/test.env npm test` (backend) | 22 files / 120 tests passed | ✓ PASS |
| Full frontend suite green | `npm test` (frontend) | 7 files / 22 tests passed | ✓ PASS |
| ADMIN-race atomicity under true concurrency (2 new users, no ADMIN, simultaneous) | Direct MySQL two-connection reproduction of `user.resolver.js:149-157`'s exact statement, 30 trials | 28/30 `ER_LOCK_DEADLOCK`, 0/30 double-ADMIN | ✗ FAIL — confirms non-atomicity (crash, not double-promotion) |
| ADMIN-race via real GraphQL path (10 concurrent new users) | `server.executeOperation` × 10 via `Promise.all`, 6 trials | All 6 completed cleanly, exactly 1 ADMIN each | Inconclusive on its own — demonstrates WR-03's point that this harness's timing does not reliably expose the underlying race |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| VERIFY-01 | 11-01, 11-03, 11-07 | User model columns + migration + human-applied | ✓ SATISFIED | Columns, migration file, human checkpoint confirmed |
| VERIFY-02 | 11-02, 11-04 | Unverified register, message-only, no session | ✓ SATISFIED | resolver + tests |
| VERIFY-03 | 11-02, 11-05 | verifyEmail flips/clears token, returns AuthPayload | ✓ SATISFIED | resolver + tests |
| VERIFY-04 | 11-05 | Race-safe first-verified-user ADMIN assignment | ✗ **BLOCKED** | Empirically reproduced non-atomicity (28/30 deadlocks under true concurrency) |
| VERIFY-05 | 11-01, 11-04 | login rejects unverified; session gate for protected resolvers | ✓ SATISFIED | resolver + auth.js gate + tests |
| VERIFY-06 | 11-01, 11-02, 11-04, 11-05 | Crypto-random, single-use, 24h-expiry token | ✓ SATISFIED | auth.js helpers + tests |
| VERIFY-07 | 11-02, 11-05 | resendVerificationEmail recovery + anti-enumeration + rate limit | ✓ SATISFIED | resolver + rateLimits.js + tests |
| VERIFY-08 | 11-06, 11-07 | Frontend verify-email route + confirmation state | ✓ SATISFIED | AuthContext, VerifyEmail.jsx, App.jsx, Register.jsx, human checkpoint |

All 8 requirement IDs traced in `.planning/REQUIREMENTS.md` are accounted for above. No orphaned requirements found for Phase 11 (all 8 VERIFY-* IDs map to a plan's `requirements` frontmatter and were checked here).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/src/resolvers/user.resolver.js` | 144-148 | Comment asserts "functionally identical atomicity/race-safety" — factually incorrect per this verification's empirical reproduction | 🛑 Blocker | Misleading in-code claim about a security-relevant invariant; masks the real gap from future readers/reviewers |
| `backend/src/resolvers/user.resolver.js` | 149-157 | No `try/catch` around the raw ADMIN-promotion query | 🛑 Blocker (tied to VERIFY-04 gap) | A deadlock here (reproduced 93% of the time under true concurrency) throws an unhandled, user-facing raw SQL error after the user's single-use token has already been burned |
| `backend/src/resolvers/user.resolver.js` | 49-50 | `register` still returns the distinct message `'A user with this email already exists.'`, contradicting the phase's own anti-enumeration hardening pattern used elsewhere in the same file | ⚠️ Warning (WR-01, non-blocking for VERIFY-04 but noted per review) | Account-enumeration oracle inconsistent with `resendVerificationEmail`/`requestPasswordReset` hardening |
| `frontend/src/pages/VerifyEmail.jsx` | 15-27 | Mount effect has no guard against double-invocation; `<React.StrictMode>` is enabled in `main.jsx`, confirmed causing double-fire of `verifyEmail(token)` for the same single-use token in dev | ⚠️ Warning (WR-02, non-blocking, dev-only UX defect) | Confirmed `React.StrictMode` present at `main.jsx:10`; not covered by `VerifyEmail.test.jsx` |
| `backend/src/services/mailer.js` | 23-25 | Full email body (incl. token/link) logged to console in dev | ℹ️ Info (IN-02, pre-existing pattern from Phase 8) | Out of scope for this phase's blocking assessment |

No `TBD`/`FIXME`/`XXX` debt markers found in any file modified by this phase.

### Human Verification Required

None additional beyond what Plan 11-07's deferred human checkpoint already covered (migration
boot-and-verify + full register→verify→dashboard flow), which is confirmed complete in
`11-07-SUMMARY.md`. The remaining gap (VERIFY-04) is a backend concurrency/atomicity defect that
was verified programmatically in this report, not a UI/UX item requiring human judgment.

### Gaps Summary

7 of 8 phase requirements are solidly implemented and test-proven, with the full backend (120)
and frontend (22) test suites passing. However, the phase's headline deliverable — VERIFY-04,
closing the first-user-becomes-ADMIN land-grab race — is not achieved. The implementation's
ADMIN-promotion step is two separate autocommit statements gated by an application-level
`COUNT(*)` read with no DB-enforced uniqueness guarantee and no transaction. This verification did
not merely accept the code review's narrative; it independently reproduced a concrete concurrency
failure against the project's real MySQL 8.4 database using the exact shipped SQL statement:
28 of 30 truly-simultaneous two-new-user verification trials produced an unhandled
`ER_LOCK_DEADLOCK`, and the resolver has no error handling around it — meaning a losing racer's
single-use token is burned by the prior committed statement and the request then fails with a raw
internal database error instead of a session. This is a BLOCKER: it means "closing the land-grab
race" — the phase's stated purpose — is not true today. `/gsd:plan-phase --gaps` should schedule a
closure plan implementing one of CR-01's two documented fix options (DB-level uniqueness
constraint, or a single transaction with `SELECT ... FOR UPDATE`), replace the misleading code
comment, add error handling for the losing racer, and replace the Promise.all race test with one
that deterministically forces interleaving.

---

_Verified: 2026-07-21T08:03:00Z_
_Verifier: Claude (gsd-verifier)_
