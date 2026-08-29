---
phase: 31-invitations-become-admin-only
reviewed: 2026-08-29T15:15:30Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - backend/src/resolvers/approveReject.test.js
  - backend/src/resolvers/createInvitation.test.js
  - backend/src/resolvers/invitation.resolver.js
  - backend/src/resolvers/register.test.js
  - backend/src/resolvers/user.resolver.js
  - backend/src/resolvers/verifyEmail.test.js
  - frontend/src/App.jsx
  - frontend/src/components/AppLayout.jsx
  - frontend/src/pages/ApprovalsPage.jsx
  - frontend/src/pages/ApprovalsPage.test.jsx
  - frontend/src/pages/VerifyEmail.test.jsx
findings:
  critical: 2
  warning: 13
  info: 10
  total: 25
status: issues_found
---

# Phase 31: Code Review Report

**Reviewed:** 2026-08-29T15:15:30Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

This review covers the full phase as it stands on disk **after** plan 31-04 landed
(`5203419 feat(31-04): re-verify inviter at redemption time`). It supersedes the
pre-31-04 report at this path.

The two Critical findings from the previous report are genuinely addressed:
`createInvitation` / `myInvitations` / `invitations` / `pendingRegistrations` all sit
behind `requireAdmin`, and `verifyEmail`'s auto-promotion no longer fires on the mere
existence of an `Invitation` row — it now re-reads the inviter and requires
`role === 'ADMIN' && status === 'Active'`, with four new tests pinning the refusal paths
(`verifyEmail.test.js:357-453`). Both suites were executed during this review: 48 backend
tests pass (1 skipped — the MySQL-8.4-only `VERIFY-04` racer test, correctly skipped on the
local MariaDB and genuinely exercised on CI, which runs `mysql:8.4`), 12 frontend tests pass.

That said, the fix has been verified against the wrong threat model in two places, and both
are exactly the failure mode this project's history warns about — an authorization guard
that is correct only by accident, with a fully green suite.

1. **The inviter re-check is a non-locking read.** The code comment at
   `user.resolver.js:280-286` explicitly claims to close the TOCTOU where "an invitation
   whose inviter is later demoted to USER, disabled, or rejected before the invitee
   verifies." It does not. `findByPk` takes no row lock, so a concurrent demotion can commit
   between the read and the promotion. The window is closed today *only* because the
   admin-slot `SELECT COUNT(*) ... FOR UPDATE` two statements earlier has no usable index and
   incidentally X-locks every row in `users`. Indexing `users.role` — the single most obvious
   optimization for that exact query — silently reopens the hole, and no test would notice.

2. **`vouchedByAdmin` uses a definition of "administrator" that three other guards in the
   same codebase reject.** It omits `emailVerified`, so an ADMIN who changed their email
   (and consequently cannot log in at all) still auto-activates registrants.

Beyond the guard itself, the phase's headline user-visible outcome (SC-3: "the invitee goes
straight in, no admin action in between") is not actually delivered end to end. The backend
promotion to `Active` works, but `ProtectedRoute` immediately bounces the freshly activated
invitee — who has `familyMemberId === null` — to `/pending`, a page titled *"Waiting for
admin approval."* The SC-3 frontend test asserts `navigate('/dashboard')` against a mocked
`useNavigate` and therefore cannot see the redirect that undoes it.

Several defects flagged in the previous report remain unfixed and are re-raised here with
current line numbers (dead `notifyAdminsOfPendingRegistration`, the permanent
`ApprovalsPage` spinner, `submitReject`'s null-deref window, the invitation row that
misreports `Registered` forever, the missing revoke path, and the `InvitationsPage` test
that pins behavior D-01/D-03 now forbid).

## Structural Findings (fallow)

None provided for this review — no structural pre-pass payload accompanied the request.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: The inviter re-check reads the row it authorizes against without a lock — the TOCTOU the comment claims to close is only closed by an incidental full-table lock

**File:** `backend/src/resolvers/user.resolver.js:287` (context: `:254-301`, `:263-266`, `:275-278`)

**Issue:**

The gap-closure fix reads the inviter with a plain, non-locking select:

```js
const inviter = await models.User.findByPk(invitation.inviterId, { transaction: t });
const vouchedByAdmin = Boolean(inviter) && inviter.role === 'ADMIN' && inviter.status === 'Active';
```

and the comment immediately above it (`:280-286`) asserts this closes "(2) an invitation whose
inviter is later demoted to USER, disabled, or rejected before the invitee verifies (TOCTOU).
Re-reading the inviter's live row on every redemption closes both."

Re-reading does not close a TOCTOU. It only shrinks it. The read at `:287` takes **no lock on
the inviter row**, and the promotion write at `:294-297` happens two statements later. Under
InnoDB REPEATABLE READ this transaction's consistent read view is established at the first
plain `SELECT` in the transaction — `models.Invitation.findOne(...)` at `:275` — so `:287`
serves from that snapshot and acquires nothing. A concurrent `updateUser` demoting that admin
to `USER`, or setting `status: 'Disabled'`, can commit in the gap, and the invitee is still
promoted to `Active` on the strength of a revoked vouch.

The reason this is not observable today is worse than the bug. The admin-slot read two
statements earlier is:

```js
"SELECT COUNT(*) AS adminCount FROM users WHERE role = 'ADMIN' AND emailVerified = true FOR UPDATE"
```

`users.role` is **not indexed** — no `KEY` on it in any file under `backend/migrations/manual/`,
and none declared in `backend/src/models/User.js:32-36`. So InnoDB full-scans `users` and takes
X locks across the table, incidentally including the inviter row. The authorization guard is
therefore correct as a side effect of a missing index. The moment somebody adds
`KEY idx_users_role (role)` — the obvious, well-motivated optimization for precisely that
`COUNT(*)` — the incidental lock disappears, the window reopens, and every test in
`verifyEmail.test.js` stays green, because all four refusal tests (`:357-453`) set up the
inviter's state *before* the mutation runs and never race it.

This is the same shape as the Phase 14/15/30 authorization gaps recorded in project memory:
the guard reads correct, the tests pass, and the invariant rests on something nobody wrote down.

**Fix:** Lock the row you are authorizing against, in the same transaction that acts on the
decision.

```js
// Lock the inviter row for the duration of the decision: an unlocked read leaves a window
// in which a concurrent demote/disable commits between the check and the promotion.
const inviter = await models.User.findByPk(invitation.inviterId, {
  transaction: t,
  lock: t.LOCK.UPDATE
});
```

Then add a lock-contention test in the style of the existing `rawConnection()` harness
(`verifyEmail.test.js:31-42, 108-156`): hold an exclusive lock on the inviter row from the raw
connection, demote the inviter, commit, and assert the verifier that was pinned behind that
lock refuses to promote.

---

### CR-02: `vouchedByAdmin` omits `emailVerified`, so an administrator who cannot authenticate still confers Active status

**File:** `backend/src/resolvers/user.resolver.js:288`

**Issue:**

```js
const vouchedByAdmin = Boolean(inviter) && inviter.role === 'ADMIN' && inviter.status === 'Active';
```

Three other places in this codebase define an administrator as `role = 'ADMIN'` **and**
`emailVerified = true`:

- `backend/src/resolvers/user.resolver.js:263-264` — the admin-slot count inside this very
  function: `WHERE role = 'ADMIN' AND emailVerified = true`.
- `backend/src/resolvers/user.resolver.js:425-427` — `updateUser`'s "cannot remove the last
  administrator" guard counts `{ role: 'ADMIN', emailVerified: true }`.
- `backend/src/utils/auth.js:29` — `getUserFromRequest` returns `null` for any account with
  `!user.emailVerified`, i.e. an unverified admin is treated as not logged in at all.

The new guard uses a strictly weaker definition, and there is an ordinary, non-adversarial path
that produces the divergent state. `updateUser` at `:444-453`:

```js
if (normalized !== target.email) {
  rawVerificationToken = createVerificationToken();
  target.email = normalized;
  target.emailVerified = false;   // <-- role stays ADMIN, status stays Active
  ...
}
```

