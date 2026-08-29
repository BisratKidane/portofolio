---
phase: 31-invitations-become-admin-only
reviewed: 2026-08-29T13:55:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - backend/src/resolvers/invitation.resolver.js
  - backend/src/resolvers/user.resolver.js
  - backend/src/resolvers/approveReject.test.js
  - backend/src/resolvers/createInvitation.test.js
  - backend/src/resolvers/register.test.js
  - backend/src/resolvers/verifyEmail.test.js
  - frontend/src/App.jsx
  - frontend/src/components/AppLayout.jsx
  - frontend/src/pages/ApprovalsPage.jsx
  - frontend/src/pages/ApprovalsPage.test.jsx
  - frontend/src/pages/VerifyEmail.test.jsx
findings:
  critical: 2
  warning: 8
  info: 8
  total: 18
status: issues_found
---

# Phase 31: Code Review Report

**Reviewed:** 2026-08-29T13:55:00Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

The three guards the phase set out to install (`requireAdmin` on `createInvitation`,
`myInvitations`, and the already-admin-only `invitations` / `pendingRegistrations`) are
genuinely enforced server-side, and each has a negative test with an adversarial actor
(linked, Active, non-admin). Those are correct and mutation-resistant. I re-ran the changed
backend suites (`createInvitation`, `approveReject`, `register`, `verifyEmail`: 45 passed,
1 skipped on local MariaDB) and the changed frontend suites (10 passed) to verify the
claimed state rather than trusting the summaries.

The defects are in the two places the phase *inferred* rather than *enforced* a property:

1. **Auto-activation trusts the existence of an invitation row as proof that an admin
   vouched.** It never consults the inviter's role. Non-admin-issued `Pending` invitation
   rows created under Phase 30 are still live in the database (nothing expires them, and
   `invitation.resolver.js:14-16` explicitly acknowledges they exist), so redeeming one now
   produces an account that skips admin approval entirely — the exact approval bypass this
   phase's premise is supposed to justify only for admin-issued invitations.
2. **The `if (invitation)` guard that separates "invited" from "any Pending account" has no
   test.** Deleting it — so that *every* Pending account self-promotes to Active on email
   verification — leaves the entire suite green. Given this project's recorded history of
   authorization gaps surviving green tests (Phases 14, 15, 30), an untested guard on the
   verification-to-Active path is not acceptable evidence.

