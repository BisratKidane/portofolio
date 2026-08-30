---
phase: 31-invitations-become-admin-only
reviewed: 2026-08-30T09:40:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - backend/src/resolvers/approveReject.test.js
  - backend/src/resolvers/createInvitation.test.js
  - backend/src/resolvers/invitation.resolver.js
  - backend/src/resolvers/register.test.js
  - backend/src/resolvers/user.resolver.js
  - backend/src/resolvers/verifyEmail.test.js
  - backend/src/utils/auth.js
  - backend/src/utils/auth.test.js
  - frontend/src/App.jsx
  - frontend/src/components/AppLayout.jsx
  - frontend/src/pages/ApprovalsPage.jsx
  - frontend/src/pages/ApprovalsPage.test.jsx
  - frontend/src/pages/VerifyEmail.test.jsx
findings:
  critical: 2
  warning: 14
  info: 9
  total: 25
status: issues_found
---

# Phase 31: Code Review Report

**Reviewed:** 2026-08-30T09:40:00Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Re-review of Phase 31 as it stands after plan 31-05 landed. This report supersedes the
previous 31-REVIEW.md at this path.

**Verification of the two previously-raised Critical findings — both are genuinely closed:**

- **Previous CR-01 (TOCTOU on the inviter re-check) — CLOSED.** `user.resolver.js:297-300` now
  issues `models.User.findByPk(invitation.inviterId, { transaction: t, lock: t.LOCK.UPDATE })`.
  I traced this independently rather than accepting the claim: under InnoDB REPEATABLE READ a
  locking read is served from the latest committed version, not from the transaction's
  consistent-read snapshot (which was already established by the `individualHooks: true`
  token-consumption `User.update` at `:258-261`, before any concurrent demote could commit). The
  fix is therefore load-bearing and no longer depends on the incidental full-table lock taken by
  the un-indexed `COUNT(*) ... FOR UPDATE` scan — it survives someone adding an index on
  `users.role`. `verifyEmail.test.js:461-524` proves it with a real second MySQL connection
  holding an X lock on the inviter row and demoting mid-flight, not with an in-process
  `Promise.all`. `findByPk(null)` returns `null` in Sequelize 6, so a null `inviterId` degrades to
  "not vouched", which is the safe direction.
- **Previous CR-02 (`vouchedByAdmin` omitted `emailVerified`) — CLOSED.** `isFunctioningAdmin`
  (`auth.js:62-64`) requires role `ADMIN` **and** status `Active` **and** `emailVerified === true`,
  and `user.resolver.js:301` routes the vouching decision through it. Unit-pinned at
  `auth.test.js:204-224` (including the `null` case) and integration-pinned at
  `verifyEmail.test.js:530-566`.

**What this re-review found instead.** The fix quality on those two items is high, but it is
narrow: 31-05 hardened the *new* inviter-vouching branch and left the block of code immediately
above it — the ADMIN bootstrap at `user.resolver.js:264-270`, which sits inside the same
`verifyAndPromote` transaction that the review brief asked me to scrutinize — carrying a
privilege-escalation path (CR-01 below). Separately, the phase's headline user-visible outcome
(SC-3, "invited registrant reaches the app without an admin step") is not delivered end to end:
`ProtectedRoute` bounces the freshly-Active invitee straight back to a page titled *"Waiting for
admin approval"*, and the test that claims to pin SC-3 renders `VerifyEmail` without the router
guard, so it is structurally incapable of catching this (CR-02 below).

The authorization changes themselves are correct where they were made: `createInvitation`,
`myInvitations`, `invitations`, and `pendingRegistrations` all call `requireAdmin` as their first
statement, and `createInvitation.test.js:99-111`/`:125-131` exercise the *right* adversarial actor
(a linked, Active, non-admin — the one the old `requireFamilyAccess` guard would have let through),
which is exactly the discipline the Phase 14/15/30 authz history calls for. The frontend half of
the same change (the route move in `App.jsx` and the nav gate in `AppLayout.jsx`) has no test at
all (WR-10).

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: The ADMIN bootstrap inside `verifyAndPromote` grants ADMIN to any account that verifies an email while zero verified admins exist

**File:** `backend/src/resolvers/user.resolver.js:264-270` (with `:435-444` and `:457-467`)

**Issue:** `verifyAndPromote` re-runs the first-admin bootstrap on **every** email verification,
including re-verifications by long-standing accounts:

```js
const [{ adminCount }] = await sequelize.query(
  "SELECT COUNT(*) AS adminCount FROM users WHERE role = 'ADMIN' AND emailVerified = true FOR UPDATE",
  { transaction: t, type: sequelize.QueryTypes.SELECT }
);
if (Number(adminCount) === 0) {
  await models.User.update({ role: 'ADMIN' }, { where: { id: user.id }, transaction: t });
}
```

Two defects compound:

1. **The count omits `status`**, so it does not use the `isFunctioningAdmin` definition 31-05 just
   introduced — and the `UPDATE` has **no condition on the promoted user's status either**, so a
   `Pending`, `Rejected`, or `Disabled` account can be handed the `ADMIN` role.
