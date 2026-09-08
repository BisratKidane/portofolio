---
phase: quick
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/package.json
  - package-lock.json
  - frontend/src/pages/Register.validation.js
  - frontend/src/pages/Register.validation.test.js
  - frontend/src/pages/ApprovalsPage.jsx
  - frontend/src/pages/ApprovalsPage.test.jsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "Register.validation.js's validateEmail can never accept an email format backend/src/utils/emailPolicy.js's assertRegistrationEmail rejects, because both call the identical validator.isEmail function -- agreement is guaranteed by construction, not by fixture-value approximation (closes CR-01, 33-REVIEW.md)"
    - "All 9 empirically-confirmed CR-01 divergent inputs (ada@gmail..com, ada..lovelace@gmail.com, .ada@gmail.com, ada@gmail.com., ada@exam_ple.com, ada@-example.com, a@b.c, ada@[127.0.0.1], a 65-char local part) are present in Register.validation.test.js's client/server agreement table and assert rejection on both the client validator and the real backend assertRegistrationEmail"
    - "validateRelationshipNote's 500-char cap check runs on the raw (untrimmed) value -- the same value Register.jsx actually submits and relationshipNotePolicy.js actually checks -- so a 500-char note plus trailing whitespace is now rejected client-side instead of silently passing and failing server-side (closes CR-02, 33-REVIEW.md)"
    - "validateFullName and validateEmail were checked for the same raw/trimmed mismatch class as CR-02 and found NOT to have it, because both namePolicy.js and emailPolicy.js trim before their own length checks and before storing the value -- this finding is recorded in-code so a future reader does not re-litigate it"
    - "A failed approve/reject action in ApprovalsPage no longer hides the populated queue -- other pending rows stay visible and the failure surfaces in a banner distinct from a true initial-load failure (closes WR-01, 33-REVIEW.md)"
    - "The existing SC-5 initial-load-failure behavior is unchanged: a failed initial load still shows only the error Alert, with no spinner, no empty panel, no card list underneath"
    - "No backend file is modified by this plan -- server-side validation (emailPolicy.js, relationshipNotePolicy.js, namePolicy.js, models/User.js) stays exactly as-is"
  artifacts:
    - path: "frontend/package.json"
      provides: "validator declared as a direct dependency, pinned ^13.15.35 (matching backend/package.json's exact caret range), promoting an already-installed, already-audited transitive package to a declared frontend dependency"
    - path: "frontend/src/pages/Register.validation.js"
      provides: "validateEmail imports and calls validator/lib/isEmail.js instead of a hand-rolled regex; validateRelationshipNote's cap check operates on the raw (untrimmed) value; header comment updated to reflect the file is no longer zero-dependency and to state the backend/ import boundary still holds"
    - path: "frontend/src/pages/Register.validation.test.js"
      provides: "client/server agreement table (D-04) broadened with all 9 CR-01 divergent inputs plus a CR-02 raw-vs-trimmed relationship-note regression case, all table-driven against the real backend assert* functions"
    - path: "frontend/src/pages/ApprovalsPage.jsx"
      provides: "loadError and actionError as separate state, render logic that only blanks the queue on a true load failure, and a recovery load() re-run inside handleApprove/submitReject's catch blocks so a stale racer-lost row is refreshed away rather than left clickable"
    - path: "frontend/src/pages/ApprovalsPage.test.jsx"
      provides: "regression test proving a failed row action leaves other pending rows visible and surfaces a distinct actionError banner (WR-01)"
  key_links:
    - from: "frontend/src/pages/Register.validation.js"
      to: "validator/lib/isEmail.js"
      via: "direct production import, same function backend/src/utils/emailPolicy.js imports"
      pattern: "from 'validator/lib/isEmail\\.js'"
    - from: "frontend/src/pages/Register.validation.js validateRelationshipNote"
      to: "the raw, untrimmed note value"
      via: "cap check against raw.length, not trimmed.length"
      pattern: "raw\\.length > MAX_RELATIONSHIP_NOTE_LENGTH"
    - from: "frontend/src/pages/ApprovalsPage.jsx handleApprove/submitReject catch blocks"
      to: "load()"
      via: "recovery re-fetch on action failure, so a stale row is refreshed away instead of left clickable behind an error"
      pattern: "setActionError\\(err\\.message\\);\\s*\\n\\s*await load\\(\\);"
---

