---
phase: 32-tokenless-registration
reviewed: 2026-09-03T08:11:33Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - backend/src/config/assertRequiredColumns.js
  - backend/src/config/assertRequiredColumns.test.js
  - backend/src/config/env.js
  - backend/src/models/index.js
  - backend/src/resolvers/pendingApprovals.test.js
  - backend/src/resolvers/rateLimit.test.js
  - backend/src/resolvers/register.test.js
  - backend/src/resolvers/resendVerificationEmail.test.js
  - backend/src/resolvers/updateUser.test.js
  - backend/src/resolvers/user.resolver.js
  - backend/src/resolvers/verifyEmail.test.js
  - backend/src/schemas/user.schema.js
  - backend/src/services/mailer.js
  - backend/src/services/mailer.test.js
  - backend/src/utils/auth.js
  - backend/src/utils/emailPolicy.js
  - backend/src/utils/emailPolicy.test.js
  - backend/src/utils/escapeHtml.js
  - backend/src/utils/escapeHtml.test.js
  - backend/src/utils/namePolicy.js
  - backend/src/utils/namePolicy.test.js
  - backend/src/utils/relationshipNotePolicy.js
  - backend/src/utils/relationshipNotePolicy.test.js
findings:
  critical: 2
  warning: 9
  info: 7
  total: 18
status: issues_found
---

# Phase 32: Code Review Report

**Reviewed:** 2026-09-03T08:11:33Z
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

Fourth-round review, focused on the three gap-closure plans (32-11, 32-12, 32-13) and on
whether their fixes introduced new defects — the recurring failure mode in this phase.

**What is genuinely closed.** I verified all three by direct source read plus predicate
analysis:

- **Gap 1 (bootstrap resurrection).** `user.resolver.js:470-473` now scopes the
  ADMIN_EMAIL bootstrap write to `status: { [Op.in]: ['Pending','Active'] }`, and both
  upstream reissue paths are independently closed (`resendVerificationEmail:566`,
  `updateUser:676-678`). I also traced every remaining path that can hand an account a
  live `emailVerificationToken` — `register` (both branches refuse an existing email),
  `resendVerificationEmail`, `updateUser` — and found no fourth one. Genuinely closed,
  with real defence in depth.
- **Gap 2 (admin-count predicate).** All four admin predicates in the codebase now agree
  exactly with `isFunctioningAdmin` (`auth.js:65-67`): the raw counts at
  `user.resolver.js:426` and `:685`, and the `findAll` at `:48`. I grepped every
  `role === 'ADMIN'` / `role: 'ADMIN'` site in `backend/src`; the only remaining
  role-only checks (`requireAdmin`, `dashboard`, `photo.routes.js`) sit downstream of
  `getUserFromRequest`, which already hard-requires `status === 'Active'` and
  `emailVerified`. Genuinely closed.
- **Gap 3 (email pre-validation).** **Only partially closed — see CR-01.** The new
  `assertRegistrationEmail` guard is materially more permissive than the model-layer
  `isEmail` validator it is meant to front-run, so a broad class of realistic malformed
  addresses still reaches `models.User.create`, still throws inside the uniform-response
  catch, and is still silently discarded. 32-13's own SUMMARY acknowledges the divergence
  but worked around it in a test rather than closing it in the guard.

**The other Critical (CR-02) is not a regression in the fixes** — it is a property of the
tokenless registration path itself that no round has raised: an anonymous caller can bind
an attacker-chosen password to a third party's email address, and the existing
verification + admin-approval flow converts that into a working impersonation credential.

Beyond those, the two whole-table `SELECT ... FOR UPDATE` scans (one of them added by
32-10) run against a `users` table with no supporting index, and the retry wrapper only
recognises `ER_LOCK_DEADLOCK` — so the far more likely contention outcome, a lock-wait
timeout, propagates raw and unretried (WR-01). Two of the gap-closure regression tests
assert weaker invariants than the fixes they guard (WR-06, WR-07). Several findings from
the previous round (squatting, untrimmed note, unvalidated invited-branch `name`) remain
untouched and are re-raised.

---

## Critical Issues

