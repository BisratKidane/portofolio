---
phase: 32-tokenless-registration
verified: 2026-09-02T15:30:00Z
status: gaps_found
score: 5/8 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 5/7
  gaps_closed:
    - "Truth 6, original manifestation (ADMIN_EMAIL bootstrap grants role but not status, leaving the promoted operator permanently locked out) -- closed by Plan 32-09. Confirmed by direct source read of backend/src/resolvers/user.resolver.js:457-460: the write is now `{ role: 'ADMIN', status: 'Active', approvedAt: new Date() }` in one models.User.update call. Independently re-confirmed by an EXECUTED reproduction in this verification session (not merely reading the diff): registering an ADMIN_EMAIL-matching account, verifying it, and calling getUserFromRequest(token) resolves a non-null, Active ADMIN user -- the round trip genuinely works now for a legitimate fresh-deploy operator."
    - "Truth 7, original manifestation (updateUser's role-change/email-change last-administrator guards were a non-transactional count-then-save, TOCTOU-bypassable by two concurrent requests) -- closed by Plan 32-10. Confirmed by direct source read of user.resolver.js:642-722: both guards now run inside one sequelize.transaction with a locking `findByPk(..., { lock: t.LOCK.UPDATE })` target read and a locking `SELECT ... FOR UPDATE` admin count (otherVerifiedAdminCount), sharing verifyEmail's module-scope isDeadlock retry-once wrapper. The two new Promise.all concurrency regression tests in updateUser.test.js pass, and the full backend suite is green (511 passed / 3 skipped, independently re-run in this session)."
  gaps_remaining:
    - "NEW manifestation of Truth 6 (32-REVIEW.md CR-01, second-round numbering): 32-09's fix dropped the status precondition entirely -- the bootstrap write is unconditional (`where: { id: user.id }`, no status filter), so a Rejected or Disabled account holding a live, unconsumed verification token is unconditionally resurrected to `role: 'ADMIN', status: 'Active'` if its email happens to match ADMIN_EMAIL. The in-code comment's unreachability argument (user.resolver.js:438-456) is disproven: neither `updateUser` (619-731) nor `resendVerificationEmail` (542-568) has any account-status guard, so either can put a Rejected/Disabled account back into possession of a live token. Independently REPRODUCED in this verification session (see Truth 6 evidence) -- not merely re-narrated from 32-REVIEW.md."
    - "NEW, broader manifestation of Truth 7 (32-REVIEW.md CR-03, second-round numbering): both last-administrator counts (verifyEmail's admin-slot count at :426-429, updateUser's otherVerifiedAdminCount at :651-657) filter on `role = 'ADMIN' AND emailVerified = true` only, omitting `status`. isFunctioningAdmin (utils/auth.js:62-64), the codebase's own definition of a usable admin, additionally requires `status === 'Active'`. This fails DETERMINISTICALLY in ordinary sequential use -- no concurrency needed at all -- which is a more severe defect than the TOCTOU 32-10 fixed. Independently REPRODUCED in this verification session with two purely sequential, non-racing updateUser calls (promote a Pending self-registrant to ADMIN, then demote the sole real admin) driving functioning admins to zero while the guard's own query still reports 1, permanently blocking the ADMIN_EMAIL recovery path too."
    - "NEW this round, not present in the previous verification (32-REVIEW.md CR-02, second-round numbering): the tokenless register path validates `name` and `relationshipNote` length before the guarded try/catch, but validates `email` for truthiness only -- format and length are left to Sequelize's `isEmail` validator and the VARCHAR(255) column, both of which throw INSIDE the try and are swallowed into the uniform success message. Independently REPRODUCED: registering with `ada@exmaple` (no TLD) returns the identical success message with zero rows created and no signal to the registrant or a distinguishable signal to the operator."
  regressions: []
