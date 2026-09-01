---
phase: 32-tokenless-registration
verified: 2026-09-01T10:14:44Z
status: gaps_found
score: 5/7 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 4/6
  gaps_closed:
    - "CR-03 (uniform-response leak: models.User.findOne and createVerificationToken() ran outside the tokenless branch's try/catch) -- closed by Plan 32-08. Confirmed by direct source read of backend/src/resolvers/user.resolver.js:256-322: a single try now wraps bcrypt.hash, findOne, the existing-user branch, createVerificationToken, and create, with every exit routed through `return await finishTokenlessRegistration(startedAt);`. Independently re-ran the targeted suite (register.test.js/verifyEmail.test.js/updateUser.test.js/assertRequiredColumns.test.js: 66 passed, 2 skipped) and the code review's own mutation-test sweep (moving findOne/createVerificationToken back outside the try turned exactly the 2 new CR-03 tests red)."
    - "CR-01 fresh-deployment privilege-escalation window (unconditional 'first verifier becomes ADMIN' with no gate) -- closed by Plan 32-07. Confirmed by direct source read of user.resolver.js:430: the bootstrap now requires `env.adminEmail && user.email === env.adminEmail`, fails closed (promotes nobody) when ADMIN_EMAIL is unset. Confirmed by the review's mutation test: reverting the condition turns exactly 2 of 3 new verifyEmail tests red."
  gaps_remaining:
    - "The CR-01 fix's own safe bootstrap path is unusable: verifyAndPromote sets role='ADMIN' but never sets status, so the promoted account stays 'Pending' and getUserFromRequest/login reject every non-Active account. README now documents this exact non-working workflow as step 1. This is a NEW defect introduced by Plan 32-07's fix, not a carryover of the original gap -- reported as this verification's BLOCKER 1 (32-REVIEW.md CR-01, gap-closure-round numbering)."
    - "The updateUser last-administrator guard Plan 32-07 extended to the email-change path is TOCTOU-bypassable: it is a non-transactional count-then-save, unlike the FOR UPDATE pattern used in verifyEmail in this same phase. Two concurrent updateUser email changes both pass the guard and drive verified admins to zero -- reopening the exact window the guard exists to close. The pre-existing role-change guard three lines above shares the identical flaw. Reported as this verification's BLOCKER 2 (32-REVIEW.md CR-02, gap-closure-round numbering)."
  regressions: []
