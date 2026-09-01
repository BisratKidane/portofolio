---
phase: 32-tokenless-registration
reviewed: 2026-09-01T14:23:45Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - backend/src/config/assertRequiredColumns.js
  - backend/src/config/assertRequiredColumns.test.js
  - backend/src/config/env.js
  - backend/src/models/index.js
  - backend/src/resolvers/pendingApprovals.test.js
  - backend/src/resolvers/rateLimit.test.js
  - backend/src/resolvers/register.test.js
  - backend/src/resolvers/updateUser.test.js
  - backend/src/resolvers/user.resolver.js
  - backend/src/resolvers/verifyEmail.test.js
  - backend/src/schemas/user.schema.js
  - backend/src/services/mailer.js
  - backend/src/services/mailer.test.js
  - backend/src/utils/escapeHtml.js
  - backend/src/utils/escapeHtml.test.js
  - backend/src/utils/namePolicy.js
  - backend/src/utils/namePolicy.test.js
  - backend/src/utils/relationshipNotePolicy.js
  - backend/src/utils/relationshipNotePolicy.test.js
findings:
  critical: 3
  warning: 12
  info: 0
  total: 15
status: issues_found
---

# Phase 32: Code Review Report

**Reviewed:** 2026-09-01T14:23:45Z
**Depth:** standard
**Files Reviewed:** 19
**Status:** issues_found

## Summary

This phase opens `register` to unauthenticated callers and adds two gap-closure fixes
(32-09 ADMIN_EMAIL bootstrap usability, 32-10 `updateUser` TOCTOU transaction). The
enumeration-silence work on the tokenless branch is genuinely thorough — uniform message,
pre-lookup bcrypt, uniform response floor, whole-body catch — and the HTML escaping in
`mailer.js` covers every attacker-reachable interpolation in the HTML bodies (nodemailer
also strips CR/LF from header values, so the raw `name` in `sendPendingRegistrationEmail`'s
subject is not a header-injection vector).

The defects are concentrated in the two gap-closure *fixes*, not in the original feature:

1. **32-09's bootstrap write rests on a documented unreachability argument that is
   provably false.** `updateUser` and `resendVerificationEmail` both reissue a live
   verification token with no account-status precondition, so a Rejected or Disabled
   account can re-enter `verifyEmail` and be written straight to `role: 'ADMIN',
   status: 'Active'` by the unconditional bootstrap update (CR-01).
2. **32-10's last-administrator guard counts non-functioning admins.** Both raw SQL
   counts filter on `role`/`emailVerified` but not `status`, so a Pending, Rejected or
   Disabled ADMIN row satisfies the "another administrator survives" check — while
   simultaneously blocking the ADMIN_EMAIL bootstrap that would otherwise be the recovery
   path. The result is an unrecoverable admin lockout (CR-03). The comment at
   `user.resolver.js:486-488` asserts the opposite of what the code does.
3. **The tokenless path validates name and note length but not email**, so the single
   most common user error — an email typo, or an address over the VARCHAR(255) column —
   is swallowed by the CR-03 catch-all and returned as "Registration received" with no
   row created (CR-02). `assertRequiredColumns.js`'s own docblock names exactly this
   failure mode ("silently accepting and dropping every self-registration") as
   unacceptable; the check it added closes one instance of it and leaves a more likely one open.

Secondary concerns: unhandled non-deadlock lock errors leak raw MySQL text to
unauthenticated `verifyEmail` callers; the `SELECT COUNT(*) ... FOR UPDATE` guard has no
supporting index and therefore next-key-locks the whole `users` table (blocking
registration INSERTs and inflating the deadlock/lock-wait probability that the
retry-once only partially covers); and the new CR-02 concurrency regression tests in
`updateUser.test.js` use the bare `Promise.all` technique that `verifyEmail.test.js`
explicitly documents as insufficient to force the interleaving.

No structural pre-pass was supplied with this review, so all findings below are narrative.

## Narrative Findings (AI reviewer)

### Critical Issues

#### CR-01: Zero-admin bootstrap can resurrect a Rejected/Disabled account to Active ADMIN

**File:** `backend/src/resolvers/user.resolver.js:437-461` (write at `457-460`; false invariant at `438-456`)
**Severity:** BLOCKER

