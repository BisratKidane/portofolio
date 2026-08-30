# Phase 32: Tokenless Registration - Pattern Map

**Mapped:** 2026-08-30
**Files analyzed:** 8 (5 modified backend source, 1 new migration, 1 new/modified test file set, schema)
**Analogs found:** 8 / 8 (all files have an existing analog in the same codebase — this phase is entirely additive/refactoring of existing modules, no new architectural shape)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/src/resolvers/user.resolver.js` (`register`) | resolver (mutation) | CRUD + request-response | itself, current `register` (`:114-174`) | exact — same function, extended |
| `backend/src/resolvers/user.resolver.js` (`notifyAdminsOfPendingRegistration`) | service-in-resolver-file (fire-and-forget notifier) | event-driven | itself (`:23-39`) | exact — same function, refactored |
| `backend/src/resolvers/user.resolver.js` (`verifyEmail`) | resolver (mutation) | CRUD + transactional | itself (`:238-342`) | exact — same function, one notifier call added |
| `backend/src/services/mailer.js` (`escapeHtml` + every template fn) | utility + service (email templating) | transform | none in-repo (new pure-function utility); the file's own `renderHtml`/`sendXEmail` functions are the shape to mirror | role-match (no escaping precedent anywhere) |
| `backend/src/utils/passwordPolicy.js` (note-length assertion) | utility (validation) | transform | `assertPasswordStrength` (`:1-3`), same file | exact |
| `backend/migrations/manual/020-add-users-relationship-note.sql` | migration | batch/DDL | `backend/migrations/manual/019-add-users-approval-columns.sql` | exact |
| `backend/src/schemas/user.schema.js` + new resolver `pendingApprovals` | route/schema + resolver (query) | CRUD (read) | `pendingRegistrations` (`invitation.resolver.js:34-55`, `invitation.schema.js:46`) for filter shape; `users`/`unlinkedUsers` (`user.resolver.js:100-107`) for `[User!]!` return shape | role-match, composite of two analogs |
| `backend/src/resolvers/register.test.js`, `verifyEmail.test.js`, `mailer.test.js`, `rateLimit.test.js` (new cases) | test | request-response / transform | each file itself (extend in place) | exact |

## Pattern Assignments

### `backend/src/resolvers/user.resolver.js` — `register` (mutation, CRUD, request-response)

**Analog:** itself, current implementation, lines 114-174. This is the literal base D-01 extends — read as "what stays byte-identical on the invited branch" and "where the tokenless branch forks in."

**Current structure (verbatim, lines 114-174):**
```javascript
    register: async (_parent, { token, name, password }, { models }) => {
      assertPasswordStrength(password);

      const invitation = await models.Invitation.findOne({ where: { tokenHash: hashInvitationToken(token) } });
      if (!invitation) throw new Error('This invitation link is invalid.');
      if (invitation.status === 'Expired' || invitation.expiresAt < new Date()) {
        if (invitation.status === 'Pending') {
          invitation.status = 'Expired';
          await invitation.save();
        }
        throw new Error('This invitation link has expired.');
      }
      if (invitation.status !== 'Pending') throw new Error('This invitation has already been used.');

      const email = invitation.invitedEmail;
      const existingUser = await models.User.findOne({ where: { email: email.toLowerCase().trim() } });
      if (existingUser) throw new Error('An account with this email already exists.');

      const verificationToken = createVerificationToken();
      const sequelize = models.User.sequelize;

      let createdUser;
      await sequelize.transaction(async (t) => {
        createdUser = await models.User.create(
          {
            name,
            email,
            passwordHash: password,
            status: 'Pending',
            emailVerificationToken: hashVerificationToken(verificationToken),
            emailVerificationExpiresAt: verificationTokenExpiry()
          },
          { transaction: t }
        );

        const [affected] = await models.Invitation.update(
          { status: 'Registered', registeredAt: new Date(), registeredUserId: createdUser.id },
          { where: { id: invitation.id, status: 'Pending' }, transaction: t }
        );
        if (affected === 0) throw new Error('This invitation has already been used.');
      });

      sendVerificationEmail({ to: email, token: verificationToken }).catch((err) => {
        console.error('Failed to send verification email:', err);
      });

      writeAuditLog(models, {
        action: 'invitation.registered',
        actorUserId: createdUser.id,
        invitationId: invitation.id,
        targetUserId: createdUser.id,
        metadata: { email }
      }).catch((err) => console.error('Failed to write audit log:', err));

      return {
        message: 'Registration received. Verify your email to activate your account.'
      };
    },
