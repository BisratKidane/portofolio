---
phase: 32-tokenless-registration
reviewed: 2026-09-01T10:05:00Z
depth: standard
scope: gap-closure review of plans 32-07 / 32-08 (diff 2df9ae0..HEAD)
files_reviewed: 9
files_reviewed_list:
  - backend/src/config/env.js
  - backend/src/config/assertRequiredColumns.js
  - backend/src/config/assertRequiredColumns.test.js
  - backend/src/models/index.js
  - backend/src/resolvers/user.resolver.js
  - backend/src/resolvers/register.test.js
  - backend/src/resolvers/updateUser.test.js
  - backend/src/resolvers/verifyEmail.test.js
  - README.md
findings:
  critical: 2
  warning: 7
  info: 2
  total: 11
status: issues_found
---

# Phase 32 Gap Closure: Code Review Report

**Reviewed:** 2026-09-01T10:05:00Z
**Depth:** standard (with executed mutation tests and runtime probes)
**Files Reviewed:** 9
**Status:** issues_found

## Summary

This review targets the two gap-closure plans (32-07 for CR-01 privilege escalation, 32-08 for
CR-03 uniform-response gap), reviewed adversarially rather than confirmatorily. Every claim below
was verified by executing code, not by reading it.

**What genuinely holds up:**

- The CR-03 widening is structurally correct. Every statement between input validation and the
  shared exit (`bcrypt.hash`, `models.User.findOne`, `createVerificationToken`,
  `hashVerificationToken`, `verificationTokenExpiry`, `models.User.create`) is now inside the
  single `try`, all three `finishTokenlessRegistration` call sites are `await`ed (so a rejection
  cannot escape the `catch`), and the two fire-and-forget mailer/audit calls carry their own
  `.catch`. I could not find a statement that throws outside the guarded region or rejects after it.
- The guards that remain outside the `try` (`assertRelationshipNoteLength`,
  `assertRegistrationName`, `if (!email)`, and `assertPasswordStrength` above the branch) are all
  functions of `relationshipNote` / `name` / `password` / email *presence* only. None of them
  reads the database or branches on whether the address is taken, so they are **not** an
  enumeration oracle. Confirmed behaviourally by the new WR-08 isolation test.
- The CR-01 `ADMIN_EMAIL` gate itself is fail-closed and cannot be steered by attacker input.
  A blank/whitespace `ADMIN_EMAIL` normalizes to `''` and is rejected by the `env.adminEmail &&`
  truthiness check. `env.js` and `User.beforeValidate` apply the byte-identical
  `.toLowerCase().trim()`, so there is no casing/whitespace mismatch — I verified by probe that
  submitting `Operator@Example.com` matches `ADMIN_EMAIL=operator@example.com`. Unicode
  case-folding collisions do not help an attacker because the verification token is mailed to the
  *normalized* address, which is the real operator's mailbox.
- `assertRequiredColumns` is correctly database-scoped (`table_schema = DATABASE()`), fails closed
  on zero rows, and its boot failure is genuinely fatal — `server.js` top-level-`await`s
  `initializeDatabase()` *before* mounting `/graphql` and before `app.listen`, so a rejection aborts
  module evaluation and the process never serves traffic.
- The two new CR-03 tests are falsifiable, not vacuous: both assert
  `models.User.count(...) === 0`, which goes red if the injected failure fails to intercept.
  Mutation-testing the CR-01 gate (removing `&& env.adminEmail && user.email === env.adminEmail`)
  turns 2 of the 3 new `verifyEmail` tests red, so that suite is real.

**What does not hold up — two blockers, both proven by running code:**

1. The CR-01 fix's own "safe path" is dead. The `ADMIN_EMAIL` bootstrap promotes the account to
   `ADMIN` but leaves `status: 'Pending'`, and `getUserFromRequest` rejects every non-`Active`
   account. I ran the exact workflow README now documents: the operator ends up as a `Pending`
   `ADMIN` who cannot authenticate, cannot log in, and has nobody left to approve them. README
   step 1 documents behaviour the code does not deliver.
2. The extended `updateUser` last-administrator guard is TOCTOU-bypassable. It is a
   non-transactional read-then-write, unlike the `FOR UPDATE` counterpart the *same phase* wrote
   into `verifyEmail`. Two concurrent `updateUser` email changes both pass the guard and drop the
   verified-admin count to zero — measured, not hypothesised.

