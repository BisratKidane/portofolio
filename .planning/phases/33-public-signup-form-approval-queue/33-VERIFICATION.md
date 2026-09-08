---
phase: 33-public-signup-form-approval-queue
verified: 2026-09-08T10:17:33Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Queue card density with several long relationship notes"
    expected: "With ~10 pending accounts, several carrying 400-500 char notes (D-08's never-truncate rule), the queue still reads as scannable rather than a wall of variable-height cards"
    why_human: "jsdom cannot judge visual density/scannability; 33-VALIDATION.md lists this as manual-only"
  - test: "Signup form's four simultaneous inline errors on empty submit"
    expected: "Submitting the empty public form (all four fields invalid at once, per Register.jsx:65-71's all-touched-on-submit behavior) does not read as an overwhelming wall of red"
    why_human: "Visual density judgement; 33-VALIDATION.md lists this as manual-only; automated tests only confirm the four error strings are present (Register.test.jsx:96-107), not how they read together"
---

# Phase 33: Public Signup Form & Approval Queue Verification Report

**Phase Goal:** The two surfaces people actually touch — `/register` with no token renders a public signup form that tells the person plainly what happens next, and admins get a queue listing each waiting account with the context needed to judge it, both built from the app's existing components.
**Verified:** 2026-09-08T10:17:33Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `/register` with no token renders a signup form (name, email, password, required relationship note) instead of the invitation-only dead end | VERIFIED | `Register.jsx:89-193` — `!token` branch renders 4 `TextField`s (name/email/password/note) inside `AuthShell`; no "invitation-only" copy remains. `Register.test.jsx:31-46` asserts all four `getByLabelText` calls succeed and `queryByText(/invitation only/i)` is absent. Ran `npx vitest run src/pages/Register.test.jsx` — 6/6 passed. |
| 2 | Submitting it tells the person plainly what happens next: verify your email, then an administrator reviews your request | VERIFIED | `Register.jsx:116-120` renders `Check {form.email} for a verification link.` + `Once you verify your email, an administrator reviews your request. You'll be able to sign in as soon as they approve it.` `Register.test.jsx:109-140` submits a full valid form, asserts both strings render, and asserts the server's actual `result.message` (`'a message the UI must never render on this branch'`) is NOT rendered — confirming D-06/SEC-01 (own copy, never the server string, enumeration-silent). |
| 3 | The admin queue lists each waiting account with name, email, relationship note, and registration time, and approve/reject work from there | VERIFIED | `ApprovalsPage.jsx:124-170` renders one card per row (`row.name`, `row.email`, `row.relationshipNote` or "No note provided.", `formatWhen(row.createdAt)`) sourced from `pendingApprovals`. `handleApprove`/`submitReject` call `approveUser`/`rejectUser` keyed directly on `row.id` (`ApprovalsPage.jsx:66,86`) — no `registeredUser` indirection. `ApprovalsPage.test.jsx` (10 tests) confirms card content, approve/reject wiring, and D-09's optional-reason dialog. `pendingApprovals` is wired into the admin-only route: `InvitationsPage.jsx:5,18-23` renders `<ApprovalsPage/>` for `isAdmin`, and `App.jsx:37` routes `/invitations` behind `ProtectedRoute allowedRoles={['ADMIN']}`. |
| 4 | An approved self-registrant who is not yet linked to a family member lands on the existing `/pending` screen | VERIFIED | `ProtectedRoute.jsx:17` — `if (!user.familyMemberId && user.role !== 'ADMIN') return <Navigate to="/pending" replace />` fires for any authenticated non-admin without a linked member, which is exactly an approved-but-unlinked self-registrant. `Pending.jsx:9-10` self-guards the same way if reached directly. `Pending.test.jsx` covers this (33-02-SUMMARY.md added an explicit APPR-06 regression test; confirmed present and passing in the targeted run below). |
| 5 | Loading, empty, and failed states render through the app's existing components — never a broken or empty panel | VERIFIED | `ApprovalsPage.jsx:106-121` — mutually exclusive ternary: `loadError` → `<Alert>`; `rows===null` → `<CircularProgress>`; `rows.length===0` → existing empty `<Paper>`; else → card `<Stack>`, with `actionError` rendered as a non-exclusive banner *inside* the populated branch (line 114) so a row-action failure never displaces `rows`. `ApprovalsPage.test.jsx:148-156` (failed initial load shows only the Alert, no spinner/empty/cards) and `:158-181` (WR-01 regression: a failed approve on row 1 shows the action banner while row 2, "Ada L", remains visible) both pass. |