```

**Load-bearing details for the D-01 branch:**
- `assertPasswordStrength(password)` runs **before any token/email lookup** (line 115) — the tokenless branch must keep this ordering (mirrors D-09's "hash before lookup" reasoning: validation-before-work is already this file's convention, not new).
- `email` is a resolver-local `const` derived from `invitation.invitedEmail` at line 128, **never** from an argument — D-02 requires the tokenless branch's own `email` argument to only be read/normalized when `token` is absent, so the two branches must not share this `const` unguarded.
- The CAS idiom is `models.Invitation.update({...}, { where: { id, status: 'Pending' }, transaction: t })` + `if (affected === 0) throw`. The tokenless branch has no Invitation row to CAS against — this idiom does not apply there, only to the invited branch (keep it untouched).
- `sendVerificationEmail(...).catch(err => console.error(...))` (line 159) and `writeAuditLog(...).catch(...)` (line 163) are both fired **after** the transaction resolves, outside it, unconditionally on both branches — this is the fire-and-forget shape both branches reuse as-is.
- Return shape is a flat `{ message }` matching `RegisterPayload` — D-08's "identical message on both taken/free tokenless outcomes" must reuse this exact return, not add fields conditionally.

---

### `backend/src/resolvers/user.resolver.js` — `notifyAdminsOfPendingRegistration` (fire-and-forget notifier, event-driven)

**Analog:** itself, current implementation, lines 23-39 (verbatim):
```javascript
async function notifyAdminsOfPendingRegistration(models, { invitation, user }) {
  const admins = await models.User.findAll({ where: { role: 'ADMIN', status: 'Active' } });
  if (admins.length === 0) return;
  const inviter = invitation.inviterId ? await models.User.findByPk(invitation.inviterId) : null;
  await Promise.all(
    admins.map((admin) =>
      sendPendingRegistrationEmail({
        to: admin.email,
        newUserName: user.name,
        newUserEmail: user.email,
        inviterName: inviter?.name || 'Unknown',
        relationship: invitation.relationshipToFamily,
        note: invitation.invitationNote,
        registeredAt: user.createdAt || new Date()
      })
    )
  );
}
```
**Note:** this function is currently **dead code** — Phase 31 D-11 preserved it unused, specifically for this phase (confirmed: `register.test.js:62-85` asserts `sendPendingRegistrationEmail` is *not* called from `register`, and nothing in `user.resolver.js` currently calls `notifyAdminsOfPendingRegistration`). Grep confirms zero call sites in `src/`.

**D-13's exact one-line change target** — line 24's where-clause:
```javascript
const admins = await models.User.findAll({ where: { role: 'ADMIN', status: 'Active' } });
```
→ add `emailVerified: true` to this where-clause only. Do not touch `requireAdmin`, `isFunctioningAdmin`, or `updateUser`'s last-administrator count (`user.resolver.js:438-441`) — those are the other three divergent "admin" definitions Phase 31 WR-03 explicitly left alone.

**Refactor shape for the invitation-less caller (Claude's Discretion, D-12):** the function currently *requires* an `invitation` object for `inviterId`/`relationshipToFamily`/`invitationNote`. A self-registrant (D-12's caller from `verifyEmail`) has none of these. The two existing call-shape precedents in this file to choose between:
- **Plain-field arguments** — mirrors how `sendPendingRegistrationEmail` itself is already called with destructured plain values (`to, newUserName, newUserEmail, inviterName, relationship, note, registeredAt`), not an `invitation` object. Passing `{ user, relationshipNote: user.relationshipNote, inviterName: null }`-shaped plain fields from both callers (register's invited branch already has `invitation`, `verifyEmail`'s D-12 caller does not) is the lowest-friction refactor — it makes the function's signature match the mailer function's signature it already forwards to.
- **Two functions** — would duplicate the `admins.length === 0` guard and the `Promise.all(admins.map(...))` dispatch loop; the codebase's established preference is a single parametrized function per notifier (`sendPendingRegistrationEmail` itself is one function serving one template regardless of caller), so plain-field arguments is the closer fit to existing conventions.

---

### `backend/src/resolvers/user.resolver.js` — `verifyEmail` / `verifyAndPromote` (mutation, transactional, CRUD)

**Analog:** itself, current implementation, lines 238-342.

**Transaction boundary + locking read (lines 255-314, key excerpt lines 296-300):**
```javascript
            const inviter = await models.User.findByPk(invitation.inviterId, {
              transaction: t,
              lock: t.LOCK.UPDATE
            });
            const vouchedByAdmin = isFunctioningAdmin(inviter);
```
`lock: t.LOCK.UPDATE` is the codebase's locking-read idiom — reach for this if D-12's notifier needs a fresh read of anything mid-transaction (it should not: D-12 fires strictly after commit).

**Tail — the exact lines D-12 must not disturb the return of (lines 330-341):**
```javascript
      await user.reload();

      if (promotedInvitation) {
        writeAuditLog(models, {
          action: 'invitation.activated',
          actorUserId: user.id,
          invitationId: promotedInvitation.id,
          targetUserId: user.id
        }).catch((err) => console.error('Failed to write audit log:', err));
      }

      return { token: signToken(user), user };
