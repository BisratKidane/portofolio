# Phase 30: Approval Moves to the Account - Pattern Map

**Mapped:** 2026-08-27
**Files analyzed:** 11 (3 new, 8 modified)
**Analogs found:** 11 / 11 — this is a brownfield relocation; every new file's analog is the code it is replacing or a direct sibling in the same directory.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `backend/src/resolvers/approval.resolver.js` (new) | resolver | request-response (CRUD-ish: read-guard-transactional-update) | `backend/src/resolvers/invitation.resolver.js:78-139` (`approveInvitation`/`rejectInvitation`) | exact — verbatim code relocation with a re-targeted lookup key |
| `backend/src/schemas/approval.schema.js` (new) | route/schema (GraphQL SDL) | request-response | `backend/src/schemas/invitation.schema.js` (whole file, esp. lines 49-53) + `backend/src/schemas/user.schema.js:66-67` (return-type precedent) | exact |
| `backend/migrations/manual/019-add-users-approval-columns.sql` (new) | migration | batch (one-time DDL) | `backend/migrations/manual/015-add-users-status.sql` (ALTER on `users`) + `018-add-family-members-geez-names.sql` (ALTER-on-existing-table house style/header) | exact |
| `backend/src/resolvers/invitation.resolver.js` (modified — delete 2 mutations) | resolver | request-response | itself (current state, lines 78-139 to remove) | exact |
| `backend/src/schemas/invitation.schema.js` (modified — delete 2 SDL lines) | schema | request-response | itself (current state, lines 51-52 to remove) | exact |
| `backend/src/resolvers/index.js` (modified — barrel) | route (aggregator) | request-response | itself (current 5-line file) | exact |
| `backend/src/schemas/index.js` (modified — barrel) | route (aggregator) | request-response | itself (current 5-line file) | exact |
| `backend/src/models/User.js` (modified — +4 fields) | model | CRUD | `backend/src/models/Invitation.js:19-22` (the four fields being mirrored) | exact |
| `backend/src/resolvers/approveReject.test.js` (modified — rewrite in place) | test | request-response (integration) | itself (current 134-line file — full structure kept, mutation names/lookups changed) | exact |
| `frontend/src/pages/ApprovalsPage.jsx` (modified — rewire mutations + D-11 disabled state) | component | request-response | itself (current file) + `frontend/src/components/manage/AdminMemberTable.jsx:142-151` (Tooltip-wrapped disabled-control idiom for D-11) | exact (self) + role-match (Tooltip idiom) |
| `frontend/src/pages/ApprovalsPage.test.jsx` (modified — rewrite + new cases) | test | request-response (component) | itself (current 83-line file) | exact |

## Pattern Assignments

### `backend/src/resolvers/approval.resolver.js` (resolver, request-response)

**Analog:** `backend/src/resolvers/invitation.resolver.js:78-139` (this IS the code being moved, not merely a similar pattern)

**Imports pattern** (mirror `invitation.resolver.js:1-4`, trim to what the new module actually calls):
```javascript
import { requireAdmin } from '../utils/auth.js';
import { writeAuditLog } from '../utils/audit.js';
import { sendAccountApprovedEmail, sendAccountRejectedEmail } from '../services/mailer.js';
```
Note: `invitation.resolver.js` also imports `requireFamilyAccess`, `createInvitationToken`, `hashInvitationToken`, `invitationExpiry`, `env`, and `sendInvitationEmail` — none of those are needed here; only pull what `approveUser`/`rejectUser` actually call. No local helper like `blankToNull` is needed for this module.

**Auth pattern** (verbatim, `invitation.resolver.js:79` and `:108` — `requireAdmin` is always the first line of the resolver body):
```javascript
requireAdmin(user);
```