Secondary theme: the client-side half of SC-2 ("a non-admin no longer sees the invite form
or a nav entry") rests entirely on two untested files, and a *pre-existing, still-green*
test (`InvitationsPage.test.jsx:26-33`) asserts the opposite of what the phase requires.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Auto-activation is keyed on an invitation row's existence, never on the inviter being an admin — legacy non-admin invitations now bypass approval

**File:** `backend/src/resolvers/user.resolver.js:275-289` (with `register` at `:113-173`, guard swap at `backend/src/resolvers/invitation.resolver.js:58-61`)

**Issue:**
The phase swapped `requireFamilyAccess` → `requireAdmin` on `createInvitation`, which only
affects invitations created *from now on*. Nothing invalidates the invitations already in
the table. Trace the full path for a `Pending` invitation created by a linked non-admin
member under Phase 30 (which explicitly permitted this — ROADMAP Phase 30 SC-4 even says
"including ones sent by non-admin members"):

- `register` (`user.resolver.js:116-125`) validates only `tokenHash`, `expiresAt`, and
  `status`. The inviter's role is never read.
- `verifyEmail` (`user.resolver.js:275-289`) looks up the invitation by
  `where: { registeredUserId: user.id }` alone and, if any row exists, flips the account
  `Pending → Active` with no admin action.

The comment on line 271-274 states the premise as fact — *"the admin who sent the invitation
already vouched for this person at invite time"* — but for these rows no admin ever vouched.
Before this phase, `approveUser` was the backstop that caught them; the phase removed the
backstop without removing the rows.

Confirmed exposure:
- `git diff a9e9b53..HEAD -- backend/migrations/` is empty — no migration expires or
  re-scopes legacy invitations.
- `INVITE_EXPIRES_DAYS` defaults to 7 (`backend/src/config/env.js:29`), so the window is at
  least a week after deploy, longer if the env var is raised.
- The same file already knows legacy rows are a live concern:
  `invitation.resolver.js:14-16` justifies the `myInvitations` change with *"a non-admin's
  list could only ever return legacy rows"*. The consequence was reasoned about in one
  resolver and missed in the other.

This is not only a migration problem. It is also permanently true going forward: an admin
demoted to `USER` via `updateUser` (`user.resolver.js:411-420`), or one set to
`Disabled`/`Rejected`, leaves behind outstanding invitations that still auto-activate,
because the role is only ever checked at *issue* time and never re-checked at *redemption*
time.

**Fix:** Re-check the vouching admin at promotion time, and invalidate the legacy rows.

```js
// backend/src/resolvers/user.resolver.js — inside verifyAndPromote(), replacing lines 275-289
const invitation = await models.Invitation.findOne({
  where: { registeredUserId: user.id },
  transaction: t
});
if (invitation) {
  // The premise of auto-activation is that an ADMIN vouched. Verify that premise
  // instead of assuming it: a row created by a non-admin (pre-Phase-31), or by
  // someone since demoted/disabled, is not a vouch and must go through approval.
  const inviter = await models.User.findByPk(invitation.inviterId, { transaction: t });
  const vouchedByAdmin = inviter?.role === 'ADMIN' && inviter.status === 'Active';
  if (vouchedByAdmin) {
    const [activatedCount] = await models.User.update(
      { status: 'Active' },
      { where: { id: user.id, status: 'Pending' }, transaction: t }
    );
    if (activatedCount > 0) promotedInvitation = invitation;
  }
}
```

Plus a migration that closes the existing window (and keeps `pendingRegistrations` able to
surface anything that slipped through):

```sql
-- backend/migrations/manual/0XX-expire-non-admin-invitations.sql
UPDATE invitations i
  JOIN users u ON u.id = i.inviterId
   SET i.status = 'Expired'
 WHERE i.status = 'Pending'
   AND u.role <> 'ADMIN';
```

Add a test asserting a `Pending` registrant whose invitation was issued by a `USER` stays
`Pending` after `verifyEmail`.

---

### CR-02: The only guard preventing "verify your email" from becoming "become Active" is untested — deleting it keeps the whole suite green

**File:** `backend/src/resolvers/verifyEmail.test.js:1-352` (guard under test: `backend/src/resolvers/user.resolver.js:275-289`)

**Issue:**
`verifyEmail` is an **unauthenticated** mutation that now performs a privilege change
(`status: 'Pending' → 'Active'`). The single thing separating "invited registrant" from
"any Pending account in the system" is the truthiness of the `models.Invitation.findOne(...)`
result on line 275. There is no test for the negative case.

Evidence (grep + suite run, not inference):
- The only `status: 'Pending'` fixture in the file is at line 255, and it is paired with an
  `Invitation.create` at line 262 (`SC-3`). The other two `Invitation.create` calls (lines
  300, 332) belong to the `Rejected`/`Disabled` D-06 tests.
- Every other verifier in the file is created by `createTestUser` with its default
  `status: 'Active'` (`backend/test/helpers.js:54`), so their promotion path is a no-op
  regardless of the guard.
- Result: replacing lines 279-289 with an unconditional
  `await models.User.update({ status: 'Active' }, { where: { id: user.id, status: 'Pending' }, transaction: t })`
  — i.e. deleting the "was this person actually invited?" check entirely — passes
  `verifyEmail.test.js`, `register.test.js`, `approveReject.test.js` and
  `createInvitation.test.js` unchanged. I ran those four files: 45 passed, 1 skipped.

This is the same failure shape the project has already shipped three times (recorded for
Phases 14, 15, 30): the guard exists, the happy path is green, and the adversarial path is
never exercised. It is also precisely the escalation vector named in this phase's own
review brief. Phase 30's `approveReject.test.js:104-129` and `:220-245` establish that
`Pending`, verified accounts *with no invitation row* are a real, supported state
("Phase 32 precursor"), so the negative case is reachable today, not hypothetical.

**Fix:** Add the missing negative test alongside the SC-3 test.

```js
// backend/src/resolvers/verifyEmail.test.js
// The auto-activation guard is the only barrier between an unauthenticated
// verifyEmail call and an Active account. A Pending account with NO invitation
// row must verify successfully and stay Pending -- it still needs a decision.
it('does not activate a Pending account that was never invited (no invitation row)', async () => {
  const user = await createTestUser({
    email: 'never-invited@example.com',
    status: 'Pending',
    emailVerified: false,
    role: 'USER',
    emailVerificationToken: hashVerificationToken('never-invited-token'),
    emailVerificationExpiresAt: new Date(Date.now() + 60 * 60 * 1000)
  });

  const response = await graphql(VERIFY_EMAIL_MUTATION, { token: 'never-invited-token' });

  expect(response.errors).toBeUndefined();
  expect(response.data.verifyEmail.user.status).toBe('Pending');

  await user.reload();
  expect(user.emailVerified).toBe(true);
  expect(user.status).toBe('Pending');
  expect(await models.AuditLog.count({ where: { action: 'invitation.activated' } })).toBe(0);
});
```

Add the CR-01 companion (invitation issued by a non-admin ⇒ stays `Pending`) in the same
block so both halves of the "an admin vouched" premise are pinned.

---

## Warnings

### WR-01: A green test asserts the exact behavior SC-2 forbids, and the client-side half of SC-2 has no test at all

**File:** `frontend/src/pages/InvitationsPage.test.jsx:26-33`, `frontend/src/App.jsx:34-41`, `frontend/src/components/AppLayout.jsx:73-81`

**Issue:**
SC-2 is *"A non-admin no longer sees the invite form or a nav entry offering it."* The phase
implemented this purely by moving the route (`App.jsx:37`) and adding a nav conditional
(`AppLayout.jsx:73`). Neither file has a test — there is no `App.test.jsx` and no
`AppLayout.test.jsx` anywhere in `frontend/src`. Both changes could be reverted and the
suite would stay green.

Worse, the untouched `InvitationsPage.test.jsx:26-33` still asserts the *pre-phase* contract:

```js
it('shows the invite section but NOT approvals for a non-admin', async () => {
  useAuthMock.mockReturnValue({ user: { id: 1, role: 'USER' } });
  render(<InvitationsPage />);
  expect(await screen.findByText('Invite a family member')).toBeInTheDocument();
```

I ran it: it passes. `InvitationsPage.jsx` still renders `<InvitePage />` unconditionally,
so the component genuinely does show the invite form to a non-admin — only the router
prevents it being reached. The suite therefore actively documents the opposite of SC-2.
Two consequential leftovers in the same file: the header comment
(`InvitationsPage.jsx:7-8`, *"anyone can invite a family member (top)"*) is now false, and
the `isAdmin` conditional (`:13`, `:18`) is dead because the whole page is behind
`allowedRoles={['ADMIN']}`.

**Fix:** Make the component enforce what the route enforces, then correct the test.

```jsx
// frontend/src/pages/InvitationsPage.jsx — the page is admin-only (D-01); do not
// rely on the router alone, mirroring how the resolvers guard themselves.
export default function InvitationsPage() {
  const { user } = useAuth();
  if (user?.role !== 'ADMIN') return <Navigate to="/dashboard" replace />;
  return (
    <Stack spacing={6} sx={{ maxWidth: 820, mx: 'auto' }}>
      <InvitePage />
      <Divider sx={{ borderColor: colors.line }} />
      <ApprovalsPage />
    </Stack>
  );
}
```

Then flip `InvitationsPage.test.jsx:26-33` to assert a non-admin sees *neither* section, and
add an `AppLayout.test.jsx` case asserting the `Invitations` nav button is absent for
`role: 'USER'` and present for `role: 'ADMIN'`.

---

### WR-02: `pendingRegistrations` matches ids against a `Set` with no numeric coercion, unlike every other id comparison in the same file

**File:** `backend/src/resolvers/invitation.resolver.js:50,53`

**Issue:**
```js
const eligibleIds = new Set(eligibleUsers.map((eligibleUser) => eligibleUser.id));
return registered.filter(
  (invitation) => invitation.registeredUserId == null || eligibleIds.has(invitation.registeredUserId)
);
```
`Set.has` is `SameValueZero` — `new Set([9]).has('9')` is `false`. Twelve lines below, the
same file defends against exactly this on every other id comparison
(`:108-109` `Number(invitation.inviterId) === Number(user?.id)`, `:117`
`loaders.userById.load(Number(invitation.registeredUserId))`). The new code is the only
place that skips it.

It happens to work today because both columns are `INTEGER UNSIGNED` and `mysql2` returns
JS numbers. The failure mode if that ever changes (a `BIGINT` widening, `supportBigNumbers`,
a driver swap, a raw-query refactor) is silent and severe: **every** row is filtered out and
the approval queue renders permanently empty with no error — the precise "accidentally hides
an account that still needs admin judgement" outcome this phase was told to guard against.
Nothing detects it, because the only multi-row assertion in `approveReject.test.js` is a
single-row `toHaveLength(1)`.

**Fix:**
```js
const eligibleIds = new Set(eligibleUsers.map((eligibleUser) => Number(eligibleUser.id)));
return registered.filter(
  (invitation) =>
    invitation.registeredUserId == null || eligibleIds.has(Number(invitation.registeredUserId))
);
```

---

### WR-03: `rejectUser` is now unreachable for every invited registrant — a mis-sent invitation cannot be undone through any API path

**File:** `backend/src/resolvers/invitation.resolver.js:46-48`, `backend/src/resolvers/approval.resolver.js:9-12`, `backend/src/resolvers/user.resolver.js:284-288`

**Issue:**
Trace an invited registrant end to end after this phase:

| Stage | `pendingRegistrations` | `approveUser` / `rejectUser` |
|---|---|---|
| Registered, not yet verified | **hidden** — new `emailVerified: true` filter (`invitation.resolver.js:47`) | refused: `'This account has not verified its email address yet.'` (`approval.resolver.js:11`) |
| Verified | **hidden** — new `status: 'Pending'` filter; the account is already `Active` | refused: `'This account is not awaiting a decision.'` (`approval.resolver.js:10`) |

There is no third stage. Combined with the fact that the schema exposes no
`revokeInvitation` and no `disableUser`, and `UpdateUserInput`
(`backend/src/schemas/user.schema.js:26-30`) has no `status` field, **an admin who sends an
invitation to the wrong address has no mechanism to stop the resulting account.** The
narrowing filter and the auto-activation are individually defensible; together they remove
the last remaining lever.

Severity is bounded (not Critical) because an `Active` but unlinked account gets almost
nothing: `dashboard` and all ten `familyMember` resolvers call `requireFamilyAccess`, which
throws without a `familyMemberId`, and `linkUserToMember` is admin-only. The account can log
in and edit itself, and it appears in `unlinkedUsers`. So this is a loss of administrative
control, not immediate data exposure — but it is permanent and silent.

**Fix (minimum):** add an admin-only escape hatch so the state is recoverable, e.g. a
`setUserStatus(userId: ID!, status: AccountStatus!)` mutation guarded by `requireAdmin` and
by the existing "never below one verified admin" rule (`user.resolver.js:411-418`), or a
`revokeInvitation(id: ID!)` that flips a `Pending` invitation to `Expired` before it is
redeemed. Either closes the loop; today neither exists.

---

### WR-04: Dead function and now-unused import left behind by the notification removal

**File:** `backend/src/resolvers/user.resolver.js:17,19-39`

**Issue:** `notifyAdminsOfPendingRegistration` (lines 22-39, 18 lines including a DB query
and a `Promise.all` fan-out) is no longer called anywhere — the only call site was deleted
from `register`. Verified by grep across `backend/src` and `backend/test`: the sole remaining
references are its own definition and the negative assertion in
`register.test.js:72`. Its import `sendPendingRegistrationEmail` (line 17) is therefore also
dead. Leaving a plausible-looking notifier in place invites a future contributor to wire it
back in without knowing D-11 deliberately removed it.

**Fix:** Delete lines 19-39 and drop `sendPendingRegistrationEmail` from the line-17 import.
Keep `register.test.js`'s `not.toHaveBeenCalled()` assertion (the mock factory can retain
the export) so re-adding the call fails loudly.