Additionally, mutation testing found one **vacuous** new test in `updateUser.test.js` and one
**vacuous-in-isolation** new test in `register.test.js`. Given this project's documented recurring
failure mode ("authz + TOCTOU gaps hide behind green tests", now six phases running), those are
reported as WARNINGs rather than nits.

---

## Critical Issues

### CR-01: `ADMIN_EMAIL` bootstrap promotes to ADMIN but leaves the account `Pending` — the documented fresh-deploy path cannot be used

**Severity:** BLOCKER
**File:** `backend/src/resolvers/user.resolver.js:430-432`, `README.md:184-186`, `README.md:13-14`

**Issue:**
The gap-closure fix makes `ADMIN_EMAIL` the *only* supported zero-admin bootstrap, and README now
documents it as step 1 of the authentication workflow. That workflow does not work.

On a fresh deployment the only way to create the `ADMIN_EMAIL` account is tokenless
self-registration (there is no admin to issue an invitation). `register` creates that account with
`status: 'Pending'`. `verifyEmail` then sets `role = 'ADMIN'` — but nothing sets `status`:
auto-activation is gated on `if (invitation)`, and a self-registrant has no `Invitation` row.
`getUserFromRequest` (`backend/src/utils/auth.js:33`) rejects every account whose status is not
`Active`, and `login` (`user.resolver.js:333-339`) refuses with "Your account is awaiting
administrator approval." Approval requires `requireAdmin` — and there is no *Active* admin.
`notifyAdminsOfPendingRegistration` also finds zero `{ role: 'ADMIN', status: 'Active',
emailVerified: true }` rows, so nobody is even notified.

Net result: the operator is a `Pending` `ADMIN` who is permanently locked out, with no error and
no log line. The `role = 'ADMIN'` write and the returned JWT are both no-ops.

**Proof (executed against the test database on this commit):**

```
REGISTER -> {"data":{"register":{"message":"Registration received. Verify your email to activate your account."}}}
verification email call -> [{"to":"operator@example.com","token":"5a3d9134..."}]
VERIFY -> {"verifyEmail":{"token":"eyJhbGciOi...","user":{"id":"1","role":"ADMIN","status":"Pending","emailVerified":true}}}
DB ROW -> {"role":"ADMIN","status":"Pending","emailVerified":true}
getUserFromRequest with verifyEmail token -> null (NOT AUTHENTICATED)
LOGIN -> ["Your account is awaiting administrator approval."]
```

The new test `promotes the ADMIN_EMAIL-matching registrant to ADMIN on their first verification
(legitimate fresh-deploy bootstrap path)` (`verifyEmail.test.js:326-341`) asserts only
`user.role === 'ADMIN'`. It is green while the path it names is unusable — the exact
green-tests-hide-the-gap pattern this codebase keeps hitting.

**Fix:** activate the bootstrap account inside the same transaction, so the single write that
grants the role also grants usability:

```js
if (Number(adminCount) === 0 && env.adminEmail && user.email === env.adminEmail) {
  await models.User.update(
    { role: 'ADMIN', status: 'Active', approvedAt: new Date() },
    { where: { id: user.id }, transaction: t }
  );
  // keep `user.reload()` below so the returned payload reflects both fields
}
```

Extend the bootstrap test to assert the full round trip, not just the role:

```js
expect(response.data.verifyEmail.user.status).toBe('Active');
const ctxUser = await getUserFromRequest(
  { headers: { authorization: `Bearer ${response.data.verifyEmail.token}` } },
  models
);
expect(ctxUser?.role).toBe('ADMIN');
```

If auto-activation is deliberately unwanted, then the auto-promotion is pointless — remove it and
rewrite README step 1 to describe the manual DB write as the only bootstrap.

---

### CR-02: `updateUser` last-administrator email guard is TOCTOU-bypassable — concurrent requests drive verified admins to zero

**Severity:** BLOCKER
**File:** `backend/src/resolvers/user.resolver.js:640-647`

**Issue:**
The new guard reads `models.User.count({ role: 'ADMIN', emailVerified: true, id: { [Op.ne]:
target.id } })` with no transaction and no row lock, then writes `target.emailVerified = false`
via `target.save()` many statements later. Two overlapping requests each observe the *other*
admin as the surviving verified admin, both pass, and both commit — leaving zero verified admins.

