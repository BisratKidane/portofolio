# Phase 30: Approval Moves to the Account - Research

**Researched:** 2026-08-27
**Domain:** GraphQL resolver refactor (relocate + re-target existing mutations), Sequelize manual migration, React/MUI admin UI rewire, Vitest backend/frontend test move
**Confidence:** HIGH — this is a brownfield move of code that already exists and already has passing tests; every claim below is read directly from the current tree, not inferred.

## Summary

This phase relocates a fully-working, fully-tested feature (`approveInvitation`/`rejectInvitation` at `backend/src/resolvers/invitation.resolver.js:78-139`) to a new home (`approval.resolver.js`/`approval.schema.js`) and re-targets its entry point from an invitation id to a user id, adding two preconditions (`status === 'Pending'`, `emailVerified === true`) that don't exist today. Every piece of supporting infrastructure — the mailer functions, `writeAuditLog`, `requireAdmin`, the barrel-file registration pattern, the manual-SQL migration convention, and the Vitest/RTL test harness — already exists and needs no new capability, only reuse in a new location.

The single highest-value finding from this research: **the current invitation flow does NOT gate approval on email verification.** `register.test.js:53` proves a freshly-registered invitee has `emailVerified === false` at the moment their invitation flips to `'Registered'` and becomes visible in `pendingRegistrations` (`invitation.resolver.js:25-28` queries on `status: 'Registered'` alone, no `emailVerified` filter). D-08/D-09's verified-email precondition is therefore a genuine, if narrow, *behavior change* to the invitation path today, exactly as F-01 anticipates — and it must be pinned by a new test, not treated as a pre-existing invariant.

The second highest-value finding: this project's test database is provisioned by `sequelize.sync({ force: true, match: /_test$/ })` (`backend/test/globalSetup.js:11`), which rebuilds tables from the **current Sequelize model definitions** on every test run. This means adding the four columns to `User.js` (D-04) is sufficient for the backend test suite to see them immediately — the manual `019-*.sql` migration is only needed for already-provisioned databases (local dev, prod), exactly matching F-03's "production apply is a separate, explicit step" and the project's carried-forward `sync()` caveat in STATE.md.

**Primary recommendation:** Move the code verbatim into `approval.resolver.js`/`approval.schema.js`, change only (a) the lookup key from `invitationId` to `userId`, (b) add the two new guard clauses (D-07, D-08/D-09) before the existing "not awaiting approval" check, and (c) add the invitation side-effect as a conditional block (`if (invitation) { ... }`) inside the same transaction rather than assuming an invitation always exists.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Approve/reject decision authority | API / Backend | — | Business rule (admin-only, precondition checks) must live server-side; UI hiding is not enforcement (matches existing `requireAdmin` pattern) |
| Decision persistence (`User.status`, new `users` columns) | Database / Storage | API / Backend | New columns via manual SQL migration; Sequelize model is the ORM-side declaration consumed by the API tier |
| Invitation historical stamping (D-05) | API / Backend | Database / Storage | Same transaction as the User update — API tier orchestrates, DB tier persists both rows atomically |
| Approval/rejection email dispatch | API / Backend | — | Fire-and-forget `.catch()` calls from within the resolver; no client-side email concern |
| Audit logging | API / Backend | Database / Storage | `writeAuditLog` call inside the resolver; `audit_logs` table is append-only storage |
| Admin approvals UI (`ApprovalsPage`) | Browser / Client | API / Backend | Renders `pendingRegistrations` and calls the two mutations; all authorization already re-checked server-side |
| GraphQL schema/resolver registration (barrels) | API / Backend | — | Pure wiring — `resolvers/index.js` / `schemas/index.js` arrays, no business logic |

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| APPR-01 | Admin approves/rejects a pending account directly, acting on the account itself rather than an invitation record | Reference implementation quoted in full below (Code the Phase Changes → Reference Implementation); D-01/D-02/D-03 locked shape |
| APPR-03 | Approving activates the account and emails the person; rejecting blocks sign-in and emails them, including the reason when given | `sendAccountApprovedEmail`/`sendAccountRejectedEmail` signatures confirmed unchanged in `backend/src/services/mailer.js:81-107`; reused verbatim |
| APPR-04 | Approve/reject are admin-only, enforced server-side, and audit-logged with acting admin + target account | `requireAdmin` (`backend/src/utils/auth.js:42-45`) reused verbatim; `writeAuditLog` signature confirmed to already accept `targetUserId` independently of `invitationId` |
| APPR-05 | Login gate unchanged — verified email + Active status required, with existing distinct pending/rejected/disabled messages | `login` resolver (`backend/src/resolvers/user.resolver.js:179-189`) and `getUserFromRequest` (`backend/src/utils/auth.js:29-33`) confirmed untouched by this phase's scope — no code in this research proposes changing them |
| INVITE-04 | Invitation rows created before this change (incl. non-admin-sent) remain readable/correctly rendered | D-05's "stamp the invitation row inside the same transaction, when one exists" preserves `invitation.resolver.js:110-114`'s exact update shape; `Invitation.inviter` resolver (`invitation.resolver.js:145-151`) is untouched and already renders inviter regardless of the inviter's own role |
</phase_requirements>

## Standard Stack

No new libraries are introduced by this phase. All work uses libraries already installed and pinned:

### Core (already installed, reused unchanged)
| Library | Version (installed) | Purpose | Why Standard (for this project) |
|---------|---------|---------|--------------|
| `@apollo/server` | 4.11.3 [VERIFIED: backend/package.json] | GraphQL execution | Existing resolver/schema aggregation pattern |
| `sequelize` | 6.37.5 [VERIFIED: backend/package.json] | ORM, transactions | `sequelize.transaction()` already used identically in the code being moved |
| `mysql2` | 3.11.5 [VERIFIED: backend/package.json] | MySQL driver | Unchanged |
| `vitest` | 4.1.10 [VERIFIED: npm ls vitest --workspaces] | Test runner (both workspaces) | Already the sole runner; no version change needed |
| `@testing-library/react` + `user-event` | as pinned in `frontend/package.json` | Frontend component tests | `ApprovalsPage.test.jsx` already uses this harness |
| `supertest` | 7.2.2 [VERIFIED: backend/package.json] | Used by `backend/test/helpers.js` for the `httpClient()` helper (not used by GraphQL-level tests, which call `server.executeOperation` directly) | No change |

### Package Legitimacy Audit