```
The `writeAuditLog(...).catch(...)` call immediately above the `return` is the exact fire-and-forget shape D-12's admin notifier call should copy — same position (after `user.reload()`, before `return`), same `.catch((err) => console.error(...))` tail. D-12's condition ("no `Invitation` row and still `Pending` after commit") is checked with plain post-reload state: `if (!promotedInvitation && user.status === 'Pending' && user.role !== 'ADMIN' /* if relevant */)` — reuse the already-computed `promotedInvitation` (null for a tokenless self-registrant, since no `Invitation` row exists to find at line 276-279) rather than re-querying.

---

### `backend/src/services/mailer.js` — `escapeHtml` utility + every template function (D-07)

**No escaping precedent exists anywhere in the codebase** — verified: `grep -rln "escapeHtml\|escape-html\|sanitize-html\|dompurify" backend/src/` returns nothing, and `backend/package.json` has no `he`/`escape-html`/`sanitize-html` dependency. The three `sanitize`-named hits in the codebase (`sanitizeNewMember` in `user.resolver.js`, its test, and a comment in `familyMember.service.js`) are blank-string-to-null normalization, unrelated to HTML escaping. **CONTEXT.md's claim is confirmed correct.**

**Every interpolation site that D-07 must wrap in the new `escapeHtml`, by function and line:**

| Function | Line | Raw interpolation into HTML |
|----------|------|------------------------------|
| `renderHtml` (shared wrapper) | `:38` | `${heading}` |
| `renderHtml` | `:39` | `${intro}` |
| `renderHtml` | `:40` | `${ctaLabel}` (also `${ctaUrl}` in `href=` — URL-context, not text-context) |
| `renderHtml` | `:41` | `${note}` |
| `renderHtml` | `:42` | `${ctaUrl}` (link text, second occurrence) |
| `sendPasswordResetEmail` | `:75` (via `note:` arg into `renderHtml`) | `${env.resetTokenExpiresMinutes}` (numeric, low risk but still passes through) |
| `sendAccountApprovedEmail` | — | no untrusted interpolation (only `name` via `intro`/text, static copy) — but `name` still reaches `renderHtml`'s `note`/`intro` params in other functions, see below |
| `sendAccountRejectedEmail` | `:101` | `` `${reason ? `<br /><br /><em>Reason: ${reason}</em>` : ''}` `` — `reason` is admin-authored today but the escaping pass covers the whole file per D-07 |
| `sendPendingRegistrationEmail` | `:118` | `` `<strong>${newUserName}</strong> (${newUserEmail}) ... from <strong>${inviterName}</strong>${relationship ? ` as their ${relationship}` : ''} ... ${note ? `<br /><br /><em>Note: ${note}</em>` : ''}` `` — **this is the function D-07 names explicitly**: `newUserName` (self-registrant's own chosen name, attacker-controlled under D-01), `relationship`, and `note` (the new `relationshipNote`, attacker-controlled under D-06) all land here raw. `newUserEmail` also included, lower risk (validated by `isEmail`) but in scope per "every interpolated value."
| `sendInvitationEmail` | `:136` | `` `${from}${rel} ... ${note ? `<br /><br /><em>Note: ${note}</em>` : ''}` `` — `note` here is `invitationNote`, admin-authored (closes WR-07 per D-07's stated scope) |
| `sendVerificationEmail` | none in dynamic HTML beyond `link` (URL context) | — |

**Function inventory (all 7 template functions in the file, each takes an object arg and returns `sendMail({...})`):** `sendPasswordResetEmail` (`:66`), `sendAccountApprovedEmail` (`:81`), `sendAccountRejectedEmail` (`:95`), `sendPendingRegistrationEmail` (`:109`), `sendInvitationEmail` (`:127`), `sendVerificationEmail` (`:145`), plus the shared `renderHtml` (`:32`) they all funnel through. D-07's instruction ("every function in the file") means: add `escapeHtml` calls at the point each raw string enters `renderHtml`'s params (`heading`/`intro`/`ctaLabel`/`note`) or a template literal that becomes `intro`/`note`, in every one of the 6 `sendXEmail` functions — not just `sendPendingRegistrationEmail`. `ctaUrl` values are always internally constructed (`${env.clientUrl}/...?token=...`), never raw user input, so URL-context escaping is out of scope — only the `href="${ctaUrl}"` attribute values are pre-trusted; do not escape the URL itself with HTML-entity escaping (that would corrupt query-string `&` in a way the browser mis-renders — if double `&`-encoding is a concern, `text`/plain-text sibling values already pass URLs raw at `:69`,`:115`,`:133`,`:148` unescaped, matching existing convention).

**No existing test asserts template output/escaping** — `mailer.test.js` (64 lines) only covers `buildTransportOptions` (transport selection, not template rendering). D-07's tests are new coverage with no direct in-repo analog; nearest structural analog for pure-function unit-test style is `mailer.test.js` itself (`describe('fnName', () => { it('...', () => { expect(fn(input)).toBe/toContain(...) }) })`, no DB, no mocks needed since `escapeHtml` and the template functions returning `{ text, html }`-shaped `sendMail` args are pure).

---

### `backend/src/utils/passwordPolicy.js` — `assertPasswordStrength` (D-05's mirror target)

**Full file (verbatim, 3 lines):**
```javascript
export function assertPasswordStrength(password) {
  if (password.length < 8) throw new Error('Password must be at least 8 characters.');
}
```
**The exact idiom to mirror for D-05's note-length assertion:** a standalone named export, single guard-clause `if (condition) throw new Error('user-facing message.')`, no return value, called at the top of the resolver body before other work (called at `user.resolver.js:115`, before any DB access). D-05's new assertion (e.g. `assertRelationshipNoteLength` or inline in the resolver) should follow this exact shape: `if (note && note.length > 500) throw new Error('...')`. Because D-06 makes the note optional, the guard must short-circuit on falsy/empty note (unlike `assertPasswordStrength`, which has no such empty-guard since password is always required) — pattern this after `blankToNull`-style optional-field handling in `invitation.resolver.js:6-10` for the optionality half, and `assertPasswordStrength` for the throw-shape half.

---

### `backend/migrations/manual/020-add-users-relationship-note.sql` (D-04)

**Analog:** `backend/migrations/manual/019-add-users-approval-columns.sql`, full file (verbatim):
```sql
-- Manual, one-time migration (Phase 30 / APPR-01 / D-04).
--
-- This is NOT applied automatically by sequelize.sync() -- sync() creates
-- tables on brand-new databases but never alters an existing table's
-- columns. Any already-provisioned database (local dev, staging, prod)
-- must have these statements run by hand, once, before booting a backend
-- that expects the users.approvedAt/approvedBy/rejectedAt/rejectionReason
-- columns to exist.
--
-- These four columns mirror invitations' equivalent decision columns
-- (approvedAt/approvedBy/rejectedAt/rejectionReason) because a
-- self-registrant (Phase 32+) has no invitation row -- the account itself
-- must be able to carry its own approval/rejection decision.
--
-- approvedBy is a plain nullable unsigned int with NO foreign-key
-- constraint. This matches the ALTER-TABLE-on-an-existing-table precedent
-- (015, 018 -- both add zero FKs), not invitations.approvedBy's FK, which
-- was added at CREATE TABLE time (016) -- a different situation.
--
-- Portability: DATETIME / INT UNSIGNED / TEXT have no cross-engine hazard
-- the way 018's utf8mb4 collation choice did -- these column types apply
-- unchanged to both local MariaDB and prod MySQL 8.4.