2. **Nothing prevents the count from reaching zero.** `updateUser:457-467` lets *any* user change
   *their own* email (`isSelf` skips `requireAdmin`), and an email change sets
   `target.emailVerified = false`. When there is a single administrator — the normal shape of this
   deployment — that one self-service action drops `adminCount` to `0`.

The escalation chain, using only supported mutations:

1. The sole admin changes their own email via `updateUser` (an ordinary action; the window lasts
   until they click the new verification link, indefinitely if the mail bounces).
   `adminCount` is now `0`.
2. Any authenticated, ordinary `USER` — already `Active`, already linked — calls
   `updateUser(id: <self>, input: { email: "..." })`, which is permitted, then clicks their own
   verification link.
3. `verifyEmail` runs, `adminCount === 0`, and `user.resolver.js:269` sets **their** role to
   `ADMIN`. Their status is already `Active` and `emailVerified` is now `true`.
4. `user.reload()` at `:330` then `signToken(user)` at `:341` mints a JWT carrying
   `role: 'ADMIN'`. `getUserFromRequest` passes (verified + Active), `requireAdmin` passes. Full,
   immediately usable administrator session.

An attacker does not need to observe the window: the change-email/verify cycle is self-service and
repeatable, so it can simply be retried until it lands in one.

The codebase already treats "zero verified admins" as a state to be prevented — `updateUser:437-442`
refuses to demote the last verified admin for exactly that reason — yet the email-change path walks
into the same state with no guard, and `verifyAndPromote` then treats it as an invitation to elect a
new admin. `verifyEmail.test.js:233-248` only covers the case where a verified admin **already
exists**; the zero-admin branch is exercised nowhere with a non-bootstrap verifier.

Note this is not fully mitigated by the new inviter check: the invited-registrant branch at `:306`
correctly refuses to activate when the inviter is not a functioning admin, but the bootstrap at
`:268` runs **before** it and is not gated by anything.

**Fix:** Make the bootstrap agree with `isFunctioningAdmin`, and restrict it to the case it exists
for (a genuinely empty system electing its first admin), not to every re-verification:

```js
// Only an Active, verified ADMIN counts as a functioning administrator -- same
// three-part definition as isFunctioningAdmin (utils/auth.js).
const [{ adminCount }] = await sequelize.query(
  "SELECT COUNT(*) AS adminCount FROM users " +
    "WHERE role = 'ADMIN' AND status = 'Active' AND emailVerified = true FOR UPDATE",
  { transaction: t, type: sequelize.QueryTypes.SELECT }
);
if (Number(adminCount) === 0) {
  // Never elect an account that is not itself eligible to administer, and never
  // re-elect on a routine email re-verification -- bootstrap is for the first
  // account only.
  const [promoted] = await models.User.update(
    { role: 'ADMIN' },
    { where: { id: user.id, status: 'Active', role: 'USER' }, transaction: t }
  );
  if (promoted > 0) { /* audit: 'user.bootstrapped_admin' */ }
}
```

and close the source of the empty window in `updateUser` — refuse an email change that would
de-verify the last functioning administrator, mirroring the existing last-administrator guard:

```js
if (normalized !== target.email) {
  if (target.role === 'ADMIN') {
    const otherFunctioningAdmins = await models.User.count({
      where: { role: 'ADMIN', status: 'Active', emailVerified: true, id: { [Op.ne]: target.id } }
    });
    if (otherFunctioningAdmins === 0) {
      throw new Error('Cannot change the last administrator\'s email address; promote another administrator first.');
    }
  }
  // ...existing de-verification
}
```

Add a test asserting that an `Active`, linked, non-admin who re-verifies an email while zero
verified admins exist is **not** promoted.

---

### CR-02: SC-3 is not delivered end to end — the auto-activated invitee lands on "Waiting for admin approval", and the test that pins SC-3 cannot see it

**File:** `frontend/src/pages/VerifyEmail.test.jsx:52-63` (with `frontend/src/components/ProtectedRoute.jsx:17`, `frontend/src/App.jsx:28-33`, `frontend/src/pages/Pending.jsx:13`)

**Issue:** The backend half of SC-3 works: `verifyAndPromote` flips an invited `Pending` registrant
to `Active` (`user.resolver.js:307-311`) and `verifyEmail.test.js:252-286` proves it. The frontend
then contradicts it. Traced end to end:

1. `register` (`user.resolver.js:137-147`) creates the account with **no `familyMemberId`** — the
   admin links a family member later, via `linkUserToMember`.
2. `verifyEmail` returns `status: 'Active'`, so `AuthContext.verifyEmail` stores the token and sets
   `user = { ..., role: 'USER', status: 'Active', familyMemberId: null }`.
3. `VerifyEmail.jsx:25` runs `navigate(... ? '/pending' : '/dashboard')` and picks `/dashboard`.
4. `/dashboard` sits inside `<Route element={<ProtectedRoute />}>` (`App.jsx:28-29`), and
   `ProtectedRoute.jsx:17` is:
   `if (!user.familyMemberId && user.role !== 'ADMIN') return <Navigate to="/pending" replace />;`
5. The invitee is immediately redirected to `Pending.jsx`, whose heading is **"Waiting for admin
   approval"** — telling an account that was *just* auto-approved that it is awaiting approval. The
   body copy ("awaiting an admin to link you to your family member") is correct; the title is not.

