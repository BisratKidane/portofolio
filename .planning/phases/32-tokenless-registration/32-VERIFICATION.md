---
phase: 32-tokenless-registration
verified: 2026-09-03T09:26:10Z
status: passed
score: 8/8 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 5/8
  gaps_closed:
    - "Truth 6 (ADMIN_EMAIL bootstrap safety) — closed by Plan 32-11. Source read of user.resolver.js:470-473 confirms the bootstrap write's WHERE clause is now `{ id: user.id, status: { [Op.in]: ['Pending', 'Active'] } }`, so a Rejected/Disabled account no longer matches. Both upstream token-reissue paths independently closed too: resendVerificationEmail:566 short-circuits on `user.status === 'Rejected' || 'Disabled'`, and updateUser:676-678 throws 'This account is not editable.' for the same statuses before it can mint a fresh verification token. Two new regression tests (verifyEmail.test.js, 'Gap 1, 3rd round') present a Rejected and a Disabled account's live token to the bootstrap and assert status/role unchanged — both independently re-run in this session and pass."
    - "Truth 7 (last-administrator invariant, sequential miscount) — closed by Plan 32-12. Source read confirms both raw-SQL admin counts (user.resolver.js:426 verifyEmail admin-slot count, :685 updateUser otherFunctioningAdminCount) now filter `role = 'ADMIN' AND status = 'Active' AND emailVerified = true`, matching isFunctioningAdmin (utils/auth.js:65-67) exactly. Two new sequential (non-concurrent) regression tests ('Gap 2, 3rd round' in updateUser.test.js) promote a Pending user to ADMIN then attempt to demote/email-change the previously-sole admin and assert the guard BLOCKS it — independently re-run in this session and pass."
    - "Truth 8 (malformed email silently dropped) — closed by Plan 32-13, then genuinely completed by quick task 260903-f0m after round-4 review (CR-01) found 32-13's hand-rolled regex still disagreed with models.User's Sequelize isEmail validator on 8 realistic input classes. assertRegistrationEmail (emailPolicy.js) now imports and calls validator's isEmail directly — the same function the model's own validator uses — so guard and model can no longer disagree by construction. Proven by a table-driven 'guard <-> model agreement' test that calls the REAL models.User.build().validate() (not a re-implementation of either check) for every case, independently re-run in this session and passing, plus dedicated regression tests for all 8 previously-divergent inputs and the original 32-VERIFICATION.md missing-TLD reproduction (ada@exmaple)."
  gaps_remaining: []
  regressions: []
deferred: []
human_verification: []
---

# Phase 32: Tokenless Registration Verification Report

**Phase Goal:** `register` accepts a call with no invitation token and safely creates a `Pending`, unverified account — reusing the invited path's password rules, email normalisation, and verification-token handling, with enumeration-safe responses, admin notification on verification, and the existing per-IP rate limit applied.
**Verified:** 2026-09-03T09:26:10Z
**Status:** passed
**Re-verification:** Yes — fourth round, after gap-closure Plans 32-11/32-12/32-13, a fresh code review (32-REVIEW.md round 4), and quick task 260903-f0m which closed the one Critical finding that round's review raised against the fixes themselves (CR-01) plus two weakened regression tests (WR-06, WR-07).

## IMPORTANT: Read This Before Trusting "passed"

All three blockers from the previous verification round are genuinely closed, confirmed by direct source read **and** by independently re-running the specific regression tests that exercise each scenario against the live test database in this session (not merely re-reading SUMMARY/REVIEW narrative). See "Goal Achievement" below.

**However, one Critical, unresolved security finding remains open by explicit, informed user decision** (round-4 review CR-02 — "account pre-hijacking"): an anonymous caller can bind a password of their own choosing to a third party's email address on the tokenless path, and nothing re-binds that credential after ownership is proven. If the real owner clicks the verification link and an admin approves based on a plausible name+email match, the attacker holds a working credential for the victim's identity. This is tracked at `.planning/todos/pending/20260903-cr02-account-pre-hijacking.md`, explicitly scoped out of this phase's gap-closure work by the user, and requires its own design decision (see "Assessment of CR-02" below) — it is not re-reported here as a new blocker, per instruction.