ALTER TABLE users
  ADD COLUMN approvedAt DATETIME NULL DEFAULT NULL,
  ADD COLUMN approvedBy INT UNSIGNED NULL DEFAULT NULL,
  ADD COLUMN rejectedAt DATETIME NULL DEFAULT NULL,
  ADD COLUMN rejectionReason TEXT NULL DEFAULT NULL;
```
**Shape to copy verbatim:** header comment block explaining (1) manual/one-time nature and why `sync()` doesn't cover it, (2) why this column exists (mirror D-04's own reasoning: self-registrant has no Invitation row), (3) FK-or-not decision (this one has none needed — `relationshipNote` is a plain value column, no ambiguity), (4) portability note confirming `VARCHAR(500)` has no MariaDB/MySQL 8.4 cross-engine hazard (per F-04, this must be stated explicitly, matching 019's own explicit portability note). Then a single `ALTER TABLE users ADD COLUMN relationshipNote VARCHAR(500) NULL DEFAULT NULL;`. **Numbering confirmed:** highest existing manual migration is `019-add-users-approval-columns.sql`, so `020-...` is the correct next slug (`ls backend/migrations/manual/` confirms no `020` exists yet).

**Model-side counterpart (`backend/src/models/User.js`)** — how 019's columns were wired into the model (lines 61-74, verbatim comment + fields):
```javascript
      // Mirrors Invitation.js's four decision fields (approvedAt/approvedBy/
      // rejectedAt/rejectionReason). A self-registrant (Phase 32+) has no
      // invitation row, so the account itself must be able to carry its own
      // approval/rejection decision. Storage only here -- Plan 30-02's
      // approveUser/rejectUser resolvers are what actually write these
      // fields (D-04). Unlike Invitation.js's approvedBy (association-
      // derived), approvedBy here is a plain unassociated INTEGER.UNSIGNED
      // column -- no FK, matching the ALTER-TABLE-on-an-existing-table
      // precedent (015/018) rather than invitations.approvedBy's
      // CREATE-TABLE-time FK.
      approvedAt: { type: DataTypes.DATE, allowNull: true },
      approvedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      rejectedAt: { type: DataTypes.DATE, allowNull: true },
      rejectionReason: { type: DataTypes.TEXT, allowNull: true }