**Not applicable.** This phase installs no new npm packages — it relocates and re-targets existing resolver code, adds one manual SQL file, and edits existing model/schema/UI files. No `slopcheck`/registry verification is required; nothing new enters `package.json` in either workspace.

## Architecture Patterns

### System Architecture Diagram

```
Admin browser (ApprovalsPage.jsx)
        │  1. pendingRegistrations query (unchanged, D-10)
        ▼
Apollo Server (backend/src/server.js)
        │  resolvers = [userResolvers, familyMemberResolvers,
        │               invitationResolvers, approvalResolvers]   <- NEW module appended
        ▼
approval.resolver.js  Mutation.approveUser(userId) / rejectUser(userId, reason)
        │
        ├─ requireAdmin(user)                         (APPR-04)
        ├─ User.findByPk(userId)                       -> 404 if missing
        ├─ guard: status === 'Pending'                  (D-07)
        ├─ guard: emailVerified === true                (D-08/D-09)
        ├─ Invitation.findOne({registeredUserId: userId}) -> optional, may be null (self-registrants, Phase 32+)
        │
        ▼  sequelize.transaction(t =>
        │      target.update({status: 'Active'|'Rejected'}, {transaction:t})
        │      if (invitation) invitation.update({status, approvedAt/rejectedAt, ...}, {transaction:t})
        │   )
        ▼
        ├─ sendAccountApprovedEmail / sendAccountRejectedEmail   (fire-and-forget .catch)
        ├─ writeAuditLog({action:'user.approved'|'user.rejected', actorUserId, invitationId?, targetUserId}) (fire-and-forget .catch)
        ▼
        return target (User!)
```

A reader can trace SC-1/SC-2/SC-3 end to end: admin click → GraphQL mutation → guard clauses → transactional write → side effects → response back to `ApprovalsPage`, which refetches `pendingRegistrations`.

### Recommended Project Structure

```
backend/src/
├── resolvers/
│   ├── approval.resolver.js       # NEW — approveUser/rejectUser (D-03)
│   ├── invitation.resolver.js     # createInvitation, myInvitations, invitations,
│   │                               #   pendingRegistrations stay; approveInvitation/
│   │                               #   rejectInvitation DELETED (D-01)
│   ├── index.js                    # add approvalResolvers to the array
│   └── approveReject.test.js      # MOVED/REWRITTEN in place — natural home per
│                                    #   Claude's Discretion note in CONTEXT.md
├── schemas/
│   ├── approval.schema.js         # NEW — approveUser/rejectUser mutation SDL (D-03)
│   ├── invitation.schema.js       # mutations removed, Query.pendingRegistrations stays
│   └── index.js                    # add approvalTypeDefs to the array
├── models/
│   └── User.js                    # + approvedAt/approvedBy/rejectedAt/rejectionReason
└── migrations/manual/
    └── 019-add-users-approval-columns.sql   # NEW (D-04)
```

### Pattern 1: Barrel Registration (already established, no new mechanism)

**What:** Both `backend/src/resolvers/index.js` and `backend/src/schemas/index.js` are flat arrays of per-domain modules, concatenated and handed to `ApolloServer` via `backend/src/graphql/serverConfig.js` (the single source both `backend/src/server.js` and `backend/test/helpers.js` import from — no duplicate wiring exists to miss).

**Current state (verbatim):**
```javascript
// Source: backend/src/resolvers/index.js
import { userResolvers } from './user.resolver.js';
import { familyMemberResolvers } from './familyMember.resolver.js';
import { invitationResolvers } from './invitation.resolver.js';

export const resolvers = [userResolvers, familyMemberResolvers, invitationResolvers];
```
```javascript
// Source: backend/src/schemas/index.js
import { userTypeDefs } from './user.schema.js';
import { familyMemberTypeDefs } from './familyMember.schema.js';
import { invitationTypeDefs } from './invitation.schema.js';

export const typeDefs = [userTypeDefs, familyMemberTypeDefs, invitationTypeDefs];
```

**Required change:** add one import + one array entry to each file — e.g. `import { approvalResolvers } from './approval.resolver.js';` and append to the array. This is the entire integration mechanism; nothing else references these barrels differently for different domains.

### Pattern 2: Resolver Return Shape (D-02 confirmed against real precedent)

`linkUserToMember` and `updateUser` already return the bare `User` type (`backend/src/schemas/user.schema.js:66-67`: `linkUserToMember(...): User!`, `updateUser(...): User!`), and their resolvers `return targetUser;` / `return serializeUser(target);` directly — no payload wrapper. D-02's "return the updated `User!`" is not a new pattern, it's the dominant one for mutations returning a single user in this codebase.

### Anti-Patterns to Avoid

- **Assuming every approved/rejected account has an invitation.** The current code (`invitation.resolver.js:84`, `:113`) starts from the invitation and treats `registeredUserId` as possibly null even in the invitation-first flow (`invitation.registeredUserId ? ... : null`). The new resolver starts from the user and must treat "no matching invitation" as the normal case for Phase 32's self-registrants — not an error state. Do not throw if `Invitation.findOne({ where: { registeredUserId: userId } })` returns null.
- **Re-deriving the transaction order.** The existing code updates `target` (the User) *before* `invitation` inside the transaction (`invitation.resolver.js:89-90` and `:118-122`). Preserve this order exactly — it is what D-05 means by "preserving today's behaviour."
- **Gating on `emailVerified` before checking `status === 'Pending'`.** The existing "not awaiting approval" pattern checks status first, and D-07's message ("This account is not awaiting a decision.") is the more specific, more useful error for a repeat click. Order guards: auth → not-found → status-not-Pending → email-not-verified, so a double-click on an already-approved account gets the D-07 message, not a confusing verification message.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Admin authorization check | A new role check inline | `requireAdmin(user)` (`backend/src/utils/auth.js:42-45`) | Already synchronous, throws `'Admin access is required.'`, exactly what `approveReject.test.js:65` already asserts |
| Approval/rejection transactional consistency | A new locking scheme | `models.User.sequelize.transaction(async (t) => {...})` — the exact call already used at `invitation.resolver.js:87-91` and `:116-123` | Proven pattern; MySQL transaction semantics already validated by the existing test suite |
| Email delivery | A new mailer call shape | `sendAccountApprovedEmail({ to, name })` / `sendAccountRejectedEmail({ to, name, reason })` (`backend/src/services/mailer.js:81-107`) | Signatures already match everything a `User` row has; zero changes needed to `mailer.js` |
| Audit trail | A new logging table/call | `writeAuditLog(models, { action, actorUserId, invitationId, targetUserId, metadata })` (`backend/src/utils/audit.js`) | Already accepts `invitationId: null` and `targetUserId` independently — confirmed by reading its destructured defaults (`= null` on both) |
| Migration file format | A schema-diffing tool or `sequelize-cli` | Hand-written portable SQL under `backend/migrations/manual/`, numbered sequentially | Established convention since migration 009; `sequelize.sync()` never alters existing tables (STATE.md carried-forward blocker) — manual SQL is the only path for already-provisioned DBs |

