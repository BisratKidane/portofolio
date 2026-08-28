---
phase: 30-approval-moves-to-the-account
reviewed: 2026-08-28T07:46:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - backend/migrations/manual/019-add-users-approval-columns.sql
  - backend/src/models/User.js
  - backend/src/resolvers/approval.resolver.js
  - backend/src/resolvers/approveReject.test.js
  - backend/src/resolvers/index.js
  - backend/src/resolvers/invitation.resolver.js
  - backend/src/schemas/approval.schema.js
  - backend/src/schemas/index.js
  - backend/src/schemas/invitation.schema.js
  - frontend/src/pages/ApprovalsPage.jsx
  - frontend/src/pages/ApprovalsPage.test.jsx
findings:
  critical: 0
  warning: 8
  info: 6
  total: 14
status: issues_found
resolved:
  - CR-01  # fixed in 35306b9 -- lock-then-guard inside the transaction
  - WR-01  # fixed in 090ffe6 -- orphaned-row guard on Approve/Reject
  - WR-05  # fixed in ce48cc8 -- vi.waitFor around all AuditLog assertions
  - WR-09  # closed by construction: unreachable once CR-01 is fixed
remaining_note: >-
  8 warnings and 6 info findings remain open as tracked debt. WR-02 (orphaned
  invitation has no API remedy), WR-03 (rejectUser has no authorization test),
  WR-04 (no test discriminates D-07-before-D-08 ordering), WR-06 (migration 019
  failure mode is a full outage, not a degraded feature), WR-07 (unescaped
  reason in rejection email HTML), and WR-10 (submitReject dereferences
  rejectTarget before the try block) are the substantive ones.
---

# Phase 30: Code Review Report

**Reviewed:** 2026-08-28T07:46:00Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

The phase's structural intent is met: `approveInvitation`/`rejectInvitation` are gone from the
schema and resolvers with zero dangling references anywhere in `backend/src` or `frontend/src`
(D-01); the new `approval` module is correctly wired through both barrels and reaches the live
server via `src/graphql/serverConfig.js`; the User row is stamped unconditionally (D-04) and the
Invitation, when present, is stamped inside the same transaction with the same `now`/`admin.id`
values (D-05); `assertDispositionable` orders the status check before the verification check
(D-07 before D-08/D-09); and the admin UI disables both buttons for an unverified applicant
(D-11). Migration 019's column types (`DATETIME`, `INT UNSIGNED`, `TEXT`) match both the Sequelize
model and invitations' existing precision, so the "identical timestamps" invariant holds at the
storage layer. All 12 backend tests and all 5 frontend tests pass locally.

The defects are in the paths the tests do not exercise.

The headline problem is that **D-07's repeat-disposition guard is not actually a guard** — the
read-and-check happens outside the transaction with no row lock, so it is trivially bypassable.
This was reproduced, not inferred: two concurrent `approveUser` calls both returned success, wrote
two `user.approved` audit rows and sent two approval emails; a concurrent `approveUser` +
`rejectUser` pair *both* returned success and left the account row in a self-contradictory state
(`status='Rejected'` with **both** `approvedAt` and `rejectedAt` populated) while sending the
applicant both an "approved" and a "not approved" email. The codebase already contains the correct
idiom for exactly this problem — `register` in `user.resolver.js:150-156` uses a conditional
`UPDATE ... WHERE status='Pending'` + `affected === 0` compare-and-swap and even documents why —
so this is a regression from an established in-repo pattern, not a missing capability.

Secondary concerns cluster around two themes. First, the frontend's D-11 work fixed the
`emailVerified` case but reproduced the very defect D-11 exists to prevent for the *other*
nullable case: when `registeredUser` is null the buttons render **enabled** and clicking one throws
a raw `TypeError` at the admin (verified empirically). Second, the test suite has the same shape
the project has been burned by before (per the Phase 14 note: green tests, untested non-admin
paths) — `rejectUser` has **no authorization test at all**, and no test discriminates the
D-07/D-08 precondition ordering that the phase intent calls out as load-bearing, so swapping those
two lines would keep the suite green.

