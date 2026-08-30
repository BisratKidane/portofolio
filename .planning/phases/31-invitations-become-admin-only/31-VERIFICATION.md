---
phase: 31-invitations-become-admin-only
verified: 2026-08-30T08:55:00Z
status: human_needed
score: 6/6 must-haves verified (0 overrides; 1 additive hardening item UNCERTAIN pending CI)
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 4/6
  gaps_closed:
    - "Truth 6 (previously FAILED): vouchedByAdmin omitted emailVerified. Now delegates to
       isFunctioningAdmin(inviter), which requires role === 'ADMIN' && status === 'Active' &&
       emailVerified === true. Independently re-derived (not trusted from SUMMARY): read
       auth.js:62-64 directly, then personally ran the mutation-test-the-guard step myself
       (removed the emailVerified clause, reran the suite) and got exactly 2 failures --
       verifyEmail.test.js's '31-05, emailVerified gap' test and auth.test.js's own
       'isFunctioningAdmin > returns false for emailVerified: false' unit test -- with all other
       47 tests unaffected. Restored the clause; suite returned to 47 passed / 2 skipped. This
       gap is genuinely, provably closed."
    - "Truth 5 (previously FAILED): the inviter re-check was a non-locking read, safe only as an
       accidental side effect of an unindexed users.role column. The code fix
       (lock: t.LOCK.UPDATE on the inviter findByPk, user.resolver.js:297-300) is now present and
       is the textbook-correct InnoDB pattern for this exact class of TOCTOU -- confirmed by
       reading the code directly, not by trusting the comment. The plan's own acceptance
       criterion additionally demanded a *recorded mutation-test-the-guard RED/GREEN result*, and
       that specific piece of evidence remains unobtainable locally (see gaps_remaining) -- kept
       open as an UNCERTAIN/human item, not folded into 'closed', pending CI confirmation on
       MySQL 8.4."
  gaps_remaining: []
  regressions: []
human_verification:
  - test: >
      Confirm the new test 'refuses to promote a Pending registrant when the inviter is demoted
      to USER concurrently with redemption (31-05, TOCTOU lock)' in
      backend/src/resolvers/verifyEmail.test.js passes on CI (MySQL 8.4), where it is NOT
      MariaDB-skip-gated -- this is the only place its RED/GREEN distinction can currently be
      observed.
    expected: >
      The test passes on CI, and if a maintainer additionally reverts
      `lock: t.LOCK.UPDATE` -> plain `{ transaction: t }` on a scratch branch and reruns on CI,
      exactly this one test goes red (matching the local mutation-test result already obtained
      for the sibling emailVerified-gap guard).
    why_human: >
      Independently reproduced by this verifier: the local dev database is MariaDB (confirmed via
      `isMariaDB()` returning true), and MariaDB raises a Sequelize "Record has changed since last
      read in table 'users'" exception at an unrelated, upstream statement (the admin-slot
      unindexed `COUNT(*) ... FOR UPDATE` full-table scan) before the code path this plan's fix
      touches is ever reached -- in BOTH the neutered (no lock) and fixed (lock: t.LOCK.UPDATE)
      states, byte-for-byte identical output. I forced the test to run past its skip gate myself
      (temporary local edit, fully reverted, git diff empty afterward) and reproduced this
      independently -- it is not a fabricated excuse in the SUMMARY, it is a genuine local-tooling
      limitation. `gh run list` shows no CI run yet for these commits (39170c9, 7ff6ef3, bef8b98)
      -- the fix has never been exercised on the target engine. The fix itself is standard,
      correct InnoDB practice and not in serious doubt, but the plan's own must-have explicitly
      demands *recorded* RED/GREEN mutation-test evidence, which cannot be produced without CI
      access this verifier does not have.
---

# Phase 31: Invitations Become Admin-Only Verification Report