**Key insight:** every "problem" this phase might appear to introduce (auth check, transaction, email, audit, migration format) is already solved in this codebase by a specific, tested function or file convention. The engineering work here is *routing*, not *building*.

## Code the Phase Changes — Reference Implementation (quoted verbatim)

### `approveInvitation` / `rejectInvitation` — the exact code being relocated

```javascript
// Source: backend/src/resolvers/invitation.resolver.js:78-139
// Admin approves a registered invitation: activate the user and stamp the
// decision. Only a 'Registered' invitation (invitee has registered, awaiting
// review) can be approved.
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
// Admin rejects a registered invitation: mark the user Rejected (login stays
// blocked) and record the optional reason for auditing.
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

**What must change when this becomes `approveUser(userId)`/`rejectUser(userId, reason)`:**
1. Entry point flips: look up `models.User.findByPk(userId)` first (this IS the target — no more "the registered user no longer exists" indirection since we start from the user).
2. Add the D-07 guard: `if (target.status !== 'Pending') throw new Error('This account is not awaiting a decision.');` — replaces the old `invitation.status !== 'Registered'` check.
3. Add the D-08/D-09 guard: `if (!target.emailVerified) throw new Error(...);` (exact copy is Claude's Discretion).
4. Invitation lookup becomes optional and secondary: `const invitation = await models.Invitation.findOne({ where: { registeredUserId: target.id } });` — may be `null`. The transaction's invitation-update block becomes conditional (`if (invitation) { await invitation.update(...) }`), mirroring the *existing* `if (target)` conditional pattern already present in `rejectInvitation` above (this project already has the exact "optional related row inside a transaction" idiom to copy).
5. Audit action names become `'user.approved'` / `'user.rejected'` (D-06); `invitationId: invitation?.id ?? null` (was previously always non-null since the invitation was the required starting point — now it is genuinely optional).
6. Return value: `return target;` (was `return invitation;`) — matches D-02 and the new GraphQL return type `User!`.

### Call sites that must move or be deleted (exhaustive grep, verified)

Grep for `approveInvitation|rejectInvitation` across the entire repo (excluding `node_modules`) returns exactly these files:

| File | What references it | Action required |
|------|---------------------|------------------|
| `backend/src/resolvers/invitation.resolver.js:78,107` | The two mutation implementations | **Delete both mutations entirely** (D-01) — keep `Query.myInvitations`, `Query.invitations`, `Query.pendingRegistrations`, `Mutation.createInvitation`, and the `Invitation.inviter`/`Invitation.registeredUser` field resolvers untouched |
| `backend/src/schemas/invitation.schema.js:51-52` | `approveInvitation(invitationId: ID!): Invitation!` / `rejectInvitation(invitationId: ID!, reason: String): Invitation!` in `extend type Mutation` | **Delete both lines** from the SDL; `pendingRegistrations` query and `Invitation` type stay |
| `backend/src/resolvers/approveReject.test.js` (all 134 lines) | Full test suite for both mutations, `pendingRegistrations` query tests | **Rewrite in place** — per CONTEXT.md's Claude's Discretion note, this is "the natural home to move/rewrite rather than a new parallel file." The `pendingRegistrations query` describe block (lines 118-134) should stay here unchanged since that query is not moving. |
| `frontend/src/pages/ApprovalsPage.jsx:38-39,79,94` | `APPROVE`/`REJECT` GraphQL mutation strings (`approveInvitation(invitationId: $id)` / `rejectInvitation(invitationId: $id, reason: $reason)`), and the two call sites passing `row.id` | **Rewrite**: mutation strings become `approveUser(userId: $id)` / `rejectUser(userId: $id, reason: $reason)`; call sites change `id: row.id` → `id: row.registeredUser.id` (D-10) |
| `frontend/src/pages/ApprovalsPage.test.jsx` (all 83 lines) | Asserts `graphqlRequest` was called with strings containing `'approveInvitation'`/`'rejectInvitation'` and `{ id: '5' }` (the invitation id, which happens to equal the registeredUser id `'9'` only coincidentally in the fixture — **note:** the fixture's `ROW.id` is `'5'` (invitation id) but `ROW.registeredUser.id` is `'9'` — these are different values in the current fixture, which is good: it means the rewritten test can assert the mutation is called with `'9'`, definitively proving the cutover to account-id addressing, not invitation-id) | **Rewrite**: update the mocked mutation names and expected variables to `{ id: '9' }` matching `registeredUser.id`, not `row.id` |

**Files that reference the *feature* but NOT the specific mutation names (no change required for D-01, verified by direct read):**
- `frontend/src/pages/InvitationsPage.jsx` — composes `ApprovalsPage` as a child; contains no mutation strings itself.
- `frontend/src/pages/InvitationsPage.test.jsx` — mocks `graphqlRequest` generically by matching on `query.includes('myInvitations')` / `query.includes('pendingRegistrations')`; it never asserts on `approveInvitation`/`rejectInvitation` literal strings and does not exercise the approve/reject click path. **This file does not need to change** as long as `ApprovalsPage`'s `pendingRegistrations` query shape (its request, not its mutations) stays the same — which D-10 guarantees. (CONTEXT.md's Integration Points list names this file as needing to "move with D-01" — direct inspection shows it does not literally reference the removed mutation strings; flagging this as a minor correction so the planner doesn't spend a task on a file that needs no edit. Worth a quick actual test run after the `ApprovalsPage.jsx` change to confirm it still passes, but no source edit is anticipated.)
- `.planning/milestones/v4.0-phases/29-.../deferred-items.md`, `.planning/phases/30-.../30-CONTEXT.md`, `30-DISCUSSION-LOG.md` — planning docs, not code; no action.

## Migration Convention (verified against 018, 016, 017, 015 house style)

Reading `018-add-family-members-geez-names.sql`, `016-create-invitations.sql`, `017-create-audit-logs.sql`, and `015-add-users-status.sql` together establishes a consistent house style:

1. **Header comment block** always states: (a) "Manual, one-time migration" + which phase/milestone introduced it, (b) that `sequelize.sync()` does NOT apply it (`sync()` creates tables on brand-new DBs but never alters existing tables' columns — verbatim from `018`'s header), (c) who must run it and when (before booting a backend that expects the new column/table).
2. **Idempotency guards:** `CREATE TABLE` statements use `IF NOT EXISTS` (`016`, `017`). `ALTER TABLE ... ADD COLUMN` statements (`015`, `018`) do **not** use a guard (MySQL/MariaDB's `ADD COLUMN IF NOT EXISTS` support is inconsistent across versions) — the convention accepts that re-running an `ALTER TABLE ADD COLUMN` twice will error, and relies on the "manual, one-time" discipline instead of DDL-level idempotency for column additions.
3. **Column types:** `DATETIME NULL DEFAULT NULL` for timestamps (`approvedAt`/`rejectedAt` in both `016`'s `invitations` table and expected for the new `users` columns); `TEXT NULL DEFAULT NULL` for free-text reason fields (`rejectionReason` in `016`); `INT UNSIGNED NULL DEFAULT NULL` for FK-shaped id columns.
4. **FKs:** used consistently in `CREATE TABLE` statements (`016`, `017` both declare `CONSTRAINT fk_... FOREIGN KEY ... REFERENCES ... ON DELETE SET NULL ON UPDATE CASCADE`), but `ALTER TABLE ADD COLUMN` migrations on existing tables (`015`, `018`) do **not** add FKs in the same statement — they add plain columns. For `approvedBy` specifically, Claude's Discretion (per CONTEXT.md) is open on whether it gets a real FK; the *existing* precedent for the identical column name is `invitations.approvedBy`, which DOES have `CONSTRAINT fk_invitations_approved_by FOREIGN KEY (approvedBy) REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE` (`016-create-invitations.sql:33-34`) — but that FK was added at `CREATE TABLE` time, not via a later `ALTER TABLE`. Adding an FK via `ALTER TABLE ADD CONSTRAINT` on `users.approvedBy` referencing `users.id` (self-referential) is more involved than the plain-column precedent in `015`/`018`. **Recommendation for the planner:** given the ALTER-TABLE-on-existing-table precedent (`015`, `018`) never adds FKs, and `audit_logs.actorUserId` (a very similar "who did this" column) also has no special self-referential complexity concern voiced anywhere in the codebase, the simpler plain-`INT UNSIGNED NULL` choice matches the stronger, more relevant precedent (existing-table ALTER, not new-table CREATE).
5. **Portability note:** `018`'s migration explicitly documents avoiding MySQL-8-only collation/encryption tokens so the SQL applies unchanged to both local MariaDB and prod MySQL 8.4 (F-03's precedent). The new `019-*.sql` should carry the same portability discipline, though timestamp/text/int columns have no MySQL-vs-MariaDB portability hazard the way utf8mb4 collations do — so this is a lower-risk migration than `018` was.
6. **Numbering:** highest existing file is `018-add-family-members-geez-names.sql`; `019-add-users-approval-columns.sql` (D-04's exact filename) is next, confirmed no gap or collision.

### `Invitation.js`'s declaration of the four fields being mirrored

```javascript
// Source: backend/src/models/Invitation.js:19-22
approvedAt: { type: DataTypes.DATE, allowNull: true },
rejectedAt: { type: DataTypes.DATE, allowNull: true },
rejectionReason: { type: DataTypes.TEXT, allowNull: true },
// approvedBy is NOT declared here -- it is added by the Invitation.belongsTo(User, {as:'approver', foreignKey:{name:'approvedBy', allowNull:true}}) association in models/index.js:77-82
```

**Important nuance for the planner:** `Invitation.js` does NOT declare `approvedBy` as a plain field — it arrives via the Sequelize `belongsTo` association's `foreignKey` option (`backend/src/models/index.js:77-82`). If `User.js` mirrors this exactly, `approvedBy` would need a self-referential `User.belongsTo(User, { as: 'approver', foreignKey: { name: 'approvedBy', allowNull: true } })` in `models/index.js` rather than a plain-field declaration in `User.js`. Given CONTEXT.md leaves the FK-vs-plain-int choice to Claude's Discretion, either approach is legitimate — but if the planner chooses "no FK, plain unsigned int" (the simpler, more defensible option per the migration-convention finding above), `approvedBy` should then be declared as a plain field directly in `User.js` (alongside `approvedAt`/`rejectedAt`/`rejectionReason`), NOT via an association — because a plain int column with no FK doesn't need Sequelize association machinery to exist on the model.

### Sequelize sync/migration posture (confirms F-03)

- **Test DB:** `backend/test/globalSetup.js:11` runs `sequelize.sync({ force: true, match: /_test$/ })` on every test run — this **recreates tables from current model definitions**, so adding fields to `User.js` alone makes them exist and be exercised by the backend test suite with zero manual SQL step required for tests to pass.
- **Dev/prod DB:** `initializeDatabase()` (`backend/src/models/index.js:118-121`) calls `sequelize.sync()` with no options at normal boot — this creates *new* tables but does **not** alter *existing* tables' columns (documented in every migration's header comment, and independently confirmed as a carried-forward blocker in `.planning/STATE.md`: *"`sequelize.sync()` does not alter existing tables — any... schema change... needs a manual `.sql` migration"*). This means: after this phase ships code that assumes `users.approvedAt` etc. exist, any already-provisioned local/prod database will throw SQL errors on the first `approveUser`/`rejectUser` call until `019-*.sql` is applied by hand. This is exactly F-03's scope boundary — the migration file must exist and be documented as a required manual step, but running it against a live database is explicitly out of this phase's automated-verification scope.

## Barrel Registration Mechanics (exact mechanism)

Already fully covered under "Architecture Patterns → Pattern 1" above. Summary for quick reference:
- `backend/src/resolvers/index.js` exports `resolvers = [userResolvers, familyMemberResolvers, invitationResolvers]` — a new `approvalResolvers` import + array entry is the entire registration step.
- `backend/src/schemas/index.js` exports `typeDefs = [userTypeDefs, familyMemberTypeDefs, invitationTypeDefs]` — same pattern, `approvalTypeDefs`.
- Both barrels are consumed by exactly one place, `backend/src/graphql/serverConfig.js`, which both `backend/src/server.js` (real boot) and `backend/test/helpers.js` (`graphql()` test helper, line 1-10) import from — so there is no second wiring path to miss.
- The new `approval.schema.js`'s SDL should use `extend type Mutation { approveUser(userId: ID!): User! rejectUser(userId: ID!, reason: String): User! }` — following the exact `extend type Mutation` pattern already used by `invitation.schema.js:49-53` and `familyMember.schema.js` (every non-`user.schema.js` module extends rather than redeclares `Mutation`/`Query`, since `user.schema.js` owns the base type declarations).

## Test Landscape

### Backend: `backend/src/resolvers/approveReject.test.js` (full structure, all 134 lines read)

- **Test server construction:** No local `ApolloServer` instantiation in the test file itself — it imports the shared `graphql(query, variables, user, clientIp)` helper from `backend/test/helpers.js`, which wraps a single module-scoped `ApolloServer` instance (constructed once from the real `typeDefs`/`resolvers`/`validationRules` via `serverConfig.js`) and calls `server.executeOperation({ query, variables }, { contextValue: { models, user, clientIp, loaders: createLoaders(models) } })`. This is Apollo's official test pattern (`executeOperation`), not a raw HTTP round-trip — `httpClient()`/`supertest` exists in the same helpers file but is not used by these tests.
- **User/invitation seeding:** A local helper function `pendingRegistration(email)` (lines 18-32) creates an ADMIN inviter, a `createTestUser({..., status: 'Pending', emailVerified: true})` registrant, and an `Invitation.create({..., status: 'Registered', registeredUserId: registrant.id})` — all three rows built directly via Sequelize models, no GraphQL calls involved in setup (setup bypasses the API layer entirely, only the mutation under test goes through GraphQL).
- **DB isolation:** `beforeEach(async () => { await resetTables(); vi.clearAllMocks(); })` — `resetTables()` (`backend/test/helpers.js:28-41`) disables FK checks, truncates `AuditLog`, `Invitation`, `Spouse`, `FamilyMember`, `User` in that order, re-enables FK checks. Runs before every `it()`, giving full row-level isolation per test on a single shared MySQL/MariaDB test database (not per-test transactions/rollback, not an in-memory DB) — matches `vitest.config.js`'s `pool: 'forks', fileParallelism: false` (tests run serially, safe for shared-DB truncation).
- **Audit assertions:** Direct Sequelize queries — `await models.AuditLog.findAll({ where: { action: 'invitation.approved' } })`, asserting `toHaveLength(1)` — no mocking of the audit table; it's a real row written by the real (un-mocked) `writeAuditLog` call.
- **Mailer mocking:** `vi.mock('../services/mailer.js', async (importOriginal) => ({ ...(await importOriginal()), sendAccountApprovedEmail: vi.fn().mockResolvedValue(undefined), sendAccountRejectedEmail: vi.fn().mockResolvedValue(undefined) }))` at the top of the file — partial mock (spreads the real module, only replaces the two email-sending functions), then asserts call args via `sendAccountApprovedEmail.mock.calls[0][0].to`. Because the resolver calls email/audit as fire-and-forget (`.catch()`, not `await`ed), assertions on them use `await vi.waitFor(() => expect(...).toHaveBeenCalledTimes(1))` to avoid a race between the test's own assertion and the un-awaited promise inside the resolver.
- **Existing emailVerified fixture value:** `pendingRegistration()`'s registrant is created with `emailVerified: true` explicitly (line 20) — meaning the *existing* approve/reject tests will NOT break under the new D-08/D-09 guard (they already satisfy it). A **new** test is required to actually exercise the unverified-refusal path (F-01) — nothing today creates an `emailVerified: false` + `status: 'Pending'` + `status: 'Registered'` invitation combination and attempts to approve/reject it.

### Frontend: `frontend/src/pages/ApprovalsPage.test.jsx` (full structure, all 83 lines read)

- **GraphQL mocking:** `vi.mock('../api/graphqlClient.js', () => ({ graphqlRequest: vi.fn() }))` — the entire axios-based client is mocked at the module level; no MSW, no network interception. Each test chains `.mockResolvedValueOnce(...)` calls in the exact sequence the component is expected to fire them (load → mutation → refetch).
- **Assertion style:** `expect(graphqlRequest).toHaveBeenCalledWith(expect.stringContaining('approveInvitation'), { id: '5' })` — asserts on the mutation string content (substring match) and the exact variables object. This is the pattern the new tests must mirror with `'approveUser'`/`'rejectUser'` and `{ id: '9' }` (the `registeredUser.id`, not `row.id` — see call-site table above).
- **Fixture:** `ROW` constant (lines 12-21) already includes `registeredUser: { id: '9', name: 'Joseph Q', email: 'joe@example.com', emailVerified: true }` — the emailVerified field the D-11 disabled-state logic needs is already present in the fixture; a **new** fixture variant (`emailVerified: false`) is needed to test the disabled-button/waiting-state behavior.
- **Rendering library:** `@testing-library/react` `render`/`screen`/`waitFor` + `@testing-library/user-event` for click/type interactions — standard RTL, matches every other frontend page test in this codebase (no custom render wrapper needed here since `ApprovalsPage` takes no props and has no routing/context dependency).

### Frontend: `frontend/src/pages/InvitationsPage.test.jsx` (full structure, all 43 lines read)

- Mocks `useAuth` (`vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => useAuthMock() }))`) and `graphqlRequest` generically by query substring (`query.includes('myInvitations')`, `query.includes('pendingRegistrations')`) returning empty arrays.
- Only asserts presence/absence of section headings ("Invite a family member", "Pending approvals") based on `user.role`. **Does not exercise or assert on `approveInvitation`/`rejectInvitation` at all** — confirmed by full read, no literal string match anywhere in the file. As noted above, no source change is anticipated for this file.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (both workspaces) [VERIFIED: npm ls] |
| Backend config | `backend/vitest.config.js` — `pool: 'forks'`, `fileParallelism: false` (serial, shared-DB-safe), `globalSetup: ['./test/globalSetup.js']` |
| Frontend config | RTL + `@testing-library/user-event`, jsdom (established, unchanged) |
| Quick run command | `npm test --workspace backend -- src/resolvers/approveReject.test.js` / `npm test --workspace frontend -- src/pages/ApprovalsPage.test.jsx` |
| Full suite command | `npm test --workspaces` (root `package.json` script, runs both) |

### Phase Requirements → Test Map

| Req/SC | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SC-1 (approve → sign in) | `approveUser` sets `User.status = 'Active'`; subsequent `login` succeeds | integration | `npx vitest run src/resolvers/approveReject.test.js -t approveUser` | ❌ rewrite from `approveInvitation` describe block |
| SC-1 (reject → blocked, existing message) | `rejectUser` sets `User.status = 'Rejected'`; `login` throws `'Your registration was not approved.'` | integration | same file, `-t rejectUser` | ❌ rewrite; existing assertion string already proven at `accountStatus.test.js:32` and `approveReject.test.js:114` — reuse verbatim |
| SC-2 (emails send) | `sendAccountApprovedEmail`/`sendAccountRejectedEmail` called with `{to, name[, reason]}` | integration (mocked mailer) | same file | ❌ rewrite; existing `vi.waitFor` pattern to reuse |
| SC-2 (audit logged) | `AuditLog` row with `action: 'user.approved'`/`'user.rejected'`, `actorUserId`, `targetUserId` | integration | same file | ❌ rewrite; existing `models.AuditLog.findAll({where:{action:...}})` pattern to reuse |
| SC-3 (non-admin refused) | `requireAdmin` throws `'Admin access is required.'` for both mutations | integration | same file | ❌ rewrite; existing assertion at `approveReject.test.js:65` to reuse verbatim |
| SC-4 (invitation rows still render) | `myInvitations`/`invitations` queries unaffected; `Invitation.inviter` resolver still works for non-admin inviters | integration | `createInvitation.test.js` (no change expected — untouched code path) | ✅ already exists, should stay green with zero edits |
| SC-5 (backend suite green, invitation happy path unchanged) | Full `npm test --workspace backend` green | full suite | `npm test --workspace backend` | ✅ — gate, not a new file |
| D-07 (only Pending dispositionable) | Approving/rejecting an `Active`/`Rejected`/`Disabled` account throws `'This account is not awaiting a decision.'` | integration | new `it()` in the rewritten test file | ❌ NEW — no existing coverage (old check was invitation-status-based, not user-status-based) |
| D-08/D-09 (verified email required) | Approving/rejecting an unverified `Pending` account throws the new error | integration | new `it()` in the rewritten test file | ❌ NEW — critical gap; nothing today creates this fixture combination |
| F-01 (new refusal pinned, not a regression) | Same test as D-08/D-09 above, explicitly named/commented to show intent | integration | same new `it()` | ❌ NEW |
| D-05 (invitation still stamped when one exists) | After `approveUser`/`rejectUser` on an invited registrant, the `Invitation` row's `status`/`approvedAt`/`approvedBy` (or `rejectedAt`/`rejectionReason`) are updated | integration | new/rewritten `it()`, mirrors old `approveInvitation` test's `await invitation.reload(); expect(invitation.approvedAt)...` assertions (lines 50-52 of the old file) | ⚠️ rewrite of existing assertion, retargeted |
| D-06 (audit invitationId still populated) | Audit row for an invited registrant's approval has `invitationId` set (not null) | integration | same rewritten test | ⚠️ rewrite |
| No-invitation path (Phase 32 precursor, verify resolver doesn't crash) | Approving/rejecting a `Pending`+verified user with NO invitation row succeeds and writes `invitationId: null` in the audit log | integration | new `it()` | ❌ NEW — this scenario has zero existing coverage since every current registrant has an invitation; important regression-proofing for Phase 32 even though self-registration itself is out of scope |
| D-11 (unverified rows show disabled state) | `ApprovalsPage` renders a "waiting for email verification" indicator and disables Approve/Reject when `row.registeredUser.emailVerified === false` | component | `ApprovalsPage.test.jsx`, new `it()` with an unverified fixture row | ❌ NEW |
| D-10 (mutation called with account id) | Approve/reject call `graphqlRequest` with `{ id: row.registeredUser.id }`, not `row.id` | component | `ApprovalsPage.test.jsx`, rewritten existing tests | ⚠️ rewrite (fixture already has distinct `id`/`registeredUser.id` values, making this assertion meaningful) |

### Sampling Rate
- **Per task commit:** targeted file run (`npx vitest run <file>` in the relevant workspace)
- **Per wave merge:** `npm test --workspace backend` and `npm test --workspace frontend` separately
- **Phase gate (SC-5):** `npm test --workspaces` from repo root, full green, before `/gsd:verify-work`

### Wave 0 Gaps
- No new test *files* are needed — `approveReject.test.js` and `ApprovalsPage.test.jsx` already exist and are the designated homes (per CONTEXT.md's Claude's Discretion note). The gaps are new `it()` blocks within them, enumerated in the table above.
- One new migration file: `backend/migrations/manual/019-add-users-approval-columns.sql` (not a test file, but a Wave 0 prerequisite for the resolver code to run against any already-provisioned DB — the test DB self-provisions via `sync({force:true})` and does not need it).

**What CANNOT be proven by an automated test:**
- **Applying `019-*.sql` against a real local/prod database.** The backend test suite provisions its schema via `sequelize.sync({force:true})` reading current model definitions — it never executes the manual SQL file. Proving the SQL is byte-correct against a real MariaDB/MySQL instance (the way `018`'s header claims "verified to apply cleanly against local MariaDB") requires a manual step: run the file against a real local dev DB and confirm `DESCRIBE users;` shows the four new columns with the right types/nullability. This mirrors F-03 exactly and should be called out as a `checkpoint:human-verify` or manual-step task in the plan, not silently assumed.
- **Production apply.** Explicitly named in F-03 as a separate, explicit, non-phase step.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (unchanged) | JWT-based, untouched by this phase |
| V3 Session Management | No (unchanged) | `passwordChangedAt` revocation, untouched |
| V4 Access Control | Yes | `requireAdmin(user)` — server-side role check, reused verbatim; SC-3/APPR-04 directly test this |
| V5 Input Validation | Yes (minor) | `userId: ID!` is GraphQL-scalar-validated by Apollo; `reason: String` optional free text — reuses the existing `typeof reason === 'string' && reason.trim() ? reason.trim() : null` sanitization already present in `rejectInvitation` (`invitation.resolver.js:114`), no new validation surface |
| V6 Cryptography | No | Not touched — no tokens/hashes introduced by this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Non-admin calling `approveUser`/`rejectUser` directly via GraphQL (bypassing hidden UI) | Elevation of Privilege | `requireAdmin(user)` thrown synchronously at the top of the resolver body, before any DB read — exact existing pattern, adversarial test already proven at `approveReject.test.js:61-66` and must be replicated for both new mutation names |
| Repeat-click re-approving/re-rejecting an already-decided account, causing duplicate emails/audit rows | Tampering / Repudiation (weak audit trail if allowed) | D-07's `status === 'Pending'` guard closes this — the "already decided" state throws before any side effect fires |
| Approving/rejecting an account whose email was never proven to belong to the person | Spoofing | D-08/D-09's `emailVerified === true` guard — this is the core new security-relevant behavior change in this phase, and per F-01 must be pinned by its own adversarial-style test (approve an unverified account, expect refusal), not merely a documentation note |
| Invitation-row tampering via the now-optional invitation lookup (e.g., could a caller pass a `userId` that maps to someone else's invitation?) | Tampering | Not applicable — `Invitation.findOne({ where: { registeredUserId: userId } })` is a server-side lookup keyed off the already-validated `userId`, with no attacker-controlled invitation id in the new mutation's arguments at all (this is actually a *smaller* attack surface than today's `invitationId`-keyed mutations, since there's no `invitationId` argument to try tampering with) |

## Runtime State Inventory

This phase is a refactor/relocation, so this section applies. All five categories checked explicitly:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Production has 3 Active users, 0 Pending users, invitations 2 Approved + 1 Expired (per `.planning/REQUIREMENTS.md` "Out of Scope" section, confirmed checked before v4.1 scoping). **Nobody is currently in a `Registered`/awaiting-approval state in production.** No data migration for in-flight approvals is needed — this was explicitly verified and excluded from milestone scope. | None — confirmed by prior audit, not this phase's job to re-verify |
| Live service config | None found. No external service (n8n, Datadog, etc.) references these mutation names or the `users.status` values. This is a self-contained GraphQL API with no external config surface. | None |
| OS-registered state | None. No cron jobs, task schedulers, or process managers reference `approveInvitation`/`rejectInvitation` by name (verified via the exhaustive grep above — only source code and test files match). | None |
| Secrets/env vars | None. No env var name references "approve"/"reject"/"invitation" in `env/*.env` or `backend/src/config/env.js` (confirmed — the env var list in CLAUDE.md's Configuration section contains no such names). | None |
| Build artifacts / installed packages | None. This phase adds no new dependencies and renames no packages/directories — only relocates resolver/schema code within the existing `backend/src/resolvers/` and `backend/src/schemas/` directories. No `package.json` change, no stale `egg-info`-equivalent risk. | None |

**The canonical question answered:** After every file in the repo is updated (mutations moved, schema SDL changed, migration applied), the only runtime state that "remembers" the old shape is the **audit log's historical rows** (`action: 'invitation.approved'`/`'invitation.rejected'` from before this phase) — and D-06 explicitly calls this out as intentional, accurate history, not something to migrate or rewrite (audit logs are append-only by design, `backend/src/models/AuditLog.js:19` `updatedAt: false`).

## Risks and Landmines (explicitly investigated per the task brief)

### 1. Does `pendingRegistrations` or the login gate read any field the cutover changes?

**`pendingRegistrations`** (`invitation.resolver.js:25-28`): `models.Invitation.findAll({ where: { status: 'Registered' }, order: [['registeredAt', 'DESC']] })` — reads only `Invitation.status`, a field this phase does not touch (D-05 preserves the invitation-side status transitions exactly). **No risk.**

**Login gate** (`user.resolver.js:179-189`, `auth.js:29-33`): reads only `User.emailVerified` and `User.status`. This phase writes to `User.status` (unchanged set of values: `'Active'`/`'Rejected'`) via the same mechanism as before (D-01's replacement mutations write the identical enum values). **No risk** — confirmed by direct read that the login resolver has zero code changes proposed anywhere in this research or CONTEXT.md.

**Landmine actually found:** `pendingRegistrations` does NOT check `emailVerified` (see Summary above) — meaning `ApprovalsPage` will keep listing unverified registrants (as it does today), but after this phase, clicking Approve/Reject on one will throw a server error unless D-11's UI-side disabling is implemented. **This is exactly why D-11 is in scope for this phase** — without it, SC-1/SC-2 would appear to regress from the admin's point of view (a visible, clickable button that now fails).

### 2. Does anything besides approve/reject write `User.status`?

Confirmed via `grep -rn "status:" backend/src` and `grep -rn "\.status\s*="`: the only writers are (a) `register` (`user.resolver.js:141`, sets `'Pending'` on create) and (b) the two mutations being moved (`invitation.resolver.js:89,118`, setting `'Active'`/`'Rejected'`). **No other writer exists.** Safe to relocate without auditing a third call site.

### 3. Does the audit-log action-name change (D-06) get read anywhere as a filter/label/assertion?

Confirmed via `grep -rln "invitation\.approved\|invitation\.rejected\|invitation\.registered\|invitation\.created\|user\.approved\|user\.rejected"`: matches are `user.resolver.js` (writes `'invitation.registered'`, untouched by this phase), `invitation.resolver.js` (writes the two names being renamed), and three test files (`approveReject.test.js`, `createInvitation.test.js` doesn't match — actually only `approveReject.test.js` reads `'invitation.approved'`/`'invitation.rejected'` as filter values in `AuditLog.findAll({where:{action:...}})`). **No frontend code, no UI label map, no dashboard filter references these action-name strings anywhere in the repo.** The only place the string change matters is inside the test file being rewritten as part of this same phase.

### 4. Is `emailVerified` reliably populated for accounts arriving through the current invitation flow?

**No — and this is the single most important finding of this research.** `register.test.js:53` proves `expect(user.emailVerified).toBe(false)` immediately after registration, and the invitation flips to `'Registered'` (entering `pendingRegistrations`) at that same moment, with verification happening later and independently via `verifyEmail`. This means:
- **Today**, an admin CAN approve a registrant before they've verified their email (nothing in the current code prevents it).
- **After this phase**, D-08/D-09 will make that throw an error — a genuine behavior change on the invitation path, not merely a new check on a path that was already impossible.
- **Existing test fixtures are NOT at risk**: `approveReject.test.js`'s `pendingRegistration()` helper explicitly sets `emailVerified: true` (line 20), so none of the 6 existing tests in that file exercise the now-blocked unverified-approval path — meaning the existing suite will stay green without modification to its fixtures, but a **new** test is required to actually prove D-08/D-09/F-01 (see Validation Architecture table — flagged NEW, not a rewrite).

### Conflicts with Locked Decisions

**None found.** Every locked decision (D-01 through D-11) was checked against the actual current code and is implementable as written:
- D-01/D-02/D-03: confirmed against real precedent (`linkUserToMember`/`updateUser` return shape, existing barrel pattern).
- D-04/D-05: confirmed the four Invitation fields exist exactly as described and the transaction-order precedent to mirror.
- D-06: confirmed no reader of the old action-name strings exists outside the test file being rewritten in this same phase.
- D-07/D-08/D-09: confirmed these are net-new guards (no existing equivalent check to conflict with), and confirmed via `register.test.js` that D-08/D-09 constitutes a real (if narrow, per F-01) behavior change worth its own test.
- D-10/D-11: confirmed `ApprovalsPage.jsx:32-33` already fetches every field D-10/D-11 need (`registeredUser { id name email emailVerified }`), so no query change is required — only mutation-call and disabled-state UI logic changes.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `approvedBy` should be a plain `INT UNSIGNED NULL` column on `users` (no FK), based on the `015`/`018` "ALTER TABLE on existing table never adds FKs" precedent, rather than mirroring `invitations.approvedBy`'s FK (which was added at `CREATE TABLE` time, a different precedent). | Migration Convention section | Low — CONTEXT.md explicitly leaves this to Claude's Discretion; if the planner instead chooses a self-referential FK, it is still a valid, decision-compliant choice, just a different implementation of an open discretion point, not a wrong assumption to correct |
| A2 | `InvitationsPage.test.jsx` requires zero source changes because it does not literally reference `approveInvitation`/`rejectInvitation` anywhere. | Code the Phase Changes → Call sites table | Low-medium — if this assumption is wrong (e.g., a future snapshot test or a hidden dependency on `ApprovalsPage`'s exact button labels changes), the fix is a one-line test update; worth a quick actual `npx vitest run` confirmation after `ApprovalsPage.jsx` changes land, called out explicitly in this research so the planner doesn't skip verifying it |

**All other claims in this research are `[VERIFIED]`** via direct `Read`/`Bash grep`/`cat` of the actual files in this repository at commit time — this is a brownfield-move phase, not a technology-selection phase, so almost nothing here rests on training-data knowledge or external documentation. No package versions were sourced from training data or WebSearch; all versions above came from reading `package.json`/`npm ls` directly in this repo.

## Open Questions (RESOLVED)

1. **RESOLVED: Should the new `approval.resolver.js` also relocate the `pendingRegistrations` query, or does it stay in `invitation.resolver.js`?**
   - What we know: D-10 says "`pendingRegistrations` stays invitation-shaped" and CONTEXT.md's canonical refs list `invitation.schema.js` as owning "the mutations being removed and the `pendingRegistrations` query that stays" — this reads as staying in the invitation module.
   - What's unclear: whether "stays" means "stays in `invitation.resolver.js`" (my reading) or "stays conceptually the same but could physically live anywhere."
   - Recommendation: keep `pendingRegistrations` in `invitation.resolver.js`/`invitation.schema.js` exactly where it is today — this matches the plain-reading of D-10 and requires zero file movement for a query this phase explicitly says is out of scope to change.

2. **RESOLVED: Does the D-08/D-09 error message need to be distinct for approve vs. reject, or can both share one string?**
   - What we know: CONTEXT.md's Claude's Discretion section covers "error message wording" generally; D-09 states "one symmetric rule for both actions."
   - What's unclear: whether "symmetric rule" implies identical wording or just identical logic.
   - Recommendation: one shared message/guard function (e.g., a small local helper called from both mutations) — minimizes duplication and matches the "one rule, not two" philosophy stated explicitly in CONTEXT.md's Specific Ideas section.

## Sources

### Primary (HIGH confidence — direct repository inspection)
- `backend/src/resolvers/invitation.resolver.js` (full file, 159 lines) — reference implementation being moved
- `backend/src/schemas/invitation.schema.js`, `backend/src/schemas/user.schema.js` (full files) — SDL precedent for D-02
- `backend/src/models/User.js`, `backend/src/models/Invitation.js`, `backend/src/models/AuditLog.js`, `backend/src/models/index.js` (full files) — model/association shape
- `backend/src/utils/audit.js`, `backend/src/utils/auth.js` (full files) — reused helper signatures
- `backend/src/services/mailer.js` (full file) — email function signatures
- `backend/src/resolvers/user.resolver.js` (full file) — confirms sole other writer of `User.status`, confirms `emailVerified: false` on invitation-flow registration
- `backend/src/resolvers/approveReject.test.js`, `backend/src/resolvers/register.test.js`, `backend/src/resolvers/createInvitation.test.js`, `backend/src/resolvers/accountStatus.test.js` (full files) — test harness and fixture behavior
- `frontend/src/pages/ApprovalsPage.jsx`, `frontend/src/pages/ApprovalsPage.test.jsx`, `frontend/src/pages/InvitationsPage.jsx`, `frontend/src/pages/InvitationsPage.test.jsx` (full files)
- `backend/migrations/manual/015-add-users-status.sql`, `016-create-invitations.sql`, `017-create-audit-logs.sql`, `018-add-family-members-geez-names.sql` (full files) — migration house style
- `backend/test/helpers.js`, `backend/test/globalSetup.js`, `backend/test/guard.js`, `backend/vitest.config.js`, `backend/src/graphql/serverConfig.js` (full files) — test infra
- `backend/package.json`, `frontend/package.json`, `npm ls vitest --workspaces` — installed versions
- `.planning/phases/30-approval-moves-to-the-account/30-CONTEXT.md` — locked decisions D-01..D-11, F-01..F-03
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/PROJECT.md`, `.planning/STATE.md`, `.planning/codebase/CONVENTIONS.md` — project/requirement context
- `grep -rn`/`grep -rln` across the full repo (excluding `node_modules`) for `approveInvitation`, `rejectInvitation`, `status:`, `.status =`, action-name strings, `emailVerified: false` — exhaustive call-site verification

### Secondary / Tertiary
None used — this phase required no external documentation lookup (no new libraries, no framework-version questions); every claim traces to a direct read of this repository's own files or its own test-run configuration.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new libraries, everything read directly from installed `package.json`/`npm ls`
- Architecture: HIGH — barrel pattern, transaction pattern, and return-type precedent all confirmed by direct code read against real, currently-passing code
- Pitfalls: HIGH — the two landmines (emailVerified gap, `pendingRegistrations` not filtering on it) are proven with exact test-file line citations, not inferred

**Research date:** 2026-08-27
**Valid until:** No expiry concern — this research is a snapshot of the current repository state, not of an external, evolving library ecosystem. It remains valid until the referenced files themselves change (i.e., until this phase or a conflicting concurrent change lands).