**Issue:**
32-09 changed the bootstrap to write `{ role: 'ADMIN', status: 'Active', approvedAt }` in
one unconditional `models.User.update` with `where: { id: user.id }` — no status
precondition. The inline comment justifies dropping the precondition with this claim:

> "No reachable path lets a Rejected/Disabled account re-enter `verifyEmail` and
> re-trigger this block."

That claim is false. Two paths reissue a live `emailVerificationToken` on an account of
*any* status:

1. `updateUser` (`user.resolver.js:679-699`) has **no account-status guard anywhere**. An
   admin changing a Rejected or Disabled user's email sets `emailVerified = false`,
   `emailVerificationToken = hash(...)`, `emailVerificationExpiresAt = +24h`. The account
   is now Rejected/Disabled *and* holds a fresh, unconsumed token.
2. `resendVerificationEmail` (`user.resolver.js:545-547`) guards only on
   `if (!user || user.emailVerified) return;` — again **no status check**. Once (1) has
   flipped `emailVerified` to false, that account can mint a new token anonymously and
   indefinitely.

With a token in hand, the account re-enters `verifyEmail`. If `adminCount === 0` and its
email matches `env.adminEmail`, the bootstrap fires and writes `status: 'Active'` over
`Rejected`/`Disabled`, plus `role: 'ADMIN'`. The invited auto-activation block two
statements below (`:499-502`) correctly scopes its own update to
`where: { ..., status: 'Pending' }` and cannot resurrect; the bootstrap block does not.
No test pins this behavior (see WR-05).

`ADMIN_EMAIL` is empty in all four env files today, which narrows exploitability — but
the phase ships the env key precisely so operators will set it, and CR-03 below is what
makes `adminCount === 0` reachable.

**Fix:** Scope the bootstrap write the same way the auto-activation write below it is
scoped, so a Rejected/Disabled row can never be promoted:

```js
import { Op, UniqueConstraintError } from 'sequelize';
// ...
const [bootstrapped] = await models.User.update(
  { role: 'ADMIN', status: 'Active', approvedAt: new Date() },
  { where: { id: user.id, status: { [Op.in]: ['Pending', 'Active'] } }, transaction: t }
);
// bootstrapped === 0 means the account was Rejected/Disabled -- promote nobody.
```

Additionally close the two reissue paths so the invariant holds independently of this
guard (see WR-06):

```js
// resendVerificationEmail
if (!user || user.emailVerified) return;
if (user.status === 'Rejected' || user.status === 'Disabled') return; // stay silent

// updateUser, inside runUpdate after findByPk
if (target.status === 'Rejected' || target.status === 'Disabled') {
  throw new Error('This account is not editable.');
}
```

---

#### CR-02: Tokenless registration silently discards every invalid or over-length email

**File:** `backend/src/resolvers/user.resolver.js:260-264` and `276-334`
**Severity:** BLOCKER

**Issue:**
The tokenless branch pre-validates two of the three free-text inputs outside the
catch-all — `assertRelationshipNoteLength` (`:260`) and `assertRegistrationName`
(`:261`) — precisely so their failures produce an actionable error instead of being
converted into the uniform success message. `email` gets only a truthiness check
(`:262`) and normalization (`:264`); format and length are left to Sequelize's
`isEmail` validator and the `VARCHAR(255)` column, both of which throw *inside* the
`try` at `:276` and are swallowed at `:322-334` into
`finishTokenlessRegistration(startedAt)` → `"Registration received. Verify your email
to activate your account."`

Concrete outcomes, all indistinguishable from success:

- `email: "ada@exmaple"` (typo, no TLD) → `isEmail` fails → success message, no row, no email.
- `email: "   "` → `!email` is false (non-empty string) → normalizes to `""` → `allowNull`/`isEmail` fails → success message.
- `email` longer than 255 chars → `Data too long for column 'email'` → success message.