**Core pattern — the exact code being relocated and re-targeted** (`invitation.resolver.js:78-139`):
```javascript
approveInvitation: async (_parent, { invitationId }, { models, user }) => {
  requireAdmin(user);
  const invitation = await models.Invitation.findByPk(invitationId);
  if (!invitation) throw new Error('Invitation not found.');
  if (invitation.status !== 'Registered') throw new Error('This registration is not awaiting approval.');

  const target = invitation.registeredUserId ? await models.User.findByPk(invitation.registeredUserId) : null;
  if (!target) throw new Error('The registered user no longer exists.');

  const sequelize = models.User.sequelize;
  await sequelize.transaction(async (t) => {
    await target.update({ status: 'Active' }, { transaction: t });
    await invitation.update({ status: 'Approved', approvedAt: new Date(), approvedBy: user.id }, { transaction: t });
  });

  sendAccountApprovedEmail({ to: target.email, name: target.name }).catch((err) =>
    console.error('Failed to send approval email:', err)
  );
  writeAuditLog(models, {
    action: 'invitation.approved',
    actorUserId: user.id,
    invitationId: invitation.id,
    targetUserId: target.id
  }).catch((err) => console.error('Failed to write audit log:', err));

  return invitation;
},
rejectInvitation: async (_parent, { invitationId, reason }, { models, user }) => {
  requireAdmin(user);
  const invitation = await models.Invitation.findByPk(invitationId);
  if (!invitation) throw new Error('Invitation not found.');
  if (invitation.status !== 'Registered') throw new Error('This registration is not awaiting approval.');

  const target = invitation.registeredUserId ? await models.User.findByPk(invitation.registeredUserId) : null;
  const cleanReason = typeof reason === 'string' && reason.trim() ? reason.trim() : null;

  const sequelize = models.User.sequelize;
  await sequelize.transaction(async (t) => {
    if (target) await target.update({ status: 'Rejected' }, { transaction: t });
    await invitation.update(
      { status: 'Rejected', rejectedAt: new Date(), rejectionReason: cleanReason },
      { transaction: t }
    );
  });

  if (target) {
    sendAccountRejectedEmail({ to: target.email, name: target.name, reason: cleanReason }).catch((err) =>
      console.error('Failed to send rejection email:', err)
    );
  }
  writeAuditLog(models, {
    action: 'invitation.rejected',
    actorUserId: user.id,
    invitationId: invitation.id,
    targetUserId: target?.id ?? null,
    metadata: { reason: cleanReason }
  }).catch((err) => console.error('Failed to write audit log:', err));

  return invitation;
}
```

