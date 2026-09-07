# Phase 33: Public Signup Form & Approval Queue - Research

**Researched:** 2026-09-07
**Domain:** React/MUI form + list UI wiring to an already-shipped GraphQL contract (no new backend capability except one deletion)
**Confidence:** HIGH

## Summary

This phase is almost entirely a UI-wiring exercise against a backend contract that Phase 32 already built, tested, and shipped: `register(token: String, name: String!, email: String, password: String!, relationshipNote: String)` and `pendingApprovals: [User!]!` both exist and pass 556/3 backend tests today (verified by a fresh full-suite run during this research session). The frontend baseline is also green: 42 files / 441 tests. There are exactly four code-level risk areas, and this research resolved all four concretely rather than leaving them as open questions for the planner.

**First**, the `REGISTER_MUTATION` widening in `AuthContext.jsx` is low-risk, not high-risk, once you know one fact: Vitest's `toHaveBeenCalledWith` (like Jest's) treats `{a:1, b:undefined}` as equal to `{a:1}`. This was verified empirically in this session. That means the wrapper can unconditionally send `{ token, name, email, password, relationshipNote }` — with `email`/`relationshipNote` as `undefined` on the invited path — and `Register.test.jsx`'s existing exact-match assertion on the invited path's mutation variables keeps passing without any conditional key-omission logic. The real risk isn't the mutation shape; it's four *other* things: (a) `Register.test.jsx`'s first test asserts the OLD "invitation only" dead-end and must be rewritten, not preserved, since replacing it is the point of REG-01; (b) `AuthContext.test.jsx`'s `register` test never asserts call arguments at all, so it provides zero protection against an args-order mistake — recommend switching the wrapper to a named-object parameter to remove the footgun structurally; (c) `InvitePage.test.jsx` — named in the phase brief as a test to check — turns out to have **no relationship to `register`/`REGISTER_MUTATION` at all** (it only exercises `createInvitation`); this is a correction to the phase brief, not a finding to act on; (d) `InvitationsPage.test.jsx` mocks `graphqlRequest` by matching on the query string `'pendingRegistrations'` and **will silently break** once `ApprovalsPage` swaps to `pendingApprovals`, because its mock falls through to `Promise.resolve({})`, leaving `rows` as `undefined` rather than `null`/an array, which crashes the render (`rows.length` on `undefined`).

