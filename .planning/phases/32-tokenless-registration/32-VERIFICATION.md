---
phase: 32-tokenless-registration
verified: 2026-08-31T12:02:26Z
status: gaps_found
score: 4/6 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 4/5
  gaps_closed:
    - "REG-03/SEC-03 marked fully [x] in REQUIREMENTS.md for Phase 32 despite an undelivered UI-facing clause -- fully closed by Plan 32-06 (both now unchecked with a Phase-32-backend/Phase-33-UI annotation, traceability rows split accordingly)."
    - "CR-01 (original naming): the 300-char-name / duplicate-insert-race / create-failure enumeration divergence -- closed by Plan 32-05's pre-lookup name validation, try/catch around models.User.create, and MIN_REGISTER_RESPONSE_MS timing floor. Confirmed by independent re-execution of register.test.js (23/23 passing) and two mutation-test sweeps that each turned exactly their predicted tests red."
  gaps_remaining:
    - "Success Criterion 2 is still not fully met: a residual uniform-response gap (CR-03) survives Plan 32-05's fix -- models.User.findOne and createVerificationToken() both execute outside the try/catch Plan 32-05 added, so a findOne failure can leak raw Sequelize error text and a createVerificationToken throw is a free-path-only divergence. Independently confirmed by reading user.resolver.js lines 251-271."
  regressions: []