## Narrative Findings (AI reviewer)

_No `<structural_findings>` block was supplied for this review; all findings below are from direct
code reading plus targeted empirical probes (temporary probe tests were run and deleted; the
working tree is unmodified)._

## Critical Issues

### CR-01: D-07 repeat-disposition guard is TOCTOU-bypassable — concurrent approve+reject corrupts the account row and sends contradictory emails

**File:** `backend/src/resolvers/approval.resolver.js:20-35` and `:53-69` (guard at `:9-12`)

**Issue:**
`findByPk` + `assertDispositionable` run **outside** the transaction, with no row lock, and the
`update` inside the transaction re-checks nothing:

```js
const target = await models.User.findByPk(userId);   // read, no lock
if (!target) throw new Error('User not found.');
assertDispositionable(target);                       // check
// ...
await sequelize.transaction(async (t) => {
  await target.update({ status: 'Active', ... }, { transaction: t });  // unconditional write
```

Any two overlapping requests both pass the check before either writes. Reproduced against the real
test database:

| Scenario | Result |
|---|---|
| 2x concurrent `approveUser(sameId)` | both returned `errors: [null, null]`; **2** `user.approved` audit rows; **2** approval emails |
| concurrent `approveUser` + `rejectUser` | both returned `errors: [null, null]`; final row `status='Rejected'`, `approvedAt=<set>`, `rejectedAt=<set>`, `rejectionReason='nope'`; **1** approval email **and** **1** rejection email delivered to the same applicant |

Three distinct failures fall out of this: (a) the D-07 must-have is not enforced; (b) the User row
reaches a state that no single code path can produce — simultaneously stamped approved *and*
rejected — which is exactly the audit record Phase 30 exists to make trustworthy; (c) the applicant
receives two contradictory emails, and the audit log records two contradictory decisions with no
indication which won.

Trigger does not require malice: two admins reviewing the same queue, or one admin with the
approvals page open in two tabs. The frontend's `busyId` interlock is per-component-instance and
does not span tabs, sessions, or scripted clients.

**Fix:** Move the read and the guard inside the transaction and take a row lock, so the second
request blocks and then fails the guard on fresh data:

```js
const sequelize = models.User.sequelize;
let target;
await sequelize.transaction(async (t) => {
  target = await models.User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
  if (!target) throw new Error('User not found.');
  assertDispositionable(target);   // now evaluated against locked, current row state

  const invitation = await models.Invitation.findOne({
    where: { registeredUserId: target.id },
    transaction: t,
    lock: t.LOCK.UPDATE
  });
  const now = new Date();

  // Write the FULL decision tuple so a stale opposite decision cannot survive (see WR-09).
  await target.update(
    { status: 'Active', approvedAt: now, approvedBy: user.id, rejectedAt: null, rejectionReason: null },
    { transaction: t }
  );
  if (invitation) {
    await invitation.update({ status: 'Approved', approvedAt: now, approvedBy: user.id }, { transaction: t });
  }
  invitationId = invitation?.id ?? null;
});
// emails + audit stay AFTER commit, as they are today
```

Alternatively, use the compare-and-swap already proven in this repo
(`backend/src/resolvers/user.resolver.js:150-156`):

```js
const [affected] = await models.User.update(
  { status: 'Active', approvedAt: now, approvedBy: user.id },
  { where: { id: target.id, status: 'Pending' }, transaction: t }
);
if (affected === 0) throw new Error('This account is not awaiting a decision.');
```

Add a regression test that issues two concurrent `approveUser` calls via `Promise.all` and asserts
exactly one success, one `'This account is not awaiting a decision.'`, one audit row, and one email.

## Warnings

### WR-01: Approve/Reject render ENABLED when `registeredUser` is null, then dereference it — the exact failure mode D-11 exists to prevent