An admin changing their own (or another admin's) email address lands on
`role='ADMIN', status='Active', emailVerified=false`. That account is locked out of the entire
API by `auth.js:29` and does not count toward the last-administrator floor — yet every
invitation it previously sent still auto-activates its registrant into the family platform with
no human in the loop and no audit trail of a decision (`:293-299` writes no
`approvedAt`/`approvedBy`).

The refusal tests cover `role: 'USER'` (`verifyEmail.test.js:357-388`) and
`status: 'Disabled'` (`:393-428`). Neither exercises `emailVerified: false`, so the omission is
invisible to the suite.

**Fix:**

```js
const vouchedByAdmin =
  Boolean(inviter) &&
  inviter.role === 'ADMIN' &&
  inviter.status === 'Active' &&
  inviter.emailVerified === true;
```

Add the matching refusal test:

```js
it('does not activate a Pending account whose inviter is an ADMIN with an unverified email', async () => {
  // ... user Pending + unverified, with a live verification token
  const inviter = await createTestUser({
    role: 'ADMIN', status: 'Active', emailVerified: false, email: 'inviter-unverified@example.com'
  });
  // ... Invitation row pointing at both
  const response = await graphql(VERIFY_EMAIL_MUTATION, { token: '...' });
  expect(response.data.verifyEmail.user.status).toBe('Pending');
  expect(await models.AuditLog.count({ where: { action: 'invitation.activated' } })).toBe(0);
});
```

Better still, extract the predicate to a single named helper (e.g.
`isVouchingAdmin(user)` in `utils/auth.js`) and reuse it at `:263-264` and `:425-427`, so the
three definitions cannot drift apart again.

---

## Warnings

### WR-01: `verifyEmail` mints and returns a real JWT for accounts the server just decided may not authenticate

**File:** `backend/src/resolvers/user.resolver.js:328`

**Issue:** `return { token: signToken(user), user };` runs unconditionally on every successful
verification, including the paths this phase added specifically to *deny* access: the D-06
Rejected/Disabled accounts (asserted at `verifyEmail.test.js:290-351`) and the CR-01
blocked-inviter accounts (`:357-453`). `signToken` (`utils/auth.js:5-7`) embeds only
`{ sub, role }` with no status claim, and the token is valid for the whole `JWT_EXPIRES_IN`
window.

The token is inert *today* because `getUserFromRequest` re-reads `status` on every request
(`auth.js:31-33`). The residual defects are real, though:

- It is a durable bearer credential issued to a principal the server just refused.
- Approval is not a fresh-auth boundary: neither `approveUser` nor `rejectUser`
  (`approval.resolver.js:44,86`) touches `passwordChangedAt`, which is the only token-revocation
  mechanism in the system (`auth.js:24-27`). So a Pending registrant's token, issued *before* any
  admin looked at them, silently becomes a valid session the instant an admin approves.

Not classified BLOCKER because the per-request status check prevents immediate privilege use.

**Fix:** Only mint a session for an account permitted to hold one. `AuthPayload.token` is
currently `String!` (`backend/src/schemas/user.schema.js:32-35`), so this needs a schema change
to `String`. `AuthContext.verifyEmail` (`frontend/src/context/AuthContext.jsx:75-84`) already
discards the token for non-Active users, so no client change is required.

```graphql
type AuthPayload {
  token: String
  user: User!
}
```

```js
const canAuthenticate = user.emailVerified && user.status === 'Active';
return { token: canAuthenticate ? signToken(user) : null, user };
```

---

### WR-02: The deadlock retry only recognizes `ER_LOCK_DEADLOCK`; a lock-wait timeout leaks a raw MySQL error to an unauthenticated caller

**File:** `backend/src/resolvers/user.resolver.js:303-315`

**Issue:**

```js
const isDeadlock = (error) =>
  error?.original?.code === 'ER_LOCK_DEADLOCK' || error?.parent?.code === 'ER_LOCK_DEADLOCK';
```

`verifyAndPromote` deliberately holds a `FOR UPDATE` read that, with `users.role` unindexed
(see CR-01), locks the whole table. Under concurrent verification the far more likely failure
is `ER_LOCK_WAIT_TIMEOUT` (default `innodb_lock_wait_timeout = 50`), not a deadlock — the test
harness itself acknowledges this by setting `SET SESSION innodb_lock_wait_timeout = 10`
(`verifyEmail.test.js:40`). A lock-wait timeout is rethrown unchanged at `:312`.

There is no error masking anywhere in the backend: `new ApolloServer({ typeDefs, resolvers, validationRules, plugins })`
at `backend/src/server.js:26` sets no `formatError`. So the raw Sequelize/MySQL message — table
names, SQL fragments, and a stack trace in non-production `NODE_ENV` — is returned verbatim to
an **unauthenticated** client, since `verifyEmail` requires no auth. A second consecutive
deadlock has the same outcome.

Impact is bounded: the transaction rolls back, so the single-use token is *not* consumed and a
manual retry succeeds. The user just sees an unintelligible failure on their verification link.

**Fix:** Widen the retryable set and add a bounded retry loop, then mask what escapes.

```js
const RETRYABLE = new Set(['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']);
const isRetryable = (error) =>
  RETRYABLE.has(error?.original?.code) || RETRYABLE.has(error?.parent?.code);

let lastError;
for (let attempt = 0; attempt < 3; attempt += 1) {
  promotedInvitation = null; // no attempt has committed
  try {
    await verifyAndPromote();
    lastError = null;
    break;
  } catch (error) {
    if (!isRetryable(error)) throw error;
    lastError = error;
  }
}
if (lastError) throw new Error('Could not complete verification right now. Please try the link again.');
```

Separately, add `formatError` to the Apollo config so no unmapped DB error text ever reaches a
client.

---

### WR-03: SC-3 is not delivered end to end — the auto-activated invitee still lands on a page titled "Waiting for admin approval", and the SC-3 test cannot see it

**File:** `frontend/src/pages/VerifyEmail.test.jsx:52-63` (with `frontend/src/components/ProtectedRoute.jsx:17`, `frontend/src/App.jsx:28-33`)

**Issue:** The backend half of SC-3 works: the invitee's `status` flips to `Active` inside
`verifyEmail`. The user-visible half does not. Trace the real flow:

1. `register` (`user.resolver.js:136-146`) creates the account with **no `familyMemberId`** —
   nothing in `register` or `verifyEmail` ever sets it (only `linkUserToMember` at `:396` does).
2. `AuthContext.verifyEmail` sees `status === 'Active'`, stores the token, and sets
   `user = { ..., familyMemberId: null }` (the mutation selects it,
   `AuthContext.jsx:26`).
3. `VerifyEmail.jsx:25` calls `navigate('/dashboard')`.
4. `/dashboard` is inside `<Route element={<ProtectedRoute />}>` (`App.jsx:28-29`), and
   `ProtectedRoute.jsx:17` runs:
   `if (!user.familyMemberId && user.role !== 'ADMIN') return <Navigate to="/pending" replace />;`
5. The invitee lands on `Pending.jsx`, whose title is **"Waiting for admin approval"** and whose
   body reads *"Your account is awaiting an admin to link you to your family member."*

So the invitee still waits for an admin — just a different admin action than before. The test
that claims to pin this (`VerifyEmail.test.jsx:52-63`, commented `(F-02, SC-3)`) mocks
`useNavigate` (`:13-18`) and asserts only that `navigate('/dashboard')` was *called*. It renders
a two-route `MemoryRouter` containing nothing but `VerifyEmail`, so the guard that immediately
overrides that navigation is not in the tree. The test proves intent, not outcome — precisely
the "green test hiding the gap" pattern this project has recorded three times.

**Fix:** Decide which is true and make the code and the test agree.

- If an activated invitee should reach the dashboard, then the linking gate must not apply to
  them (or `verifyEmail`/`approveUser` must establish the link), and `Pending.jsx`'s copy must
  stop describing an Active account as "awaiting approval".
- Either way, replace the mocked-`useNavigate` assertion with an integration render over the
  real route table so the assertion is about where the user ends up:

```jsx
render(
  <AuthProvider>
    <MemoryRouter initialEntries={['/verify-email?token=active-token']}>
      <App />
    </MemoryRouter>
  </AuthProvider>
);
expect(await screen.findByText(/dashboard/i)).toBeInTheDocument();
expect(screen.queryByText(/waiting for admin approval/i)).not.toBeInTheDocument();
```

---

### WR-04: A refused auto-promotion writes no audit record, so the security-relevant event is invisible

**File:** `backend/src/resolvers/user.resolver.js:293-299` (with `:319-326`)

**Issue:** When `vouchedByAdmin` is true and the promotion lands, `invitation.activated` is
written. When it is **false** — i.e. a legacy non-admin-issued invitation is being redeemed, or
an admin was demoted/disabled after inviting — the branch is silently skipped and nothing is
recorded anywhere. The tests even codify the silence:
`expect(await models.AuditLog.count({ where: { action: 'invitation.activated' } })).toBe(0)`
(`verifyEmail.test.js:387, 427, 452`).

A redemption of an invitation whose issuer no longer holds authority is exactly the event an
operator needs to see. This codebase already has the machinery (`writeAuditLog`, actions
`invitation.created` / `invitation.registered` / `invitation.activated` / `user.approved` /
`user.rejected`) — the one event that represents a refused privilege grant is the one it does
not emit.

**Fix:** Capture the refusal alongside the promotion and log it after commit, next to the
existing `invitation.activated` write:

```js
// inside the transaction
if (vouchedByAdmin) {
  ...
} else {
  refusedInvitation = { id: invitation.id, inviterId: invitation.inviterId,
                        inviterRole: inviter?.role ?? null, inviterStatus: inviter?.status ?? null };
}

// after the transaction commits
if (refusedInvitation) {
  writeAuditLog(models, {
    action: 'invitation.activation_refused',
    actorUserId: user.id,
    invitationId: refusedInvitation.id,
    targetUserId: user.id,
    metadata: refusedInvitation
  }).catch((err) => console.error('Failed to write audit log:', err));
}
```

---

### WR-05: An invitation cannot be revoked, and `rejectUser` is unreachable for every registrant the auto-promotion succeeds for

**File:** `backend/src/resolvers/invitation.resolver.js:34-55`, `backend/src/resolvers/approval.resolver.js:9-12`, `backend/src/resolvers/user.resolver.js:275-299`

**Issue:** Three guards now compose into a one-way door for a mis-sent invitation:

- There is no `revokeInvitation` / `expireInvitation` mutation anywhere in
  `invitation.schema.js:49-51` — the only mutation is `createInvitation`.
- `assertDispositionable` (`approval.resolver.js:9-12`) refuses to act on an account with
  `!emailVerified`, so an admin **cannot** reject a registrant before they verify.
- `pendingRegistrations` (`invitation.resolver.js:46-49`) now filters to
  `status: 'Pending', emailVerified: true`, so an unverified registrant is not even visible in
  the queue.
- The instant they verify, `verifyEmail` promotes them to `Active` — at which point
  `assertDispositionable`'s `status !== 'Pending'` check makes `rejectUser` throw
  "This account is not awaiting a decision."

Net effect: between sending an invitation and the invitee verifying, an admin who realizes they
sent it to the wrong address has **no API path to stop it**. The only remedy is post-hoc — and
even that requires a `Disabled` write that no mutation exposes (`updateUser` at `:407-472`
changes only role, name, and email; it cannot set `status`).

**Fix:** Add an admin-only `revokeInvitation(id: ID!)` that sets `status: 'Expired'` on a
`Pending` or `Registered` invitation, and have `verifyEmail`'s promotion refuse when the
invitation has been revoked. Alternatively (or additionally) expose `status` on
`UpdateUserInput` so an admin can set `Disabled` after the fact. Whichever path is chosen, cover
it with a test that revokes between `register` and `verifyEmail` and asserts the account stays
`Pending`.

---

### WR-06: An auto-activated invitation keeps `status: 'Registered'` forever, so the admin invitation list permanently misreports the outcome

**File:** `backend/src/resolvers/user.resolver.js:271-274, 293-299`

**Issue:** D-08 deliberately leaves `Invitation.status` untouched on auto-activation, and
`verifyEmail.test.js:283-285` pins it. The consequence is that the `Invitation` row's own
lifecycle field becomes permanently wrong for the phase's *primary* success path:

- `InvitePage.jsx:36-42` renders that status as a chip with `Registered: 'info'`, sitting next to
  `Approved: 'success'`. An admin reviewing `myInvitations` sees "Registered" — i.e. *registered
  but not yet decided* — for accounts that are fully Active and using the platform.
- The `Approved` enum member (`invitation.schema.js:6`) is now only ever written by
  `approveUser` (`approval.resolver.js:46`), which by WR-05 can no longer run for any invited
  registrant. The value is effectively unreachable for the invitation flow.
- `pendingRegistrations` compensates by cross-checking the User row (`:46-49`), so the *queue* is
  correct — but the invitation list is not, and any future consumer that keys off
  `Invitation.status` inherits the lie.

**Fix:** Either stamp a terminal status inside the promotion transaction so the row tells the
truth, or drop the misleading value from the UI. The former is a one-line addition next to the
promotion at `:294-297`:

```js
await models.Invitation.update(
  { status: 'Approved', approvedAt: new Date() },
  { where: { id: invitation.id }, transaction: t }
);
```

If D-08 must be preserved, then `STATUS_COLOR` / the chip label in `InvitePage.jsx` needs a
derived state that consults `registeredUser.status`, and the reasoning should be recorded on the
schema enum.

---

### WR-07: Dead `notifyAdminsOfPendingRegistration` and its now-unused mailer import survive the notification removal

**File:** `backend/src/resolvers/user.resolver.js:17, 19-39`

**Issue:** Commit `a353f80` ("drop register's admin-notification email") removed the call site
but left the function body. Verified by grep across `backend/src` and `backend/test`:
`notifyAdminsOfPendingRegistration` has exactly **one** occurrence — its own definition at
`:22`. It is never invoked.

That dead function is also the sole production consumer of `sendPendingRegistrationEmail`
(imported at `:17`), so `backend/src/services/mailer.js:109` is now dead too. The only remaining
references are in `register.test.js:7,11,72`, where the test mocks a function nothing calls and
asserts it was not called — a tautology that will pass forever regardless of the source.

The stale doc comment at `:19-21` ("Best-effort: email every Active admin that a new invited
account has registered and is awaiting approval") actively contradicts D-11, which removed that
behavior.

**Fix:** Delete `:19-39`, drop `sendPendingRegistrationEmail` from the `:17` import, and delete
`sendPendingRegistrationEmail` from `services/mailer.js` if no other caller exists. Keep the
`register.test.js:72` assertion only if it is re-pointed at something observable (e.g. asserting
`sendVerificationEmail` is the *only* mailer call).

---

### WR-08: `pendingRegistrations` matches ids through `Set.has` with no coercion, unlike every other id comparison in the same file

**File:** `backend/src/resolvers/invitation.resolver.js:50, 53`

**Issue:**

```js
const eligibleIds = new Set(eligibleUsers.map((eligibleUser) => eligibleUser.id));
return registered.filter(
  (invitation) => invitation.registeredUserId == null || eligibleIds.has(invitation.registeredUserId)
);
```

`Set.prototype.has` is `SameValueZero` — `has(9)` is `false` for a Set containing `'9'`. The
comparison works today only because both `users.id` and `invitations.registeredUserId` are
`INT UNSIGNED` (`migrations/manual/016-create-invitations.sql:8,17`) and `mysql2` returns both
as JS numbers.

The same file does *not* trust that assumption anywhere else — `:108-109` and `:117` both wrap
in `Number(...)`:

```js
if (user?.role === 'ADMIN' || Number(invitation.inviterId) === Number(user?.id)) {
  return loaders.userById.load(Number(invitation.inviterId));
```

If either column is ever widened to `BIGINT` (which `mysql2` returns as a string), or if the
`attributes: ['id']` projection changes shape, the filter silently evaluates to `false` for every
row and `pendingRegistrations` returns **only orphaned invitations** — an empty approval queue
with no error, in a resolver whose whole job is to surface accounts awaiting a human decision.
No test would catch it: the only test with a non-orphaned expectation
(`approveReject.test.js:249-257`) would just see `toHaveLength(0)` instead of `1` — well, it
would fail, but the failure mode in production is a silently empty queue.

**Fix:** Normalize on both sides, matching the file's existing convention.

```js
const eligibleIds = new Set(eligibleUsers.map((eligibleUser) => Number(eligibleUser.id)));
return registered.filter(
  (invitation) => invitation.registeredUserId == null || eligibleIds.has(Number(invitation.registeredUserId))
);
```

---

### WR-09: A failed `pendingRegistrations` load leaves the page spinning forever next to the error message

**File:** `frontend/src/pages/ApprovalsPage.jsx:65-73, 115-118`

**Issue:**

```js
const load = useCallback(() => {
  return graphqlRequest(PENDING_QUERY)
    .then((data) => setRows(data.pendingRegistrations))
    .catch((err) => setError(err.message));
}, []);
```

`rows` is initialized to `null` and the `catch` never assigns it. The render at `:115-118` keys
the loading state off `rows === null`, so on any failure the user gets an error `<Alert>` *and*
an indefinite `<CircularProgress />` below it, with no retry affordance. Because `load` has an
empty dependency array and `useEffect` runs once, nothing ever re-fires.

This is reachable through the ordinary case: the route is ADMIN-only
(`App.jsx:34-37`) but a token expiring mid-session, or any network blip, produces it.

**Fix:** Move the query out of the "unknown" state on failure and add a retry.

```js
const load = useCallback(() => {
  setError('');
  return graphqlRequest(PENDING_QUERY)
    .then((data) => setRows(data.pendingRegistrations))
    .catch((err) => {
      setError(err.message);
      setRows([]);   // leave the loading state; the error Alert now stands alone
    });
}, []);
```

and render `{error && <Alert severity="error" action={<Button onClick={load}>Retry</Button>}>{error}</Alert>}`.

---

### WR-10: `submitReject` dereferences `rejectTarget` after nulling it, and dereferences `registeredUser` without a guard

**File:** `frontend/src/pages/ApprovalsPage.jsx:88-102`

**Issue:**

```js
const submitReject = async () => {
  const row = rejectTarget;
  setError('');
  setBusyId(row.id);          // TypeError if rejectTarget is null
  setRejectTarget(null);
  try {
    await graphqlRequest(REJECT, { id: row.registeredUser.id, reason: rejectReason || null });
```

Two unguarded dereferences:

1. `row.id` at `:91` assumes `rejectTarget` is non-null. The dialog's confirm button
   (`:202-204`) has no `disabled` binding, and MUI's `<Dialog>` keeps its children mounted and
   clickable through the exit transition after `setRejectTarget(null)`. A second click during
   that window calls `submitReject` with `rejectTarget === null` and throws a `TypeError` inside
   an async handler — an unhandled rejection with no user-visible error, because the `try` block
   starts *after* the throwing line.
2. `row.registeredUser.id` assumes a non-orphaned row. That currently holds only because the
   Reject button is disabled for `orphaned` rows (`:131, 168`) — an invariant enforced two
   levels away, in a different component branch, with the comment at `:128-130` explaining that
   `fk_invitations_registered_user` is `ON DELETE SET NULL` so nulls are genuinely reachable.
   The exact same class of null-deref is what `ApprovalsPage.test.jsx:89-102` exists to catch.

**Fix:** Guard at the top and disable the confirm button while busy.

```js
const submitReject = async () => {
  const row = rejectTarget;
  if (!row?.registeredUser) return;
  setError('');
  setBusyId(row.id);
  setRejectTarget(null);
  ...
```

```jsx
<Button color="error" variant="contained" disabled={!rejectTarget?.registeredUser} onClick={submitReject}>
```

---

### WR-11: `InvitationsPage` still branches on `isAdmin` and documents itself as open to everyone; its test asserts the exact state D-01/D-03 now forbid

**File:** `frontend/src/App.jsx:34-41` (consequence in `frontend/src/pages/InvitationsPage.jsx:7-23` and `frontend/src/pages/InvitationsPage.test.jsx:26-33`)

**Issue:** Moving `/invitations` under `<ProtectedRoute allowedRoles={['ADMIN']} />` is correct and
matches D-03. But two adjacent artifacts were not updated with it:

- `InvitationsPage.jsx:7-8` still carries the pre-phase doc comment: *"One page for the whole
  invitation lifecycle: **anyone can invite a family member** (top), and admins additionally
  review pending registrations (bottom)."* That is now false at both layers —
  `createInvitation` throws `Admin access is required.` (`invitation.resolver.js:61`) and the
  route itself is ADMIN-gated.
- `InvitationsPage.jsx:12-13, 18` computes `const isAdmin = user?.role === 'ADMIN'` and
  conditionally renders `<ApprovalsPage />`. Behind an ADMIN route guard, `isAdmin` is
  unconditionally `true`; the branch is dead.
- `InvitationsPage.test.jsx:26-33` — `it('shows the invite section but NOT approvals for a
  non-admin')` — renders the page with `{ user: { id: 1, role: 'USER' } }` and asserts the invite
  form is present. It passes (I ran it), and it documents a reachable state that no longer
  exists. Worse, it is the kind of test that *blocks* the correct cleanup: deleting the dead
  `isAdmin` branch turns this green test red for the wrong reason.

**Fix:** Rewrite the comment to state the route is ADMIN-only, delete the `isAdmin` branch (render
`<InvitePage />` and `<ApprovalsPage />` unconditionally), and replace
`InvitationsPage.test.jsx:26-33` with a routing test that asserts a non-admin navigating to
`/invitations` is redirected away by `ProtectedRoute` — the assertion D-03 actually needs and
that no test currently makes.

---

### WR-12: `createInvitation` surfaces a raw Sequelize validation error for a malformed address, leaking the column and validator name

**File:** `backend/src/resolvers/invitation.resolver.js:63-79`

**Issue:** The resolver validates only emptiness:

```js
if (!invitedEmail) throw new Error('An invitation needs an email address.');
```

with the comment at `:65-66` asserting "The mutation is the integrity boundary — validate here,
not just in the model, so we can give a precise message before creating a token." But format
validation is left entirely to the model (`Invitation.js:15`, `validate: { isEmail: true }`).
Submitting `not-an-email` reaches `models.Invitation.create` at `:70`, which throws a Sequelize
`ValidationError` whose message is `Validation error: Validation isEmail on invitedEmail failed`.

There is no `formatError` on the Apollo server (`server.js:26`), so that string is returned
verbatim — internal column name, internal validator name, and in non-production a stack trace.
It is also inconsistent with the friendly message one line above and with `updateUser`'s
`UniqueConstraintError` handling (`user.resolver.js:458-463`), which explicitly translates
Sequelize errors into user-facing text.

`createInvitationToken()` runs at `:69` before the failing `create`, so no state is persisted —
the impact is a bad message and internal-detail disclosure, not corruption.

**Fix:** Validate format at the same boundary, or translate the model error like `updateUser`
does:

```js
try {
  invitation = await models.Invitation.create({ ... });
} catch (error) {
  if (error instanceof ValidationError) throw new Error('That is not a valid email address.');
  throw error;
}
```

Add a test asserting the friendly message for `invitedEmail: 'not-an-email'`, alongside the
existing blank-email test at `createInvitation.test.js:70-78`.

---

### WR-13: The lock-contention test asserts a 25 ms wall-clock tolerance, making the phase's concurrency proof timing-dependent

**File:** `backend/src/resolvers/verifyEmail.test.js:112-156` (assertion at `:153`)

**Issue:**

```js
expect(mutationResolvedAt).toBeGreaterThanOrEqual(rawCommittedAt - 25);
```

`mutationResolvedAt` and `rawCommittedAt` are `Date.now()` samples taken in two racing
promises, compared with a hand-tuned 25 ms slack against a 300 ms `SELECT SLEEP(0.3)` window.
On a loaded CI runner the scheduling jitter between the two `Date.now()` calls can exceed the
slack in either direction; the assertion is a heuristic dressed as a proof. Project memory
already records a "Backend test `resetTables` flake — random red backend suite under load,"
so this suite is demonstrably run in conditions where timing assumptions break.

Two secondary robustness problems in the same test:

- If `graphql(...)` rejects, `Promise.all` rejects, `response` stays `undefined`, and the
  failure surfaces at `:154` as `Cannot read properties of undefined (reading 'errors')` rather
  than as the actual error.
- The `finally` at `:142-149` calls `conn.rollback()` while the `SELECT SLEEP(0.3)` may still be
  in flight on the same connection; the resulting error is swallowed by the bare `catch {}` at
  `:144-146`, which is labelled `/* already committed */` — a comment that is wrong for that case.

**Fix:** Assert the causal ordering rather than the clock. Have the raw holder set a flag
immediately before `conn.commit()` and assert the mutation observed it:

```js
let lockReleased = false;
...
await conn.query('SELECT SLEEP(0.3)');
lockReleased = true;
await conn.commit();
...
// in the verifier branch, immediately after `graphql(...)` resolves:
observedLockReleased = lockReleased;
...
expect(observedLockReleased).toBe(true);   // no wall-clock arithmetic
```

and hoist the `response.errors` assertion so a rejected mutation reports its own message.

---

## Info

### IN-01: Unused `Divider` import

**File:** `frontend/src/pages/ApprovalsPage.jsx:11`
**Issue:** `Divider` is imported from `@mui/material` and never referenced anywhere in the file
(verified by grep — line 11 is the only occurrence). The section divider lives in
`InvitationsPage.jsx:20`, not here.
**Fix:** Remove `Divider,` from the import list at `:11`.

---

### IN-02: `blocked` is a pure alias of `orphaned` left behind by the D-10 cleanup

**File:** `frontend/src/pages/ApprovalsPage.jsx:131-133`
**Issue:**
```js
const orphaned = !row.registeredUser;
const blocked = orphaned;
const blockedReason = orphaned ? 'This registration has no account to act on.' : '';
```
`blocked` carries zero information beyond `orphaned`. The indirection made sense when the
unverified branch existed; commit `f34ce1a` removed it and left the scaffolding.
**Fix:** Delete `blocked` and use `orphaned` directly at `:156` and `:167`.

---

### IN-03: Stale comment describing removed code, and a dead fixture field, in `ApprovalsPage.test.jsx`

**File:** `frontend/src/pages/ApprovalsPage.test.jsx:20, 95-99`
**Issue:** The comment at `:95-99` describes
`row.registeredUser && !row.registeredUser.emailVerified` short-circuiting — code that no longer
exists in `ApprovalsPage.jsx` (removed by `f34ce1a`). A reader debugging this test will look for
a branch that is not there. Relatedly, `ROW.registeredUser.emailVerified: true` at `:20` is dead:
`PENDING_QUERY` (`ApprovalsPage.jsx:23-36`) no longer selects `emailVerified` and the component
never reads it.
**Fix:** Rewrite `:95-99` to state the current invariant ("`registeredUser` is nullable because
`fk_invitations_registered_user` is `ON DELETE SET NULL`; both actions address the account, so an
orphaned row must be non-actionable") and drop `emailVerified: true` from `:20`.

---

### IN-04: A test fixture locks in a `verifyEmail` payload the schema cannot produce

**File:** `frontend/src/pages/VerifyEmail.test.jsx:38-50`
**Issue:** The first test's mocked user object omits `status` entirely. Both consumers guard with
`payload.user.status && ...` (`AuthContext.jsx:78`) and `user.status && ...`
(`VerifyEmail.jsx:25`), so the test exercises the `undefined` fall-through — a shape the real
mutation never returns, since `VERIFY_EMAIL_MUTATION` always selects `status`
(`AuthContext.jsx:26`) and `User.status` is non-nullable. It also omits `familyMemberId`, which
the mutation selects.
**Fix:** Add `status: 'Active'` and `familyMemberId: null` to the `:42` fixture so it matches the
contract, and cover the `undefined` fall-through — if it is worth keeping at all — in an
explicitly named defensive test.

---

### IN-05: Duplicated `user.role === 'ADMIN'` conditional in the nav

**File:** `frontend/src/components/AppLayout.jsx:73-90`
**Issue:** Two consecutive, separately-evaluated `{user.role === 'ADMIN' && (...)}` blocks wrap
the Invitations and Link-accounts buttons. The admin-nav boundary is expressed twice, so a future
third admin link can be added without either guard — a small but real drift surface for a
visibility rule this phase deliberately tightened.
**Fix:** Collapse into one guarded `<>...</>` fragment, or map an `ADMIN_LINKS` array.

---

### IN-06: Unreachable null guard on a `NOT NULL` foreign key

**File:** `backend/src/resolvers/invitation.resolver.js:107`
**Issue:** `if (invitation.inviterId == null) return null;` cannot fire.
`inviterId` is declared `allowNull: false` on the association
(`models/index.js:70-75`) and `INT UNSIGNED NOT NULL` in the schema
(`migrations/manual/016-create-invitations.sql:10`), with
`fk_invitations_inviter ... ON DELETE CASCADE` so the row is removed rather than orphaned.
**Fix:** Remove the guard, or if it is intended as defense-in-depth against a manual DB edit, say
so in a comment so the next reader does not infer that `inviterId` is nullable.

---

### IN-07: The non-admin branch of the `Invitation.inviter` field resolver is now dead

**File:** `backend/src/resolvers/invitation.resolver.js:106-112`
**Issue:** Every query that can return an `Invitation` — `myInvitations`, `invitations`,
`pendingRegistrations` (`:17-55`) — now calls `requireAdmin` first, so `user?.role === 'ADMIN'`
is always true by the time this resolver runs. The `Number(invitation.inviterId) === Number(user?.id)`
self-check and the `return null` fall-through at `:111` are unreachable.
**Fix:** Keep the guard (it is correct defense-in-depth if a non-admin-visible invitation query is
ever added) but update the comment at `:103-105`, which currently implies both branches are live.

---

### IN-08: Raw SQL hardcodes the `users` table name, bypassing the model's `tableName`

**File:** `backend/src/resolvers/user.resolver.js:263-266`
**Issue:** `"SELECT COUNT(*) AS adminCount FROM users WHERE role = 'ADMIN' AND emailVerified = true FOR UPDATE"`
duplicates `tableName: 'users'` from `models/User.js:81`, and the column names `role` /
`emailVerified` from `:32-36, 50`. A rename in the model would leave this string silently
pointing at nothing — and it is the statement the single-ADMIN invariant depends on.
**Fix:** Interpolate from the model: `` `FROM ${models.User.getTableName()}` ``, or express the
locking read through Sequelize (`models.User.count({ where: {...}, transaction: t, lock: t.LOCK.UPDATE })`)
if the generated SQL is verified to carry `FOR UPDATE`.

---

### IN-09: `createInvitation` does not normalize email case, while `register` and `login` do

**File:** `backend/src/resolvers/invitation.resolver.js:6-10, 63`
**Issue:** `blankToNull` trims but does not lowercase, so `Invitation.invitedEmail` is stored as
typed. `register` (`user.resolver.js:128`) and `login` (`:175`) both normalize with
`.toLowerCase().trim()`, and `User.beforeValidate` (`models/User.js:83-84`) lowercases the stored
address. The result is that `Invitation.invitedEmail` and the `User.email` it produces can differ
in case for the same person. Functionally harmless today (the account is created from the
normalized value and the duplicate check normalizes), but `ApprovalsPage.jsx:127` falls back to
`row.invitedEmail` for display, and any future uniqueness or dedupe logic on `invitedEmail`
inherits the inconsistency.
**Fix:** Normalize at creation: `const invitedEmail = blankToNull(input.invitedEmail)?.toLowerCase() ?? null;`

---

### IN-10: `Invitation.findOne({ where: { registeredUserId } })` is unordered against a non-unique column

**File:** `backend/src/resolvers/user.resolver.js:275-278` (same shape at `approval.resolver.js:37-41, 79-83`)
**Issue:** `registeredUserId` has an FK but **no unique constraint**
(`migrations/manual/016-create-invitations.sql:17, 31-32` — only `uq_invitations_token_hash` and
plain `KEY` indexes exist). If two rows ever point at one account, `findOne` with no `order`
returns whichever InnoDB yields first, so which inviter is consulted for `vouchedByAdmin` becomes
nondeterministic. Only `register` (`user.resolver.js:151-154`) writes the column today, once per
account, so this is not currently reachable through the API.
**Fix:** Add `UNIQUE KEY uq_invitations_registered_user (registeredUserId)` in a follow-up
migration to make the one-invitation-per-account assumption enforced rather than implied, or add
`order: [['createdAt', 'DESC']]` to make the selection deterministic.

---

_Reviewed: 2026-08-29T15:15:30Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
