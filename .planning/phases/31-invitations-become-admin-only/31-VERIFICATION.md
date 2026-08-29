---
phase: 31-invitations-become-admin-only
verified: 2026-08-29T20:26:57Z
status: gaps_found
score: 4/6 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 3/4
  gaps_closed:
    - "SC-3 / INVITE-03 original gap: verifyEmail's auto-activation no longer promotes a Pending
       registrant to Active based solely on Invitation-row existence. verifyAndPromote now loads
       the CURRENT inviter row and requires role === 'ADMIN' && status === 'Active' before
       promoting. Independently confirmed by re-running the suite live (not trusting SUMMARY.md):
       `npm test -w backend -- src/resolvers/verifyEmail.test.js` -> 12 passed, 1 MariaDB-gated
       skip, 0 failed. The two negative tests this verifier's prior gap explicitly asked for both
       exist and pass: a non-admin-issued (legacy) invitation stays Pending, and a
       demoted/disabled-admin-issued invitation stays Pending. The regression-pinning test for the
       `if (invitation)` boundary (no invitation row at all) also exists and passes."
  gaps_remaining: []
  regressions: []
gaps:
  - truth: >
      The inviter re-check inside verifyAndPromote is structurally safe against a concurrent
      admin demotion/disable committing during the same redemption window -- not just against an
      inviter already demoted/disabled before the invitee verifies. This is 31-04-PLAN.md's own
      stated must-have ("the inviter's authority is re-checked at redemption time, not trusted
      from invite-creation time (TOCTOU close; D-04)") and threat T-31-12's disposition
      ("mitigate").
    status: failed
    reason: >
      Independently confirmed (code read + migration grep, not taken from 31-REVIEW.md's
      narrative): `models.User.findByPk(invitation.inviterId, { transaction: t })`
      (user.resolver.js:287) is a plain, non-locking read -- no `lock:` option. Under InnoDB
      REPEATABLE READ, a locking-free SELECT does not block a concurrent transaction from
      committing a change to the same row. The only reason a concurrent demotion cannot currently
      interleave with this read is that the admin-slot count two statements earlier
      (`SELECT COUNT(*) ... WHERE role = 'ADMIN' AND emailVerified = true FOR UPDATE`,
      user.resolver.js:263-266) incidentally X-locks the entire `users` table, because `role` has
      no index anywhere in the schema -- confirmed via `grep -n "role" backend/src/models/User.js`
      (no `index: true`) and a grep across every file in `backend/migrations/manual/*.sql`
      (no `KEY`/`INDEX` on `role`). MySQL's own documented behavior for an unindexed
      UPDATE/DELETE/SELECT-FOR-UPDATE full table scan is that every scanned row gets locked, which
      is what currently, incidentally, protects the inviter row too. This is not the mechanism the
      code's own comment (user.resolver.js:280-286) or the plan's threat model claims closes the
      TOCTOU -- both describe re-reading the row as the closure, when re-reading alone (without a
      lock) does not prevent a concurrent write from committing in the gap. The moment anyone adds
      the obvious, independently-motivated `KEY idx_users_role (role)` optimization to that
      `COUNT(*)` query, the incidental table lock disappears and the real TOCTOU window reopens --
      silently, because no test in the suite exercises a genuinely concurrent modification of the
      inviter row during redemption (the two new CR-01 tests in verifyEmail.test.js both set the
      inviter's role/status before the mutation runs, never mid-transaction).
    artifacts:
      - path: backend/src/resolvers/user.resolver.js
        issue: "Line 287: models.User.findByPk(invitation.inviterId, { transaction: t }) takes no row lock, so the redemption-time re-check is not structurally TOCTOU-safe on its own -- it is safe today only as an accidental side effect of an unrelated missing index."
    missing:
      - "Lock the inviter row for the duration of the vouching decision: models.User.findByPk(invitation.inviterId, { transaction: t, lock: t.LOCK.UPDATE })"
      - "A lock-contention regression test (reusing the existing rawConnection() harness pattern already present at verifyEmail.test.js:31-42,108-156) that holds a lock on the inviter row, demotes/disables them, commits, and asserts the blocked verifier refuses to promote -- proving the guard is safe independent of the users.role index"
      - "Update the misleading comment at user.resolver.js:280-286, which currently claims re-reading alone closes the TOCTOU"
  - truth: >
      The vouching-admin check (vouchedByAdmin) matches this codebase's own established
      definition of a currently-functioning administrator, consistent with the other guards in
      the same codebase that gate on that exact definition.
    status: failed
    reason: >
      Independently confirmed by code read: `vouchedByAdmin` (user.resolver.js:288) is
      `Boolean(inviter) && inviter.role === 'ADMIN' && inviter.status === 'Active'` -- it omits
      `emailVerified`. Three other places in this same codebase define "a functioning
      administrator" as role=ADMIN AND emailVerified=true: the admin-slot count inside this very
      function (user.resolver.js:263-264, `WHERE role = 'ADMIN' AND emailVerified = true`),
      `updateUser`'s last-administrator guard (user.resolver.js:425-427,
      `{ role: 'ADMIN', emailVerified: true, id: { [Op.ne]: target.id } }`), and
      `getUserFromRequest` (utils/auth.js:29, `if (!user.emailVerified) return null;` -- an
      unverified account, including an ADMIN, is treated as not logged in at all). There is an
      ordinary, non-adversarial path to the divergent state: an admin who changes their own (or
      another admin's) email address has `emailVerified` set to `false`
      (user.resolver.js:444-453 area, confirmed by 31-REVIEW.md's CR-02 citation and consistent
      with the codebase's `beforeUpdate` email-change convention) while `role` stays `ADMIN` and
      `status` stays `Active`. That account cannot authenticate at all per auth.js:29 and is
      excluded from the last-administrator floor -- yet every invitation it previously sent still
      silently auto-activates its registrant, with no `approvedAt`/`approvedBy` stamp and no
      audit-log entry distinguishing this from a fully-vouched promotion. Neither of the two new
      CR-01 tests exercises `emailVerified: false`, so the omission is invisible to the suite.
    artifacts:
      - path: backend/src/resolvers/user.resolver.js
        issue: "Line 288: vouchedByAdmin omits inviter.emailVerified === true, unlike the admin-slot count (263-264) and updateUser's last-admin guard (425-427) in the same file, and unlike getUserFromRequest (utils/auth.js:29)."
    missing:
      - "Add && inviter.emailVerified === true to vouchedByAdmin"
      - "A regression test: an inviter with role: 'ADMIN', status: 'Active', emailVerified: false must leave the registrant Pending"
      - "Consider extracting a single named isVouchingAdmin(user)/isFunctioningAdmin(user) helper reused at all 3+ call sites so the definition of 'administrator' cannot drift apart again -- this is the third time in this codebase (263-264, 425-427, now 288) the same predicate has been hand-rolled independently"
---

# Phase 31: Invitations Become Admin-Only Verification Report

**Phase Goal:** Every invitation is admin-issued — non-admin members can no longer create one server-side, nor see the UI offering it — so an invited person, vouched for by the admin who invited them, activates on email verification alone and never occupies the approval queue.
**Verified:** 2026-08-29T20:26:57Z
**Status:** gaps_found
**Re-verification:** Yes — after gap closure (plan 31-04)

## Goal Achievement

### Observable Truths

Roadmap Success Criteria (all four), plus two must-haves added by 31-04-PLAN.md's own frontmatter
that this round's fresh code review (`31-REVIEW.md`) specifically put back in question — merged
per the verification process's Step 2c (roadmap SCs are the non-negotiable floor; plan
frontmatter can only add scope, never subtract it).

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A linked non-admin member calling `createInvitation` is refused server-side, not merely hidden from (SC-1 / INVITE-01) | ✓ VERIFIED | `invitation.resolver.js` — `requireAdmin(user)` is the literal first statement of `createInvitation`, `myInvitations`, `invitations`, and `pendingRegistrations` (confirmed via `grep -n requireAdmin backend/src/resolvers/invitation.resolver.js` → 4 hits, one per mutation/query). Live-ran `npm test -w backend -- src/resolvers/createInvitation.test.js`: **8/8 passed**, including `'refuses a linked, Active, non-admin member (F-01/SC-1)'` and `'denies myInvitations to a non-admin'`. Unchanged by plan 31-04 (which touched only `user.resolver.js`/`verifyEmail.test.js`). |
| 2 | A non-admin no longer sees the invite form or a nav entry offering it; an admin sees it unchanged (SC-2 / INVITE-02) | ✓ VERIFIED (see W-1 below) | `App.jsx:34-41` — `invitations`/`invite`/`approvals`/`link-accounts` routes sit inside `<Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>`. `ProtectedRoute.jsx:18` redirects a role-mismatched user to `/dashboard`. `AppLayout.jsx:73-89` wraps the Invitations and Link-accounts nav buttons in `{user.role === 'ADMIN' && (...)}`. Live-ran `npm test -w frontend -- src/components/ProtectedRoute.test.jsx src/pages/InvitationsPage.test.jsx src/pages/VerifyEmail.test.jsx src/pages/ApprovalsPage.test.jsx`: **19/19 passed**. Caveat (unchanged from prior verification, not reproduced in depth this round): `InvitationsPage.jsx`'s own `InvitePage` still renders unconditionally with no component-level role check (defense-in-depth gap, not exploitable given the route guard) — tracked as W-1 below. |
| 3 | Someone who registers through an admin invitation and verifies their email can sign in with no admin action in between (SC-3 / INVITE-03) — the specific, previously-identified gap (legacy non-admin-issued invitations; admin demoted/disabled *before* the invitee verifies) | ✓ VERIFIED (gap closed) | `verifyAndPromote` (`user.resolver.js:254-301`) now loads `models.User.findByPk(invitation.inviterId, { transaction: t })` (line 287) and gates promotion on `vouchedByAdmin = Boolean(inviter) && inviter.role === 'ADMIN' && inviter.status === 'Active'` (line 288) before the conditional `User.update` (lines 293-299). Live-ran `npm test -w backend -- src/resolvers/verifyEmail.test.js`: **12/13 passed, 1 MariaDB-gated skip** (0 failed). Read both new negative tests directly (not summarized): `'does not activate a Pending account whose invitation was issued by a non-admin (CR-01, legacy row)'` (line 357) creates the inviter with `role: 'USER'` and asserts the registrant stays `Pending`, `emailVerified: true`, zero `invitation.activated` audit rows; `'...an admin who is now Disabled (CR-01, demoted/disabled admin)'` (line 393) does the same with `role: 'ADMIN', status: 'Disabled'`. Both assertions match the code and both pass live. The happy path (`'promotes a Pending invited registrant to Active on verification (SC-3)'`, line 252) still passes, confirming the fix does not regress the primary flow. **This closes the exact gap the prior VERIFICATION.md blocked on.** Two *new*, narrower must-haves surfaced by this round's fresh review are tracked separately below (Truths 5–6) rather than folded back into this line, because they are additive scope beyond the original gap, not a re-opening of it. |
| 4 | The approval queue no longer contains invited registrants — only accounts that still need a judgement (SC-4) | ✓ VERIFIED | `pendingRegistrations` (`invitation.resolver.js:34-55`) unchanged by this round — two-step query excludes unverified and already-`Active` registrants, keeps orphaned rows reachable. Live-ran `npm test -w backend -- src/resolvers/approveReject.test.js`: **20/20 passed**. The prior verification's downstream concern here ("accounts that genuinely still need judgement are silently excluded") depended entirely on Truth 3's gap; since that gap is closed, this concern no longer applies — a legacy/demoted-admin invitee no longer auto-activates, so it is no longer silently excluded from the queue either. |
| 5 | *(New scope, added by 31-04-PLAN.md's own frontmatter)* The inviter re-check is TOCTOU-safe against a **concurrent** admin demotion/disable — not merely an already-demoted inviter — matching the plan's own stated must-have ("...TOCTOU close...") and threat T-31-12's "mitigate" disposition | ✗ FAILED | See `gaps` frontmatter, gap 1. `findByPk(invitation.inviterId, { transaction: t })` (line 287) is a non-locking read; TOCTOU protection against a race is provided today only as a side effect of an unrelated missing index on `users.role` (confirmed: no `KEY`/`INDEX` on `role` in `backend/src/models/User.js` or any file under `backend/migrations/manual/`). This is fragile, not structural, and untested against actual concurrency. |
| 6 | *(New scope, surfaced independently by this round's fresh code review, `31-REVIEW.md`)* `vouchedByAdmin` matches this codebase's own established, three-times-enforced definition of "a currently-functioning administrator" (role=ADMIN AND status=Active AND emailVerified=true) | ✗ FAILED | See `gaps` frontmatter, gap 2. `vouchedByAdmin` (line 288) omits `emailVerified`, diverging from the admin-slot count (263-264), `updateUser`'s last-admin guard (425-427), and `getUserFromRequest` (`auth.js:29`) — all three of which require `emailVerified` for an account to count as a functioning admin. |

**Score:** 4/6 truths verified (2 new residual gaps found this round; the original blocking gap from the prior verification run is closed)

### Investigated and Rejected: WR-03 ("SC-3 not delivered end-to-end")

`31-REVIEW.md`'s WR-03 claims the invited registrant, after auto-activation, still lands on
`Pending.jsx` ("Waiting for admin approval") because `register` never sets `familyMemberId` and
`ProtectedRoute.jsx:17` redirects any authenticated non-admin with `familyMemberId == null` to
`/pending`. **The code-level claim is accurate** — independently reproduced by tracing
`register` (`user.resolver.js`, confirmed no `familyMemberId` write anywhere in `register` or
`verifyEmail`), `AuthContext.jsx:75-84` (`verifyEmail` sets the session for any `status === 'Active'`
user regardless of `familyMemberId`), and `ProtectedRoute.jsx:17`.

**But this is not a Phase 31 gap.** Three independent pieces of evidence show it is pre-existing,
explicitly-documented, accepted "two-gate" system design, not a regression this phase introduced
or was scoped to fix:

1. `31-CONTEXT.md`'s own F-02 finding (written *before* plan 31-04, during original phase
   planning) states verbatim: *"Today an invited registrant always landed on `/pending`; after
   D-04 they hit `/dashboard` and are then redirected to `/pending` by `ProtectedRoute` unless an
   admin has already linked them. **Same destination, different path** — ... this is not a change
   to `/pending` itself."* The planning team saw this exact routing outcome and explicitly
   classified it as unchanged, not a defect to close.
2. `approveUser` (`approval.resolver.js:20-61`, the admin-driven approval path that predates this
   phase) *also* never sets `familyMemberId` — it only stamps `status: 'Active'`. So even a
   hand-approved account has always needed a **separate** `linkUserToMember` admin action before
   reaching a working dashboard. This is a pre-existing, cross-cutting characteristic of the whole
   account model, not something specific to the invitation flow.
3. Phase 33 (later in this same milestone, per `ROADMAP.md`) has its own Success Criterion 4:
   *"An approved self-registrant who is not yet linked to a family member lands on the existing
   `/pending` screen."* This confirms `/pending` for an unlinked-but-Active account is intended,
   ongoing platform behavior for every registration path, not something Phase 31 broke or was
   responsible for fixing.

The authoritative requirement text in `REQUIREMENTS.md` for INVITE-03 — *"becomes `Active`
automatically — **no approval step**, because the admin who invited them already vouched for
them"* — is satisfied: the approval-queue decision step is what Phase 31 removed for admin-vouched
invitees, and it has been removed. "Can sign in" is also satisfied in the authentication sense (a
valid token is issued and `isAuthenticated` becomes `true`); reaching a fully-linked dashboard was
never this phase's contract. WR-03 is not folded into the `gaps` list.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/resolvers/invitation.resolver.js` | `createInvitation`/`myInvitations`/`invitations`/`pendingRegistrations` guarded by `requireAdmin` | ✓ VERIFIED | Unchanged since prior verification; re-confirmed via grep and a live 8/8 test run this round. |
| `backend/src/resolvers/user.resolver.js` | `verifyAndPromote` re-checks the CURRENT inviter's role/status before promoting Pending→Active | ⚠️ PARTIAL | The check exists and correctly closes the originally-identified gap (legacy rows, already-demoted admins) — confirmed via live test run. It does **not** fully deliver on its own stated "TOCTOU close" claim (non-locking read, gap 1) and omits `emailVerified` from its admin definition (gap 2). |
| `backend/src/resolvers/verifyEmail.test.js` | 3 new tests: non-admin-issued invitation stays Pending, demoted/disabled-admin-issued invitation stays Pending, no-invitation-row stays Pending | ✓ VERIFIED | All three read directly (lines 357, 393, 433) and confirmed passing live. File has exactly 13 declared `it(` blocks (confirmed via grep), up from 10. No test covers `emailVerified: false` on the inviter, or a genuinely concurrent inviter-row modification (both are the missing negative tests named in the gaps above). |
| `frontend/src/App.jsx`, `AppLayout.jsx`, `ApprovalsPage.jsx`, `VerifyEmail.test.jsx` | Unchanged by 31-04 | ✓ VERIFIED | `git diff --stat` for plan 31-04's commits (`90db793`, `5203419`) touches only `backend/src/resolvers/user.resolver.js` and `backend/src/resolvers/verifyEmail.test.js` — confirmed via 31-04-SUMMARY.md's `key-files` and independently by the fact that all frontend tests from the prior verification round still pass unchanged (19/19 live this round). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `user.resolver.js` (`verifyAndPromote`) | `models/index.js` (`User`) | `models.User.findByPk(invitation.inviterId, { transaction: t })` | ⚠️ WIRED BUT NOT LOCK-SAFE | Runs inside the transaction as required (D-07), reads the CURRENT row (not a stale invite-time value) — but takes no row lock, so it is not structurally race-safe (gap 1). |
| `user.resolver.js` (`vouchedByAdmin`) | `models.User.update` (Pending→Active promotion) | `if (vouchedByAdmin) { ... }` gating the existing conditional update | ✓ WIRED (mechanically) | The gate correctly blocks promotion when `vouchedByAdmin` is `false` for the two conditions it does check (role, status) — proven by two live-passing negative tests. It does not gate on `emailVerified` (gap 2). |
| `invitation.resolver.js` | `auth.js` | `requireAdmin(user)` first statement | ✓ WIRED | Unchanged, re-confirmed this round. |
| `App.jsx` | `ProtectedRoute.jsx` | `allowedRoles={['ADMIN']}` | ✓ WIRED | Unchanged, re-confirmed via live 19/19 frontend test run. |

### Data-Flow Trace (Level 4)

Not re-run in depth this round — no data-rendering artifact changed in plan 31-04 (both modified
files are backend resolver logic and a backend test file; the prior verification's Level 4 trace
of `ApprovalsPage.jsx`/`InvitationsPage.jsx` remains valid and unaffected).

### Behavioral Spot-Checks

All commands below were run live by this verifier in this pass (not copied from SUMMARY.md or
31-REVIEW.md):

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `verifyEmail` promotion: happy path + both new inviter-vouching refusals + no-invitation regression guard | `npm test -w backend -- src/resolvers/verifyEmail.test.js` | 12 passed, 1 skipped (MariaDB-gated), 0 failed | ✓ PASS |
| Adversarial non-admin `createInvitation`/`myInvitations` refusal (unchanged by 31-04) | `npm test -w backend -- src/resolvers/createInvitation.test.js` | 8/8 passed | ✓ PASS |
| `register` drops admin notification, new message (unchanged by 31-04) | `npm test -w backend -- src/resolvers/register.test.js` | 8/8 passed | ✓ PASS |
| Narrowed `pendingRegistrations` filter (unchanged by 31-04) | `npm test -w backend -- src/resolvers/approveReject.test.js` | 20/20 passed | ✓ PASS |
| Frontend route/nav/queue/routing coverage (unchanged by 31-04) | `npm test -w frontend -- src/components/ProtectedRoute.test.jsx src/pages/InvitationsPage.test.jsx src/pages/VerifyEmail.test.jsx src/pages/ApprovalsPage.test.jsx` | 19/19 passed | ✓ PASS |
| No `role` index exists anywhere in the schema (independent confirmation of gap 1's root cause) | `grep -n "role" backend/src/models/User.js` + `grep -rln "role" backend/migrations/manual/*.sql \| xargs grep -n "KEY\|INDEX"` | `role` declared as a plain `DataTypes.ENUM` with no `index: true`; second grep returns no matches | ✓ PASS (confirms gap 1's technical premise) |
| `vouchedByAdmin` omits `emailVerified` (independent confirmation of gap 2) | Direct read of `user.resolver.js:288`, cross-referenced against `:263-264`, `:425-427`, `auth.js:29` | Confirmed — 3 other sites require `emailVerified`, this one does not | ✓ PASS (confirms gap 2) |
| Working tree stayed clean (no accidental leftover edits) | `git status --short backend/src/resolvers/user.resolver.js` | no output (clean) | ✓ PASS |

Note: this verifier attempted to independently reproduce plan 31-04's own mutation-test-the-guard
step (neuter `vouchedByAdmin` to `Boolean(inviter)`, rerun, restore) but the in-place source edit
was blocked by the sandbox's auto-mode classifier. This was not treated as a blocker: the two live
negative tests (`CR-01, legacy row` / `CR-01, demoted/disabled admin`) already constitute direct
proof the role/status conditions are load-bearing — both tests construct an inviter row that
exists (`Boolean(inviter)` would be `true` in both), and both assert the registrant stays
`Pending`; this is only possible if the `role`/`status` conditions inside `vouchedByAdmin` are
actively evaluated and failing. A passing "inviter exists but wrong role/status → stays Pending"
test is definitionally the outcome a neutered `Boolean(inviter)`-only check could not produce.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| INVITE-01 | 31-01-PLAN.md | Only an ADMIN can create an invitation, enforced server-side | ✓ SATISFIED | Truth 1. |
| INVITE-02 | 31-03-PLAN.md | Non-admins no longer see the invite form or a route/nav entry; admins see it unchanged | ✓ SATISFIED | Truth 2. |
| INVITE-03 | 31-02-PLAN.md + 31-04-PLAN.md (gap closure) | A person who registers through an admin invitation and verifies their email becomes Active automatically, no approval step, because the admin who invited them already vouched for them | ✓ SATISFIED (for the requirement's literal text) with 2 residual hardening gaps tracked separately (Truths 5–6) | The specific exploit paths the requirement's causal clause was originally failing on (legacy non-admin-issued rows; an admin already demoted/disabled before the invitee verifies) are now closed and tested. The requirement's literal text ("no approval step... vouched for") does not itself demand concurrency-safety or an `emailVerified` check — those are additive hardening items this verifier is flagging as gaps against the *plan's own* broader claims, not against INVITE-03's text. |

No orphaned requirements: REQUIREMENTS.md maps INVITE-01/02/03 to Phase 31 and INVITE-04 to Phase
30 (out of scope here, unchanged from prior verification). All three Phase-31 IDs are declared
exactly once across the four plans' frontmatter (`31-01`: INVITE-01, `31-02`: INVITE-03, `31-03`:
INVITE-02, `31-04`: INVITE-03 gap-closure).

### Anti-Patterns Found

No debt markers (`TBD`/`FIXME`/`XXX`) in either file plan 31-04 modified — confirmed via
`grep -rn "TBD\|FIXME\|XXX" backend/src/resolvers/user.resolver.js backend/src/resolvers/verifyEmail.test.js` (no output).

A fresh code review (`31-REVIEW.md`, reviewed 2026-08-29T15:15:30Z, run *after* plan 31-04 landed)
found 2 Critical + 13 Warning + 10 Info issues. This verifier independently re-derived and
confirmed both Critical findings from first principles (direct code reads, a migration-file grep,
and MySQL InnoDB locking semantics) rather than trusting the review's narrative — both are folded
into the `gaps` list above (Truths 5 and 6) because they represent genuine, currently-real
divergences from claims 31-04-PLAN.md itself makes, not merely stylistic nitpicks.

| Finding | Severity (review) | This verifier's independent assessment | Disposition |
|---------|---------|------------------------------------------|-------------|
| CR-01 (review): non-locking inviter read, TOCTOU only closed by an incidental missing-index table lock | Critical | Confirmed independently (code read + migration grep + InnoDB locking semantics) | **Folded into gaps as Truth 5** |
| CR-02 (review): `vouchedByAdmin` omits `emailVerified`, unlike 3 other guards in this codebase | Critical | Confirmed independently (code read + cross-reference to 3 other sites) | **Folded into gaps as Truth 6** |
| WR-03 (review): SC-3 not delivered end-to-end (`register` never sets `familyMemberId`, `ProtectedRoute` bounces to `/pending`) | Warning | Code-level claim confirmed accurate, but **not a Phase 31 gap** — pre-existing, explicitly documented (31-CONTEXT.md F-02), and consistent with Phase 33's own roadmap SC-4 | **Rejected as a gap** (see dedicated section above) |
| WR-07 (review): dead `notifyAdminsOfPendingRegistration` / `sendPendingRegistrationEmail` | Warning | Confirmed — `grep -rn notifyAdminsOfPendingRegistration backend/src backend/test` shows only its own definition and a tautological mocked-but-uncalled test assertion | Not blocking; genuine dead-code cleanup item, unrelated to this phase's 4 success criteria |
| Remaining Warnings/Info (WR-01, WR-02, WR-04–06, WR-08–13, IN-01–10) | Warning/Info | Not independently re-derived this round | Visible in `31-REVIEW.md` for developer triage; none bear on this phase's 4 declared success criteria |

### Human Verification Required

None. All items above are resolvable from the codebase (direct code reads, live test runs, a
migration-file grep, and documented InnoDB locking behavior) without needing visual/UX judgment.

### Gaps Summary

**The gap this verification was specifically asked to check — SC-3/INVITE-03's original blocking
issue — is genuinely closed.** `verifyAndPromote` no longer promotes a Pending registrant to
Active purely because an `Invitation` row exists; it now re-reads the inviter's current row and
requires `role === 'ADMIN' && status === 'Active'`. Both concrete exploit paths named in the prior
verification (pre-Phase-31 non-admin-issued legacy rows; an admin already demoted/disabled before
the invitee verifies) are closed and covered by passing, independently-read, live-run tests. This
represents real, substantial progress and should be recorded as closed.

Two new, narrower gaps were surfaced by a fresh code review run after plan 31-04 landed, and this
verifier independently confirmed both from the code rather than accepting the review's narrative:

1. **The fix's own "TOCTOU close" claim is not structurally accurate.** The inviter re-check is a
   plain, non-locking read; the protection against a genuinely *concurrent* demotion exists today
   only as an accidental side effect of `users.role` having no index (which forces an unrelated
   `FOR UPDATE` query two lines earlier to lock the whole table). This is exactly the shape of gap
   this codebase's own project history has hit repeatedly — an authorization guard that reads
   correct and passes a fully green suite while resting on something nobody wrote down. Adding an
   index on `role` (an obvious, independently-motivated optimization) would silently reopen this
   exact hole with zero test failures.
2. **`vouchedByAdmin` uses a narrower definition of "administrator" than the rest of this
   codebase.** It omits `emailVerified`, while the admin-slot count two lines above it, `updateUser`'s
   last-administrator guard, and the request-auth middleware all agree that an ADMIN with
   `emailVerified: false` cannot authenticate and should not count as a functioning admin. An
   admin who changes their own email address remains able to silently vouch for pending invitees
   under the current check.

Both gaps are scoped tightly enough to close in a single short follow-up plan (e.g. `31-05`):
add `lock: t.LOCK.UPDATE` to the inviter read, add the `emailVerified` condition to
`vouchedByAdmin`, and add the two missing negative tests (lock-contention race; unverified-admin
inviter). Neither gap reopens the original SC-3 exploit paths, and neither currently causes an
observable failure under ordinary (non-adversarial, non-race) operation — but both are real,
independently-confirmed divergences from what this phase's own plan and threat model claim to
have delivered, and this codebase has a documented history (Phases 14, 15, 30, and now 31 itself)
of exactly this class of gap surviving a fully green test suite.

One review finding (WR-03) was investigated and explicitly rejected as a gap: the invited
registrant landing on `/pending` after auto-activation (because `familyMemberId` is still unset)
is pre-existing, explicitly-planned "two-gate" system behavior — not a Phase 31 regression — with
three independent pieces of supporting evidence cited above.

---

*Verified: 2026-08-29T20:26:57Z*
*Verifier: Claude (gsd-verifier)*