**File:** `frontend/src/pages/ApprovalsPage.jsx:129`, `:80`, `:95`, `:155`, `:168`

**Issue:**
Line 129 computes `const unverified = row.registeredUser && !row.registeredUser.emailVerified;`.
When `registeredUser` is `null`, `&&` short-circuits to `null`, so `disabled={busyId === row.id || unverified}`
evaluates to `null` — falsy — and **both buttons render enabled**. Clicking then hits
`row.registeredUser.id` at line 80 (and line 95), which throws.

The component itself already treats `registeredUser` as nullable three lines earlier
(`row.registeredUser?.name`, `row.registeredUser?.email` at :127-128), so the nullability is
acknowledged and then dropped in the mutation path. Verified empirically with a row whose
`registeredUser` is `null`: the Approve button is **not** disabled, and clicking it renders an
alert containing the raw `TypeError` text while `graphqlRequest` is never called for the mutation.

This is reachable: `fk_invitations_registered_user` is `ON DELETE SET NULL`
(`migrations/manual/016-create-invitations.sql`), so any removal of the user row leaves an
invitation at `status='Registered'` with `registeredUserId = NULL`, which `pendingRegistrations`
still returns.

**Fix:** Fold the missing-account case into the same disabled state and guard the dereference:

```js
const account = row.registeredUser;
const blockedReason = !account
  ? 'This applicant’s account no longer exists.'
  : !account.emailVerified
    ? 'Waiting for the applicant to verify their email address.'
    : '';
// ...
disabled={busyId === row.id || Boolean(blockedReason)}
```

and in both handlers: `if (!row.registeredUser) return;` before the `graphqlRequest` call. Note the
`Boolean(...)` — `disabled` must never receive `null`.

### WR-02: An invitation whose `registeredUserId` is NULL becomes permanently undismissable — behavior regression vs. the deleted `rejectInvitation`

**File:** `backend/src/resolvers/approval.resolver.js:23`, `:56`; surfaced by `backend/src/resolvers/invitation.resolver.js:27`

**Issue:**
The deleted `rejectInvitation` explicitly tolerated a missing user (`if (target) await target.update(...)`)
and still stamped the invitation `Rejected`, clearing it from the queue. The new resolvers are
addressed *only* by user id, so an invitation stuck at `status='Registered'` with
`registeredUserId = NULL` (the `ON DELETE SET NULL` path, WR-01) can never be dispositioned:
`pendingRegistrations` keeps returning it forever, and there is no mutation in the schema that can
move it out of `Registered`. The queue accumulates permanent zombie rows with no operator remedy
short of manual SQL.

**Fix:** Either (a) keep an admin-only escape hatch such as
`dismissInvitation(invitationId: ID!)` that marks an orphaned `Registered` invitation `Expired`, or
(b) change `pendingRegistrations` to exclude orphans and surface them separately:

```js
pendingRegistrations: async (_parent, _args, { models, user }) => {
  requireAdmin(user);
  return models.Invitation.findAll({
    where: { status: 'Registered', registeredUserId: { [Op.ne]: null } },
    order: [['registeredAt', 'DESC']]
  });
}
```

Whichever is chosen, cover it with a test that creates a `Registered` invitation with
`registeredUserId: null`.

### WR-03: `rejectUser` has no authorization test

**File:** `backend/src/resolvers/approveReject.test.js:128-217`

**Issue:**
`describe('approveUser')` includes `it('rejects a non-admin')` (`:68-73`). `describe('rejectUser')`
has no equivalent — there is no test asserting a `USER`-role caller, or an unauthenticated caller,
is refused. `rejectUser` blocks sign-in for an account and writes an audit record; it is exactly as
security-relevant as `approveUser`. Right now `requireAdmin(user)` could be deleted from line 54 and
the entire suite would stay green. This is the same shape as the Phase 14 finding recorded for this
project (green tests, untested non-admin paths, four authz blockers missed).

**Fix:** Mirror the approve test and add the unauthenticated case to both:

```js
it('rejects a non-admin', async () => {
  const { registrant } = await pendingRegistration();
  const member = await createTestUser({ role: 'USER', email: 'member@example.com' });
  const { errors } = await graphql(REJECT, { id: String(registrant.id), reason: 'x' }, member);
  expect(errors[0].message).toBe('Admin access is required.');
  await registrant.reload();
  expect(registrant.status).toBe('Pending');   // assert no side effect, not just the message
});

it('rejects an unauthenticated caller', async () => {
  const { registrant } = await pendingRegistration();
  const { errors } = await graphql(REJECT, { id: String(registrant.id), reason: 'x' }, null);
  expect(errors[0].message).toBe('You must be logged in to perform this action.');
});
```

### WR-04: No test pins the D-07-before-D-08 precondition ordering the phase calls load-bearing

**File:** `backend/src/resolvers/approveReject.test.js:75-84`, `:169-178`; guard at `backend/src/resolvers/approval.resolver.js:9-12`

**Issue:**
`assertDispositionable` deliberately checks `status` before `emailVerified`, and the source comment
(`:5-8`) explains why. But the D-07 tests use `createTestUser({ status: 'Active', emailVerified: true })`
and `{ status: 'Rejected', emailVerified: true }` — accounts that fail *only* the status check — and
the D-08/D-09 tests use `status: 'Pending', emailVerified: false` — accounts that fail *only* the
verification check. No test uses an account that fails **both**, so swapping lines 10 and 11 leaves
the entire suite green while changing the user-facing message on a real, reachable input (a
non-`Pending` account that never verified, e.g. an admin-created `Disabled` account).

**Fix:** Add one discriminating test per mutation:

```js
it('reports the disposition guard, not the verification guard, when both fail (D-07 before D-08)', async () => {
  const account = await createTestUser({ status: 'Rejected', emailVerified: false });
  const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });
  const { errors } = await graphql(APPROVE, { id: String(account.id) }, admin);
  expect(errors[0].message).toBe('This account is not awaiting a decision.');
});
```

### WR-05: Two audit-log assertions race the fire-and-forget write the same file documents as needing polling

**File:** `backend/src/resolvers/approveReject.test.js:64-65`, `:155-156`

**Issue:**
```js
const audits = await models.AuditLog.findAll({ where: { action: 'user.approved' } });
expect(audits).toHaveLength(1);
```
`writeAuditLog` is deliberately not awaited by the resolver (`approval.resolver.js:40`, `:74`), so
the INSERT may still be in flight when the test reads. The same file recognises this and applies
`vi.waitFor` in the two sibling tests, with a comment saying so verbatim
(`:108-115`, `:199-206`) — and explicitly warns that waiting on the *mocked mailer* does not cover
the audit write, which is precisely what these two tests rely on. Two tests got the fix; two did
not. That is a latent intermittent failure under a loaded CI runner, and worse, if the audit write
were to start failing outright these two assertions could still flake *green*.

**Fix:** Apply the same pattern the file already uses:

```js
await vi.waitFor(async () => {
  const audits = await models.AuditLog.findAll({ where: { action: 'user.approved' } });
  expect(audits).toHaveLength(1);
});
```

### WR-06: Migration 019 is an un-runnable, un-verified, un-idempotent hard dependency whose omission is a full outage

**File:** `backend/migrations/manual/019-add-users-approval-columns.sql:24-28`; `backend/src/models/index.js:118-121`

**Issue:**
Three compounding problems:

1. **Failure mode is total, not partial.** `initializeDatabase()` calls bare `sequelize.sync()`,
   which never alters an existing table. Because `User.init` now declares `approvedAt`/`approvedBy`/
   `rejectedAt`/`rejectionReason` (`models/User.js:71-74`), Sequelize includes them in the SELECT
   list of *every* users query — including `getUserFromRequest` and `login`. If the manual step is
   skipped on an already-provisioned database, the backend boots successfully and then fails every
   authenticated request with `Unknown column 'User.approvedAt' in 'field list'`. The blast radius
   is the whole application, not the approvals feature. There is no boot-time column check and no
   `npm run migrate` script in `backend/package.json` (`scripts` are only `dev`/`start`/`check`/`test`).