### CR-01: Gap 3 is only half closed — `assertRegistrationEmail` accepts a broad class of addresses that `models.User.create` then rejects, and the uniform-response catch discards them silently

**File:** `backend/src/utils/emailPolicy.js:38,44`; `backend/src/resolvers/user.resolver.js:263,296-307,321-333`

**Issue:**
`emailPolicy.js`'s format check is a hand-rolled regex:

```js
const EMAIL_FORMAT = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;
```

but `User.email` still carries `validate: { isEmail: true }` (`models/User.js:26`), which
Sequelize backs with `validator.isEmail`. The two disagree on a large, realistic set of
inputs. I verified this empirically against the installed `validator@13.15.35` and against
a real Sequelize model validation run (mysql dialect, `M.build({email}).validate()`):

| input | `EMAIL_FORMAT` | Sequelize `isEmail` |
|---|---|---|
| `ada@gmail..com` | pass | **reject** |
| `ada..lovelace@gmail.com` | pass | **reject** |
| `.ada@gmail.com` | pass | **reject** |
| `ada@gmail.com.` | pass | **reject** |
| `ada@exam_ple.com` | pass | **reject** |
| `ada@-example.com` / `ada@example.-com` | pass | **reject** |
| `a@b.c` (1-char TLD) | pass | **reject** |
| local part > 64 chars (e.g. `'a'.repeat(65)@example.com`) | pass | **reject** |

Every one of those flows past line 263, past `bcrypt.hash`, past the `findOne` (no row),
into `models.User.create` at :296, which throws `SequelizeValidationError: Validation
error: Validation isEmail on email failed`. That throw is caught by the catch-all at :321
and converted into `finishTokenlessRegistration(startedAt)` — the byte-identical
`"Registration received. Verify your email to activate your account."` success message.

**Concrete failure scenario:** A family member types `mesfin@gmail..com` (a one-key typo)
into the registration form.
- Response: `{ register: { message: "Registration received. Verify your email to activate your account." } }`
- `users` rows created: **0**
- Emails sent: **0**
- Admin notification: none (nothing to notify about)
- Server log: `Tokenless registration failed: SequelizeValidationError Validation error: Validation isEmail on email failed` — with **no email address, no name, no request id** (see WR-03), so the operator cannot tell who was dropped or contact them.

The registrant waits indefinitely for a verification email that will never arrive, and
`resendVerificationEmail` for that address is also a silent no-op (no row exists). This is
precisely the failure mode Gap 3 / Truth 8 declared closed.

32-13's own SUMMARY records that the team knew: *"a naive same-total-length
local-part-heavy email can pass the pre-try guard but still fail Sequelize's own isEmail
at create() time"* — and responded by hand-constructing the 254-char boundary **test**
(`register.test.js:657-673`) so it would pass both checks, rather than making the guard
match the validator.

