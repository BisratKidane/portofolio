---
phase: 32-tokenless-registration
reviewed: 2026-08-31T10:13:02Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - backend/src/resolvers/pendingApprovals.test.js
  - backend/src/resolvers/rateLimit.test.js
  - backend/src/resolvers/register.test.js
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
  warning: 11
  info: 3
  total: 17
status: issues_found
---

# Phase 32: Code Review Report

**Reviewed:** 2026-08-31T10:13:02Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

This review re-examined the tokenless `register` branch after Plan 32-05's CR-01 gap
closure, treating the fix itself as suspect.

**On the specific questions asked:**

1. **Enumeration equivalence — partially closed.** The ordering claim holds:
   `assertRelationshipNoteLength` / `assertRegistrationName` / `!email` genuinely never read
   `email`, so their errors are email-independent. The success, duplicate-race, and
   `create`-failure outcomes do funnel through one message. **But the uniform-response guard
   stops short**: `models.User.findOne` (line 258) and `createVerificationToken()` (line 270)
   sit *outside* the `try` and outside the floor. `createVerificationToken()` runs only on the
   free-email path, so a throw there is a free-path-only divergence, and a `findOne` failure
   returns raw Sequelize text to an anonymous caller — the exact thing WR-02 was supposed to
   stop. See CR-03.
2. **Timing — correct in shape, fragile in practice.** `startedAt` *is* captured before
   `bcrypt.hash` (line 251 vs. 257), so bcrypt cost is inside the floor; that part is sound.
   Every *successful* tokenless return does route through `finishTokenlessRegistration`. The
   floor is nevertheless a floor, not a constant: once real work exceeds 400 ms it silently
   becomes a no-op and the free/taken delta reappears (WR-01). The validation-throw paths
   bypass it, but harmlessly (email-independent).
3. **The catch block — leaks nothing to the client, but is too wide in the other direction.**
   Nothing from `err` reaches the GraphQL response. However it converts genuine deploy and
   programming failures (unapplied migration 020, `isEmail` validation) into a *success*
   message with no account created and no alerting (CR-02, WR-02), and it writes the raw
   Sequelize error — including `.sql` with the registrant's email and bcrypt hash — to
   application logs (WR-03).
4. **Test integrity — weaker than the 32-05 SUMMARY claims.** The CR-01 regression's
   `expect(takenResult).toEqual(freshResult)` assertion still passes with
   `assertRegistrationName` deleted (WR-08), and the WR-01 timing test pins `Date.now()` to 0,
   making its central assertion unfalsifiable (WR-07). Neither is vacuous end-to-end, but
   neither is the mutation-resistant guard it is described as.
5. **Known open debt (recorded, not re-litigated):** WR-03's invited-branch half —
   blank/whitespace-only `name` accepted when a token is supplied — remains open and is
   documented in-code at `user.resolver.js:246-250`.

**Beyond the stated focus**, three larger problems surfaced. `escapeHtml` is applied to every
raw text-node interpolation in `mailer.js` (verified caller by caller) but `renderHtml` splices
`ctaUrl` into an `href` attribute unescaped, contradicting `escapeHtml.js`'s own header
comment. The `passwordAlreadyHashed` control-channel flag is genuinely unspoofable — it is a
`create` option, never derived from content — and the model hook reads it correctly. But
opening `register` to anonymous callers newly exposes `verifyEmail`'s zero-admin bootstrap
promotion to the internet (CR-01), and the resulting Pending self-registrations are invisible
to every admin surface that exists (WR-04), so the flow dead-ends after it ships.

## Critical Issues

### CR-01: Tokenless registration exposes `verifyEmail`'s zero-admin ADMIN bootstrap to anonymous callers

**File:** `backend/src/resolvers/user.resolver.js:236-313` (tokenless branch), `backend/src/resolvers/user.resolver.js:404-410` (promotion), `backend/src/resolvers/user.resolver.js:604-618` (reachability)
**Severity:** BLOCKER

**Issue:**
`verifyEmail` promotes *whoever verifies next* to `ADMIN` when no email-verified admin exists:

```js
const [{ adminCount }] = await sequelize.query(
  "SELECT COUNT(*) AS adminCount FROM users WHERE role = 'ADMIN' AND emailVerified = true FOR UPDATE",
  { transaction: t, type: sequelize.QueryTypes.SELECT }
);
if (Number(adminCount) === 0) {
  await models.User.update({ role: 'ADMIN' }, { where: { id: user.id }, transaction: t });
}
```