**Score:** 5/5 truths verified

### Gap-Closure Verification (CR-01 / CR-02 / WR-01 — the fixes were checked as hard as the bugs)

Per the calling agent's explicit instruction, these were independently re-derived from source, not taken on the SUMMARY's word:

- **CR-01 (client email regex more permissive than server):** `Register.validation.js:1,57` now imports and calls `validator/lib/isEmail.js` directly — the identical function `backend/src/utils/emailPolicy.js:1,54`'s `assertRegistrationEmail` calls. No hand-rolled regex remains anywhere in the file (`grep -n "EMAIL_FORMAT"` — zero matches). Independently re-ran the 9 CR-01 divergent inputs through the raw `validator/lib/isEmail.js` module (not trusting the test file) and confirmed all 9 are rejected by `isEmail` while the old hand-rolled `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` regex accepted all 9 — matching 33-REVIEW.md's claim exactly. `validator` is declared as a direct dependency in both `frontend/package.json:31` and `backend/package.json:32` (`^13.15.35`), so client and server resolve the same package version.
- **Mutation-test claim (would the agreement test actually catch a regression?):** The gap-closure SUMMARY's claim (temporarily reintroducing the old regex → 9/31 tests red → revert → 31/31 green) was not re-executed live (would require mutating source), but the fixture table itself was read directly (`Register.validation.test.js:82-98`) and independently confirmed to contain exactly those 9 divergent-input rows plus the original 3 boundary rows, each asserted with `expect(validateEmail(value).valid).toBe(expected)` AND `expect(backendAccepts(assertRegistrationEmail, value)).toBe(expected)` — i.e. both sides are asserted against the same expected value in the same `it.each` row, so a regression to the old regex would necessarily flip `validateEmail(...).valid` to `true` while `backendAccepts(...)` stays `false`, failing the assertion. This is a real regression gate, not a self-referential one. Ran `npx vitest run src/pages/Register.validation.test.js` — 31/31 passed.
- **CR-02 (note trim/raw mismatch):** `Register.validation.js:77-90` — `validateRelationshipNote` now checks `raw.length > MAX_RELATIONSHIP_NOTE_LENGTH` (line 87), not `trimmed.length`. `Register.jsx:79` submits `form.relationshipNote` unmodified (the raw value) to `register()`. `relationshipNotePolicy.js:6-8` checks `note.length > 500` on the raw value with no trim. All three now agree on the same (raw) value — confirmed by direct code read, not just the test. Test fixture `Register.validation.test.js:121` (`'a'.repeat(500) + ' '` → `false`) exercises exactly this case and passes.
- **WR-01 (shared error state blanks the queue):** `ApprovalsPage.jsx:46-47` splits `loadError`/`actionError`; the render ternary (line 106) gates only on `loadError`; `actionError` renders as a banner (line 114) inside the still-populated branch; both `handleApprove` and `submitReject` catch blocks call `await load()` again after setting `actionError` (lines 74, 91) so a row that lost a concurrent-admin race is refreshed away rather than left stale. `ApprovalsPage.test.jsx:158-181` reproduces the exact two-row scenario from 33-REVIEW.md (approve row 1 fails with `'This account is not awaiting a decision.'`, row 2 "Ada L" must remain visible) and passes.