This is pinned in the opposite direction by an existing test:
`ProtectedRoute.test.jsx` — *"redirects an unlinked, non-admin user to /pending"* — so the bounce is
established, tested behavior, and the new SC-3 test contradicts it.

The new test at `VerifyEmail.test.jsx:52-63` cannot detect any of this. It renders `VerifyEmail`
inside a `MemoryRouter` whose only route is `/verify-email`, with `useNavigate` mocked to a spy. It
asserts `navigate` was *called with* `/dashboard` — not that the user *reaches* `/dashboard`.
`ProtectedRoute` is never in the tree. The assertion is true and the behavior is still wrong, which
is precisely the false-green shape this project's Phase 14/15/30 history keeps producing.

`31-03-SUMMARY.md:102` states *"SC-3 is now provably true one layer further: the frontend redirects
a freshly-promoted Active account to `/dashboard`, not `/pending`"*. It does not.

**Fix:** Pick one and make the code and the test agree.

- If linking is still a required gate (the likely intent, per the decision log's rejected
  "mention linking" option), then `Pending.jsx:13`'s title must stop saying "Waiting for admin
  approval" for an `Active` account — branch the copy on `user.status`:

```jsx
<AuthShell
  eyebrow="Almost there"
  title={user.status === 'Active' ? 'Waiting to be linked to your family' : 'Waiting for admin approval'}
>
```

  and the SC-3 test's expected navigation target must become `/pending`, with a comment explaining
  that linking, not approval, is the remaining gate.

- If SC-3 means the invitee genuinely reaches the app, then either `ProtectedRoute` must carve out
  `status === 'Active'` accounts, or `verifyAndPromote` must establish the family-member link.

Either way, replace the spy-on-`navigate` assertion with one that renders the real guard, so the
test measures the outcome rather than the intent:

```jsx
render(
  <MemoryRouter initialEntries={['/verify-email?token=active-token']}>
    <Routes>
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/pending" element={<div>Pending Sentinel</div>} />
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<div>Dashboard Sentinel</div>} />
      </Route>
    </Routes>
  </MemoryRouter>
);
expect(await screen.findByText('Dashboard Sentinel')).toBeInTheDocument();
```

## Warnings

### WR-01: `verifyEmail` mints and returns a real JWT for accounts the server has just decided may not authenticate

**File:** `backend/src/resolvers/user.resolver.js:341`

**Issue:** `return { token: signToken(user), user };` runs unconditionally, including on the paths
this phase newly exercises and tests: an invited registrant whose inviter is not a functioning
admin (stays `Pending`, `verifyEmail.test.js:357-388`), a `Rejected` account re-verifying
(`:290-319`), and a `Disabled` account re-verifying (`:322-351`). The signed token carries
`sub` and `role` and remains valid for `JWT_EXPIRES_IN`.

Today it is inert — `getUserFromRequest:33` refuses any non-`Active` status — so this is a latent
gap, not an active bypass. It matters because (a) a `Disabled`/`Rejected` user can mint one on
demand: `resendVerificationEmail` (`:343-370`) issues a fresh verification token for *any*
unverified account regardless of status, and (b) if the account is later activated (approved, or
re-enabled), the pre-issued token becomes usable without the holder ever re-authenticating —
`passwordChangedAt` is the only revocation lever and a status change does not touch it. The safety
of the whole design rests on one line in a different module.

**Fix:** Only issue a session when the account may actually hold one:

```js
await user.reload();
// ... audit ...
const authorized = user.status === 'Active';
return { token: authorized ? signToken(user) : null, user };
```

with `AuthPayload.token` relaxed to `String` in `user.schema.js` (the frontend already branches on
`payload.user.status !== 'Active'` at `AuthContext.jsx:78` and ignores the token in that case, so
no client change is needed). Add a test asserting a `Rejected` account's `verifyEmail` response
carries no token.

---

### WR-02: The deadlock retry recognizes only `ER_LOCK_DEADLOCK`; a lock-wait timeout leaks a raw MySQL error to an unauthenticated caller

**File:** `backend/src/resolvers/user.resolver.js:316-328`

**Issue:**

```js
const isDeadlock = (error) =>
  error?.original?.code === 'ER_LOCK_DEADLOCK' || error?.parent?.code === 'ER_LOCK_DEADLOCK';
```

`verifyAndPromote` now holds three separate lock acquisitions in one transaction — the
`individualHooks` token `UPDATE` (`:258`), the full-table `COUNT(*) ... FOR UPDATE` scan (`:264`),
and, new in 31-05, an X lock on the inviter row (`:297-300`). MySQL resolves *some* contention by
picking a deadlock victim (`ER_LOCK_DEADLOCK`, retried here) and some by timing out
(`ER_LOCK_WAIT_TIMEOUT`, **not** retried — `innodb_lock_wait_timeout` defaults to 50s). The added
inviter lock makes the timeout branch strictly more reachable than before 31-05.

On timeout, `verifyEmail` rethrows the raw Sequelize error to an **unauthenticated** caller
(`verifyEmail` needs no session), so the GraphQL response contains a MySQL error string — an
information leak, and a user-hostile failure on the phase's primary flow, where the transaction
rolled back cleanly and a retry would have succeeded.