---

### WR-05: A second deadlock in `verifyEmail` propagates a raw MySQL error to the client; the backend has no error masking anywhere

**File:** `backend/src/resolvers/user.resolver.js:295-304`

**Issue:**
```js
if (!isDeadlock(error)) throw error;
promotedInvitation = null;
await verifyAndPromote();   // <- unguarded; a second deadlock escapes verbatim
```
The retry is correct in intent, but the second attempt is not wrapped. Grep confirms there
is no `formatError` and no `unwrapResolverError` anywhere in `backend/src`, so a
`SequelizeDatabaseError` reaches the unauthenticated caller with its driver message
(`"Deadlock found when trying to get lock; try restarting transaction"`) and SQL context.
This mutation is reachable without authentication, so the leak is public. The user-visible
result is also poor: a database-internals string instead of an actionable "please try that
link again".

**Fix:**
```js
try {
  await verifyAndPromote();
} catch (error) {
  if (!isDeadlock(error)) throw error;
  promotedInvitation = null;
  try {
    await verifyAndPromote();
  } catch (retryError) {
    if (!isDeadlock(retryError)) throw retryError;
    console.error('verifyEmail deadlocked twice:', retryError);
    throw new Error('Something went wrong verifying your email. Please try the link again.');
  }
}
```
Separately, add an Apollo `formatError` that maps non-`GraphQLError` throwables to a generic
message — this class of leak will recur in every resolver otherwise.