Nothing tells the registrant, and the only operator signal is one
`console.error('Tokenless registration failed:', err?.name, err?.message)` line that is
identical in shape to a genuine infrastructure failure. This is the exact failure mode
`assertRequiredColumns.js:6-16` calls out as unacceptable ("silently accepting and
dropping every self-registration forever -- no signal to the caller ... and no signal to
the operator"); that file closes one instance of it while a far more common one stays open.

Email-format validation is not an enumeration oracle — it depends only on caller-supplied
input, never on account state — so it belongs alongside the name/note guards, outside the
try.

**Fix:** Add `backend/src/utils/emailPolicy.js` mirroring `namePolicy.js`, and call it
before the `try`:

```js
// backend/src/utils/emailPolicy.js
export const MAX_EMAIL_LENGTH = 255;
const EMAIL_RE = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

export function assertRegistrationEmail(email) {
  const normalized = String(email ?? '').toLowerCase().trim();
  if (!normalized) throw new Error('Email is required.');
  if (normalized.length > MAX_EMAIL_LENGTH) throw new Error('Email must be 255 characters or fewer.');
  if (!EMAIL_RE.test(normalized)) throw new Error('Enter a valid email address.');
  return normalized;
}
```

```js
// user.resolver.js, replacing lines 262-264
const cleanName = assertRegistrationName(name);
const normalizedEmail = assertRegistrationEmail(email);
```

---

#### CR-03: Last-administrator guard counts Pending/Rejected/Disabled admins, allowing an unrecoverable lockout

**File:** `backend/src/resolvers/user.resolver.js:651-657` (guard count) and `426-429` (bootstrap count); false claim at `486-488`
**Severity:** BLOCKER

**Issue:**
Both raw SQL counts filter on `role = 'ADMIN' AND emailVerified = true` and **omit
`status`**:

```sql
-- user.resolver.js:653 (updateUser guard)
SELECT COUNT(*) AS adminCount FROM users WHERE role = 'ADMIN' AND emailVerified = true AND id <> :id FOR UPDATE
-- user.resolver.js:427 (verifyEmail bootstrap)
SELECT COUNT(*) AS adminCount FROM users WHERE role = 'ADMIN' AND emailVerified = true FOR UPDATE
```

`isFunctioningAdmin` (`utils/auth.js:62-64`) defines a usable administrator as
`role === 'ADMIN' && status === 'Active' && emailVerified === true`, and both `login`
(`user.resolver.js:340-345`) and `getUserFromRequest` (`utils/auth.js:33`) hard-require
`status === 'Active'`. So a non-Active ADMIN row satisfies the guard's count while being
completely unable to administer anything.

Reachable sequence, entirely through supported mutations:

1. Admin A (sole functioning admin) promotes a Pending, email-verified self-registrant B
   to `ADMIN` via `updateUser` (`:661-667` has no status precondition; B is exactly what
   the new `pendingApprovals` query surfaces).
2. A demotes themselves (`role: 'USER'`). `otherVerifiedAdminCount()` returns 1 (B), so
   `"Cannot remove the last administrator."` never fires.
3. Zero functioning admins remain. B cannot log in (status Pending).
4. Recovery via the ADMIN_EMAIL bootstrap is also blocked: `verifyEmail`'s `adminCount`
   sees the same B row and returns 1, so `Number(adminCount) === 0` is false forever.

The same shape applies with a Rejected ADMIN (promote B while Pending, then `rejectUser`)
or a manually Disabled admin. The result is an application permanently locked out of its
own administration with no in-app recovery — only direct database access.

Compounding this, the comment at `:486-488` states the guards use "the same
functioning-admin definition (`isFunctioningAdmin`, utils/auth.js) as the admin-slot count
and updateUser's last-administrator guard." Neither of those two call sites uses it, and
`auth.js:56-58` explicitly documents that they don't. A comment asserting a security
invariant the code does not implement is what allowed this to survive two gap-closure rounds.

**Fix:** Make both counts match `isFunctioningAdmin`, and correct the comment:

```sql
-- updateUser guard
SELECT COUNT(*) AS adminCount FROM users
 WHERE role = 'ADMIN' AND status = 'Active' AND emailVerified = true AND id <> :id FOR UPDATE

-- verifyEmail bootstrap
SELECT COUNT(*) AS adminCount FROM users
 WHERE role = 'ADMIN' AND status = 'Active' AND emailVerified = true FOR UPDATE
```

Adding `status = 'Active'` to the bootstrap count is safe and consistent: the ADMIN_EMAIL
gate at `:437` still restricts *who* may be promoted, so a stranded Pending ADMIN no
longer blocks legitimate recovery. Add a regression test asserting that a Pending or
Rejected ADMIN row does **not** satisfy `"Cannot remove the last administrator."`

---

### Warnings

#### WR-01: Tokenless register converts every transient infrastructure failure into a success response

**File:** `backend/src/resolvers/user.resolver.js:322-334`
**Severity:** WARNING

**Issue:** The catch-all wraps `bcrypt.hash`, `findOne`, `createVerificationToken` and
`create`. A lock-wait timeout (very likely given WR-03), connection-pool exhaustion, a DB
restart, or an unmigrated column all produce the identical `"Registration received"`
response with no row written. The registrant waits for an email that will never arrive;
the operator's only signal is one `console.error` line whose shape is identical for benign
and catastrophic causes. There is no retry, no queue, no metric, and no way for the
operator to know registrations are being dropped in bulk.

**Fix:** Keep the uniform response, but make the failure loud and classifiable server-side:

```js
} catch (err) {
  // Expected, benign: duplicate-insert race lost to a concurrent registration.
  const expected = err instanceof UniqueConstraintError;
  console.error(
    expected ? '[register] duplicate-insert race (benign)' : '[register] REGISTRATION DROPPED — investigate',
    { name: err?.name, message: err?.message, email: normalizedEmail }
  );
  return await finishTokenlessRegistration(startedAt);
}
```

Wire the non-expected branch to whatever alerting the deployment has, and add a
`registrations_dropped_total` counter if/when metrics land.

---

#### WR-02: Non-deadlock DB errors leak raw MySQL text to unauthenticated callers

**File:** `backend/src/resolvers/user.resolver.js:119-120`, `508-517`, `717-722`
**Severity:** WARNING

**Issue:** `isDeadlock` matches only `ER_LOCK_DEADLOCK`. Anything else — most notably
`ER_LOCK_WAIT_TIMEOUT` (errno 1205, "Lock wait timeout exceeded; try restarting
transaction"), which is the *more likely* outcome of the full-table `FOR UPDATE` scan in
WR-03 — is rethrown unchanged (`:514`, `:720`). Apollo Server 4 does not mask resolver
error messages, so an anonymous `verifyEmail` caller receives raw MySQL/Sequelize text.
This directly contradicts the posture the same file establishes for `register` at
`:323-331` ("never surface raw ORM/DB error text to an unauthenticated caller").
A lock-wait timeout is also as safely retryable as a deadlock — nothing committed, the
single-use token is not consumed — so not retrying it is a lost recovery too.

**Fix:**

```js
const isRetryableLockError = (error) => {
  const code = error?.original?.code ?? error?.parent?.code;
  return code === 'ER_LOCK_DEADLOCK' || code === 'ER_LOCK_WAIT_TIMEOUT';
};

try {
  await verifyAndPromote();
} catch (error) {
  if (!isRetryableLockError(error)) {
    if (error?.original || error?.parent) {           // any raw DB error
      console.error('verifyEmail failed:', error?.name, error?.message);
      throw new Error('Could not verify your email right now. Please try again.');
    }
    throw error;                                       // our own thrown Error messages pass through
  }
  promotedInvitation = null;
  await verifyAndPromote();
}
```

Apply the same normalization to `updateUser`'s retry wrapper.

---

#### WR-03: `SELECT COUNT(*) ... FOR UPDATE` has no supporting index and next-key-locks the whole `users` table

**File:** `backend/src/resolvers/user.resolver.js:426-429`, `651-657`
**Severity:** WARNING

**Issue:** There is no index on `users(role, emailVerified)` — `backend/migrations/manual/*.sql`
adds only FK indexes, and `User.init` declares none. Under InnoDB REPEATABLE READ, an
aggregate `SELECT ... FOR UPDATE` with no usable index performs a full scan and takes
next-key locks on every scanned row plus the supremum gap. Consequences that are
correctness (not throughput) problems:

- Every guarded `updateUser` and every `verifyEmail` serializes against every other one,
  and any two racers that lock different target rows first will deadlock — which is why
  the retry-once exists. With three or more concurrent racers, a second deadlock is
  entirely possible and is rethrown raw (WR-02).
- The supremum gap lock **blocks INSERTs into `users`**, so an anonymous `register`
  running concurrently with any admin update waits on the lock, and on timeout is
  swallowed by WR-01 into a false success with the registration lost.

**Fix:** Add a covering index so the guard locks only the ADMIN rows:

```sql
-- backend/migrations/manual/021-index-users-admin-lookup.sql
ALTER TABLE users ADD INDEX users_role_status_emailVerified_idx (role, status, emailVerified);
```

and declare it on the model (`User.init` options) so `sequelize.sync()` creates it on
fresh databases. Extend `assertRequiredColumns.js` to assert the index exists, since
`sync()` will not add it to an existing table.

---

#### WR-04: The new CR-02 concurrency regression tests cannot reliably force the race they claim to cover

**File:** `backend/src/resolvers/updateUser.test.js:315-353`
**Severity:** WARNING

**Issue:** Both new tests use a bare `Promise.all` of two `graphql()` calls.
`verifyEmail.test.js:34-36` and `:175-182` in this same phase explicitly document that a
bare in-process `Promise.all` "cannot" deterministically force the concurrent
interleaving, and use a second raw `mysql2` connection holding a real InnoDB lock instead.
The `updateUser` tests use the technique the codebase already rejected.

The assertions are also weak enough to pass under several regressions:

- `expect(verifiedAdminCount).toBeGreaterThanOrEqual(1)` is satisfied if **both** requests
  fail for any reason (including "User not found." or an unrelated throw).
- The error check is `if (response.errors) expect(...).not.toMatch(/Sequelize|ER_LOCK|deadlock/i)` —
  it never asserts that exactly one racer won, nor that the loser got
  `"Cannot remove the last administrator."` / the email guard message.

**Fix:** Reuse `verifyEmail.test.js`'s `rawConnection()` pattern — hold an exclusive lock
on a non-target `users` row that both admin-count scans must read, launch both mutations,
release, and then assert:

```js
const outcomes = [responseA, responseB];
expect(outcomes.filter((r) => !r.errors)).toHaveLength(1);
const loser = outcomes.find((r) => r.errors);
expect(loser.errors[0].message).toMatch(
  /Cannot remove the last administrator\.|Promote another administrator before changing the last administrator's email\./
);
expect(await models.User.count({ where: { role: 'ADMIN', status: 'Active', emailVerified: true } })).toBe(1);
```

---

#### WR-05: No test pins the 32-09 bootstrap against a Rejected or Disabled account

**File:** `backend/src/resolvers/verifyEmail.test.js:289-357`
**Severity:** WARNING

**Issue:** The `zero-admin ADMIN bootstrap gated on ADMIN_EMAIL` block covers three cases:
ADMIN_EMAIL unset, ADMIN_EMAIL mismatched, ADMIN_EMAIL matched-and-Pending. The single
most security-relevant case introduced by 32-09 — the unconditional `status: 'Active'`
write, whose safety rests entirely on a prose unreachability argument (CR-01) — has no
test at all. The 26-line comment at `user.resolver.js:438-456` is the only artifact
asserting it.

**Fix:** Add a red-then-green test for CR-01:

```js
it('never resurrects a Rejected account through the ADMIN_EMAIL bootstrap', async () => {
  env.adminEmail = 'rejected-operator@example.com';
  const target = await createTestUser({
    email: 'rejected-operator@example.com',
    status: 'Rejected',
    emailVerified: false,
    role: 'USER',
    emailVerificationToken: hashVerificationToken('resurrect-token'),
    emailVerificationExpiresAt: new Date(Date.now() + 60 * 60 * 1000)
  });

  await graphql(VERIFY_EMAIL_MUTATION, { token: 'resurrect-token' });

  await target.reload();
  expect(target.status).toBe('Rejected');
  expect(target.role).toBe('USER');
});
```

Add the `Disabled` variant too.

---

#### WR-06: `updateUser` and `resendVerificationEmail` have no account-status precondition

**File:** `backend/src/resolvers/user.resolver.js:619-731`, `542-569`
**Severity:** WARNING

**Issue:** Neither mutation checks `target.status`. An admin can rename or re-email a
Rejected or Disabled account (`updateUser`), which flips `emailVerified` to false and
mints a fresh verification token; an anonymous caller can then keep minting new tokens for
that account forever via `resendVerificationEmail`, since its only guard is
`if (!user || user.emailVerified) return;`. This is the enabling half of CR-01, and is
independently wrong: a Disabled account should not be able to obtain live credentials of
any kind, and editing a Rejected registration is not a meaningful admin operation.

**Fix:** See the snippets under CR-01. Keep `resendVerificationEmail`'s early return
silent (no thrown error) so it stays enumeration-uniform.

---

#### WR-07: Registration squatting produces a silent, unrecoverable-looking dead end for the real owner

**File:** `backend/src/resolvers/user.resolver.js:280-288`
**Severity:** WARNING

**Issue:** Anonymous callers can create Pending, unverified accounts on arbitrary
addresses (5/hr/IP, `config/rateLimits.js:7`). Once an address is squatted, the genuine
owner's later registration hits the taken-email branch and receives
`"Registration received. Verify your email to activate your account."` — a success message
for something that did not happen. They receive `sendRegistrationAttemptEmail`, whose copy
says "No new account was created, and nothing about your existing account changed", which
is accurate for *that request* but actively misleading when the "existing account" is
someone else's squat. The only recovery is the non-obvious
`requestPasswordReset` → `resendVerificationEmail` chain.

This also enables denial-of-bootstrap: squatting the configured `ADMIN_EMAIL` address
before the operator registers permanently blocks the one documented first-admin path.

Squatted rows also accumulate forever — nothing reaps Pending, unverified accounts whose
24h verification token has expired (`verificationTokenExpiry`, `utils/auth.js:86-88`).

**Fix:** Treat a stale, unverified, Pending squat as a free email. This stays
enumeration-uniform because the caller-visible response is unchanged:

```js
if (existingUser) {
  const stale =
    existingUser.status === 'Pending' &&
    existingUser.emailVerified === false &&
    (!existingUser.emailVerificationExpiresAt || existingUser.emailVerificationExpiresAt < new Date());

  if (!stale) {
    sendRegistrationAttemptEmail({ to: existingUser.email, name: existingUser.name }).catch(...);
    return await finishTokenlessRegistration(startedAt);
  }
  await existingUser.destroy();   // stale squat -- fall through and re-create
}
```

---

#### WR-08: `relationshipNote` is validated and stored untrimmed, unlike every other free-text field

**File:** `backend/src/utils/relationshipNotePolicy.js:6-8`, `backend/src/resolvers/user.resolver.js:305`
**Severity:** WARNING

**Issue:** `assertRelationshipNoteLength` measures the raw input and the resolver stores
`relationshipNote || null` verbatim. A note of 500 spaces passes validation and is
persisted, then rendered as a blank `<em>Note: </em>` block in the admin notification
email (`mailer.js:131`) and as a non-null, visually empty value in the new
`pendingApprovals` queue. `assertRegistrationName` (`namePolicy.js:13-17`) trims and
returns the cleaned value; this policy does neither, so the two adjacent guards behave
inconsistently and the note-vs-no-note distinction the admin relies on is unreliable.

**Fix:** Mirror `namePolicy.js` — normalize and return, and have the resolver use the
return value:

```js
export const MAX_NOTE_LENGTH = 500;

export function normalizeRelationshipNote(note) {
  const trimmed = String(note ?? '').trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_NOTE_LENGTH) throw new Error('Relationship note must be 500 characters or fewer.');
  return trimmed;
}
```

```js
const cleanNote = normalizeRelationshipNote(relationshipNote);
// ...
relationshipNote: cleanNote
```

---

#### WR-09: The invited `register` branch validates `name` not at all, accepting blanks and leaking raw DB errors

**File:** `backend/src/resolvers/user.resolver.js:206-216`
**Severity:** WARNING

**Issue:** `assertRegistrationName` is applied only on the tokenless branch (`:261`); the
invited branch passes the raw `name` argument straight into `models.User.create`. Two
consequences:

- `name: ""` or `name: "   "` is accepted — `allowNull: false` does not reject an empty
  string — producing a nameless account that renders as blank everywhere it is displayed.
- `name` over 255 chars produces `Data too long for column 'name' at row 1`, which Apollo
  returns verbatim to the caller. The phase documents this as accepted debt because the
  invited branch "is not an equivalent anonymous oracle" (`:255-258`), but that argument
  covers *enumeration*, not raw-DB-error leakage or nameless accounts.

The fix costs one line and removes the branch asymmetry entirely.

**Fix:**

```js
// user.resolver.js, inside the `if (token)` branch, before models.User.create
const cleanName = assertRegistrationName(name);
// ...
createdUser = await models.User.create({ name: cleanName, email, /* ... */ }, { transaction: t });
```

---

#### WR-10: bcrypt cost `12` is duplicated across the resolver and the model hook

**File:** `backend/src/resolvers/user.resolver.js:277`, `backend/src/models/User.js:107`, `:112`
**Severity:** WARNING

**Issue:** The tokenless path deliberately bypasses `beforeCreate`'s hashing via
`{ passwordAlreadyHashed: true }` and hashes with a hardcoded `12` of its own. The model
hardcodes `12` in two more places. There is now no single definition of the work factor:
raising it in `User.js` (the obvious place) silently leaves every self-registration on the
old cost, and the divergence is invisible until someone audits stored hashes. The three
sites are in two different files with no cross-reference.

**Fix:**

```js
// backend/src/config/security.js
export const BCRYPT_COST = 12;
```

Import it in both `User.js` and `user.resolver.js`, and assert on it in
`User.test.js` (`expect(user.passwordHash).toMatch(new RegExp(\`^\\\\$2[aby]\\\\$${BCRYPT_COST}\\\\$\`))`).

---

#### WR-11: The tokenless branch and `pendingApprovals` ship live with no consumer and no feature flag

**File:** `backend/src/resolvers/user.resolver.js:159-165`, `:244-334`; `backend/src/schemas/user.schema.js:57`, `:61`
**Severity:** WARNING

**Issue:** Cross-referencing the frontend shows nothing consumes either addition:

- `frontend/src/pages/Register.jsx:31-32` still short-circuits on `if (!token)` with
  "Public self-registration is disabled — an account can only be created from a valid
  invitation link."
- `frontend/src/context/AuthContext.jsx:91` is `register: (token, name, password) => ...` —
  it never sends `email` or `relationshipNote`, so the tokenless branch is unreachable
  from the app.
- `grep -rn "pendingApprovals" frontend/src` returns nothing — the new admin query has no UI.

The resolver comment at `:174-176` states this explicitly: *"No environment-gated feature
switch guards this branch: it is live the moment this code deploys (D-03)."* The net effect
is an unauthenticated account-creation endpoint exposed on production with no product
surface using it, and no admin screen to triage the Pending accounts it creates — the only
operator signal is the D-12 notification email. Deploying attack surface ahead of the
feature that needs it is an avoidable risk.

**Fix:** Gate the branch behind an env flag that defaults off, matching how `ADMIN_EMAIL`
already fails closed, and flip it in the same release as the UI:

```js
// config/env.js
selfRegistrationEnabled: process.env.SELF_REGISTRATION_ENABLED === 'true',

// user.resolver.js, at the top of the tokenless branch
if (!env.selfRegistrationEnabled) throw new Error('This invitation link is invalid.');
```

(Reusing the invited branch's message keeps the disabled state from being a new oracle.)

---

#### WR-12: `renderHtml` interpolates `ctaUrl` unescaped into an `href` attribute

**File:** `backend/src/services/mailer.js:41`, `:43`
**Severity:** WARNING

**Issue:** `escapeHtml`'s own docblock (`utils/escapeHtml.js:1-5`) states it is for "an
HTML text node (never an attribute like `href`)", yet `renderHtml` drops `ctaUrl` straight
into `href="${ctaUrl}"` and into a text node at `:43` with no escaping or scheme check.
Every current caller builds the URL server-side from `env.clientUrl` plus a hex token, so
there is no live vulnerability — but `renderHtml` is a shared helper with six call sites
and no guard, and this phase added a seventh (`sendRegistrationAttemptEmail`). A future
caller passing user-influenced input yields attribute breakout (`" onmouseover=...`) or a
`javascript:` URI in an email client that honors it.

**Fix:** Validate and encode inside `renderHtml` so the invariant is enforced at the single
choke point rather than assumed at every call site:

```js
function safeUrl(raw) {
  const url = new URL(String(raw));            // throws on malformed input
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Unsupported CTA URL scheme.');
  }
  return escapeHtml(url.toString());
}

function renderHtml({ heading, intro, ctaLabel, ctaUrl, note }) {
  const href = safeUrl(ctaUrl);
  // ... use `href` in both the attribute and the fallback text node
}
```

---

#### WR-13: Partial `vi.mock` factories for `mailer.js` break sibling exports across the whole module graph

**File:** `backend/src/resolvers/verifyEmail.test.js:9-11`, `backend/src/resolvers/updateUser.test.js:3-6`
**Severity:** WARNING

**Issue:** `verifyEmail.test.js` mocks `../services/mailer.js` with a factory exporting
only `sendPendingRegistrationEmail`; `updateUser.test.js` exports only two of the eight.
The mock replaces the module for the entire graph, so `user.resolver.js`,
`approval.resolver.js` and `invitation.resolver.js` all see the remaining exports as
missing. Any future test added to these files that reaches `approveUser`, `rejectUser`,
`createInvitation`, or `register`'s verification email fails with Vitest's opaque
`No "sendX" export is defined on the "../services/mailer.js" mock` rather than a real
assertion failure. `register.test.js:7-12` already had to grow to four exports for exactly
this reason.

**Fix:** Mock the full surface once, in a shared test helper:

```js
// backend/test/mockMailer.js
import { vi } from 'vitest';
export const mailerMock = () =>
  vi.mock('../services/mailer.js', async (importOriginal) => {
    const actual = await importOriginal();
    return Object.fromEntries(
      Object.keys(actual).map((k) => [k, vi.fn().mockResolvedValue(undefined)])
    );
  });
```

---

#### WR-14: Comments assert security invariants the code does not implement, and cite stale line numbers

**File:** `backend/src/resolvers/user.resolver.js:486-488`, `:438-456`; `backend/src/utils/auth.js:53-61`
**Severity:** WARNING

**Issue:** Three comment defects, each attached to a security decision:

1. `user.resolver.js:486-488` — claims the inviter check uses "the same functioning-admin
   definition (`isFunctioningAdmin`, utils/auth.js) as the admin-slot count and updateUser's
   last-administrator guard." Neither of those uses it (CR-03), and `auth.js:56-58` says so.
2. `user.resolver.js:438-456` — 19 lines asserting the Rejected/Disabled unreachability
   invariant that CR-01 disproves.
3. `auth.js:56-58` — cites "user.resolver.js ~263-264" and "~425-428" for the admin-slot
   count and the last-administrator guard; those are now at `:426-429` and `:651-657`.
   Line-number cross-references in comments rot on every edit.

In a file where the comment-to-code ratio approaches 1:1 and the comments are the primary
record of *why* a guard is shaped a certain way, an incorrect comment is worse than no
comment — it is what let CR-01 and CR-03 survive two gap-closure rounds.

**Fix:** Correct (1) and (2) as part of the CR-01/CR-03 fixes. For (3), replace line-number
references with symbol names (`verifyAndPromote`'s admin-slot count,
`updateUser`'s `otherVerifiedAdminCount`) so they survive edits.

---

#### WR-15: Invited branch hardcodes the success message instead of the shared constant

**File:** `backend/src/resolvers/user.resolver.js:240-242` vs `:99`, `:130`
**Severity:** WARNING

**Issue:** `TOKENLESS_REGISTER_MESSAGE` is defined at `:99` and returned by
`finishTokenlessRegistration` at `:130`. The invited branch at `:241` repeats the same
string literal instead of referencing the constant. If either is ever reworded, the invited
and tokenless branches become distinguishable by response body — reintroducing exactly the
kind of divergence SEC-01/D-08 spent this phase eliminating, and doing so silently (no test
compares the two branches' messages).

**Fix:**

```js
return { message: TOKENLESS_REGISTER_MESSAGE };
```

and rename the constant to `REGISTER_RECEIVED_MESSAGE` since it now covers both branches.
Add an assertion in `register.test.js` that the invited and tokenless success messages are
byte-identical.

---

_Reviewed: 2026-09-01T14:23:45Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
