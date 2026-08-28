# Phase 31: Invitations Become Admin-Only - Pattern Map

**Mapped:** 2026-08-28
**Files analyzed:** 15 (0 new, 15 modified/extended — no new files this phase)
**Analogs found:** 15 / 15 — every touch point is either the file's own current state (a guard/branch swap) or a sibling resolver in the same directory that already does the exact new behaviour (`approval.resolver.js`, shipped in Phase 30).

**Note on line-number drift:** CONTEXT.md's citations were verified against the files on disk. Two were off by one line (`AppLayout.jsx`'s button block starts at 73, not 72; the file's `requireAdmin`/`requireFamilyAccess` split is 42-45 / 47-51, not one continuous 42-51 block) — both noted below at point of use. Everything else cited in CONTEXT.md checked out exactly.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `backend/src/resolvers/invitation.resolver.js` (guard swap ×2, filter narrow ×1) | resolver | request-response (guard clause + CRUD read) | itself — `invitations`/`pendingRegistrations` queries already call `requireAdmin` (lines 20-28) | exact |
| `backend/src/resolvers/user.resolver.js` — `register` (drop notify call, change message) | resolver | request-response | itself (lines 113-178) | exact |
| `backend/src/resolvers/user.resolver.js` — `verifyEmail` (add Pending→Active promotion) | resolver | request-response, transactional | itself (242-291) + `backend/src/resolvers/approval.resolver.js:20-48` (`approveUser`'s transactional update — the promotion this phase adds is a subset of that logic) | exact |
| `frontend/src/App.jsx` (move 3 routes to ADMIN group) | route | request-response | itself — the ADMIN group already exists for `/link-accounts` (lines 38-41) | exact |
| `frontend/src/components/AppLayout.jsx` (wrap nav button) | component | request-response | itself — the `user.role === 'ADMIN' &&` wrapper already exists for `/link-accounts` (lines 80-88) | exact |
| `frontend/src/pages/ApprovalsPage.jsx` (remove unreachable disabled branch) | component | request-response | itself (lines 129-187) | exact |
| `backend/src/resolvers/createInvitation.test.js` (add adversarial non-admin test) | test | request-response/integration | itself — `activeMember()` fixture (lines 25-28) is already the exact F-01 actor | exact |
| `backend/src/resolvers/verifyEmail.test.js` (add promotion test) | test | request-response/integration | itself + `register.test.js`'s `makeInvitation()` helper (lines 21-34) | exact |
| `backend/src/resolvers/register.test.js` (update message assertion, notify-call assertion) | test | request-response/integration | itself (lines 62-80) | exact |
| `backend/src/resolvers/approveReject.test.js` (extend queue-filter describe block) | test | request-response/integration | itself — `pendingRegistrations query` block (lines 248-264) | exact |
| `frontend/src/pages/ApprovalsPage.test.jsx` (remove/replace unverified-row test) | test | component | itself (lines 91-99) | exact |
| `frontend/src/pages/InvitationsPage.test.jsx`, `InvitePage.test.jsx` (review for route-move fallout) | test | component | itself | exact |
| `frontend/src/components/ProtectedRoute.test.jsx` (reference only — guard order) | test | component | itself (lines 59-66, `allowedRoles` redirect case) | exact |
| `frontend/src/pages/VerifyEmail.jsx` (no code change expected; F-02 reference) | component | request-response | itself (line 25) | n/a — read-only reference |
| `frontend/src/pages/VerifyEmail.test.jsx` (coverage gap noted) | test | component | itself — **no existing case exercises the `/pending` branch at all** | partial — see note under item 9 |

## Pattern Assignments

### 1. `requireAdmin` vs `requireFamilyAccess`, and the sibling resolver that already calls `requireAdmin` on line one

**Source:** `backend/src/utils/auth.js:42-51`

```javascript
export function requireAdmin(user) {
  requireAuth(user);
  if (user.role !== 'ADMIN') throw new Error('Admin access is required.');
}

export function requireFamilyAccess(user) {
  requireAuth(user);
  if (user.role === 'ADMIN') return;
  if (!user.familyMemberId) throw new Error('Your account is not yet linked to a family member.');
}
```
(Two separate functions, `requireAdmin` at 42-45, `requireFamilyAccess` at 47-51 — CONTEXT.md's "~42-51" combined range is correct as a span but the two bodies are not contiguous with each other in the way a single 10-line block would suggest; they're separated by a blank line.)

**Analog resolver that already does the D-01/D-02 guard swap's target shape** — `backend/src/resolvers/invitation.resolver.js:20-28`:
```javascript
// Admin-only: every invitation.
invitations: async (_parent, _args, { models, user }) => {
  requireAdmin(user);
  return models.Invitation.findAll({ order: [['createdAt', 'DESC']] });
},
// Admin-only: invitations awaiting an approval decision.
pendingRegistrations: async (_parent, _args, { models, user }) => {
  requireAdmin(user);
  return models.Invitation.findAll({ where: { status: 'Registered' }, order: [['registeredAt', 'DESC']] });
}
```
`requireAdmin(user)` as the literal first statement of the resolver body is the pattern — D-01 (`createInvitation`) and D-02 (`myInvitations`) both become this shape.

**Current state to be changed** — `backend/src/resolvers/invitation.resolver.js:15-18` (`myInvitations`):
```javascript
myInvitations: async (_parent, _args, { models, user }) => {
  requireFamilyAccess(user);
  return models.Invitation.findAll({ where: { inviterId: user.id }, order: [['createdAt', 'DESC']] });
},
```
Change is a one-word swap: `requireFamilyAccess(user)` → `requireAdmin(user)`. Nothing else in the body changes.

**Current state to be changed** — `backend/src/resolvers/invitation.resolver.js:34-36` (`createInvitation`, first three lines of the body):
```javascript
createInvitation: async (_parent, { input }, { models, user }) => {
  requireFamilyAccess(user);

  const invitedEmail = blankToNull(input.invitedEmail);
```
Same one-word swap. The rest of the 74-line mutation body (34-74) is untouched — token creation, `Invitation.create`, email dispatch, audit log, return shape all stay exactly as-is.

---

### 2. `verifyEmail` — full transaction body, for the D-04/D-05/D-07 promotion insertion point

**Source:** `backend/src/resolvers/user.resolver.js:242-291` (verified against disk; matches CONTEXT.md's citation exactly, including F-03's `289-290`):

```javascript
verifyEmail: async (_parent, { token }, { models }) => {
  const hashed = hashVerificationToken(token);
  const user = await models.User.findOne({ where: { emailVerificationToken: hashed } });
  if (!user || !user.emailVerificationExpiresAt || user.emailVerificationExpiresAt < new Date()) {
    throw new Error('The email verification token is invalid or has expired.');
  }

  const sequelize = models.User.sequelize;

  // Verify-and-promote run inside a single transaction so token consumption and the single
  // ADMIN-slot decision commit (or roll back) as one atomic unit. The admin-count read takes
  // a locking FOR UPDATE read, so concurrent verifiers serialize on it — structurally
  // guaranteeing at most one ADMIN rather than relying on statement-level autocommit timing.
  // Nothing is visible until the whole transaction commits, so a deadlock arising from two
  // racers contending on lock order is always safe to retry: the losing racer's token is not
  // yet consumed on rollback, so re-running the transaction is idempotent (D-04/D-05/D-11).
  const verifyAndPromote = () =>
    sequelize.transaction(async (t) => {
      // Atomic conditional update: only succeeds if the token is still the one we just read.
      const [affectedCount] = await models.User.update(
        { emailVerified: true, emailVerificationToken: null, emailVerificationExpiresAt: null },
        { where: { id: user.id, emailVerificationToken: hashed }, individualHooks: true, transaction: t }
      );
      if (affectedCount === 0) throw new Error('The email verification token is invalid or has expired.');

      const [{ adminCount }] = await sequelize.query(
        "SELECT COUNT(*) AS adminCount FROM users WHERE role = 'ADMIN' AND emailVerified = true FOR UPDATE",
        { transaction: t, type: sequelize.QueryTypes.SELECT }
      );
      if (Number(adminCount) === 0) {
        await models.User.update({ role: 'ADMIN' }, { where: { id: user.id }, transaction: t });
      }
    });

  const isDeadlock = (error) =>
    error?.original?.code === 'ER_LOCK_DEADLOCK' || error?.parent?.code === 'ER_LOCK_DEADLOCK';

  try {
    await verifyAndPromote();
  } catch (error) {
    // A lock-order deadlock between two concurrent racers rolls back cleanly (nothing
    // committed, single-use token not consumed), so it is safe to retry exactly once. Any
    // other error, or a second deadlock, propagates unchanged.
    if (!isDeadlock(error)) throw error;
    await verifyAndPromote();
  }

  await user.reload();
  return { token: signToken(user), user };
},
```

**Where the D-04/D-05/D-06/D-07 promotion goes:** inside `verifyAndPromote`'s transaction callback, after the admin-slot block and before the callback returns — i.e. as a third step inside the same `sequelize.transaction(async (t) => { ... })`, still before the outer `await user.reload()` on line 289 (F-03's hard requirement). The lookup this phase needs is `models.Invitation.findOne({ where: { registeredUserId: user.id }, transaction: t } )` (see item 4 below for why this is a two-step query, not an `include`). D-06's guard (`only from status === 'Pending'`) is a plain conditional around the `User.update` call — no new throw needed, since a non-Pending account simply isn't promoted (silently skipped, not an error — verification itself must still succeed for a `Rejected`/`Disabled` account per D-06's wording, only the promotion is skipped).

**Directly reusable transactional-update shape for the promotion itself** — `backend/src/resolvers/approval.resolver.js:42-47` (`approveUser`'s core update, the exact operation D-04 needs minus the guard/lock ceremony that's Phase 30-specific):
```javascript
const now = new Date();

await target.update({ status: 'Active', approvedAt: now, approvedBy: user.id }, { transaction: t });
if (invitation) {
  await invitation.update({ status: 'Approved', approvedAt: now, approvedBy: user.id }, { transaction: t });
}
```
D-08 means the promotion in `verifyEmail` does **not** stamp `Invitation.status = 'Approved'` the way `approveUser` does — it only needs `models.User.update({ status: 'Active' }, { where: { id: user.id }, transaction: t })` (or `user.update(...)` since `user` is already in scope from the outer `findOne`). No `approvedAt`/`approvedBy` fields either — those columns mean "an admin decided," and nobody decided here; the admin's vouching happened at invite time. Don't copy `approval.resolver.js`'s `approvedAt`/`approvedBy` stamping into this promotion.

---

### 3. `register` — where `registeredUserId` is written, where the notify call fires, and the success-message return branch

**Source:** `backend/src/resolvers/user.resolver.js:113-178`. Key lines, verified against disk (all match CONTEXT.md's citations exactly):

**`registeredUserId` write** (line 152, inside the transaction):
```javascript
const [affected] = await models.Invitation.update(
  { status: 'Registered', registeredAt: new Date(), registeredUserId: createdUser.id },
  { where: { id: invitation.id, status: 'Pending' }, transaction: t }
);
```

**The call D-11 removes** (line 162, outside the transaction, fire-and-forget):
```javascript
notifyAdminsOfPendingRegistration(models, { invitation, user: createdUser }).catch((err) => {
  console.error('Failed to notify admins of pending registration:', err);
});
```
D-11 deletes this call (and only this call — `sendVerificationEmail` at line 158 and `writeAuditLog` at line 166 stay). The `notifyAdminsOfPendingRegistration` function itself (lines 22-39) is untouched, per D-11 — it stays for Phase 32 to call from the self-registration path.

**Success-message return branch to reword (D-13)** — lines 174-177:
```javascript
return {
  message:
    'Registration received. Verify your email — then an administrator will review and approve your account before you can sign in.'
};
```
New wording must stop promising admin review — e.g. something like `'Registration received. Verify your email to activate your account.'` (exact wording is Claude's Discretion per CONTEXT.md). This is the same return branch Phase 32 will later branch on for the tokenless variant, per CONTEXT.md's note.

---

### 4. `pendingRegistrations` — current query, and the include-vs-two-step-query question (D-09)

**Source:** `backend/src/resolvers/invitation.resolver.js:25-28` (verified — matches CONTEXT.md's citation exactly):
```javascript
pendingRegistrations: async (_parent, _args, { models, user }) => {
  requireAdmin(user);
  return models.Invitation.findAll({ where: { status: 'Registered' }, order: [['registeredAt', 'DESC']] });
}
```

**No existing example of a Sequelize `include` with a nested `where` on the associated model exists anywhere in this backend.** Confirmed by reading every `include:` usage in `backend/src/`:
- `backend/src/resolvers/familyMember.resolver.js:257-259` — plain include, no `where`:
  ```javascript
  const target = await models.FamilyMember.findByPk(targetId, {
    include: [{ association: 'linkedUser' }]
  });
  ```
- `backend/src/loaders/familyMember.loaders.js:47-49` and `backend/src/services/familyMember.service.js:200-202,242-244` — same shape, `where` is always on the *outer* query (`Spouse.findAll({ where: {...}, include: [...] })`), never nested inside an include block.

**What the codebase does have, and the closer precedent for D-09:** a two-step / separate-query pattern for the exact same `registeredUserId` relationship, already shipped in Phase 30 — `backend/src/resolvers/approval.resolver.js:37-41`:
```javascript
invitation = await models.Invitation.findOne({
  where: { registeredUserId: target.id },
  transaction: t,
  lock: t.LOCK.UPDATE
});
```
This looks up an `Invitation` by `registeredUserId` as a standalone query, not an include. For D-09's narrowed filter, the mirror-image query is "find `Invitation`s with `status = 'Registered'` whose `registeredUser` (looked up separately or via the existing `Invitation.belongsTo(User, { as: 'registeredUser' })` association in `backend/src/models/index.js:83-88`) is still `Pending` and `emailVerified`." Two concrete options for the planner, neither with a direct precedent to copy verbatim:
1. **Include-with-where** (zero precedent in this codebase, but Sequelize-idiomatic): `models.Invitation.findAll({ where: { status: 'Registered' }, include: [{ association: 'registeredUser', where: { status: 'Pending', emailVerified: true } }], order: [['registeredAt', 'DESC']] })` — an include with a `where` becomes an inner join by default, which is exactly "only rows with a matching, still-Pending-and-verified registeredUser."
2. **Two-step** (matches `approval.resolver.js`'s established idiom): fetch `status: 'Registered'` invitations, then filter/join against `User` in a second query or via the already-resolved `registeredUser` field resolver (`invitation.resolver.js:89-92`, which already loads `registeredUser` through `loaders.userById` for admins).

Since CONTEXT.md leaves this to Claude's Discretion, state the choice explicitly in the plan rather than defaulting silently — this codebase has no precedent either way for a query-level implementation, only for the loader-level per-row resolution.

---

### 5. `frontend/src/App.jsx` — both route guard groups, verbatim

**Source:** `frontend/src/App.jsx:19-44` (full `<Routes>` tree; verified — the two guard groups CONTEXT.md cites as "28-41" span exactly lines 28-41):

```javascript
<Routes>
  <Route element={<AppLayout />}>
    <Route index element={<Navigate to="/dashboard" replace />} />
    <Route path="login" element={<Login />} />
    <Route path="register" element={<Register />} />
    <Route path="forgot-password" element={<ForgotPassword />} />
    <Route path="reset-password" element={<ResetPassword />} />
    <Route path="verify-email" element={<VerifyEmail />} />
    <Route path="pending" element={<Pending />} />
    <Route element={<ProtectedRoute />}>
      <Route path="dashboard" element={<Dashboard />} />
      <Route path="manage" element={<ManagePage />} />
      <Route path="family" element={<FamilyTreePage />} />
      <Route path="detail" element={<DetailPage />} />
      <Route path="invitations" element={<InvitationsPage />} />
      {/* Old split routes now redirect to the merged Invitations page. */}
      <Route path="invite" element={<Navigate to="/invitations" replace />} />
      <Route path="approvals" element={<Navigate to="/invitations" replace />} />
    </Route>
    <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
      <Route path="link-accounts" element={<LinkAccountsPage />} />
      <Route path="admin/link-members" element={<Navigate to="/link-accounts" replace />} />
    </Route>
  </Route>
</Routes>
```

**Mechanical move (D-03):** delete the three `<Route path="invitations" .../>`, `<Route path="invite" .../>`, `<Route path="approvals" .../>` lines from the first `<ProtectedRoute />` group (lines 33-36) and insert them into the second `<ProtectedRoute allowedRoles={['ADMIN']} />` group (currently lines 38-41), alongside `link-accounts` and `admin/link-members`. No new `<Route>` wrapper element, no new guard component — the existing `allowedRoles={['ADMIN']}` group already does everything D-03 needs.

---

### 6. `frontend/src/components/AppLayout.jsx` — the unconditional `/invitations` button next to the ADMIN-gated `/link-accounts` button

**Source:** `frontend/src/components/AppLayout.jsx:73-88` (verified — CONTEXT.md's "72-88" is off by one: line 72 is the closing `</Button>` of the *Manage* button, not part of the Invitations block; the Invitations button itself starts at 73):

```javascript
<Button
  component={RouterLink}
  to="/invitations"
  sx={{ color: colors.slate, fontWeight: 600, display: { xs: 'none', sm: 'inline-flex' } }}
>
  Invitations
</Button>
{user.role === 'ADMIN' && (
  <Button
    component={RouterLink}
    to="/link-accounts"
    sx={{ color: colors.slate, fontWeight: 600, display: { xs: 'none', sm: 'inline-flex' } }}
  >
    Link accounts
  </Button>
)}
```

**Mechanical change (D-03):** wrap the Invitations `<Button>` (lines 73-79) in the identical `{user.role === 'ADMIN' && ( ... )}` conditional already used for Link accounts (lines 80-88) — copy the wrapper syntax exactly, same `sx` props on the inner `<Button>`, nothing else in the file changes.

---

### 7. `ApprovalsPage.jsx` — the D-11 "waiting for email verification" disabled-row branch to delete, and the empty state that remains

**Source:** `frontend/src/pages/ApprovalsPage.jsx:126-141` (row computation) and `160-187` (rendering):

```javascript
{rows.map((row) => {
  const name = row.registeredUser?.name || row.invitedName || row.invitedEmail;
  const email = row.registeredUser?.email || row.invitedEmail;
  const unverified = Boolean(row.registeredUser) && !row.registeredUser.emailVerified;
  // Both mutations address the ACCOUNT, so a row whose registeredUser
  // is null has nothing to act on -- fk_invitations_registered_user is
  // ON DELETE SET NULL (migration 016), so this is reachable. Guarding
  // only on `unverified` let those buttons render enabled and then
  // dereference row.registeredUser.id on click.
  const orphaned = !row.registeredUser;
  const blocked = unverified || orphaned;
  const blockedReason = orphaned
    ? 'This registration has no account to act on.'
    : unverified
      ? 'Waiting for the applicant to verify their email address.'
      : '';
```
and the Chip that labels it:
```javascript
{row.registeredUser && !row.registeredUser.emailVerified && (
  <Chip label="Email unverified" size="small" color="warning" variant="outlined" />
)}
```

**What D-10 actually removes vs. keeps — this is subtler than "delete the block":** the `unverified` branch is what becomes unreachable under D-09 (an unverified registrant can never appear in `pendingRegistrations` once the filter requires `emailVerified: true`) and must go. The `orphaned` branch is a *different* condition — `fk_invitations_registered_user` is `ON DELETE SET NULL`, so an admin deleting a user after registration but before decision is untouched by D-09 and remains reachable. **Do not delete `orphaned`/`blocked`/`blockedReason` wholesale** — only strip the `unverified` half out of each: `blocked` becomes just `orphaned`, `blockedReason` loses its `unverified` ternary branch, and the `"Email unverified"` `Chip` block is deleted entirely. The `Tooltip`-wraps-disabled-`Button` structure (lines 160-187) and the `busyId === row.id` half of the `disabled` condition are untouched.

**The empty state D-10 relies on, unchanged** — `ApprovalsPage.jsx:120-123`:
```javascript
) : rows.length === 0 ? (
  <Paper elevation={0} sx={{ p: 4, borderRadius: 4, border: `1px solid ${colors.line}`, textAlign: 'center' }}>
    <Typography color="text.secondary">No registrations are waiting for approval.</Typography>
  </Paper>
```
Under D-09, this is the state an admin sees far more often now (empty-by-construction for every invited registrant) — no new copy needed, this text already reads correctly for that case.

---

### 8. Test analogs — setup harnesses per test file, and the F-01 actor fixture

**Backend harness (all four `*.test.js` files share this shape):**
- `graphql(query, variables, user)` — executes against the real Apollo server + a real test-DB transaction via `backend/test/helpers.js:16-26`, no HTTP layer.
- `resetTables()` (`helpers.js:28-41`) truncates all tables with FK checks disabled, called in `beforeEach`.
- `createTestUser(overrides)` (`helpers.js:45-57`) defaults to `role: 'USER', emailVerified: true, status: 'Active'` — every non-default actor (Pending, unverified, ADMIN, unlinked) is built by overriding these three fields.

**F-01's exact actor already exists as a named helper** — `backend/src/resolvers/createInvitation.test.js:25-28`:
```javascript
async function activeMember(overrides = {}) {
  const member = await models.FamilyMember.create({ firstname: 'Ada', lastname: 'Lovelace', gender: 'Female' });
  return createTestUser({ role: 'USER', familyMemberId: member.id, ...overrides });
}
```
This is **exactly** the "linked, Active, non-admin member" F-01 names: `role: 'USER'` (non-admin), `familyMemberId` set (linked), and `createTestUser`'s defaults supply `status: 'Active'` and `emailVerified: true` since `activeMember` doesn't override them. The SC-1 adversarial test is `await graphql(CREATE_INVITATION, { input: {...} }, await activeMember())` and asserting `errors[0].message === 'Admin access is required.'` (the message `requireAdmin` already throws, per D-01 — no new message needed). This helper already lives in the file the new test belongs in (`createInvitation.test.js`), so no fixture needs to be invented — only imported/reused as-is. Contrast with the *existing* `'rejects an authenticated but unlinked non-admin inviter'` test (lines 85-93 of the same file), which CONTEXT.md's F-01 explicitly says would prove nothing about the new guard (an unlinked account was already refused by the old `requireFamilyAccess` guard too).

**`verifyEmail.test.js` — harness for the new promotion test:** this file's own `createTestUser` calls (e.g. lines 46-51) build a bare unlinked user with a verification token; the promotion test additionally needs an `Invitation` row with `registeredUserId` pointing at that user, which this file does not currently construct. The closest borrowable helper is `register.test.js:21-34`'s `makeInvitation()`:
```javascript
async function makeInvitation(overrides = {}) {
  const inviter = overrides.inviter || (await createTestUser({ role: 'ADMIN', email: `inviter-${Date.now()}@example.com` }));
  const rawToken = createInvitationToken();
  const invitation = await models.Invitation.create({
    tokenHash: hashInvitationToken(rawToken),
    inviterId: inviter.id,
    invitedEmail: overrides.invitedEmail || 'invitee@example.com',
    relationshipToFamily: overrides.relationshipToFamily || 'cousin',
    invitationNote: overrides.invitationNote || null,
    expiresAt: overrides.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    status: overrides.status || 'Pending'
  });
  return { rawToken, invitation, inviter };
}
```
Simplest approach for `verifyEmail.test.js`'s new SC-3 test: create the `User` directly with `status: 'Pending'`, `emailVerified: false`, and a verification token (as the file's existing tests already do), then separately `models.Invitation.create({ ..., status: 'Registered', registeredUserId: user.id })` — mirroring `approveReject.test.js:21-30`'s `pendingRegistration()` helper shape (already reads `registeredUserId: registrant.id` at line 29) rather than importing across test files.

**`register.test.js` — D-13/D-11 assertions to update:** the existing `'emails the verification link and notifies admins'` test (lines 62-80) currently asserts `expect(sendPendingRegistrationEmail).toHaveBeenCalled()` (line 71) — this assertion must flip to `not.toHaveBeenCalled()` under D-11, and the test name/comment should stop describing "notifies admins" for the invited path. The `data.register.message` assertion (currently just `expect(typeof data.register.message).toBe('string')`, line 48) is where D-13's new wording gets pinned down with an exact-string assertion once the message is chosen.

**`approveReject.test.js` — where SC-4's narrowed-filter test belongs:** the existing `pendingRegistrations query` describe block (lines 248-264) is the direct analog:
```javascript
describe('pendingRegistrations query', () => {
  it('returns only Registered invitations to an admin, with the registered user', async () => {
    await pendingRegistration('p1@example.com');
    const admin = await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });

    const { data, errors } = await graphql(PENDING, {}, admin);
    expect(errors).toBeUndefined();
    expect(data.pendingRegistrations).toHaveLength(1);
    expect(data.pendingRegistrations[0].registeredUser.name).toBe('Newbie');
  });

  it('denies a non-admin', async () => {
    const member = await createTestUser({ role: 'USER', email: 'member@example.com' });
    const { errors } = await graphql(PENDING, {}, member);
    expect(errors[0].message).toBe('Admin access is required.');
  });
});
```
Note this existing first test's fixture, `pendingRegistration()` (lines 18-32), builds `registrant` with `status: 'Pending', emailVerified: true` by default — under D-09, this exact fixture would **no longer appear** in `pendingRegistrations` (it's fully verified and Pending, which after D-05's promotion logic means it would already have been promoted to Active at verify-time in the real flow). This existing test's premise needs re-examining once D-09 lands: either the fixture must set `emailVerified: false` to remain a valid "still pending" case, or the test is asserting a state that D-04/D-05 make unreachable via the normal flow (it's still constructible directly via `models.Invitation.create`/`createTestUser` for filter-testing purposes, which is fine — the filter test doesn't need to go through `register`/`verifyEmail` to be valid, it just needs the DB rows in the right shape).

**Frontend backend-free harnesses (`InvitationsPage.test.jsx`, `InvitePage.test.jsx`, `ApprovalsPage.test.jsx`):** all three mock `graphqlRequest` directly (`vi.mock('../api/graphqlClient.js', () => ({ graphqlRequest: vi.fn() }))`) and, where auth state matters, mock `useAuth` (`InvitationsPage.test.jsx:5-8`). No real GraphQL/DB involved — pure component tests. `ApprovalsPage.test.jsx:91-99`'s `'disables Approve and Reject for a row whose email is not verified'` test (using `UNVERIFIED_ROW`, line 23) is the one to remove or repurpose per item 7 above; `'disables Approve and Reject for a row with no registered user (WR-01)'` (lines 101-114, `ORPHANED_ROW`) stays unchanged.

**`ProtectedRoute.test.jsx` — no fixture gap.** The existing `'redirects to /dashboard when the user role is not in allowedRoles'` test (lines 59-66) already exercises the exact `allowedRoles={['ADMIN']}` + non-admin-user path that a non-admin hitting `/invitations` post-move will take. No new component test is required here — D-03's route move is provable at the `App.jsx` routing level, and `ProtectedRoute` itself is unchanged (referenced, not modified).

---

### 9. `VerifyEmail.jsx` — the post-verification routing branch, and its test coverage gap

**Source:** `frontend/src/pages/VerifyEmail.jsx:21-26` (the branch itself is line 25, verified exact match to CONTEXT.md's citation):
```javascript
verifyEmail(token)
  .then((user) => {
    // Email verified, but the account may still be awaiting admin approval
    // (two-gate flow) — route there instead of the dashboard.
    navigate(user && user.status && user.status !== 'Active' ? '/pending' : '/dashboard');
  })
```
No code change is expected here under D-04/D-05 — this branch already does exactly what F-02 describes: an invited registrant whose `verifyEmail` response now carries `status: 'Active'` (post-promotion) takes the `/dashboard` branch automatically, with zero changes to this file. This file is a reference point, not a touch point.

**Test coverage gap (contrary to what F-02's wording implies):** `frontend/src/pages/VerifyEmail.test.jsx` currently has exactly one navigation-success case (lines 38-50):
```javascript
it('auto-verifies the URL token on mount and navigates to /dashboard on success', async () => {
  graphqlRequest.mockResolvedValueOnce({
    verifyEmail: {
      token: 'tok-abc',
      user: { id: 3, name: 'Ada', email: 'ada@example.com', role: 'USER' }
    }
  });

  renderVerifyEmail(['/verify-email?token=abc123']);

  await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/dashboard'));
  expect(graphqlRequest).toHaveBeenCalledWith(expect.any(String), { token: 'abc123' });
});
```
This mocked `user` object has **no `status` field at all**, so `user && user.status && ...` is already falsy and the test already asserts the `/dashboard` branch — it does not, and never did, cover the `/pending` branch. There is no existing test anywhere in the frontend suite asserting `navigateSpy` was called with `/pending` after a successful `verifyEmail` (confirmed by grepping every `*.test.jsx` for `/pending` — only `ProtectedRoute.test.jsx`, `ManagePage.test.jsx`, and `Pending.test.jsx` reference that route, none of them via `VerifyEmail`). F-02's claim that "component tests asserting the old navigation need updating" does not match this file's current state — there is nothing to update here, only (optionally) a new case to add: mock `verifyEmail`'s response `user` with `status: 'Pending'` and assert `navigateSpy` was called with `/pending`, to pin the branch this phase now makes reachable only for a hypothetical non-invited/not-yet-promoted account (Phase 32 territory) rather than leaving it silently untested.

## Shared Patterns

### Admin-only guard, reused verbatim
**Source:** `backend/src/utils/auth.js:42-45`
```javascript
export function requireAdmin(user) {
  requireAuth(user);
  if (user.role !== 'ADMIN') throw new Error('Admin access is required.');
}
```
**Apply to:** `createInvitation` and `myInvitations` in `invitation.resolver.js` — literal first-line swap, `requireFamilyAccess(user)` → `requireAdmin(user)`. Zero changes to `auth.js` itself.

### Transactional single-row promotion (subset of Phase 30's dual-row update)
**Source:** `backend/src/resolvers/approval.resolver.js:42-47`, trimmed to what D-04/D-08 actually need (no `approvedAt`/`approvedBy`, no `Invitation.status` write per D-08):
```javascript
await target.update({ status: 'Active' }, { transaction: t });
```
**Apply to:** inside `verifyEmail`'s existing `verifyAndPromote` transaction (`user.resolver.js:258-274`), after the admin-slot decision and before the callback returns — guarded by D-06's `status === 'Pending'` check and D-05's `Invitation` existence check (two-step lookup, see item 4).

### Two-step `registeredUserId` lookup (no include-with-where precedent exists)
**Source:** `backend/src/resolvers/approval.resolver.js:37-41`
```javascript
invitation = await models.Invitation.findOne({
  where: { registeredUserId: target.id },
  transaction: t,
  lock: t.LOCK.UPDATE
});
```
**Apply to:** D-05's promotion lookup inside `verifyEmail` (drop the `lock` option — verifyEmail's transaction doesn't need row-locking on the invitation the way `approveUser`'s TOCTOU-sensitive guard does, since nothing else can concurrently re-decide an invitation mid-verification) and to whichever query shape D-09's `pendingRegistrations` narrowing settles on.

### Fire-and-forget email/audit, `.catch(console.error)`
**Source:** `backend/src/resolvers/invitation.resolver.js:57-64,66-71` and `backend/src/resolvers/user.resolver.js:158-160,166-172`
```javascript
sendInvitationEmail({ ... }).catch((err) => console.error('Failed to send invitation email:', err));
writeAuditLog(models, { action: 'invitation.created', ... }).catch((err) => console.error('Failed to write audit log:', err));
```
**Apply to:** if Claude's Discretion opts to write an `invitation.activated` audit row for the promotion, it follows this exact fire-and-forget shape, called after the transaction commits (mirroring where `approval.resolver.js:53-58` places its own `writeAuditLog` call — after, not inside, the transaction).

### Frontend ADMIN-only nav/route gating, one wrapper reused twice
**Source:** `frontend/src/components/AppLayout.jsx:80-88` (existing `/link-accounts` wrapper) and `frontend/src/App.jsx:38-41` (existing `allowedRoles={['ADMIN']}` route group)
**Apply to:** the Invitations nav button and the `/invitations`+`/invite`+`/approvals` routes — both are additions to an already-established pattern, not new mechanisms.

### Plain-Error resolver guards
**Source:** throughout `invitation.resolver.js`/`user.resolver.js`/`approval.resolver.js` — `throw new Error('user-facing message')`, no custom error classes, no status codes.
**Apply to:** every guard touched or added this phase (`requireAdmin`'s existing message, D-06's silent-skip which needs no new error at all since it's not a rejection — verification still succeeds).

## No Analog Found

None outright — every touch point this phase makes has a close, concrete analog already in the codebase (this phase is entirely guard swaps, a route/nav move, a transaction insertion, and a dead-branch removal; Phase 30's `approval.resolver.js` already establishes the transactional-promotion and two-step-lookup shapes this phase reuses). The one **partial** gap is the Sequelize include-with-where pattern for D-09 (item 4 above) — not a missing analog so much as a genuinely unprecedented choice the codebase has never needed to make before; flagged explicitly for the planner rather than silently defaulted.

## Metadata

**Analog search scope:** `backend/src/resolvers/`, `backend/src/utils/`, `backend/src/models/`, `backend/src/services/`, `backend/src/loaders/`, `backend/test/`, `frontend/src/pages/`, `frontend/src/components/`
**Files read in full for this map:** `auth.js`, `invitation.resolver.js`, `user.resolver.js`, `approval.resolver.js`, `App.jsx`, `AppLayout.jsx`, `ApprovalsPage.jsx`, `VerifyEmail.jsx`, `ProtectedRoute.jsx`, `User.js`, `Invitation.js`, `models/index.js`, `audit.js`, `createInvitation.test.js`, `verifyEmail.test.js`, `register.test.js`, `approveReject.test.js`, `test/helpers.js`, `InvitationsPage.test.jsx`, `InvitePage.test.jsx`, `ApprovalsPage.test.jsx`, `ProtectedRoute.test.jsx`, `VerifyEmail.test.jsx`, `InvitationsPage.jsx`
**Grepped (no full read needed):** every `include:` usage in `backend/src` (confirmed no include-with-nested-where precedent exists); every `/pending` reference in `frontend/src/**/*.test.jsx` (confirmed `VerifyEmail.test.jsx` has no case for that branch)
**Pattern extraction date:** 2026-08-28