```
New field to add alongside these (same object, same style): `relationshipNote: { type: DataTypes.STRING(500), allowNull: true }` — `DataTypes.STRING(500)` is Sequelize's `VARCHAR(500)` mapping (matches the migration's column type exactly, same convention `email`/`name` already use for `DataTypes.STRING` without a length arg = default `VARCHAR(255)`; explicit `(500)` here for the wider cap).

---

### D-11 query — `pendingApprovals` (query resolver, CRUD read, request-response)

**Two analogs, composited:**

**1. `[User!]!` return shape + `requireAdmin` guard** — `backend/src/resolvers/user.resolver.js:100-107` (verbatim):
```javascript
    users: async (_parent, _args, { models, user }) => {
      requireAdmin(user);
      return models.User.findAll({ order: [['createdAt', 'DESC']] });
    },
    unlinkedUsers: async (_parent, _args, { models, user }) => {
      requireAdmin(user);
      return models.User.findAll({ where: { familyMemberId: null }, order: [['createdAt', 'DESC']] });
    }
```
This is the shape to copy for D-11: `requireAdmin(user)` as the first line, then a single `models.User.findAll({ where: {...}, order: [['createdAt', 'DESC']] })` returned directly — no serialization wrapper (unlike `me`'s `serializeUser`), since GraphQL field resolvers on `User` handle exposure.

**2. Two-condition admin-queue filter + purpose/comment style** — `backend/src/resolvers/invitation.resolver.js:34-55` (`pendingRegistrations`, verbatim relevant slice):
```javascript
    // Admin-only: invitations awaiting an approval decision. Narrowed (D-09) to
    // exclude registrants who are unverified (haven't proven the address yet)
    // or already Active (decision already made) -- a two-step query, not a
    // Sequelize `include`-with-`where` (no precedent for that shape anywhere
    // in this backend; see approval.resolver.js's registeredUserId lookup for
    // the closer analog). An orphaned row (no registeredUserId) always stays
    // reachable (D-10) since there's no account to check eligibility against.
    // Never writes Invitation.status -- read-only narrowing (D-08).
    pendingRegistrations: async (_parent, _args, { models, user }) => {
      requireAdmin(user);

      const registered = await models.Invitation.findAll({
        where: { status: 'Registered' },
        order: [['registeredAt', 'DESC']]
      });
      ...
    }
```
D-11's `pendingApprovals` is structurally **simpler** than `pendingRegistrations` — it needs no two-step join because both conditions (`status: 'Pending'`, `emailVerified: true`) live on `User` directly, so it collapses to the `users`/`unlinkedUsers` one-step shape with a two-key `where`:
```javascript
    pendingApprovals: async (_parent, _args, { models, user }) => {
      requireAdmin(user);
      return models.User.findAll({
        where: { status: 'Pending', emailVerified: true },
        order: [['createdAt', 'DESC']]
      });
    }