**Second**, the client/server validation-agreement problem (D-04, the phase's designated trap) has one clean, empirically-verified answer: **do not import backend policy modules into the shipped frontend bundle** (fragile, couples deploy targets, and would ship the `validator` package to the browser for no reason), but **do import the real backend functions directly, at test time only, in a colocated agreement test.** This was proven to work in this session — a Vitest test file in `frontend/src/` was able to `import` `backend/src/utils/emailPolicy.js`, `namePolicy.js`, `relationshipNotePolicy.js`, and `passwordPolicy.js` and execute them successfully, including `emailPolicy.js`'s transitive `validator` dependency (which is not declared in `frontend/package.json` but resolves anyway because npm workspaces hoist it to the root `node_modules`). Recommendation: frontend declares its own validation constants (255/254/8/500) with inline comments citing the exact backend file, and a colocated Vitest test imports the real backend `assert*` functions and behaviorally asserts agreement (pass/fail, not just number equality) across a fixture table — mirroring the exact pattern Phase 32's own CR-01 gap-closure test already established for the backend-internal guard-vs-model-validator case.

**Third**, testing idiom is fully established and needs no invention: `vi.mock('../api/graphqlClient.js', () => ({ graphqlRequest: vi.fn() }))`, RTL + `userEvent`, wrap in `MemoryRouter`/`AuthProvider` only where the component under test needs them (`Register.test.jsx` wraps both; `ApprovalsPage.test.jsx` wraps neither, rendering the page bare since it needs no router/auth context).

**Fourth**, the `ApprovalsPage.jsx` loading/error bug is confirmed exactly as described: `load()`'s `.catch` sets `error` but never touches `rows`, and the render tree checks `rows === null` for the loading spinner *unconditionally alongside* `{error && <Alert>}` above it — so a failed fetch renders spinner-forever plus an error banner, simultaneously, permanently. The fix is a one-line reorder of the ternary to check `error` first, exactly matching `33-UI-SPEC.md`'s state truth table (Failed = `error` truthy regardless of `rows`). No new mechanism is needed; the spec already fully resolves this.

**Primary recommendation:** Widen `AuthContext.jsx`'s `register` to a named-object parameter (`register({ token, name, email, password, relationshipNote })`) rather than growing positional arguments; add a `Register.validation.js` + colocated `Register.validation.test.js` pair that imports the real backend policy functions for behavioral agreement testing; reorder `ApprovalsPage.jsx`'s render conditional to check `error` before `rows === null`; and update `InvitationsPage.test.jsx`'s mock alongside the `pendingApprovals` swap so it doesn't silently start failing.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Public signup form rendering + client-side validation | Browser/Client | API/Backend (validation backstop, already shipped) | New React form state/UI; the server-side policy modules it must agree with already exist and are unchanged by this phase |
| `REGISTER_MUTATION` widening (token optional + email/relationshipNote) | Browser/Client | API/Backend (schema/resolver already accept these args, shipped Phase 32) | Only the frontend's query string and wrapper function change; the backend contract is already correct and untouched |
| Approval queue listing (`pendingApprovals` → cards) | Browser/Client | API/Backend (query already shipped, Phase 32 D-11) | Pure rendering/restructuring of an existing data source into a new visual composition |
| Approve/reject actions | Browser/Client | API/Backend (`approveUser`/`rejectUser` already shipped, Phase 30) | UI wiring only; the mutations, transactions, and audit logging are unchanged |
| `pendingRegistrations` deletion | API/Backend | — | Schema field + resolver + its test `describe` block are removed outright; no tier shares this responsibility |
| Client/server validation agreement enforcement | Browser/Client (test-time only) | API/Backend (source of truth) | The agreement test lives in the frontend workspace but asserts against the backend's real functions; this is a testing-tooling capability that spans both tiers by design, not a runtime one |
| Loading/empty/failed state machine (SC-5) | Browser/Client | — | Pure client-side render-state logic; no backend involvement |

## Project Constraints (from CLAUDE.md)

CLAUDE.md's "Project" section frames the milestone as "adds an automated testing foundation" — that framing is from the v1.0 milestone (shipped 2026-07-12) and predates v4.1's feature work; treat the milestone narrative as historical, not binding for this phase. The concrete technical/convention constraints remain fully actionable and apply here:

- **Tech stack**: JavaScript ES Modules (`"type": "module"`), npm workspaces (`backend`, `frontend`) — confirmed current; root `package.json` now pins `"engines": { "node": "24.x" }` (not the `18.x` CLAUDE.md text states — CLAUDE.md is stale on this specific point; `package.json` is authoritative).
- **Test tooling**: Vitest is the runner across both workspaces (confirmed: `backend/package.json`/`frontend/package.json` both declare `"test": "vitest run"`, version `^4.1.10`); React Testing Library (`@testing-library/react ^16.3.2`) + jsdom (`^26.0.0`) for frontend; no GraphQL client library — plain `axios` via `graphqlClient.js`, matching CLAUDE.md's explicit prohibition.
- **No path aliases, no TypeScript, no ESLint/Prettier config** — confirmed still true; all imports remain explicit relative paths with extensions.
- **Naming conventions**: PascalCase `.jsx` for pages/components, camelCase for non-component modules, SCREAMING_SNAKE_CASE `_QUERY`/`_MUTATION` suffix for GraphQL string constants (`AuthContext.jsx`) — all still in effect and must be followed for any new file this phase adds.
- **"Non-destructive... must not change application runtime behavior — it only adds tests, tooling, and CI config"** — this specific constraint is scoped to the *original* v1.0 testing-foundation milestone described in CLAUDE.md and does not apply to v4.1 feature phases (v4.1 explicitly changes runtime behavior: REG-01/REG-04/APPR-02/APPR-06 are all new user-facing behavior). Flagged so the planner does not misapply it.
- **GSD Workflow Enforcement**: file edits must happen through a GSD command (`/gsd-execute-phase` etc.) — a process constraint on execution, not a technical constraint on the plan's content.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REG-01 | `/register` with no token renders a real signup form (name, email, password, required relationship note) instead of the invitation-only dead end | `33-UI-SPEC.md`'s full form contract (fields, copy, validation) is approved and ready to implement directly; this research adds the `REGISTER_MUTATION`/wrapper widening plan and the validation-agreement test pattern that D-04 requires alongside it |
| REG-04 | After submitting, the person is told plainly what happens next (verify email, then admin review) | `33-UI-SPEC.md`'s success-panel copy (D-05/D-06) is approved verbatim; this research confirms `Register.jsx`'s existing `result`-state swap pattern is reusable unchanged and traces exactly which invited-path test assertions must keep passing while the `!token` branch is replaced |
| APPR-02 | Admin queue lists every waiting account with name, email, relationship note, registration time; approve/reject work from there | `33-UI-SPEC.md`'s full card composition (D-07/D-08) is approved; this research traces the `pendingApprovals` query shape (already shipped, flat `User` rows), confirms the dead `orphaned`/`Tooltip` code path to remove, and confirms the `ApprovalsPage.test.jsx` mock rewrites needed |
| APPR-06 | An approved, unlinked self-registrant lands on `/pending` | Confirmed via direct read of `Pending.jsx` and `Pending.test.jsx`: the page already redirects on `familyMemberId`/`role` alone, with no distinction between invited and self-registered accounts — the existing "unlinked, non-admin user" test case already functionally covers this; no code change needed, only confirmed compatible |
</phase_requirements>

## Standard Stack

### Core (already installed, verified via `package.json` — no new packages this phase)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | ^18.3.1 | UI library | [VERIFIED: frontend/package.json] |
| MUI (`@mui/material`, `@mui/icons-material`) | ^6.3.1 | Component library — `TextField`, `Alert`, `Paper`, `Dialog`, `Stack`, `CircularProgress` | [VERIFIED: frontend/package.json]; UI-SPEC's entire contract is expressed in these primitives |
| React Router | ^6.28.2 | `/register` route, `useSearchParams` for `?token=` | [VERIFIED: frontend/package.json] |
| axios | ^1.7.9 | GraphQL transport via `graphqlClient.js` | [VERIFIED: frontend/package.json] |
| Vitest | ^4.1.10 (both workspaces) | Test runner | [VERIFIED: ran `npm test --workspace frontend` and `npm test --workspace backend` directly this session] |
| @testing-library/react + @testing-library/user-event | ^16.3.2 / ^14.6.1 | Component tests | [VERIFIED: frontend/package.json] |
| `validator` (backend dep, `^13.15.35`) | — | `emailPolicy.js`'s `isEmail` check | [VERIFIED: backend/package.json; confirmed hoisted to root `node_modules` by `ls node_modules/validator`, and confirmed resolvable from a frontend-workspace Vitest test in this session] |

**No installation step required.** This phase adds zero new runtime dependencies to either workspace. The one thing that looks like a new dependency — frontend code depending on backend validation logic — is resolved as a **test-time-only cross-workspace import**, never a production bundle dependency (see Architecture Patterns below).

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Test-time cross-workspace import of real backend policy functions | Duplicate the four numeric constants in frontend with a comment, no automated agreement check | Rejected — this is exactly the CR-01 bug class (32-REVIEW.md): a human-maintained comment is not "a test that fails loudly on drift," which D-04 explicitly requires |
| Test-time cross-workspace import | Promote `emailPolicy.js`/`namePolicy.js`/`relationshipNotePolicy.js`/`passwordPolicy.js` into a new shared npm workspace package (e.g. `packages/shared-validation`) | Rejected for this phase — CONTEXT.md is explicit that "no new backend capability is in scope" and a workspace restructure is a materially larger change than a frontend phase should carry; worth revisiting if a *third* consumer of these policies ever appears |
| Named-object parameter for the widened `register()` wrapper | Keep positional args, append `email`/`relationshipNote` at the end | Rejected — `AuthContext.test.jsx`'s existing `register` test does not assert call arguments at all, so a positional-arg-order mistake would ship silently; an object parameter makes every call site self-documenting and removes the footgun by construction |

## Package Legitimacy Audit

**Not applicable — this phase installs no new packages in either workspace.** No `slopcheck`/registry verification gate applies. The `validator` package already declared in `backend/package.json` (`^13.15.35`) is pre-existing (added in Phase 32, already audited then) and is reused read-only, at test time, by a new frontend test file — it is never added to `frontend/package.json`.

## Architecture Patterns

### System Architecture Diagram

```
Anonymous visitor                      Admin (authenticated)
       |                                       |
       v                                       v
GET /register (no token)             GET /invitations (admin section)
       |                                       |
       v                                       v
Register.jsx: !token branch          InvitationsPage.jsx
  (NEW: public signup form,             renders <ApprovalsPage/>
  D-02/D-03/D-04 fields)                       |
       |                                       v
  [client-side validation:            ApprovalsPage.jsx: load()
   blur-then-live, D-04]                       |
       |                                       v
       v                              pendingApprovals query
  onSubmit -> register({              (Phase 32, unchanged)
    token: undefined,                          |
    name, email, password,                     v
    relationshipNote                  Apollo resolver: pendingApprovals
  })                                  requireAdmin -> User.findAll(
       |                                {status:'Pending', emailVerified:true})
       v                                       |
  AuthContext.jsx                              v
  REGISTER_MUTATION (WIDENED)         flat User[] rows: {id name email
  { token?, name!, email?,             relationshipNote createdAt}
    password!, relationshipNote? }             |
       |                                       v
       v                              Card list render (D-07/D-08):
  graphqlRequest() -> axios POST        header (name/email) ->
  /graphql                              note panel (always full,
       |                                never truncated) -> footer
       v                                (registered-when + Approve/Reject)
  Apollo `register` resolver                   |
  (Phase 32, UNCHANGED)                Approve click -> approveUser(id)
   |-- token branch (invited,          Reject click -> dialog (D-09,
   |    byte-identical behavior           reason optional) -> rejectUser(id, reason)
   |    required)                               |
   `-- tokenless branch: assertRegistrationName/       v
        Email/RelationshipNoteLength/   approval.resolver.js (Phase 30,
        PasswordStrength -> User.create  unchanged): transaction, lock,
        (status: Pending, unverified)    stamp User + Invitation (if any),
       |                                 audit log, email
       v
  finishTokenlessRegistration()
  (enumeration-silent, D-05/D-06
   UI never branches on this)
       |
       v
  Register.jsx: result state swaps
  in place inside AuthShell (D-05) ->
  "Check {typed email}..." (D-06,
  never renders result.message here)
       |
       v
  [person clicks emailed verify link]
       |
       v
  verifyEmail (Phase 31/32, unchanged)
  -> Pending & emailVerified:true
  -> notifyAdminsOfPendingRegistration()
       |
       v
  [account now appears in pendingApprovals,
   loop closes back to the admin path above]
```

### Recommended Project Structure

No new directories. New files follow the existing dotted-suffix colocation convention already used elsewhere in this codebase (`familyTree.assembly.test.js`, `familyTree.layout.test.js`):

```
frontend/src/
├── context/
│   ├── AuthContext.jsx                 # MODIFIED: widen REGISTER_MUTATION + register() wrapper
│   └── AuthContext.test.jsx            # MODIFIED: add call-argument assertions (currently has none for register)
├── pages/
│   ├── Register.jsx                    # MODIFIED: replace !token dead-end with real public form
│   ├── Register.jsx (or new)           # NEW (recommended): Register.validation.js — pure validators + constants
│   ├── Register.validation.test.js     # NEW (recommended): cross-workspace agreement test
│   ├── Register.test.jsx               # MODIFIED: rewrite the "no token" test; keep invited-path tests passing
│   ├── ApprovalsPage.jsx               # MODIFIED: swap query, restructure card, fix state-machine bug
│   ├── ApprovalsPage.test.jsx          # MODIFIED: retarget mocks to pendingApprovals flat User shape
│   └── InvitationsPage.test.jsx        # MODIFIED: mock 'pendingRegistrations' -> 'pendingApprovals'
└── components/
    └── ApprovalCard.jsx                # OPTIONAL (planner's call per UI-SPEC): extract the card if ApprovalsPage.jsx grows unwieldy

backend/src/
├── schemas/invitation.schema.js        # MODIFIED: delete `pendingRegistrations: [Invitation!]!` field
├── resolvers/invitation.resolver.js    # MODIFIED: delete pendingRegistrations resolver (lines ~26-55)
└── resolvers/approveReject.test.js     # MODIFIED: delete the `describe('pendingRegistrations query', ...)` block (~lines 248-326)
```

### Pattern 1: Widened mutation with a named-object wrapper parameter

**What:** Change `register(token, name, password)` to `register({ token, name, email, password, relationshipNote })`, and always pass all five keys to `graphqlRequest`'s `variables` — `undefined` on unused keys is safe both over the wire (JSON.stringify drops them) and in tests (`toHaveBeenCalledWith` ignores them).

**When to use:** Any time a GraphQL mutation gains optional arguments and multiple call sites (invited path vs. public path) need to supply different subsets — positional args become ambiguous past 2-3 parameters.

**Example:**
```javascript
// Source: verified in this session (frontend/src/context/AuthContext.test.jsx
// currently asserts NOTHING about register's call arguments — this is a real
// gap, not a hypothetical one)
const REGISTER_MUTATION = `
  mutation Register($token: String, $name: String!, $email: String, $password: String!, $relationshipNote: String) {
    register(token: $token, name: $name, email: $email, password: $password, relationshipNote: $relationshipNote) { message }
  }
`;

// in the AuthProvider value:
register: ({ token, name, email, password, relationshipNote }) =>
  graphqlRequest(REGISTER_MUTATION, { token, name, email, password, relationshipNote }).then((data) => data.register),
```
```javascript
// Register.jsx invited-path call site (unchanged behavior, new call shape):
const data = await register({ token, name: form.name, password: form.password });
// email/relationshipNote omitted -> undefined -> dropped from the wire payload
// -> Register.test.jsx's `toHaveBeenCalledWith(query, { token, name, password })`
//    keeps passing verbatim (verified empirically this session: Vitest's
//    toHaveBeenCalledWith treats {a:1,b:undefined} as equal to {a:1}).
```

### Pattern 2: Cross-workspace, test-time-only validation agreement

**What:** A colocated frontend test file imports the *real* backend policy functions (not a duplicate reimplementation) and asserts the frontend's own validators agree with them across a fixture table of boundary values.

**When to use:** Whenever client-side validation logic must never become more permissive than server-side validation, and the two live in separate npm-workspace packages that cannot share a runtime import without bundling backend code into the client.

**Verified this session** (scratch test written, run, and deleted from `frontend/src/`):
```javascript
// This import resolves correctly under `vitest run` in the frontend
// workspace, including emailPolicy.js's transitive `validator` dependency,
// because npm workspaces hoist `validator` to the ROOT node_modules and
// Node's module resolution walks up the directory tree regardless of which
// workspace file is doing the importing. Confirmed: `ls node_modules/validator`
// at the repo root succeeds; `ls backend/node_modules/validator` and
// `ls frontend/node_modules/validator` both fail (not present locally).
import { assertRegistrationEmail, MAX_EMAIL_LENGTH } from '../../../backend/src/utils/emailPolicy.js';
import { assertRegistrationName, MAX_NAME_LENGTH } from '../../../backend/src/utils/namePolicy.js';
import { assertRelationshipNoteLength } from '../../../backend/src/utils/relationshipNotePolicy.js';
import { assertPasswordStrength } from '../../../backend/src/utils/passwordPolicy.js';
```

**Recommended test shape** (`Register.validation.test.js`), mirroring the behavioral-agreement idiom Phase 32's own CR-01 gap-closure test already established for the backend-internal case (`emailPolicy.test.js`'s docstring: "verified 0 divergences across a 132-case fuzz"):

```javascript
// Source: this session's research + the existing backend/src/utils/emailPolicy.test.js pattern
import { describe, it, expect } from 'vitest';
import { validateFullName, validateEmail, validatePassword, validateRelationshipNote } from './Register.validation.js';
import { assertRegistrationName } from '../../../backend/src/utils/namePolicy.js';
import { assertRegistrationEmail } from '../../../backend/src/utils/emailPolicy.js';
import { assertRelationshipNoteLength } from '../../../backend/src/utils/relationshipNotePolicy.js';
import { assertPasswordStrength } from '../../../backend/src/utils/passwordPolicy.js';

function backendAccepts(fn, value) {
  try { fn(value); return true; } catch { return false; }
}

describe('client/server validation agreement (D-04)', () => {
  it.each([
    ['a'.repeat(255), true], ['a'.repeat(256), false], ['', false], ['   ', false]
  ])('name %s agrees with namePolicy.js', (value, expected) => {
    expect(validateFullName(value).valid).toBe(expected);
    expect(backendAccepts(assertRegistrationName, value)).toBe(expected);
  });

  it.each([
    ['ada@example.com', true], ['not-an-email', false], [`${'a'.repeat(243)}@example.com`, false] // 255 chars, over MAX_EMAIL_LENGTH
  ])('email %s agrees with emailPolicy.js', (value, expected) => {
    expect(validateEmail(value).valid).toBe(expected);
    expect(backendAccepts(assertRegistrationEmail, value)).toBe(expected);
  });

  it.each([
    ['a'.repeat(500), true], ['a'.repeat(501), false]
  ])('relationship note length %s agrees with relationshipNotePolicy.js', (value, expected) => {
    expect(validateRelationshipNote(value).valid).toBe(expected);
    expect(backendAccepts(assertRelationshipNoteLength, value)).toBe(expected);
  });

  it.each([
    ['12345678', true], ['1234567', false]
  ])('password length %s agrees with passwordPolicy.js', (value, expected) => {
    expect(validatePassword(value).valid).toBe(expected);
    expect(backendAccepts(assertPasswordStrength, value)).toBe(expected);
  });
});
```

**Note on the relationship-note field's "required on the public path" rule:** this rule is UI-only (D-03) — `relationshipNotePolicy.js` has no requiredness check at all (Phase 32 D-06 made the note optional server-side). This is *not* a D-04 violation; D-04 forbids the client being more *permissive*, and a stricter client-only rule layered on top of a server rule that already allows empty is explicitly sanctioned by `33-UI-SPEC.md`'s own validation contract table. The agreement test above should only assert the 500-char boundary for this field, not requiredness.

### Pattern 3: Mutually exclusive render states (SC-5 bug fix)

**What:** `ApprovalsPage.jsx`'s current bug — confirmed by direct code read this session:
```javascript
// CURRENT (buggy) — backend/src/pages/ApprovalsPage.jsx:65-69, 113-122
const load = useCallback(() => {
  return graphqlRequest(PENDING_QUERY)
    .then((data) => setRows(data.pendingRegistrations))
    .catch((err) => setError(err.message));   // <- never touches rows
}, []);
// ...
{error && <Alert severity="error">{error}</Alert>}   {/* unconditional */}
{rows === null ? <CircularProgress /> : /* ... */}    {/* also unconditional on rows===null */}
```
On a failed fetch, `rows` stays `null` forever (never set), so **both** the spinner and the error banner render, simultaneously, indefinitely — confirmed exactly as the phase brief described.

**Fix (matches `33-UI-SPEC.md`'s States table exactly — no new mechanism needed):**
```javascript
{error ? (
  <Alert severity="error">{error}</Alert>
) : rows === null ? (
  <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
) : rows.length === 0 ? (
  <Paper /* empty state, per UI-SPEC copy */ />
) : (
  <Stack spacing={3}>{/* card list */}</Stack>
)}
```
Reordering the ternary so `error` is checked first is the entire fix — `33-UI-SPEC.md`'s truth table (`Loading: rows===null && !error`, `Failed: error truthy regardless of rows`) is already fully specified; this research just confirms the current code's exact defect and that the spec's fix is sufficient with no additional retry mechanism required by any locked decision.

### Anti-Patterns to Avoid

- **Importing backend policy modules into production frontend code** (e.g. `Register.jsx` directly `import`-ing `emailPolicy.js` at runtime): would bundle the `validator` package and backend-specific error strings into the client, couple the two workspaces' deploy lifecycles, and is not what the codebase's `vite.config.js` (no `resolve.alias`, no cross-workspace path setup) or `package.json` workspace declarations are built to support. Confine the cross-workspace import to test files only.
- **Growing `register()`'s positional argument list** instead of switching to a named-object parameter: `AuthContext.test.jsx`'s current `register` test asserts zero call arguments, so a positional-order mistake (e.g. swapping `email` and `relationshipNote`) would ship completely undetected.
- **Carrying forward the `orphaned`/`Tooltip`-disabled branch** in the restructured `ApprovalsPage.jsx`: `pendingApprovals` returns flat `User` rows with no nullable `registeredUser` indirection — this dead code (and its `ApprovalsPage.test.jsx` "WR-01" orphaned-row test) must be deleted, not preserved, per D-10's explicit instruction.
- **Treating `InvitePage.test.jsx` as relevant regression coverage for the `REGISTER_MUTATION` widening** (as an earlier framing of this phase suggested): confirmed by direct grep this session that `InvitePage.jsx`/`InvitePage.test.jsx` only exercise `createInvitation`/`myInvitations` — zero overlap with `register`/`REGISTER_MUTATION`. Don't spend planning time here.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Client-side email/name/password/note format validation | A second, independently-maintained regex/length-check implementation in the frontend | The real backend `assert*` functions, imported at test time for agreement checking; frontend keeps only its own thin wrapper for UI timing (blur-then-live) and copy | This is the exact CR-01 bug class (32-REVIEW.md) — a hand-rolled client approximation silently diverging from the server validator is what cost Phase 32 an entire extra review round |
| Loading/empty/failed state coordination | A custom state machine library or a `useReducer` with a dozen action types | Two `useState` calls (`rows`, `error`) with the render-order fix in Pattern 3 above | The existing two-state shape is already sufficient once the render conditional is ordered correctly; no additional state or library is needed |
| Approval queue card composition | A new generic "Card" abstraction shared across the app | Inline `Paper`/`Stack`/`Divider`/`Typography` per `33-UI-SPEC.md`'s exact composition | The spec is fully pinned to specific MUI primitives and spacing values already reused from sibling pages; introducing an abstraction now would be premature generalization for a single call site |

**Key insight:** every "don't hand-roll" risk in this phase is really the same risk restated three ways — this phase's actual danger is *reimplementing something that already exists* (server validation logic, or the UI-SPEC's already-fully-specified composition/state-machine), not missing a library.

## Common Pitfalls

### Pitfall 1: Register.test.jsx's first test must be rewritten, not preserved
**What goes wrong:** A planner or executor treats "don't break existing tests" as "don't change this test," and either skips REG-01 or contorts the new form to somehow satisfy the old assertion.
**Why it happens:** The existing test (`'shows an "invitation required" notice and no form when there is no token'`) asserts exactly the behavior REG-01 requires *removing*.
**How to avoid:** Explicitly rewrite this test to assert the new public form renders (fields present, no "invitation only" text) when `token` is `null`. The other two tests in the same file (invited-path success, invited-path error) are the actual regression baseline and must keep passing with no changes to their assertions.
**Warning signs:** A plan task that says "update Register.test.jsx" without specifying which of its three `it()` blocks changes and which don't.

### Pitfall 2: InvitationsPage.test.jsx's mock silently breaks on the query swap
**What goes wrong:** `ApprovalsPage.jsx`'s query changes from `pendingRegistrations` to `pendingApprovals`, but `InvitationsPage.test.jsx`'s `graphqlRequest.mockImplementation` still matches on `query.includes('pendingRegistrations')` and falls through to `Promise.resolve({})` for the new query string — `data.pendingApprovals` is `undefined`, `setRows(undefined)` leaves `rows` as `undefined` (not `null`), and the render's `rows.length === 0` check throws on `undefined.length`, crashing the whole `InvitationsPage` render (including its unconditional page-title assertion the admin test checks for).
**Why it happens:** The mock is string-matched, not schema-validated, so a rename anywhere upstream doesn't surface as a type error — only as a runtime crash inside the test.
**How to avoid:** Update `InvitationsPage.test.jsx`'s mock alongside the `ApprovalsPage.jsx` query swap, in the same task/commit.
**Warning signs:** `InvitationsPage.test.jsx`'s admin test failing with a `Cannot read properties of undefined (reading 'length')` error after an otherwise-unrelated `ApprovalsPage.jsx` change.

### Pitfall 3: assertPasswordStrength raw-throws on non-string input
**What goes wrong:** `assertPasswordStrength(password)` does `password.length < 8` with no guard — if `password` is `null`/`undefined`, this throws a raw `TypeError`, not a controlled `Error` with a friendly message.
**Why it happens:** Pre-existing backend code, unrelated to this phase, that the agreement test (Pattern 2 above) will touch by calling the real function.
**How to avoid:** The agreement-test fixture table should only pass string values (matching the frontend's local state, which is always initialized to `''`, never `undefined`) — this is a non-issue in practice, but don't write a fixture row with `null`/`undefined` for password expecting a clean `false`; it'll throw a different error type, and a naive `try {} catch { return false }` wrapper (as used in Pattern 2's `backendAccepts` helper) actually handles this fine since it catches any thrown error, not just the friendly ones — just don't assert on the *message*, only on throw/no-throw.
**Warning signs:** None expected if the `backendAccepts` helper only checks throw/no-throw, as recommended.

### Pitfall 4: the `Invitation.registeredUser` field resolver becomes fully dead but is not in D-10's explicit deletion list
**What goes wrong:** After `pendingRegistrations` is deleted, `invitation.resolver.js`'s `registeredUser` field resolver (and the `registeredUser: User` schema field) has zero remaining callers anywhere in the codebase (confirmed by grep this session — the only two things that ever selected it were `ApprovalsPage.jsx`'s old query and `approveReject.test.js`'s `PENDING` const, both being deleted). D-10 only explicitly names "the query, its resolver... and its tests" for deletion — it does not mention this now-orphaned field resolver.
**Why it happens:** D-10 was scoped narrowly and correctly to the query itself; the field resolver's obsolescence is a downstream consequence CONTEXT.md didn't need to anticipate.
**How to avoid:** This is optional cleanup, not a requirement — flag it to the planner as a discretionary "nice to have" rather than a mandatory deletion, since removing a still-schema-valid, harmless, unreferenced field carries near-zero risk either way. Leaving it is also fine.
**Warning signs:** N/A — this is informational, not a bug.

## Code Examples

### Existing test-harness idiom to follow exactly (verified via direct read this session)

```javascript
// Source: frontend/src/pages/Register.test.jsx (existing, unmodified pattern to keep using)
vi.mock('../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));
import { graphqlRequest } from '../api/graphqlClient.js';

function renderRegister(token = 'invite-token-123') {
  const path = token ? `/register?token=${token}` : '/register';
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Register />
      </MemoryRouter>
    </AuthProvider>
  );
}
```

```javascript
// Source: frontend/src/pages/ApprovalsPage.test.jsx (existing, unmodified pattern —
// note NO Router/AuthProvider wrapper needed, unlike Register.test.jsx, since
// ApprovalsPage has no routing/auth-context dependency of its own)
vi.mock('../api/graphqlClient.js', () => ({
  graphqlRequest: vi.fn()
}));
render(<ApprovalsPage />);
await screen.findByText('Joseph Q'); // findBy* for async-loaded content
```

### Recommended new pendingApprovals-shaped mock fixture for ApprovalsPage.test.jsx

```javascript
// Source: backend/src/schemas/user.schema.js's User type + pendingApprovals
// resolver (backend/src/resolvers/user.resolver.js:160-166) — the flat shape
// that replaces ROW/ORPHANED_ROW's invitation-shaped fixture
const ROW = {
  id: '9',
  name: 'Joseph Q',
  email: 'joe@example.com',
  relationshipNote: 'Met at the reunion',
  createdAt: '1700000000000'
};
const ROW_NO_NOTE = { ...ROW, id: '10', relationshipNote: null }; // D-08: "No note provided." — a normal state, not an error
```

## State of the Art

No framework/library version changes are relevant to this phase — everything is already pinned and current as of Phase 32's ship date (2026-09-03). The one genuine "state of the art" shift is internal to this codebase: this is the **first** frontend page in the project to introduce real client-side field validation logic (every prior auth page — `Login.jsx`, `ResetPassword.jsx`, `ForgotPassword.jsx`, and `Register.jsx`'s existing invited-path form — relies solely on HTML5 `required`/`type="email"` and server-error surfacing). `33-UI-SPEC.md`'s D-04 validation contract is new ground for this codebase, not a continuation of an existing pattern — flagged so the planner doesn't go looking for a prior-art pattern to reuse that doesn't exist.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The `Register.validation.js`/`Register.validation.test.js` file names and the exact `validateFullName`/`validateEmail`/`validatePassword`/`validateRelationshipNote` function names are a recommendation, not a locked decision — CONTEXT.md leaves exact file organization to the planner | Architecture Patterns, Recommended Project Structure | Low — purely cosmetic; any equivalent colocated structure satisfies D-04's actual requirement (an automated agreement test), the specific names don't matter |
| A2 | Extracting the approval queue card into its own `ApprovalCard.jsx` component is optional, per `33-UI-SPEC.md`'s own "planner's call" note in its Component Inventory table | Recommended Project Structure | Low — either inline or extracted satisfies APPR-02; this is a code-organization choice with no behavioral consequence |

**If this table were fully empty:** it isn't — both entries above are genuine `[ASSUMED]`-tagged recommendations (not verified against a locked decision), included for transparency per this agent's provenance rules, though both are low-stakes organizational choices rather than technical or security claims.

## Open Questions

1. **Should `ApprovalsPage.jsx`'s failed state gain a manual "Retry" affordance?**
   - What we know: `33-UI-SPEC.md`'s States section fully specifies the Failed render (`<Alert severity="error">{error}</Alert>` only, no spinner, no card list) but does not mention a retry button; ROADMAP SC-5 only requires the three states to "render through the app's existing components — never a broken or empty panel," which the reorder fix alone satisfies.
   - What's unclear: Whether "never broken" implies a way to recover from a failed load without a full page reload.
   - Recommendation: Treat as out of scope unless the planner or a future discuss-phase round explicitly adds it — no locked decision calls for it, and adding it would be scope growth beyond what CONTEXT.md/UI-SPEC specify.

2. **Does the widened `register()` wrapper's rename from positional to named-object args count as "refactoring the invited branch" under CONTEXT.md's discretion note?**
   - What we know: CONTEXT.md's Claude's Discretion section says "Whether `/register`'s invited branch is refactored alongside the public branch or left untouched — as long as invited behaviour does not change" is discretionary.
   - What's unclear: The wrapper lives in `AuthContext.jsx`, not `Register.jsx` — it's shared infrastructure, not strictly "the invited branch." The discretion note is most naturally read as being about `Register.jsx`'s JSX/rendering, not the underlying mutation-calling wrapper.
   - Recommendation: The named-object signature change is safe under either reading — invited-path *behavior* (the GraphQL variables sent, the response handling) is unchanged; only the JS call-site syntax changes, and `Register.jsx`'s invited branch is a one-line edit (`register(token, form.name, form.password)` → `register({ token, name: form.name, password: form.password })`) either way.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (both workspaces) [VERIFIED: ran directly this session] |
| Config file | `frontend/vitest.config.js` (`environment: 'jsdom'`, `setupFiles: ['./test/setup.js']`); backend has an equivalent `vitest.config.js` (not read this session, unaffected by this phase's scope) |
| Quick run command | `npx vitest run src/pages/Register.test.jsx` (frontend); `npx vitest run src/resolvers/approveReject.test.js` (backend, for the `pendingRegistrations` deletion) |
| Full suite command | `npm test --workspace frontend` / `npm test --workspace backend` / `npm test --workspaces` (root) |

**Current baseline, freshly verified this session:**
- Frontend: 42 test files, 441 tests, all passing.
- Backend: 69 test files, 556 passed + 3 skipped (559 total), all green.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REG-01 | `/register` (no token) renders the 4-field public form | component | `npx vitest run src/pages/Register.test.jsx` | ✅ exists, needs new `it()` block replacing the old "invitation required" assertion |
| REG-01 (D-04) | Client validation never accepts an input the server rejects | unit (cross-workspace agreement) | `npx vitest run src/pages/Register.validation.test.js` | ❌ Wave 0 gap — new file |
| REG-04 | Success panel names the typed email, states both remaining steps | component | `npx vitest run src/pages/Register.test.jsx` | ✅ exists, needs new `it()` block for the tokenless success path |
| APPR-02 | Queue card shows name/email/note/registered-when; approve/reject call the right mutations | component | `npx vitest run src/pages/ApprovalsPage.test.jsx` | ✅ exists, mocks/fixtures need retargeting to `pendingApprovals`'s flat `User` shape |
| APPR-02 (SC-5) | Loading/empty/failed states are mutually exclusive | component | `npx vitest run src/pages/ApprovalsPage.test.jsx` | ⚠️ needs a NEW `it()` — no existing test exercises the failure path at all |
| APPR-06 | Approved, unlinked self-registrant lands on `/pending` | component | `npx vitest run src/pages/Pending.test.jsx` | ✅ already covered by the existing "unlinked, non-admin user" test — no code path distinguishes self-registered from invited accounts, confirmed by direct read |
| (regression) invited-path register call shape unchanged | component | `npx vitest run src/pages/Register.test.jsx` | ✅ exists (2 of 3 current `it()` blocks) — must keep passing with zero assertion changes |
| (regression) `InvitationsPage.test.jsx` doesn't crash after the query swap | component | `npx vitest run src/pages/InvitationsPage.test.jsx` | ✅ exists — mock needs updating in the same task as the `ApprovalsPage.jsx` query swap |
| (backend deletion) `pendingRegistrations` fully removed | integration | `npx vitest run src/resolvers/approveReject.test.js` (backend) | ✅ exists — the `describe('pendingRegistrations query', ...)` block (and its 4 `it()`s) must be deleted, not left red |

### Sampling Rate

- **Per task commit:** the single most relevant `npx vitest run <file>` for the file(s) touched (frontend workspace for all UI work; backend workspace only for the `pendingRegistrations` deletion task).
- **Per wave merge:** full `npm test --workspace frontend` (currently 441 tests, ~8s) — cheap enough to run on every merge; run `npm test --workspace backend` (currently 556/3, ~6 minutes against real MySQL) at minimum once after the `pendingRegistrations` deletion task, since that's the only backend-touching task this phase has.
- **Phase gate:** `npm test --workspaces` green before `/gsd:verify-work`, per this project's established pattern (mirrors every prior phase in v4.1).
- **Continuous verification of the D-04 validation-agreement property specifically:** the `Register.validation.test.js` agreement test (Pattern 2) is itself the continuous-verification mechanism — it is not a one-time check run during research or planning, it is a permanent, colocated Vitest test that runs on every future `npm test --workspace frontend` invocation and fails loudly the moment the frontend's duplicated constants (255/254/8/500) drift from the backend's real `assert*` functions, for the whole remaining lifetime of the codebase, not just this phase.

### Wave 0 Gaps

- [ ] `frontend/src/pages/Register.validation.js` — new pure-validator module (constants + functions), no test framework dependency itself
- [ ] `frontend/src/pages/Register.validation.test.js` — the cross-workspace agreement test; this is the single highest-value new test file in the phase
- [ ] No new test-framework install needed — Vitest/RTL/jsdom are already fully configured in both workspaces

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Unchanged this phase — `register`'s auth-adjacent logic (password hashing, token issuance) is entirely Phase 32's shipped, unmodified code |
| V3 Session Management | No | Unaffected — this phase never establishes a session (D-01: password typed at signup is the working credential, but no session is created until the account is later Active and the person logs in separately) |
| V4 Access Control | Yes | `pendingApprovals`, `approveUser`, `rejectUser` are all still `requireAdmin`-gated (unchanged, Phase 30/32); this phase adds zero new authenticated/admin surface, it only re-renders existing admin-gated data differently |
| V5 Input Validation | Yes | The public form's 4 fields must never be *more permissive* client-side than the server (D-04) — this is the phase's core security-adjacent property, addressed by Pattern 2's agreement test above |
| V6 Cryptography | No | Unchanged — password hashing (`bcrypt.hash(password, 12)`) lives entirely in Phase 32's unmodified `register` resolver |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client-side validation drift becoming a silent-failure enumeration channel (the CR-01 bug class) | Tampering / Information Disclosure | Behavioral agreement test against the real backend functions (Pattern 2), not a duplicated implementation — this is the phase's one directly-relevant, already-identified threat pattern |
| Relationship-note field XSS via `dangerouslySetInnerHTML` or markdown rendering | Tampering | Explicitly forbidden by D-08/UI-SPEC — render as a plain string; React's default child-text escaping is sufficient and this research found no reason to deviate |
| CR-02 (account pre-hijacking via registering someone else's email) | Spoofing | **Explicitly accepted, not mitigated, by D-01** — this is a locked decision from CONTEXT.md's Folded Todos, not a gap this research introduces or should attempt to close; the todo file (`.planning/todos/pending/20260903-cr02-account-pre-hijacking.md`) stays open by design |

## Sources

### Primary (HIGH confidence — direct codebase reads and empirical verification this session)

- `frontend/src/context/AuthContext.jsx`, `AuthContext.test.jsx` — current `REGISTER_MUTATION`/wrapper shape and its actual (weak) test coverage
- `frontend/src/pages/Register.jsx`, `Register.test.jsx` — current invited-path-only implementation and its 3 existing tests
- `frontend/src/pages/ApprovalsPage.jsx`, `ApprovalsPage.test.jsx` — current invitation-shaped query, the confirmed loading/error bug, the orphaned/Tooltip dead-code path
- `frontend/src/pages/InvitationsPage.jsx`, `InvitationsPage.test.jsx` — composition of `InvitePage` + `ApprovalsPage`, and the mock that will break on the query swap
- `frontend/src/pages/InvitePage.jsx`, `InvitePage.test.jsx` — confirmed zero overlap with `register`/`REGISTER_MUTATION` (correcting the phase brief)
- `frontend/src/pages/Pending.jsx`, `Pending.test.jsx` — confirmed APPR-06 compatibility, no code change needed
- `backend/src/resolvers/user.resolver.js` — full `register` mutation (both branches) and `pendingApprovals` query, read in full
- `backend/src/resolvers/invitation.resolver.js`, `backend/src/schemas/invitation.schema.js` — `pendingRegistrations` query/resolver/schema field to be deleted, and confirmed `registeredUser` field's only other caller
- `backend/src/resolvers/approval.resolver.js` — `approveUser`/`rejectUser`, confirmed unaffected by this phase
- `backend/src/resolvers/approveReject.test.js`, `pendingApprovals.test.js` — confirmed exact test blocks to delete vs. keep
- `backend/src/utils/emailPolicy.js`, `namePolicy.js`, `relationshipNotePolicy.js`, `passwordPolicy.js`, `emailPolicy.test.js` — read in full; source of the 255/254/8/500 thresholds and the existing agreement-test idiom to mirror
- `backend/package.json`, `frontend/package.json`, root `package.json`, `frontend/vite.config.js`, `frontend/vitest.config.js` — version/tooling/workspace-boundary facts
- Empirical test run #1 (this session): a scratch Vitest test file in `frontend/src/` successfully imported and executed all four backend policy functions, including `emailPolicy.js`'s `validator` transitive dependency — proves the cross-workspace test-time import approach works, not just plausible
- Empirical test run #2 (this session): confirmed Vitest's `toHaveBeenCalledWith` treats `{a:1,b:undefined}` as equal to `{a:1}` — proves the widened wrapper's always-pass-all-keys approach won't break `Register.test.jsx`'s exact-match assertion
- Full `npm test --workspace frontend` run (this session): 42 files / 441 tests, all passing — current baseline
- Full `npm test --workspace backend` run (this session): 69 files / 556 passed + 3 skipped, all green — current baseline
- `.planning/phases/33-public-signup-form-approval-queue/33-CONTEXT.md`, `33-UI-SPEC.md` — locked decisions and the approved (6/6 dimension) design contract
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md` — requirement text, phase goal/success criteria, milestone history and the "556/3 backend green" figure this session's fresh run confirmed still holds
- `./CLAUDE.md` — project constraints, cross-checked against current `package.json` files for staleness (found and flagged one: Node version)

### Secondary / Tertiary

None — every claim in this document traces to a direct file read or an empirical command run during this research session. No web search was performed or needed; this phase's entire technical surface is internal to the already-explored codebase.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — nothing new to install; every version verified directly from `package.json` files
- Architecture: HIGH — every pattern traced to specific, currently-read source files and lines; the two riskiest claims (undefined-key equality, cross-workspace import resolution) were empirically verified with scratch tests in this session, not assumed
- Pitfalls: HIGH — all four pitfalls were discovered by direct code/test inspection this session (not inferred), including one correction to the phase brief's own stated regression-test list (`InvitePage.test.jsx`)

**Research date:** 2026-09-07
**Valid until:** 30 days (stable internal codebase, no external library version risk — the only decay vector is if a *different* phase touches `AuthContext.jsx`, `ApprovalsPage.jsx`, or the four backend policy modules before Phase 33 executes)