**Phase Goal:** Every invitation is admin-issued — non-admin members can no longer create one
server-side, nor see the UI offering it — so an invited person, vouched for by the admin who
invited them, activates on email verification alone and never occupies the approval queue.
**Verified:** 2026-08-30T08:55:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (plan 31-05, closing the 2 residual gaps the prior
re-verification found in 31-04's guard)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A linked non-admin member calling `createInvitation` is refused server-side, not merely hidden from (SC-1 / INVITE-01) | ✓ VERIFIED | `grep -n requireAdmin backend/src/resolvers/invitation.resolver.js` → 4 hits (`createInvitation`, `myInvitations`, `invitations`, `pendingRegistrations`), each the literal first statement. Unchanged by 31-05 (`git diff --stat` for 31-05's commits touches only `user.resolver.js`/`auth.js`/`auth.test.js`/`verifyEmail.test.js`). Independently re-ran the full backend suite myself (not copied from any SUMMARY): `npm test -w backend` → **63 files, 440 passed, 3 skipped, 0 failed** — exact match to the orchestrator-reported figures, confirming no regression. |
| 2 | A non-admin no longer sees the invite form or a nav entry offering it; an admin sees it unchanged (SC-2 / INVITE-02) | ✓ VERIFIED (see W-1) | `App.jsx:34-41` — `invitations`/`link-accounts` routes sit inside `<Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>`; a non-admin hitting `/invitations` is redirected to `/dashboard` by the route guard before `InvitationsPage` ever mounts. `AppLayout.jsx:73-89` wraps the Invitations/Link-accounts nav buttons in `user.role === 'ADMIN' &&`. Independently ran the full frontend suite: `npm test -w frontend` → **42 files, 441 passed, 0 failed** — exact match to orchestrator figures. Caveat: `InvitationsPage.jsx` itself renders `<InvitePage />` unconditionally with no component-level role check (confirmed by direct read) — defense-in-depth gap only, not reachable through real app navigation since the parent route guard fires first. Tracked as W-1 below (unchanged from prior verification round). |
| 3 | Someone who registers through an admin invitation and verifies their email can sign in with no admin action in between (SC-3 / INVITE-03) | ✓ VERIFIED | `verifyAndPromote` (`user.resolver.js:254-311`) promotes Pending→Active gated on `isFunctioningAdmin(inviter)` (role, status, AND emailVerified — see Truth 6). "Can sign in" verified literally: `AuthContext.verifyEmail` (`frontend/src/context/AuthContext.jsx:75-83`) stores the real JWT and calls `setUser(...)` for any `status === 'Active'` response — a genuine, fully authenticated session, established with zero further admin action. Family-member linking (a *separate*, pre-existing, explicitly unchanged gate — confirmed by REQUIREMENTS.md's own table: "Family-member link \| required — existing `/pending` + `/link-accounts`, unchanged \| same") is out of this phase's scope; see Investigated-and-Rejected section below for the full trace. Independently ran `npm test -w backend -- src/resolvers/verifyEmail.test.js` → 12 passed + 2 skipped (0 failed) matching the fixed happy-path and negative-path tests. |
| 4 | The approval queue no longer contains invited registrants — only accounts that still need a judgement (SC-4) | ✓ VERIFIED | `pendingRegistrations` (`invitation.resolver.js:34-55`), independently read: filters to `Invitation.status === 'Registered'` rows whose linked user is still `status: 'Pending', emailVerified: true`. Once `verifyAndPromote` flips a vouched-for invitee to `Active`, that user id drops out of `eligibleIds` and the invitation row is excluded from the query result — the invitee no longer occupies the queue. Unchanged by 31-05. |
| 5 | *(31-04/31-05's own additive scope)* The inviter re-check is structurally TOCTOU-safe against a **concurrent** admin demotion/disable, not merely an already-demoted inviter (T-31-12) | ✓ VERIFIED (code); see human_verification for the recorded-evidence gap | `user.resolver.js:297-300`: `models.User.findByPk(invitation.inviterId, { transaction: t, lock: t.LOCK.UPDATE })`. This is the standard, correct InnoDB fix for exactly this TOCTOU shape — a genuine locking read always reads the latest committed row, independent of the transaction's REPEATABLE READ snapshot and independent of the incidental full-table lock the prior code accidentally relied on. Confirmed present via direct code read (not the comment, the actual option object). The comment above it was rewritten to correctly name the lock as the closing mechanism (confirmed by direct read, `user.resolver.js:280-296`). **What is NOT locally provable:** the plan's own must-have requires a *recorded* mutation-test-the-guard RED/GREEN result for this specific guard. I independently reproduced the SUMMARY's diagnostic myself (see Behavioral Spot-Checks) and confirmed the local MariaDB engine cannot distinguish the neutered and fixed states — both produce byte-identical output. This is a genuine tooling limitation, not a fabricated excuse, but it means the "proven load-bearing" claim rests on code inspection + a documented precedent (VERIFY-04) rather than a locally-observed RED/GREEN pair. Escalated to human_verification. |
| 6 | *(31-04/31-05's own additive scope)* `vouchedByAdmin` matches this codebase's own established, three-times-enforced definition of "a currently-functioning administrator" (role=ADMIN AND status=Active AND emailVerified=true) | ✓ VERIFIED | `isFunctioningAdmin` (`auth.js:62-64`): `Boolean(user) && user.role === 'ADMIN' && user.status === 'Active' && user.emailVerified === true`. Wired at `user.resolver.js:301`: `const vouchedByAdmin = isFunctioningAdmin(inviter);`. **I personally ran the mutation-test-the-guard step, not just read the SUMMARY's claim of having done so:** removed the `emailVerified` clause, reran `npm test -w backend -- src/resolvers/verifyEmail.test.js src/utils/auth.test.js`, got exactly 2 failures (`31-05, emailVerified gap` in verifyEmail.test.js; `isFunctioningAdmin > returns false for emailVerified: false` in auth.test.js), 45 other tests unaffected. Restored the clause; reran; 47 passed / 2 skipped, clean. `git diff` confirmed empty after restoration. This gap is genuinely, provably closed. |

**Score:** 6/6 truths verified at the code level; 1 (Truth 5) carries a documented, narrow, non-blocking evidence gap requiring CI confirmation — see Human Verification below.

### Investigated and Rejected: "SC-3 not delivered end-to-end" (31-REVIEW.md CR-02 / prior round's WR-03)

`31-REVIEW.md`'s CR-02 claims the invited registrant, after auto-activation, still lands on
`Pending.jsx` ("Waiting for admin approval") because `register` never sets `familyMemberId` and
`ProtectedRoute.jsx:17` redirects any authenticated non-admin with `familyMemberId == null` to
`/pending`. **The code-level trace is accurate** — independently reproduced by reading `register`
(`user.resolver.js:114-173`, confirmed no `familyMemberId` write), `AuthContext.jsx:75-83`
(`verifyEmail` stores the token/session for `status === 'Active'` regardless of `familyMemberId`),
`VerifyEmail.jsx:25` (`navigate(... !== 'Active' ? '/pending' : '/dashboard')` — picks
`/dashboard`), and `ProtectedRoute.jsx:17` (immediately bounces back to `/pending`).

**This is not a Phase 31 gap, for four independently-confirmed reasons:**

1. **REQUIREMENTS.md's own table is explicit and decisive:** the "two paths" comparison table at
   the top of `REQUIREMENTS.md` lists, for BOTH the admin-invitation and self-registration paths:
   *"Family-member link \| required — existing `/pending` + `/link-accounts`, unchanged \| same."*
   Linking staying a separate, required, unchanged gate is the documented intent of this entire
   milestone, not an oversight.
2. **`approveUser` — the pre-existing, admin-driven approval path — has the identical shape.**
   `approval.resolver.js:44`: `target.update({ status: 'Active', approvedAt, approvedBy }, ...)`
   never sets `familyMemberId` either. A hand-approved self-registrant has always needed a
   *separate* `linkUserToMember` action. This is a pre-existing, cross-cutting characteristic of
   the account model, confirmed by direct code read, not specific to invitations.
3. **`31-CONTEXT.md`'s own F-02 finding, written *before* any Phase 31 code existed**, states
   verbatim: *"Today an invited registrant always landed on `/pending`; after D-04 they hit
   `/dashboard` and are then redirected to `/pending` by `ProtectedRoute` unless an admin has
   already linked them. Same destination, different path... this is not a change to `/pending`
   itself."* The planning team foresaw this exact outcome and explicitly scoped it out.
4. **Phase 33 (later in this same milestone, per `ROADMAP.md:131`) has its own Success Criterion
   4:** *"An approved self-registrant who is not yet linked to a family member lands on the
   existing `/pending` screen."* This is confirmed, ongoing, intended platform behavior for every
   registration path — not something Phase 31 broke or owns fixing.

**"Can sign in" is satisfied in the literal, codebase-defined sense.** `AuthContext.verifyEmail`
stores a real, valid JWT and establishes `user` state for any `Active` account — this is the exact
same session-establishment code path `login()` uses. INVITE-03's authoritative text — *"becomes
`Active` automatically — no approval step, because the admin who invited them already vouched for
them"* — is about removing the *approval decision*, which has been removed and is proven by Truths
3/6 above. Reaching a fully family-linked dashboard was never this phase's contract.

**Genuine, secondary quality findings recorded (not gaps, tracked for developer awareness):**
- The `/pending` page's title, *"Waiting for admin approval,"* is misleading for an `Active`
  account (whether it arrived via invitation-auto-activation or admin-approval) — this is a
  pre-existing, cross-cutting copy defect, not introduced by Phase 31 (see point 2 above).
- The SC-3 test at `VerifyEmail.test.jsx:52-63` mocks `useNavigate` and renders no
  `ProtectedRoute` in the tree — it only proves `navigate('/dashboard')` was *called*, not that
  the account *reaches* `/dashboard`. Independently confirmed by reading the test file directly.
  This is a real test-quality gap (the test cannot fail on the routing behavior it claims to pin)
  but does not change the underlying functional finding above, which was traced from the actual
  application code, not from this test's assertions.

### Investigated and Rejected: "CR-01, admin-bootstrap privilege escalation" (out of Phase 31 scope)

`31-REVIEW.md`'s CR-01 describes a real, serious privilege-escalation chain: the admin-bootstrap
block inside `verifyAndPromote` (`user.resolver.js:264-270`) re-runs "elect the first admin" logic
on *every* email (re-)verification with no `status` condition on the count or the promoted user,
and `updateUser` lets any user change their own email (setting `emailVerified: false`). A
single-admin deployment where the admin changes their own email, followed by any ordinary linked
user re-verifying, could self-elect that ordinary user to `ADMIN`.

**Independently confirmed as pre-existing, not introduced by Phase 31:**
`git log -S "adminCount === 0" -- backend/src/resolvers/user.resolver.js` traces this exact
predicate to `7bb006a feat(11-08)` (Phase 11, well before this milestone). `git show
24d7287:backend/src/resolvers/user.resolver.js` (`24d7287` = the phase-31 base commit) shows the
identical, unguarded `if (Number(adminCount) === 0) { ... }` block already present, byte-identical
in structure, before any Phase 31 plan touched this file. It is outside INVITE-01/02/03's scope
(none of which govern the admin-bootstrap/self-election path) and is not folded into this phase's
gaps, per the explicit instruction not to fail a phase for a defect it did not introduce. **This is
flagged here for visibility and should be prioritized as a security follow-up** (a dedicated
plan or a phase-34/backlog item) given its severity (full admin takeover via two ordinary,
supported mutations) — it is real and should not be lost, just not attributed to this phase.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/resolvers/user.resolver.js` | `verifyAndPromote` locks the inviter row (`lock: t.LOCK.UPDATE`) and gates on `isFunctioningAdmin` | ✓ VERIFIED | Both present and wired, confirmed by direct read at lines 297-301. Comment above correctly rewritten. |
| `backend/src/utils/auth.js` | New exported `isFunctioningAdmin(user)` | ✓ VERIFIED | `auth.js:62-64`, exact 4-part predicate (role, status, emailVerified, `Boolean(user)` null-guard), confirmed by direct read. |
| `backend/src/resolvers/verifyEmail.test.js` | 2 new tests: TOCTOU lock-contention, emailVerified-gap | ✓ VERIFIED | 15 declared `it(` blocks (confirmed via grep, up from 13). Both new tests read directly (lines 461, 530) — match their described behavior. |
| `backend/src/utils/auth.test.js` | 5 new `isFunctioningAdmin` unit cases | ✓ VERIFIED | `describe('isFunctioningAdmin', ...)` at line 204, 5 cases confirmed by direct read (true case, role/status/emailVerified-false cases, null case). |
| Frontend files (`App.jsx`, `AppLayout.jsx`, `InvitationsPage.jsx`, `ProtectedRoute.jsx`) | Unchanged by 31-05 | ✓ VERIFIED | `git diff --stat` for 31-05's commits touches only the 4 backend files listed above. Full frontend suite independently re-run: 42/42 files, 441/441 tests passed. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `user.resolver.js` (`verifyAndPromote`) | `models/index.js` (`User`) | `models.User.findByPk(invitation.inviterId, { transaction: t, lock: t.LOCK.UPDATE })` | ✓ WIRED | Runs inside the transaction (D-07), is now a genuine locking read (not merely a re-read). Code-level correctness confirmed; recorded RED/GREEN evidence pending CI (see human_verification). |
| `user.resolver.js` (`vouchedByAdmin`) | `auth.js` (`isFunctioningAdmin`) | `const vouchedByAdmin = isFunctioningAdmin(inviter);` | ✓ WIRED | Confirmed by direct read and by personally reproducing the mutation-test-the-guard step (2 failures when neutered, 0 when restored). |
| `invitation.resolver.js` | `auth.js` | `requireAdmin(user)` first statement | ✓ WIRED | Unchanged, re-confirmed via grep (4 hits) and a full, independently-run backend suite (0 failures). |
| `App.jsx` | `ProtectedRoute.jsx` | `allowedRoles={['ADMIN']}` | ✓ WIRED | Unchanged, re-confirmed via a full, independently-run frontend suite (0 failures). |

### Data-Flow Trace (Level 4)

Not re-run in depth this round for the `ApprovalsPage`/`InvitationsPage` UI (unchanged by 31-05;
prior round's Level 4 trace remains valid). Backend data-flow for the two new guards traced
directly above (Key Link Verification) since both are the phase's live-wire change this round.

### Behavioral Spot-Checks

All commands below were run live by this verifier, independently, in this pass (not copied from
SUMMARY.md, 31-REVIEW.md, or the orchestrator's execution-state summary):

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full backend suite, independently re-run | `npm test -w backend` | **63 files, 440 passed, 3 skipped, 0 failed** — exact match to orchestrator-reported figures | ✓ PASS |
| Full frontend suite, independently re-run | `npm test -w frontend` | **42 files, 441 passed, 0 failed** — exact match to orchestrator-reported figures | ✓ PASS |
| `verifyEmail`/`auth` guard suite in isolation | `npm test -w backend -- src/resolvers/verifyEmail.test.js src/utils/auth.test.js` | 47 passed, 2 skipped (0 failed) | ✓ PASS |
| Mutation-test gap 2 (`emailVerified`), performed by this verifier (not copied from SUMMARY) | Removed `&& user.emailVerified === true` from `isFunctioningAdmin`, reran both files, restored | Neutered: exactly 2 failures (`31-05, emailVerified gap` + `isFunctioningAdmin` unit case). Restored: 47 passed / 2 skipped, clean `git diff` | ✓ PASS (confirms Truth 6) |
| Mutation-test gap 1 (`lock: t.LOCK.UPDATE`), performed by this verifier | Removed `lock: t.LOCK.UPDATE`, reran `verifyEmail.test.js` alone | 13 passed, 2 skipped (identical to fixed state) — the TOCTOU test stays skipped locally in both states, confirming the local MariaDB engine cannot distinguish RED/GREEN for this specific guard | ⚠️ INCONCLUSIVE locally |
| Diagnostic: force the TOCTOU test past its skip gate, fixed state, performed by this verifier | Temporarily set `ctx.skip(false, ...)`, ran `npx vitest run ... -t "TOCTOU lock"` against committed (fixed) code | 1 failed: `AssertionError... "Record has changed since last read in table 'users'"` | ✓ Matches SUMMARY's claim |
| Diagnostic: same, against neutered (no-lock) code | Same skip bypass, `lock: t.LOCK.UPDATE` removed | 1 failed, **byte-identical error message** to the fixed-state run above | ✓ Confirms SUMMARY's claim: local MariaDB divergence occurs upstream of this plan's fix, not proof the fix itself is inert |
| Confirm no CI run exists yet for these commits | `gh run list --limit 5` | Most recent runs predate the phase-31 commits (`39170c9`/`7ff6ef3`/`bef8b98` not present) | Confirms Truth 5's recorded-evidence gap is real, not stale |
| Confirm local dev DB engine | `isMariaDB()` called directly via Node | `true` | Confirms the local-engine-limitation explanation |
| Working tree left clean after all diagnostic edits | `git status --short`, `git diff --stat` | Only pre-existing untracked `.vscode/`; no diff | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| INVITE-01 | 31-01-PLAN.md | Only an ADMIN can create an invitation, enforced server-side | ✓ SATISFIED | Truth 1. |
| INVITE-02 | 31-03-PLAN.md | Non-admins no longer see the invite form or a route/nav entry; admins see it unchanged | ✓ SATISFIED (W-1 defense-in-depth note, non-blocking) | Truth 2. |
| INVITE-03 | 31-02-PLAN.md + 31-04-PLAN.md + 31-05-PLAN.md (gap closure) | A person who registers through an admin invitation and verifies their email becomes Active automatically, no approval step | ✓ SATISFIED (literal text); additive hardening scope carries 1 documented evidence gap pending CI (Truth 5) | Truths 3, 5, 6. |

**No orphaned requirements:** `REQUIREMENTS.md` maps INVITE-01/02/03 to Phase 31 (INVITE-04 to
Phase 30, out of scope here — unchanged). All three IDs declared exactly once across plan
frontmatter: `31-01`→INVITE-01, `31-02`→INVITE-03, `31-03`→INVITE-02, `31-04`→INVITE-03 (gap
closure), `31-05`→INVITE-03 (gap closure). `REQUIREMENTS.md`'s own checklist shows INVITE-03
checked `[x]` already (pre-dating this verification round); INVITE-01/INVITE-02 remain unchecked
`[ ]` in that file's own tracking, which is a documentation-sync item for the developer to update,
not a code gap — both are independently code-verified above (Truths 1, 2).

### Anti-Patterns Found

No debt markers (`TBD`/`FIXME`/`XXX`) in any of the four files 31-05 modified — confirmed via
`grep -n "TBD\|FIXME\|XXX" backend/src/resolvers/user.resolver.js backend/src/utils/auth.js backend/src/utils/auth.test.js backend/src/resolvers/verifyEmail.test.js` (no output).

A fresh code review (`31-REVIEW.md`, reviewed 2026-08-30T09:40:00Z, run *after* 31-05 landed)
found 2 Critical + 14 Warning + 9 Info issues. This verifier independently re-derived both
Critical findings from first principles rather than trusting the review narrative:

| Finding | Severity (review) | This verifier's independent assessment | Disposition |
|---------|---------|------------------------------------------|-------------|
| CR-01 (review): admin-bootstrap privilege escalation via self-service email change + re-verify | Critical | Confirmed real (traced the escalation chain through `updateUser`/`verifyAndPromote`) AND confirmed pre-existing since Phase 11 (`git log -S`, `git show` at the phase-31 base commit) | **Recorded, not a Phase 31 gap** — see dedicated rejection section above. Recommend prioritizing as a follow-up security fix. |
| CR-02 (review): SC-3 not delivered end-to-end (`/pending` routing, weak test) | Critical (review's label) | Code-level routing trace confirmed accurate; **not a Phase 31 gap** — pre-existing, explicitly documented in `31-CONTEXT.md` F-02 at planning time, consistent with Phase 33's own roadmap SC-4, and REQUIREMENTS.md's own table explicitly keeps family-linking "unchanged" for both paths | **Recorded, not a Phase 31 gap** — see dedicated rejection section above. Copy fix and stronger test recommended as follow-up quality work. |
| WR-12 (review): `InvitationsPage.jsx` renders the invite form unconditionally; stale test locks in non-admin-visible behavior | Warning | Confirmed — `InvitationsPage.jsx:17` renders `<InvitePage />` with no role check; `InvitationsPage.test.jsx:26-33` asserts a non-admin sees "Invite a family member" | Not exploitable through real navigation (route guard fires first) — same as prior round's W-1. Recommend developer triage. |
| Remaining Warnings/Info (WR-01–11, WR-13–14, IN-01–09) | Warning/Info | Not independently re-derived line-by-line this round | Visible in `31-REVIEW.md` for developer triage; none bear on this phase's 4 roadmap success criteria or the 2 additive hardening truths this round specifically re-verified. |

### Human Verification Required

### 1. Confirm the TOCTOU-lock test on CI (MySQL 8.4)

**Test:** Push the commits containing plan 31-05 (`39170c9`, `7ff6ef3`, `bef8b98`) and let CI run
`npm test -w backend -- src/resolvers/verifyEmail.test.js` on MySQL 8.4, where the
`'31-05, TOCTOU lock'` test is not MariaDB-skip-gated. For extra confidence, a maintainer can
additionally revert `lock: t.LOCK.UPDATE` on a scratch branch and confirm CI shows exactly this
one test failing, then confirm restoring it returns the suite to green — completing the mutation-
test-the-guard evidence this plan's own must-have asked for.

**Expected:** The test passes on CI with the fix in place, and (if the optional scratch-branch
step is run) fails when the lock is removed.

**Why human:** This verifier independently confirmed the local MariaDB dev database cannot
distinguish the fixed and neutered states for this specific test — both produce a byte-identical
Sequelize exception at an unrelated, upstream statement before the code under test is ever
reached. `gh run list` confirms no CI run has exercised these commits yet. The fix itself is
correct, standard InnoDB practice by code inspection, and roadmap SC-3 (this phase's actual
literal contract) does not depend on it — but the plan's own stated must-have explicitly asked for
*recorded* RED/GREEN evidence that only CI/MySQL 8.4 can currently produce.

### Gaps Summary

**No gaps found against this phase's roadmap contract.** All four roadmap Success Criteria
(SC-1 through SC-4 / INVITE-01/02/03) are independently verified true in the codebase, not merely
claimed in a SUMMARY. Both residual hardening gaps from the prior re-verification round (the
non-locking inviter read, and `vouchedByAdmin`'s missing `emailVerified` check) are closed at the
code level; one of them (`emailVerified`) is additionally proven load-bearing by a mutation test
this verifier personally performed and observed. The other (`lock: t.LOCK.UPDATE`) is present,
correct by inspection, and consistent with a documented, precedented codebase pattern
(`VERIFY-04`'s identical MariaDB-vs-MySQL-8.4 divergence) — but its own plan's mutation-test-the-
guard evidence cannot be produced without CI access this verifier does not have, so it is
escalated as a single human/CI-confirmation item rather than marked fully closed or failed.

Two Critical findings from a fresh code review were investigated in depth and explicitly rejected
as Phase 31 gaps, both with multi-source, independently-confirmed evidence: the admin-bootstrap
privilege-escalation path (pre-existing since Phase 11, outside INVITE-01/02/03's scope) and the
"/pending" post-activation routing (pre-existing "two-gate" design, explicitly documented in
planning artifacts and a later phase's own roadmap success criterion). Both are recorded here for
developer visibility and recommended as follow-up work — the admin-bootstrap escalation in
particular is severe and worth prioritizing soon — but neither is attributable to this phase and
neither blocks its completion.

---

*Verified: 2026-08-30T08:55:00Z*
*Verifier: Claude (gsd-verifier)*