All three findings independently confirmed closed at the source-code level, not just via the SUMMARY's narrative.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/src/pages/Register.jsx` | Tokenless branch is a real public signup form | VERIFIED | 4-field form, D-06 success copy, byte-identical invited-path preserved (see Key Link below) |
| `frontend/src/pages/Register.validation.js` | Client validators agree with backend policy modules | VERIFIED | Email check now `validator.isEmail` by construction; note-length check on raw value; name/password already agreed |
| `frontend/src/pages/Register.validation.test.js` | D-04 agreement test, cross-workspace import | VERIFIED | Imports real `backend/src/utils/{emailPolicy,namePolicy,relationshipNotePolicy,passwordPolicy}.js`; 31/31 passing, includes 9 CR-01 + 1 CR-02 regression rows |
| `frontend/src/pages/ApprovalsPage.jsx` | Card-based queue on `pendingApprovals`, split error state | VERIFIED | Restructured to vertical card (D-07/D-08), `loadError`/`actionError` split (WR-01 fix), dead `orphaned`/`Tooltip` branch removed |
| `frontend/src/context/AuthContext.jsx` | `register()` widened to named-object param | VERIFIED | `register: ({ token, name, email, password, relationshipNote }) => ...` (line 99); both call sites (invited + tokenless) confirmed correct shapes via passing tests |
| `backend/src/resolvers/invitation.resolver.js`, `backend/src/schemas/invitation.schema.js` | `pendingRegistrations` fully deleted | VERIFIED | Zero matches for `pendingRegistrations` anywhere in `backend/src/` or `frontend/src/` (only a stale, gitignored `frontend/dist/` build artifact still contains it) |
| `frontend/src/pages/Pending.jsx` | APPR-06 landing screen | VERIFIED | Unchanged from Phase 32/pre-existing; correctly redirects ADMIN/linked users, renders for unlinked self-registrants |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `Register.jsx` (tokenless branch) | `AuthContext.register()` | `register({ name, email, password, relationshipNote })` | WIRED | `Register.jsx:75-80` calls widened signature; `Register.test.jsx:125-131` asserts exact GraphQL variables including `token: undefined` |
| `Register.jsx` (invited branch) | `AuthContext.register()` | `register({ token, name, password })` | WIRED, REGRESSION-SAFE | `Register.jsx:52` unchanged call shape; `Register.test.jsx:62-65` asserts `{ token: 'tok-abc', name: 'Ada', password: 'secret123' }` — byte-identical to pre-Phase-33 behavior |
| `ApprovalsPage.jsx` | `pendingApprovals` / `approveUser` / `rejectUser` | `graphqlRequest(...)` | WIRED | Query/mutations defined lines 22-35, called in `load`/`handleApprove`/`submitReject`; backend schema (`user.schema.js:pendingApprovals`, unchanged from Phase 32) matches field selection |
| `ApprovalsPage.jsx` | `InvitationsPage.jsx` → `/invitations` route | component composition + `ProtectedRoute allowedRoles={['ADMIN']}` | WIRED | `InvitationsPage.jsx:5,21` renders `<ApprovalsPage/>` for admins; `App.jsx:34-37` gates the route — pre-existing routing pattern (`/approvals` redirects to `/invitations`), unmodified by this phase, correctly still functions |
| `ProtectedRoute.jsx` | `/pending` | `!user.familyMemberId && user.role !== 'ADMIN'` guard | WIRED | Line 17 — pre-existing guard, confirmed unmodified and still correct for the approved-unlinked-self-registrant case |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `ApprovalsPage.jsx` | `rows` (state) | `graphqlRequest(PENDING_APPROVALS_QUERY)` → `backend` `pendingApprovals` resolver (Phase 32, unchanged) | Yes — real Sequelize query (`user.resolver.js`, unchanged from Phase 32, confirmed still wired) | FLOWING |
| `Register.jsx` success panel | `form.email` | Local component state, the value the user just typed | Yes — not server-derived, deliberately (D-06/SEC-01 enumeration-safety) | FLOWING (by design) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Old regex accepts, `validator.isEmail` rejects, all 9 CR-01 inputs | `node -e "import('validator/lib/isEmail.js')..."` against `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` vs. `isEmail` for all 9 fixture inputs | All 9: old regex `true`, `isEmail` `false` | PASS |
| `Register.validation.js` has no lingering hand-rolled email regex | `grep -n "EMAIL_FORMAT" frontend/src/pages/Register.validation.js` | zero matches | PASS |
| `pendingRegistrations` fully removed from source | `grep -rn "pendingRegistrations" backend/src/ frontend/src/` | zero matches (only stale gitignored `frontend/dist/` build output) | PASS |
| Targeted signup/queue/auth test files pass | `npx vitest run src/pages/Register.validation.test.js src/pages/ApprovalsPage.test.jsx src/pages/Register.test.jsx src/pages/Pending.test.jsx src/context/AuthContext.test.jsx src/pages/InvitationsPage.test.jsx` | 6 files, 62 tests, all passed | PASS |
| `Register.validation.test.js` alone (D-04 agreement gate) | `npx vitest run src/pages/Register.validation.test.js` | 31/31 passed | PASS |
| Backend resolver/schema syntax valid after `pendingRegistrations` deletion | `node --check src/resolvers/invitation.resolver.js && node --check src/schemas/invitation.schema.js` | OK | PASS |
| No debt markers in phase-touched files | `grep -n -E "TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER"` across `Register.jsx`, `Register.validation.js`, `Register.validation.test.js`, `ApprovalsPage.jsx`, `ApprovalsPage.test.jsx`, `AuthContext.jsx`, `Pending.jsx` | zero matches in all 7 files | PASS |

