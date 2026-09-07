# Phase 33: Public Signup Form & Approval Queue - Context

**Gathered:** 2026-09-04
**Status:** Ready for planning

<domain>
## Phase Boundary

The two surfaces people actually touch. `/register` with no token renders a real public signup form instead of today's "Agne is invitation-only" dead end, and tells the person plainly what happens next. Admins get a queue listing each waiting account with the context needed to judge a stranger, with approve/reject working from there. Both built from the app's existing components.

Requirements: REG-01, REG-04, APPR-02, APPR-06.

**This is a frontend phase.** The backend contract already exists from Phase 32 — `register(token: String, name: String!, email: String, password: String!, relationshipNote: String)` and `pendingApprovals: [User!]!` are both live and tested. No new backend capability is in scope. The one backend deletion in scope is removing the now-dead `pendingRegistrations` query (see D-10).

</domain>

<decisions>
## Implementation Decisions

### Signup form shape

- **D-01:** The password typed on the signup form **is** the account's working password. No invalidation, no set-password step after verification. The registrant types it once and logs in with it after approval. This consciously accepts CR-02 — see the Folded Todos section below, which records the residual risk in full so a future reader does not mistake it for an oversight.
- **D-02:** One **"Full name"** text field, not separate first/last inputs. Matches REG-01's wording, matches the current `Register.jsx`, and matches the backend's single `User.name` column — no migration, no `register` signature change. (`firstname`/`lastname` exist only on `FamilyMember`; the split was considered and rejected.)
- **D-03:** The form collects all four fields REG-01 names: full name, email, password, relationship note (note required on the public path). With D-01 in place the password field is honest — its value is used.
- **D-04:** Validation is **client-side first, server as backstop.** The form checks required fields, email shape, note length and password strength before submitting so the person gets immediate feedback; server errors still surface for anything that slips through.

  **Constraint the planner MUST honour:** this is the exact bug class that cost Phase 32 an entire extra review round (32-REVIEW.md CR-01 — a client-side guard more permissive than the model-layer validator, so failures fell through into a uniform success message). Client rules here MUST NOT be independently hand-written approximations of the server's. Derive them from the same source, or pin them with a test that asserts agreement against the real server-side policy modules (`backend/src/utils/emailPolicy.js`, `namePolicy.js`, `relationshipNotePolicy.js`, `passwordPolicy.js`). A test that only exercises the client rules against themselves is what let CR-01 through.

### Post-submit feedback (REG-04)

- **D-05:** The success state **swaps the form in place** inside `AuthShell`. `Register.jsx` already holds a `result` state and renders a success panel this way on the invited path — the tokenless path reuses that same component and shell. No new route, no redirect.
- **D-06:** The UI writes **its own copy and names the address** — e.g. "Check ada@example.com for a verification link. Once you verify, an administrator reviews your request before you can sign in." It does not display the server's fixed string verbatim.

  **Enumeration-safety note:** this is safe under Phase 32 D-08 *because the UI never branches on whether the account exists* — the same text renders either way, and the address shown is the one the caller just typed, which they already know. Any future change that varies this copy by server response would break SEC-01. Say so in the code.

### Admin approval queue (APPR-02)

- **D-07:** The queue renders as **cards, one per waiting person** — name and email as the heading, the relationship note as body text, registration time and the approve/reject actions in a footer.

  **Correction (2026-09-07, found during UI research):** an earlier draft of this decision said `ApprovalsPage.jsx` is currently an MUI `Table`. **That was wrong.** It imports no table primitives at all — it already renders one `<Paper elevation={0}>` per row (`ApprovalsPage.jsx:135`). The only real `Table` in the app is `AdminMemberTable.jsx` (used by `ManagePage`). So this decision is **not** a table→card rewrite; it is a restructuring of the existing per-row `Paper` from a horizontal layout (header and actions side-by-side) to a vertical header/body/footer card that gives the note its own full-width region. Less work than the original framing implied. See `33-UI-SPEC.md` for the composition.
