---
phase: 33-public-signup-form-approval-queue
reviewed: 2026-09-07T12:52:32Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - frontend/src/pages/Register.validation.js
  - frontend/src/pages/Register.validation.test.js
  - frontend/src/pages/Register.jsx
  - frontend/src/pages/Register.test.jsx
  - frontend/src/pages/ApprovalsPage.jsx
  - frontend/src/pages/ApprovalsPage.test.jsx
  - frontend/src/pages/InvitationsPage.test.jsx
  - frontend/src/pages/Pending.test.jsx
  - frontend/src/context/AuthContext.jsx
  - frontend/src/context/AuthContext.test.jsx
  - backend/src/resolvers/invitation.resolver.js
  - backend/src/schemas/invitation.schema.js
  - backend/src/resolvers/approveReject.test.js
  - backend/src/resolvers/pendingApprovals.test.js
  - backend/src/resolvers/user.resolver.js
findings:
  critical: 2
  warning: 1
  info: 0
  total: 3
status: issues_found
---

# Phase 33: Code Review Report

**Reviewed:** 2026-09-07T12:52:32Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Phase 33's designated keystone mitigation — `Register.validation.js` + its D-04 agreement test against the real backend policy modules — was attacked directly, as instructed, by running the client validator and the imported server `assert*` functions side by side against a broad set of realistic inputs (not just the fixture table the test file itself asserts against). Two independent, empirically-confirmed divergences were found where the client accepts an input the server rejects — the exact CR-01 bug class from 32-REVIEW.md that this file's own header comment names as the thing it must not repeat. Both are reachable end-to-end: `Register.jsx` sends the raw (untrimmed, unnormalized) form values straight to `register()`, and `graphqlClient.js` does no further normalization before the wire. `npx vitest run` on the three signup-related suites passes 35/35 green — the divergence is real but currently invisible to the suite, precisely because the agreement test's fixture table only covers the four length boundaries plus one "not-an-email" string, not the format edge cases the surrounding comments explicitly discuss.

A third issue was found in `ApprovalsPage.jsx`'s state handling: the same `error` state is shared between the initial `pendingApprovals` load and the per-row `approveUser`/`rejectUser` mutations, and the render ternary checks `error` before `rows`. A failed approve/reject action (e.g. the exact "two admins working the same queue" race the backend's own `approveReject.test.js` suite explicitly hardens against and documents) makes the entire populated card list — including every other, unrelated still-pending row — disappear behind the error `Alert`, with no retry affordance short of a full page reload. This was reproduced empirically with a temporary test (not committed).

The backend deletion (D-10, `pendingRegistrations`) is clean: no orphaned references anywhere in the tree, schema and resolver both fully removed, `ApprovalsPage`'s dead `orphaned`/`Tooltip` branch is gone. `AuthContext.jsx`'s `register()` widening is correctly consumed at both of its two call sites. SEC-03 (note rendered as literal text, no `dangerouslySetInnerHTML`) and D-06/SEC-01 (success copy never reads `result.message`, never branches on server response) both hold up under direct inspection and are covered by tests that assert the negative case.

## Critical Issues

### CR-01: Client email-format regex is measurably more permissive than the server's `validator.isEmail` — the exact CR-01 bug class this file exists to prevent

**File:** `frontend/src/pages/Register.validation.js:31,42-52`
**Issue:** `EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/` is a hand-rolled regex, not the `validator` package's `isEmail` that `backend/src/utils/emailPolicy.js:1,54` actually uses. The file's own header comment states the design invariant this must satisfy ("validation here must never be more permissive than the real backend policy modules it mirrors") and separately admits the shortcut ("Does not need to be byte-identical to ... validator.isEmail -- only needs to agree with it on the fixture values Register.validation.test.js asserts against"). That fixture table (`Register.validation.test.js:82-89`) only checks `'ada@example.com'`, `'not-an-email'`, and one over-length case — it never exercises the format classes `emailPolicy.js`'s own comment (`emailPolicy.js:20-27`) names as the exact 8 realistic classes that broke CR-01 in Phase 32.

Empirically confirmed (`isEmail` from `validator/lib/isEmail.js` vs. `EMAIL_FORMAT.test`) that the client accepts and the server rejects all of the following realistic inputs:
- `a..b@example.com` (adjacent dots in local part)
- `.ada@example.com` (leading dot in local part)
- `ada.@example.com` (trailing dot in local part)
- `ada@example.com.` (trailing dot after TLD)
- `ada@example..com` (consecutive dots in domain)
- `ada@ex_ample.com` (underscore in domain)
- `ada@-example.com` (leading hyphen in a domain label)
- `ada@example.c` (1-character TLD)
- `ada@[127.0.0.1]` (IP-literal domain)
- a 65-character local part + `@example.com` (RFC 5321's 64-char local-part limit)

**Failure scenario:** A registrant pastes or autocorrects an email into one of the above shapes (a trailing dot from a mobile-keyboard autocomplete, a doubled dot from a fat-fingered paste, a `.name.` style local part). `validateEmail()` reports `valid: true`, no inline field error is shown, and the form allows submit. The backend's `assertRegistrationEmail` (called outside the guarded try/catch at `user.resolver.js:263`, so it is not swallowed into the uniform tokenless-success message) throws `'Enter a valid email address.'`, which surfaces as an unexpected top-of-form server `Alert` on a field the client just told the user was fine — directly violating D-04's "client-side first, server as backstop" contract and the UI-SPEC's explicit rule that the top `Alert` is reserved for "anything the client-side checks didn't catch," not for a format class the client is supposed to catch.

**Fix:** Import the same zero-dependency `isEmail` validator client-side (the package is dependency-free and already a direct dependency in `backend/package.json`; add it to `frontend/package.json` too) so agreement is guaranteed by construction, exactly as `emailPolicy.js`'s own comment recommends and exactly as Phase 32 did to close the original CR-01:
```js
// Register.validation.js
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
```
Also broaden `Register.validation.test.js`'s agreement table to include the 9 classes above (they are already named in `emailPolicy.js`'s comment, so this is copy-paste, not new research) — the current table's narrowness is what let this regress unnoticed.