There is no condition on how the account was created, on `status`, or on the presence of an
invitation. Before this phase, reaching `verifyEmail` at all required an admin-issued
invitation token, so the bootstrap was gated behind an existing admin. The tokenless branch
removes that gate, and the code explicitly states it is live on deploy with no feature switch
(`user.resolver.js:167-168`, D-03). Any anonymous person can now register, verify a mailbox
they control, and take the ADMIN slot.

Two reachable windows:

- **Fresh deployment.** With zero users, the first anonymous verifier becomes ADMIN. An
  attacker who registers before the operator both steals the role and *denies* it to the
  operator, since the operator's later verification sees `adminCount = 1`.
- **Existing deployment, sole-admin email change.** `updateUser` lets a user change their own
  email and sets `target.emailVerified = false` (lines 611-617) with **no last-administrator
  guard** — that guard only covers `role` changes (lines 586-593). While the sole admin's new
  address is unverified, `adminCount` is 0 and the window is open to the internet.

The promoted attacker lands `role: ADMIN, status: Pending`, so `getUserFromRequest`
(`utils/auth.js:33`) blocks the token today. The escalation completes on approval — and
`pendingApprovals` (`user.schema.js:57`) exposes no `role` in any consuming surface, so an
admin clicking "approve" on what looks like a routine self-registration activates an ADMIN.

**Fix:** Never let the bootstrap promotion fire for an account that nobody vouched for.

```js
// verifyAndPromote, replacing the unconditional promotion
if (Number(adminCount) === 0) {
  // Only an invitation-backed registrant may claim the bootstrap ADMIN slot;
  // a tokenless self-registrant is an anonymous stranger by construction.
  const bootstrapInvitation = await models.Invitation.findOne({
    where: { registeredUserId: user.id },
    transaction: t
  });
  if (bootstrapInvitation) {
    await models.User.update({ role: 'ADMIN' }, { where: { id: user.id }, transaction: t });
  }
}
```

Additionally, extend `updateUser`'s last-administrator guard to the email-change path so the
sole admin cannot de-verify themselves:

```js
if (normalized !== target.email && target.role === 'ADMIN' && target.emailVerified) {
  const otherVerifiedAdmins = await models.User.count({
    where: { role: 'ADMIN', emailVerified: true, id: { [Op.ne]: target.id } }
  });
  if (otherVerifiedAdmins === 0) {
    throw new Error('Promote another administrator before changing the last administrator\'s email.');
  }
}
```

### CR-02: An invalid or over-length email is reported to the registrant as a successful registration

**File:** `backend/src/resolvers/user.resolver.js:256-312`
**Severity:** BLOCKER

**Issue:**
The tokenless branch validates `password`, `relationshipNote`, `name`, and *presence* of
`email` — but never its **format or length**. `models.User.create` therefore runs against an
unvalidated value and `User.js:26`'s `validate: { isEmail: true }` throws a
`SequelizeValidationError`, which the catch-all at line 302 swallows and converts to
`TOKENLESS_REGISTER_MESSAGE`. An email longer than the `VARCHAR(255)` column produces
`Data too long` and does exactly the same.

Result: a registrant who typos their address (`ada@example` , `ada@@example.com`, a pasted
name field, a 300-char address) receives
`"Registration received. Verify your email to activate your account."`, no row is created, no
verification mail is sent, and there is no error, no retry prompt, and no server-side signal
distinguishing this from success. This is silent loss of a real user's registration on the
app's only public entry point.

Email *format* validity is entirely independent of whether an account exists, so validating it
before the existing-user lookup leaks nothing — exactly the argument that already justifies
`assertRegistrationName` running there.

**Fix:** Add an `emailPolicy.js` sibling to `namePolicy.js` and call it alongside the other
pre-lookup guards:

```js
// backend/src/utils/emailPolicy.js
export const MAX_EMAIL_LENGTH = 255;
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function assertRegistrationEmail(email) {
  const normalized = String(email ?? '').toLowerCase().trim();
  if (!normalized) throw new Error('Email is required.');
  if (normalized.length > MAX_EMAIL_LENGTH) throw new Error('Email must be 255 characters or fewer.');
  if (!EMAIL_RE.test(normalized)) throw new Error('Enter a valid email address.');
  return normalized;
}

// user.resolver.js, replacing lines 254-256
const normalizedEmail = assertRegistrationEmail(email);
```

Add a regression test asserting a malformed email is *rejected* (not silently absorbed) and
that the message is identical whether or not any account exists.