- **D-08:** The relationship note is **always shown in full** — no truncation, no expander, no scroll cap. It is the only context an admin has to judge a stranger, so it is never hidden behind an interaction. Rows will be variable-height; that is accepted.

  **Safety (SEC-03, whose UI half was deferred from Phase 32 to here):** the note is attacker-controlled free text up to 500 chars. React escapes text children by default, so rendering it as a normal string satisfies "rendered safely". Do **not** introduce `dangerouslySetInnerHTML` or any markdown/rich-text rendering for this field. Empty is a normal state, not an edge case (Phase 32 D-06 made the note optional) — render a plain "No note provided" rather than an empty gap or an error.
- **D-09:** **Reject reason is optional** — a dialog prompts for one and allows submitting empty. This matches the existing `rejectUser(userId: ID!, reason: String)` signature; no schema change and no client-side requirement.
- **D-10:** `ApprovalsPage` swaps onto **`pendingApprovals`**, and **`pendingRegistrations` is deleted** — the query, its resolver in `backend/src/resolvers/invitation.resolver.js:34`, and its tests. This was pre-decided by Phase 32 D-11 ("two queue queries coexist for one phase, deliberately"); this phase is where the old one goes.

  **Verified during discussion:** after Phase 31 D-04/D-05 made invited registrants auto-activate on email verification, an invited user never reaches the approval queue. `pendingApprovals`' filter (`status: 'Pending', emailVerified: true`) therefore contains only self-registrants in practice. There is **one** queue, not an invited-vs-self split — do not build a segmented view.

### Claude's Discretion

- Card visual composition, spacing, and which MUI primitives compose the card (`Card`/`Paper`/`Stack`) — follow the app's existing surface treatment.
- Loading / empty / failed states for the queue (SC-5). `ApprovalsPage` already has a `CircularProgress` loading state and an empty state; carry the established shapes over to the card layout rather than inventing new ones.
- Exact microcopy wording, beyond D-06's requirement that it name the address and state both remaining steps (verify, then admin review).
- Whether `/register`'s invited branch is refactored alongside the public branch or left untouched — as long as invited behaviour does not change.

### Folded Todos

**CR-02 — tokenless register enables account pre-hijacking** (`.planning/todos/pending/20260903-cr02-account-pre-hijacking.md`, matched this phase at 0.6).

Folded and **decided: accepted, not fixed.** D-01 keeps the registration password as the working credential.

The residual risk, recorded so it is not lost or later mistaken for an oversight: an anonymous caller can register a third party's email with their own password and a plausible relationship note. The real owner receives a verification mail and clicks it; an admin sees a queue row whose name and address both look legitimate and approves it; the attacker logs in as that person. The admin-approval gate is defeated precisely because the attacker forged the one signal the admin decides on, and the victim's own click is what activates the account.

Alternatives considered and rejected in discussion: setting the password after verification (rejected — extra step for every legitimate registrant), and invalidating the password on verification (initially chosen, then reversed for the same reason).

The todo file stays open, annotated with this decision. It is a live vulnerability that this milestone chose to ship with, not closed work.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

ROADMAP.md lists no canonical refs for this phase. The following were established during discussion and codebase scout.