**Fix:** Treat both as retryable, and normalize anything that still escapes:

```js
const RETRYABLE = new Set(['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']);
const isRetryable = (error) =>
  RETRYABLE.has(error?.original?.code) || RETRYABLE.has(error?.parent?.code);

try {
  await verifyAndPromote();
} catch (error) {
  if (!isRetryable(error)) throw error;
  promotedInvitation = null;
  try {
    await verifyAndPromote();
  } catch (retryError) {
    if (isRetryable(retryError)) {
      console.error('verifyEmail lock contention after retry:', retryError);
      throw new Error('Could not complete verification right now. Please try the link again.');
    }
    throw retryError;
  }
}
```

---

### WR-03: The comment justifying `isFunctioningAdmin` falsely claims parity with the two other "admin" definitions, and contradicts the helper's own doc comment

**File:** `backend/src/resolvers/user.resolver.js:293-296` (with `backend/src/utils/auth.js:53-64`)

**Issue:** The inline comment introduced by 31-05 states the inviter check closes the case of

> "(3) an invitation whose inviter's own email is no longer verified, **using the same
> functioning-admin definition (isFunctioningAdmin, utils/auth.js) as the admin-slot count and
> updateUser's last-administrator guard.**"

That is false in both directions:

- the admin-slot count (`:264-265`) filters on `role` and `emailVerified` only — **no `status`**;
- `updateUser`'s last-administrator guard (`:438-440`) filters on `role`, `emailVerified`, and
  `id != target.id` — **no `status`**;
- `isFunctioningAdmin` requires all three.

`auth.js:53-61` says the opposite, and correctly: the helper is *"Deliberately NOT applied to the
admin-slot raw SQL COUNT(*) ... or updateUser's last-administrator guard."* Two comments about the
same security predicate, in files that import each other, assert contradictory things. A reader
auditing "who counts as an admin here?" will take the `user.resolver.js` version at face value and
conclude the system has one definition when it has three — which is exactly the reasoning error
that leaves CR-01 open.

**Fix:** Correct the resolver comment to state the divergence rather than deny it:

```js
// (3) an invitation whose inviter's own email is no longer verified. NOTE: this is a
// STRICTER definition than the admin-slot COUNT(*) above and updateUser's
// last-administrator guard, neither of which filters on status -- see the divergence
// note on isFunctioningAdmin in utils/auth.js.
```