### CR-03: The uniform-response guard does not cover `findOne` or `createVerificationToken` — raw DB errors reach an anonymous caller

**File:** `backend/src/resolvers/user.resolver.js:258`, `backend/src/resolvers/user.resolver.js:270`
**Severity:** BLOCKER

**Issue:**
The `try` block starts at line 271, but two email-path-relevant operations run before it:

```js
const existingUser = await models.User.findOne({ where: { email: normalizedEmail } });   // 258 - unguarded
...
const verificationToken = createVerificationToken();                                      // 270 - unguarded, FREE PATH ONLY
try {
  const createdUser = await models.User.create(...);                                      // 277 - guarded
```

Two defects:

- **Information disclosure.** If `findOne` rejects — connection-pool exhaustion, a
  `SequelizeDatabaseError` on an unmigrated target, `ER_LOCK_WAIT_TIMEOUT` — the raw error
  propagates through Apollo to an *unauthenticated* caller, message and all. Sequelize's
  `DatabaseError` carries `.sql`, so table and column names leak. This directly violates the
  contract stated at lines 302-309 ("never surface raw ORM/DB error text to an unauthenticated
  caller"). It also skips `finishTokenlessRegistration`, so this outcome is both differently
  shaped *and* markedly faster than every other one.
- **Residual enumeration divergence.** `createVerificationToken()` (line 270) executes only
  when `existingUser` is falsy. A throw there (`crypto.randomBytes` failure) yields an error
  response on the free path where the taken path returned success — a free/taken divergence
  that the fix was written to eliminate. Improbable, but it is precisely the class of gap
  CR-01 was.

The WR-02 regression test mocks `models.User.create`, never `models.User.findOne`, so neither
path is covered.

**Fix:** Move the whole post-validation body inside one `try` and make
`finishTokenlessRegistration` the single exit:

```js
const normalizedEmail = assertRegistrationEmail(email); // see CR-02
const startedAt = Date.now();
try {
  const passwordHash = await bcrypt.hash(password, 12);
  const existingUser = await models.User.findOne({ where: { email: normalizedEmail } });

  if (existingUser) {
    sendRegistrationAttemptEmail({ to: existingUser.email, name: existingUser.name })
      .catch((err) => console.error('Failed to send registration-attempt email:', err));
  } else {
    const verificationToken = createVerificationToken();
    const createdUser = await models.User.create({ /* ... */ }, { passwordAlreadyHashed: true });
    sendVerificationEmail({ to: normalizedEmail, token: verificationToken })
      .catch((err) => console.error('Failed to send verification email:', err));
    writeAuditLog(models, { /* ... */ })
      .catch((err) => console.error('Failed to write audit log:', err));
  }
} catch (err) {
  console.error('Tokenless registration failed:', err?.name, err?.message);
}
return finishTokenlessRegistration(startedAt);
```

Note `startedAt` must move above `bcrypt.hash` (as it already is) and the single `return`
guarantees no path can bypass the floor. Add tests for `findOne` rejecting and for
`createVerificationToken` throwing.

## Warnings

### WR-01: The 400 ms floor silently becomes a no-op once real work exceeds it

**File:** `backend/src/resolvers/user.resolver.js:100-123`
**Issue:** `finishTokenlessRegistration` only pads *up to* `MIN_REGISTER_RESPONSE_MS`; when
`elapsed >= 400`, no delay is applied at all. The free path does `bcrypt(12)` + `findOne` +
`create` + verification-token hashing; the taken path does `bcrypt(12)` + `findOne`. The
comment cites a measured ~217 ms free-path p99, leaving under 2x headroom. Under DB
contention, a cold connection pool, a noisy-neighbour VPS, or a future bcrypt cost bump, the
free path crosses 400 ms while the taken path does not — and the delta the floor exists to mask
is directly observable again. The floor is also deterministic, so an attacker can average away
noise across the 5-requests/hour budget from many source IPs.
**Fix:** Pin the response time rather than flooring it — either raise the floor well above the
worst observed p99 and add a metric/alert when `elapsed > MIN_REGISTER_RESPONSE_MS`, or add
randomized jitter on top so the residual is not a stable signal:

```js
async function finishTokenlessRegistration(startedAt) {
  const elapsed = Date.now() - startedAt;
  if (elapsed > MIN_REGISTER_RESPONSE_MS) {
    console.warn(`Tokenless register exceeded response floor: ${elapsed}ms`);
  }
  const jitter = Math.floor(Math.random() * 60);
  const target = MIN_REGISTER_RESPONSE_MS + jitter;
  if (elapsed < target) await delay(target - elapsed);
  return { message: TOKENLESS_REGISTER_MESSAGE };
}
```

### WR-02: The catch-all reports success for genuine deploy/programming failures with no alerting

**File:** `backend/src/resolvers/user.resolver.js:302-312`
**Issue:** Enumeration-silence is achieved by treating *every* `create` failure as success.
On a target where migration 020 was not applied, `Unknown column 'relationshipNote'` is caught
and every single registration returns the success message while creating nothing. The only
signal is one `console.error` line in an app with no structured logging, no log levels, and no
request logging (per CLAUDE.md). A broken public registration flow is indistinguishable from a
healthy one from outside *and* from the operator's dashboard.
**Fix:** Keep the uniform client response, but make the server loud: emit a distinguishable
counter/log level for "tokenless register create failed", and narrow the swallow to the errors
that are legitimately expected — `UniqueConstraintError` (the duplicate race) — while
re-throwing (after the floor, as a generic `Error('Registration could not be completed.')`)
for anything else, so a deploy failure surfaces instead of masquerading as success.

### WR-03: Raw Sequelize errors containing the registrant's email and bcrypt hash are written to logs

**File:** `backend/src/resolvers/user.resolver.js:310`
**Issue:** `console.error('Tokenless registration create failed:', err)` serializes the whole
error object. A Sequelize `DatabaseError` carries `.sql` and `.parameters`; mysql2 inlines
bound values into `.sql`. On a failed insert this writes the registrant's email address and
their bcrypt password hash into plaintext application logs (Docker stdout, shipped wherever the
platform ships it). The same pattern exists for the duplicate-race path, which is expected to
fire routinely.
**Fix:** Log only non-sensitive fields:

```js
console.error('Tokenless registration create failed:', err?.name, err?.message);
```

### WR-04: Tokenless self-registrations are invisible to every admin surface — the flow dead-ends after deploy

**File:** `backend/src/resolvers/user.resolver.js:145-157`, `backend/src/schemas/user.schema.js:57`
**Issue:** The new admin-only `pendingApprovals` query has **zero consumers** — nothing in
`frontend/src` references it. The live admin screen, `frontend/src/pages/ApprovalsPage.jsx:25`,
queries `pendingRegistrations`, which builds its list from `Invitation` rows
(`invitation.resolver.js:37-54`). A tokenless self-registrant has no `Invitation` row, so they
can never appear there. Meanwhile `frontend/src/pages/Register.jsx:29-31` still renders
"Public self-registration is disabled — Agne is invitation-only" and
`AuthContext.jsx:18-20` does not even send `email` or `relationshipNote`.

Net effect on deploy (D-03 = no feature switch): an anonymous, publicly reachable endpoint
creates `Pending` accounts that accumulate forever, receive admin notification emails pointing
at `/invitations` (`mailer.js:114`) where they are not listed, and can never be approved or
rejected through any shipped UI.
**Fix:** Either (a) gate the tokenless branch behind an env flag until the admin UI lands, or
(b) widen `ApprovalsPage` to consume `pendingApprovals` in the same milestone. If the
backend/UI split is intentional, the endpoint should not be live: add
`if (!env.selfRegistrationEnabled) throw new Error('Registration is by invitation only.');`
before line 251.

### WR-05: `sendRegistrationAttemptEmail` is an unauthenticated email-bombing primitive against a known address

**File:** `backend/src/resolvers/user.resolver.js:260-268`, `backend/src/services/mailer.js:186-199`
**Issue:** Any anonymous caller who knows a registered address can force a mail to it by
POSTing `register`. Rate limiting is per-IP only (`config/rateLimits.js:7` — 5/hour), so a
distributed caller can flood the victim's inbox, burn the Resend sending quota, and damage the
sending domain's reputation via spam complaints. There is no per-recipient throttle and no
suppression of repeat notices.
**Fix:** Add a per-recipient cooldown before sending (e.g. a `lastRegistrationAttemptEmailAt`
column, or a keyed entry in `rateLimitStore` under `registrationAttempt:${normalizedEmail}`
with a 24 h window), and skip the send when the cooldown is unexpired. The response must stay
identical either way — do the check *after* the uniform-response decision, not before it.

### WR-06: `renderHtml` interpolates `ctaUrl` into an `href` attribute unescaped, contradicting `escapeHtml`'s stated contract

**File:** `backend/src/services/mailer.js:41`, `backend/src/services/mailer.js:43`, `backend/src/utils/escapeHtml.js:1-5`
**Issue:** `escapeHtml.js`'s header states the helper is "for values interpolated into an HTML
text node (never an attribute like href)". Its only consumer does exactly that:
`<a href="${ctaUrl}" ...>` and a second bare `${ctaUrl}` in the fallback paragraph. Every text
node (`heading`/`intro`/`note`/`ctaLabel`) is escaped by callers — I verified all six
`sendXEmail` functions — but `ctaUrl` never is. Today all callers pass server-built URLs
(`env.clientUrl` + a hex token, or `sendInvitationEmail`'s `url`), so nothing is exploitable.
The shape is the hazard: a future caller passing any user-influenced value into `ctaUrl`
produces attribute-breakout HTML injection with no guard and no test to catch it.
**Fix:** Escape at the interpolation point inside `renderHtml`, which is also the only place
that knows it is an attribute context:

```js
const safeCtaUrl = escapeHtml(ctaUrl);
// ...
<a href="${safeCtaUrl}" ...>${ctaLabel}</a>
// ...
<br />${safeCtaUrl}
```

Optionally reject non-`https:`/`http:` schemes before rendering.

### WR-07: The WR-01 timing regression test cannot fail on its central assertion

**File:** `backend/src/resolvers/register.test.js:410-456`
**Issue:** The test pins `Date.now()` to `0` for the whole run, so inside
`finishTokenlessRegistration` `elapsed` is always `0 - 0 = 0` and the delay argument is always
exactly `MIN_REGISTER_RESPONSE_MS`. `expect(ms).toBe(MIN_REGISTER_RESPONSE_MS)` is therefore a
tautology — it holds for any floor value and any elapsed time. The remaining assertion,
`expect(shortDelays.length).toBeGreaterThanOrEqual(2)`, does not attribute delays to calls: it
passes if one path delayed twice and the other zero times, which is the exact bypass the test
targets. The `elapsed >= floor` branch — where the floor silently does nothing (WR-01) — is
never exercised.
**Fix:** Assert per-call, and cover the over-floor branch:

```js
// per call, not in aggregate
const before = shortDelays.length;
await graphql(REGISTER_MUTATION, { name: 'Taken Path', email: 'wr01-taken@example.com', password: 'Password123!' });
expect(shortDelays.length - before).toBe(1);

// and drive elapsed past the floor with a stepping clock
let clock = 0;
vi.spyOn(Date, 'now').mockImplementation(() => (clock += MIN_REGISTER_RESPONSE_MS + 50));
// -> assert the resolver still returns the uniform message and records the overrun
```

### WR-08: The CR-01 equivalence assertion still passes with `assertRegistrationName` removed

**File:** `backend/src/resolvers/register.test.js:288-307`
**Issue:** The regression is framed as proving `assertRegistrationName` closes the enumeration
oracle, but `expect(takenResult).toEqual(freshResult)` is not the discriminator. Delete
`assertRegistrationName` and the 300-char name path becomes: taken email → short-circuit →
uniform success message; fresh email → `create` throws `Data too long` → caught at line 302 →
*the same* uniform success message. The equality assertion still holds. Only
`expect(freshResult.errors[0].message).toBe('Name must be 255 characters or fewer.')` fails,
and that asserts the guard's own message, not attacker-observable divergence. The 32-05 SUMMARY's
mutation-test claim is therefore weaker than stated — the catch-all, not the name policy, is
what closes the oracle for this input.
**Fix:** Keep the test, but add one that fails *only* if the pre-lookup ordering is broken —
e.g. assert that no `models.User.findOne` call occurs when the name is over-length (spy on
`findOne` and assert `toHaveBeenCalledTimes(0)`), which is the property `assertRegistrationName`
actually provides.

### WR-09: The tokenless success message is a named constant; the invited branch hardcodes the same literal

**File:** `backend/src/resolvers/user.resolver.js:98`, `backend/src/resolvers/user.resolver.js:232-234`
**Issue:** `TOKENLESS_REGISTER_MESSAGE` exists at line 98 and is used at line 122, but the
invited branch spells the identical string out inline. `register.test.js:23` then asserts both
against a third copy. Any edit to one of the three silently makes the invited and tokenless
responses distinguishable — which is exactly the property an attacker probes for when deciding
whether an address is invitation-bound.
**Fix:** `return { message: TOKENLESS_REGISTER_MESSAGE };` at line 232 (rename the constant to
`REGISTER_RECEIVED_MESSAGE`), and import it into the test instead of re-declaring
`SUCCESS_MESSAGE`.

### WR-10: `relationshipNote` is stored untrimmed, so a whitespace-only note becomes a non-null blank

**File:** `backend/src/resolvers/user.resolver.js:285`, `backend/src/utils/relationshipNotePolicy.js:6-8`
**Issue:** `relationshipNote: relationshipNote || null` stores `'   '` verbatim. This
contradicts the phase's own F-01 framing (a note is either present or `null`), diverges from
`assertRegistrationName`, which trims and returns the cleaned value, and produces a rendered
`<em>Note:  </em>` block in the admin notification (`mailer.js:131` gates on truthiness, which
a whitespace string satisfies). `assertRelationshipNoteLength` also measures the *untrimmed*
length, so 500 characters of content plus surrounding whitespace is rejected while a
501-character trimmed-to-500 value would have fit.
**Fix:** Make the policy return the cleaned value, mirroring `namePolicy.js`:

```js
export function assertRelationshipNoteLength(note) {
  const trimmed = String(note ?? '').trim();
  if (!trimmed) return null;
  if (trimmed.length > 500) throw new Error('Relationship note must be 500 characters or fewer.');
  return trimmed;
}
// caller: const cleanNote = assertRelationshipNoteLength(relationshipNote);  ...  relationshipNote: cleanNote
```

### WR-11: `verifyEmail` mints a session JWT for accounts that are not `Active`

**File:** `backend/src/resolvers/user.resolver.js:492`, `backend/src/schemas/user.schema.js:66`
**Issue:** `return { token: signToken(user), user };` runs unconditionally, including for the
tokenless self-registrant who remains `Pending` (and for `Rejected`/`Disabled` accounts that
re-verify). The token is inert today because `getUserFromRequest` re-checks
`status === 'Active'` (`utils/auth.js:33`), but it is a long-lived bearer credential handed to
an account that was never approved: if the account is later approved, the pre-issued token is
immediately live and predates the approval decision, and `passwordChangedAt` revocation does
not apply. `AuthPayload.token: String!` forces the non-null, so the schema is complicit.
**Fix:** Return a nullable-token payload (or a distinct `VerifyEmailPayload { status, token }`)
and emit `token: null` unless `user.status === 'Active'`. The
`verifyEmail.test.js` cases at lines 579-604 assert `status === 'Pending'` already and would
need only the token assertion updated.

## Info

### IN-01: The duplicate-insert race test contains unreachable assertions

**File:** `backend/src/resolvers/register.test.js:377-384`
**Issue:** The `for (const result of [a, b]) { if (result.errors) { ... } }` block is dead:
both `a` and `b` return the uniform success message (asserted equal two lines above), so
`result.errors` is always `undefined` and the "no Sequelize text" assertions never execute.
**Fix:** Assert the positive form directly —
`expect(a.data.register.message).toBe(SUCCESS_MESSAGE)` and
`expect(a.errors).toBeUndefined()` — and drop the conditional.

### IN-02: Mailer mocks are partial, so unrelated resolvers in the same file would throw on access

**File:** `backend/src/resolvers/verifyEmail.test.js:9-11`
**Issue:** The factory returns only `sendPendingRegistrationEmail`, while `user.resolver.js`
imports four mailer functions and `approval.resolver.js` imports two more. Under Vitest a
missing named export on a mocked module throws on first access, so any future test added to
this file that touches `register`, `updateUser`, `resendVerificationEmail`, `approveUser`, or
`rejectUser` will fail for a reason unrelated to what it is testing.
**Fix:** Return every export of `mailer.js` from the factory (as `register.test.js` almost
does — it covers the four `user.resolver.js` uses but omits the approval pair), or use
`vi.importActual` spread plus targeted overrides.

### IN-03: The invited branch silently discards `relationshipNote`

**File:** `backend/src/resolvers/user.resolver.js:169-234`, `backend/src/schemas/user.schema.js:61`
**Issue:** `relationshipNote` is a schema-level argument on `register`, but the invited branch
never reads it and never length-validates it. A client supplying both a token and a note gets a
success response with the note dropped and no indication. Consistent with D-02's "the
invitation is authoritative" stance, but undocumented at the schema level where a client author
would look.
**Fix:** Add an SDL comment on the `register` field noting that `email` and `relationshipNote`
apply only to the tokenless branch, or reject the combination explicitly.

---

_Reviewed: 2026-08-31T10:13:02Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