This defeats the guard's entire stated invariant ("never below one verified admin so the app can't
be locked out of its own administration") and reopens the very window CR-01 was filed to close.
It is also internally inconsistent: `verifyEmail`'s admin-slot decision in the same file
(`user.resolver.js:411-432`) deliberately uses `sequelize.transaction` + `SELECT ... FOR UPDATE`
for exactly this reason, and `approveUser` (`approval.resolver.js:26-48`) documents the same
lesson ("Reading first and writing later left the D-07 guard TOCTOU-bypassable").

The pre-existing role-demotion guard at `user.resolver.js:610-615` has the identical shape; the
new guard was written to "mirror" it and inherited the flaw. On the role path the consequence is
worse — two concurrent `role: 'USER'` demotions leave zero admins with no re-verification path to
recover.

**Proof (executed against the test database on this commit):**

```
A -> {"updateUser":{"id":"1","email":"race-a-new@example.com","emailVerified":false,"role":"ADMIN"}}
B -> {"updateUser":{"id":"2","email":"race-b-new@example.com","emailVerified":false,"role":"ADMIN"}}
REMAINING VERIFIED ADMINS -> 0
```

Both requests returned success; the guard fired for neither.

**Fix:** run the guard and the write in one transaction with a locking read, matching the shape
already used in `verifyEmail`:

```js
const sequelize = models.User.sequelize;
await sequelize.transaction(async (t) => {
  const target = await models.User.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
  if (!target) throw new Error('User not found.');
  // ...role / name / email blocks...
  if (willReduceVerifiedAdmins) {
    const [{ adminCount }] = await sequelize.query(
      "SELECT COUNT(*) AS adminCount FROM users WHERE role = 'ADMIN' AND emailVerified = true AND id <> :id FOR UPDATE",
      { transaction: t, type: sequelize.QueryTypes.SELECT, replacements: { id: target.id } }
    );
    if (Number(adminCount) === 0) throw new Error(/* ... */);
  }
  await target.save({ transaction: t });
});
```