**Re-target instructions (from RESEARCH.md, confirmed against the excerpt above), applied line-by-line:**
1. Entry point becomes `models.User.findByPk(userId)` first — this is `target`; no "no longer exists" indirection since the lookup starts here, not from an invitation.
2. Replace `if (invitation.status !== 'Registered') throw ...` with D-07's guard: `if (target.status !== 'Pending') throw new Error('This account is not awaiting a decision.');`
3. Insert D-08/D-09's guard immediately after (RESEARCH.md's recommended shared helper — see Shared Patterns below): `if (!target.emailVerified) throw new Error(<wording is Claude's Discretion>);` — one guard function called from both mutations (D-09: "one symmetric rule").
4. Invitation lookup becomes optional/secondary and moves *after* the two guards: `const invitation = await models.Invitation.findOne({ where: { registeredUserId: target.id } });` (may be `null` — this is the normal case for Phase 32 self-registrants, not an error).
5. Inside the transaction, update `target` first (unchanged order — D-05), then wrap the invitation update in `if (invitation) { await invitation.update(...) }` — this conditional idiom already exists verbatim in `rejectInvitation`'s `if (target) await target.update(...)` at `invitation.resolver.js:118`; mirror it for the invitation side instead.
6. Audit action strings become `'user.approved'` / `'user.rejected'` (D-06); `invitationId: invitation?.id ?? null` (was always non-null before, now genuinely optional).
7. `return target;` in both mutations (D-02) — not `return invitation;`.
8. Guard order overall (per RESEARCH.md's Anti-Patterns section): `requireAdmin` → not-found (`if (!target) throw new Error('User not found.')` — new, since `findByPk` can return null) → `status !== 'Pending'` → `!emailVerified`. Do NOT check `emailVerified` before `status` — a repeat-click on an already-decided account must get the D-07 message, not the verification message.

**Error handling pattern:** plain `throw new Error('...')` with user-facing text, exactly as above — no custom error classes, no wrapping. Matches CONVENTIONS.md "Error Handling" section.

**Fire-and-forget side effects pattern** (copy verbatim from the excerpt above): both email dispatch and `writeAuditLog` are called *without* `await`, chained with `.catch((err) => console.error('Failed to ... :', err))`, so a mail/audit failure never fails the mutation response.

---

### `backend/src/schemas/approval.schema.js` (schema, request-response)

**Analog:** `backend/src/schemas/invitation.schema.js` (whole-file structure) + `backend/src/schemas/user.schema.js:66-67` (return-type precedent for D-02)

**Whole-file skeleton to copy the shape of** (`invitation.schema.js:1,41,49-54`):
```javascript
export const invitationTypeDefs = `#graphql
  ...
  extend type Mutation {
    createInvitation(input: CreateInvitationInput!): CreateInvitationResult!
    approveInvitation(invitationId: ID!): Invitation!
    rejectInvitation(invitationId: ID!, reason: String): Invitation!
  }
`;
```
The new module has no types/enums/queries of its own — only two mutations — so it should follow the same `extend type Mutation { ... }` pattern with no other blocks, matching how `familyMember.schema.js` and `invitation.schema.js` both `extend` rather than redeclare `Mutation`/`Query` (only `user.schema.js` owns the base type declarations, per `user.schema.js:58`).

**Return-type precedent (D-02)** — `backend/src/schemas/user.schema.js:66-67`:
```javascript
linkUserToMember(userId: ID!, memberId: ID, newMember: NewFamilyMemberInput): User!
updateUser(id: ID!, input: UpdateUserInput!): User!
```
`approveUser`/`rejectUser` must return `User!` the same way — not a new payload type, not `Boolean`.

**Recommended SDL (per RESEARCH.md's "Barrel Registration Mechanics" section, already vetted against this exact pattern):**
```graphql
extend type Mutation {
  approveUser(userId: ID!): User!
  rejectUser(userId: ID!, reason: String): User!
}
```

---

### `backend/migrations/manual/019-add-users-approval-columns.sql` (migration, batch)

**Analog:** `backend/migrations/manual/015-add-users-status.sql` (ALTER on the exact same `users` table) + `018-add-family-members-geez-names.sql` (header-comment house style for ALTER-on-existing-table migrations)

**Header comment convention to copy** (`018-add-family-members-geez-names.sql:1-8`):
```sql
-- Manual, one-time migration (Phase 18 / DATA-01, DATA-02).
--
-- This is NOT applied automatically by sequelize.sync() -- sync() creates
-- tables on brand-new databases but never alters an existing table's
-- columns. Any already-provisioned database (local dev, staging, prod)
-- must have these statements run by hand, once, before booting a backend
-- that expects the [...] columns to exist.
```

**ALTER TABLE shape to copy** (`015-add-users-status.sql:10-11`, same target table):
```sql
ALTER TABLE users
  ADD COLUMN status ENUM('Pending', 'Active', 'Rejected', 'Disabled') NOT NULL DEFAULT 'Pending';
```
No `IF NOT EXISTS` guard on `ADD COLUMN` — confirmed convention (015, 018 both bare `ALTER TABLE ... ADD COLUMN`, relying on "manual, one-time" discipline rather than DDL idempotency).

**Column types precedent** — `Invitation.js`'s four fields being mirrored, and `016-create-invitations.sql:18-21` (the equivalent columns' SQL types on `invitations`):
```sql
approvedAt DATETIME NULL DEFAULT NULL,
rejectedAt DATETIME NULL DEFAULT NULL,
approvedBy INT UNSIGNED NULL DEFAULT NULL,
rejectionReason TEXT NULL DEFAULT NULL,
```
Recommended `019-*.sql` body (per RESEARCH.md's explicit recommendation — plain int, no FK, matching the ALTER-on-existing-table precedent rather than `invitations.approvedBy`'s CREATE-TABLE-time FK at `016-create-invitations.sql:33-34`):
```sql
ALTER TABLE users
  ADD COLUMN approvedAt DATETIME NULL DEFAULT NULL,
  ADD COLUMN approvedBy INT UNSIGNED NULL DEFAULT NULL,
  ADD COLUMN rejectedAt DATETIME NULL DEFAULT NULL,
  ADD COLUMN rejectionReason TEXT NULL DEFAULT NULL;
```
No portability hazard for this migration (unlike `018`'s utf8mb4 collation concern) — plain DATETIME/INT/TEXT types apply unchanged to both MariaDB and MySQL 8.4.

**Numbering:** highest existing file is `018-add-family-members-geez-names.sql`; `019-` is next, no gap/collision (confirmed by directory listing).

---

### `backend/src/models/User.js` (model, CRUD)

**Analog:** `backend/src/models/Invitation.js:19-22` (the four fields being mirrored)

**Field declaration pattern to copy** (`Invitation.js:19-22`):
```javascript
approvedAt: { type: DataTypes.DATE, allowNull: true },
rejectedAt: { type: DataTypes.DATE, allowNull: true },
rejectionReason: { type: DataTypes.TEXT, allowNull: true },
```

**Where to insert in `User.js`** — alongside the existing `status` field (`User.js:53-60`):
```javascript
// Account lifecycle for invitation-based access. Only 'Active' users may
// authenticate. New registrations start 'Pending' (awaiting admin
// approval); existing users are backfilled 'Active' by migration 015.
status: {
  type: DataTypes.ENUM('Pending', 'Active', 'Rejected', 'Disabled'),
  allowNull: false,
  defaultValue: 'Pending'
}
```

**Important nuance (confirmed by reading `Invitation.js` + `models/index.js:77-82`):** `Invitation.js` does NOT declare `approvedBy` as a plain field in the model file — it arrives via the `Invitation.belongsTo(User, { as: 'approver', foreignKey: { name: 'approvedBy', allowNull: true } })` association declared in `models/index.js:77-82`. Since CONTEXT.md leaves the FK-vs-plain-int choice to Claude's Discretion, and RESEARCH.md recommends the plain-int, no-FK option (matching the `015`/`018` ALTER-on-existing-table precedent), the new `users.approvedBy` should be declared as a **plain field directly in `User.js`** (same syntax as `approvedAt`/`rejectedAt`/`rejectionReason`, e.g. `approvedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true }`) — NOT via a new self-referential association in `models/index.js`. A plain int column with no FK needs no Sequelize association machinery.

---

### `backend/src/resolvers/index.js` / `backend/src/schemas/index.js` (barrel/aggregator, request-response)

**Analog:** themselves — the entire pattern is visible in the current 5-line files.

**Current state, `backend/src/resolvers/index.js` (all 5 lines):**
```javascript
import { userResolvers } from './user.resolver.js';
import { familyMemberResolvers } from './familyMember.resolver.js';
import { invitationResolvers } from './invitation.resolver.js';

export const resolvers = [userResolvers, familyMemberResolvers, invitationResolvers];
```

**Current state, `backend/src/schemas/index.js` (all 5 lines):**
```javascript
import { userTypeDefs } from './user.schema.js';
import { familyMemberTypeDefs } from './familyMember.schema.js';
import { invitationTypeDefs } from './invitation.schema.js';

export const typeDefs = [userTypeDefs, familyMemberTypeDefs, invitationTypeDefs];
```

**Required change:** add one import line + one array entry to each — `import { approvalResolvers } from './approval.resolver.js';` / `import { approvalTypeDefs } from './approval.schema.js';`, appended to the respective arrays. This is the entire integration mechanism; both barrels are consumed by exactly one place, `backend/src/graphql/serverConfig.js`, which both `backend/src/server.js` (real boot) and `backend/test/helpers.js` (test harness) import from — no second wiring path to miss.

---

### `backend/src/resolvers/approveReject.test.js` (test, request-response/integration)

**Analog:** itself — the file being rewritten in place, structure kept, mutation names/lookups changed.

**Test infra imports to keep (`approveReject.test.js:1-11`):**
```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../services/mailer.js', async (importOriginal) => ({
  ...(await importOriginal()),
  sendAccountApprovedEmail: vi.fn().mockResolvedValue(undefined),
  sendAccountRejectedEmail: vi.fn().mockResolvedValue(undefined)
}));

import { sendAccountApprovedEmail, sendAccountRejectedEmail } from '../services/mailer.js';
import { graphql, resetTables, createTestUser } from '../../test/helpers.js';
import { models } from '../models/index.js';
```

**Mutation string constants to retarget (`approveReject.test.js:13-14`):**
```javascript
// OLD:
const APPROVE = `mutation A($id: ID!) { approveInvitation(invitationId: $id) { id status } }`;
const REJECT = `mutation R($id: ID!, $reason: String) { rejectInvitation(invitationId: $id, reason: $reason) { id status rejectionReason } }`;
// NEW shape (userId argument, User fields in selection set):
const APPROVE = `mutation A($id: ID!) { approveUser(userId: $id) { id status } }`;
const REJECT = `mutation R($id: ID!, $reason: String) { rejectUser(userId: $id, reason: $reason) { id status } }`;
```
Note: the old `REJECT` selects `rejectionReason` on `Invitation` — the new `User` type has no `rejectionReason` field (`user.schema.js:14-24` does not declare it), so the rewritten test must assert the reason via `models.User` reload or the `AuditLog.metadata`, not via the mutation's return selection.

**Fixture/seeding helper to keep, adjusting the assertion target (`approveReject.test.js:18-32`):**
```javascript
async function pendingRegistration(email = 'newbie@example.com') {
  const inviter = await createTestUser({ role: 'ADMIN', email: `inviter-${email}` });
  const registrant = await createTestUser({ email, name: 'Newbie', status: 'Pending', emailVerified: true });
  const invitation = await models.Invitation.create({
    tokenHash: `hash-${email}`,
    inviterId: inviter.id,
    invitedEmail: email,
    relationshipToFamily: 'cousin',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    status: 'Registered',
    registeredAt: new Date(),
    registeredUserId: registrant.id
  });
  return { inviter, registrant, invitation };
}
```
Calls under test now pass `{ id: String(registrant.id) }` (was `{ id: String(invitation.id) }`) — this is the change that actually proves D-01's account-id cutover.

**DB isolation pattern (unchanged, `approveReject.test.js:34-37`):**
```javascript
beforeEach(async () => {
  await resetTables();
  vi.clearAllMocks();
});
```

**Fire-and-forget assertion pattern (unchanged, `approveReject.test.js:54-58`):**
```javascript
await vi.waitFor(() => expect(sendAccountApprovedEmail).toHaveBeenCalledTimes(1));
expect(sendAccountApprovedEmail.mock.calls[0][0].to).toBe('newbie@example.com');

const audits = await models.AuditLog.findAll({ where: { action: 'invitation.approved' } });
expect(audits).toHaveLength(1);
```
Retarget the `action` filter to `'user.approved'`/`'user.rejected'` (D-06); the `vi.waitFor` wrapper stays because the resolver still fires email/audit without awaiting.

**Non-admin / precondition assertion pattern to keep and add to (`approveReject.test.js:61-66,68-80`):**
```javascript
it('rejects a non-admin', async () => {
  const { invitation } = await pendingRegistration();
  const member = await createTestUser({ role: 'USER', email: 'member@example.com' });
  const { errors } = await graphql(APPROVE, { id: String(invitation.id) }, member);
  expect(errors[0].message).toBe('Admin access is required.');
});
```
This exact shape (seed → call as wrong-role user → assert `errors[0].message`) is the template for the two NEW guard tests: D-07 (approve/reject an `Active`/`Rejected` account → `'This account is not awaiting a decision.'`) and D-08/D-09 (approve/reject a `Pending` + `emailVerified: false` account → the new verification-required message). Build the unverified fixture by calling `pendingRegistration()` with an override, or a small variant helper, since the existing helper hardcodes `emailVerified: true` at line 20.

**Login-gate regression check to keep verbatim (`approveReject.test.js:107-115`):**
```javascript
it('blocks a rejected user from logging in', async () => {
  const { invitation } = await pendingRegistration('blocked@example.com');
  const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });
  await graphql(REJECT, { id: String(invitation.id), reason: null }, admin);

  const login = `mutation($e:String!,$p:String!){ login(email:$e,password:$p){ token } }`;
  const { errors } = await graphql(login, { e: 'blocked@example.com', p: 'Password123!' });
  expect(errors[0].message).toBe('Your registration was not approved.');
});
```
Only the `REJECT` call's variable (`id: String(invitation.id)` → `id: String(registrant.id)`) needs to change; the login-gate assertion string is untouched (this login resolver is out of scope, per RESEARCH.md's Risks section).

**`pendingRegistrations query` describe block (`approveReject.test.js:118-134`) stays in this file unchanged** — D-10 confirms this query does not move, and it lives in `invitation.resolver.js`, not the new module; RESEARCH.md's Open Questions section explicitly resolves this in favor of "stays in `invitation.resolver.js`/`invitation.schema.js` exactly where it is today."

**New test needed — no-invitation path (Phase 32 precursor):** none of the existing fixtures create a `Pending` + verified `User` row with zero `Invitation` rows. Build this directly with `createTestUser({ status: 'Pending', emailVerified: true })` (skip the `models.Invitation.create(...)` call entirely) and assert the mutation succeeds with `invitationId: null` in the resulting audit row.

---

### `frontend/src/pages/ApprovalsPage.jsx` (component, request-response)

**Analog:** itself (current file, full read) + `frontend/src/components/manage/AdminMemberTable.jsx:142-151` for the D-11 disabled-control idiom.

**Mutation strings and call sites to rewrite (`ApprovalsPage.jsx:38-39,75-86,88-102`):**
```javascript
// OLD:
const APPROVE = `mutation Approve($id: ID!) { approveInvitation(invitationId: $id) { id status } }`;
const REJECT = `mutation Reject($id: ID!, $reason: String) { rejectInvitation(invitationId: $id, reason: $reason) { id status } }`;
// ...
await graphqlRequest(APPROVE, { id: row.id });
// ...
await graphqlRequest(REJECT, { id: row.id, reason: rejectReason || null });
```
```javascript
// NEW:
const APPROVE = `mutation Approve($id: ID!) { approveUser(userId: $id) { id status } }`;
const REJECT = `mutation Reject($id: ID!, $reason: String) { rejectUser(userId: $id, reason: $reason) { id status } }`;
// ...
await graphqlRequest(APPROVE, { id: row.registeredUser.id });
// ...
await graphqlRequest(REJECT, { id: row.registeredUser.id, reason: rejectReason || null });
```
Note `busyId`/`rejectTarget` state still key off `row.id` (the invitation id) for UI bookkeeping (button disabled-while-busy, dialog target) — only the *mutation variables* switch to `row.registeredUser.id`. D-10 confirms no query change: `PENDING_QUERY` (`ApprovalsPage.jsx:23-36`) already fetches `registeredUser { id name email emailVerified }` — every field D-10/D-11 need is already present.

**Existing "unverified" visual idiom already in this file to extend, not replace (`ApprovalsPage.jsx:134-136`):**
```javascript
{row.registeredUser && !row.registeredUser.emailVerified && (
  <Chip label="Email unverified" size="small" color="warning" variant="outlined" />
)}
```
This Chip already exists and already fires on exactly the condition D-11 needs (`row.registeredUser.emailVerified === false`) — it currently only labels the row; it does not yet disable the buttons. D-11 needs the Approve/Reject `Button`s' `disabled` prop extended with this same condition.

**Disabled-control-with-explanation idiom to copy from elsewhere in the codebase** (`AdminMemberTable.jsx:142-150` — this is the established "Tooltip wraps a disabled/stateful control to explain why" pattern in this MUI codebase):
```javascript
<Tooltip title={member.isAlive !== false ? 'Living — click to mark deceased' : 'Deceased — click to mark living'}>
  <Switch
    size="small"
    checked={member.isAlive !== false}
    onChange={() => onToggleAlive && onToggleAlive(member)}
    inputProps={{ 'aria-label': `Toggle living status for ${member.fullname}` }}
  />
</Tooltip>
```
Recommended application to the Approve/Reject `Button`s (`ApprovalsPage.jsx:146-165`), matching both this Tooltip idiom and the existing Chip already in the file:
```javascript
const unverified = row.registeredUser && !row.registeredUser.emailVerified;
// ...
<Tooltip title={unverified ? 'Waiting for the applicant to verify their email address.' : ''}>
  <span>
    <Button
      variant="contained"
      color="success"
      startIcon={<CheckCircleRoundedIcon />}
      disabled={busyId === row.id || unverified}
      onClick={() => handleApprove(row)}
    >
      Approve
    </Button>
  </span>
</Tooltip>
```
(The `<span>` wrapper around a `disabled` MUI `Button` inside `Tooltip` is required by MUI so the tooltip still fires on a disabled control — standard MUI idiom, not something this codebase has needed before now since `AdminMemberTable.jsx`'s `Switch` is never `disabled`, only its `checked` state toggles; flag this as new-but-standard MUI usage for the planner, not an invented pattern.) Exact copy wording ("Waiting for the applicant to verify their email address.") is Claude's Discretion per CONTEXT.md.

**Data-loading / error-handling pattern (unchanged, keep verbatim) — `ApprovalsPage.jsx:65-73`:**
```javascript
const load = useCallback(() => {
  return graphqlRequest(PENDING_QUERY)
    .then((data) => setRows(data.pendingRegistrations))
    .catch((err) => setError(err.message));
}, []);

useEffect(() => {
  load();
}, [load]);
```

**Async handler try/catch/finally pattern (unchanged, keep verbatim) — `ApprovalsPage.jsx:75-86`:**
```javascript
const handleApprove = async (row) => {
  setError('');
  setBusyId(row.id);
  try {
    await graphqlRequest(APPROVE, { id: row.id }); // becomes row.registeredUser.id
    await load();
  } catch (err) {
    setError(err.message);
  } finally {
    setBusyId(null);
  }
};
```
Matches CONVENTIONS.md's frontend error-handling section exactly (`try/catch/finally`, error into local state, `finally` always resets loading/busy state).

---

### `frontend/src/pages/ApprovalsPage.test.jsx` (test, component/request-response)

**Analog:** itself (current 83-line file, full read).

**Mocking setup to keep verbatim (`ApprovalsPage.test.jsx:1-10`):**
```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ApprovalsPage from './ApprovalsPage.jsx';

vi.mock('../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));

import { graphqlRequest } from '../api/graphqlClient.js';
```

**Fixture already has the distinct-id property the rewritten assertions need (`ApprovalsPage.test.jsx:12-21`):**
```javascript
const ROW = {
  id: '5',
  invitedName: 'Cousin Joe',
  invitedEmail: 'joe@example.com',
  relationshipToFamily: 'cousin',
  invitationNote: 'Met at the reunion',
  registeredAt: '1700000000000',
  inviter: { id: '2', name: 'Aunt May' },
  registeredUser: { id: '9', name: 'Joseph Q', email: 'joe@example.com', emailVerified: true }
};
```
`ROW.id` (`'5'`, the invitation id) and `ROW.registeredUser.id` (`'9'`) are already distinct — this makes the rewritten assertion meaningful: asserting the mutation is called with `{ id: '9' }` definitively proves the account-id cutover, not a coincidence of matching fixture values.

**Mutation-call assertion pattern to retarget (`ApprovalsPage.test.jsx:44-58`):**
```javascript
// OLD:
graphqlRequest
  .mockResolvedValueOnce({ pendingRegistrations: [ROW] })
  .mockResolvedValueOnce({ approveInvitation: { id: '5', status: 'Approved' } })
  .mockResolvedValueOnce({ pendingRegistrations: [] });
// ...
await waitFor(() => {
  expect(graphqlRequest).toHaveBeenCalledWith(expect.stringContaining('approveInvitation'), { id: '5' });
});
```
```javascript
// NEW:
graphqlRequest
  .mockResolvedValueOnce({ pendingRegistrations: [ROW] })
  .mockResolvedValueOnce({ approveUser: { id: '9', status: 'Active' } })
  .mockResolvedValueOnce({ pendingRegistrations: [] });
// ...
await waitFor(() => {
  expect(graphqlRequest).toHaveBeenCalledWith(expect.stringContaining('approveUser'), { id: '9' });
});
```
Same retarget for the reject test (`ApprovalsPage.test.jsx:61-82`): `rejectInvitation` → `rejectUser`, `{ id: '5', reason: ... }` → `{ id: '9', reason: ... }`, mocked resolved value `{ rejectInvitation: {...} }` → `{ rejectUser: {...} }`.

**Rendering pattern (unchanged, keep verbatim) — standard RTL/`user-event`, no custom render wrapper needed** (`ApprovalsPage.test.jsx:28-42`):
```javascript
it('lists pending registrations with inviter, relationship, and note', async () => {
  graphqlRequest.mockResolvedValueOnce({ pendingRegistrations: [ROW] });
  render(<ApprovalsPage />);

  expect(await screen.findByText('Joseph Q')).toBeInTheDocument();
  // ...
});
```

**New test needed — D-11 disabled/waiting state:** add a second fixture variant, e.g. `const UNVERIFIED_ROW = { ...ROW, registeredUser: { ...ROW.registeredUser, emailVerified: false } };`, render with it, and assert (a) the existing `"Email unverified"` Chip text renders (already covered by the Chip already in `ApprovalsPage.jsx:135`) and (b) the Approve/Reject buttons are disabled — RTL: `expect(screen.getByRole('button', { name: /approve/i })).toBeDisabled();`.

## Shared Patterns

### Admin-only server-side guard
**Source:** `backend/src/utils/auth.js:42-45`
```javascript
export function requireAdmin(user) {
  requireAuth(user);
  if (user.role !== 'ADMIN') throw new Error('Admin access is required.');
}
```
**Apply to:** `approval.resolver.js`'s `approveUser` and `rejectUser`, called synchronously as the first line of each resolver body — reused verbatim, zero changes to `auth.js` needed.

### Transactional dual-row update
**Source:** `backend/src/resolvers/invitation.resolver.js:87-91` and `:116-123`
```javascript
const sequelize = models.User.sequelize;
await sequelize.transaction(async (t) => {
  await target.update({ status: 'Active' }, { transaction: t });
  await invitation.update({ status: 'Approved', approvedAt: new Date(), approvedBy: user.id }, { transaction: t });
});
```
**Apply to:** `approval.resolver.js` — same `models.User.sequelize.transaction(...)` call, `target` (User) updated before `invitation` (now optional, wrapped in `if (invitation)`), preserving D-05's exact order.

### Fire-and-forget email + audit
**Source:** `backend/src/resolvers/invitation.resolver.js:93-101` and `:125-136`
```javascript
sendAccountApprovedEmail({ to: target.email, name: target.name }).catch((err) =>
  console.error('Failed to send approval email:', err)
);
writeAuditLog(models, {
  action: 'invitation.approved',
  actorUserId: user.id,
  invitationId: invitation.id,
  targetUserId: target.id
}).catch((err) => console.error('Failed to write audit log:', err));
```
**Apply to:** `approval.resolver.js` — identical shape, `action` renamed per D-06, `invitationId: invitation?.id ?? null` since the lookup is now optional. `writeAuditLog`'s destructured defaults (`backend/src/utils/audit.js:5-9`, `invitationId = null`, `targetUserId = null`) already tolerate this without any helper change.

### Plain-Error resolver error handling
**Source:** `backend/src/resolvers/invitation.resolver.js:81-82,110-111` (and broadly, `backend/src/resolvers/user.resolver.js`)
```javascript
if (!invitation) throw new Error('Invitation not found.');
if (invitation.status !== 'Registered') throw new Error('This registration is not awaiting approval.');
```
**Apply to:** every new guard in `approval.resolver.js` (not-found, D-07 status check, D-08/D-09 verification check) — plain `throw new Error('user-facing message')`, no custom error class, no status codes; Apollo surfaces these directly.

### Barrel registration
**Source:** `backend/src/resolvers/index.js` (5 lines) and `backend/src/schemas/index.js` (5 lines), quoted in full above.
**Apply to:** register `approvalResolvers`/`approvalTypeDefs` — one import + one array append in each file. Both barrels funnel into the single `backend/src/graphql/serverConfig.js`, so there is no second registration point to miss (confirmed by reading `backend/test/helpers.js:4`, which imports from the same `serverConfig.js`).

### GraphQL schema `extend type Mutation`
**Source:** `backend/src/schemas/invitation.schema.js:49-53`, `backend/src/schemas/familyMember.schema.js` (both extend rather than redeclare)
**Apply to:** `approval.schema.js` — the new module owns no base types, only `extend type Mutation { approveUser(...): User! rejectUser(...): User! }`; `user.schema.js:58` is the sole owner of the base `type Mutation` declaration.

### Frontend async handler try/catch/finally
**Source:** `frontend/src/pages/ApprovalsPage.jsx:75-86` (already the pattern in the file being modified; also `frontend/src/pages/Login.jsx:14-26` per CONVENTIONS.md)
**Apply to:** `handleApprove`/`submitReject` in `ApprovalsPage.jsx` stay in this shape — only the `graphqlRequest` call's mutation string and id argument change.

### MUI Tooltip-wraps-disabled-control (D-11's visual idiom)
**Source:** `frontend/src/components/manage/AdminMemberTable.jsx:142-151`
**Apply to:** the Approve/Reject `Button`s in `ApprovalsPage.jsx`, combined with the file's own pre-existing `"Email unverified"` `Chip` (`ApprovalsPage.jsx:134-136`) — Tooltip explains *why* disabled, Chip labels the row, both driven by the same `!row.registeredUser.emailVerified` condition already computed in the file today.

## No Analog Found

None. Every file in this phase's scope has a close, concrete analog already in the codebase — this is expected for a brownfield relocation phase with zero new libraries or architectural mechanisms (confirmed by RESEARCH.md's "Standard Stack" section: no new packages introduced).

The only genuinely novel code is the D-08/D-09 `emailVerified` guard clause and its accompanying test — but it follows the exact same "plain `throw new Error(...)` guard clause at the top of the resolver body" pattern already established by every other guard in `invitation.resolver.js`/`user.resolver.js`, so it needs no separate analog search; see "Plain-Error resolver error handling" above.

## Metadata

**Analog search scope:** `backend/src/resolvers/`, `backend/src/schemas/`, `backend/src/models/`, `backend/migrations/manual/`, `backend/src/utils/`, `backend/src/services/`, `backend/test/`, `frontend/src/pages/`, `frontend/src/components/manage/`
**Files read in full for this map:** `invitation.resolver.js`, `invitation.schema.js`, `user.schema.js`, `resolvers/index.js`, `schemas/index.js`, `User.js`, `Invitation.js`, `018-add-family-members-geez-names.sql`, `015-add-users-status.sql`, `016-create-invitations.sql`, `approveReject.test.js`, `audit.js`, `auth.js`, `mailer.js`, `ApprovalsPage.jsx`, `ApprovalsPage.test.jsx`, `models/index.js`, `test/helpers.js`, `AdminMemberTable.jsx` (targeted excerpt)
**Pattern extraction date:** 2026-08-27