### CR-02: Relationship-note length check validates the trimmed value but submits the raw one; the server checks the raw value with no trim at all

**File:** `frontend/src/pages/Register.validation.js:68-75`, `frontend/src/pages/Register.jsx:79`, `backend/src/utils/relationshipNotePolicy.js:6-8`
**Issue:** `validateRelationshipNote()` trims before both the empty-check and the 500-char cap check. `handlePublicSubmit` (`Register.jsx:75-80`) then sends the raw, untrimmed `form.relationshipNote` to `register()`, which passes it unmodified through `AuthContext.jsx`'s `register()` wrapper and `graphqlClient.js`'s `axios.post` (confirmed: no trimming anywhere in that path). The server's `assertRelationshipNoteLength` (`relationshipNotePolicy.js:6-8`) does `note.length > 500` on the raw value — no trim, unlike `namePolicy.js`/`emailPolicy.js`, which both trim before their length checks (and whose backend-side trimming is exactly why the *name* field has no equivalent divergence — the two sides happen to agree there).

Empirically confirmed:
```
note = 'a'.repeat(500) + ' '   // 500 meaningful chars + 1 trailing space
client validateRelationshipNote(note).valid  -> true   (trimmed length = 500)
server assertRelationshipNoteLength(note)    -> throws "Relationship note must be 500 characters or fewer."
```
**Failure scenario:** A registrant fills the multiline note field to (or near) the 500-char limit and the input ends with any trailing whitespace (a stray space, a trailing newline from a mobile keyboard or a pasted paragraph) — an entirely ordinary way to finish typing a long text field. The inline helper text shows no error and the field's live character counter (`Register.jsx:172-174`, which uses the *raw* `form.relationshipNote.length`) may even flip to red past 500 while `noteCheck.valid` is still `true` because it's evaluated on the trimmed string — a directly self-contradictory UI signal. The form is submittable; the server rejects it with a message the user has no way to explain, since nothing in the UI indicated a problem.

**Fix:** Make the length check operate on the same (raw) value that actually gets submitted, matching the server exactly; only use the trimmed value for the emptiness check:
```js
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

## Warnings

### WR-01: `ApprovalsPage`'s shared `error` state hides the entire populated queue — including unrelated rows — after any single row-action failure, with no retry path

**File:** `frontend/src/pages/ApprovalsPage.jsx:44-47,61-72,74-88,99-101`
**Issue:** `error` is a single piece of state set by three different call sites: the initial `load()` (line 54), `handleApprove` (line 68), and `submitReject` (line 84). The render ternary at line 99 checks `error` before `rows`:
```js
{error ? (
  <Alert severity="error">{error}</Alert>
) : rows === null ? (
  <CircularProgress />
) : rows.length === 0 ? (
  /* empty state */
) : (
  /* the card Stack */
)}
```
This correctly resolves the documented "spinner + error render simultaneously forever" bug for the *initial load* case (33-UI-SPEC.md's States table), but the same `error` flag is also written by per-row action failures, and once set it unconditionally replaces the entire populated `Stack` — not just the row whose action failed. `rows` itself is never cleared on an action failure, so the data is still in memory; it is simply no longer reachable from the render tree, and there is no button anywhere in the error-only view that leads back to it (a fresh `load()` only fires from `useEffect` on mount, i.e. on remount/navigation).

I reproduced this empirically with a temporary test (not committed): seed one pending row, click Approve, mock the mutation to reject with `'This account is not awaiting a decision.'` (the literal message `approveReject.test.js:267` documents two admins racing the same queue produces) — after the rejection, `screen.queryByText('Joseph Q')` and the Approve button are both gone, replaced by only the error `Alert`. No existing test in `ApprovalsPage.test.jsx` exercises a failed `handleApprove`/`submitReject` call; only the failed *initial load* path is covered (`ApprovalsPage.test.jsx:138-146`).

**Failure scenario:** Two admins have the queue open; one approves a row the other has just rejected (or is mid-reject-dialog on). The losing admin's action fails with a real, expected backend error (`approveReject.test.js:247-252` documents this is not hypothetical — "two admins working the same queue, or one admin with the page open in two tabs, is enough"). That admin's entire queue view — every other still-pending applicant, not just the one they clicked — vanishes behind a single error line, and the only way back is a full page reload.
**Fix:** Give load-failure and action-failure their own state, and never let an action failure hide rows that are already known-good in memory:
```js
const [loadError, setLoadError] = useState('');
const [actionError, setActionError] = useState('');
// ...
{loadError ? (
  <Alert severity="error">{loadError}</Alert>
) : rows === null ? (
  <CircularProgress />
) : (
  <>
    {actionError && <Alert severity="error" sx={{ mb: 2 }}>{actionError}</Alert>}
    {rows.length === 0 ? emptyState : cardStack}
  </>
)}
```
`handleApprove`/`submitReject` should `setActionError(...)` (and re-run `load()` on failure too, so a stale-status row like the losing racer's gets refreshed away rather than left clickable) instead of reusing the load-path's error state.

---

_Reviewed: 2026-09-07T12:52:32Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