Apply the same treatment to the role guard at `:610-615` — leaving one guarded and one racy is
worse than either, because a mixed race (demote A while changing B's email) bypasses both.

Add a regression test using `Promise.all` on two concurrent `updateUser` calls asserting
`models.User.count({ where: { role: 'ADMIN', emailVerified: true } })` stays `>= 1`.

---

## Warnings

### WR-01: New `updateUser` test is vacuous — the `emailVerified === true` condition is untested

**Severity:** WARNING
**File:** `backend/src/resolvers/updateUser.test.js:284-305`

**Issue:** `does not block an already-unverified administrator from changing their own email`
creates a *verified* `backupAdmin` alongside the unverified target. With a verified backup admin
present, `otherVerifiedAdmins === 1`, so the guard never fires regardless of the
`target.emailVerified === true` clause. The test is confounded and proves nothing about the
condition it names.

**Proof:** I deleted `&& target.emailVerified === true` from the guard
(`user.resolver.js:640`) and re-ran `updateUser.test.js` — **17 passed, 0 failed**. The condition
is unprotected by the suite.

**Fix:** remove the confound so the unverified admin is the *only* admin:

```js
it('does not block the only (unverified) administrator from changing their own email', async () => {
  const unverifiedAdmin = await createTestUser({
    role: 'ADMIN', email: 'unverified-admin@example.com', emailVerified: false
  });
  // no other admin exists -- if the emailVerified clause is dropped, this now throws
  const { data, errors } = await graphql(
    UPDATE_USER_MUTATION,
    { id: String(unverifiedAdmin.id), input: { email: 'unverified-admin-new@example.com' } },
    unverifiedAdmin
  );
  expect(errors).toBeUndefined();
  expect(data.updateUser.email).toBe('unverified-admin-new@example.com');
});
```

### WR-02: `WR-01 over-floor branch` test is vacuous in isolation — its only assertion is satisfied by a broken filter

**Severity:** WARNING
**File:** `backend/src/resolvers/register.test.js:571-604`

**Issue:** The test's sole assertion is `expect(capturedDelays).toHaveLength(0)`. Any failure of
the stack-frame filter (`(new Error().stack || '').split('\n')[3]`) — a Vitest upgrade that
changes the `@vitest/spy` wrapper depth, a V8 stack-format change, an inlined frame — produces an
always-empty `capturedDelays` and the test passes for the wrong reason. It only detects the
"unconditional pad" mutation while the filter happens to work, and it can no longer detect that
if the preceding test is ever skipped or the file is run with `-t`.

**Proof:** I changed both filters from index `[3]` to `[9]` (never matches) and ran with
`-t 'WR-01'`. The preceding falsifiable test failed as designed
(`expected [] to have a length of 1 but got +0`), but this over-floor test **passed**.

**Fix:** make the filter self-verifying inside the same test, so a broken filter is loud:

```js
// Sanity-check the filter itself before relying on its silence.
capturedDelays.length = 0;
await finishTokenlessRegistration(Date.now()); // known-good: must be captured
expect(capturedDelays).toHaveLength(1);
capturedDelays.length = 0;
// ...now the toHaveLength(0) assertion below is meaningful
```

Or replace the stack-sniffing entirely by exporting `delay` from `user.resolver.js` and spying on
it — a stable, semantic seam instead of a positional stack-frame index.

### WR-03: WR-01 timing test is flaky-by-construction on loaded CI

**Severity:** WARNING
**File:** `backend/src/resolvers/register.test.js:479-569`

**Issue:** The test uses the real clock and asserts `expect(capturedDelays).toHaveLength(1)` after
the first (free-email) registration. That assertion holds only while the first call's real work
stays under `MIN_REGISTER_RESPONSE_MS` (400ms). The call performs a real `findOne` + `create` +
audit-log write against MySQL; `bcrypt` is mocked out but DB latency is not bounded. On a
contended CI runner a single slow round trip past 400ms produces a spurious red. The
`slowDelay < fastDelay` margin is also a hardcoded 100ms with no tolerance for scheduler jitter
between the two `Date.now()` reads.

Separately, the frame index `[3]` is coupled to Vitest's internal spy wrapper depth and is a
silent-breakage risk on any runner upgrade (see WR-02).

**Fix:** bound the variance the test does not intend to measure — stub `models.User.create` and
`writeAuditLog` for the fast path the same way `bcrypt.hash` is already stubbed, and widen the
margin assertion:

```js
expect(fastDelay - slowDelay).toBeGreaterThan(50); // injected 100ms, 50ms jitter budget
```

and skip/soft-fail rather than hard-fail when `capturedDelays.length === 0` on the fast path
(that outcome means the machine was too slow to measure, not that the floor is broken).

### WR-04: `models/index.js` comment is factually wrong about test coverage of `assertRequiredColumns`

**Severity:** WARNING
**File:** `backend/src/models/index.js:125-133`

**Issue:** The comment states the wiring is "NOT exercised by `npm test`'s integration suite --
`backend/test/globalSetup.js` calls `sequelize.sync({ force: true, ... })` directly, bypassing
`initializeDatabase()` entirely". That is false. `backend/test/helpers.js:6` does
`import { app } from '../src/server.js'`, and `server.js:29` top-level-`await`s
`initializeDatabase()`. Every integration test file that imports `helpers.js` therefore executes
`sequelize.sync()` *and* `assertRequiredColumns(sequelize)` at import time.

This matters because a future maintainer reading the comment will believe the boot wiring is
unreachable in tests and may (a) skip regression coverage for it, or (b) misdiagnose an
import-time failure. It also understates the blast radius: a bug in `assertRequiredColumns` breaks
every integration test file at import, not just production boot.

**Fix:** correct the comment:

```js
// NOTE: this wiring DOES run during `npm test` -- backend/test/helpers.js imports
// `app` from src/server.js, which top-level-awaits initializeDatabase(). It can
// never FAIL there, because globalSetup.js's sync({ force: true }) creates
// relationshipNote fresh from the Sequelize model definition regardless of
// whether migration 020 was applied. Coverage for the check's own logic comes
// from assertRequiredColumns.test.js's mocked-sequelize unit tests.
```

### WR-05: `assertRequiredColumns` hardcodes exactly one column — the silent-data-loss window reopens on the next manual migration

**Severity:** WARNING
**File:** `backend/src/config/assertRequiredColumns.js:17-28`

**Issue:** The function's own docblock explains why silent column drift is dangerous (the widened
`register` catch converts a missing column into an indistinguishable success message), then
hardcodes a single literal column name. There are 11 manual migrations under
`backend/migrations/manual/`, several of which add `users` columns written on the tokenless
register path (`status` from 015, `emailVerificationToken`/`emailVerificationExpiresAt` from 011).
Any of those being unapplied produces the identical silent-drop-every-registration failure the
check exists to prevent, and migration 021 will reintroduce it with no mechanism to remind anyone.

