---
phase: 32-tokenless-registration
reviewed: 2026-08-30T19:35:35Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - backend/migrations/manual/020-add-users-relationship-note.sql
  - backend/src/models/User.js
  - backend/src/models/User.test.js
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
  - backend/src/utils/relationshipNotePolicy.js
findings:
  critical: 1
  warning: 12
  info: 4
  total: 17
status: issues_found
---

# Phase 32: Code Review Report

**Reviewed:** 2026-08-30T19:35:35Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Phase 32 opens `register` to tokenless self-registration. The guards the plan names are
present and, per the orchestrator's mutation testing, individually test-covered. This review
therefore concentrated on the gaps mutation testing cannot see: edge cases *inside* the
guards, side channels other than the response message, and validation the tokenless branch
never got.

**One claimed invariant is definitively broken.** SEC-01 / D-08 ("enumeration-silent — identical
response whether the email is free or already taken") does not hold. The taken-email branch
returns early with a fixed message, but the free-email branch continues into an
**unguarded `models.User.create`** whose failures propagate to the caller as GraphQL errors.
Any input that makes the INSERT fail becomes a one-request, deterministic existence oracle.
I proved this against the live test database (probe removed afterwards; working tree is clean):

```
name = 'A'.repeat(300), email = taken@example.com
  => {"data":{"register":{"message":"Registration received. Verify your email to activate your account."}}}

name = 'A'.repeat(300), email = free@example.com
  => {"errors":[{"message":"Data too long for column 'name' at row 1", ... }],"data":null}
```

The same class also fires on the duplicate-insert race (`"Validation error"`) and, if
migration 020 has not been applied to a target database, on **every** free-email registration
(`Unknown column 'relationshipNote'`) — which would turn the entire endpoint into an oracle
in production while all tests stay green locally.

Secondary results, all measured or executed rather than inferred:

- **D-09 timing-safety is weakened, not absent.** bcrypt genuinely runs before the lookup, but
  the free path additionally pays a committed INSERT. Measured median 217.2 ms (free) vs
  215.9 ms (taken) over 12 paired samples, with near-disjoint distributions (WR-01).
- **The 500-char note cap is safe in the overflow direction.** `note.length` (UTF-16 code
  units) is always ≥ the MySQL character count, so nothing can exceed `VARCHAR(500)`. It
  over-rejects instead: 400 astral characters (`.length === 800`) are refused; 250 emoji
  (`.length === 500`) store as exactly 250 DB characters (WR-08).
- **`relationshipNote` is not over-exposed.** Every `User`-returning field resolver reachable
  by a non-admin is admin-or-self gated (`FamilyMember.linkedUser`/`createdBy`/`updatedBy`,
  `Invitation.inviter`/`registeredUser`), and `pendingApprovals`/`users`/`unlinkedUsers` are
  `requireAdmin`. No finding.
- **No email header injection.** I executed nodemailer with `newUserName = "Eve\r\nBcc: …"`;
  it folds CRLF to a space in the `Subject` header. The unescaped subject interpolation in
  `mailer.js:115` is safe. No finding.
- **`escapeHtml` is complete for every current call site.** All eight escaped interpolations
  land in HTML text nodes. The one attribute sink (`ctaUrl` in `href`) is unescaped, but every
  caller passes a server-derived URL today — latent only (WR-07).

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: BLOCKER — Enumeration oracle: unguarded `User.create` failures distinguish a free email from a taken one

**File:** `backend/src/resolvers/user.resolver.js:249-260`
**Also:** `backend/src/resolvers/user.resolver.js:229-241` (the early-return that establishes the asymmetry)

**Issue:**
The taken-email branch returns the fixed success message and performs no writes. The free-email
branch falls through to `models.User.create(...)` with **no try/catch and no pre-lookup
validation of `name` or `email`**. Any create failure therefore surfaces as a GraphQL error
while the taken-email case still returns success — a single-request, no-statistics existence
oracle that defeats SEC-01 / D-08 outright.

Three confirmed instances, all exploitable by an unauthenticated caller:

1. **Deterministic (verified):** `name` longer than the `VARCHAR(255)` column. MySQL strict
   mode raises `Data too long for column 'name' at row 1`. `name` is `String!` in the schema
   and is never trimmed, length-checked, or validated anywhere in `register`.
2. **Racy (verified):** two concurrent tokenless registrations on the same fresh email — the
   loser gets `Validation error` from the unique constraint instead of the silent message.
3. **Environmental:** on any database where manual migration 020 has not been applied, the
   INSERT fails with `Unknown column 'relationshipNote'` for *every* free email while taken
   emails still return success (see WR-11).

Note that the pre-lookup checks that *do* exist (`assertPasswordStrength`,
`assertRelationshipNoteLength`, `if (!email)`) are correctly placed — they run before the
lookup and so behave identically for both outcomes. The defect is specifically that `name`
and `email` validity are deferred to the database, i.e. to a point that only the free branch
ever reaches.

**Fix:** validate every attacker-controlled field *before* the lookup, and make the create
failure-silent so no future field can reopen the channel.

```js
// backend/src/utils/registrationPolicy.js (new, mirrors relationshipNotePolicy.js)
export const MAX_NAME_LENGTH = 255;
export function assertRegistrationName(name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) throw new Error('Name is required.');
  if (trimmed.length > MAX_NAME_LENGTH) throw new Error('Name must be 255 characters or fewer.');
  return trimmed;
}
```

```js
// backend/src/resolvers/user.resolver.js — tokenless branch
assertRelationshipNoteLength(relationshipNote);
const cleanName = assertRegistrationName(name);            // BEFORE the lookup
if (!email) throw new Error('Email is required.');
const normalizedEmail = email.toLowerCase().trim();
if (!normalizedEmail || !isEmailShaped(normalizedEmail)) throw new Error('Email is required.');

const passwordHash = await bcrypt.hash(password, 12);
const existingUser = await models.User.findOne({ where: { email: normalizedEmail } });
if (existingUser) { /* unchanged */ }

const verificationToken = createVerificationToken();
let createdUser;
try {
  createdUser = await models.User.create(
    { name: cleanName, email: normalizedEmail, passwordHash, status: 'Pending', /* … */ },
    { passwordAlreadyHashed: true }
  );
} catch (err) {
  // D-08: a failed create must be indistinguishable from the taken-email outcome.
  // Never let an ORM/DB error reach the caller from this branch.
  console.error('Tokenless registration create failed:', err);
  return { message: 'Registration received. Verify your email to activate your account.' };
}
```

Add a regression test that pins the oracle shut, e.g. assert that
`register({ name: 'A'.repeat(300), email: <taken> })` and
`register({ name: 'A'.repeat(300), email: <free> })` produce byte-identical responses.

## Warnings

### WR-01: Residual timing oracle — the free path pays a committed INSERT the taken path does not

**File:** `backend/src/resolvers/user.resolver.js:228-275`

**Issue:** D-09 correctly moves `bcrypt.hash` ahead of the lookup, so both outcomes pay the
~215 ms bcrypt cost. But after that point the branches diverge in *awaited* work: the free
path awaits `models.User.create` (a committed INSERT), the taken path awaits nothing (both
`sendRegistrationAttemptEmail` and `writeAuditLog` are fire-and-forget). Measured over 12
paired samples on the test database:

```
TAKEN median 215.9 ms  (215,216,216,216,216,216,216,216,216,217,221)
FREE  median 217.2 ms  (217,217,217,217,217,217,217,217,218,218,218)
DELTA median   1.3 ms
```

The distributions barely overlap. Local jitter is sub-millisecond, so a modest sample count
recovers the signal; over a network it needs more samples but remains recoverable. This is a
weaker oracle than CR-01, but it independently violates the phase's timing-safety claim.

**Fix:** apply the response-floor pattern this same file already uses for
`requestPasswordReset` (`MIN_RESET_RESPONSE_MS`, lines 98/294/316-317) to `register`'s
tokenless branch:

```js
const startedAt = Date.now();
// … both branches …
const elapsed = Date.now() - startedAt;
if (elapsed < MIN_REGISTER_RESPONSE_MS) await delay(MIN_REGISTER_RESPONSE_MS - elapsed);
return { message: 'Registration received. Verify your email to activate your account.' };
```

Pick the floor above the observed free-path p99 (bcrypt cost 12 plus INSERT, so ~400 ms is a
reasonable starting point) and add a test asserting the floor holds for both outcomes.

### WR-02: Raw Sequelize/MySQL error text is returned to unauthenticated callers

**File:** `backend/src/resolvers/user.resolver.js:249-260`

**Issue:** Because the create is unguarded, internal ORM/engine strings reach anonymous
clients verbatim, with `extensions.code: "INTERNAL_SERVER_ERROR"`:

- `Data too long for column 'name' at row 1` — discloses the physical column name and the
  storage engine's strict-mode behaviour.
- `Validation error: Validation isEmail on email failed` — discloses the ORM and validator
  in use (reproduced with `email: "not-an-email"` and with `email: "   "`).
- `Validation error` — the unique-constraint path.

Every other user-facing error in this codebase is a hand-written sentence
(`'Invalid email or password.'`, `'This invitation link is invalid.'`). These three are the
only ones that leak implementation detail.

**Fix:** covered by CR-01's try/catch plus explicit pre-lookup validation. Additionally
consider `formatError` on the Apollo server to mask any unexpected error message in
production as defence in depth.

### WR-03: `name` is accepted blank or whitespace-only on both register branches

**File:** `backend/src/resolvers/user.resolver.js:152`, `:181-189`, `:249-260`

**Issue:** `register` never trims or requires a non-empty `name`. Verified: registering with
`name: "   "` succeeds and persists `name = "   "`. That row then flows into:

- `pendingApprovals` — an admin sees a blank-named stranger in the approval queue with no
  way to tell it from a rendering bug;
- the D-12 admin notification subject — `New account awaiting approval: ` (trailing colon,
  nothing after it) and the HTML intro `<strong></strong> (…)`.

`updateUser` in this same file (lines 561-565) *does* enforce this
(`if (!trimmed) throw new Error('Name is required.')`), so the registration path is
inconsistent with the project's own established rule. `relationshipNote` has the mirror
problem: `''` becomes `null` (line 257) but `'   '` is stored verbatim.

**Fix:** trim and require `name` in `register` (see CR-01's `assertRegistrationName`), and
normalise the note the same way:

```js
const cleanNote = typeof relationshipNote === 'string' && relationshipNote.trim()
  ? relationshipNote.trim()
  : null;
```

### WR-04: The invited branch silently discards `relationshipNote` and skips its 500-char cap

**File:** `backend/src/resolvers/user.resolver.js:152` (arg destructured), `:155-218` (branch)

**Issue:** `relationshipNote` is a top-level `register` argument in the SDL
(`user.schema.js:61`) but the invited branch never reads it, never validates it, and never
persists it. Verified: an invited registration carrying a 2000-character note returns success
and stores `relationshipNote = null` — silent data loss, and the D-05 cap is not applied on
that path at all. An invitee who fills in the note field gets no feedback that their input
was thrown away.

**Fix:** decide explicitly and encode the decision. Either persist it on the invited branch
too (moving `assertRelationshipNoteLength(relationshipNote)` above the `if (token)` check so
the cap is uniform), or reject it:

```js
if (token) {
  if (relationshipNote) throw new Error('A relationship note is not accepted with an invitation link.');
  …
}
```

Add a test pinning whichever behaviour is chosen.

### WR-05: `pendingApprovals` returns every Pending + verified account, not just self-registrations

**File:** `backend/src/resolvers/user.resolver.js:128-140`

**Issue:** The docstring says "self-registrations awaiting an approval decision … Coexists
with pendingRegistrations for this phase (invitation-flow specific)", but the query is
`where: { status: 'Pending', emailVerified: true }` with **no filter on the existence of an
Invitation row**. An invited registrant whose auto-activation was refused (unvouched,
demoted, disabled, or email-unverified inviter — all five of which `verifyEmail.test.js`
exercises and leaves in exactly this state) therefore appears in **both**
`pendingApprovals` and `pendingRegistrations`. The admin queue double-counts them, and the
two lists disagree about what "pending approval" means.

This is a correctness/spec mismatch rather than a leak (the query is `requireAdmin`, verified
by test), but it is invisible today because `pendingApprovals.test.js` has no case for a
Pending + verified user who *does* have an Invitation row.

**Fix:** make the query match its own documentation, or update the documentation to say it
deliberately supersedes `pendingRegistrations`. If the former:

```js
pendingApprovals: async (_parent, _args, { models, user }) => {
  requireAdmin(user);
  const invited = await models.Invitation.findAll({
    where: { registeredUserId: { [Op.ne]: null } },
    attributes: ['registeredUserId']
  });
  const invitedIds = invited.map((i) => i.registeredUserId);
  return models.User.findAll({
    where: {
      status: 'Pending',
      emailVerified: true,
      ...(invitedIds.length ? { id: { [Op.notIn]: invitedIds } } : {})
    },
    order: [['createdAt', 'DESC']]
  });
}
```

Either way, add the missing test case.

### WR-06: Unauthenticated email amplification with attacker-controlled content

**File:** `backend/src/resolvers/user.resolver.js:235-237`, `:38-60`, `:449-453`;
`backend/src/services/mailer.js:186-199`

**Issue:** Phase 32 adds two anonymous-triggerable outbound email paths with no
per-recipient throttling or deduplication:

1. `sendRegistrationAttemptEmail` fires at a *victim's real stored address* whenever anyone
   attempts to register with their email. Rate limiting is per-IP only
   (`rateLimits.js:7` — `register: { max: 5, windowMs: 3600000 }`), so a rotating-IP attacker
   can mail-bomb a known account holder without bound. The D-10 rationale is sound; the
   missing control is a per-recipient cool-down.
2. The D-12 fan-out mails **every** Active + verified admin on each self-registrant
   verification, with the attacker's `name` and `relationshipNote` in the body and `name` in
   the subject. Five registrations per hour per IP, times N admins, times unlimited IPs.

Neither is a confidentiality break — both send only to addresses the server already knows —
but both are new abuse surface and both can burn the project's Resend sending reputation.

**Fix:** add a per-recipient suppression window alongside the existing per-IP limiter, reusing
`rateLimitStore.checkAndIncrement` with a recipient-keyed key:

```js
// e.g. at most one registration-attempt notice per address per 24h
if (checkAndIncrement(`regattempt:${existingUser.email}`, 1, 24 * 60 * 60 * 1000)) {
  sendRegistrationAttemptEmail({ to: existingUser.email, name: existingUser.name })
    .catch((err) => console.error('Failed to send registration-attempt email:', err));
}
```

Note the suppression decision must not change the response or its timing (see CR-01/WR-01).

### WR-07: `renderHtml` interpolates `ctaUrl` into an `href` attribute with no escaping

**File:** `backend/src/services/mailer.js:41` (and `:43` for the text-node copy)

**Issue:** `escapeHtml`'s own docstring (`escapeHtml.js:1-5`) states it is for
"an HTML text node (never an attribute like href)". `renderHtml` has exactly one attribute
sink, and it is the only interpolation in the whole template that is *not* escaped:

```js
<a href="${ctaUrl}" style="…">${ctaLabel}</a>
```

Every current caller passes a server-derived URL (`env.clientUrl` + a fixed path, or a path
plus a hex token), so this is latent rather than live. But the template is the shared entry
point for all seven mail types, and the next caller that threads a caller-influenced URL
through it gets attribute-breakout for free — with no test to catch it.

**Fix:** escape the attribute at the sink and validate the scheme, so the contract is enforced
by the template rather than by every caller remembering:

```js
function safeUrl(value) {
  const url = String(value ?? '');
  if (!/^https?:\/\//i.test(url)) return env.clientUrl;   // reject javascript:, data:, …
  return url;
}
// …
<a href="${escapeHtml(safeUrl(ctaUrl))}" …>${ctaLabel}</a>
```

Add an `escapeHtml.test.js` case documenting attribute-context suitability, and a
`mailer.test.js` case asserting a hostile `url` cannot break out of the `href`.

### WR-08: The 500-char cap counts UTF-16 code units, not the characters `VARCHAR(500)` stores

**File:** `backend/src/utils/relationshipNotePolicy.js:7`

**Issue:** `note.length > 500` counts UTF-16 code units while the column counts characters.
The mismatch is *safe in the overflow direction* — for any string, character count ≤
`.length`, so a note that passes the check can never exceed 500 DB characters. I verified
both directions:

- 400 astral characters (`'😀'.repeat(400)`, `.length === 800`) → rejected, even though the
  column would comfortably hold them.
- 250 astral characters (`.length === 500`) → accepted, stored as 250 DB characters.

So the effective limit is 250 characters for astral input and 500 for BMP input. Ge'ez
(U+1200–U+137F) is BMP and unaffected, but the cap is not the "500 characters matching the
column" the comment claims, and users pasting emoji hit an unexplained wall at half the
advertised length.

**Fix:** count grapheme-ish code points so the check means what it says, and keep the error
message accurate:

```js
export function assertRelationshipNoteLength(note) {
  if (note && [...String(note)].length > 500) {
    throw new Error('Relationship note must be 500 characters or fewer.');
  }
}
```

### WR-09: Enumeration-silence test asserts only the message, not the absence of side effects

**File:** `backend/src/resolvers/register.test.js:179-199`

**Issue:** The test that guards SEC-01 checks three things: the message matches, the user
count is 1, and `sendRegistrationAttemptEmail` was called. It does **not** assert that the
free-path side effects are absent on the taken path, so any regression that reopens the
channel through a *different* signal stays green. Specifically missing:

- `expect(sendVerificationEmail).not.toHaveBeenCalled()` — today the taken path must not send
  one, and nothing pins that.
- no `user.self_registered` audit row is written.
- the existing user's row is unmodified (`passwordHash`, `status`, `emailVerified`,
  `relationshipNote` all unchanged) — the current `count === 1` assertion would still pass if
  the resolver overwrote the existing account in place.
- the response object is byte-identical to the free-email response (not merely
  `message ===`) — this is what would have caught CR-01.

**Fix:**

```js
const free  = await graphql(REGISTER_MUTATION, { name: 'X', email: 'free@example.com',  password: 'Password123!' });
const taken = await graphql(REGISTER_MUTATION, { name: 'X', email: 'taken@example.com', password: 'Password123!' });
expect(taken).toEqual(free);

// and, for the hostile-input variant that reproduces CR-01:
const longName = 'A'.repeat(300);
expect(await graphql(REGISTER_MUTATION, { name: longName, email: 'taken2@example.com', password: 'Password123!' }))
  .toEqual(await graphql(REGISTER_MUTATION, { name: longName, email: 'free2@example.com', password: 'Password123!' }));

expect(sendVerificationEmail).not.toHaveBeenCalled();
expect(await models.AuditLog.count({ where: { action: 'user.self_registered' } })).toBe(0);
await existing.reload();
expect(existing.passwordHash).toBe(originalHash);
expect(existing.status).toBe('Active');
```

### WR-10: `relationshipNotePolicy.js` ships with no unit test

**File:** `backend/src/utils/relationshipNotePolicy.js` (no sibling `.test.js`)

**Issue:** Its stated model, `passwordPolicy.js`, has `passwordPolicy.test.js`; so do
`escapeHtml.js`, `auth.js`, and `rateLimitStore.js`. This new policy module's only coverage
is one integration case at 501 characters (`register.test.js:247-259`). Untested and
therefore unpinned:

- the boundary — exactly 500 must be accepted, 501 rejected (only the 501 side exists);
- `null` / `undefined` / `''` short-circuit through the `note &&` guard (the comment at
  lines 3-5 calls this guard load-bearing, but nothing asserts it);
- non-string input — `assertRelationshipNoteLength(12345)` throws
  `TypeError: note.length is undefined`-style behaviour rather than the intended message
  (compare `escapeHtml`, which explicitly coerces and has a test for it).

**Fix:** add `backend/src/utils/relationshipNotePolicy.test.js` covering 499/500/501, `null`,
`undefined`, `''`, an astral string (see WR-08), and a non-string.

### WR-11: Migration 020 is not idempotent, has no down-path, and nothing fails fast if it was skipped

**File:** `backend/migrations/manual/020-add-users-relationship-note.sql:26-27`

**Issue:** `ALTER TABLE users ADD COLUMN relationshipNote VARCHAR(500) NULL DEFAULT NULL;`
with no `IF NOT EXISTS`, no rollback statement, and no application-level guard. Re-running it
errors (`Duplicate column name`), which is survivable, but the skipped case is not: on any
database where it has not been applied, `sequelize.sync()` will not add the column, the app
boots normally, and **only the free-email tokenless registration** fails —
`Unknown column 'relationshipNote' in 'field list'` — while taken emails still return the
success message. That is CR-01's oracle, fully open, on a fresh production deploy.

The file documents the manual step well (better than most), but documentation is not a guard,
and the failure mode is silent-until-exploited rather than boot-time-loud.

**Fix:** make the DDL re-runnable and add a startup assertion so a missed migration is a boot
failure rather than a security regression:

```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS relationshipNote VARCHAR(500) NULL DEFAULT NULL;
```

```js
// backend/src/models/index.js, in initializeDatabase()
const [cols] = await sequelize.query("SHOW COLUMNS FROM users LIKE 'relationshipNote'");
if (cols.length === 0) {
  throw new Error('Migration 020 has not been applied: users.relationshipNote is missing.');
}
```

(`ADD COLUMN IF NOT EXISTS` is MariaDB/MySQL-8.4-portable, consistent with 018's stated
portability standard.)

### WR-12: Partial mailer mocks leave most of the module undefined in two suites

**File:** `backend/src/resolvers/verifyEmail.test.js:9-11`, `backend/src/resolvers/register.test.js:6-11`

**Issue:** `mailer.js` exports eight functions. `verifyEmail.test.js` mocks exactly one
(`sendPendingRegistrationEmail`); `register.test.js` mocks four. Because
`test/helpers.js:4` builds the full schema from `serverConfig.js`, both suites load
`approval.resolver.js` and `invitation.resolver.js`, which statically import
`sendAccountApprovedEmail`, `sendAccountRejectedEmail`, and `sendInvitationEmail` — none of
which exist on either mock. Nothing fails today because no test reaches those resolvers, but
the failure mode when one eventually does is a Vitest mock-shape error rather than a
meaningful assertion failure, and the two suites disagree about which subset to stub.

**Fix:** use `importActual` spread so the mock is total and only the intercepted functions
differ:

```js
vi.mock('../services/mailer.js', async (importActual) => ({
  ...(await importActual()),
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendPendingRegistrationEmail: vi.fn().mockResolvedValue(undefined),
  sendRegistrationAttemptEmail: vi.fn().mockResolvedValue(undefined)
}));
```

(Safe here: `buildTransportOptions` already forces `jsonTransport` when `nodeEnv === 'test'`,
so unmocked senders open no socket.)

## Info

### IN-01: Redundant `String()` around an already-coercing escape, on a server-controlled integer

**File:** `backend/src/services/mailer.js:76`

**Issue:** `escapeHtml(String(env.resetTokenExpiresMinutes))` — `escapeHtml` already does
`String(value ?? '')` (`escapeHtml.js:7`), and the value is an env-derived number that can
never contain markup. Escaping it is harmless but signals that the D-07 sweep was applied by
pattern-match rather than by tracing taint, which makes it harder to tell at a glance which
interpolations are actually attacker-reachable.

**Fix:** drop the escape (and the `String`) here, or add a one-line comment stating it is
deliberate uniformity rather than a real taint sink.

### IN-02: Redundant empty-collection guard

**File:** `backend/src/resolvers/user.resolver.js:46`

**Issue:** `if (admins.length === 0) return;` — the following `Promise.all(admins.map(...))`
already resolves immediately on an empty array.

**Fix:** remove, or keep with a comment explaining it is an intentional readability guard.

### IN-03: `inviterName` / `relationship` parameters of `notifyAdminsOfPendingRegistration` are dead this phase

**File:** `backend/src/resolvers/user.resolver.js:38-59`

**Issue:** The docstring itself concedes that "Only the self-registrant caller … actually
calls this function this phase", so the `inviterName` and `relationship` parameters (and the
`inviterName` branch in `sendPendingRegistrationEmail`, `mailer.js:119-126`) have exactly one
exercising path — `mailer.test.js:115-130`, a direct unit call, never through a resolver.
Speculative generality that is covered only by the test written for it.

**Fix:** acceptable as documented forward-compatibility. If it is still unused at the end of
the milestone, delete the parameters and the branch.

### IN-04: `verifyEmail` mints a signed JWT for a still-Pending self-registrant

**File:** `backend/src/resolvers/user.resolver.js:455`

**Issue:** `return { token: signToken(user), user };` runs unconditionally, so an unapproved
stranger who verifies their email receives a validly signed token. It is inert today —
`getUserFromRequest` (`utils/auth.js:33`) rejects any non-Active user — so this is not an
authorization gap, and the behaviour predates Phase 32. But Phase 32 substantially increases
the population that holds one (previously only invited registrants, now any anonymous
self-registrant), which raises the blast radius if a future consumer ever trusts a signature
without re-reading `status`.

**Fix:** consider returning `token: null` when `user.status !== 'Active'` (requires making
`AuthPayload.token` nullable), or add a comment at the return site recording that
`getUserFromRequest` is the single enforcement point for this invariant.

---

_Reviewed: 2026-08-30T19:35:35Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