<objective>
Close three findings from `.planning/phases/33-public-signup-form-approval-queue/33-REVIEW.md`:
CR-01 (client email-format regex more permissive than the server's `validator.isEmail`),
CR-02 (relationship-note length check validates the trimmed value but the raw value is what
gets submitted and what the server checks), and WR-01 (`ApprovalsPage`'s shared `error` state
hides the entire populated queue after any single row-action failure).

Purpose: CR-01 and CR-02 are both instances of the exact bug class Phase 33's own D-04 exists
to prevent (32-REVIEW.md CR-01, recurring): a client-side guard that is measurably more
permissive than its backend counterpart, so a registrant who clears client validation is
rejected by the server with no warning, or -- worse, per 32-REVIEW.md -- silently swallowed
into a uniform success message on a different code path. WR-01 is a distinct UX regression
where the app blanks a working admin's data on a transient, already-expected concurrency error
(the exact "two admins working the same queue" race `approveReject.test.js` documents), with no
recovery short of a full reload.

Output: `Register.validation.js`'s email and relationship-note checks agree with the backend by
construction and by an expanded, table-driven regression test; `ApprovalsPage.jsx` separates
load-level and action-level failure so a failed action never hides unrelated, still-good rows.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/phases/33-public-signup-form-approval-queue/33-REVIEW.md
@.planning/phases/33-public-signup-form-approval-queue/33-CONTEXT.md

<user_decision_note>
33-RESEARCH.md (written before this review) recommended test-time-only cross-workspace imports
and explicitly advised against declaring `validator` in `frontend/package.json` ("would ship the
validator package to the browser for no reason"). The user has since reviewed CR-01's actual
empirical impact (9 confirmed divergent inputs, all silently accepted client-side) and the
measured bundle cost (7 modules, ~15KB unminified pre-gzip) and made a new, locked decision that
supersedes that research recommendation: declare `validator` as a real frontend production
dependency and import `validator/lib/isEmail.js` directly in `Register.validation.js`, exactly
mirroring what `backend/src/utils/emailPolicy.js` already does. Implement this decision as given
-- do not re-open the test-only-import alternative.
</user_decision_note>

<interfaces>
<!-- backend/src/utils/emailPolicy.js -- FULL FILE, the pattern to mirror client-side. The
import line and the isEmail(normalized) call are what Register.validation.js's validateEmail
must now match. -->

```js
import isEmail from 'validator/lib/isEmail.js';

export const MAX_EMAIL_LENGTH = 254;

export function assertRegistrationEmail(email) {
  const normalized = String(email ?? '').toLowerCase().trim();
  if (!normalized) throw new Error('Email is required.');
  if (normalized.length > MAX_EMAIL_LENGTH) throw new Error('Email must be 254 characters or fewer.');
  if (!isEmail(normalized)) throw new Error('Enter a valid email address.');
  return normalized;
}
```

<!-- backend/src/utils/relationshipNotePolicy.js -- FULL FILE. Note: `note.length` is the RAW
value, no trim. This is what validateRelationshipNote's cap check must match. -->

```js
export function assertRelationshipNoteLength(note) {
  if (note && note.length > 500) throw new Error('Relationship note must be 500 characters or fewer.');
}
```

<!-- backend/src/utils/namePolicy.js -- FULL FILE. Confirms name has NO CR-02-class bug: the
server trims before both its length check AND before returning the value used for storage, and
the client's validateFullName already trims before its own length check the same way. Cited as
evidence for the "checked, no change needed" truth above -- do not modify this file. -->

```js
export const MAX_NAME_LENGTH = 255;

export function assertRegistrationName(name) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) throw new Error('Name is required.');
  if (trimmed.length > MAX_NAME_LENGTH) throw new Error('Name must be 255 characters or fewer.');
  return trimmed;
}
```

<!-- backend/src/resolvers/user.resolver.js (relevant excerpt, ~line 261-304): confirms
cleanName/normalizedEmail (the TRIMMED return values of assertRegistrationName /
assertRegistrationEmail) are what actually gets written to models.User.create -- not the raw
form values. This is why name/email have no CR-02-class divergence: both sides trim before
checking AND before storing. relationshipNote, by contrast, is stored as
`relationshipNote: relationshipNote || null` -- the RAW value, matching assertRelationshipNoteLength's
own no-trim check, and matching Register.jsx's already-raw submission (see below). -->

```js
const startedAt = Date.now();
assertRelationshipNoteLength(relationshipNote);
const cleanName = assertRegistrationName(name);
const normalizedEmail = assertRegistrationEmail(email);
// ...
const createdUser = await models.User.create(
  {
    name: cleanName,
    email: normalizedEmail,
    passwordHash,
    status: 'Pending',
    emailVerificationToken: hashVerificationToken(verificationToken),
    emailVerificationExpiresAt: verificationTokenExpiry(),
    relationshipNote: relationshipNote || null
    // ...
  }
);
```

<!-- frontend/src/pages/Register.validation.js -- CURRENT FULL FILE (76 lines). Task 1 rewrites
the header comment (lines 1-13, specifically the "Pure, dependency-free" framing and the "must
stay a pure module with zero dependencies" claim -- both become false once `validator` is
imported), deletes the EMAIL_FORMAT regex and its stale "only needs to agree... on the fixture
values" comment (lines 27-31, this is the exact reasoning 33-REVIEW.md CR-01 names as the bug),
rewrites validateEmail's format check, and rewrites validateRelationshipNote's cap check. -->

```js
// Pure, dependency-free client-side validators for the signup form (REG-01).
//
// D-04 (33-CONTEXT.md): validation here must never be more permissive than
// the real backend policy modules it mirrors. A human-maintained comment
// alone is NOT sufficient proof of agreement -- Phase 32's CR-01 shipped
// exactly that failure mode (a client-side guard more permissive than the
// server, surviving TDD + mutation testing because every test checked the
// guard against itself). The actual gate is Register.validation.test.js,
// which imports the real backend/src/utils/{emailPolicy,namePolicy,
// relationshipNotePolicy,passwordPolicy}.js functions and asserts
// client-accepts => server-accepts over a fixture table. This file itself
// must stay a pure module with zero dependencies -- safe for the production
// bundle, and never imports anything from backend/.

export const MAX_NAME_LENGTH = 255;
export const MAX_EMAIL_LENGTH = 254;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_RELATIONSHIP_NOTE_LENGTH = 500;

// Practical email-shape check. Does not need to be byte-identical to
// backend/src/utils/emailPolicy.js's validator.isEmail -- only needs to
// agree with it on the fixture values Register.validation.test.js asserts
// against (33-01-PLAN.md Task 1 behavior spec).
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email) {
  const trimmed = String(email ?? '').trim();
  if (!trimmed) return { valid: false, message: 'Enter your email address.' };
  if (trimmed.length > MAX_EMAIL_LENGTH) {
    return { valid: false, message: 'Email must be 254 characters or fewer.' };
  }
  if (!EMAIL_FORMAT.test(trimmed)) {
    return { valid: false, message: 'Enter a valid email address.' };
  }
  return { valid: true, message: null };
}

// (validateFullName, validatePassword unchanged -- not shown, no bug found)

export function validateRelationshipNote(note) {
  const trimmed = String(note ?? '').trim();
  if (!trimmed) return { valid: false, message: "Tell us how you're related to the family." };
  if (trimmed.length > MAX_RELATIONSHIP_NOTE_LENGTH) {
    return { valid: false, message: 'Relationship note must be 500 characters or fewer.' };
  }
  return { valid: true, message: null };
}
```

<!-- TARGET shape for validateEmail and validateRelationshipNote after the fix. Copy names/
signatures/return shapes exactly; only the internals named below change. -->

```js
import isEmail from 'validator/lib/isEmail.js';

export function validateEmail(email) {
  const trimmed = String(email ?? '').trim();
  if (!trimmed) return { valid: false, message: 'Enter your email address.' };
  if (trimmed.length > MAX_EMAIL_LENGTH) {
    return { valid: false, message: 'Email must be 254 characters or fewer.' };
  }
  if (!isEmail(trimmed)) {
    return { valid: false, message: 'Enter a valid email address.' };
  }
  return { valid: true, message: null };
}

export function validateRelationshipNote(note) {
  const raw = String(note ?? '');
  const trimmed = raw.trim();
  if (!trimmed) return { valid: false, message: "Tell us how you're related to the family." };
  if (raw.length > MAX_RELATIONSHIP_NOTE_LENGTH) {
    return { valid: false, message: 'Relationship note must be 500 characters or fewer.' };
  }
  return { valid: true, message: null };
}
```

<!-- frontend/src/pages/Register.validation.test.js -- relevant CURRENT excerpts. Task 1 adds
rows to the existing it.each tables; it does not restructure the file. -->

```js
import { assertRegistrationEmail } from '../../../backend/src/utils/emailPolicy.js';
import { assertRelationshipNoteLength } from '../../../backend/src/utils/relationshipNotePolicy.js';

function backendAccepts(fn, value) {
  try { fn(value); return true; } catch { return false; }
}

describe('client/server validation agreement (D-04)', () => {
  it.each([
    ['ada@example.com', true],
    ['not-an-email', false],
    [`${'a'.repeat(243)}@example.com`, false]
  ])('email %# agrees with emailPolicy.js', (value, expected) => {
    expect(validateEmail(value).valid).toBe(expected);
    expect(backendAccepts(assertRegistrationEmail, value)).toBe(expected);
  });

  it.each([
    ['a'.repeat(500), true],
    ['a'.repeat(501), false]
  ])('relationship note length %# agrees with relationshipNotePolicy.js', (value, expected) => {
    expect(validateRelationshipNote(value).valid).toBe(expected);
    expect(backendAccepts(assertRelationshipNoteLength, value)).toBe(expected);
  });
});
```

<!-- Empirically verified in this planning session (Node, installed validator@13.15.35, both via
raw isEmail() and via the OLD EMAIL_FORMAT regex) -- every one of these 9 is accepted by today's
regex and rejected by validator.isEmail, confirming the review's claim exactly: -->

```
ada@gmail..com
ada..lovelace@gmail.com
.ada@gmail.com
ada@gmail.com.
ada@exam_ple.com
ada@-example.com
a@b.c
ada@[127.0.0.1]
'a'.repeat(65) + '@gmail.com'
```

<!-- frontend/src/pages/ApprovalsPage.jsx -- CURRENT relevant excerpt (state + handlers +
render ternary; the card/dialog JSX below the ternary is unchanged and not reproduced here). -->

```js
const [rows, setRows] = useState(null);
const [error, setError] = useState('');
const [busyId, setBusyId] = useState(null);
const [rejectTarget, setRejectTarget] = useState(null);
const [rejectReason, setRejectReason] = useState('');

const load = useCallback(() => {
  return graphqlRequest(PENDING_APPROVALS_QUERY)
    .then((data) => setRows(data.pendingApprovals))
    .catch((err) => setError(err.message));
}, []);

useEffect(() => { load(); }, [load]);

const handleApprove = async (row) => {
  setError('');
  setBusyId(row.id);
  try {
    await graphqlRequest(APPROVE, { id: row.id });
    await load();
  } catch (err) {
    setError(err.message);
  } finally {
    setBusyId(null);
  }
};

const submitReject = async () => {
  const row = rejectTarget;
  setError('');
  setBusyId(row.id);
  setRejectTarget(null);
  try {
    await graphqlRequest(REJECT, { id: row.id, reason: rejectReason || null });
    setRejectReason('');
    await load();
  } catch (err) {
    setError(err.message);
  } finally {
    setBusyId(null);
  }
};

// render:
{error ? (
  <Alert severity="error">{error}</Alert>
) : rows === null ? (
  <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
) : rows.length === 0 ? (
  <Paper /* empty state, unchanged */ >...</Paper>
) : (
  <Stack spacing={3}>{rows.map((row) => ( /* card, unchanged */ ))}</Stack>
)}
```

<!-- TARGET shape after the fix. Card-rendering JSX inside the populated branch is UNCHANGED --
only the state declarations, load/handleApprove/submitReject bodies, and the top-level render
ternary change. -->

```js
const [rows, setRows] = useState(null);
const [loadError, setLoadError] = useState('');
const [actionError, setActionError] = useState('');
// busyId/rejectTarget/rejectReason unchanged

const load = useCallback(() => {
  return graphqlRequest(PENDING_APPROVALS_QUERY)
    .then((data) => setRows(data.pendingApprovals))
    .catch((err) => setLoadError(err.message));
}, []);

const handleApprove = async (row) => {
  setActionError('');
  setBusyId(row.id);
  try {
    await graphqlRequest(APPROVE, { id: row.id });
    await load();
  } catch (err) {
    setActionError(err.message);
    await load();
  } finally {
    setBusyId(null);
  }
};
// submitReject mirrors the same setActionError + await load() catch shape

// render:
{loadError ? (
  <Alert severity="error">{loadError}</Alert>
) : rows === null ? (
  <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
) : (
  <>
    {actionError && <Alert severity="error" sx={{ mb: 2 }}>{actionError}</Alert>}
    {rows.length === 0 ? (
      <Paper /* empty state, unchanged */ >...</Paper>
    ) : (
      <Stack spacing={3}>{rows.map((row) => ( /* card, unchanged */ ))}</Stack>
    )}
  </>
)}
```

<!-- frontend/src/pages/ApprovalsPage.test.jsx -- relevant CURRENT excerpt: the mock setup and
fixture shape, and the last test (initial-load-failure, which must stay green byte-for-byte in
behavior even though it now reads `loadError` internally). -->

```js
vi.mock('../api/graphqlClient.js', () => ({ graphqlRequest: vi.fn() }));
import { graphqlRequest } from '../api/graphqlClient.js';

const ROW = {
  id: '9',
  name: 'Joseph Q',
  email: 'joe@example.com',
  relationshipNote: 'Met at the reunion',
  createdAt: '1700000000000'
};

it('shows only the error Alert on a failed initial load -- no spinner, no empty panel, no card list (SC-5)', async () => {
  graphqlRequest.mockRejectedValueOnce(new Error('Network error'));
  render(<ApprovalsPage />);
  expect(await screen.findByText('Network error')).toBeInTheDocument();
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  expect(screen.queryByText('Nothing to review')).not.toBeInTheDocument();
  expect(screen.queryByText('Joseph Q')).not.toBeInTheDocument();
});
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Close CR-01 (email format parity) and CR-02 (relationship-note trim/raw parity) in Register.validation.js</name>
  <files>
    frontend/package.json
    package-lock.json
    frontend/src/pages/Register.validation.js
    frontend/src/pages/Register.validation.test.js
  </files>
  <behavior>
    RED first (these fail against today's code, proving both gaps are real):
    - `validateEmail(x).valid` is currently `true` for each of the 9 inputs listed in
      `<interfaces>`'s empirically-verified block (`ada@gmail..com`, `ada..lovelace@gmail.com`,
      `.ada@gmail.com`, `ada@gmail.com.`, `ada@exam_ple.com`, `ada@-example.com`, `a@b.c`,
      `ada@[127.0.0.1]`, `` `${'a'.repeat(65)}@gmail.com` ``) -- it must become `false` for all 9.
    - `backendAccepts(assertRegistrationEmail, x)` is `false` for all 9 already (the server side
      of the agreement is already correct; only the client side needs to change).
    - `validateRelationshipNote('a'.repeat(500) + ' ').valid` is currently `true` (the existing
      code trims before checking the cap, so a raw 501-char note passes) -- it must become
      `false`, matching `backendAccepts(assertRelationshipNoteLength, 'a'.repeat(500) + ' ')`,
      which is already `false` (the server checks the raw, untrimmed value).
    GREEN (after the fix): all of the above become `false`/`false` pairs; every currently-passing
    case in Register.validation.test.js's two `describe` blocks stays green, specifically:
    `validateEmail('ada@example.com')` stays valid `true`; the existing 254-char-boundary email
    case (`` `${'a'.repeat(243)}@example.com`, false `` ) is unaffected since it fails on the
    length check before the format check ever runs; `validateRelationshipNote('a'.repeat(500))`
    (no trailing space, raw length exactly 500) stays valid `true`;
    `validateRelationshipNote('a'.repeat(501))` (already over cap with no trim needed) stays
    invalid `false`.
  </behavior>
  <action>
    Step 1 -- declare the dependency: from the repo root, run `npm install validator@13.15.35
    --workspace frontend`. This adds `"validator": "^13.15.35"` to `frontend/package.json`'s
    `dependencies` (matching `backend/package.json`'s exact caret range) and updates
    `package-lock.json`'s dependency graph. `validator` is already present in the workspace tree
    (hoisted to the root `node_modules` via `backend`'s existing dependency on it), so this adds
    no new package content, only the declaration. Do not hand-edit `package-lock.json`.

    Step 2 -- rewrite `frontend/src/pages/Register.validation.js`. Add
    `import isEmail from 'validator/lib/isEmail.js';` as the first line of the file (matching
    `backend/src/utils/emailPolicy.js`'s own import). Rewrite the header comment block (currently
    lines 1-13): the opening "Pure, dependency-free client-side validators" framing and the
    closing "This file itself must stay a pure module with zero dependencies... and never imports
    anything from backend/" sentence are both now inaccurate for the "zero dependencies" half --
    replace with text that states this file has exactly one intentional production dependency,
    `validator` (specifically `validator/lib/isEmail.js`), imported so `validateEmail` agrees with
    `backend/src/utils/emailPolicy.js`'s `assertRegistrationEmail` by construction rather than by
    a hand-maintained approximation (name CR-01, 33-REVIEW.md, explicitly) -- and that the
    "never imports anything from backend/" boundary is unchanged and still holds (only
    Register.validation.test.js crosses that boundary, and only at test time). Delete the
    `const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;` line and its preceding comment
    ("Practical email-shape check... only needs to agree with it on the fixture values
    Register.validation.test.js asserts against") entirely -- this exact reasoning is the bug
    33-REVIEW.md's CR-01 names, do not preserve any trace of it. In `validateEmail`, replace
    `if (!EMAIL_FORMAT.test(trimmed))` with `if (!isEmail(trimmed))`; every other line of the
    function (trim, empty check, length check, return shape, messages) stays byte-identical --
    this is a targeted swap of the format-check implementation only. In
    `validateRelationshipNote`, add a `const raw = String(note ?? '');` line before the existing
    `const trimmed = raw.trim();` (the current code computes `trimmed` from `note` directly --
    change its input to `raw` instead so both are derived from the same coercion), keep the
    emptiness check (`if (!trimmed) return ...`) exactly as-is, and change the cap check from
    `if (trimmed.length > MAX_RELATIONSHIP_NOTE_LENGTH)` to
    `if (raw.length > MAX_RELATIONSHIP_NOTE_LENGTH)` -- this is the exact CR-02 fix, matching
    `relationshipNotePolicy.js`'s own un-trimmed check and matching `Register.jsx`'s existing raw
    submission (`Register.jsx` already sends `form.relationshipNote` unmodified and its live
    character counter already reads the raw length -- neither needs to change). Add a one-line
    comment above the cap check explaining why `raw`, not `trimmed`, is used here (cite CR-02).
    Leave `validateFullName` and `validatePassword` completely untouched -- confirmed during
    planning that both `namePolicy.js` and `emailPolicy.js` trim before their own length checks
    AND before returning the value actually used for storage (`user.resolver.js`'s `cleanName`/
    `normalizedEmail`), so there is no raw/trimmed divergence to fix on those two fields. Add a
    short comment above `validateFullName` noting this was checked and found not to apply, citing
    CR-02's "check the same class of mismatch" instruction, so a future reader does not re-open it.

    Step 3 -- broaden `frontend/src/pages/Register.validation.test.js`'s
    `'client/server validation agreement (D-04)'` describe block. In the `'email %# agrees with
    emailPolicy.js'` `it.each` table, add all 9 divergent inputs from `<interfaces>`'s verified
    block, each as `[input, false]` (both sides now reject). In the
    `'relationship note length %# agrees with relationshipNotePolicy.js'` `it.each` table, add
    `` [`${'a'.repeat(500)} `, false] `` (500 meaningful characters plus one trailing space, raw
    length 501) -- this is the exact CR-02 fixture that diverges under today's code and must be
    proven closed by the same table-driven mechanism the CR-01 fix relies on, not a standalone
    one-off assertion.
  </action>
  <verify>
    <automated>npm test --workspace frontend -- src/pages/Register.validation.test.js</automated>
  </verify>
  <done>frontend/package.json declares validator ^13.15.35 as a direct dependency; validateEmail imports and calls validator/lib/isEmail.js with no hand-rolled regex remaining anywhere in the file; validateRelationshipNote's cap check runs on the raw value; the agreement table in Register.validation.test.js includes all 9 CR-01 divergent inputs plus the CR-02 raw-note regression case, all passing against the real backend assert* functions; all 35 previously-passing tests in the file stay green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Close WR-01 -- separate ApprovalsPage's load-failure state from its action-failure state</name>
  <files>
    frontend/src/pages/ApprovalsPage.jsx
    frontend/src/pages/ApprovalsPage.test.jsx
  </files>
  <behavior>
    RED first: a new test seeds two pending rows (`ROW` "Joseph Q" and a second row "Ada L"),
    clicks Approve on the first, and mocks the mutation to reject with the literal race message
    `approveReject.test.js` documents ("This account is not awaiting a decision."). Against
    today's code, this fails because the single `error` state hides the entire `Stack` --
    `screen.queryByText('Ada L')` returns `null` even though that row's data was never touched.
    GREEN after the fix: the actionError Alert shows the rejection message, "Joseph Q" is
    refreshed away by the recovery `load()` call (simulating the row having already been resolved
    by the winning admin), and "Ada L" remains visible throughout -- proving both the
    state-separation fix and the recovery-reload addition. The existing
    `'shows only the error Alert on a failed initial load...(SC-5)'` test must keep passing
    unchanged in its assertions (it now exercises `loadError` internally, but its observable
    behavior -- error-only render, no spinner/empty/list -- does not change).
  </behavior>
  <action>
    In `frontend/src/pages/ApprovalsPage.jsx`: rename the single `const [error, setError] =
    useState('');` into two states, `const [loadError, setLoadError] = useState('');` and
    `const [actionError, setActionError] = useState('');`. In `load()`'s `.catch`, change
    `setError(err.message)` to `setLoadError(err.message)`. In `handleApprove`, change the
    leading `setError('')` to `setActionError('')`, and in its `catch (err)` block change
    `setError(err.message)` to `setActionError(err.message)` followed immediately by
    `await load();` on the next line -- the recovery re-fetch WR-01's review calls for, so a row
    left stale by a lost concurrent-admin race (`approveReject.test.js` documents this exact
    scenario) is refreshed away rather than left clickable behind a banner. Apply the identical
    change to `submitReject`'s leading `setError('')` -> `setActionError('')` and its `catch (err)`
    block -> `setActionError(err.message); await load();`. Do not otherwise change
    `handleApprove`/`submitReject`'s control flow (the existing `await load()` on the success path,
    and the `finally { setBusyId(null); }`, stay exactly as they are). In the render ternary,
    change the outer condition from `error ?` to `loadError ?`, keep the `rows === null ?` spinner
    branch unchanged, and replace the final `else` branch: instead of directly rendering the
    `rows.length === 0 ? emptyPaper : cardStack` ternary, wrap it in a fragment that first renders
    `{actionError && <Alert severity="error" sx={{ mb: 2 }}>{actionError}</Alert>}` above it. The
    empty-state `Paper` JSX and the populated `Stack`/card-map JSX are otherwise byte-identical --
    do not modify their internals.

    In `frontend/src/pages/ApprovalsPage.test.jsx`: add a new `ROW2` fixture (e.g. `id: '20'`,
    `name: 'Ada L'`, a distinct email, a short `relationshipNote`, a distinct `createdAt`) near
    the existing `ROW`/`ROW_NO_NOTE`/`ROW_HTML_NOTE` fixtures. Add a new `it` inside the
    `describe('ApprovalsPage', ...)` block: mock `graphqlRequest` to resolve
    `{ pendingApprovals: [ROW, ROW2] }` on the initial load, reject with
    `new Error('This account is not awaiting a decision.')` on the `approveUser` call, and resolve
    `{ pendingApprovals: [ROW2] }` on the recovery reload the fixed `handleApprove` now triggers.
    Render, wait for both "Joseph Q" and "Ada L" to appear, click the first row's Approve button
    (`screen.getAllByRole('button', { name: /approve/i })[0]`), then assert (via `waitFor`) that
    the rejection message text is visible, that "Joseph Q" is no longer in the document (refreshed
    away by the recovery load), and that "Ada L" is still in the document throughout -- proving a
    failed action never blanks the rest of the queue.
  </action>
  <verify>
    <automated>npm test --workspace frontend -- src/pages/ApprovalsPage.test.jsx</automated>
  </verify>
  <done>ApprovalsPage.jsx has separate loadError/actionError state; a failed row action shows a distinct error banner without hiding other populated rows; handleApprove/submitReject re-run load() on failure to refresh stale rows; the existing initial-load-failure test and all other ApprovalsPage.test.jsx tests stay green; the new action-failure regression test passes.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Anonymous registrant -> `Register.jsx` form -> `register` mutation | Client-side validation (this plan's Task 1) is a UX convenience layer only; `backend/src/utils/emailPolicy.js` and `relationshipNotePolicy.js` remain the sole authoritative backstop, unchanged by this plan (D-04). |
| `frontend/package.json` dependency graph -> `npm install` -> browser bundle | Unlike the precedent backend-only `validator` declaration (260903-f0m), this plan intentionally ships `validator` into the client-side production bundle for the first time (~15KB unminified pre-gzip, per user's explicit measured-cost decision). |
| Admin browser -> `ApprovalsPage.jsx` -> `approveUser`/`rejectUser` mutations | Authenticated admin-only surface; this plan changes only client-side error-state routing, not authorization or the mutations themselves. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-01 | Tampering | `Register.validation.js` client checks | accept | Purely a UX layer; `emailPolicy.js`/`relationshipNotePolicy.js`/`namePolicy.js` remain the authoritative server-side gate, unchanged by this plan (D-04 preserved). |
| T-quick-02 | Information Disclosure | CR-01: client accepts an email format the server rejects | mitigate | Closed by importing the identical `validator.isEmail` function client- and server-side; agreement proven by a table-driven test covering all 9 empirically-confirmed divergent inputs against the real `assertRegistrationEmail`. |
| T-quick-03 | Tampering | CR-02: relationship-note cap bypassable via trailing whitespace | mitigate | `validateRelationshipNote`'s cap now checks the raw value `Register.jsx` actually submits and `relationshipNotePolicy.js` actually checks -- no trim-induced gap remains. |
| T-quick-04 | Denial of Service (self-inflicted, admin-facing) | WR-01: `ApprovalsPage`'s shared error state blanks the populated queue on any row-action failure | mitigate | `loadError`/`actionError` split ensures a failed approve/reject never hides unrelated rows; a recovery `load()` re-run refreshes a row left stale by a lost concurrent-admin race instead of leaving it clickable. |
| T-quick-SC | Tampering (supply chain) | `validator` newly declared in `frontend/package.json`, now bundled into the browser | accept | `validator@13.15.35` is not new to this monorepo's dependency tree -- it is the identical, already-audited version declared in `backend/package.json` since Phase 32's gap-closure (quick-task `260903-f0m`, which verified it directly). `isEmail` is a pure string-format check with no known catastrophic-backtracking/ReDoS characteristics, already exercised server-side under adversarial input. This plan promotes an already-vetted package to a second, already-user-approved consumer -- no new registry lookup or legitimacy checkpoint required. |
</threat_model>

<verification>
Run the full frontend suite: `npm test --workspace frontend`. All previously-passing tests stay
green (baseline: 43 files / 471 tests) plus the new CR-01/CR-02 fixture rows and the new WR-01
regression test. Confirm the fix empirically:
`node -e "import('validator/lib/isEmail.js').then(({default:isEmail}) => console.log(isEmail('ada@gmail..com'), isEmail('ada@example.com')))"`
from `frontend/` must print `false true`, matching what the broadened agreement table now
asserts. Confirm backend is untouched: `git diff --stat -- backend` must produce no output.
</verification>

<success_criteria>
- `frontend/package.json` declares `validator` (^13.15.35) as a direct dependency; `package-lock.json` reflects it.
- `Register.validation.js`'s `validateEmail` calls `validator`'s `isEmail` directly -- no hand-rolled regex remains anywhere in the file.
- All 9 CR-01-confirmed divergent inputs are rejected by `validateEmail`, proven by a table-driven test against the real `assertRegistrationEmail`.
- `validateRelationshipNote`'s 500-char cap check operates on the raw value, matching `relationshipNotePolicy.js` and `Register.jsx`'s actual submission; proven by a table-driven test against the real `assertRelationshipNoteLength`.
- `validateFullName`/`validateEmail` confirmed (in-code comment + no behavior change) to have no raw/trimmed divergence.
- `ApprovalsPage.jsx` has separate `loadError`/`actionError` state; a failed row action no longer hides the populated queue; a recovery reload refreshes stale rows on action failure.
- The existing SC-5 initial-load-failure behavior is unchanged.
- `npm test --workspace frontend` passes in full (baseline 471 tests plus new coverage, all green).
- `git diff --stat -- backend` is empty -- no backend file touched.
- 33-UI-SPEC.md's locked copy strings and 33-CONTEXT.md's D-04/D-06/D-08 are unaffected -- no message text, success-copy branching, or note-truncation behavior changed.
</success_criteria>

<output>
Create `.planning/quick/260908-geq-p33-validator-parity/260908-geq-SUMMARY.md` when done
</output>