**Fix:** Make the pre-try guard enforce the *same* predicate the model layer enforces.
Preferred: promote `validator` from a transitive to a declared dependency (add
`"validator": "^13.15.0"` to `backend/package.json` — it is already installed and pinned
via `sequelize`'s own tree, so this is a declaration change, not a new package) and use it:

```js
import isEmail from 'validator/lib/isEmail.js';

export const MAX_EMAIL_LENGTH = 254;

export function assertRegistrationEmail(email) {
  const normalized = String(email ?? '').toLowerCase().trim();
  if (!normalized) throw new Error('Email is required.');
  if (normalized.length > MAX_EMAIL_LENGTH) throw new Error('Email must be 254 characters or fewer.');
  // Same implementation Sequelize's `isEmail: true` model validator uses, so the
  // pre-try guard and the model layer can never disagree and silently drop a row.
  if (!isEmail(normalized)) throw new Error('Enter a valid email address.');
  return normalized;
}
```

If the phantom-dependency objection stands, the equivalent-safety alternative is to remove
`validate: { isEmail: true }` from `models/User.js:26` so the resolver guard becomes the
sole authority (its leniency then produces a stored row, not a silent drop) — but do not
leave two disagreeing validators on the same field.

Add regression tests for at least `ada@gmail..com`, `.ada@gmail.com`, `ada@gmail.com.`,
and a >64-char local part, asserting each returns `'Enter a valid email address.'` and
creates zero rows.

---

### CR-02: Tokenless registration binds an attacker-chosen password to an arbitrary third-party email address (account pre-hijacking)

**File:** `backend/src/resolvers/user.resolver.js:246-320`

**Issue:** The tokenless branch accepts `name`, `email`, `password`, and
`relationshipNote` from a fully anonymous caller and immediately persists a `users` row
whose `passwordHash` is the caller's chosen password, at an address the caller does not
control. Nothing downstream ever re-binds the credential to the address owner:

- `verifyEmail` (`:398-553`) only flips `emailVerified` and issues a session; it does not
  touch `passwordHash`.
- `approveUser` (`approval.resolver.js:20-61`) only flips `status` to `Active`.
- The verification email (`mailer.js:166-179`) says *"Welcome! Please verify your email
  address to activate your account… If you did not create this account, you can ignore
  this email"* — it never states that a password has already been set by whoever
  submitted the form, and offers no way to cancel the registration.

**Concrete failure scenario:**
1. Anonymous attacker: `register(name: "Mesfin Kidane", email: "mesfin@family-domain.com", password: "attacker-secret", relationshipNote: "Almaz's son, moved to Zurich in 2019")`. Row created: `status: Pending`, `emailVerified: false`, `passwordHash` = bcrypt("attacker-secret").
2. Verification email lands in the real Mesfin's inbox. He clicks it (the app exists, the copy is plausible, and the mail carries no "a password was set for you" warning).
3. `verifyEmail` → `emailVerified: true`, still `Pending`; `notifyAdminsOfPendingRegistration` (`:41-63`) emails every functioning admin: *"Mesfin Kidane (mesfin@family-domain.com) registered directly and is awaiting approval. Note: Almaz's son, moved to Zurich in 2019"*.
4. Admin recognises the name **and the email address**, approves → `status: Active`.
5. Attacker calls `login(email: "mesfin@family-domain.com", password: "attacker-secret")` → valid JWT, `requireFamilyAccess` passes once linked, full family-tree read/edit access under Mesfin's identity.

The admin-approval gate — the phase's stated control (D-03) — is defeated because the
attacker forged the one signal the admin decides on: identity. This is reachable today;
there is no feature flag (D-03 states the branch is live on deploy).

Note this is strictly worse than the squatting DoS the previous round logged as WR-07
(re-raised below as WR-04): squatting merely denies the owner a registration, this hands
the attacker a working credential in the owner's name.

**Fix:** Break the binding between "whoever submitted the form" and "the credential that
survives approval." Minimal, targeted option — do not trust a self-registration's
submitted password past approval:

```js
// approval.resolver.js, inside approveUser's transaction, for a self-registration
// (no Invitation row): the password was chosen by whoever submitted the form, who is
// not necessarily the address owner. Randomise it and make the owner set their own.
if (!invitation) {
  const setPasswordToken = createResetToken();
  await target.update(
    {
      status: 'Active',
      approvedAt: now,
      approvedBy: user.id,
      passwordHash: crypto.randomBytes(32).toString('hex'), // unusable, hook re-hashes
      resetPasswordToken: hashResetToken(setPasswordToken),
      resetPasswordExpiresAt: resetTokenExpiry()
    },
    { transaction: t }
  );
  // ...email the owner a "choose your password" link instead of sendAccountApprovedEmail
}
```

At minimum (weaker, but cheap), amend `sendVerificationEmail`'s copy for the tokenless
path to state that a password was set at registration time and to offer a
cancel-this-registration link that destroys the Pending row — so the victim's click is
informed rather than an unwitting confirmation.

---

## Warnings

### WR-01: Both `FOR UPDATE` admin counts full-scan an unindexed `users` table, and the retry wrapper only recognises deadlocks — the likely outcome, a lock-wait timeout, propagates raw and unretried

**File:** `backend/src/resolvers/user.resolver.js:120-121, 425-428, 521-530, 683-689, 749-754`

**Issue:** `users` has no index on `role`, `status`, or `emailVerified` — confirmed:
`models/User.js` declares none, and no migration under `backend/migrations/manual/` adds
one (only FK constraints reference `users`). Both

```sql
SELECT COUNT(*) ... FROM users WHERE role = 'ADMIN' AND status = 'Active' AND emailVerified = true FOR UPDATE
```

(`:426`, every `verifyEmail`) and its `AND id <> :id` sibling (`:685`, every `updateUser`
that reaches a guard) therefore perform a **full-table scan taking next-key locks on every
row of `users`**, held for the remainder of the transaction. 32-10 added the second such
scan; before it, `updateUser` took no table-wide lock at all.

The retry wrappers recognise exactly one error:

```js
const isDeadlock = (error) =>
  error?.original?.code === 'ER_LOCK_DEADLOCK' || error?.parent?.code === 'ER_LOCK_DEADLOCK';
```

Under an exclusive whole-table scan, the *normal* contention outcome is not a deadlock —
it is a lock **wait**, which after `innodb_lock_wait_timeout` (MySQL default 50s) raises
`ER_LOCK_WAIT_TIMEOUT`. `isDeadlock` returns false for it, so `:527` and `:752` rethrow it
unchanged.

**Concrete failure scenario:** An admin opens the user list and edits a name
(`updateUser`) while a newly-registered family member clicks their verification link. The
`updateUser` transaction holds locks on every `users` row. `verifyEmail` blocks on the
token-consumption `UPDATE`, waits 50 seconds, then fails with
`SequelizeDatabaseError: Lock wait timeout exceeded; try restarting transaction` surfaced
verbatim to an unauthenticated caller via Apollo's default error formatting. The user sees
a raw MySQL error on a verification page after a 50-second hang. (Their token survives the
rollback, so it is recoverable — but only if they retry.)

**Fix:** Two independent changes:

1. Add a covering index so the count is a range scan instead of a table scan:
   ```sql
   -- backend/migrations/manual/021-add-users-admin-lookup-index.sql
   ALTER TABLE users ADD INDEX users_role_status_emailverified_idx (role, status, emailVerified);
   ```
   and mirror it in `models/User.js`'s `indexes` option so `sync()` produces it too.
2. Widen the retry predicate to the recoverable-contention class, and normalise the error
   the caller sees:
   ```js
   const RETRYABLE_LOCK_CODES = new Set(['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']);
   const isRetryableLockError = (error) =>
     RETRYABLE_LOCK_CODES.has(error?.original?.code) || RETRYABLE_LOCK_CODES.has(error?.parent?.code);
   ```
   with a generic user-facing message (`'Please try again.'`) if the retry also fails,
   rather than the raw `SequelizeDatabaseError`.

---

### WR-02: The 400 ms response floor is silently defeated whenever real work exceeds it, and bcrypt cost 12 already consumes over half of it

**File:** `backend/src/resolvers/user.resolver.js:102-132`

**Issue:** `MIN_REGISTER_RESPONSE_MS = 400` is a fixed constant calibrated against one
machine's measurement recorded in `32-VERIFICATION.md` (~217 ms p99). `register.test.js`'s
own timing test comments that *"real bcrypt.hash(password, 12) cost (~225-235ms on this
hardware) would eat most of the 400ms floor's headroom"* — and mocks bcrypt away to keep
the test stable.