### Phase 32's locked decisions this phase depends on
- `.planning/phases/32-tokenless-registration/32-CONTEXT.md` — D-08 (tokenless response is enumeration-silent; constrains D-06 here), D-06 (relationship note is optional, so empty is normal), D-05 (500-char cap), D-11 (`pendingApprovals` added *for this phase* to swap onto; `pendingRegistrations` deleted here), D-13 (`register`'s success message no longer promises admin review)
- `.planning/phases/31-invitations-become-admin-only/31-CONTEXT.md` — D-04/D-05 (invited registrants auto-activate on verification: the reason the queue holds only self-registrants), D-09 (`pendingRegistrations`' current filter), D-10 (`ApprovalsPage` left mounted for this phase to rework)

### Known defects and constraints carried in
- `.planning/phases/32-tokenless-registration/32-REVIEW.md` — CR-01 (the client/server validator-divergence bug class that D-04 must not repeat); CR-02 (accepted per D-01); WR-01 (missing index on `role`/`status`/`emailVerified` — relevant if the queue grows)
- `.planning/phases/32-tokenless-registration/32-VERIFICATION.md` — what Phase 32 actually delivered and proved
- `.planning/todos/pending/20260903-cr02-account-pre-hijacking.md` — the accepted risk, in full

### Requirements
- `.planning/REQUIREMENTS.md` — REG-01 (line 28), REG-04 (line 31), APPR-02 (line 46), APPR-06 (line 50). Note REG-03 and SEC-03 are tracked backend-partial from Phase 32; **their UI halves land in this phase** and REQUIREMENTS.md should be updated to full when they do.

### Codebase maps
- `.planning/codebase/CONVENTIONS.md`, `.planning/codebase/STRUCTURE.md` — frontend naming and layout conventions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/components/AuthShell.jsx` — the branded card wrapper every auth page uses (`eyebrow`/`title`/`subtitle`/`footer`/`children`). The signup form and its success panel both render inside it (D-05).
- `frontend/src/pages/Register.jsx` (107 lines) — already has the `result`-state success-panel pattern on the invited path, and the `!token` branch that currently returns the invitation-only dead end. That branch is what gets replaced.
- `frontend/src/pages/ApprovalsPage.jsx` (209 lines) — existing `approveUser`/`rejectUser` wiring, loading `CircularProgress`, `Paper`-based empty state (`:120`), and already one `<Paper>` per row (`:135`). D-07 restructures that Paper's internal layout; the mutation wiring and state shapes carry over. Its `orphaned`/`Tooltip`-disabled branch becomes dead once `pendingApprovals` returns flat `User` rows (D-10) — remove it.
- `frontend/src/pages/Pending.jsx` (21 lines) — the APPR-06 landing screen. Already redirects ADMIN or any user with a `familyMemberId` to `/dashboard`, so an approved-but-unlinked self-registrant already lands here correctly. Likely needs no change beyond confirming copy fits a self-registrant (it currently says "awaiting an admin to link you to your family member").
- `frontend/src/pages/ResetPassword.jsx`, `ForgotPassword.jsx` — the password-field and form-error idioms to mirror.

### Established Patterns
- `frontend/src/api/graphqlClient.js` `graphqlRequest()` centralises GraphQL calls and error extraction; pages `try/catch` and surface `err.message` in an MUI `<Alert severity="error">`, with a `finally` resetting loading. Follow this, do not introduce a GraphQL client library.
- `frontend/src/context/AuthContext.jsx` holds the mutation strings as SCREAMING_SNAKE_CASE constants and exposes thin wrappers.
- Every page has a colocated `*.test.jsx`; this phase's new/changed pages need the same.

### Integration Points
- **`AuthContext.jsx:18-22` `REGISTER_MUTATION` must be widened.** It currently declares `$token: String!` (non-nullable) and passes only `token, name, password`. The backend already accepts `token: String` (optional) plus `email` and `relationshipNote`. The `register` wrapper at `:91` has the signature `(token, name, password)` and needs the new arguments. **This is the single highest-risk edit in the phase** — the invited path calls the same mutation and must keep working byte-identically.
- `ApprovalsPage.jsx:23-36` `PENDING_QUERY` → replace with a `pendingApprovals` query selecting `id name email relationshipNote createdAt`; row accessors change from the invitation shape (`invitedName`, `registeredUser { … }`) to the flat account shape.
- `backend/src/resolvers/invitation.resolver.js:34` `pendingRegistrations` resolver + its schema field and tests — delete (D-10).

</code_context>

<specifics>
## Specific Ideas

- The queue is explicitly a "judge a stranger" surface, not a list of known invitees — that framing drove both the card layout (D-07) and the never-truncate rule for the note (D-08).
- The success copy should name the address the person just typed, so it reads as confirmation rather than a generic acknowledgement (D-06).

</specifics>

<deferred>
## Deferred Ideas

- **Splitting `User.name` into `firstname`/`lastname`** (with a migration, matching `FamilyMember`'s shape) — raised during discussion, rejected for this phase as it grows a frontend phase into backend work. Would be worth revisiting whenever account↔member linking is next touched, since the split would help that flow.
- **Fixing CR-02 properly** (credential set only after proven ownership) — accepted rather than fixed here per D-01. If revisited, the leading design is in the todo file.
- **WR-01: index on `users(role, status, emailVerified)`** — not this phase's concern, but the queue query filters on two of those columns and both last-administrator guards full-scan without it.

</deferred>

---

*Phase: 33-public-signup-form-approval-queue*
*Context gathered: 2026-09-04*