gaps:
  - truth: "A safe, explicit, USABLE path to a first ADMIN exists (carried forward from the previous verification's Truth 6; 'safe' and 'usable' are both required, not just one)."
    status: failed
    reason: >
      Plan 32-09 correctly fixed usability (the bootstrap now grants `status: 'Active'`
      alongside `role: 'ADMIN'` in one write, and a real account with a real email now
      authenticates immediately after verification -- confirmed by an executed
      reproduction in this session). But the fix removed the status precondition
      entirely instead of scoping it the way the adjacent invited-registrant
      auto-activation block does (`WHERE ... status = 'Pending'`, user.resolver.js:501).
      The bootstrap's `models.User.update({ role: 'ADMIN', status: 'Active', approvedAt },
      { where: { id: user.id }, transaction: t })` at user.resolver.js:457-460 has no
      status filter, so ANY account matching ADMIN_EMAIL with a live, unconsumed
      verification token is promoted, regardless of whether that account is currently
      Rejected or Disabled. The 26-line in-code comment (user.resolver.js:438-456)
      argues this is unreachable because "no reachable path lets a Rejected/Disabled
      account re-enter verifyEmail and re-trigger this block" -- that argument is false:
      neither `updateUser` (619-731, no status guard anywhere) nor
      `resendVerificationEmail` (542-568, guards only on `!user || user.emailVerified`)
      checks account status before reissuing a live verification token. I independently
      reproduced the exact resurrection this session (not merely re-reading
      32-REVIEW.md's CR-01 narrative): a Rejected account holding a manufactured live
      token, presented to `verifyEmail` with `env.adminEmail` matching its address,
      came back as `{ role: 'ADMIN', status: 'Active', emailVerified: true }` --
      full GraphQL response and DB state captured in this session's test run. This is
      the opposite of "safe": the one documented recovery mechanism for a zero-admin
      deployment can also resurrect an administratively-denied account to full admin
      access.
    artifacts:
      - path: backend/src/resolvers/user.resolver.js
        issue: >
          Lines 457-460: the bootstrap write has no status precondition. Lines 438-456:
          the comment's unreachability argument is disproven by the missing guards in
          updateUser and resendVerificationEmail (see next gap's artifacts).
      - path: backend/src/resolvers/verifyEmail.test.js
        issue: >
          The "zero-admin ADMIN bootstrap gated on ADMIN_EMAIL" describe block
          (lines ~289-357) has no test presenting a Rejected or Disabled account's
          token to the bootstrap path -- the single most security-relevant case this
          fix introduced is entirely untested.
    missing:
      - "Scope the bootstrap write's WHERE clause to only promote from a promotable status, mirroring the invited-registrant auto-activation block a few lines below it: `where: { id: user.id, status: { [Op.in]: ['Pending', 'Active'] } }`, and treat a 0-affected-rows result as \"promote nobody\" rather than silently succeeding."
      - "Independently close the two reissue paths so the invariant does not rest on the bootstrap's WHERE clause alone: add a status check to updateUser's email-change path (reject editing a Rejected/Disabled target, or at minimum refuse to reissue a verification token for one) and to resendVerificationEmail (silently no-op for Rejected/Disabled, matching its existing enumeration-silent shape)."
      - "Add a regression test presenting a Rejected (and a Disabled) account's live token to verifyEmail with ADMIN_EMAIL matching, asserting the account's status and role are UNCHANGED afterward."
  - truth: "The last-administrator invariant (never below one verified, functioning admin, so the app can't be locked out of its own administration or have the zero-admin bootstrap reopened) holds -- under concurrency AND in ordinary sequential use."
    status: failed
    reason: >
      Plan 32-10 correctly closed the TOCTOU concurrency window (both guards now run
      inside a locking transaction; the two new Promise.all regression tests pass, and
      I independently re-ran the full backend suite to confirm no regressions: 511
      passed / 3 skipped). But both admin-counting queries it hardened --
      verifyEmail's admin-slot count (user.resolver.js:426-429) and updateUser's
      otherVerifiedAdminCount (user.resolver.js:651-657) -- filter on
      `role = 'ADMIN' AND emailVerified = true` and omit `status` entirely.
      isFunctioningAdmin (utils/auth.js:62-64), the codebase's own single named
      definition of a usable administrator, additionally requires
      `status === 'Active'`; the comment at user.resolver.js:483-485 falsely claims
      the guards use "the same functioning-admin definition (isFunctioningAdmin...) as
      the admin-slot count and updateUser's last-administrator guard" -- neither call
      site does, and utils/auth.js's own comment (lines 53-61) says so. This means a
      Pending, Rejected, or Disabled ADMIN row satisfies "another administrator
      survives" while being completely unable to administer anything (login and
      getUserFromRequest both hard-require status === 'Active'). I independently
      REPRODUCED this in this verification session with a purely SEQUENTIAL scenario
      requiring no race at all: (1) the sole functioning admin promotes a Pending,
      email-verified self-registrant to ADMIN via updateUser (an entirely ordinary
      admin action, and role-promotion-to-ADMIN has no status precondition of its
      own), (2) the sole functioning admin demotes themselves to USER -- the guard's
      own query sees the newly-promoted-but-still-Pending account as "1 other admin"
      and lets the demotion through. Captured DB state after both calls: zero admins
      pass `isFunctioningAdmin` (role=ADMIN AND status=Active AND emailVerified=true
      count = 0), while the guard's own raw query still reports 1 -- and recovery via
      the ADMIN_EMAIL bootstrap is also permanently blocked, because ITS admin-slot
      count has the identical omission and also sees the stranded Pending admin as
      "1", so `Number(adminCount) === 0` is never true again. This is a stronger
      failure than the original TOCTOU: it requires no concurrent requests, just two
      ordinary sequential admin-panel actions in an unfortunate order.
    artifacts:
      - path: backend/src/resolvers/user.resolver.js
        issue: >
          Lines 426-429 (verifyEmail admin-slot count) and 651-657 (updateUser
          otherVerifiedAdminCount) both use `role = 'ADMIN' AND emailVerified = true`
          with no `status` filter, unlike isFunctioningAdmin (utils/auth.js:62-64)
          which the file's own comment (incorrectly) claims both sites share.
      - path: backend/src/resolvers/updateUser.test.js
        issue: >
          No test exercises role-promotion of a Pending user to ADMIN followed by a
          role-demotion or email-change of the previously-sole admin -- the exact
          sequential (non-concurrent) path that reaches zero functioning admins. The
          new CR-02/gap-closure concurrency tests only cover the race between two
          ALREADY-Active-and-verified admins, not the Pending-ADMIN-row miscount.
    missing:
      - "Add `status = 'Active'` to both raw SQL admin counts: `SELECT COUNT(*) ... WHERE role = 'ADMIN' AND status = 'Active' AND emailVerified = true [AND id <> :id] FOR UPDATE`, matching isFunctioningAdmin's three-part definition exactly."
      - "Correct the false comment at user.resolver.js:483-485 (and the stale line-number cross-references in utils/auth.js:56-58, which still point at ~263-264/~425-428 instead of the current :426-429/:651-657) so a future reader isn't misled into believing this invariant already holds."
      - "Add a regression test: promote a Pending, verified user to ADMIN, then attempt to demote or email-change the previously-sole Active admin, asserting the guard BLOCKS it (not merely that a concurrent race is blocked)."
  - truth: "The tokenless register path safely creates an account for a legitimate registrant rather than silently discarding the attempt when the input is a plausible-but-malformed email (the phase goal's 'safely creates' clause, applied to the one free-text field with no dedicated validation)."
    status: failed
    reason: >
      `assertRelationshipNoteLength` and `assertRegistrationName` both validate their
      inputs BEFORE the guarded try/catch specifically so their failures produce an
      actionable error rather than being swallowed into the uniform success message
      (user.resolver.js:260-261). `email` gets only a truthiness check
      (`if (!email) throw ...`, line 262) and normalization (line 264); format
      (Sequelize's `isEmail` validator, User.js:26) and length (implicit
      VARCHAR(255)) are left to the model layer, and the model layer throws INSIDE
      the try block (`models.User.create` at line 297, inside the try opened at line
      276). The catch-all at 322-334 converts that validation error into the
      identical `"Registration received. Verify your email to activate your
      account."` response, with zero rows created and only a
      `console.error('Tokenless registration failed:', err?.name, err?.message)` line
      indistinguishable in shape from an infrastructure failure. I independently
      REPRODUCED this in this verification session: registering with
      `email: "ada@exmaple"` (no TLD -- a completely ordinary typo) returned the exact
      success message with a captured `User.count() === 0` immediately afterward.
      This is precisely the failure mode `assertRequiredColumns.js`'s own docblock
      calls unacceptable ("silently accepting and dropping every self-registration
      forever") -- the phase closed one instance of that class of bug and left a far
      more common one open on the same code path. This is not a security/enumeration
      concern (email format depends only on caller input, never account state), so it
      does not conflict with SEC-01 -- it is a plain correctness gap in "safely
      creates."
    artifacts:
      - path: backend/src/resolvers/user.resolver.js
        issue: >
          Line 262 checks only `!email`; format/length validation is absent before the
          try block that opens at line 276, unlike the sibling name/note guards at
          lines 260-261.
      - path: backend/src/resolvers/register.test.js
        issue: >
          No test exercises a malformed (missing-TLD, empty-after-trim) or
          over-255-char email on the tokenless path; the existing 255-char boundary
          test (line 351) only tests the exact-cap-length success case, not the
          over-cap or malformed-format failure cases.
    missing:
      - "Add backend/src/utils/emailPolicy.js mirroring namePolicy.js's shape (normalize, length-cap at 255, format-check with the same isEmail-equivalent regex Sequelize uses) and call it before the try block, alongside assertRegistrationName."
      - "Add regression tests: a missing-TLD email, an empty-after-trim (whitespace-only) email, and an over-255-char email should each throw an actionable GraphQL error on the tokenless path -- not silently succeed with zero rows created."
deferred: []
human_verification: []
---

# Phase 32: Tokenless Registration Verification Report

**Phase Goal:** `register` accepts a call with no invitation token and safely creates a `Pending`, unverified account — reusing the invited path's password rules, email normalisation, and verification-token handling, with enumeration-safe responses, admin notification on verification, and the existing per-IP rate limit applied.
**Verified:** 2026-09-02T15:30:00Z
**Status:** gaps_found
**Re-verification:** Yes — after gap closure (Plans 32-09, 32-10, following 32-REVIEW.md's fresh code review of those two fixes)

## Goal Achievement

Truths 1-5 map to ROADMAP.md's five numbered Success Criteria. Truths 6-8 are derived
must-haves carried forward from the phase's "safely creates" clause. Truths 6 and 7 are
the same two must-haves the previous verification round flagged as blockers (the
gap-closure plans fixed the ORIGINAL manifestation of each, but 32-REVIEW.md's
independent code review — executed after 32-09/32-10 landed — found each guard reopened
in a NEW way). Truth 8 is new this round.

**This verification did not simply re-read 32-REVIEW.md's narrative and trust it.** All
three of 32-REVIEW.md's blockers were independently reproduced in this session by
writing and executing throwaway integration tests directly against the test database
(reverted before finishing — the working tree is unmodified by this verification). Each
reproduction's actual captured output is quoted in the evidence below.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `register` with no token creates a `Pending`, unverified account from the user's own email, storing the relationship note | VERIFIED | `user.resolver.js:259-321` tokenless branch unaffected by Plans 32-09/32-10 (they touch only `verifyEmail` and `updateUser`). `register.test.js` passing as part of the 511/514 full-suite re-run. Core creation mechanics for well-formed input are correct; see Truth 8 for the malformed-input gap. |
| 2 | An email that already has an account gets a response indistinguishable from one that does not, and the real owner is emailed that someone tried to register with their address | VERIFIED | Unaffected by 32-09/32-10. `user.resolver.js:276-321`: the single `try` still wraps `bcrypt.hash`, `findOne`, the existing-user branch, `createVerificationToken`, and `create`; every exit routes through `finishTokenlessRegistration`. Re-confirmed by direct source read this session. |
| 3 | An unverified self-registration is absent from the approval queue; verifying the email puts it there and notifies administrators | VERIFIED | `pendingApprovals` (line 159-165, filters `status: 'Pending', emailVerified: true`) and `notifyAdminsOfPendingRegistration` (line 534-538, gated on `!associatedInvitation && user.status === 'Pending'`) are byte-for-byte unaffected by Plans 32-09/32-10. |
| 4 | Password rules, email normalisation, and verification-token handling on the tokenless path run the same code as the invited path — no second, weaker implementation | VERIFIED | `assertPasswordStrength` (top of `register`, shared), model-level `beforeValidate` email normalization (User.js), and `createVerificationToken`/`hashVerificationToken`/`verificationTokenExpiry` (utils/auth.js) remain the single shared implementation, unaffected by this round's changes. |
| 5 | The existing per-IP registration rate limit applies to the tokenless path, and the relationship note is length-capped server-side | VERIFIED | `config/rateLimits.js: register: { max: 5, windowMs: 60*60*1000 }` applies to the `register` mutation field regardless of branch. `assertRelationshipNoteLength` (`relationshipNotePolicy.js:6-8`, capped at 500 chars) still called at `user.resolver.js:260`, unaffected. |
| 6 | A safe, explicit, USABLE path to a first ADMIN exists | **FAILED (new manifestation)** | Usability is now genuinely fixed (Plan 32-09, confirmed by an executed getUserFromRequest round-trip in this session). Safety is not: the bootstrap write (`user.resolver.js:457-460`) has no status precondition, and I independently reproduced a Rejected account being resurrected to `role: 'ADMIN', status: 'Active'` via a manufactured live token — matching 32-REVIEW.md's CR-01 (second-round numbering) exactly. See gap below. |
| 7 | The last-administrator invariant holds even under concurrent requests | **FAILED (new, broader manifestation)** | Concurrency is now genuinely fixed (Plan 32-10, confirmed by the two new Promise.all tests passing and a full suite re-run: 511/514). But both admin counts omit `status`, so the invariant fails even WITHOUT concurrency. I independently reproduced two sequential, non-racing `updateUser` calls driving functioning admins to zero while the guard's own query reported 1 — matching 32-REVIEW.md's CR-03 (second-round numbering). See gap below. |
| 8 | The tokenless register path safely creates an account rather than silently discarding a legitimate attempt with a malformed email | **FAILED (new this round)** | `email` gets only a truthiness check before the guarded try/catch, unlike `name`/`relationshipNote`. I independently reproduced: registering with `ada@exmaple` returns the identical success message with `User.count() === 0` — matching 32-REVIEW.md's CR-02 (second-round numbering). See gap below. |

**Score:** 5/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/resolvers/user.resolver.js` (`verifyAndPromote` bootstrap) | Zero-admin bootstrap that is both usable AND safe (never promotes a non-promotable account) | PARTIAL — usable, not safe | Write at lines 457-460 grants `status: 'Active'` (usability fixed) but has no status precondition on `where` (safety not fixed). See Truth 6. |
| `backend/src/resolvers/verifyEmail.test.js` | Regression coverage for the bootstrap including the Rejected/Disabled resurrection case | STUB (missing the security-critical case) | 3 bootstrap-specific tests (unset/mismatch/match) all pass and now assert the full round trip (status + `getUserFromRequest`), but none present a Rejected or Disabled account's token — the exact case this round's blocker concerns. |
| `backend/src/resolvers/user.resolver.js` (`updateUser` guards) | Last-administrator guards correct under BOTH concurrency and sequential use | PARTIAL — concurrency fixed, correctness gap remains | Lines 642-722: transaction + locking read genuinely closes the TOCTOU (Truth 7's original manifestation). The counting query itself (lines 651-657) is still wrong regardless of locking, because it doesn't filter `status`. See Truth 7. |
| `backend/src/resolvers/updateUser.test.js` | Regression coverage for the last-administrator guard including non-functioning-admin miscounting | STUB (missing the correctness-critical case) | 19 tests pass, including 2 new concurrency tests (Plan 32-10). None test promoting a Pending user to ADMIN and then demoting/email-changing the sole real admin — the sequential case this round's blocker concerns. |
| `backend/src/utils/emailPolicy.js` | Shared email format/length validation for the tokenless path, mirroring `namePolicy.js` | MISSING | No such file exists. `email` validation on the tokenless path is limited to a truthiness check; format/length are left to the model layer inside the guarded try/catch. See Truth 8. |
| `.planning/REQUIREMENTS.md` | SEC-01 unchecked and annotated pending re-verification | VERIFIED (recommend re-checking) | `grep -c "\[x\] \*\*SEC-01\*\*"` = 0. Truth 2 (the property SEC-01's text literally describes) is genuinely satisfied and unaffected by this round's changes; SEC-01 can be checked. This does not mean the overall phase passes — Truths 6/7/8 fail for reasons outside SEC-01's literal text. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `verifyEmail` bootstrap write | account's current `status` | a `where`-clause precondition | **NOT WIRED** | The write's `where` clause is `{ id: user.id }` only (`user.resolver.js:459`) — no status filter, unlike the invited-registrant auto-activation block three lines below it (`WHERE ... status = 'Pending'`, line 501). |
| `updateUser`/`resendVerificationEmail` | account's current `status` | a guard before token reissue | **NOT WIRED** | Neither mutation reads `target.status`/`user.status` anywhere in its body (confirmed by exhaustive read of both functions, lines 542-568 and 619-731). |
| `verifyEmail`/`updateUser` admin counts | `isFunctioningAdmin`'s definition | shared predicate or matching WHERE clause | **NOT WIRED** | Both raw SQL counts (lines 426-429, 651-657) use `role = 'ADMIN' AND emailVerified = true`; `isFunctioningAdmin` (utils/auth.js:62-64) additionally requires `status === 'Active'`. The in-code comment claiming they're unified (line 483-485) is itself contradicted by `utils/auth.js`'s own comment (lines 53-61). |
| tokenless `register` | email format/length validation | a guard before the try/catch | **NOT WIRED** | `name`/`relationshipNote` are validated at lines 260-261 (outside the try); `email` is not (line 262 is a truthiness check only; format/length validation happens implicitly inside the try via the model layer, and its failures are swallowed). |
| `updateUser` (email-change path, concurrent) | last-administrator guard | `sequelize.transaction` + `SELECT ... FOR UPDATE` | WIRED | Genuinely fixed by Plan 32-10 — confirmed by source read (lines 642-657) and by two passing `Promise.all` regression tests. |
| `verifyEmail` bootstrap | `env.adminEmail` gate | direct property read inside the `Number(adminCount) === 0` conditional | WIRED (gate) | The eligibility gate itself is correctly scoped to one operator-configured address; the flaw is downstream of this gate, in the write it guards. |

### Data-Flow Trace (Level 4)

Not applicable — backend-only phase, no frontend component renders data from this round's changes (confirmed: `grep -rn "pendingApprovals" frontend/src` still returns nothing, and `Register.jsx`/`AuthContext.jsx` still don't reach the tokenless branch — WR-11 from 32-REVIEW.md, unaffected by this round).

### Behavioral Spot-Checks

All three checks below were EXECUTED in this verification session (throwaway integration tests written against the live test database, run via `npx vitest run`, then deleted — the working tree is unmodified). This is stronger evidence than re-reading 32-REVIEW.md's own narrative, per this project's documented pattern of green tests hiding authz/lifecycle gaps.

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Bootstrap resurrects a Rejected account (Truth 6) | Manufactured a Rejected, `emailVerified: false` account holding a live token matching `env.adminEmail`; called `verifyEmail` | `target after verifyEmail: status=Active role=ADMIN emailVerified=true` — full GraphQL response captured, including a valid JWT | **FAIL** — confirms Truth 6/gap 1 |
| Last-admin guard miscounts a Pending ADMIN row, sequentially (Truth 7) | Promoted a Pending, verified user to ADMIN via `updateUser`, then demoted the sole real admin via `updateUser` (no concurrency) | `admin.role after demote attempt: USER`; `functioningAdminCount: 0`; `rawAdminCount (the guard's own query): 1` | **FAIL** — confirms Truth 7/gap 2 |
| Tokenless register silently drops a malformed email (Truth 8) | Called `register` with `email: "ada@exmaple"` (no TLD) | `response: {"data":{"register":{"message":"Registration received..."}}}`; `user rows created: 0`; stderr showed only `Tokenless registration failed: SequelizeValidationError Validation error: Validation isEmail on email failed` | **FAIL** — confirms Truth 8/gap 3 |
| Full backend regression suite | `npm test --workspace=backend` | `Test Files 68 passed (68)`, `Tests 511 passed \| 3 skipped (514)` | PASS (green, but does not exercise any of the three scenarios above — the suite's own green state is why these defects survived a full test cycle) |

### Probe Execution

No conventional `scripts/*/tests/probe-*.sh` files exist in this repository and none are declared in Phase 32's plans/summaries/review. Skipped per Step 7c's discovery step.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| REG-02 | 32-03, 32-07, 32-09, 32-10 | `register` accepts no-token, creates Pending/unverified account | SATISFIED (literal text); BLOCKED at the "safely" clause | Truth 1/core creation mechanics hold for well-formed input. However, 32-07/32-09/32-10 all declared REG-02 as their requirement for the admin-bootstrap/last-admin-guard work this phase took on as part of opening `register` to anonymous callers — that broader safety obligation is where Truths 6/7/8 fail. Recommend NOT checking REG-02 as fully done until Truths 6-8 close. |
| REG-03 | 32-01, 32-03, 32-04, 32-06 | Note stored with account AND shown to admins at approval time | PARTIAL (correctly tracked) | Backend half satisfied; UI half correctly deferred to Phase 33, unaffected this round. |
| REG-05 | 32-04 | Unverified self-registration never in approval queue | SATISFIED | Truth 3, unaffected this round. |
| REG-06 | 32-04 | Verifying moves it into the queue and notifies admins | SATISFIED | Truth 3, unaffected this round. |
| REG-07 | 32-03 | Password/normalisation/verification-token code shared, not duplicated weaker | SATISFIED | Truth 4, unaffected this round. |
| SEC-01 | 32-03, 32-05, 32-08 | Enumeration-safe response + real owner notified | SATISFIED (checkbox currently `[ ]`, recommend checking) | Truth 2, fully closed by Plan 32-08 in the previous round and unaffected by 32-09/32-10. This is independent of the phase's overall status (Truths 6-8 still block). |
| SEC-02 | 32-03 | Existing per-IP rate limit covers tokenless path | SATISFIED | Truth 5, unaffected this round. |
| SEC-03 | 32-01, 32-02, 32-03, 32-06 | Note length-capped server-side + rendered safely everywhere shown | PARTIAL (correctly tracked) | Unaffected this round. |

No orphaned requirements: all 8 requirement IDs declared across the ten plans (32-01 through 32-10) match the IDs REQUIREMENTS.md maps to Phase 32 (backend) / Phase 33 (UI, for REG-03/SEC-03).

**Roadmap-scope check (Step 9b):** Phase 34's success criteria (ADMIN-01/02/03, SEC-04/05) cover the public-signup on/off switch and adversarial authz tests for invite/approve/reject/register-while-off — they do not mention the last-administrator invariant, the ADMIN_EMAIL bootstrap's account-status precondition, or email-format validation. No later phase's goal or success criteria specifically or plausibly cover Truths 6, 7, or 8, so none of this round's gaps are deferred.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/src/resolvers/user.resolver.js` | 457-460 | ADMIN_EMAIL bootstrap write has no status precondition | **Blocker** | Truth 6 — resurrects Rejected/Disabled accounts to Active ADMIN. Independently reproduced this session. |
| `backend/src/resolvers/user.resolver.js` | 426-429, 651-657 | Last-administrator admin counts omit `status`, contradicting `isFunctioningAdmin` | **Blocker** | Truth 7 — fails deterministically in sequential use, not just under a race. Independently reproduced this session. |
| `backend/src/resolvers/user.resolver.js` | 262 | Tokenless register validates `email` for truthiness only; format/length checked inside the guarded try/catch | **Blocker** | Truth 8 — malformed/over-length emails silently produce zero rows with a false-success response. Independently reproduced this session. |
| `backend/src/resolvers/user.resolver.js` | 483-485 | Comment falsely claims the admin counts share `isFunctioningAdmin`'s definition; `utils/auth.js:56-58` explicitly documents that they don't | Warning | 32-REVIEW.md WR-14 (confirmed by direct source read). An incorrect comment asserting a security invariant the code doesn't implement is part of why CR-01/CR-03 survived two prior gap-closure rounds. |
| `backend/src/utils/auth.js` | 56-58 | Comment cites stale line numbers (`~263-264`, `~425-428`) for call sites now at `:426-429`/`:651-657` | Warning | 32-REVIEW.md WR-14(3), confirmed. Line-number comments rot on every edit in a file with a ~1:1 comment-to-code ratio. |
| `backend/src/resolvers/user.resolver.js` | 542-568, 619-731 | `resendVerificationEmail` and `updateUser` have no account-status precondition anywhere | Warning | 32-REVIEW.md WR-06, confirmed by exhaustive read of both functions. This is the enabling half of the Truth 6 blocker. |
| `backend/src/resolvers/user.resolver.js` | 206 vs 261 | Invited `register` branch never calls `assertRegistrationName`; only the tokenless branch does | Warning | 32-REVIEW.md WR-09, confirmed (grep shows `assertRegistrationName` called once, at line 261 only). Blank/over-length names and raw DB errors are still possible on the invited branch. |
| `backend/src/resolvers/user.resolver.js` | 119-120, 514, 720 | `isDeadlock` matches only `ER_LOCK_DEADLOCK`; `ER_LOCK_WAIT_TIMEOUT` (arguably more likely given the unindexed `FOR UPDATE` scan) rethrows raw MySQL text to an unauthenticated `verifyEmail` caller | Warning | 32-REVIEW.md WR-02/WR-03, confirmed by grep (no other error-code handling present). |
| `backend/src/resolvers/user.resolver.js`, `updateUser.test.js` | — | New CR-02(gap-closure)/32-10 concurrency tests use bare `Promise.all`, a technique `verifyEmail.test.js` itself documents as unable to reliably force interleaving | Warning | 32-REVIEW.md WR-04. Not independently re-executed under load in this session, but the test file's own reasoning (used elsewhere in the same file) supports the concern. |
| `backend/src/resolvers/user.resolver.js` | 241 vs 99/130 | Invited branch hardcodes the success-message string literal instead of referencing `TOKENLESS_REGISTER_MESSAGE` | Warning | 32-REVIEW.md WR-15, confirmed (identical string duplicated, no shared constant). |

No `TBD`/`FIXME`/`XXX` debt markers found in `user.resolver.js`, `verifyEmail.test.js`, or `updateUser.test.js` (the three files Plans 32-09/32-10 modified) — confirmed by grep in this session, exit code 1 (no matches).

### Human Verification Required

None. Every truth for this phase is mechanically verifiable via source inspection and executed reproduction; this remains a backend-only phase with no new UI surface.

### Gaps Summary

**Three blocking gaps remain, all newly surfaced by 32-REVIEW.md's fresh code review of the just-landed gap-closure fixes (Plans 32-09/32-10) and all independently reproduced with executed tests in this verification session — not merely re-read from the review's narrative:**

1. **The CR-01 (2nd round) bootstrap-resurrection bug.** Fixing usability (Plan 32-09) by removing the status precondition entirely, rather than scoping it, means the one documented "safe" path to a first admin can also resurrect a Rejected or Disabled account to Active ADMIN, because `updateUser` and `resendVerificationEmail` have no account-status guard of their own. Reproduced end-to-end.

2. **The CR-03 (2nd round) admin-count omits status.** Fixing the concurrency race (Plan 32-10) did not touch the underlying counting logic, which still doesn't match `isFunctioningAdmin`'s own three-part definition. This fails in plain SEQUENTIAL use — no race required — and is a more fundamental defect than the TOCTOU that was just closed. Reproduced with two ordinary, non-concurrent admin actions.

3. **The CR-02 (2nd round) silent email-validation gap**, newly surfaced this round: the tokenless register path validates every free-text field except `email` before the point where a validation failure would otherwise be swallowed into a false-success response. Reproduced with a single malformed-email registration attempt.

**Everything this phase and its four most recent plans (32-07 through 32-10) genuinely fixed remains fixed:** the original fresh-deployment privilege-escalation window (unconditional "first verifier wins") is closed by the ADMIN_EMAIL gate; the ADMIN_EMAIL bootstrap's USABILITY is now genuine (a legitimate operator really can authenticate immediately); the last-administrator guard's TOCTOU concurrency window is now genuinely closed with a locking transaction; and the uniform-response/enumeration-safety guarantee (Truth 2/SEC-01) remains fully intact. The core tokenless-registration mechanics (Truths 1, 3, 4, 5) are unaffected by this round and remain solid. The full backend regression suite passes cleanly (511/514, 3 pre-existing documented skips) — but, consistent with this project's recurring pattern (memory: "Authz + TOCTOU gaps hide behind green tests"), none of the three new blockers are covered by any passing test, which is exactly why they survived to a code review rather than a red test run.

Both remaining gaps 1 and 2 are scoped and mechanical to fix — 32-REVIEW.md's CR-01 and CR-03 sections (second-round numbering) each include a ready-to-adapt patch adding the missing `status` filter/precondition. Gap 3 requires a small new `emailPolicy.js` utility mirroring the existing `namePolicy.js` pattern.

---

_Verified: 2026-09-02T15:30:00Z_
_Verifier: Claude (gsd-verifier)_