```
This exact `where: { status: 'Pending', emailVerified: true }` filter already exists once in the codebase as a sub-query, not a top-level query — `invitation.resolver.js:47` (`models.User.findAll({ where: { id: registeredUserIds, status: 'Pending', emailVerified: true }, attributes: ['id'] })`) — confirming the two-condition eligibility rule D-11 needs is already the codebase's established definition of "awaiting admin decision," just not yet exposed as its own top-level query.

**SDL placement** — extend `type Query` in `backend/src/schemas/user.schema.js:51-56` (add `pendingApprovals: [User!]!` alongside `users`/`unlinkedUsers`), following `invitation.schema.js:41-47`'s `extend type Query { ... }` block style if the field is added from a separate schema file, or directly in `user.schema.js` if added there (Claude's Discretion per CONTEXT.md — field lives on `User` data, so `user.schema.js`/`user.resolver.js` is the more consistent home, avoiding a cross-file `extend type Query`).

**Note:** `relationshipNote` must be added to the `User` GraphQL type (`user.schema.js:14-24`) for D-11's query to expose it — currently absent from the type entirely (only `Invitation.invitationNote` exists in the schema today).

---

### Backend test files — `register.test.js` / `verifyEmail.test.js` / test DB setup (F-02, F-04, D-02)

**Directory convention:** colocated `*.test.js` next to the resolver file it covers (`backend/src/resolvers/register.test.js` next to `user.resolver.js`'s `register`), not a separate `__tests__/` or `test/` tree. Shared test infrastructure lives in `backend/test/` (`helpers.js`, `dbEngine.js`, `fixtures/`).

**Test DB setup/reset** — `backend/test/helpers.js:28-41` (verbatim):
```javascript
export async function resetTables() {
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
  await models.AuditLog.destroy({ where: {}, truncate: true });
  await models.Invitation.destroy({ where: {}, truncate: true });
  await models.Spouse.destroy({ where: {}, truncate: true });
  await models.FamilyMember.destroy({ where: {}, truncate: true });
  await models.User.destroy({ where: {}, truncate: true });
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
}
```
Called via `beforeEach(async () => { await resetTables(); ... })` in every resolver test file. **No new table needed for Phase 32** (relationship note is a column on the existing `users` table), so this function needs no edit.

**Apollo `executeOperation` invocation** — `backend/test/helpers.js:12-26` (verbatim):
```javascript
export async function graphql(query, variables, user = null, clientIp = '127.0.0.1') {
  const response = await server.executeOperation(
    { query, variables },
    { contextValue: { models, user, clientIp, loaders: createLoaders(models) } }
  );
  return response.body.singleResult;
}
```
All resolver tests call this `graphql()` helper, never `server.executeOperation` directly. `clientIp` is a 4th optional param — the D-01 tokenless registration tests need this for SEC-02's rate-limit test (see below).

**Mailer mocking** — `register.test.js:5-9` (verbatim):
```javascript
vi.mock('../services/mailer.js', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendPendingRegistrationEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined)
}));
```
Module-level `vi.mock` factory, only mocking the functions that file's resolver calls; `import { sendVerificationEmail, sendPendingRegistrationEmail } from '../services/mailer.js'` afterward to get the mocked references for assertions. **`verifyEmail.test.js` currently has NO mailer mock at all** (grep confirms zero `vi.mock` in that file) — because `verifyEmail` today never calls the mailer. D-12 makes it the first caller, so the planner must **add** a `vi.mock('../services/mailer.js', ...)` block to `verifyEmail.test.js` mirroring `register.test.js`'s, importantly adding whichever `sendXEmail` function D-12's refactored notifier ends up calling (`sendPendingRegistrationEmail`, reused per D-12's own text: "matching the existing `sendVerificationEmail` and `writeAuditLog` call shapes").

**`vi.waitFor` around fire-and-forget side effects (F-02's mandatory pattern)** — `register.test.js:69-84` (verbatim, the complete representative test):
```javascript
  it('emails the verification link and does not notify admins (D-11)', async () => {
    await createTestUser({ role: 'ADMIN', email: 'admin@example.com' });
    const { rawToken } = await makeInvitation({ invitedEmail: 'ada@example.com' });

    const { errors } = await graphql(REGISTER_MUTATION, { token: rawToken, name: 'Ada', password: 'Password123!' });
    expect(errors).toBeUndefined();

    await vi.waitFor(() => {
      expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
    });
    expect(sendPendingRegistrationEmail).not.toHaveBeenCalled();
    expect(sendVerificationEmail.mock.calls[0][0].to).toBe('ada@example.com');

    const user = await models.User.findOne({ where: { email: 'ada@example.com' } });
    expect(hashVerificationToken(sendVerificationEmail.mock.calls[0][0].token)).toBe(user.emailVerificationToken);

    // writeAuditLog is fire-and-forget in register (user.resolver.js) -- the mutation returns
    // before the audit row is committed, so this assertion must poll like the
    // sendVerificationEmail one above rather than read the table once (post-merge race, 31-05).
    await vi.waitFor(async () => {
      const audits = await models.AuditLog.findAll({ where: { action: 'invitation.registered' } });
      expect(audits).toHaveLength(1);
    });
  });
```
This is the **exact** pattern F-02 mandates for D-12's new admin notifier test: `await vi.waitFor(() => { expect(mockedMailerFn).toHaveBeenCalledTimes(1); })`, never a bare read/assert immediately after `graphql()` resolves. F-02 explicitly cites this file's own prior incident (31-05 post-merge failure) as the reason.

**F-04 (MariaDB local / MySQL 8.4 CI+prod) explicit-skip pattern** — `verifyEmail.test.js` imports `isMariaDB` from `backend/test/dbEngine.js` (verbatim, full file):
```javascript
import mysql from 'mysql2/promise';
import { env } from '../src/config/env.js';