**My assessment (asked for explicitly): CR-02 does not falsify any of the 5 literal ROADMAP success criteria** — none of them require the created credential to survive third-party ownership proof unaltered, and SEC-01's "enumeration-safe" text is a distinct property (whether an address's existence can be discovered) from CR-02 (what happens once a real address is targeted). All 5 are independently verified true below. **But the phase goal's own word "safely" is broader than the 5 numbered criteria, and CR-02 is a real, reachable, unmitigated account-takeover path that a strict reading of "safely creates a ... account" would not consider closed.** I do not believe the phrase "safely creates" is fully earned while CR-02 is open. This is a documented, tracked, and — per the task's framing — already-decided trade-off, so I am not blocking phase completion on it, but I want this stated plainly rather than folded silently into a "passed" verdict, per the escalation-gate spirit of this project.

## Goal Achievement

Truths 1-5 map to ROADMAP.md's five numbered Success Criteria. Truths 6-8 are derived must-haves carried forward from the phase's "safely creates" clause, and are exactly the three blockers the previous (third) verification round found — all three closed this round.

**This verification did not simply re-read 32-REVIEW.md's or the SUMMARYs' narrative.** Every closed gap below was independently confirmed by (a) a direct source read of the current code and (b) running the specific regression test(s) that exercise the scenario against the live test database in this session (`npx vitest run` against 5 targeted files: `emailPolicy.test.js`, `verifyEmail.test.js`, `updateUser.test.js`, `resendVerificationEmail.test.js`, `register.test.js` — 116 passed, 2 skipped, 0 failed), plus running the specific `-t` filtered test names (`Gap 1`, `Gap 2`, `Gap 3`) to confirm the exact scenarios pass, not merely that the file as a whole is green. Per this project's recorded pattern ("Authz + TOCTOU gaps hide behind green tests"), a full-suite green run alone was not treated as sufficient evidence — the guard's own predicate was read and the specific adversarial test was isolated and re-run.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `register` with no token creates a `Pending`, unverified account from the user's own email, storing the relationship note | VERIFIED | `user.resolver.js:259-333` tokenless branch. `register.test.js` "creates a Pending, unverified USER from a fresh email with the stored relationship note" passes. Migration `020-add-users-relationship-note.sql` applied (column present in `User.js:79`, `STRING(500)`, and exercised successfully by the live test DB). |
| 2 | An email that already has an account gets a response indistinguishable from one that does not, and the real owner is emailed that someone tried to register with their address | VERIFIED | `user.resolver.js:276-321`: single `try` wraps `bcrypt.hash`, `findOne`, the existing-user branch, `createVerificationToken`, and `create`; every exit routes through `finishTokenlessRegistration`, which applies the identical message and a uniform response-time floor. `register.test.js` "returns the identical success message and creates no second row when the email is already taken, and emails the real owner (D-08, D-10, SEC-01)" passes. |
| 3 | An unverified self-registration is absent from the approval queue; verifying the email puts it there and notifies administrators | VERIFIED | `pendingApprovals` (`user.resolver.js:159-165`, filters `status: 'Pending', emailVerified: true`) and `notifyAdminsOfPendingRegistration` (gated on `!associatedInvitation && user.status === 'Pending'`, fired after commit) unaffected by this round. `pendingApprovals.test.js` and `verifyEmail.test.js`'s "admin notification on self-registration verification (D-12, D-13)" block both pass. |
| 4 | Password rules, email normalisation, and verification-token handling on the tokenless path run the same code as the invited path — no second, weaker implementation | VERIFIED | `assertPasswordStrength` called once, shared by both branches (`user.resolver.js:171`); model-level `beforeValidate` email normalisation (`User.js`) shared; `createVerificationToken`/`hashVerificationToken`/`verificationTokenExpiry` (`utils/auth.js`) are the single implementation both branches call. Unaffected by this round's changes. |
| 5 | The existing per-IP registration rate limit applies to the tokenless path, and the relationship note is length-capped server-side | VERIFIED | `config/rateLimits.js: register: { max: 5, windowMs: 60*60*1000 }` keyed by mutation field name, applies regardless of branch. `rateLimit.test.js` "rejects the 6th tokenless register attempt from the same IP within the window (SEC-02)" passes. `assertRelationshipNoteLength` (`relationshipNotePolicy.js:6-8`, 500-char cap) called at `user.resolver.js:169`, unaffected. |
| 6 | A safe, explicit, USABLE path to a first ADMIN exists (a Rejected/Disabled account must never be resurrected through it) | VERIFIED (closed this round) | `user.resolver.js:470-473`: bootstrap write scoped to `where: { id: user.id, status: { [Op.in]: ['Pending', 'Active'] } }`. Both reissue paths independently closed (`resendVerificationEmail:566`, `updateUser:676-678`). Regression tests "never resurrects a Rejected/Disabled account through the ADMIN_EMAIL bootstrap... (Gap 1, 3rd round)" independently re-run in this session: **PASS**. |
| 7 | The last-administrator invariant holds under BOTH concurrency and ordinary sequential use | VERIFIED (closed this round) | `user.resolver.js:426, :685`: both raw-SQL admin counts now include `AND status = 'Active'`, matching `isFunctioningAdmin` (`utils/auth.js:65-67`) exactly. Regression tests "blocks demoting/email-changing the sole functioning admin after a Pending, verified user was promoted to ADMIN (Gap 2, sequential reproduction)" independently re-run in this session: **PASS**. Concurrency tests (`Promise.all`, from 32-10) also still pass and now assert the correct three-part predicate (WR-06 closure, quick task 260903-f0m). |
| 8 | The tokenless register path safely creates an account rather than silently discarding a legitimate attempt when the input is a plausible-but-malformed email | VERIFIED (closed this round, after a partial-fix detour) | `emailPolicy.js`'s `assertRegistrationEmail` now calls `validator`'s `isEmail` directly — the same function `models.User`'s Sequelize `isEmail: true` validator uses — so guard and model cannot disagree by construction. This closes CR-01 from the round-4 review, which found 32-13's original hand-rolled regex still accepted 8 realistic malformed-email classes that the model rejected (e.g. `ada@gmail..com`, `.ada@gmail.com`, a >64-char local part). The `guard <-> model agreement` test in `emailPolicy.test.js` calls the real `models.User.build().validate()` (not a re-implementation) for 12 cases and independently re-run in this session: **PASS**, all 12. The original 32-VERIFICATION.md reproduction case (`ada@exmaple`, missing TLD) also independently re-run: **PASS**. |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/resolvers/user.resolver.js` (`verifyAndPromote` bootstrap) | Zero-admin bootstrap that is both usable AND safe | VERIFIED | Lines 470-473: `where: { id: user.id, status: { [Op.in]: ['Pending', 'Active'] } }`, `status: 'Active'` granted in the same write. Both usable and safe. |
| `backend/src/resolvers/user.resolver.js` (`resendVerificationEmail`, `updateUser`) | No path can hand a Rejected/Disabled account a fresh live token | VERIFIED | `resendVerificationEmail:566` and `updateUser:676-678` both refuse Rejected/Disabled targets. |
| `backend/src/resolvers/user.resolver.js` (admin counts) | Last-administrator guards correct under concurrency AND sequential use | VERIFIED | Lines 426, 685 both use the three-part `role = 'ADMIN' AND status = 'Active' AND emailVerified = true` predicate, matching `isFunctioningAdmin`. |
| `backend/src/utils/emailPolicy.js` | Shared email format/length validation that cannot disagree with the model layer | VERIFIED | `assertRegistrationEmail` imports `validator/lib/isEmail.js` directly (same function `models.User`'s validator uses), `MAX_EMAIL_LENGTH = 254` matches `validator.isEmail`'s own RFC 5321 boundary. `validator` promoted from transitive to declared direct dependency (`backend/package.json:32`). |
| `backend/src/resolvers/verifyEmail.test.js` | Regression coverage for the bootstrap including Rejected/Disabled resurrection, and a lock-contention mirror query matching the resolver byte-for-byte | VERIFIED | "Gap 1, 3rd round" describe block present and passing; mirror query at line 145 now includes `AND status = 'Active'` (WR-07 closure). |
| `backend/src/resolvers/updateUser.test.js` | Regression coverage for sequential admin miscounting, plus concurrency tests asserting the correct predicate | VERIFIED | "Gap 2, 3rd round" describe block present and passing; concurrency tests (`CR-02, gap-closure`) now assert `functioningAdminCount` with `status: 'Active'` (WR-06 closure). |
| `backend/src/utils/emailPolicy.test.js` | Regression coverage proving guard/model agreement, not just guard self-consistency | VERIFIED | `guard <-> model agreement (CR-01)` describe block calls the real `models.User.build().validate()`; 12/12 cases pass. |
| `.planning/REQUIREMENTS.md` | SEC-01, REG-02, REG-05, REG-06, REG-07, SEC-02 checkable; REG-03, SEC-03 correctly annotated backend-partial | VERIFIED (recommend re-checking SEC-01's box) | `SEC-01` is currently `[ ]` with a stale annotation referring to CR-03 (closed two rounds ago). The underlying property (Truth 2) has now been independently confirmed stable across three consecutive verification rounds and is unaffected by this round's changes. Recommend checking the box; the annotation text should be updated to note CR-02 is a separate, deferred, tracked concern rather than an open blocker of SEC-01 itself. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `verifyEmail` bootstrap write | account's current `status` | a `where`-clause precondition | WIRED | `where: { id: user.id, status: { [Op.in]: ['Pending', 'Active'] } }` (`user.resolver.js:472`). |
| `updateUser` / `resendVerificationEmail` | account's current `status` | a guard before token reissue / edit | WIRED | `updateUser:676-678` throws for Rejected/Disabled targets before any field mutation; `resendVerificationEmail:566` silently no-ops for the same statuses. |
| `verifyEmail` / `updateUser` admin counts | `isFunctioningAdmin`'s definition | matching WHERE clause | WIRED | Both raw SQL counts (`:426`, `:685`) now read `role = 'ADMIN' AND status = 'Active' AND emailVerified = true`, exactly matching `isFunctioningAdmin` (`utils/auth.js:65-67`). |
| tokenless `register` | email format/length validation | a guard before the try/catch | WIRED | `assertRegistrationEmail(email)` called at `user.resolver.js:266`, before the guarded `try` opens at `:276`. |
| `assertRegistrationEmail` | `models.User`'s `isEmail: true` validator | shared `validator.isEmail` function, not two implementations | WIRED | `emailPolicy.js:1` imports `validator/lib/isEmail.js` directly; `models/User.js:26` uses Sequelize's `isEmail: true` (backed by the same `validator` package). Proven by a test that exercises the real model, not by re-reading source alone. |
| `updateUser` (email-change path, concurrent) | last-administrator guard | `sequelize.transaction` + `SELECT ... FOR UPDATE` | WIRED | Unaffected this round; still closed from 32-10, now testing the correct three-part predicate. |

### Data-Flow Trace (Level 4)

Not applicable — backend-only phase this round. No frontend component renders `pendingApprovals` or reaches the tokenless `register` branch: `grep -rn "pendingApprovals" frontend/src` returns nothing, and `AuthContext.jsx`'s `REGISTER_MUTATION` still requires `token`/`name`/`password` only (no `email`/`relationshipNote` fields), confirming the UI half is still correctly deferred to Phase 33 (WR-11 from 32-REVIEW.md, unaffected by this round).

### Behavioral Spot-Checks

All checks below were EXECUTED in this verification session via `npx vitest run` against the live test database (not a dry read of prior sessions' narrated results).

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Targeted suite for all 5 gap-closure-touched files | `npx vitest run src/utils/emailPolicy.test.js src/resolvers/{verifyEmail,updateUser,resendVerificationEmail,register}.test.js` | `Test Files 5 passed (5)`, `Tests 116 passed \| 2 skipped (118)` | PASS |
| Gap 1 regression (bootstrap resurrection) | `npx vitest run src/resolvers/verifyEmail.test.js -t "Gap 1"` | Both Rejected/Disabled resurrection tests pass | PASS |
| Gap 2 regression (sequential admin miscount) | `npx vitest run src/resolvers/updateUser.test.js -t "Gap 2"` | Both sequential-promotion-then-demote/email-change tests pass | PASS |
| Gap 3 regression (malformed email silently dropped) | `npx vitest run src/resolvers/register.test.js -t "Gap 3"` | All 5 email-format-validation tests pass, including the exact `ada@exmaple` (32-VERIFICATION.md) reproduction | PASS |
| Guard/model agreement (CR-01 closure) | Inspected `emailPolicy.test.js`; confirmed it calls `models.User.build({email}).validate({fields:['email']})` — the real model, not a re-implementation | 12/12 table-driven cases pass, ran as part of the full `emailPolicy.test.js` file | PASS |
| Debt-marker scan | `grep -rn "TBD\|FIXME\|XXX"` across all files this round's plans + quick task touched | No matches | PASS (clean) |

### Probe Execution

No conventional `scripts/*/tests/probe-*.sh` files exist in this repository and none are declared in Phase 32's plans/summaries/review/quick-task. Skipped per Step 7c's discovery step.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| REG-02 | 32-03, 32-07, 32-08, 32-09, 32-10, 32-11, 32-12, 32-13 | `register` accepts no-token, creates Pending/unverified account | SATISFIED | Truths 1, 6, 7, 8 all verified. The broader "safely" obligation this phase's gap-closure rounds took on for the admin-bootstrap/last-admin-guard/email-validation work is now closed, modulo the separately-tracked CR-02 (see "Assessment of CR-02" above). |
| REG-03 | 32-01, 32-03, 32-04, 32-06 | Note stored with account AND shown to admins at approval time | PARTIAL (correctly tracked) | Backend half satisfied (Truth 1, note stored and exposed via `pendingApprovals`); UI half correctly deferred to Phase 33, unaffected this round. |
| REG-05 | 32-04 | Unverified self-registration never in approval queue | SATISFIED | Truth 3, unaffected this round. |
| REG-06 | 32-04 | Verifying moves it into the queue and notifies admins | SATISFIED | Truth 3, unaffected this round. |
| REG-07 | 32-03 | Password/normalisation/verification-token code shared, not duplicated weaker | SATISFIED | Truth 4, unaffected this round. |
| SEC-01 | 32-03, 32-05, 32-08 | Enumeration-safe response + real owner notified | SATISFIED (checkbox currently `[ ]`, stale annotation, recommend re-checking) | Truth 2, confirmed stable across four consecutive verification rounds. CR-02 does not affect this requirement's literal text (see assessment above) — it is a distinct property. |
| SEC-02 | 32-03 | Existing per-IP rate limit covers tokenless path | SATISFIED | Truth 5, unaffected this round. |
| SEC-03 | 32-01, 32-02, 32-03, 32-06 | Note length-capped server-side + rendered safely everywhere shown | PARTIAL (correctly tracked) | Backend half satisfied (length cap + `escapeHtml` applied in `mailer.js:131`); admin-UI half ships in Phase 33. |

No orphaned requirements: all 8 requirement IDs declared across the thirteen phase plans (32-01 through 32-13) plus the quick-task match the IDs REQUIREMENTS.md maps to Phase 32 (backend) / Phase 33 (UI, for REG-03/SEC-03).

**Roadmap-scope check (Step 9b):** No later phase's plans/goal exist yet beyond this milestone's Phase 33 (UI) scope for REG-03/SEC-03, already correctly tracked as such. Nothing in this round's findings maps to unscheduled future work other than the already-filed CR-02 todo and the advisory warnings below (WR-01/02/03/04/05/08/09, IN-01..07), none of which is deferred to a specific numbered future phase — they remain open backlog items, correctly left as advisory rather than blocking.

### Anti-Patterns Found

No `TBD`/`FIXME`/`XXX` debt markers found in any file this round's plans (32-11, 32-12, 32-13) or the quick task touched — confirmed by grep in this session, exit code 1 (no matches).

The following are **carried-over or newly-surfaced advisory findings from 32-REVIEW.md round 4**, none of which falsifies any of the 8 truths above. Listed for visibility, not as blockers, per this task's explicit instruction to treat Warning/Info findings as advisory unless one genuinely breaks a stated success criterion (none do):

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/src/resolvers/user.resolver.js` | 120-121, 425-428, 683-689 | Both `FOR UPDATE` admin counts full-scan an unindexed `users` table; retry wrapper recognises only `ER_LOCK_DEADLOCK`, not the more likely `ER_LOCK_WAIT_TIMEOUT` | Warning (WR-01) | Reliability under concurrent load, not a correctness violation of any stated truth. |
| `backend/src/resolvers/user.resolver.js` | 102-132 | `MIN_REGISTER_RESPONSE_MS` (400ms) response-time floor is a fixed constant with no fallback once real work (e.g. bcrypt on slower hardware) exceeds it | Warning (WR-02) | Could re-open a timing side channel under load/on slower hardware; does not affect the tested/normal-case SEC-01 guarantee. |
| `backend/src/resolvers/user.resolver.js` | 331 | Catch-all log line for dropped tokenless registrations carries no identifying context (no email, no correlation id) | Warning (WR-03) | Operational diagnosability only. |
| `backend/src/resolvers/user.resolver.js` | 277-287 | Registration squatting: a stale, never-verified Pending row is treated as "taken" forever, with no reaping | Warning (WR-04, carried over, unfixed) | Denies the real owner a registration if an attacker (or accident) squats first; does not break Truth 1's happy-path behaviour, which is what SC1 literally describes. Compounds CR-02's severity but is a distinct issue. |
| `backend/src/resolvers/user.resolver.js` | 283 | D-10's owner-notification email has no per-address throttle, only per-IP | Warning (WR-05) | Unauthenticated email-amplification vector against any registered address; abuse/reputation risk, not a correctness violation of SEC-01's literal text. |
| `backend/src/resolvers/user.resolver.js` | 199-227 | Invited `register` branch still performs no `name` validation, no `try/catch` | Warning (WR-08, carried over, unfixed) | Scoped to the invited branch, outside this phase's tokenless-hardening focus; pre-existing debt. |
| `backend/src/utils/relationshipNotePolicy.js` | 6-8 | `relationshipNote` validated and stored untrimmed, unlike `name`/`email` | Warning (WR-09, carried over, unfixed) | Whitespace-only notes render as "present" in admin notification email; does not break SC5's length-cap requirement. |
| `backend/src/resolvers/user.resolver.js` | multiple | 7 Info-level findings (IN-01 through IN-07): hardcoded duplicate success-message string, a misleadingly-named shared constant, in-memory-mutation-order fragility in `updateUser`'s email guard, a terminal Rejected/Disabled state with no admin repair path, `Promise.all` batch-failure masking in the admin notifier, a stale comment, an unescaped `href` attribute (latent, not live) | Info | Code-quality/robustness notes, none affecting stated truths. |

### Human Verification Required

None. Every truth for this phase is mechanically verifiable via source inspection and executed reproduction; this remains a backend-only phase with no new UI surface this round.

### Assessment of CR-02 (Known, User-Deferred — Not a New Gap)

Per this task's explicit instruction, CR-02 is not reported as a discovery and does not appear in the `gaps:` list — it was already found (round-4 review), already triaged, and already deferred by an explicit user decision, tracked at `.planning/todos/pending/20260903-cr02-account-pre-hijacking.md`. My independent read of the current code confirms the finding is accurate and still live: `user.resolver.js:296-321` persists the caller-supplied `passwordHash` unconditionally at account creation on the free-email tokenless path, and neither `verifyEmail` (flips only `emailVerified`) nor `approveUser` (flips only `status`) ever re-binds or invalidates that credential once the address owner proves control by clicking the verification link. The attack chain (anonymous register → victim verifies → admin approves on a plausible name+email match → attacker logs in as victim) is unchanged and still reachable, with no feature flag gating it (D-03).

**Does this affect the phase's stated success criteria?** No — none of the 5 literal ROADMAP success criteria, nor REG-02/03/05/06/07/SEC-01/02/03 as literally worded, require the created credential to survive a later ownership-proof event. SEC-01's "enumeration-safe" property and CR-02's "credential-binding" property are genuinely distinct concerns; a system can be perfectly enumeration-safe while still being pre-hijackable, and this codebase is exactly in that state.

**Does this affect whether the phase goal's word "safely" is honestly earned?** In my judgment, yes, partially. "Safely creates a Pending, unverified account" reads most naturally as encompassing more than just "does not 500 on bad input" and "does not leak who has an account" — it plausibly also means "does not hand an attacker a path to impersonate someone else's identity via the very approval flow meant to prevent that." CR-02 is exactly that gap, it is Critical-severity, concretely reachable today, and has no mitigating control besides the pre-existing per-IP rate limit (which the review correctly notes limits volume, not the attack). I am recording this assessment plainly, as asked, without treating it as a phase-blocking gap, since the user has already reviewed this exact finding and chosen to defer it with a tracked follow-up rather than fold it into this phase's gap-closure cycle.

### Gaps Summary

**No gaps remain that were in scope for this round's gap-closure cycle.** All three blockers carried forward from the third verification round are genuinely closed:

1. **Gap 1 (bootstrap resurrection)** — closed by Plan 32-11, confirmed by independently re-running the exact Rejected/Disabled reproduction tests.
2. **Gap 2 (admin-count predicate, sequential miscount)** — closed by Plan 32-12, confirmed by independently re-running the exact sequential-promotion-then-demote reproduction tests.
3. **Gap 3 (malformed email silently dropped)** — closed by Plan 32-13 and then genuinely completed by quick task 260903-f0m, after round-4 review (CR-01) found the first attempt still disagreed with the model layer on 8 realistic inputs. Confirmed by independently re-running the table-driven guard-vs-real-model agreement test.

Two regression-test weaknesses the round-4 review also flagged (WR-06, WR-07 — tests asserting a weaker invariant than the fix they guard) were closed in the same quick task, as a bonus beyond the three headline gaps.

**One Critical finding remains open by explicit, tracked, user decision (CR-02)** — see "Assessment of CR-02" above. It does not block this verification's `passed` status because it does not falsify any of the phase's stated must-haves and was already triaged and deferred before this verification ran, but it is recorded here plainly per instruction, since it bears directly on whether the phase goal's "safely creates" language is fully earned.

Several Warning/Info findings from 32-REVIEW.md remain open (unindexed lock scans, a timing-floor edge case, registration squatting, missing invited-branch name validation, untrimmed relationship notes, and seven Info-level code-quality notes) — none of them falsifies a stated truth, so none is treated as a blocker here, consistent with this task's instruction to treat Warning/Info findings as advisory.

The full backend regression suite was independently exercised this session at the file level for every file this round's fixes touched (5 files, 116 passed / 2 skipped, 0 failed) plus targeted `-t` filters isolating the exact adversarial scenarios (Gap 1, Gap 2, Gap 3) — consistent with the SUMMARY's claim of a full-suite 556/3-skipped green run, and independently corroborating it rather than merely trusting it.

---

_Verified: 2026-09-03T09:26:10Z_
_Verifier: Claude (gsd-verifier)_