Better: converge all three (see CR-01's fix), and delete both comments.

---

### WR-04: A refused auto-promotion writes no audit record, so the security-relevant outcome is invisible

**File:** `backend/src/resolvers/user.resolver.js:301-312`

**Issue:** `writeAuditLog` fires only on the success branch (`:332-339`, `invitation.activated`).
When `isFunctioningAdmin(inviter)` returns `false` the promotion is silently skipped — no audit
row, no log line, nothing. The refusal cases are precisely the ones an operator needs to see: a
legacy invitation issued by a non-admin, an inviter demoted or disabled since issuing, an inviter
whose email is no longer verified, and (per CR-01's chain) an inviter who was de-verified by their
own email change.

The user-visible symptom is a registrant stuck at `Pending` with no explanation anywhere in the
system, in a queue nobody is notified about (WR-07).

**Fix:** Audit the refusal alongside the success:

```js
if (vouchedByAdmin) {
  const [activatedCount] = await models.User.update(
    { status: 'Active' },
    { where: { id: user.id, status: 'Pending' }, transaction: t }
  );
  if (activatedCount > 0) promotedInvitation = invitation;
} else {
  refusedInvitation = invitation;
  refusalReason = inviter
    ? { role: inviter.role, status: inviter.status, emailVerified: inviter.emailVerified }
    : { inviterMissing: true };
}
```

and after the transaction, mirror the existing fire-and-forget write with
`action: 'invitation.activation_refused'` and `metadata: refusalReason`.

---

### WR-05: An auto-activated invitee cannot be revoked — no mutation can move an `Active` account back out of `Active`

**File:** `backend/src/resolvers/user.resolver.js:306-312` (with `backend/src/resolvers/approval.resolver.js:10`, `backend/src/schemas/user.schema.js:26-30`)

**Issue:** Before this phase, every invited registrant passed through an admin decision, so an
admin who changed their mind simply rejected them. After this phase the decision is made
automatically at verification time, and there is **no way to undo it**:

- `approveUser` / `rejectUser` both begin with `assertDispositionable`, which throws
  `'This account is not awaiting a decision.'` for anything not `Pending` — an auto-activated
  account is `Active`, so both are unreachable.
- `UpdateUserInput` (`user.schema.js:26-30`) exposes `name`, `email`, `role` — **not `status`**.
  There is no `disableUser`/`setUserStatus` mutation anywhere in the schema.

So the only remedies for a mistaken invitation are `setUserPassword` (locks them out of *this*
password, but the account stays `Active` and can use password reset) or manual SQL. The phase
tightened who may *issue* an invitation while removing the ability to reverse its effect — the net
change to the admin's control over account lifecycle is negative.

**Fix:** Add an admin-only status mutation so the lifecycle is closed, e.g.

```graphql
setUserStatus(userId: ID!, status: AccountStatus!, reason: String): User!
```

guarded by `requireAdmin`, refusing to disable the last functioning administrator (same guard shape
as `updateUser:437-442`), stamping the User row and auditing it. Test that disabling an Active
account revokes its session (`getUserFromRequest` already refuses non-`Active`, so a test asserting
a subsequent `me` returns `null` is enough).

---

### WR-06: An auto-activated invitation keeps `status: 'Registered'` forever, so the admin invitation list permanently misreports the outcome

**File:** `backend/src/resolvers/user.resolver.js:302-305` (with `backend/src/resolvers/invitation.resolver.js:22-25`)

**Issue:** Per D-08 the promotion deliberately writes no `Invitation.status`. `pendingRegistrations`
compensates by filtering on the *User* row (`invitation.resolver.js:46-54`), so the approval queue
is correct. But `invitations` (`:22-25`) and `myInvitations` (`:17-20`) return the raw rows, and
`InvitePage` renders `status` verbatim. An admin looking at the invitation list therefore sees
`Registered` — "they signed up, awaiting a decision" — for an account that is fully `Active` and
using the app, permanently, with no other column on that view to correct the impression.

The manual path stamps `Approved` (`approval.resolver.js:45`), so the same list mixes two
vocabularies: `Approved` means active-via-admin, and `Registered` means either
active-via-auto-promotion **or** genuinely still waiting. The list is unreadable without knowing
which.

**Fix:** Either stamp a distinct terminal state in the promotion transaction —

```js
if (activatedCount > 0) {
  await models.Invitation.update(
    { status: 'Approved', approvedAt: new Date(), approvedBy: null },
    { where: { id: invitation.id }, transaction: t }
  );
  promotedInvitation = invitation;
}
```

(add an `AutoActivated` enum member if `Approved` with a null `approvedBy` is too lossy) — or, if
D-08 must hold, resolve `Invitation.status` for display from the registered user's status so the
list stops lying.

---

### WR-07: Dead `notifyAdminsOfPendingRegistration` and its unused mailer import survive the notification removal, and no notification replaces it

**File:** `backend/src/resolvers/user.resolver.js:20-40` and `:18`

**Issue:** The only call site was deleted from `register` in this phase. The 20-line function and
its `sendPendingRegistrationEmail` import at `:18` remain, with a comment
(`"the caller wraps this in .catch"`) describing a caller that no longer exists.
`sendPendingRegistrationEmail` in `services/mailer.js:109` is now unreachable from production code
and referenced only by `register.test.js`.

The behavioral half matters more than the dead code. Removing the notification is sound *if* every
invited registrant auto-activates — but they do not. Whenever `isFunctioningAdmin(inviter)` is
`false` (legacy invitation, demoted/disabled/de-verified inviter — the exact cases 31-05 was
written to catch), the registrant lands in `pendingRegistrations` and **no admin is told**. There
is no audit row either (WR-04) and the invitation list shows nothing unusual (WR-06). The manual
approval queue is now entirely silent and entirely dependent on an admin happening to open
`/invitations`.

**Fix:** Delete the dead function and the `sendPendingRegistrationEmail` import, then re-issue the
notification from the branch that actually needs it — the refusal branch identified in WR-04 —
rather than from `register`:

```js
if (!promotedInvitation && refusedInvitation) {
  notifyAdminsOfPendingRegistration(models, { invitation: refusedInvitation, user })
    .catch((err) => console.error('Failed to notify admins of pending registration:', err));
}
```

(keeping the function, moved into `verifyEmail`, is fine — leaving it unreferenced is not).

---

### WR-08: Negative assertions on fire-and-forget writes can pass while the regression they guard is live

**File:** `backend/src/resolvers/verifyEmail.test.js:387,427,452,523,565` and `backend/src/resolvers/register.test.js:72`

**Issue:** The `register.test.js` audit race was fixed by wrapping the read in `vi.waitFor`
(`register.test.js:78-83`). Six assertions of the same shape survive, in the opposite polarity:

```js
expect(await models.AuditLog.count({ where: { action: 'invitation.activated' } })).toBe(0);
```

`writeAuditLog` is deliberately not awaited (`user.resolver.js:333-338`), so the resolver returns
before the row is committed. If a regression re-enabled promotion on one of these paths, the audit
`INSERT` would very likely still be in flight when `count()` runs and the assertion would read `0`
and pass. These five are the phase's regression guards for the legacy-inviter, disabled-inviter,
no-invitation, TOCTOU, and `emailVerified`-gap cases — the exact assertions that must not be able to
false-pass. (Their sibling `status` assertions are sound; it is only the audit half that races.)

`register.test.js:72` has the identical defect:
`expect(sendPendingRegistrationEmail).not.toHaveBeenCalled();` guards against re-introducing
`notifyAdminsOfPendingRegistration`, whose mailer call sat behind an awaited
`models.User.findAll` (`user.resolver.js:24`) — i.e. asynchronous. Restore the call and this
assertion still runs first and still passes.

**Fix:** Give the fire-and-forget write a bounded window to *fail* to appear, rather than sampling
once:

```js
// writeAuditLog is fire-and-forget; sample repeatedly so a late INSERT cannot slip
// past a single early read.
await expect(
  vi.waitFor(
    async () => {
      expect(await models.AuditLog.count({ where: { action: 'invitation.activated' } })).toBe(1);
    },
    { timeout: 300 }
  )
).rejects.toThrow();
```

or, cleaner and deterministic: export a settled-promise handle from `writeAuditLog`'s call sites
(or a test-only `pendingAuditWrites` barrier) and `await` it before the negative assertion. For
`register.test.js:72`, assert after an equivalent barrier rather than immediately.

---

### WR-09: The `invitation.activated` audit write has no positive test anywhere

**File:** `backend/src/resolvers/user.resolver.js:332-339` (with `backend/src/resolvers/verifyEmail.test.js:252-286`)

**Issue:** Five tests assert this audit action is **absent**; none asserts it is ever **present**.
The SC-3 happy-path test (`:252-286`) checks `status`, `emailVerified`, and `Invitation.status`, and
stops. So the new audit block — its action string, `invitationId`, `targetUserId`, and the
`promotedInvitation = null` reset on the deadlock-retry path (`:326`) — is entirely unexercised. A
typo in `'invitation.activated'` would make all five negative assertions pass *more* reliably and
leave the audit trail empty in production, with nothing red.

Combined with WR-08, the auto-activation audit trail is effectively untested in both directions.

**Fix:** Extend the SC-3 test:

```js
await vi.waitFor(async () => {
  const audits = await models.AuditLog.findAll({ where: { action: 'invitation.activated' } });
  expect(audits).toHaveLength(1);
  expect(audits[0]).toMatchObject({
    invitationId: invitation.id,
    targetUserId: user.id,
    actorUserId: user.id
  });
});
```

---

### WR-10: The phase's two frontend authorization changes have no test at all

**File:** `frontend/src/App.jsx:34-41` and `frontend/src/components/AppLayout.jsx:73-81`

**Issue:** Moving `invitations`/`invite`/`approvals` under `<ProtectedRoute allowedRoles={['ADMIN']} />`
and wrapping the Invitations nav button in `{user.role === 'ADMIN' && ...}` are the entire
client-side half of D-01/D-03. Neither has a test:

- there is no `App.test.jsx` — nothing asserts which guard group any route belongs to;
- there is no `AppLayout.test.jsx` — nothing asserts the nav gate.

`31-03-PLAN.md:92` names `ProtectedRoute.test.jsx` as the verification, but that file tests
`ProtectedRoute` in isolation against a synthetic `/admin` route. It cannot observe `App.jsx` at
all. Moving the three routes back into the unrestricted group would leave the entire frontend suite
green. Given this project's documented history of authorization gaps surviving green tests, the
guard that is *not* mutation-resistant is the one that regresses.

**Fix:** Add `frontend/src/App.test.jsx` rendering the real route tree with a mocked `useAuth`:

```jsx
it.each(['/invitations', '/invite', '/approvals'])(
  'redirects a non-admin away from %s',
  async (path) => {
    useAuthMock.mockReturnValue({ loading: false, user: { id: 1, role: 'USER', familyMemberId: 5 } });
    render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.queryByText('Invite a family member')).not.toBeInTheDocument();
  }
);
```

plus an `AppLayout.test.jsx` asserting the Invitations button is absent for `role: 'USER'` and
present for `role: 'ADMIN'`.

---

### WR-11: A failed `pendingRegistrations` load leaves the page spinning forever next to the error message

**File:** `frontend/src/pages/ApprovalsPage.jsx:65-69` and `:115-118`

**Issue:**

```js
const load = useCallback(() => {
  return graphqlRequest(PENDING_QUERY)
    .then((data) => setRows(data.pendingRegistrations))
    .catch((err) => setError(err.message));
}, []);
```

The catch sets `error` but never touches `rows`, which stays `null`. `:115` renders on exactly that
sentinel:

```jsx
{rows === null ? (<CircularProgress />) : rows.length === 0 ? ... }
```

So a failed initial load renders an error `Alert` **and** an indefinite spinner below it,
suggesting a retry is in progress when none is. There is no retry affordance either. This is
reachable in normal operation — the query is admin-only, so any session expiry mid-page produces
`'Admin access is required.'` and the permanently-spinning state.

**Fix:** Terminate the loading sentinel on failure:

```js
.catch((err) => {
  setError(err.message);
  setRows([]);   // stop the spinner; the Alert carries the outcome
});
```

or track `loading` separately from `rows` and render a "Try again" button wired to `load`.

---

### WR-12: `InvitationsPage.test.jsx` asserts a non-admin sees the invite form — the exact state D-01/D-03 now forbid

**File:** `frontend/src/pages/InvitationsPage.test.jsx:26-33` (with `frontend/src/pages/InvitationsPage.jsx:7-10,17-18`)

**Issue:** The phase moved `/invitations` under the ADMIN guard and made `createInvitation` and
`myInvitations` throw `'Admin access is required.'`. `InvitationsPage` was not updated:

- its header comment (`:7-8`) still reads *"anyone can invite a family member (top), and admins
  additionally review pending registrations (bottom)"* — the design D-01 replaced;
- `<InvitePage />` at `:17` still renders unconditionally, gated only by the outer route;
- its test at `:26-33` explicitly asserts *"shows the invite section but NOT approvals for a
  non-admin"*, rendering the component with `role: 'USER'` and requiring "Invite a family member" to
  be present.

That test now pins behavior the phase set out to eliminate. It also masks a live bug: if a
non-admin ever reaches this component, `InvitePage` fires `myInvitations`, which throws
`'Admin access is required.'`, and the page renders an authorization error to a user who was never
supposed to see the surface. The `isAdmin` branch at `:18` is now dead — the route guard already
guarantees `ADMIN`.

**Fix:** Update the test to assert the post-D-01 contract (a non-admin renders neither section, or
the case is deleted as unreachable and replaced by the `App.test.jsx` redirect test in WR-10),
delete the now-dead `isAdmin` branch, and correct the header comment to say the page is
admin-only.

---

### WR-13: `createInvitation` surfaces a raw Sequelize validation error for a malformed address, leaking the column and validator name

**File:** `backend/src/resolvers/invitation.resolver.js:63-79`

**Issue:** The resolver validates only *blankness*:

```js
const invitedEmail = blankToNull(input.invitedEmail);
if (!invitedEmail) throw new Error('An invitation needs an email address.');
```

Anything non-blank goes straight into `models.Invitation.create`, where
`invitedEmail: { validate: { isEmail: true } }` (`models/Invitation.js:15`) throws a
`SequelizeValidationError` whose message is `"Validation isEmail on invitedEmail failed"`. Apollo
returns that verbatim. Two problems: it leaks the internal column name and validator identity to
the client, and it is unusable as user-facing copy — inconsistent with the deliberate, friendly
message one line above and with `linkUserToMember`/`updateUser`, which both catch
`UniqueConstraintError` and re-throw a clean message (`user.resolver.js:411-416`, `:471-476`).

**Fix:** Match the existing translation pattern:

```js
try {
  invitation = await models.Invitation.create({ /* ... */ });
} catch (error) {
  if (error instanceof ValidationError) {
    throw new Error('That does not look like a valid email address.');
  }
  throw error;
}
```

(importing `ValidationError` from `sequelize`, as `UniqueConstraintError` already is elsewhere), and
add a test for `createInvitation({ invitedEmail: 'not-an-email' })`.

---

### WR-14: The lock-contention test asserts a 25 ms wall-clock tolerance, making the phase's concurrency proof timing-dependent

**File:** `backend/src/resolvers/verifyEmail.test.js:151-153` (and the `wait(300)` / `SLEEP(0.3)` windows at `:137`, `:203`, `:502`)

**Issue:**

```js
expect(mutationResolvedAt).toBeGreaterThanOrEqual(rawCommittedAt - 25);
```

Both timestamps are `Date.now()` readings taken from separate promises on one event loop. Under CI
load, GC, or a busy MySQL, the verifier's `mutationResolvedAt` assignment can be scheduled well
after its actual resolution while `rawCommittedAt` is recorded promptly (or vice versa), and 25 ms
is not much headroom. The three fixed 300 ms sleeps have the same character: they assume both
verifiers have reached their admin-count read within 300 ms.

This project already carries a documented backend flake (`resetTables` under load), so a
wall-clock-tolerance assertion on the phase's central concurrency proof is a poor trade — a red run
here will be read as "flaky test", which is precisely how a real serialization regression gets
waved through.

**Fix:** Assert the causal fact rather than the clock. Order the two completions explicitly:

```js
const order = [];
await Promise.all([
  (async () => { response = await graphql(...); order.push('mutation'); })(),
  (async () => { await conn.query('SELECT SLEEP(0.3)'); await conn.commit(); order.push('rawCommit'); })()
]);
expect(order).toEqual(['rawCommit', 'mutation']);
```

which is exactly the property the test is named for ("serializes ... behind a held lock") and has no
tolerance to tune. If a wall-clock check is kept as a secondary signal, widen the tolerance and
document why the number was chosen.

## Info

### IN-01: Unused `Divider` import

**File:** `frontend/src/pages/ApprovalsPage.jsx:11`
**Issue:** `Divider` is imported from `@mui/material` and never rendered — the divider between the
invite and approvals sections lives in `InvitationsPage.jsx:20`.
**Fix:** Remove `Divider,` from the import list.

---

### IN-02: `blocked` is a pure alias of `orphaned` left behind by the D-10 cleanup

**File:** `frontend/src/pages/ApprovalsPage.jsx:131-133`
**Issue:** After the `unverified` branch was removed, `const blocked = orphaned;` and the ternary
`orphaned ? '...' : ''` are a two-name indirection for one condition, with the local no longer
carrying any meaning the source variable lacks.
**Fix:** Drop `blocked` and use `orphaned` at both `disabled={...}` sites, or restore `blocked` as a
genuine union if another block reason is expected.

---

### IN-03: Stale comment describing removed code, and a dead fixture field, in `ApprovalsPage.test.jsx`

**File:** `frontend/src/pages/ApprovalsPage.test.jsx:95-99` and `:20`
**Issue:** The comment inside the orphaned-row test still explains the old `unverified` guard:
*"`row.registeredUser && !row.registeredUser.emailVerified` short-circuits to null ... fixed for
emailVerified but not for the other nullable case."* No such expression exists any more — the whole
`emailVerified` branch was deleted from `ApprovalsPage.jsx` in this phase. Relatedly, `ROW` at `:20`
still carries `emailVerified: true`, a field `PENDING_QUERY` no longer selects.
**Fix:** Rewrite the comment to state the surviving invariant ("`registeredUser` is nullable because
`fk_invitations_registered_user` is `ON DELETE SET NULL`, so both actions must be disabled") and drop
`emailVerified` from the fixture.

---

### IN-04: Duplicated `user.role === 'ADMIN'` conditional in the nav

**File:** `frontend/src/components/AppLayout.jsx:73-81` and `:82-90`
**Issue:** Two consecutive, identical `{user.role === 'ADMIN' && (...)}` wrappers around the
Invitations and Link-accounts buttons. Faithful to the existing pattern, but the next admin nav item
adds a third copy, and each is an independent place to get the check wrong.
**Fix:** Wrap both in one `{user.role === 'ADMIN' && (<>...</>)}` fragment, or drive the nav from a
`[{ to, label, adminOnly }]` array.

---

### IN-05: `pendingRegistrations` matches ids through `Set.has` with no coercion, unlike sibling code

**File:** `backend/src/resolvers/invitation.resolver.js:50-54`
**Issue:** `eligibleIds.has(invitation.registeredUserId)` is an identity comparison. It is correct
today — both `User.id` and `Invitation.registeredUserId` are `INTEGER.UNSIGNED`, so Sequelize yields
JS numbers on both sides — but the same file coerces defensively three lines away
(`Number(invitation.inviterId) === Number(user?.id)` at `:108`, `loaders.userById.load(Number(...))`
at `:117`). If the ids ever widen to `BIGINT`, Sequelize returns strings and this filter silently
empties the entire approval queue with no error.
**Fix:** `const eligibleIds = new Set(eligibleUsers.map((u) => Number(u.id)));` and
`eligibleIds.has(Number(invitation.registeredUserId))`, matching the file's own convention.

---

### IN-06: Raw SQL hardcodes the `users` table name, bypassing the model's `tableName`

**File:** `backend/src/resolvers/user.resolver.js:265`
**Issue:** `"SELECT COUNT(*) ... FROM users ..."` is the only place in the backend that names a
table literally; every other query goes through a model. A `tableName` change would leave this
string pointing at a table that no longer exists, and the failure appears only at runtime inside a
transaction on the verification path.
**Fix:** Interpolate from the model: ``const usersTable = models.User.getTableName();`` and build the
statement from it (the value is code-controlled, not user input, so no injection surface is added).

---

### IN-07: The `invitation.activated` audit records the promoted user as the actor of a decision they did not make

**File:** `backend/src/resolvers/user.resolver.js:334-337`
**Issue:** `actorUserId: user.id, targetUserId: user.id` reads as "this user activated themselves".
The actor is the system, acting on the inviting admin's earlier vouch; the audit trail loses the one
fact that makes the event reviewable — *which* admin's standing authorized it.
**Fix:** Record the vouching admin: `actorUserId: invitation.inviterId` (or keep `actorUserId: null`
for a system action) and put the inviter's id and evaluated standing in `metadata`.

---

### IN-08: A test fixture locks in a `verifyEmail` payload the schema cannot produce

**File:** `frontend/src/pages/VerifyEmail.test.jsx:39-44`
**Issue:** The first test's mocked user is `{ id, name, email, role }` — no `status`, no
`familyMemberId`. `User.status` is `AccountStatus!` (non-nullable) and `VERIFY_EMAIL_MUTATION`
selects both (`AuthContext.jsx:26`), so the server can never return this shape. The test passes only
because `VerifyEmail.jsx:25`'s `user.status &&` guard treats `undefined` as "route to /dashboard",
which means it is asserting the fallback rather than any real response — and it obscures the guard
interaction in CR-02.
**Fix:** Add `status: 'Active', familyMemberId: null` to the fixture so it matches a response the
API can actually return.

---

### IN-09: `isFunctioningAdmin` uses strict `emailVerified === true`

**File:** `backend/src/utils/auth.js:63`
**Issue:** `user.emailVerified === true` is correct for a Sequelize model instance (MySQL
`TINYINT(1)` is mapped to a real boolean), and the strictness is a reasonable choice for a security
predicate. But the helper's own doc comment invites future callers, and a caller passing a row from
`sequelize.query` — which yields `1`/`0` — would get `false` for a genuine admin, failing closed but
silently. The unit tests (`auth.test.js:204-224`) only ever pass real booleans, so this would not be
caught.
**Fix:** Either document the constraint in the doc comment ("expects a Sequelize model instance;
raw-query rows yield 1/0 and will not match") or accept both with `Boolean(user.emailVerified)`, and
add a `{ emailVerified: 1 }` case to the unit tests pinning whichever is chosen.

---

_Reviewed: 2026-08-30T09:40:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