export async function isMariaDB() {
  const conn = await mysql.createConnection({
    host: env.database.host,
    port: env.database.port,
    user: env.database.user,
    password: env.database.password,
    database: env.database.name
  });

  try {
    const [rows] = await conn.query('SELECT VERSION() AS version');
    return /mariadb/i.test(rows[0].version);
  } finally {
    await conn.end();
  }
}
```
Any Phase 32 test whose assertion depends on MySQL-8.4-specific locking behavior (none currently anticipated — D-04's migration is portable per its own comment, and D-12's notifier is not lock-dependent) must import and branch on `isMariaDB()` explicitly rather than silently `.skip`, per F-04's own wording ("a skipped test is indistinguishable from a passing one" — if used, log/assert the skip reason visibly, matching how Phase 31's lock test is documented as still-open in `31-HUMAN-UAT.md` rather than silently green).

**D-02's adversarial regression test** — no direct existing analog (this is new coverage), but the closest structural sibling is `register.test.js`'s existing `makeInvitation()` helper (lines 21-34) plus the `REGISTER_MUTATION` constant — the new test extends `makeInvitation({ invitedEmail: 'alice@example.com' })` and calls `graphql(REGISTER_MUTATION_WITH_EMAIL, { token: rawToken, name: 'X', email: 'attacker@evil.com', password: 'Password123!' })` (note: the mutation string itself must be updated for the new `email` arg — current `REGISTER_MUTATION` constant at `register.test.js:14-18` only declares `$token, $name, $password`), then assert `models.User.findOne({ where: { email: 'alice@example.com' } })` exists and `models.User.findOne({ where: { email: 'attacker@evil.com' } })` is null.

---

### `backend/src/config/rateLimits.js` + `backend/src/plugins/rateLimitPlugin.js` (SEC-02, no code change)

**`register` entry** — `rateLimits.js:7` (verbatim, full file for context):
```javascript
export const RATE_LIMITS = {
  login: { max: 5, windowMs: 15 * 60 * 1000 },
  register: { max: 5, windowMs: 60 * 60 * 1000 },
  requestPasswordReset: { max: 5, windowMs: 60 * 60 * 1000 },
  resendVerificationEmail: { max: 5, windowMs: 60 * 60 * 1000 }
};
```

**`${clientIp}:${field}` keying** — `rateLimitPlugin.js:5-19` (verbatim):
```javascript
export function enforceRateLimit(clientIp, fieldNames) {
  for (const field of fieldNames) {
    const limit = RATE_LIMITS[field];
    if (!limit) continue;

    const key = `${clientIp}:${field}`;
    const allowed = checkAndIncrement(key, limit.max, limit.windowMs);

    if (!allowed) {
      throw new GraphQLError('Too many requests. Please try again later.', {
        extensions: { code: 'TOO_MANY_REQUESTS' }
      });
    }
  }
}
```
Keyed purely on GraphQL field name (`register`), not on mutation arguments — confirms SEC-02's "no code needed" claim: since D-01 keeps one `register` field for both branches, `RATE_LIMITS.register` applies identically regardless of whether `token` is present.

**Existing test already exercises this for the invited path** — `backend/src/resolvers/rateLimit.test.js:183-206` (verbatim, the complete representative test, `describe('register rate limiting (RATE-02)')`):
```javascript
describe('register rate limiting (RATE-02)', () => {
  it('rejects the 6th register attempt from the same IP within the window', async () => {
    const clientIp = '10.10.20.1';
    const responses = [];

    for (let i = 0; i < 6; i += 1) {
      responses.push(
        await graphql(
          REGISTER_MUTATION,
          { token: `invalid-token-${i}`, name: 'X', password: 'Password123!' },
          null,
          clientIp
        )
      );
    }

    for (let i = 0; i < 5; i += 1) {
      expect(responses[i].errors[0].message).toBe('This invitation link is invalid.');
    }
    expect(responses[5].errors[0].message).toBe(TOO_MANY_REQUESTS_MESSAGE);
  });
});
```
This test only exercises the **invited** (invalid-token) branch. Per CONTEXT.md Integration Points, SEC-02 "still wants an explicit test proving it, not just an argument" for the **tokenless** branch — the new test is this same shape with `token` omitted and a distinct `email`/`clientIp` per iteration (e.g. `email: \`probe-${i}@example.com\``, since the tokenless branch is enumeration-safe/always-succeeds per D-08, so the first 5 responses should assert the identical success message rather than an error, then the 6th asserts `TOO_MANY_REQUESTS_MESSAGE`). `resetRateLimitStore()` (imported in `rateLimit.test.js:4`, called in its `beforeEach`, `backend/test/helpers.js:43`) must run in `beforeEach` for this new `describe` block too, matching every existing block in the file.

---

## Shared Patterns