gaps:
  - truth: "A safe, explicit, USABLE path to a first ADMIN exists (Plan 32-07's own must-have #3: 'a safe, explicit path to a first ADMIN still exists and is proven by a passing test')."
    status: failed
    reason: >
      verifyAndPromote's ADMIN_EMAIL-gated bootstrap (user.resolver.js:430-432) writes only
      `{ role: 'ADMIN' }`. It never touches `status`, which is `'Pending'` for every tokenless
      self-registrant (there is no invitation, so the auto-activation block at lines 434-476,
      gated on `if (invitation)`, never fires for this account). `getUserFromRequest`
      (backend/src/utils/auth.js:33) rejects any account whose status is not 'Active'; `login`
      (user.resolver.js:333-334) refuses with "Your account is awaiting administrator approval."
      Net effect: the ADMIN_EMAIL-matching operator is promoted to role ADMIN but is permanently
      locked out -- the JWT verifyEmail returns is inert (utils/auth.js re-checks status on every
      use), and there is no Active admin left to approve them (`notifyAdminsOfPendingRegistration`
      also finds zero `{ role: 'ADMIN', status: 'Active', emailVerified: true }` rows, so nobody
      is even told). Reproduced by direct source read, matching 32-REVIEW.md CR-01's executed
      proof (register -> verify -> DB row `{"role":"ADMIN","status":"Pending"}` ->
      getUserFromRequest returns null -> login refused). README.md:184-186 documents this exact
      sequence as step 1 of the authentication workflow; it does not work as written. The new
      test ("promotes the ADMIN_EMAIL-matching registrant to ADMIN on their first verification")
      in verifyEmail.test.js asserts only `user.role === 'ADMIN'`, so it is green while the path
      it names is unusable.
    artifacts:
      - path: backend/src/resolvers/user.resolver.js
        issue: >
          Line 430-432: the zero-admin bootstrap conditional writes `{ role: 'ADMIN' }` only.
          Status stays 'Pending' because this account has no Invitation row, so the separate
          auto-activation block a few lines below never runs for it.
      - path: README.md
        issue: >
          Lines 13-14 (Features) and 184-186 (Authentication workflow) document the ADMIN_EMAIL
          bootstrap as a working first-admin path. It is not, as currently implemented.
      - path: backend/src/resolvers/verifyEmail.test.js
        issue: >
          The "promotes the ADMIN_EMAIL-matching registrant to ADMIN..." test (~lines 326-341)
          asserts `user.role === 'ADMIN'` only -- no assertion on `status`, and no assertion that
          the returned token or a subsequent login actually authenticates.
    missing:
      - "Inside verifyAndPromote's zero-admin conditional, write status: 'Active' (and consider approvedAt) in the same models.User.update call so the single write that grants the ADMIN role also grants a usable account -- 32-REVIEW.md's CR-01 section has a ready-to-adapt patch."
      - "Extend the ADMIN_EMAIL bootstrap regression test to assert the full round trip: response.data.verifyEmail.user.status === 'Active', and that getUserFromRequest resolves to a non-null ADMIN user when called with the returned token -- not merely that role === 'ADMIN'."
      - "If auto-activation on this path is deliberately NOT wanted, remove the auto-promotion entirely and rewrite README step 1 to describe the manual database write as the only bootstrap, rather than documenting a non-working automated path."
  - truth: "The last-administrator invariant ('never below one verified admin so the app can't be locked out of its own administration, or have the zero-admin bootstrap reopened') holds even under concurrent requests."
    status: failed
    reason: >
      updateUser's email-change guard (user.resolver.js:640-647, added by Plan 32-07 to close the
      original CR-01 window (b)) reads `models.User.count({ role: 'ADMIN', emailVerified: true,
      id: { [Op.ne]: target.id } })` with no transaction and no row lock, then writes
      `target.emailVerified = false` via a plain `target.save()` many statements later with no
      lock held across the gap. Two overlapping updateUser calls each observe the OTHER admin as
      the surviving verified admin, both pass the count check, and both commit -- leaving zero
      verified admins, exactly the state the guard exists to prevent. This is internally
      inconsistent with this SAME phase's own verifyEmail fix (user.resolver.js:419-421), which
      deliberately uses `sequelize.transaction` + `SELECT ... FOR UPDATE` for precisely this
      reason. Confirmed by direct source read (no `transaction:`/`lock:` option anywhere in the
      updateUser function) and by 32-REVIEW.md's executed proof (two concurrent updateUser email
      changes both returned success; `REMAINING VERIFIED ADMINS -> 0`). The pre-existing
      role-demotion guard at user.resolver.js:610-615 has the identical non-transactional shape
      and shares the same flaw -- it was not introduced by this phase, but its risk is now higher
      because this phase made `register`/`verifyEmail` reachable by anonymous callers, and a
      mixed race (demote admin A's role while changing admin B's email concurrently) can bypass
      both guards at once.
    artifacts:
      - path: backend/src/resolvers/user.resolver.js
        issue: >
          Lines 610-615 (role-change guard) and 640-647 (email-change guard, new this phase) both
          do a non-transactional `models.User.count` followed by a `target.save()` with no
          locking read in between, unlike verifyEmail's `FOR UPDATE` pattern in the same file.
      - path: backend/src/resolvers/updateUser.test.js
        issue: >
          No test exercises concurrent updateUser calls; all guard tests are single-request,
          sequential, so the race is untested (32-REVIEW.md WR-01 also flags one of these new
          tests as vacuous for an unrelated reason -- see Anti-Patterns).
    missing:
      - "Wrap both the role-change guard (610-615) and the email-change guard (640-647) in a single sequelize.transaction with a locking read (SELECT ... FOR UPDATE via raw query, or models.User.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE }) plus a locked count), matching the pattern already used in verifyEmail's zero-admin bootstrap in this same phase."
      - "Add a regression test using Promise.all on two concurrent updateUser calls (two email changes, or one role demotion + one email change) asserting models.User.count({ where: { role: 'ADMIN', emailVerified: true } }) stays >= 1 after both resolve."