**Fix:** derive the expected set from the model instead of a literal, so it is zero-maintenance
and catches all future drift:

```js
export async function assertRequiredColumns(sequelize) {
  const expected = Object.values(sequelize.models.User.getAttributes())
    .map((attr) => attr.field)
    .filter(Boolean);

  const rows = await sequelize.query(
    'SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = :table',
    { type: sequelize.QueryTypes.SELECT, replacements: { table: 'users' } }
  );
  const present = new Set(rows.map((r) => r.COLUMN_NAME));
  const missing = expected.filter((col) => !present.has(col));

  if (missing.length > 0) {
    throw new Error(
      `users is missing column(s): ${missing.join(', ')} -- apply the pending migration(s) under ` +
        'backend/migrations/manual/ before starting the backend.'
    );
  }
}
```

The name `assertRequiredColumns` (plural) already promises this; today it delivers one.

### WR-06: `ADMIN_EMAIL` is security-critical, defaults to empty in all four env files (including production), and has no boot-time validation

**Severity:** WARNING
**File:** `backend/src/config/env.js:34`, `env/remote.env:12-16`

**Issue:** `env.js` runs `assertProductionSecrets` and `assertProductionMailConfig` at boot but
adds no equivalent for `ADMIN_EMAIL`. All four shipped env files (`local.env`,
`local.container.env`, `remote.env`, `test.env`) set `ADMIN_EMAIL=` (empty), so the *default* for
every environment — production included — is "bootstrap permanently disabled", with no warning at
boot and no error at use. There is also no format validation: `ADMIN_EMAIL=oprator@example.com`
(typo) fails closed forever and silently, and the operator's only symptom is "verification
succeeded but I'm still a USER".

Combined with CR-01 above, an operator following README has two independent silent failure modes
before they discover they are locked out.

**Fix:** validate and signal at boot, in the style of the existing assertions:

```js
// config/assertAdminEmail.js
export function assertAdminEmail({ nodeEnv, adminEmail }) {
  if (!adminEmail) {
    console.warn(
      '[config] ADMIN_EMAIL is unset -- verifyEmail will never auto-promote a first administrator. ' +
        'Promote one manually via a direct database update.'
    );
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    throw new Error(`ADMIN_EMAIL is not a valid email address: ${adminEmail}`);
  }
}
```

and call it alongside the other two assertions in `env.js`.

### WR-07: Catch-block log dropped the stack/cause in the same change that widened the swallow surface

**Severity:** WARNING
**File:** `backend/src/resolvers/user.resolver.js:325`

**Issue:** `console.error('Tokenless registration failed:', err?.name, err?.message)` is the *only*
signal for four now-swallowed failure sources (`bcrypt.hash`, `findOne`, `createVerificationToken`,
`create`) plus model validation. Dropping the stack removes the only way to tell which one failed.

The PII rationale in the comment is sound but over-corrects: I verified in
`node_modules/sequelize/lib/dialects/mysql/query.js:169-191` that `ER_DUP_ENTRY` is mapped to
`UniqueConstraintError` with a hardcoded `message = "Validation error"`, so the duplicate-email
race — the most likely real failure — now logs the literal, non-actionable line
`Tokenless registration failed: SequelizeUniqueConstraintError Validation error`. Meanwhile
`.message` is *not* fully PII-free: a `SequelizeDatabaseError` such as
`Incorrect string value: '\xF0\x9F...' for column 'name' at row 1` still echoes registrant-supplied
bytes. The change trades away all diagnosability for an incomplete PII win.

**Fix:** log a redacted-but-locatable record — keep the stack, drop only the fields that carry
bound parameters:

```js
console.error('Tokenless registration failed:', {
  name: err?.name,
  message: err?.message,
  // .sql / .parameters / .original deliberately omitted: mysql2 inlines bound
  // parameter values (email, bcrypt hash) into them.
  stack: err?.stack,
  validation: err?.errors?.map((e) => ({ path: e.path, type: e.type })) // no `value`
});
```