---

### WR-06: A failed `pendingRegistrations` load leaves the page spinning forever alongside the error

**File:** `frontend/src/pages/ApprovalsPage.jsx:65-73,115-118`

**Issue:** `load()`'s `.catch` sets `error` but never touches `rows`, which stays `null`.
`rows === null` is the loading branch, so the admin sees an error `Alert` *and* an infinite
`CircularProgress`, with no retry affordance and no empty state. Because `ApprovalsPage` is
now composed into `InvitationsPage` above the invite form, a transient failure of this one
query degrades the whole admin invitations screen. (Pre-existing, but this phase made the
query more likely to be the page's only content and left it unaddressed.)

**Fix:**
```js
const load = useCallback(() => {
  return graphqlRequest(PENDING_QUERY)
    .then((data) => { setError(''); setRows(data.pendingRegistrations); })
    .catch((err) => { setError(err.message); setRows([]); });  // exit the loading state
}, []);
```
and render a "Retry" `Button` next to the `Alert` that calls `load()`.

---

### WR-07: `submitReject` dereferences `rejectTarget` after nulling it, so a double-click during the dialog exit transition throws silently

**File:** `frontend/src/pages/ApprovalsPage.jsx:88-102`

**Issue:**
```js
const submitReject = async () => {
  const row = rejectTarget;   // null on the second invocation
  setError('');
  setBusyId(row.id);          // TypeError: Cannot read properties of null
  setRejectTarget(null);
```
MUI's `Dialog` keeps its children mounted through the closing transition, so the confirm
button stays clickable after the first click sets `rejectTarget` to `null`. Because
`submitReject` is `async` and `onClick` discards the returned promise, the `TypeError`
becomes an unhandled rejection: no alert, no console-visible failure for the admin, the
second reject silently never fires, and `busyId` is left set (both action buttons on that
row stay disabled until the next successful reload). Note the guard cannot be
`disabled={busyId === row.id}` here because the dialog's button is outside the row map.

**Fix:**
```js
const submitReject = async () => {
  const row = rejectTarget;
  if (!row) return;              // the dialog is already closing; nothing to submit
  ...
```

---

### WR-08: An auto-activated invitation stays `Registered` forever, so the admin invitation list permanently misreports the outcome

**File:** `backend/src/resolvers/user.resolver.js:280-283`

**Issue:** D-08 deliberately forbids writing `Invitation.status` during auto-activation, and
`approveReject.test.js` / `verifyEmail.test.js:285` pin that. The consequence, which the
phase did not address anywhere, is that the *only* admin-facing surface for invitation
outcomes — `InvitePage.jsx`'s `STATUS_COLOR` chip (`:36-42`) fed by `myInvitations` — now
shows `Registered` (blue "in progress") for people who are fully `Active` and signing in.
`Approved` becomes an unreachable status for the entire new flow. An admin auditing who
actually got in cannot distinguish "registered, then activated and using the app" from
"registered and stalled, never verified", which is exactly the distinction `pendingRegistrations`
was narrowed to encode. The `invitation.activated` audit row (`user.resolver.js:309-314`)
captures the truth but is not surfaced in any UI.

**Fix:** If D-08 must hold on the `status` enum, add a distinct terminal signal rather than
leaving the admin view ambiguous — e.g. stamp `Invitation.approvedAt` (leaving `approvedBy`
null to mark "activated by verification, not by a person") inside the same transaction, and
render that in `InvitePage`'s chip:

```js
const chipLabel = invitation.status === 'Registered' && invitation.approvedAt
  ? 'Active'
  : invitation.status;
```

---

## Info

### IN-01: Unreachable null guard on a NOT NULL column

**File:** `backend/src/resolvers/invitation.resolver.js:107`
**Issue:** `if (invitation.inviterId == null) return null;` can never fire — `inviterId` is
declared `allowNull: false` (`backend/src/models/index.js:72`) and the FK is
`ON DELETE CASCADE` (`backend/migrations/manual/016-create-invitations.sql:30`), so the
invitation row is deleted with its inviter rather than orphaned. Contrast
`registeredUserId`, which is `ON DELETE SET NULL` and genuinely needs its guard.
**Fix:** Remove the branch, or add a comment explaining it is belt-and-braces so the next
reader doesn't infer that orphaned inviters are a real state.

### IN-02: The non-admin branch of the `Invitation.inviter` field resolver is now dead

**File:** `backend/src/resolvers/invitation.resolver.js:108-111`
**Issue:** `Number(invitation.inviterId) === Number(user?.id)` was the "or the inviter
themselves" carve-out for non-admin callers. All three queries that can produce an
`Invitation` (`myInvitations:18`, `invitations:23`, `pendingRegistrations:35`) now call
`requireAdmin`, so `user.role === 'ADMIN'` short-circuits every reachable call.
**Fix:** Simplify to the admin check, or leave it with a comment noting it is retained
against future non-admin-visible invitation queries.

### IN-03: Unused `Divider` import

**File:** `frontend/src/pages/ApprovalsPage.jsx:12`
**Issue:** `Divider` is imported but never rendered (0 occurrences of `<Divider`). Pre-existing
— it was already unused at `a9e9b53` — but this phase touched the same import block to remove
`Chip` and left it.
**Fix:** Drop `Divider` from the import.

### IN-04: Stale fixture field and stale comment in `ApprovalsPage.test.jsx`

**File:** `frontend/src/pages/ApprovalsPage.test.jsx:20,95-99`
**Issue:** `ROW.registeredUser` still carries `emailVerified: true`, but the component's
`PENDING_QUERY` no longer selects `emailVerified` — a real server response cannot contain it,
so the fixture diverges from production. Separately, the comment at 95-99 explains a
short-circuit bug (`row.registeredUser && !row.registeredUser.emailVerified`) in code that
was deleted in this phase, so it now describes a line that does not exist.
**Fix:** Drop `emailVerified` from the fixture and rewrite the comment to state the surviving
invariant ("`registeredUser` is nullable via `ON DELETE SET NULL`, so both actions must be
disabled").

### IN-05: A test locks in a `verifyEmail` payload the schema forbids

**File:** `frontend/src/pages/VerifyEmail.test.jsx:38-50`
**Issue:** The mocked payload omits `user.status`, but the schema declares
`status: AccountStatus!` (`backend/src/schemas/user.schema.js:20`) and `AuthContext`'s
`VERIFY_EMAIL_MUTATION` always selects it (`AuthContext.jsx:26`) — the field can never be
absent in production. This is the only coverage for the `user.status &&` fallback at
`VerifyEmail.jsx:25` and `AuthContext.jsx:78`, so a defensive branch is kept alive purely by
a fictional response shape.
**Fix:** Give the fixture `status: 'Active'` (the two newer tests at `:52` and `:65` already
do this correctly) and drop the `user.status &&` conjunct in both places, or keep it with a
comment that it exists solely for older cached clients.

### IN-06: Duplicated admin conditional in the nav

**File:** `frontend/src/components/AppLayout.jsx:73-90`
**Issue:** Two adjacent, identical `{user.role === 'ADMIN' && (...)}` blocks wrap the
`Invitations` and `Link accounts` buttons. The phase added the first one next to an existing
second one instead of widening it.
**Fix:** Collapse into one guard around a fragment containing both buttons, so a future
admin-only nav item cannot be added outside the check by accident.

### IN-07: Brittle derived email in a test helper

**File:** `backend/src/resolvers/approveReject.test.js:19`
**Issue:** `createTestUser({ role: 'ADMIN', email: \`inviter-${email}\` })` builds the
inviter's address by prefixing the invitee's full address. It produces a valid address only
because every current caller passes a simple `local@example.com`; any caller passing an
address with a leading digit-plus-tag, or a bare local part, yields something that trips
`User.email`'s `isEmail` validator with a confusing failure far from the call site.
**Fix:** `email: \`inviter-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com\``,
or take the inviter email as an explicit option.

### IN-08: `createInvitation` accepts an address that already has an account or an outstanding invitation

**File:** `backend/src/resolvers/invitation.resolver.js:60-99`
**Issue:** The mutation validates only that `invitedEmail` is non-blank. Inviting an address
that already has a `User`, or that already has a live `Pending` invitation, succeeds, sends
an email, and creates a row that can never be redeemed — `register` will reject it with
`'An account with this email already exists.'` (`user.resolver.js:129`). The dead row then
sits at `Pending` in the admin list until `INVITE_EXPIRES_DAYS` elapses, and only `register`
ever lazily flips a row to `Expired` (`user.resolver.js:118-124`) — a row nobody redeems is
never expired at all, so it is `Pending` in the UI forever.
**Fix:** Reject early with a precise message, mirroring how the mutation already validates
the blank email as "the integrity boundary":
```js
const existing = await models.User.findOne({ where: { email: invitedEmail.toLowerCase() } });
if (existing) throw new Error('That email address already has an account.');
```
and consider a lazy `status: 'Expired'` sweep inside `myInvitations` / `invitations` for rows
past `expiresAt`.

---

_Reviewed: 2026-08-29T13:55:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