deferred: []
human_verification: []
---

# Phase 32: Tokenless Registration Verification Report

**Phase Goal:** `register` accepts a call with no invitation token and safely creates a `Pending`, unverified account — reusing the invited path's password rules, email normalisation, and verification-token handling, with enumeration-safe responses, admin notification on verification, and the existing per-IP rate limit applied.
**Verified:** 2026-09-01T10:14:44Z
**Status:** gaps_found
**Re-verification:** Yes — after gap closure (Plans 32-07, 32-08, following the 32-REVIEW.md code review of both)

## Goal Achievement

Truths 1-5 map to ROADMAP.md's five numbered Success Criteria. Truths 6-7 are derived from the phase goal's own "safely creates" clause and from Plan 32-07's own declared must-haves, per this re-verification's mandate to assess the just-completed code review's two confirmed blockers rather than re-derive them.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `register` with no token creates a `Pending`, unverified account from the user's own email, storing the relationship note | VERIFIED | `user.resolver.js:236-320` tokenless branch unchanged in this respect by Plans 32-07/32-08; `register.test.js` passing (66 passed / 2 skipped across the 4 targeted files, independently re-run). |
| 2 | An email that already has an account gets a response indistinguishable from one that does not, and the real owner is emailed that someone tried to register with their address | VERIFIED | CR-03 genuinely closed by Plan 32-08. Confirmed by direct read of `user.resolver.js:256-322`: a single `try` now wraps `bcrypt.hash`, `models.User.findOne`, the existing-user branch, `createVerificationToken`, and `create`, all exiting through `return await finishTokenlessRegistration(startedAt);`. `catch` logs only `err?.name`/`err?.message`, never the full error object. Independently re-ran `register.test.js` (part of the 66/68 combined pass above) and the review's mutation-test sweep (moving findOne/createVerificationToken back outside the try turns exactly the 2 new CR-03 tests red, confirmed in 32-REVIEW.md). |
| 3 | An unverified self-registration is absent from the approval queue; verifying the email puts it there and notifies administrators | VERIFIED | Unaffected by Plans 32-07/32-08 (neither touches `pendingApprovals` or the notification call); `pendingApprovals.test.js` unaffected and not in this round's diff. |
| 4 | Password rules, email normalisation, and verification-token handling on the tokenless path run the same code as the invited path — no second, weaker implementation | VERIFIED | Unaffected by this round's changes; `assertPasswordStrength`, the model-level `beforeValidate` hook, and `createVerificationToken`/`hashVerificationToken`/`verificationTokenExpiry` remain the single shared implementation. |
| 5 | The existing per-IP registration rate limit applies to the tokenless path, and the relationship note is length-capped server-side | VERIFIED | Unaffected by this round's changes; `assertRelationshipNoteLength` and the rate-limit middleware are untouched by Plans 32-07/32-08's diff. |
| 6 | A safe, explicit, USABLE path to a first ADMIN exists (Plan 32-07's own must-have #3) | **FAILED** | The ADMIN_EMAIL-gated bootstrap (`user.resolver.js:430-432`) sets `role: 'ADMIN'` but never `status`. A tokenless self-registrant is created `'Pending'`; auto-activation is gated on `if (invitation)`, which a self-registrant never has. `login`/`getUserFromRequest` hard-require `status === 'Active'`. The promoted operator is permanently locked out, with no Active admin left to approve them. README.md documents this non-working sequence as step 1. See gap below. |
| 7 | The last-administrator invariant holds even under concurrent requests (the "safely" the phase goal requires of both the fresh-deployment window and the sole-admin-email-change window) | **FAILED** | `updateUser`'s email-change guard (`user.resolver.js:640-647`, added this phase) and the pre-existing role-change guard (`610-615`) are both non-transactional count-then-save, unlike `verifyEmail`'s `FOR UPDATE` pattern added in this same phase. Two concurrent `updateUser` email changes both pass the guard and drive verified admins to zero, measured by 32-REVIEW.md's executed proof and confirmed here by direct source read (no `transaction:`/`lock:` anywhere in the function). See gap below. |

**Score:** 5/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/config/env.js` | `env.adminEmail` — optional `ADMIN_EMAIL`, normalized, defaults to `null` | VERIFIED | `env.js:34`: `adminEmail: process.env.ADMIN_EMAIL ? process.env.ADMIN_EMAIL.toLowerCase().trim() : null`. Fail-closed default confirmed. |
| `backend/src/resolvers/user.resolver.js` (verifyAndPromote) | Zero-admin bootstrap gated on `env.adminEmail` match | VERIFIED for the gate itself; ORPHANED for the promised outcome | Gate condition (`Number(adminCount) === 0 && env.adminEmail && user.email === env.adminEmail`) correctly closes the fresh-deployment escalation window. But the promotion write is incomplete (see Truth 6/gap) — the artifact exists and is wired, but its own stated purpose ("a safe path to a first ADMIN") does not hold end-to-end. |
| `backend/src/resolvers/user.resolver.js` (updateUser) | Last-administrator guard extended to the email-change path | VERIFIED to exist and be reachable; FAILED at its stated invariant under concurrency | `otherVerifiedAdmins` guard present at lines 640-647, mirrors the pre-existing role-change guard's shape exactly — including its TOCTOU flaw. See Truth 7/gap. |
| `backend/src/resolvers/verifyEmail.test.js` | CR-01 regression coverage (unset/mismatch deny, match promotes, invited-path unaffected) | VERIFIED to exist and pass, but under-asserts | 3 new tests plus the unmodified SC-3 regression all pass (confirmed in this round's targeted re-run). The "matching promotes" test only asserts `role === 'ADMIN'`, not `status` or actual login capability — this is the specific gap in Truth 6. |
| `backend/src/resolvers/updateUser.test.js` | CR-01 regression coverage (sole admin blocked, backup admin allowed, unverified admin unaffected) | VERIFIED to exist and pass sequentially; no concurrency coverage | 17 tests pass (confirmed in this round's targeted re-run). No test exercises `Promise.all`-style concurrent calls, so the TOCTOU gap in Truth 7 is untested by design, not merely undetected. |
| `env/local.env`, `env/remote.env`, `env/test.env`, `env/local.container.env` | Discoverable, empty `ADMIN_EMAIL=` entry | VERIFIED | `grep -n "ADMIN_EMAIL" env/*.env` confirms presence in all four files (checked as part of this verification). |
| `backend/src/config/assertRequiredColumns.js` | Fail-fast boot check for migration 020's `relationshipNote` column | VERIFIED | Queries `information_schema.columns` scoped to `DATABASE()`; throws naming migration 020 if absent; wired into `initializeDatabase()` in `backend/src/models/index.js` immediately after `sequelize.sync()`. `assertRequiredColumns.test.js` (2 tests) passes. |
| `.planning/REQUIREMENTS.md` | SEC-01 unchecked and annotated pending re-verification | VERIFIED | `grep -c "\[x\] \*\*SEC-01\*\*"` = 0; annotation references `/gsd:verify-work 32` as required. Given this verification now confirms CR-03 (the property SEC-01's text literally describes) is closed, SEC-01 is recommended for re-checking — see Requirements Coverage. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `register` (tokenless, every exit) | `finishTokenlessRegistration` | single try/catch wrapping the whole post-validation body | WIRED | Confirmed: `bcrypt.hash`, `findOne`, the existing-user branch, `createVerificationToken`, and `create` are all inside one `try`; both exits are `return await finishTokenlessRegistration(...)`. CR-03 fully closed. |
| `verifyEmail` zero-admin bootstrap | `env.adminEmail` | direct property read inside the `Number(adminCount) === 0` conditional | WIRED (gate) / NOT WIRED (outcome) | The gate correctly restricts eligibility to one address. But the write it guards (`{ role: 'ADMIN' }`) does not also grant `status: 'Active'`, so the thing the gate is protecting access to is itself non-functional. |
| `updateUser` (email-change path) | last-administrator guard | `otherVerifiedAdmins` count mirroring the role-change guard | WIRED (single-request) / NOT ATOMIC (concurrent) | Present and effective for sequential calls; bypassable under `Promise.all`-style concurrency because the count and the eventual `target.save()` are not inside a shared lock/transaction. |
| `models/index.js` (`initializeDatabase`) | `assertRequiredColumns.js` | awaited call immediately after `sequelize.sync()` | WIRED | Confirmed by grep and by reading the surrounding lines. |

### Data-Flow Trace (Level 4)

Not separately applicable — backend-only phase, no frontend component renders data from this round's changes.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Targeted regression suite for this round's changed files | `npm test -w backend -- src/resolvers/register.test.js src/resolvers/verifyEmail.test.js src/resolvers/updateUser.test.js src/config/assertRequiredColumns.test.js` | `4 test files passed`, `66 passed \| 2 skipped (68)` | PASS |
| ADMIN_EMAIL bootstrap writes `status` alongside `role`? | `sed -n '425,433p' backend/src/resolvers/user.resolver.js` | Only `{ role: 'ADMIN' }` is written; no `status` field present in the update call | FAIL — confirms Truth 6/gap 1 |
| `updateUser` guard runs inside a transaction/lock? | `sed -n '595,660p' backend/src/resolvers/user.resolver.js` | No `transaction:` or `lock:` option present anywhere in the function body | FAIL — confirms Truth 7/gap 2 |
| Login hard-requires `Active` status | `grep -n "status !== 'Active'" backend/src/resolvers/user.resolver.js backend/src/utils/auth.js` | Both `login` (resolver) and `getUserFromRequest` (auth.js) reject non-Active accounts | Confirms the promoted-but-Pending bootstrap account is unusable |
| README documents the (non-working) bootstrap as step 1 | `sed -n '182-186' README.md` | "Register the account whose email matches `ADMIN_EMAIL` and verify it. It is automatically assigned the `ADMIN` role." | Confirms the documentation/behavior mismatch |
| Working tree clean after review's mutation testing | `git status --porcelain` | Only pre-existing untracked `.vscode/` | Confirms no residual mutations leaked into the reviewed commit |

### Probe Execution

No conventional `scripts/*/tests/probe-*.sh` files exist in this repository and none are declared in Phase 32's plans/summaries/review. Skipped per Step 7c's discovery step.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| REG-02 | 32-03, 32-07 | `register` accepts no-token, creates Pending/unverified account | SATISFIED | Truth 1. Unaffected by this round's changes (32-07 declares REG-02 only because it touches the same account-lifecycle concern via `verifyEmail`, not because `register` itself changed). |
| REG-03 | 32-01, 32-03, 32-04, 32-06 | Note stored with account AND shown to admins at approval time | PARTIAL (correctly tracked) | Backend half satisfied; UI half correctly deferred to Phase 33, unchanged this round. |
| REG-05 | 32-04 | Unverified self-registration never in approval queue | SATISFIED | Truth 3, unaffected by this round. |
| REG-06 | 32-04 | Verifying moves it into the queue and notifies admins | SATISFIED | Truth 3, unaffected by this round. |
| REG-07 | 32-03 | Password/normalisation/verification-token code shared, not duplicated weaker | SATISFIED | Truth 4, unaffected by this round. |
| SEC-01 | 32-03, 32-05, 32-08 | Enumeration-safe response + real owner notified | SATISFIED (checkbox currently `[ ]`, recommend re-checking) | Truth 2 — CR-03 is genuinely closed by Plan 32-08, confirmed by source read and passing regression tests. REQUIREMENTS.md's own annotation defers this exact re-check to this verification pass; the specific property SEC-01's text describes (uniform response + owner notification) is now fully true. Note: this does NOT mean the phase overall passes — Truths 6/7 fail for reasons outside SEC-01's literal text. |
| SEC-02 | 32-03 | Existing per-IP rate limit covers tokenless path | SATISFIED | Truth 5, unaffected by this round. |
| SEC-03 | 32-01, 32-02, 32-03, 32-06 | Note length-capped server-side + rendered safely everywhere shown | PARTIAL (correctly tracked) | Unaffected by this round. |

No orphaned requirements: all 8 requirement IDs declared across the eight plans (32-01 through 32-08) match the 8 IDs REQUIREMENTS.md maps to Phase 32 (backend) / Phase 33 (UI, for REG-03/SEC-03).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/src/resolvers/user.resolver.js` | 430-432 | ADMIN_EMAIL bootstrap writes `role` only, never `status` | **Blocker** | Truth 6 — the phase's own documented fresh-deploy bootstrap path is unusable. |
| `backend/src/resolvers/user.resolver.js` | 610-615, 640-647 | Last-administrator guards (role-change and email-change) are non-transactional count-then-save | **Blocker** | Truth 7 — TOCTOU-bypassable under concurrent requests, defeating the "never below one verified admin" invariant this same phase's `verifyEmail` fix correctly uses a locking transaction for. |
| `backend/src/resolvers/updateUser.test.js` | 284-305 | New "does not block an already-unverified administrator..." test is vacuous — confounded by a co-present verified `backupAdmin`, so the `emailVerified === true` clause is never exercised | Warning | 32-REVIEW.md WR-01 (this round's numbering). Deleting that clause and re-running still passes 17/17. |
| `backend/src/resolvers/register.test.js` | 571-604 | "WR-01 over-floor branch" test's only assertion (`capturedDelays` length 0) is satisfied by any broken stack-frame filter, not only correct floor-skip behavior | Warning | 32-REVIEW.md WR-02. Verified reviewer's claim structurally (filter depends on exact stack index, no self-check that the filter is itself matching anything). |
| `backend/src/resolvers/register.test.js` | 479-569 | WR-01 timing test uses the real clock with a hardcoded 100ms margin and a 400ms floor against real DB latency | Warning | 32-REVIEW.md WR-03 — flaky-by-construction risk on a loaded CI runner. |
| `backend/src/models/index.js` | 125-133 | Comment claims `assertRequiredColumns` wiring is "NOT exercised by npm test" — factually wrong (`test/helpers.js` imports `app`, which top-level-awaits `initializeDatabase()`) | Warning | 32-REVIEW.md WR-04 — misleads future maintainers about test coverage of this boot-time check. |
| `backend/src/config/assertRequiredColumns.js` | 17-28 | Hardcodes exactly one column (`relationshipNote`); the docblock's own stated rationale (silent data loss on missing columns) applies equally to `status`, `emailVerificationToken`, etc. | Warning | 32-REVIEW.md WR-05 — the next manual migration reopens the exact silent-drop failure mode this check exists to prevent. |
| `backend/src/config/env.js`, `env/*.env` | 34; all four env files | `ADMIN_EMAIL` is security-critical, defaults empty everywhere (including `remote.env`), no boot-time format validation | Warning | 32-REVIEW.md WR-06 — combined with the Truth 6 blocker, an operator following README hits two independent silent failure modes. |
| `backend/src/resolvers/user.resolver.js` | 325 | Catch-block logs `err?.name, err?.message` only, dropping the stack; `SequelizeUniqueConstraintError` messages are hardcoded to `"Validation error"`, making the most likely real failure (duplicate-email race) non-diagnosable from logs alone | Warning | 32-REVIEW.md WR-07 — trades away diagnosability without fully achieving the PII goal (`SequelizeDatabaseError` messages can still echo registrant-supplied bytes). |
| `backend/src/resolvers/user.resolver.js` | 257-322 | No email-format validation before the guarded region — only presence (`if (!email)`) is checked; a typo'd address silently returns the uniform success message with no account created | Warning | 32-REVIEW.md WR-08 — silent data loss for a normal user typo, not an attack. |
| `backend/src/resolvers/register.test.js` | 15-16 | Duplicate import of `../utils/auth.js` (named + namespace) | Info | 32-REVIEW.md IN-01. |
| `backend/src/config/assertRequiredColumns.js` | — | Lives in `config/` but is a schema/model concern, called from `models/index.js` | Info | 32-REVIEW.md IN-02. |

No `TBD`/`FIXME`/`XXX` debt markers found in any file modified by Plans 32-07/32-08 (the `TBD` matches in `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, and `.planning/STATE.md` are pre-existing planning-doc placeholders for other phases/branches, unrelated to this round's delivered code).

### Human Verification Required

None. Every truth for this phase is mechanically verifiable via source inspection and the automated test suite; this remains a backend-only phase with no new UI surface. (The two blockers were also independently confirmed by executed proof in `32-REVIEW.md`, not by narration.)

### Gaps Summary

**Two blocking gaps remain. Both are NEW defects introduced by this round's own gap-closure fixes (Plans 32-07/32-08), confirmed by the just-completed code review and independently re-confirmed here by reading the source directly:**

1. **The CR-01 fix's own "safe path to a first admin" does not work.** `verifyAndPromote`'s `ADMIN_EMAIL`-gated bootstrap (`user.resolver.js:430-432`) correctly restricts *eligibility* to one operator-configured address, but the promotion write sets only `role: 'ADMIN'`, never `status`. Every tokenless self-registrant is created `'Pending'`, and the separate auto-activation block that would flip that to `'Active'` is gated on the presence of an `Invitation` row, which a self-registrant never has. `login` and `getUserFromRequest` both hard-require `status === 'Active'`. The result: the one documented, "safe" path to a first admin (README.md step 1, and this exact scenario) produces a permanently locked-out account with no Active admin left to approve them. The new regression test for this path asserts only `role === 'ADMIN'`, so it stays green while the workflow it names does not work — the project's own recurring failure pattern (green tests hiding an authz/lifecycle gap) recurring for at least a sixth documented time.

2. **The updateUser last-administrator guard Plan 32-07 added is TOCTOU-bypassable.** It performs a non-transactional `count` followed by a `save()` with no lock held across the gap, unlike the `FOR UPDATE` pattern this same phase correctly used in `verifyEmail`. Two concurrent `updateUser` email changes (or a mixed role-demotion + email-change race, since the pre-existing role guard shares the identical flaw) both pass the guard and can drive verified admins to zero — reopening exactly the zero-admin bootstrap window this phase's CR-01 fix was chartered to close. This was measured by the code review with actual concurrent requests, not hypothesized.

**Everything else this phase and its gap-closure plans delivered remains genuinely implemented, tested, and regression-clean:** the tokenless branch's core behavior (Truth 1), the now-fully-closed uniform-response guarantee (Truth 2, CR-03), the approval-queue visibility rules and admin-notification wiring (Truth 3), the shared password/normalisation/token code (Truth 4), the rate limit and note length cap (Truth 5), and the fresh-deployment privilege-escalation window from the *original* CR-01 report (now closed by the `ADMIN_EMAIL` gate itself, independent of the two new defects above). The targeted regression suite for every file touched this round passes cleanly (66 passed, 2 skipped, 0 failed), and the working tree is clean.

Both remaining gaps are scoped and mechanical to fix — 32-REVIEW.md's CR-01 and CR-02 sections (this round's numbering) each include a ready-to-adapt patch: add `status: 'Active'` to the same bootstrap write; wrap both last-administrator guards in one transaction with a locking read, mirroring `verifyEmail`'s own pattern in this same file.

---

_Verified: 2026-09-01T10:14:44Z_
_Verifier: Claude (gsd-verifier)_
