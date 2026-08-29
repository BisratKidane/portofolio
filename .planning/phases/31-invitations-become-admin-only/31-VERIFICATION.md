---
phase: 31-invitations-become-admin-only
verified: 2026-08-29T14:20:00Z
status: gaps_found
score: 3/4 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Someone who registers through an admin invitation and verifies their email can sign in with no admin action in between (Roadmap SC-3 / INVITE-03)"
    status: failed
    reason: >
      verifyEmail's auto-activation (backend/src/resolvers/user.resolver.js:275-289) promotes
      Pending -> Active based solely on the EXISTENCE of an Invitation row keyed by
      registeredUserId. It never reads the inviter's role or current status, so the promotion
      does not actually prove "the admin who invited them vouched for them" -- it only proves
      "some invitation row exists." Two concrete ways this is exploitable, both confirmed against
      the current codebase, not hypothetical:
        (1) Legacy rows: before this phase createInvitation was gated by requireFamilyAccess,
            which let any linked, Active, non-admin family member send an invitation (confirmed
            via `git show a9e9b53:backend/src/resolvers/invitation.resolver.js`). Phase 30 SC-4
            and INVITE-04 explicitly required these rows to keep rendering correctly, and no
            migration expires or re-scopes them (`git diff a9e9b53..HEAD -- backend/migrations/`
            is empty). Any such Pending invitation that is still unexpired and unredeemed will,
            if registered against and verified, auto-activate its invitee -- with nobody who
            currently holds ADMIN having vouched for them.
        (2) Forward-looking: the inviter's role is checked only at invite-creation time, never
            at redemption time. An admin who invites someone and is later demoted to USER
            (`updateUser`) or set to Disabled/Rejected before the invitee verifies still
            auto-activates that invitee, because verifyEmail's lookup never re-checks the
            inviter.
      This directly contradicts the phase goal's premise ("an invited person, vouched for by the
      admin who invited them, activates on email verification alone") and the milestone goal in
      REQUIREMENTS.md ("an invited person, vouched for by the admin who invited them, activates
      on email verification alone"). It also has a knock-on effect on Roadmap SC-4: an account
      that genuinely still needs a judgement (because no current admin vouched for it) is
      silently excluded from `pendingRegistrations` once auto-activated, rather than surfacing
      for review.
    artifacts:
      - path: backend/src/resolvers/user.resolver.js
        issue: "verifyAndPromote's Invitation lookup (lines 275-289) never loads or validates invitation.inviterId's role/status before promoting Pending -> Active"
    missing:
      - "Re-check the vouching admin at promotion time: load the inviter (models.User.findByPk(invitation.inviterId)) and require role === 'ADMIN' && status === 'Active' before promoting"
      - "A migration or lazy sweep that closes the existing window on pre-Phase-31 non-admin-issued Pending invitations, so they don't silently auto-activate their registrant"
      - "A negative test: a Pending, invited, verified registrant whose invitation.inviterId belongs to a non-admin (or a since-demoted/disabled former admin) stays Pending after verifyEmail"
      - "A negative test (independently reproduced by this verifier, see Behavioral Spot-Checks): a Pending account with NO invitation row at all stays Pending after verifyEmail -- confirms the `if (invitation)` boundary itself has no regression guard"
---

# Phase 31: Invitations Become Admin-Only Verification Report

**Phase Goal:** Every invitation is admin-issued — non-admin members can no longer create one server-side, nor see the UI offering it — so an invited person, vouched for by the admin who invited them, activates on email verification alone and never occupies the approval queue.
**Verified:** 2026-08-29T14:20:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A linked non-admin member calling `createInvitation` is refused server-side, not merely hidden from (SC-1) | ✓ VERIFIED | `invitation.resolver.js:61` — `requireAdmin(user)` is the literal first statement of `createInvitation`. Adversarial test `createInvitation.test.js:102` (`'refuses a linked, Active, non-admin member (F-01/SC-1)'`) uses `activeMember()` and asserts `errors[0].message === 'Admin access is required.'`. Ran `npm test -w backend -- src/resolvers/createInvitation.test.js`: 8/8 passed. |
| 2 | A non-admin no longer sees the invite form or a nav entry offering it; an admin sees it unchanged (SC-2) | ✓ VERIFIED (see Warning below) | `App.jsx:34-40` — `invitations`/`invite`/`approvals` routes moved into `<Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>`; `ProtectedRoute.jsx:18` redirects a role-mismatched user to `/dashboard`. `AppLayout.jsx:73-81` wraps the Invitations nav button in `{user.role === 'ADMIN' && (...)}`. Ran `npm test -w frontend -- src/components/ProtectedRoute.test.jsx src/pages/InvitationsPage.test.jsx`: all passed. **Caveat:** `InvitationsPage.jsx`'s own `InvitePage` renders unconditionally with no component-level role check — a non-admin is protected only by the route guard, not defense-in-depth, and a pre-existing test (`InvitationsPage.test.jsx:26-33`) still asserts the invite form is shown to a `role: 'USER'` user (true at the component level, unreachable in practice via routing). See Warning W-1. |
| 3 | Someone who registers through an admin invitation and verifies their email can sign in with no admin action in between (SC-3 / INVITE-03) | ✗ FAILED | See `gaps` in frontmatter. `verifyEmail`'s promotion (`user.resolver.js:275-289`) keys on `Invitation.findOne({ where: { registeredUserId: user.id } })` alone — no inviter-role check. This is provably true and reachable, not theoretical: pre-Phase-31 non-admin-issued invitations remain live (confirmed via git history + empty migration diff), and the guard's negative path is untested (independently reproduced, see Behavioral Spot-Checks). |
| 4 | The approval queue no longer contains invited registrants — only accounts that still need a judgement (SC-4) | ✓ VERIFIED (query-level), with a downstream implication from Truth 3 | `pendingRegistrations` (`invitation.resolver.js:34-55`) is a two-step query: excludes unverified and already-`Active` registrants, keeps orphaned rows reachable. Tests `approveReject.test.js:268,279,307` cover exclude-unverified, exclude-already-Active, keep-orphaned. Ran `npm test -w backend -- src/resolvers/approveReject.test.js`: 20/20 passed. The query does exactly what it was narrowed to do; the residual concern is that Truth 3's gap causes accounts that genuinely still need judgement (non-admin-vouched) to be silently excluded rather than surfaced — same root cause as the Truth 3 gap, not a separate defect in this query. |

**Score:** 3/4 truths verified (1 BLOCKER)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/resolvers/invitation.resolver.js` | `createInvitation`/`myInvitations` guarded by `requireAdmin`; `pendingRegistrations` two-step narrowed query | ✓ VERIFIED | All three confirmed present and match plan spec exactly (lines 18, 35, 34-55). Zero remaining `requireFamilyAccess` calls (`grep -c requireFamilyAccess` → 0). |
| `backend/src/resolvers/user.resolver.js` | `verifyEmail` promotes Pending→Active inside its transaction, keyed on `registeredUserId`; `register` drops admin notification, reworded message | ✓ VERIFIED (mechanically) / ✗ INSUFFICIENT (semantically) | Promotion block exists exactly as specified (D-05/D-06/D-07/D-08 all individually correct: conditional `WHERE status='Pending'`, no `Invitation.status` write, no `approvedAt`/`approvedBy`). `register` no longer calls `notifyAdminsOfPendingRegistration` (grep confirms zero call sites) and returns the exact new message string. However, the promotion's premise ("admin vouched") is not verified by the code — see Truth 3. |
| `backend/src/resolvers/createInvitation.test.js` | Adversarial non-admin refusal test (F-01), admin-only regression coverage | ✓ VERIFIED | Both present (lines 102, 128), passing. |
| `backend/src/resolvers/approveReject.test.js` | pendingRegistrations narrowed-filter coverage (D-09) | ✓ VERIFIED | 5 `it(...)` cases in the `pendingRegistrations query` describe block (was 2), all passing. |
| `backend/src/resolvers/verifyEmail.test.js` | SC-3 happy path + D-06 non-resurrection tests | ⚠️ PARTIAL | Happy-path (Active-inviter) and Rejected/Disabled non-resurrection cases all present and passing (9/9, 1 skipped). Missing: the negative case for a non-admin-issued or since-demoted-inviter invitation (CR-01), and a negative case for a Pending account with no invitation row at all (CR-02) — both independently reproduced as gaps by this verifier, not present in the file. |
| `frontend/src/App.jsx` | Routes moved to ADMIN-only guard group | ✓ VERIFIED | Confirmed, lines 34-40. |
| `frontend/src/components/AppLayout.jsx` | Invitations nav button ADMIN-gated | ✓ VERIFIED | Confirmed, lines 73-81. |
| `frontend/src/pages/ApprovalsPage.jsx` | Unverified branch removed, orphaned branch preserved | ✓ VERIFIED | `blocked` is exactly `orphaned` (line 133); no `emailVerified`/`unverified`/`Chip` references remain; WR-01 (Phase 30's regression test) still passes. |
| `frontend/src/pages/VerifyEmail.test.jsx` | Active→`/dashboard`, Pending→`/pending` coverage | ✓ VERIFIED | Both new cases present; `git diff --stat frontend/src/pages/VerifyEmail.jsx` shows no production-code changes as required. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `invitation.resolver.js` | `auth.js` | `requireAdmin(user)` first statement | ✓ WIRED | Confirmed on `createInvitation` (line 61) and `myInvitations` (line 18). |
| `invitation.resolver.js` | `models/index.js` | `registeredUserId` FK two-step lookup | ✓ WIRED | `pendingRegistrations` correctly filters via a second `User.findAll` on collected `registeredUserId`s. |
| `user.resolver.js` | `models/index.js` | `Invitation.findOne({ registeredUserId: user.id })` inside `verifyEmail`'s transaction | ⚠️ WIRED BUT SEMANTICALLY INSUFFICIENT | The lookup runs and gates on row-existence correctly, but does not complete the "admin vouched" check the phase goal requires (Truth 3). |
| `user.resolver.js` | `audit.js` | `writeAuditLog(... 'invitation.activated' ...)` after commit | ✓ WIRED | Confirmed at lines 308-315, fired only when `promotedInvitation` is truthy, after the transaction. |
| `App.jsx` | `ProtectedRoute.jsx` | `allowedRoles={['ADMIN']}` | ✓ WIRED | Confirmed; `ProtectedRoute.test.jsx` exercises the redirect. |
| `AppLayout.jsx` | `AuthContext.jsx` | `user.role === 'ADMIN'` nav gate | ✓ WIRED | Confirmed at lines 73-81. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `ApprovalsPage.jsx` | `rows` (from `pendingRegistrations`) | Two real Sequelize `findAll` queries (Invitation, then User), not static/hardcoded | Yes | ✓ FLOWING |
| `InvitationsPage.jsx` | `isAdmin` gate on `ApprovalsPage` composition | `useAuth().user.role` | Yes | ✓ FLOWING (but see W-1: `InvitePage` inside the same component is not similarly gated) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Adversarial non-admin `createInvitation`/`myInvitations` refusal | `npm test -w backend -- src/resolvers/createInvitation.test.js` | 8/8 passed | ✓ PASS |
| Narrowed `pendingRegistrations` filter (D-09/D-10) | `npm test -w backend -- src/resolvers/approveReject.test.js` | 20/20 passed | ✓ PASS |
| `register` drops admin notification, new message (D-11/D-13) | `npm test -w backend -- src/resolvers/register.test.js` | 8/8 passed | ✓ PASS |
| `verifyEmail` promotion happy path + D-06 non-resurrection | `npm test -w backend -- src/resolvers/verifyEmail.test.js` | 9/9 passed, 1 skipped (MariaDB-gated) | ✓ PASS |
| Frontend route/nav/queue/routing coverage | `npm test -w frontend -- src/components/ProtectedRoute.test.jsx src/pages/ApprovalsPage.test.jsx src/pages/VerifyEmail.test.jsx src/pages/InvitationsPage.test.jsx` | 19/19 passed | ✓ PASS |
| **Independent reproduction of CR-02's claim:** temporarily replaced `verifyEmail`'s `if (invitation) { ... }` guard with an unconditional `User.update({status:'Active'}, {where:{id:user.id, status:'Pending'}})` (change confirmed via `git diff --stat`, reverted afterward, confirmed clean via `git status`), then re-ran `verifyEmail.test.js` | `npm test -w backend -- src/resolvers/verifyEmail.test.js` | 9/9 passed, 1 skipped — **identical result to the unmodified guard** | ✗ FAIL (confirms the gap) — proves no test in the suite distinguishes "invited, admin-vouched" promotion from "any Pending account self-promotes on verification" |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| INVITE-01 | 31-01-PLAN.md | Only an ADMIN can create an invitation, enforced server-side | ✓ SATISFIED | `requireAdmin(user)` guard + adversarial test, verified above (Truth 1). |
| INVITE-02 | 31-03-PLAN.md | Non-admins no longer see the invite form or a route/nav entry; admins see it unchanged | ✓ SATISFIED (route/nav level) | Verified above (Truth 2); see Warning W-1 for a defense-in-depth gap that does not change the outcome for an actual non-admin user going through normal navigation. |
| INVITE-03 | 31-02-PLAN.md | A person who registers through an admin invitation and verifies their email becomes Active automatically, because the admin who invited them already vouched for them | ✗ BLOCKED | The mechanical Pending→Active transition works and commits atomically (D-04/D-05/D-06/D-07/D-08 individually correct), but the requirement's own causal clause — "because the admin who invited them already vouched for them" — is not verified by the code. See Truth 3 / gaps. |

No orphaned requirements: REQUIREMENTS.md maps INVITE-01, INVITE-02, INVITE-03 to Phase 31, and all three are declared exactly once across the three plans' frontmatter (`31-01`: INVITE-01, `31-02`: INVITE-03, `31-03`: INVITE-02). INVITE-04 is correctly attributed to Phase 30 and out of this phase's scope.

### Anti-Patterns Found

No debt markers (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`) in any file this phase modified (checked via grep across all 11 files listed in 31-REVIEW.md's `files_reviewed_list`).

A prior code review (`31-REVIEW.md`, 2026-08-29) independently found 2 Critical + 8 Warning + 8 Info issues. This verifier independently re-derived and confirmed both Critical findings from first principles (git history, migration diff, live code read, and a reproduced test run) rather than trusting the review's narrative:

| Finding | Severity | Confirmed by this verifier | Impact on phase goal |
|---------|----------|------------------------------|------------------------|
| CR-01: auto-activation keyed on invitation-row existence, not inviter's role | 🛑 Blocker | Yes — independently traced git history (`a9e9b53`) showing pre-phase `requireFamilyAccess` allowed non-admin invitations, confirmed empty migration diff, confirmed no role check in current code | Directly blocks Truth 3 / INVITE-03 |
| CR-02: the `if (invitation)` guard has no negative test — deleting it keeps the suite green | 🛑 Blocker (folded into same gap) | Yes — reproduced independently (see Behavioral Spot-Checks), reverted cleanly | Same root cause as CR-01; both point at the same missing check + missing test |
| W-1 (review's WR-01): `InvitationsPage.jsx`'s `InvitePage` has no component-level ADMIN gate; a pre-existing test still asserts the invite form shows for a non-admin | ⚠️ Warning | Yes — confirmed `InvitationsPage.jsx` has no role check around `<InvitePage />`, and `InvitationsPage.test.jsx:26-33` still passes asserting the old (pre-phase) behavior | Does not change the real-world outcome (route guard fully blocks navigation) but is a stale/self-contradicting test and a missed defense-in-depth layer given this project's own stated rationale for defense-in-depth (D-02) |
| W-2 (review's WR-03): no admin escape hatch (`revokeInvitation`/`setUserStatus`) once an invitation is sent — a mis-sent invite cannot be stopped | ⚠️ Warning | Not independently re-derived in depth; traced schema (`UpdateUserInput` has no `status` field) and confirmed no such mutation exists in `user.schema.js`/`invitation resolvers` | Not one of the phase's 4 stated success criteria; flagged for developer awareness, not blocking |
| W-3 (review's WR-02): `Set.has` id comparison has no numeric coercion | ⚠️ Warning | Not independently re-derived; code read confirms the pattern described | Works correctly today (mysql2 returns JS numbers); fragile against future driver/type changes |

The remaining Warning/Info items from `31-REVIEW.md` (WR-04 through WR-08, IN-01 through IN-08) are not reproduced in depth here — they concern code quality, error-message leakage, and UI polish issues that do not bear on this phase's 4 declared success criteria. They are visible in `31-REVIEW.md` for the developer's own triage.

### Human Verification Required

None. All items above are resolvable from the codebase (grep, git history, targeted test runs) without needing visual/UX judgment.

### Gaps Summary

Three of four roadmap success criteria are genuinely and robustly achieved: `createInvitation`/`myInvitations` are enforced admin-only server-side (SC-1), the invite UI and route are admin-gated (SC-2), and the approval queue's narrowing query correctly excludes unverified/already-Active registrants while keeping orphaned rows reachable (SC-4's query-level half).

The blocking gap is SC-3 / INVITE-03. The phase's premise — "every invitation is admin-issued... so an invited person, vouched for by the admin who invited them, activates on email verification alone" — is true only for the population of invitations created *after* this phase shipped, by admins who remain admins until the invitee verifies. It is not true, and the code does not attempt to make it true, for: (a) invitations created before this phase by non-admin family members (a state Phase 30 explicitly created and preserved, and which nothing in this phase invalidates or migrates), and (b) any invitation whose inviter is later demoted, disabled, or rejected before the invitee verifies. Both cases result in an account being silently promoted to `Active` — and simultaneously excluded from the approval queue — with no admin having genuinely vouched for it. This is the same category of authorization gap this codebase's own planning documents (31-CONTEXT.md, 31-PATTERNS.md) explicitly warn about, citing Phases 14, 15, and 30 as precedent, and it was caught by neither the phase's own tests nor the plan's threat model (T-31-05 only covers Rejected/Disabled *invitee* accounts, not the inviter's role).

This gap does not look like an accepted, documented tradeoff — CONTEXT.md's D-05 discusses *not* adding a migration or provenance column as a scoping decision, but never discusses or accepts the non-admin-inviter/demoted-admin exploit itself, so no override is suggested here. The recommended closure path (re-check the inviter's role/status at redemption time, plus a migration/sweep for the pre-existing window, plus the two missing negative tests) is scoped tightly enough to fit as a follow-up plan within this phase rather than requiring a redesign.

---

*Verified: 2026-08-29T14:20:00Z*
*Verifier: Claude (gsd-verifier)*