`finishTokenlessRegistration` has no behaviour when the floor is already exceeded:

```js
const elapsed = Date.now() - startedAt;
if (elapsed < MIN_REGISTER_RESPONSE_MS) await delay(MIN_REGISTER_RESPONSE_MS - elapsed);
```

On slower/contended hardware (the deployment target is a shared-vCPU VPS; bcrypt cost 12
commonly runs 400–800 ms there), or whenever the DB connection pool is under load, the
floor never engages. The mask disappears exactly under the conditions an attacker can
induce, and the taken-email vs free-email delta (`findOne`-only vs `findOne` + `INSERT` +
token generation) becomes directly observable — the WR-01 side channel the floor was added
to close. Rate limiting (5/hr/IP) raises the cost of exploiting it but an enumeration
attack already implies many source addresses.

**Fix:** Make the floor adaptive rather than a hard-coded constant, or at minimum make the
over-floor case observable:

```js
async function finishTokenlessRegistration(startedAt) {
  const elapsed = Date.now() - startedAt;
  if (elapsed < MIN_REGISTER_RESPONSE_MS) {
    await delay(MIN_REGISTER_RESPONSE_MS - elapsed);
  } else {
    // The floor stopped masking: real work outran the constant, so the taken/free
    // delta is observable again. Surface it so it can be re-tuned, not silently lost.
    console.warn(
      `[register] response floor exceeded: ${elapsed}ms > ${MIN_REGISTER_RESPONSE_MS}ms — timing mask ineffective`
    );
  }
  return { message: TOKENLESS_REGISTER_MESSAGE };
}
```