gaps:
  - truth: "An email that already has an account gets a response indistinguishable from one that does not, and the real owner is emailed that someone tried to register with their address."
    status: partial
    reason: >
      The originally-reported enumeration oracle (a 300-char name producing a success message for
      a taken email and a raw DB error for a free email) is genuinely closed by Plan 32-05:
      independently re-running `npm test -w backend -- src/resolvers/register.test.js` shows 23/23
      passing including the CR-01 regression, the duplicate-insert-race test, and the WR-02
      simulated-create-failure test; two mutation-test sweeps (removing the try/catch, removing
      `assertRegistrationName`) each turned exactly their predicted tests red and no others.
      However, 32-REVIEW.md's CR-03 finding is real and independently confirmed by directly reading
      `backend/src/resolvers/user.resolver.js` lines 251-271: `models.User.findOne` (line 258) and
      `createVerificationToken()` (line 270) both execute BEFORE/OUTSIDE the `try` block that starts
      at line 271. A `findOne` rejection (connection-pool exhaustion, a transient DB error, a
      `SequelizeDatabaseError` on an unmigrated target) propagates raw Sequelize error text --
      including `.sql`, which mysql2 inlines bound parameter values into -- straight through Apollo
      to an unauthenticated caller. This directly contradicts the in-code comment at lines 303-309
      ("never surface raw ORM/DB error text to an unauthenticated caller") and it also skips
      `finishTokenlessRegistration` entirely, so this outcome is both differently shaped AND
      measurably faster than every other outcome -- a second, independent timing/content side
      channel. `createVerificationToken()` (line 270) executes only on the free-email path (after
      the `if (existingUser)` early return at line 267); a throw there (e.g. a
      `crypto.randomBytes` failure) produces an error response on the free path where the taken
      path would have returned success -- exactly the class of free/taken divergence the CR-01 fix
      was written to eliminate, just relocated one statement earlier than the code the fix touched.
      Neither path is exercised by any test: `register.test.js`'s WR-02 test
      (line 390-408) mocks `models.User.create`, never `models.User.findOne` or
      `createVerificationToken`, so nothing in the green suite would catch a regression here.
    artifacts:
      - path: backend/src/resolvers/user.resolver.js
        issue: >
          Lines 258 and 270 sit outside the try/catch that starts at line 271 and ends at line 312,
          so a failure in either bypasses the uniform TOKENLESS_REGISTER_MESSAGE /
          finishTokenlessRegistration exit path that every other tokenless outcome routes through.
    missing:
      - "Move the whole post-validation body (bcrypt.hash, findOne, the existingUser branch, createVerificationToken, and the create call) inside a single try block so every tokenless outcome -- including a findOne failure and a createVerificationToken failure -- returns through finishTokenlessRegistration and never leaks err.message/err.sql to the caller. 32-REVIEW.md's CR-03 section has a ready-to-adapt patch."
      - "Add regression tests: a mocked models.User.findOne rejection and a mocked createVerificationToken throw, each asserted to return the identical uniform success message with no raw ORM/DB error text anywhere in the response."
  - truth: "Tokenless registration does not open a path for an anonymous, unvouched caller to become ADMIN (the phase goal's \"safely creates a Pending, unverified account\" clause)."
    status: failed
    reason: >
      Newly surfaced by the post-merge code review (32-REVIEW.md CR-01) and independently confirmed
      here by reading both resolvers directly, not merely accepting the review's narrative.
      `verifyEmail`'s zero-admin bootstrap (`user.resolver.js:404-410`) runs
      `SELECT COUNT(*) AS adminCount FROM users WHERE role = 'ADMIN' AND emailVerified = true
      FOR UPDATE` and unconditionally promotes the verifying user to ADMIN when the count is 0 --
      there is no condition anywhere in that block on how the account was created, on `status`, or
      on the presence of an invitation. Before Phase 32, reaching `verifyEmail` at all required an
      admin-issued invitation token, so this bootstrap logic was gated behind an existing admin's
      action; Phase 32 opens `register` to anonymous callers with, by the resolver's own comment
      (line 168, D-03) and independently confirmed (`grep -rn "PUBLIC_REGISTRATION_ENABLED\|
      selfRegistrationEnabled" backend/` returns no matches), no feature flag gating it -- the
      tokenless branch is live on deploy. Two reachable windows, both confirmed against the current
      codebase:
      (1) **Fresh deployment.** `README.md` itself documents "the first registered account becomes
      ADMIN" (lines 13, 183) as intentional bootstrap behavior, and there is no seed script anywhere
      in `backend/` (`find backend -iname "*seed*"` returns nothing) that pre-creates an admin. On a
      freshly deployed instance with zero users, the first anonymous tokenless registrant to verify
      their own email claims the ADMIN role -- and denies it to the real operator, whose own later
      verification sees `adminCount = 1`.
      (2) **Existing deployment, sole-admin email change.** `updateUser` (lines 608-618)
      unconditionally sets `target.emailVerified = false` whenever `input.email` differs from the
      current value, for ANY caller changing ANY user's email (including their own, since
      `isSelf` callers reach this code without `requireAdmin`). The "Cannot remove the last
      administrator" guard (lines 586-593) is scoped strictly to the `input.role != null` branch a
      few lines above -- it never runs for an email-only change. So the sole admin changing their
      own email address (routine self-service) transiently drops `adminCount` to 0, reopening the
      bootstrap window to the internet until they re-verify.
      Neither window has any regression coverage: `verifyEmail.test.js`'s own zero-admin-race test
      (around line 200) proves the unconditional promotion is deliberate design from an earlier
      phase, but nothing in the suite pins it closed against an anonymous, uninvited registrant
      specifically, and no `updateUser.test.js` case exercises the sole-admin-email-change window
      (`grep -n "last administrator" backend/src/resolvers/updateUser.test.js` only matches the
      role-change tests at lines 158/177). The promoted attacker lands `role: ADMIN, status:
      Pending`; `pendingApprovals` (`user.schema.js:57`) exposes no `role` field to any consuming
      surface, so an admin approving what looks like a routine self-registration would unknowingly
      activate an ADMIN account. This is a direct, foreseeable, currently-live consequence of this
      phase's own change (opening `register` to anonymous callers) and is not mitigated anywhere in
      the shipped code.
    artifacts:
      - path: backend/src/resolvers/user.resolver.js
        issue: >
          Lines 404-410 (verifyEmail's zero-admin bootstrap promotion) carry no invitation/status
          gate; lines 586-593 (updateUser's last-administrator guard) cover only role changes, not
          the unconditional emailVerified-false-on-email-change path at lines 608-618.
    missing:
      - "Gate the zero-admin bootstrap promotion on the presence of an Invitation row for that user (models.Invitation.findOne({ where: { registeredUserId: user.id } }) -- already computed a few lines later in the same transaction as associatedInvitation) so only an invitation-backed registrant can ever claim the bootstrap ADMIN slot."
      - "Extend updateUser's last-administrator guard to the email-change path (lines 608-618) so the sole verified admin cannot de-verify themselves and reopen the zero-admin window."
      - "Add regression tests: an anonymous tokenless self-registrant cannot be promoted to ADMIN via the zero-admin bootstrap even when they are the very first verifier; and the sole admin's own email change is rejected (or otherwise cannot zero out adminCount) while they remain the only verified admin."
deferred: []
human_verification: []
---

# Phase 32: Tokenless Registration Verification Report

**Phase Goal:** `register` accepts a call with no invitation token and safely creates a `Pending`, unverified account -- reusing the invited path's password rules, email normalisation, and verification-token handling, with enumeration-safe responses, admin notification on verification, and the existing per-IP rate limit applied.
**Verified:** 2026-08-31T12:02:26Z
**Status:** gaps_found
**Re-verification:** Yes -- after gap closure (Plans 32-05, 32-06)

## Goal Achievement

### Observable Truths

Truths 1-5 map to ROADMAP.md's five numbered Success Criteria. Truth 6 is derived from the phase goal's own "safely creates" clause, per this re-verification's explicit mandate to assess an independently-confirmed code-review finding (CR-01, privilege escalation) that the original five Success Criteria do not literally name but that directly undermines the goal as stated.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `register` with no token creates a `Pending`, unverified account from the user's own email, storing the relationship note | VERIFIED | `user.resolver.js:251-288` tokenless branch creates `status: 'Pending'`, `emailVerified` defaults false, `relationshipNote: relationshipNote \|\| null`. `register.test.js:161-178` passes; unaffected by Plans 32-05/32-06's changes (regression-confirmed by the full-suite run below). |
| 2 | An email that already has an account gets a response indistinguishable from one that does not, and the real owner is emailed that someone tried to register with their address | **PARTIAL / FAILED** | The originally-reported CR-01 enumeration oracle (hostile 300-char name, duplicate-insert race, simulated create failure) is genuinely closed by Plan 32-05 -- confirmed by independent re-execution (`register.test.js` 23/23 passing) and two mutation-test sweeps. But CR-03 (32-REVIEW.md), independently confirmed by reading `user.resolver.js:251-271`, shows `models.User.findOne` (line 258) and `createVerificationToken()` (line 270) both sit outside the try/catch, so a `findOne` failure leaks raw Sequelize error text and a `createVerificationToken` throw is a free-path-only divergence. See gap above. |
| 3 | An unverified self-registration is absent from the approval queue; verifying the email puts it there and notifies administrators | VERIFIED | `pendingApprovals` filters `status: 'Pending', emailVerified: true` (`user.resolver.js:151-157`); `pendingApprovals.test.js` (5 tests, unaffected by 32-05/32-06) passes. `verifyEmail` fires `notifyAdminsOfPendingRegistration` when `!associatedInvitation && user.status === 'Pending'` (`user.resolver.js:486-490`); `verifyEmail.test.js` unaffected and passing. |
| 4 | Password rules, email normalisation, and verification-token handling on the tokenless path run the same code as the invited path -- no second, weaker implementation | VERIFIED | `assertPasswordStrength(password)` runs once before the token/no-token branch (`user.resolver.js:170`). Email normalisation is the single model-level `beforeValidate` hook, fires for every `User.create`. `createVerificationToken`/`hashVerificationToken`/`verificationTokenExpiry` are the identical imported functions on both branches. Unaffected by this round's changes. |
| 5 | The existing per-IP registration rate limit applies to the tokenless path, and the relationship note is length-capped server-side | VERIFIED | `rateLimit.test.js:208` ("rejects the 6th tokenless register attempt from the same IP within the window (SEC-02)") still present and passing. `assertRelationshipNoteLength` unchanged by 32-05 except gaining a dedicated unit-test file (`relationshipNotePolicy.test.js`, closing the prior verification's WR-10 caveat). |
| 6 | Tokenless registration does not open a path for an anonymous, unvouched caller to become ADMIN | **FAILED** | CR-01 (32-REVIEW.md), independently confirmed by reading `user.resolver.js:404-410` (unconditional zero-admin-count promotion, no invitation/status gate) and `user.resolver.js:586-618` (the last-administrator guard covers only `input.role` changes, never the email-change path that unconditionally sets `emailVerified = false`). See gap above. This is a direct, currently-live, unmitigated consequence of Phase 32 opening `register` to anonymous callers with no feature flag. |

**Score:** 4/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/utils/namePolicy.js` | `assertRegistrationName(name)` + `MAX_NAME_LENGTH` | VERIFIED | Trims via `String(name ?? '').trim()`, throws on empty or >255 chars, returns trimmed value. Mirrors `passwordPolicy.js`'s single-guard-clause idiom. |
| `backend/src/utils/namePolicy.test.js` | Dedicated boundary/edge-case coverage | VERIFIED | 46 lines; boundary (254/255/256), empty/whitespace/null/undefined, trim, non-string coercion. |
| `backend/src/utils/relationshipNotePolicy.test.js` | Dedicated boundary coverage (closes prior WR-10) | VERIFIED | 44 lines; boundary (499/500/501), null/undefined/empty short-circuit, astral-character over-rejection pinned and documented (WR-08 in the prior verification, unfixed by design -- out of this gap-closure's scope). |
| `backend/src/resolvers/user.resolver.js` | Hardened tokenless branch: pre-lookup name validation, `try/catch` around `models.User.create`, `MIN_REGISTER_RESPONSE_MS` floor via `finishTokenlessRegistration` | VERIFIED to exist/wired for the `create` call specifically, but the try/catch's coverage is incomplete (see CR-03 gap) | `assertRegistrationName` runs before the lookup (line 253); `finishTokenlessRegistration` is the single exit for the taken-email and free-email-success/failure paths (lines 267, 301, 311); but `findOne` (258) and `createVerificationToken()` (270) are outside the guarded region. |
| `backend/src/resolvers/register.test.js` | CR-01/WR-01/WR-02/WR-03(tokenless)/WR-09 regression coverage, RED-then-GREEN | VERIFIED to exist and pass, with two documented quality caveats | 23/23 tests pass (independently re-run). Caveat 1: the enumeration-equivalence assertion (`expect(takenResult).toEqual(freshResult)`, line 304) still passes with `assertRegistrationName` deleted -- the catch-all closes the oracle for this specific input, not the name policy (32-REVIEW.md WR-08). Caveat 2: the WR-01 timing test (lines 410-456) pins `Date.now()` to a constant `0` via `vi.spyOn(Date, 'now').mockReturnValue(0)`, so `elapsed` is always `0` and every recorded delay is asserted to equal the same `MIN_REGISTER_RESPONSE_MS` constant the test imports -- this assertion cannot fail for any floor value (32-REVIEW.md WR-07). Both caveats mean the green suite proves less than the 32-05 SUMMARY's "mutation-test claim" implies for these two specific properties; the `try/catch` and duplicate-race guards ARE genuinely mutation-tested (confirmed above), just not the ordering property or the timing-floor magnitude. |
| `.planning/REQUIREMENTS.md` | REG-03/SEC-03 corrected to backend/UI split | VERIFIED | `grep -c "\[x\] \*\*REG-03\*\*"` = 0, `grep -c "\[ \] \*\*REG-03\*\*"` = 1, same for SEC-03; both traceability rows now read `Phase 32 (backend), Phase 33 (UI)`. Confirmed by direct grep against the current file, not the plan's claim alone. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `register` (tokenless, every exit) | `finishTokenlessRegistration` | shared exit path | PARTIAL | WIRED for the taken-email branch and the free-email success/failure paths (lines 267, 301, 311). NOT WIRED for a `findOne` failure or a `createVerificationToken` throw (lines 258, 270) -- those propagate directly, bypassing both the uniform message and the timing floor. This is exactly the CR-03 gap. |
| `register` (tokenless, free-email) | `namePolicy.js` | `assertRegistrationName(name)` called before `models.User.findOne` | WIRED | `user.resolver.js:253`, before line 258's lookup. Confirmed by the mutation-test sweep in 32-05's SUMMARY (independently plausible given the source ordering) and by the CR-01 regression test passing. |
| `verifyEmail` | `models.Invitation` (`registeredUserId` lookup) | used to compute `associatedInvitation` for admin-notification gating | WIRED for its stated purpose, NOT used to gate the zero-admin bootstrap | `user.resolver.js:416-420` computes exactly the data (`associatedInvitation`) that would let the bootstrap promotion at lines 404-410 be scoped to invitation-backed registrants only -- but the promotion check runs earlier in the same transaction and does not consult it. This is the CR-01 (privilege-escalation) gap's precise mechanism. |
| `updateUser` (email-change path) | last-administrator guard | none | NOT_WIRED | The guard at lines 586-593 is scoped to the `input.role != null` block; the email-change block at lines 608-618 has no equivalent check before setting `emailVerified = false`. |

### Data-Flow Trace (Level 4)

Not separately applicable -- backend-only phase, no frontend component renders fetched data from this phase's changes. `pendingApprovals` remains verified end-to-end against a real Sequelize/MySQL query by `pendingApprovals.test.js` (unaffected by this round).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full backend suite green after both gap-closure plans | `npm test --workspace backend` | `497 passed \| 3 skipped (500)`, 67 files, exit 0 | PASS (green, but does not detect CR-01/CR-03 -- see gaps) |
| CR-01 (original enumeration oracle) regression suite | `npm test -w backend -- src/resolvers/register.test.js` | `23 passed (23)` | PASS |
| No `PUBLIC_REGISTRATION_ENABLED`-style feature flag exists | `grep -rn "PUBLIC_REGISTRATION_ENABLED\|selfRegistrationEnabled" backend/` | No matches | Confirms D-03 (no gate) -- this is what makes CR-01's privilege-escalation path live on deploy today |
| No seed script pre-creates an admin | `find backend -iname "*seed*"` | No matches | Confirms the fresh-deployment bootstrap window in CR-01's gap reasoning is real, not hypothetical |
| Last-administrator guard scope | `grep -n "last administrator" backend/src/resolvers/updateUser.test.js` | Matches only role-change tests (lines 158, 177) | Confirms no test exercises the sole-admin-email-change window |

### Probe Execution

No conventional `scripts/*/tests/probe-*.sh` files exist in this repository and none are declared in the Phase 32 plans/summaries/review. Skipped per Step 7c's discovery step.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| REG-02 | 32-03 | `register` accepts no-token, creates Pending/unverified account | SATISFIED | Truth 1 above |
| REG-03 | 32-01, 32-03, 32-04, 32-06 | Note stored with account AND shown to admins at approval time | PARTIAL (correctly tracked as such) | Backend half satisfied; UI half correctly deferred to Phase 33 per 32-06's REQUIREMENTS.md correction. No overclaim remains. |
| REG-05 | 32-04 | Unverified self-registration never in approval queue | SATISFIED | Truth 3 above |
| REG-06 | 32-04 | Verifying moves it into the queue and notifies admins | SATISFIED | Truth 3 above |
| REG-07 | 32-03 | Password/normalisation/verification-token code shared, not duplicated weaker | SATISFIED | Truth 4 above |
| SEC-01 | 32-03, 32-05 | Enumeration-safe response + real owner notified | **BLOCKED** | CR-03 -- see gap. REQUIREMENTS.md still marks SEC-01 fully `[x]`; this is premature given the residual `findOne`/`createVerificationToken` gap. Recommend un-checking until CR-03 is closed, mirroring the correction already applied to REG-03/SEC-03 by Plan 32-06. |
| SEC-02 | 32-03 | Existing per-IP rate limit covers tokenless path | SATISFIED | Truth 5 above; `rateLimit.test.js:208` |
| SEC-03 | 32-01, 32-02, 32-03, 32-06 | Note length-capped server-side + rendered safely everywhere shown | PARTIAL (correctly tracked as such) | No overclaim remains, per 32-06's correction. |

No orphaned requirements: all 8 requirement IDs declared across the six plans match the 8 IDs REQUIREMENTS.md maps to Phase 32 (backend) / Phase 33 (UI, for REG-03/SEC-03).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/src/resolvers/user.resolver.js` | 404-410, 586-618 | Zero-admin bootstrap promotion has no invitation/status gate; last-administrator guard does not cover the email-change path | **Blocker** | CR-01 (privilege escalation) -- see gap. Determines this phase's status together with CR-03. |
| `backend/src/resolvers/user.resolver.js` | 258, 270 | `findOne` and `createVerificationToken()` execute outside the tokenless branch's try/catch | **Blocker** | CR-03 -- see gap. Residual violation of the "no raw ORM/DB error text to an anonymous caller" contract the branch's own comment states. |
| `backend/src/resolvers/user.resolver.js` | 254-256 | Email format/length never validated on the tokenless path (only presence) | Warning | CR-02 (32-REVIEW.md, not independently re-verified as a blocker here but confirmed present by reading lines 254-256: only `if (!email) throw` exists). A malformed or over-length email now silently returns the uniform success message with no account created and no signal -- does not break SEC-01's indistinguishability (the catch-all makes it uniform), but is silent data loss on the app's only public entry point. |
| `backend/src/resolvers/user.resolver.js` | 119-122 | `MIN_REGISTER_RESPONSE_MS` floor silently becomes a no-op once real work exceeds 400ms | Warning | WR-01 (32-REVIEW.md renumbering). Under DB contention or a cold connection pool, the timing delta the floor exists to mask reappears; the floor is also deterministic and therefore averageable across many requests. |
| `backend/src/resolvers/register.test.js` | 410-456 | WR-01 timing regression test pins `Date.now()` to a constant, making its central per-call assertion unfalsifiable | Warning | WR-07 (32-REVIEW.md). The over-floor branch (where the floor silently no-ops) is never exercised by any test. |
| `backend/src/resolvers/register.test.js` | 288-307 | CR-01 equivalence assertion (`toEqual`) still passes with `assertRegistrationName` deleted | Warning | WR-08 (32-REVIEW.md). The catch-all, not the name-length policy, is what closes the oracle for this specific input; the 32-05 SUMMARY's mutation-test claim is narrower than stated for this one property (the try/catch and the name-policy's own boundary tests ARE genuinely mutation-tested; the ordering/no-DB-read-on-invalid-name property is not). |
| `backend/src/resolvers/user.resolver.js`, `frontend/src/pages/ApprovalsPage.jsx` | `pendingApprovals` (schema+resolver) | Zero consumers -- `pendingApprovals` has no frontend caller | Warning | Carried forward from prior review (WR-04 equivalent). Expected: Phase 33 wires the admin UI to this query. Not a regression, tracked. |
| `backend/src/services/mailer.js` | 41 | `renderHtml`'s `ctaUrl` interpolates into an `href` attribute unescaped | Warning | Carried forward (WR-06 in 32-REVIEW.md numbering). Latent only -- every current caller passes a server-derived URL. |
| `backend/src/resolvers/user.resolver.js` | 98, 232-234 | Tokenless success message is a named constant; invited branch hardcodes the identical literal separately | Warning | WR-09 (32-REVIEW.md). Any future edit to one of the two copies silently makes the branches distinguishable. |
| `backend/src/utils/relationshipNotePolicy.js` | 6-8 | Note stored untrimmed; whitespace-only note becomes a non-null blank | Warning | WR-10 (32-REVIEW.md). Cosmetic/data-quality, not a security issue. |
| `backend/src/resolvers/user.resolver.js` | 492 | `verifyEmail` unconditionally mints a session JWT for accounts that are not `Active` | Warning | WR-11 (32-REVIEW.md). Inert today (`getUserFromRequest` re-checks status), pre-existing pattern from before Phase 32, blast radius increased by this phase's larger Pending population and by CR-01 (a promoted-but-Pending ADMIN now holds a live token the moment they are later approved). |

No `TBD`/`FIXME`/`XXX` debt markers found in any file modified by Phase 32 or its gap-closure plans (the one `TBD` match in `.planning/REQUIREMENTS.md` is a pre-existing header placeholder unrelated to this phase).

### Human Verification Required

None. Every truth for this phase is mechanically verifiable via source inspection and the automated test suite; this remains a backend-only phase with no new UI surface.

### Gaps Summary

**Two blocking gaps remain, both surfaced by the post-merge code review and independently confirmed here by reading the source directly (not accepting the review's or any SUMMARY's narrative):**

1. **CR-03 -- Success Criterion 2 is only partially met.** Plan 32-05 genuinely closed the originally-reported enumeration oracle (a hostile 300-character name, a duplicate-insert race, and a simulated `create` failure all now return the identical uniform message, confirmed by 23/23 passing tests and two mutation-test sweeps). But `models.User.findOne` and `createVerificationToken()` both execute outside the try/catch Plan 32-05 added, so a `findOne` failure can still leak raw Sequelize/ORM error text to an anonymous caller, and a `createVerificationToken` throw is still a free-path-only divergence -- the same class of defect the fix exists to close, just one statement earlier than the code it touched.

2. **CR-01 -- an unauthenticated privilege-escalation path is reachable, violating the phase goal's "safely" clause.** Opening `register` to anonymous callers (this phase's own change, live with no feature flag) newly exposes `verifyEmail`'s pre-existing zero-admin bootstrap promotion to the internet. Two confirmed windows: a fresh deployment (no seed script exists; README.md itself documents "the first registered account becomes ADMIN" as intentional bootstrap behavior) and an existing deployment where the sole admin changes their own email (`updateUser`'s last-administrator guard covers only role changes, never the email-change path that unconditionally de-verifies the account). This was not part of the original five Success Criteria's literal wording, but it is a direct, foreseeable, currently-live consequence of this phase's scope, and the phase goal explicitly requires the account creation to be done "safely." Per this re-verification's explicit mandate, this phase cannot be marked passed while this path remains reachable and unmitigated.

**Both gaps are scoped and mechanical to fix** -- 32-REVIEW.md's CR-01 and CR-03 sections each include a ready-to-adapt patch (move the tokenless branch's post-validation body inside one try block; gate the bootstrap promotion on an existing-Invitation-row check already computed a few lines later in the same function; extend the last-administrator guard to the email-change path). Everything else this phase and its two prior gap-closure plans delivered -- the tokenless branch's core behavior, the approval-queue visibility rules, the admin-notification wiring, the rate limit, the relationship-note storage/cap, and the REQUIREMENTS.md tracking correction -- is genuinely implemented, tested, and regression-clean (full suite: 497 passed, 3 skipped, 0 failures, independently re-run).

---

_Verified: 2026-08-31T12:02:26Z_
_Verifier: Claude (gsd-verifier)_