### Fire-and-forget side effects (applies to `register`'s tokenless branch, `verifyEmail`'s new notifier, and any new owner-notification email)
**Source:** `user.resolver.js:159-169` (`register`), `:332-338` (`verifyEmail`)
```javascript
sendVerificationEmail({ to: email, token: verificationToken }).catch((err) => {
  console.error('Failed to send verification email:', err);
});

writeAuditLog(models, {
  action: 'invitation.registered',
  actorUserId: createdUser.id,
  invitationId: invitation.id,
  targetUserId: createdUser.id,
  metadata: { email }
}).catch((err) => console.error('Failed to write audit log:', err));
```
**Apply to:** D-10's owner-notification email, D-12's admin notifier — both must be `.catch((err) => console.error('Failed to ...', err))`, called after the resolver's main transaction/return-path work, never `await`ed into the critical path.

### CAS (`UPDATE ... WHERE <precondition>` + `affected === 0`) idiom
**Source:** `user.resolver.js:152-156` (invitation consumption), `:231-235` (password reset token consumption), `:258-262` (verification token consumption)
```javascript
const [affected] = await models.Invitation.update(
  { status: 'Registered', registeredAt: new Date(), registeredUserId: createdUser.id },
  { where: { id: invitation.id, status: 'Pending' }, transaction: t }
);
if (affected === 0) throw new Error('This invitation has already been used.');
```
**Apply to:** not directly needed by D-01's tokenless branch (no row to CAS against — it's a fresh `User.create`), but relevant if D-09's precomputed-hash create needs any conditional guard; primarily documented here so the planner does not mistakenly invent a CAS where a plain `create` suffices.

### Guard-clause validation, thrown as `Error`, called before DB work
**Source:** `passwordPolicy.js:1-3`, called at `user.resolver.js:115`
```javascript
export function assertPasswordStrength(password) {
  if (password.length < 8) throw new Error('Password must be at least 8 characters.');
}
```
**Apply to:** D-05's note-length assertion — same file (`passwordPolicy.js`) or a new sibling utility, same throw-shape, called at the same position in `register` (immediately after/alongside `assertPasswordStrength`, before any DB lookup).

### `requireAdmin` guard as the first statement in every admin-only resolver
**Source:** `user.resolver.js:101,105`, `invitation.resolver.js:18,23,35`, `approval.resolver.js:21,67`
```javascript
requireAdmin(user);
```
**Apply to:** D-11's `pendingApprovals` query — first line of the resolver body, before any `models` call, matching every other admin-only query/mutation in the codebase without exception.

### `requireAdmin` import source
**Source:** `import { requireAdmin } from '../utils/auth.js';` (every resolver file that uses it)
**Apply to:** if D-11's query lives in a resolver file that does not already import `requireAdmin` (it will — `user.resolver.js` already imports it at line 9).

## No Analog Found

| File/Concern | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `escapeHtml` utility itself | utility (pure transform) | transform | No escaping helper exists anywhere in `backend/src/`, confirmed by grep across the codebase and `package.json` dependencies — this is genuinely new code, not a copy. Write as a minimal named-export pure function (`export function escapeHtml(value) { ... }`) in `mailer.js` itself or a new `backend/src/utils/escapeHtml.js`, following the file's existing named-export convention (`export function`/`export async function` throughout `mailer.js`). |
| Template-output/escaping tests | test | transform | `mailer.test.js` (64 lines) tests only `buildTransportOptions`, never template string output — no existing test reads `sendPendingRegistrationEmail(...)`'s returned `html`/`text` and asserts on content. New tests should call the exported template functions directly (they are plain async functions returning `sendMail({...})`'s argument object shape after `sendMail` itself is mocked, or refactor a template fn to be independently testable — Claude's Discretion at plan time) and assert `<script>`/`<`/`>`/`&` are entity-escaped in the `html` output for note/name fields specifically. |

## Metadata

**Analog search scope:** `backend/src/resolvers/`, `backend/src/schemas/`, `backend/src/services/`, `backend/src/utils/`, `backend/src/models/`, `backend/src/config/`, `backend/src/plugins/`, `backend/migrations/manual/`, `backend/test/`
**Files scanned (read in full or targeted):** `user.resolver.js`, `invitation.resolver.js`, `approval.resolver.js`, `user.schema.js`, `invitation.schema.js`, `User.js` (model), `mailer.js`, `mailer.test.js`, `passwordPolicy.js`, `019-add-users-approval-columns.sql`, `rateLimits.js`, `rateLimitPlugin.js`, `register.test.js`, `verifyEmail.test.js` (targeted sections), `rateLimit.test.js` (targeted sections), `backend/test/helpers.js`, `backend/test/dbEngine.js`
**Pattern extraction date:** 2026-08-30