Not re-run: the full `npm test --workspaces` suite (frontend 482/482, backend 551+3 skipped) per the calling agent's explicit instruction not to run two backend test processes concurrently against the shared MySQL test DB — the SUMMARY's claimed counts were cross-checked instead via targeted, cheap sub-runs above, which all passed.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| REG-01 | 33-01, 33-04 | Public 4-field signup form at `/register` with no token | SATISFIED | Truth 1 above |
| REG-04 | 33-04 | Tells the registrant plainly what happens next | SATISFIED | Truth 2 above |
| APPR-02 | 33-02, 33-03 | Admin queue lists waiting accounts with full context; approve/reject work | SATISFIED | Truth 3 above |
| APPR-06 | 33-02 | Approved-unlinked self-registrant lands on `/pending` | SATISFIED | Truth 4 above |
| REG-03 (UI half) | 33-02 | Relationship note shown to admins at approval time | SATISFIED | `ApprovalsPage.jsx:131-141` renders note in full or "No note provided."; `ApprovalsPage.test.jsx:44-60` |
| SEC-03 (UI half) | 33-02 | Note rendered safely in admin UI (no markup injection) | SATISFIED | React default text-child escaping, no `dangerouslySetInnerHTML`; `ApprovalsPage.test.jsx:62-74` proves an HTML-bearing note renders as literal text and creates no `<img>` element |

No orphaned requirement IDs — REQUIREMENTS.md's traceability table maps REG-01, REG-03 (UI), REG-04, APPR-02, APPR-06, SEC-03 (UI) to Phase 33, and all six appear across the four plans' `requirements:` frontmatter and are claimed in `requirements-completed:` in the corresponding SUMMARYs.

**Documentation note (not a code gap):** `.planning/REQUIREMENTS.md`'s checkboxes for REG-01, REG-04, APPR-02, and APPR-06 are still unchecked (`[ ]`) despite the implementation satisfying them, and REG-03/SEC-03 still carry their Phase-32-only "(Backend half complete...)" annotation without being updated to reflect the Phase 33 UI half now also landing. 33-CONTEXT.md explicitly anticipated this ("REQUIREMENTS.md should be updated to full when they land"). This is a documentation-sync gap, not an implementation gap — flagged for whoever runs milestone completion, not blocking this phase's status.

### Anti-Patterns Found

None. No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers, no empty stub returns, no hardcoded-empty render paths, and no `dangerouslySetInnerHTML` in any file this phase touched.

### Known, Accepted Risk (not a new finding)

**CR-02 — tokenless account pre-hijacking** (`.planning/todos/pending/20260903-cr02-account-pre-hijacking.md`): a public signup form is exactly the surface that puts this in front of real users — Phase 33 does not fix it and was never scoped to. `33-CONTEXT.md` D-01 records the decision to accept this risk explicitly (the registration password remains the working credential; nothing re-binds it after ownership is proven at verification). This is user-accepted per prior context, not reported here as a new blocker. It is stated because it directly bears on the phase's stated goal ("a public signup form that tells the person plainly what happens next") — the goal is achieved, and the accepted risk means the form now being public is the thing that makes the pre-hijacking vector reachable at all. This does not change the verdict below; it is disclosed per the calling agent's instruction.

### Human Verification Required

### 1. Queue card density with long notes

**Test:** Seed roughly 10 pending accounts in the approval queue, several with relationship notes near the 500-char cap, and view `/invitations` as an admin.
**Expected:** The card list still reads as scannable — variable-height, never-truncated notes (D-08) do not make the queue feel like a wall of text.
**Why human:** jsdom cannot judge visual density/scannability. Listed as manual-only in `33-VALIDATION.md`; no evidence in any SUMMARY that this was performed.

### 2. Signup form's four simultaneous inline errors

**Test:** Visit `/register` with no token, click "Create account" without filling anything in.
**Expected:** All four inline errors appear at once without reading as an overwhelming wall of red.
**Why human:** Visual density judgement. Listed as manual-only in `33-VALIDATION.md`; the automated test (`Register.test.jsx:96-107`) only confirms the four error strings are present, not how they read together visually.

### Gaps Summary

No code-level gaps. All 5 ROADMAP success criteria are independently verified against source, all 3 code-review findings (CR-01, CR-02, WR-01) were re-derived from source (not taken on the gap-closure SUMMARY's word) and confirmed genuinely closed with real regression coverage, and all 6 requirement IDs in scope are satisfied. The only outstanding items are the two manual-only visual checks 33-VALIDATION.md itself scoped out of automation, with no record of either having been performed — hence `human_needed` rather than `passed`.

---

_Verified: 2026-09-08T10:17:33Z_
_Verifier: Claude (gsd-verifier)_