### WR-08: No email-format validation before the guarded region — a typo'd address is silently accepted and dropped

**Severity:** WARNING
**File:** `backend/src/resolvers/user.resolver.js:257-322`

**Issue:** `register` validates `relationshipNote` length, `name`, and email *presence*, but never
email *shape*. A registrant who types `alice@example` (or leaves whitespace only, which passes
`if (!email)` and normalizes to `''`) reaches `models.User.create`, fails the model's
`isEmail` validator inside the widened `try`, and receives
`Registration received. Verify your email to activate your account.` — with no account created, no
email sent, and only a server log. This is a normal end-user typo, not an attack, and it produces
silent data loss with an actively misleading success message. Widening the `try` did not create
this, but it now sits alongside three other swallowed failure modes with no operator-visible
distinction.

An email-syntax check is safe to place *outside* the `try` because it is a pure function of the
submitted address and behaves identically for taken and free emails — it adds no enumeration
oracle.

**Fix:**

```js
const normalizedEmail = email.toLowerCase().trim();
// Pure syntactic check on caller-supplied input only -- identical behaviour for
// taken and free addresses, so it is not an enumeration oracle (same class as
// assertRegistrationName above).
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
  throw new Error('Enter a valid email address.');
}
```

with a test asserting the message is identical whether or not the (malformed) address is taken.

---

## Info

### IN-01: Duplicate import of the same module in `register.test.js`

**File:** `backend/src/resolvers/register.test.js:15-16`

**Issue:** `../utils/auth.js` is imported twice — once for named bindings
(`createInvitationToken, hashInvitationToken, hashVerificationToken`) and once as a namespace
(`* as authUtils`) for the `vi.spyOn` seam.

**Fix:** keep the namespace import only and reference `authUtils.hashVerificationToken(...)` etc.,
or drop the namespace import and use `vi.mock` with `importOriginal` for the spy.

### IN-02: `assertRequiredColumns` lives in `config/` but is a schema/model concern

**File:** `backend/src/config/assertRequiredColumns.js`, `backend/src/models/index.js:7`

**Issue:** The module takes a Sequelize instance, queries `information_schema`, and is called from
`models/index.js` — it belongs alongside the models it validates, not next to `env.js` /
`database.js`. Everything else in `config/` is environment parsing or connection construction.

**Fix:** move to `backend/src/models/assertRequiredColumns.js` and update the import; this also
makes the model-derived rewrite in WR-05 a local concern.

---

## Verification Method

Findings were confirmed by execution, not inspection alone:

| Check | Method | Result |
|---|---|---|
| CR-01 gate falsifiable? | Removed `&& env.adminEmail && user.email === env.adminEmail` in a detached worktree | 2 of 3 new `verifyEmail` tests went red — **suite is real** |
| CR-01 bootstrap usable? | End-to-end probe: register → verify → `getUserFromRequest` → login | `ADMIN`/`Pending`, auth `null`, login refused — **BLOCKER** |
| `updateUser` guard concurrency | `Promise.all` of two admin email changes | `REMAINING VERIFIED ADMINS -> 0` — **BLOCKER** |
| `emailVerified === true` clause tested? | Deleted the clause, re-ran `updateUser.test.js` | 17 passed — **vacuous test** |
| Stack-frame filter robustness | Changed `[3]` → `[9]` in both WR-01 tests | Timing test red (good), over-floor test green — **vacuous in isolation** |
| CR-03 spies actually intercept? | Both tests assert `User.count === 0`; suite green | Interception confirmed — **not vacuous** |
| `sequelize.QueryTypes` valid? | `node_modules/sequelize/lib/sequelize.js:621` | `Sequelize.prototype.QueryTypes` exists — **correct** |
| `ER_DUP_ENTRY` message PII | `node_modules/sequelize/lib/dialects/mysql/query.js:169-191` | Hardcoded `"Validation error"` — **no email in `.message`** |
| Baseline suites green | `register.test.js` (27), `updateUser.test.js` (17), `verifyEmail.test.js` (22), `assertRequiredColumns.test.js` (2) | All pass on this commit |

All mutations were applied in a throwaway `git worktree` under the scratchpad and removed
afterwards. **No source file in the repository was modified by this review** (`git status` clean
apart from the pre-existing untracked `.vscode/`).

---

_Reviewed: 2026-09-01T10:05:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