2. **Not idempotent.** Plain `ADD COLUMN` with no `IF NOT EXISTS`; MySQL 8.4 (the documented prod
   engine) does not support `ADD COLUMN IF NOT EXISTS`, so a re-run errors with `Duplicate column
   name`. An operator who is unsure whether they already ran it has no safe way to find out.
3. **No rollback.** Unlike the forward statements, there is no recorded `DROP COLUMN` counterpart,
   so an aborted deploy has no scripted path back.

**Fix:** At minimum add a fail-fast guard at boot so the failure is one clear message instead of
every request breaking:

```js
export async function initializeDatabase() {
  await sequelize.authenticate();
  await sequelize.sync();
  const [cols] = await sequelize.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
        AND COLUMN_NAME IN ('approvedAt','approvedBy','rejectedAt','rejectionReason')`
  );
  if (cols.length !== 4) {
    throw new Error(
      'users is missing approval columns — run backend/migrations/manual/019-add-users-approval-columns.sql'
    );
  }
}
```

and append a commented rollback plus a pre-flight existence query to the `.sql` file so re-running
is safe to attempt.

### WR-07: The admin-supplied rejection reason is interpolated unescaped into the applicant's HTML email

**File:** `backend/src/resolvers/approval.resolver.js:71` (sink at `backend/src/services/mailer.js:101`)

**Issue:**
`cleanReason` is trimmed but not escaped, then passed straight to `sendAccountRejectedEmail`, which
splices it into an HTML string:

```js
intro: `... not approved at this time.${reason ? `<br /><br /><em>Reason: ${reason}</em>` : ''}`
```

A reason containing `<`, `>`, `&`, or a full tag/anchor is rendered as markup in a message delivered
to a third party (the rejected applicant). The input is admin-controlled, which lowers likelihood but
not impact: it lets one privileged user inject arbitrary markup — including links — into mail that
appears to come from the platform, and it will silently mangle any legitimate reason containing
`&` or `<`. The `reason` field is new to this phase's data flow into a User row that is now the
system of record, so the escaping gap is worth closing here rather than inheriting it.

**Fix:** Escape at the template boundary in `renderHtml`'s callers (or inside `renderHtml`):

```js
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// ...
intro: `... ${reason ? `<br /><br /><em>Reason: ${escapeHtml(reason)}</em>` : ''}`
```

The plaintext `text` branch needs no change.

### WR-08: The invitation is stamped regardless of its current status, via a `findOne` with no ordering

**File:** `backend/src/resolvers/approval.resolver.js:26`, `:33`, `:59`, `:67`

**Issue:**
```js
const invitation = await models.Invitation.findOne({ where: { registeredUserId: target.id } });
// ... later, unconditionally:
await invitation.update({ status: 'Approved', ... }, { transaction: t });
```

Two gaps. First, the invitation's own status is never checked — the deleted `approveInvitation`
required `status === 'Registered'`, and that constraint was dropped rather than relocated. An
invitation already at `Approved`, `Rejected`, or `Expired` will be silently overwritten if it ever
points at a `Pending` user (a state CR-01 can produce, and which any future "re-open an account"
feature would produce by design). Second, `findOne` with no `order` and no unique constraint on
`invitations.registeredUserId` picks an arbitrary row if more than one invitation ever references
the same user — the D-05 "the Invitation is stamped too" contract is only well-defined under an
invariant that nothing enforces.

**Fix:** Constrain the lookup and make the multiplicity explicit:

```js
const invitation = await models.Invitation.findOne({
  where: { registeredUserId: target.id, status: 'Registered' },
  order: [['registeredAt', 'DESC']],
  transaction: t,
  lock: t.LOCK.UPDATE
});
```

Consider adding `UNIQUE KEY uq_invitations_registered_user (registeredUserId)` in a follow-up
migration to make the one-invitation-per-account invariant real.

### WR-09: Neither mutation clears the opposite decision's fields, so a row can carry both an approval and a rejection stamp

**File:** `backend/src/resolvers/approval.resolver.js:31`, `:65`

**Issue:**
`approveUser` writes `{ status, approvedAt, approvedBy }` and `rejectUser` writes
`{ status, rejectedAt, rejectionReason }`; neither nulls the other pair. This is not theoretical —
the CR-01 probe produced a persisted row with `status='Rejected'`, `approvedAt` set **and**
`rejectedAt` set. Anything that later reads these columns (a Phase 32 self-registrant admin view, an
export, a compliance query) cannot tell which decision is authoritative from the columns alone. The
same applies to the Invitation row.

**Fix:** Always write the complete decision tuple, so the row is self-consistent regardless of
history:

```js
// approveUser
await target.update(
  { status: 'Active', approvedAt: now, approvedBy: user.id, rejectedAt: null, rejectionReason: null },
  { transaction: t }
);
// rejectUser
await target.update(
  { status: 'Rejected', rejectedAt: now, rejectionReason: cleanReason, approvedAt: null, approvedBy: null },
  { transaction: t }
);
```

Assert the cleared fields in the existing tests (`expect(account.rejectedAt).toBeNull()` after
approve, and vice versa).

### WR-10: `submitReject` dereferences `rejectTarget` outside the try block — a double-click produces a silent unhandled rejection

**File:** `frontend/src/pages/ApprovalsPage.jsx:89-92`

**Issue:**
```js
const submitReject = async () => {
  const row = rejectTarget;
  setError('');
  setBusyId(row.id);        // line 92 — BEFORE the try
  setRejectTarget(null);
  try { ... } catch (err) { setError(err.message); }
```

The dialog's confirm button remains mounted and clickable during MUI's exit transition after
`setRejectTarget(null)`. A second click during that window (or any future path that invokes
`submitReject` with no target) hits `row.id` with `row === null`. Because line 92 sits *before*
`try`, the `catch` cannot see it: the async function returns a rejected promise, `onClick` discards
it, and the user gets an unhandled promise rejection with **no** error alert and no state
recovery — `busyId` is never set and `finally` never runs.

**Fix:** Guard first, and move the whole body inside the try:

```js
const submitReject = async () => {
  const row = rejectTarget;
  if (!row?.registeredUser) return;
  setError('');
  setBusyId(row.id);
  setRejectTarget(null);
  try { ... }
```

## Info

### IN-01: Audit action rename breaks approval-history continuity with no backfill or dual-read

**File:** `backend/src/resolvers/approval.resolver.js:41`, `:75`

**Issue:** Actions changed from `invitation.approved`/`invitation.rejected` to
`user.approved`/`user.rejected`. No consumer breaks today (no query or UI filters on `action`), but
the append-only trail is now split across two vocabularies for the same real-world event, and
nothing records the cutover.
**Fix:** Add a short note to the phase docs mapping old to new action names, or backfill existing
rows, so a future audit view knows to read both.

### IN-02: The unverified condition is recomputed inline instead of reusing the `unverified` const

**File:** `frontend/src/pages/ApprovalsPage.jsx:136` (const defined at `:129`)

**Issue:** `row.registeredUser && !row.registeredUser.emailVerified` is duplicated for the Chip.
Two copies of one predicate is how the WR-01 null case ends up fixed in one place and not the other.
**Fix:** `{unverified && <Chip label="Email unverified" ... />}` — and after WR-01, derive both the
Chip and the disabled state from a single `blockedReason`.

### IN-03: The four newly stamped User fields are not exposed by any query

**File:** `backend/src/schemas/user.schema.js:15-24`; written at `backend/src/resolvers/approval.resolver.js:31`, `:65`

**Issue:** `approvedAt`/`approvedBy`/`rejectedAt`/`rejectionReason` are write-only from the API's
perspective. That is defensible today (the model comment calls it "storage only"), but D-04's stated
purpose is to let a Phase 32 self-registrant carry its own decision — which is unreachable until
these are readable.
**Fix:** When Phase 32 lands, add admin-gated fields to `type User` (keep `rejectionReason`
admin-only; it is internal justification, not applicant-facing).

### IN-04: `reason` has no length bound before hitting a `TEXT` column

**File:** `backend/src/schemas/approval.schema.js:4`; `backend/src/resolvers/approval.resolver.js:61`

**Issue:** `cleanReason` is trimmed but unbounded. A reason over 65,535 bytes surfaces a raw
Sequelize/MySQL `Data too long for column 'rejectionReason'` to the admin, and any long reason is
echoed verbatim into an outbound email.
**Fix:** Validate alongside the trim, e.g.
`if (cleanReason && cleanReason.length > 1000) throw new Error('Reason is too long (1000 characters max).');`
and add `inputProps={{ maxLength: 1000 }}` to the dialog's `TextField`.

### IN-05: `pendingRegistrations` is still invitation-scoped while disposition is account-scoped

**File:** `backend/src/resolvers/invitation.resolver.js:25-28`; `backend/src/schemas/invitation.schema.js:44-46`

**Issue:** `approveUser` accepts any `Pending` + verified user, but the admin queue only lists
invitations at `status='Registered'`. The two sets already differ (an admin-created `Pending`
account is approvable but never listed), and will diverge fully for Phase 32 self-registrants.
**Fix:** Plan the queue's move to a `User`-scoped query
(`where: { status: 'Pending', emailVerified: true }` with the invitation joined as optional
context); leave a `TODO(Phase 32)` on the resolver so the coupling is not forgotten.

### IN-06: `users.approvedBy` has no FK while `invitations.approvedBy` does — the two rows will diverge

**File:** `backend/migrations/manual/019-add-users-approval-columns.sql:26`; `backend/migrations/manual/016-create-invitations.sql` (`fk_invitations_approved_by ... ON DELETE SET NULL`)

**Issue:** The omission is deliberate and documented (matching the 015/018 ALTER precedent), but it
has a consequence the comment does not mention: if an approving admin's row is ever deleted,
`invitations.approvedBy` becomes `NULL` while `users.approvedBy` retains a dangling id — silently
breaking D-05's "both rows carry identical values" invariant. No user-deletion path exists in the
API today, so this is latent.
**Fix:** Note the divergence in the migration comment, and add the FK in a follow-up migration if a
user-deletion feature is ever introduced.

---

_Reviewed: 2026-08-28T07:46:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

---

## Resolution Log (post-review, Phase 30 execution)

Fixed during the execute-phase code review gate, test-first in each case:

| ID | Status | Commit | Evidence |
|----|--------|--------|----------|
| CR-01 | Fixed | `35306b9` | Two regression tests failed before the change (both concurrent approves succeeded, both concurrent rejects succeeded) and pass deterministically across repeated runs after it. Read + guard moved inside the transaction under `lock: t.LOCK.UPDATE`. |
| WR-01 | Fixed | `090ffe6` | Test asserting both buttons disabled for a `registeredUser: null` row failed before, passes after. Guard split into `unverified` / `orphaned` / `blocked`, each with its own tooltip. |
| WR-05 | Fixed | `ce48cc8` | The unguarded `AuditLog` reads began failing once CR-01's locked reads shifted timing — confirming the flake was real, not phantom. All four now poll via `vi.waitFor`. |
| WR-09 | Closed by construction | `35306b9` | Was only reachable *through* CR-01. With the account transitioning out of `Pending` only under the row lock, a stale opposite decision can no longer survive. |

Full suite after fixes: backend 421 passed / 2 skipped (63 files), frontend 440 passed (42 files), build clean.

The remaining 8 warnings and 6 info findings are open and tracked in the sections above.