Better still, quantise to a multiple of the floor (`Math.ceil(elapsed / FLOOR) * FLOOR`) so
the mask degrades gracefully instead of vanishing.

---

### WR-03: The catch-all that makes tokenless failures silent logs no identifying context, so a dropped registration cannot be diagnosed or recovered

**File:** `backend/src/resolvers/user.resolver.js:331`

**Issue:**

```js
console.error('Tokenless registration failed:', err?.name, err?.message);
```

This is the *only* signal that a registration was accepted-looking and discarded (CR-01,
plus every transient DB failure the CR-03 fix deliberately swallows). It carries no email,
no name, no timestamp correlation, no request id. For a `SequelizeValidationError` the
message is `"Validation error: Validation isEmail on email failed"` — which does not even
name the field's value. An operator seeing this line has no way to identify the affected
registrant or invite them to retry.

The comment above it correctly argues that the *full* error object must not be logged
(a `DatabaseError`'s `.sql`/`.parameters` can carry the bcrypt hash) — but that argument
applies to the error object, not to context the resolver already holds safely.

**Fix:** Log the normalized email (already the DB's own stored, non-secret identifier) and
a stable marker, while still excluding the error object:

```js
console.error(
  'Tokenless registration failed:',
  JSON.stringify({ email: normalizedEmail, errorName: err?.name, errorMessage: err?.message })
);
```

Pair this with an alertable log level or metric, since by design this path is invisible to
the caller.

---

### WR-04: Registration squatting is still unhandled — stale Pending/unverified rows block the real owner forever and are never reaped (carried over from the previous round, unfixed)

**File:** `backend/src/resolvers/user.resolver.js:277-287`

**Issue:** Re-raised because the last three plans did not touch it and it now compounds
CR-02. `findOne` treats *any* existing row as "taken", including a Pending, never-verified
row whose 24-hour `emailVerificationExpiresAt` lapsed months ago. Nothing anywhere reaps
such rows (grep: no scheduled job, no cleanup in `models/index.js`, no TTL).

**Concrete failure scenario:** An attacker squats `operator@bisrat.ch` (the configured
`ADMIN_EMAIL`) on a fresh deployment before the operator registers. The operator's own
registration now hits the taken-email branch and returns the uniform success message; they
never receive a verification email; and because the squatted row's own token expired
unverified, `verifyEmail` can never fire the zero-admin bootstrap for that address. The
documented first-admin path is permanently denied, and the only recovery is direct DB
access.

**Fix:** Treat an expired, unverified, Pending row as a free address. The caller-visible
response is unchanged, so enumeration-uniformity is preserved:

```js
if (existingUser) {
  const stale =
    existingUser.status === 'Pending' &&
    existingUser.emailVerified === false &&
    (!existingUser.emailVerificationExpiresAt || existingUser.emailVerificationExpiresAt < new Date());

  if (!stale) {
    sendRegistrationAttemptEmail({ to: existingUser.email, name: existingUser.name }).catch((err) => {
      console.error('Failed to send registration-attempt email:', err);
    });
    return await finishTokenlessRegistration(startedAt);
  }
  await existingUser.destroy(); // stale squat — fall through and re-create
}
```

---

### WR-05: The D-10 registration-attempt notification is an unauthenticated email-amplification vector against any registered address

**File:** `backend/src/resolvers/user.resolver.js:283`; `backend/src/config/rateLimits.js:7`

**Issue:** Any anonymous caller who knows (or guesses) an address that exists in the system
can cause the application to send that address an unsolicited email, by submitting a
tokenless registration for it. The only control is `register: { max: 5, windowMs: 60*60*1000 }`
— per **client IP**, so it is defeated by IP rotation, and the volume needed is small
because the target set is "every registered user".

Because the production deployment sends through a single verified Resend domain
(`bisrat.ch`), sustained abuse damages the sending reputation for *all* transactional mail,
including password resets and verification links — i.e. it degrades the auth flows this
phase exists to protect.

**Fix:** Throttle per **target address**, not only per source IP, using the existing
`rateLimitStore`:

```js
if (existingUser) {
  // Cap owner notifications per address (not per IP) so a rotating-IP caller cannot
  // mail-bomb a known account or burn the sending domain's reputation.
  if (checkAndIncrement(`registration-attempt:${existingUser.email}`, 3, 24 * 60 * 60 * 1000)) {
    sendRegistrationAttemptEmail({ to: existingUser.email, name: existingUser.name }).catch(...);
  }
  return await finishTokenlessRegistration(startedAt);
}
```

The suppressed branch must not change the response or the timing (it does not — the shared
exit path handles both).

---

### WR-06: The CR-02 concurrency regression tests assert an admin count weaker than the invariant 32-12 established, so they cannot detect the Gap-2 defect class

**File:** `backend/src/resolvers/updateUser.test.js:378, 397`

**Issue:** Both concurrency tests close with:

```js
const verifiedAdminCount = await models.User.count({ where: { role: 'ADMIN', emailVerified: true } });
expect(verifiedAdminCount).toBeGreaterThanOrEqual(1);
```

`status` is absent. After 32-12 the invariant these tests exist to protect is *"at least
one **functioning** admin (role ADMIN **and status Active** and emailVerified)"* — the
sequential Gap-2 tests added in the same plan correctly assert the three-part count
(`:436-438`, `:476-478`), but the concurrency tests were left on the old two-part one.

**Concrete failure scenario:** A future change reintroduces the Gap-2 miscount in the
concurrent path (say, by dropping `status` from the `FOR UPDATE` count again) and lets two
racing calls leave only a `Pending` ADMIN standing. `models.User.count({ role: 'ADMIN',
emailVerified: true })` still returns 1, both tests stay green, and the regression ships.
These are the exact tests whose passing was cited as evidence that Truth 7 was closed.

**Fix:** Assert the same three-part predicate the fix enforces, in both tests:

```js
const functioningAdminCount = await models.User.count({
  where: { role: 'ADMIN', status: 'Active', emailVerified: true }
});
expect(functioningAdminCount).toBeGreaterThanOrEqual(1);
```

---

### WR-07: `verifyEmail`'s lock-contention test no longer mirrors the resolver's locking read, invalidating its stated premise

**File:** `backend/src/resolvers/verifyEmail.test.js:144-146`

**Issue:** The test's comment claims *"A raw connection takes **the exact locking
admin-count read the fixed resolver uses** (SELECT ... FOR UPDATE)"*, but the raw query is:

```sql
SELECT COUNT(*) AS adminCount FROM users WHERE role = 'ADMIN' AND emailVerified = true FOR UPDATE
```

while the resolver (`user.resolver.js:426`, changed by 32-12) now uses
`role = 'ADMIN' AND status = 'Active' AND emailVerified = true`. 32-12 updated the resolver
and the assertions but not this mirror query.

The test currently still passes for an incidental reason — with no index on `role`/`status`
(see WR-01), both queries full-scan and lock the same rows — so the drift is invisible
today. The moment WR-01's index is added, the two predicates select different index ranges
and the "deterministic lock-contention proof" may stop contending at all, silently
degrading into a test that proves nothing while staying green.

**Fix:** Keep the mirror query and the resolver query in lockstep — ideally by exporting
the predicate as a shared constant from `user.resolver.js` and interpolating it into the
test's raw query, so drift becomes impossible:

```js
// user.resolver.js
export const FUNCTIONING_ADMIN_WHERE = "role = 'ADMIN' AND status = 'Active' AND emailVerified = true";
```

At minimum, update the raw query in the test to include `AND status = 'Active'`.

---

### WR-08: The invited `register` branch still performs no `name` validation and leaks raw ORM error text (carried over from the previous round, unfixed)

**File:** `backend/src/resolvers/user.resolver.js:199-227`

**Issue:** Re-raised because it is still live. `assertRegistrationName` (`:262`) is applied
only to the tokenless branch. The invited branch passes `name` straight into
`models.User.create` at `:209` with no length or blank check, and the whole transaction has
no `try/catch`.

Consequences, both reachable by anyone holding a valid unused invitation token (the invitee
themselves, or anyone who intercepts the emailed link):

- `name: "   "` → an account whose `name` is whitespace, rendered blank everywhere the
  admin queue and family list display it. `allowNull: false` does not reject empty strings.
- `name: "A".repeat(300)` → uncaught `SequelizeDatabaseError: Data too long for column
  'name' at row 1` returned verbatim to the caller.
- A concurrent registration on the same `invitedEmail` → uncaught
  `SequelizeUniqueConstraintError` (the `existingUser` check at `:199` is a read-then-write
  race that only the DB constraint actually closes).

**Fix:** Reuse the existing policy on both branches — it is already written and tested:

```js
if (token) {
  const cleanName = assertRegistrationName(name);
  // ...
  createdUser = await models.User.create({ name: cleanName, email, ... }, { transaction: t });
```

and wrap the transaction so `UniqueConstraintError` becomes
`'An account with this email already exists.'` rather than raw ORM text, mirroring
`linkUserToMember:629-634`.

---

### WR-09: `relationshipNote` is validated and stored untrimmed, unlike every other free-text field (carried over from the previous round, unfixed)

**File:** `backend/src/utils/relationshipNotePolicy.js:6-8`; `backend/src/resolvers/user.resolver.js:261, 304`

**Issue:** `name` is trimmed by `assertRegistrationName` and `email` by
`assertRegistrationEmail`; `relationshipNote` is neither. `assertRelationshipNoteLength`
measures the raw input, and the resolver stores `relationshipNote || null` verbatim.

**Concrete failure scenario:** A registrant submits `relationshipNote: "   "` (a form field
they tabbed through). It is stored as a three-space string, not `null`. The admin
notification email then renders `<br /><br /><em>Note:    </em>` (`mailer.js:131` —
`note ? ... : ''` is truthy for whitespace), and `pendingApprovals` returns a non-null note
that the admin UI will treat as "this person explained themselves" when they did not.
Separately, `'  ' + 'x'.repeat(499)` (501 raw chars, 499 after trim) is rejected with
"Relationship note must be 500 characters or fewer." even though it would fit.

**Fix:** Trim once in the policy and return the cleaned value, matching `namePolicy`'s
shape:

```js
export function assertRelationshipNoteLength(note) {
  const trimmed = String(note ?? '').trim();
  if (!trimmed) return null;
  if (trimmed.length > 500) throw new Error('Relationship note must be 500 characters or fewer.');
  return trimmed;
}
```

then `const cleanNote = assertRelationshipNoteLength(relationshipNote);` and store
`relationshipNote: cleanNote`.

---

## Info

### IN-01: The invited branch hardcodes the success message instead of using the shared constant

**File:** `backend/src/resolvers/user.resolver.js:241-243` vs `:100`
**Issue:** `TOKENLESS_REGISTER_MESSAGE` exists at `:100`, but `:242` repeats the literal
`'Registration received. Verify your email to activate your account.'`. The two branches
must return identical text (`register.test.js` asserts a single `SUCCESS_MESSAGE` against
both) but nothing enforces it; editing the constant silently desynchronises them.
**Fix:** `return { message: TOKENLESS_REGISTER_MESSAGE };` on both branches, and rename the
constant to `REGISTER_MESSAGE` since it is no longer tokenless-specific.

### IN-02: `MIN_RESET_RESPONSE_MS` is reused as `resendVerificationEmail`'s floor despite its reset-specific name

**File:** `backend/src/resolvers/user.resolver.js:102, 375, 585`
**Issue:** `resendVerificationEmail` pads to `MIN_RESET_RESPONSE_MS`. The behaviour is
correct, but the name implies the constant belongs to `requestPasswordReset`, so anyone
retuning the reset floor silently retunes the resend floor too.
**Fix:** Rename to `MIN_UNIFORM_RESPONSE_MS`, or introduce a separate
`MIN_RESEND_RESPONSE_MS` initialised from the same base.

### IN-03: `updateUser`'s email-change last-administrator guard reads the already-mutated in-memory `target.role`

**File:** `backend/src/resolvers/user.resolver.js:693-699, 721`
**Issue:** The role block at `:698` assigns `target.role = input.role` before the email
block at `:721` evaluates `target.role === 'ADMIN'`, so the email guard tests
post-mutation state rather than the persisted role. Today this is masked: because
`otherFunctioningAdminCount` excludes only `target.id`, and the acting user is always a
functioning admin (guaranteed by `getUserFromRequest` + `requireAdmin`), the count can only
reach 0 when `target === actor` — a self-edit, where a role change to `ADMIN` is impossible.
The dependence on that non-local invariant is fragile.
**Fix:** Snapshot the persisted values before any mutation and evaluate both guards against
the snapshot: `const wasAdmin = target.role === 'ADMIN'; const wasVerified = target.emailVerified === true;`.

### IN-04: The blanket Rejected/Disabled refusal makes those accounts terminal with no in-app repair path

**File:** `backend/src/resolvers/user.resolver.js:676-678`; `backend/src/resolvers/approval.resolver.js:10`
**Issue:** 32-11's refusal is correct for its security purpose, but `approveUser`/`rejectUser`
require `status === 'Pending'` and no mutation writes `status: 'Active'` for a Rejected or
Disabled row. After this change an admin cannot correct even a typo'd name on such an
account; the only remedy is direct SQL against production.
**Fix:** Either narrow the refusal to the credential-bearing fields it actually protects
(`input.email`, i.e. the path that mints a verification token) while allowing `name`, or
add an explicit admin `reinstateUser(userId)` mutation so the terminal state has a
documented, audited exit.

### IN-05: `notifyAdminsOfPendingRegistration` uses `Promise.all`, so one failing recipient reports the whole batch as failed

**File:** `backend/src/resolvers/user.resolver.js:50-62`
**Issue:** A single rejected `sendPendingRegistrationEmail` rejects the aggregate, and the
caller's `.catch` logs one generic line — the operator cannot tell which admins were
notified and which were not.
**Fix:** `Promise.allSettled`, then log the rejected entries individually with the
recipient address.

### IN-06: An in-code comment still claims `requireAdmin` shares the functioning-admin definition

**File:** `backend/src/resolvers/user.resolver.js:46-48`
**Issue:** *"matching the other admin guards in this codebase
(requireAdmin/isFunctioningAdmin/updateUser's last-administrator count)"* — `requireAdmin`
(`auth.js:42-45`) checks only `role === 'ADMIN'`; it inherits status/verification from
`getUserFromRequest` rather than checking them. 32-12 corrected the equivalent
overstatement in `auth.js` but left this one. This is the same comment-vs-code drift class
the previous round logged as WR-14.
**Fix:** Reword to *"…matching `isFunctioningAdmin` and the two raw admin counts;
`requireAdmin` reaches the same result indirectly, via `getUserFromRequest`'s
status/verification gate."*

### IN-07: `renderHtml` interpolates `ctaUrl` unescaped into an `href` attribute

**File:** `backend/src/services/mailer.js:41, 43`
**Issue:** `<a href="${ctaUrl}" ...>` receives no escaping, and `escapeHtml`'s own header
comment states it is for text nodes, *"never an attribute like href"*. Every current
`ctaUrl` is built from `env.clientUrl` plus a hex token, so nothing attacker-controlled
reaches it today — this is latent, not live. Flagged because the phase added a new
`renderHtml` caller (`sendRegistrationAttemptEmail`) and the next one may pass a
user-derived URL.
**Fix:** Escape at the interpolation site (`href="${escapeHtml(ctaUrl)}"`) and drop the
"callers must never pass a URL here" contract from the comment, so correctness does not
depend on every future caller reading it.

---

_Reviewed: 2026-09-03T08:11:33Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
