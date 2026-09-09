# Phase 35: Post-Verify Landing & Invited-Path Copy - Research

**Researched:** 2026-09-09
**Domain:** React Router routing/copy change + one shared mailer template, in an existing Vitest+RTL-tested Express/Apollo + React/MUI codebase
**Confidence:** HIGH

## Summary

This phase closes two milestone-audit warnings by (1) adding one new, stateless, session-free public route that a self-registrant lands on after verifying their email while still `Pending`, and (2) rewording three places that still promise an admin review the invited path no longer has. Every file this phase touches was read in full; every locked behavior (`AuthContext.verifyEmail`'s token-withholding, `ProtectedRoute`'s `/pending` redirect, the server's `TOKENLESS_REGISTER_MESSAGE`) was traced to its exact source line and confirmed unaffected by the planned changes. There is no schema, resolver, or database work in this phase — the entire diff is React components/routes, English copy, and one composed test.

The critical technical fact driving D-01's page-not-redirect design is at `backend/src/resolvers/user.resolver.js:462-466`: `verifyEmail`'s token consumption is an atomic conditional `UPDATE ... WHERE emailVerificationToken = hashed`, so the token is single-use — a page reload after a successful verify re-fires the mutation against an already-null token and throws `The email verification token is invalid or has expired.`. Any destination reachable by `navigate()` route state (which react-router drops on refresh) reproduces exactly the W-1 bug this phase exists to fix. A dedicated route with no dependency on session or location state is the only shape that survives a refresh, matching CONTEXT.md D-01/D-02 exactly.

**Primary recommendation:** Add `frontend/src/pages/AwaitingApproval.jsx` (a stateless `AuthShell` page, zero props, zero hooks beyond nothing) registered at `frontend/src/App.jsx` as a public `<Route path="awaiting-approval">` alongside `verify-email`/`pending`; change `VerifyEmail.jsx:25`'s non-Active branch from `'/pending'` to `'/awaiting-approval'`; reword `Pending.jsx`'s title/body to drop "approval"; reword `Register.jsx:310-313` and both branches of `mailer.js`'s `sendInvitationEmail` (text ~149, html note ~160) to the same "verify, then sign in" sentence; neutralize `sendVerificationEmail`'s two "activate your account" strings (~169, ~172) to a path-neutral confirmation line. Write the composed test red-first, using `VerifyEmail.test.jsx`'s existing `AuthProvider`+`MemoryRouter` harness with the `useNavigate` mock removed and four real routes mounted.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Where the landing lives (SC-1, SC-2)**

- **D-01:** The verified-but-Pending self-registrant lands on a **new, dedicated, stateless public route with its own page component** (working name `/awaiting-approval`; the planner may pick the exact path). `VerifyEmail.jsx:25` navigates non-Active users there instead of `/pending`; Active users still go to `/dashboard` exactly as today. Registered in `App.jsx` as a public `<Route>` alongside `verify-email` and `pending` — not under `ProtectedRoute`.

  **Why this shape:** it is the only option that survives a browser refresh. Inline-in-`VerifyEmail` was rejected because the URL would keep the consumed `?token=…`; a refresh re-fires `verifyEmail`, which throws `The email verification token is invalid or has expired.` (`user.resolver.js:445,466`) over a success the person just saw. `/pending` via `navigate(…, { state })` was rejected because route state dies on refresh and the person is back to the silent `/login` bounce — the exact W-1 symptom.

- **D-02:** The new page **has no `useAuth` dependency and never redirects**. It renders the same thing with or without a session, on a direct URL hit, and after refresh. It therefore cannot name the registrant's address (Phase 33 D-06's "name the address" pattern does not apply — there is no session and no query param carrying it; do not add one).

- **D-03:** `Pending.jsx` keeps **one job**: the signed-in, approved, still-unlinked user that `ProtectedRoute.jsx:17` sends there. Its `!user → /login` bounce at `Pending.jsx:9` stays **exactly as it is** — that bounce is correct for a no-session hit on `/pending` and is part of the defence in depth SC-2 asks for. Do not add a query flag or route-state branch to `Pending.jsx`.

- **D-04:** `AuthContext.jsx:75-84` (`verifyEmail` withholds the token for non-Active users) is **locked and untouched** (ROADMAP SC-2). The only routing change is the destination string in `VerifyEmail.jsx`.

**Landing + `/pending` copy (SC-1, SC-4)**

- **D-05:** The awaiting-approval page states the **full remaining sequence**: your email is verified → an administrator now reviews your request → you'll get an email as soon as you're approved → then you can sign in. Promising the email is honest: APPR-03 already sends it on approval (`mailer.js` approval template), and `Register.jsx:213` promised the same sequence one step earlier. Same `AuthShell` chrome as the other auth pages.

- **D-06:** The page offers **exactly one action**: a "Return to sign in" link in the `AuthShell` footer, matching `VerifyEmail.jsx:37-43`. No buttons, no "contact us" line (no contact surface exists in the app). Signing in early just shows the existing server error `Your account is awaiting administrator approval.` (`user.resolver.js:383`) — harmless and consistent.

- **D-07:** `Pending.jsx` is **retitled to the linking state and the word "approval" is removed from it**. Title along the lines of "Waiting to be linked to your family"; body says the account is approved and an administrator still has to link them to their family member in the tree, with access as soon as that happens. The APPR-06 regression in `Pending.test.jsx:41` (approved, unlinked self-registrant sees the linking message) must keep passing; the other four `Pending.test.jsx` cases (dashboard redirects, `/login` bounce) are unchanged in behaviour and only their copy assertions move.

**Invited-path copy + the shared verification email (SC-3)**

- **D-08:** The invited path says **"verify, then sign in" — the same message in all three places**: `Register.jsx:310-313` (invited success paragraph), `sendInvitationEmail` plain-text (`mailer.js:149`) and HTML `note` (`mailer.js:160`). No admin-review promise remains anywhere on the invited path. The explicit "your inviter already vouched for you" sentence was considered and dropped — the post-submit UI does not know the inviter without new plumbing. The `subtitle` at `Register.jsx:294` ("You've been invited — set up your Agne profile.") is already true and stays.

- **D-09:** The **shared `sendVerificationEmail` (`mailer.js:165-170`) is neutralised**, not made path-aware: drop "to activate your account" for a path-neutral confirmation line (e.g. "Please confirm this is your email address"). One string edit in each of the `text` and `intro` branches; **no signature change, no per-path flag, no branching**. This is the ROADMAP's "one mailer template" plus one honest sentence — it stays inside the phase goal (nobody is promised something that does not happen) without widening the mailer API or touching either `register` branch.

- **D-10:** The server's `register` success string `Registration received. Verify your email to activate your account.` (`user.resolver.js:104` `TOKENLESS_REGISTER_MESSAGE`, `:285` invited branch) is **DO NOT TOUCH**. Reasons: this phase makes no resolver changes; the string is pinned by the SEC-01 identical-message and rate-limit tests (`register.test.js:24`, `rateLimit.test.js:226`, `publicRegistrationSwitch.test.js:476`, `Register.test.jsx:27`); and it is only ever rendered verbatim on the invited path (`Register.jsx:307`), where it is true — Phase 33 D-06 already keeps it off the public path.

**Composed test (SC-5)**

- **D-11:** The composed test is **`VerifyEmail.test.jsx`'s harness minus the `useNavigate` stub**: real `AuthProvider`, `MemoryRouter` at `/verify-email?token=…`, with the real `/verify-email`, `/awaiting-approval` (or whatever D-01 names it), `/pending` and `/login` routes mounted, and the network mocked **only** at `graphqlRequest`. Happy path asserts: the landing copy renders, the login form never renders, `localStorage` holds no `authToken`. Rendering the full `App.jsx` was considered and rejected (drags in `AppLayout`/nav/every page; no App-level test exists to copy).

- **D-12:** **Red first.** The composed test is written before the fix and must go red on the current code by landing on the login form — that red run *is* the reproduction of W-1 and is recorded in the plan. (Project memory: TDD red-green, especially for anything on the auth path.)

- **D-13:** The composed file also pins these regressions (user left the set to Claude; all four are included — they are cheap and match Phase 34 D-13):
  1. **Active user still lands on `/dashboard` with a session** — the invited path through the same harness: `verifyEmail` returns `status: 'Active'` → `/dashboard` route renders and `authToken` **is** stored. Proves the new branch did not swallow the old one.
  2. **No-signal `/pending` still bounces to `/login`** — `MemoryRouter` at `/pending` with no session → login renders (SC-2 defence in depth; pins D-03).
  3. **Landing renders with no session on a direct hit** — `MemoryRouter` at the landing path, `graphqlRequest` never called → page renders. This is the refresh-safety property that drove D-01; without a test it is an intention.
  4. **Mutation-tested (Phase 34 D-13):** the plan records, as a verification step with its result: revert `VerifyEmail.jsx:25` to `'/pending'` → composed test red → restore; weaken each copy assertion's target string → its test red → restore.

### Claude's Discretion

- Exact route path and page/component/file names for D-01 (`/awaiting-approval` and `AwaitingApproval.jsx` are working names).
- Exact wording of every string within the constraints above: landing page eyebrow/title/body (D-05), `Pending.jsx` title/body (D-07), the three invited-path sentences (D-08), the neutral verification-email line (D-09). Match the app's existing tone (`AuthShell` pages, sentence case, no exclamation marks).
- Whether `VerifyEmail.jsx:25`'s predicate stays `status !== 'Active'` or tightens to `status === 'Pending'`. Rejected/Disabled rows cannot reach `verifyEmail` today (audit flow b), so both are equivalent in practice; if it changes, say why in a comment.
- Test-file placement: whether the composed test lives in a new file (e.g. `frontend/src/pages/verifyLanding.composed.test.jsx`) or extends `VerifyEmail.test.jsx`, and how the existing `navigates to /pending` case at `VerifyEmail.test.jsx:65` is updated to the new destination. `mailer.test.js:133` (`sendInvitationEmail`) gains assertions that the old promise is gone and the new sentence is present.
- Whether the landing page also gets its own small unit test in addition to the composed coverage in D-13.

### Deferred Ideas (OUT OF SCOPE)

- **Path-aware verification email** — passing a variant into `sendVerificationEmail` so invitees read "activate" and self-registrants read "then an administrator approves". Rejected for this phase in favour of D-09's neutral wording because it changes the mailer signature and both `register` branches (resolver touch). Revisit if the neutral line proves too vague in practice.
- **Login pending-error linking to the landing page** — when a Pending user attempts sign-in, the server error could point them at the new page. Left alone: APPR-05 locks the login gate and its messages, and the message is server-side.
- **Inviter-vouch sentence on the invited success state** — "X has already vouched for you" needs the inviter's name on the post-submit screen; not plumbed today.
- **CR-02 account pre-hijacking** (v4.2, own design decision) — not folded into this phase.
- **W-3 production migrations** (operator step) — not folded into this phase.
- **W-4 status-blind link list** — not folded into this phase.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REG-04 | After submitting, a self-registrant is told plainly what happens next: verify your email, then an administrator reviews your request before you can sign in. | Already delivered client-side at `Register.jsx:212-215` for the tokenless success state (unchanged by this phase — verified byte-identical, not in the CONTEXT.md touch list). This phase completes the *next step* of that promise: the D-01 landing page (`AwaitingApproval.jsx`) restates the same sequence honestly at the point the registrant actually reaches it post-verify, closing W-1's silent bounce. |
| REG-06 | Verifying the email moves a self-registration into the admin approval queue (the account stays `Pending`) and notifies administrators that someone is waiting. | Backend behavior (`user.resolver.js` verifyEmail transaction, `sendPendingRegistrationEmail`) is already complete and untouched by this phase (CONTEXT.md forbids resolver changes). This phase's D-01/D-05 landing page is the user-facing confirmation that this already-true backend behavior happened — REG-06's data-layer half was Phase 32; this phase closes REG-06's honest-copy half per the phase description's framing ("closes the user-facing half"). |
| INVITE-03 | A person who registers through an admin invitation and verifies their email becomes `Active` automatically — no approval step, because the admin who invited them already vouched for them. | Backend auto-activation (Phase 31) is untouched. This phase's D-08/D-09 close the *copy* gap: three places (`Register.jsx:310-313`, `mailer.js` `sendInvitationEmail` text+html) still tell an invitee to expect a review that INVITE-03 already removed. Fixing these three strings is the user-facing completion of INVITE-03. |

## Project Constraints (from CLAUDE.md)

- **Tech stack**: JavaScript ES Modules, Node 18.x, npm workspaces — no bundler rewrite; this phase adds no new tooling, so trivially compliant.
- **Test tooling**: Vitest is the single runner (already confirmed: `vitest ^4.1.10` in both workspaces); React Testing Library + jsdom for frontend (already confirmed: `@testing-library/react ^16.3.2`, `jsdom` via `vitest.config.js` `environment: 'jsdom'`); Apollo `executeOperation`-style resolver integration exists in backend tests (`test/helpers.js`'s `graphql()` helper, confirmed via `createInvitation.test.js`/`register.test.js` usage) — not touched by this phase since no resolver changes.
- **Database**: backend integration tests need an isolated test DB — confirmed: `backend/test/globalSetup.js` + `test/guard.js`'s `assertTestDatabase()` enforce a `_test`-suffixed database name before `sync({ force: true })` runs. This phase's only backend change (`mailer.js`) has zero DB interaction; `mailer.test.js` needs no DB (asserted via `jsonTransport` in `nodeEnv: 'test'`, see `mailer.js:14`).
- **CI**: GitHub Actions running the workspace suite on push/PR — no CI config changes needed for this phase (no new test command, no new dependency).
- **Non-destructive**: this milestone must not change application runtime behavior beyond tests/tooling/CI — **this phase is an exception by explicit ROADMAP mandate**: it is UI copy + one new route, which IS a (documented, audit-driven) runtime behavior change. Confirm with the user/CONTEXT.md if literal interpretation conflicts; CONTEXT.md's own Phase Boundary explicitly scopes this change, so treat CONTEXT.md as the authoritative, more specific instruction for this phase.
- **GSD workflow enforcement**: all file edits for this phase must go through `/gsd-execute-phase`, not direct edits — noted for the planner/executor, not actionable in research.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Post-verify landing page (new route + copy) | Browser / Client (React Router) | — | Pure client-side routing/rendering; no data fetch, no auth check, no server round-trip beyond the verify mutation already in flight |
| `/pending` retitle (copy only) | Browser / Client | — | Existing component, existing `useAuth` read; only the rendered strings change |
| Invited-path success copy (`Register.jsx`) | Browser / Client | — | Local component state (`result`) already holds what's needed; no new data |
| Invitation email + verification email templates | API / Backend (mailer service) | — | `mailer.js` is a backend service module; string templates rendered server-side before SMTP send. No DB, no resolver change — it's called by existing resolvers unchanged |
| Composed routing test | Browser / Client (test harness) | — | RTL + MemoryRouter exercises client-side route transitions only; `graphqlRequest` is mocked at the network boundary, so the backend tier is out of scope for this specific test |

**Why this matters for planning:** every task in this phase is single-tier (frontend-only or backend-mailer-only); there is no task that needs to coordinate a schema/resolver change with a frontend change, which is unusual for this codebase's typical phase shape (see STATE.md's backend-before-frontend build-order convention) and should simplify wave sequencing — frontend and mailer work can proceed in parallel waves with no shared dependency.

## Standard Stack

No new libraries are introduced by this phase. All work reuses the existing, already-installed stack.

### Core (existing, reused)

| Library | Version (from package.json) | Purpose | Why Standard (for this phase) |
|---------|---------|---------|--------------|
| react-router-dom | ^6.28.2 | Client routing — new public `<Route>`, `Link`/`RouterLink` footer navigation | Already the app's sole router; D-01 requires a plain route, not a redirect |
| @mui/material | ^6.3.1 | `AuthShell`'s `Paper`/`Stack`/`Typography`/`Alert`/`Link` primitives | Every existing auth page uses these; D-05/D-06/D-07 explicitly require the same `AuthShell` chrome |
| vitest | ^4.1.10 (both workspaces) | Test runner for the composed test and mailer test updates | Confirmed identical version in both `frontend/package.json` and `backend/package.json` |
| @testing-library/react | ^16.3.2 | `render`/`screen`/`waitFor` for the composed test | Matches `VerifyEmail.test.jsx`'s existing harness exactly |
| nodemailer | (see `backend/package.json`) | Underlying transport for `mailer.js`'s `sendMail` | Unchanged; `jsonTransport` mode used in tests, confirmed at `mailer.js:14` |

**Installation:** None required — no `npm install` step in this phase.

**Version verification:** Both `vitest` entries were read directly from `frontend/package.json:41` and `backend/package.json:37` — both pin `^4.1.10`. `react-router-dom` at `frontend/package.json:30` pins `^6.28.2`. These are pre-existing project dependencies, not new additions; no registry lookup needed since nothing is being installed.

### Alternatives Considered

None — this phase's CONTEXT.md already locked the implementation shape (D-01 through D-13); there is no library-selection decision to make.

## Package Legitimacy Audit

**Not applicable.** This phase installs zero new packages. Every dependency used (`react-router-dom`, `@mui/material`, `vitest`, `@testing-library/react`, `nodemailer`) is already present in `package-lock.json` and was installed in prior phases. The Package Legitimacy Gate protocol is skipped per its own scope ("Every phase that installs external packages...").

## Architecture Patterns

### System Architecture Diagram

```
Self-registrant clicks emailed link
        │
        ▼
GET /verify-email?token=xyz  (React Router, public route)
        │
        ▼
VerifyEmail.jsx useEffect fires once on mount
        │
        ▼
useAuth().verifyEmail(token)
        │
        ▼
graphqlRequest(VERIFY_EMAIL_MUTATION) ──► POST /graphql ──► verifyEmail resolver
        │                                                         │
        │                                                         ▼
        │                                          Atomic UPDATE consumes token
        │                                          (single-use; re-fire throws)
        │                                                         │
        │◄────────────────── { token, user: { status, ... } } ────┘
        ▼
AuthContext.verifyEmail: status !== 'Active'?
        │                                   │
        │ NO (Active)                       │ YES (Pending/etc.)
        ▼                                   ▼
  localStorage.authToken SET          localStorage UNTOUCHED
  setUser(user)                       (no session established)
        │                                   │
        ▼                                   ▼
  navigate('/dashboard')             navigate('/awaiting-approval')  ◄── D-01 change
        │                                   │  (was: navigate('/pending'), the W-1 bug)
        ▼                                   ▼
  ProtectedRoute renders Dashboard   AwaitingApproval.jsx renders
  (session present, familyMemberId   (no useAuth call; renders
   check may still route to          identically with/without
   /pending if unlinked)             session, survives refresh)
                                            │
                                            ▼
                                    "Return to sign in" link
                                    (AuthShell footer, matches
                                     VerifyEmail.jsx:37-43)

Separately, unrelated to the above flow:
ProtectedRoute.jsx:17 (signed-in, no familyMemberId, non-ADMIN)
        │
        ▼
  navigate('/pending')  ── unchanged ──► Pending.jsx (D-03: one job,
                                          retitled per D-07, !user
                                          bounce to /login untouched)
```

### Recommended Project Structure

No new directories. One new file in the existing flat `pages/` directory:

```
frontend/src/
├── pages/
│   ├── VerifyEmail.jsx           # MODIFY: line 25 navigate target
│   ├── VerifyEmail.test.jsx       # MODIFY: line 65 assertion destination
│   ├── AwaitingApproval.jsx       # NEW: D-01 landing page
│   ├── AwaitingApproval.test.jsx  # NEW (optional, planner's discretion per D-13 note)
│   ├── Pending.jsx                # MODIFY: title/body copy only
│   ├── Pending.test.jsx           # MODIFY: copy assertions only (5 cases, behavior unchanged)
│   ├── Register.jsx               # MODIFY: lines 310-313 invited success paragraph
│   └── verifyLanding.composed.test.jsx  # NEW (or extend VerifyEmail.test.jsx — planner's discretion)
├── App.jsx                        # MODIFY: register new public <Route path="awaiting-approval">
└── components/
    └── AuthShell.jsx              # UNCHANGED — reused as-is

backend/src/services/
├── mailer.js                      # MODIFY: sendInvitationEmail (~149, ~160), sendVerificationEmail (~169, ~172)
└── mailer.test.js                 # MODIFY: extend sendInvitationEmail describe (~133); ADD sendVerificationEmail describe (currently absent)
```

### Pattern 1: Stateless AuthShell page with a single footer link

**What:** A page component that takes no props, calls no hooks beyond none (or only React's own, none needed here), and renders `AuthShell` with static `eyebrow`/`title`/children/`footer`.

**When to use:** Any auth-adjacent page that must render identically regardless of session state or route history — exactly D-02's requirement for the new landing page.

**Example (adapted from the exact pattern at `VerifyEmail.jsx:33-53`, which itself has zero session dependency in its rendered chrome):**
```jsx
// Source: frontend/src/pages/VerifyEmail.jsx:33-53 (existing pattern, footer verbatim per D-06)
import { Alert, Box, Link, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import AuthShell from '../components/AuthShell.jsx';

export default function AwaitingApproval() {
  return (
    <AuthShell
      eyebrow="Almost there"
      title="Your email is verified"
      footer={
        <Typography variant="body2" color="text.secondary">
          <Link component={RouterLink} to="/login">
            Return to sign in
          </Link>
        </Typography>
      }
    >
      <Box>
        <Typography sx={{ mb: 1.5 }}>
          Thanks — your email address is verified. An administrator now reviews your
          request to join the family.
        </Typography>
        <Typography color="text.secondary">
          You'll get an email as soon as you're approved, and you can sign in from there.
        </Typography>
      </Box>
    </AuthShell>
  );
}
```
Note: no `useAuth`, no `useEffect`, no `useNavigate`, no `useSearchParams` — this is what makes the page D-02-compliant (renders the same on a cold direct hit, a refresh, or arriving from `VerifyEmail`'s `navigate()`).

### Pattern 2: Public route registration alongside sibling auth routes

**What:** Adding a new top-level, unauthenticated `<Route>` inside the same `<Route element={<AppLayout />}>` block that already contains `login`/`register`/`verify-email`/`pending` — NOT inside the `<ProtectedRoute>` block.

**Example (exact insertion point, `App.jsx:26-27`):**
```jsx
// Source: frontend/src/App.jsx:20-27 (existing block; insert alongside pending)
<Route path="verify-email" element={<VerifyEmail />} />
<Route path="pending" element={<Pending />} />
<Route path="awaiting-approval" element={<AwaitingApproval />} />  {/* NEW */}
```
Import added at the top alongside the other page imports (`App.jsx:5-15`), same alphabetized-by-nothing-in-particular convention already visible (imports are not alphabetized in this file — `Dashboard, DetailPage, FamilyTreePage, ForgotPassword, Login, InvitationsPage, LinkAccountsPage, ManagePage, Pending, Register, ResetPassword, VerifyEmail` — insert `AwaitingApproval` anywhere consistent with existing style, e.g. immediately after the import block's first line).

### Pattern 3: Composed multi-route test with a real `AuthProvider`

**What:** `VerifyEmail.test.jsx` is the ONLY existing frontend test file that mounts real `<Routes>` inside a real `AuthProvider` (confirmed via `grep -l "AuthProvider" $(grep -l "Routes" frontend/src/**/*.test.jsx)` — exactly one hit). `Pending.test.jsx` mocks `useAuth` entirely via `vi.mock('../context/AuthContext.jsx', ...)` and never uses `AuthProvider`. The composed test needs the REAL provider (per D-11) because it must prove `localStorage`'s `authToken` state end-to-end, which a mocked `useAuth` cannot do.

**Example (D-11's exact shape — `VerifyEmail.test.jsx`'s current harness with the `useNavigate` mock removed and more routes added):**
```jsx
// Source: adapted from frontend/src/pages/VerifyEmail.test.jsx:1-35 (existing harness)
// KEY DIFFERENCE from VerifyEmail.test.jsx: NO `vi.mock('react-router-dom', ...)` /
// NO navigateSpy — real react-router-dom drives real navigation through real <Route>s.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.jsx';
import VerifyEmail from './VerifyEmail.jsx';
import AwaitingApproval from './AwaitingApproval.jsx';
import Pending from './Pending.jsx';
import Login from './Login.jsx';

vi.mock('../api/graphqlClient.js', () => ({ graphqlRequest: vi.fn() }));
import { graphqlRequest } from '../api/graphqlClient.js';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

function renderApp(initialEntries) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/awaiting-approval" element={<AwaitingApproval />} />
          <Route path="/pending" element={<Pending />} />
          <Route path="/login" element={<Login />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

describe('verify -> landing composed flow (W-1)', () => {
  it('lands a Pending verifier on the awaiting-approval page with no session, never the login form', async () => {
    graphqlRequest.mockResolvedValueOnce({
      verifyEmail: { token: 'tok', user: { id: 5, name: 'Caleb', email: 'c@x.com', role: 'USER', status: 'Pending' } }
    });

    renderApp(['/verify-email?token=abc']);

    // Assert on rendered copy, not a navigate() spy -- real routing, not a mock.
    await waitFor(() => expect(screen.getByText(/your email is verified/i)).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: /sign in to agne/i })).not.toBeInTheDocument();
    expect(localStorage.getItem('authToken')).toBeNull();
  });
});
```
`Login.jsx`'s title renders as an MUI `Typography variant="h4"` (`AuthShell.jsx:32-34`), which MUI maps to an actual `<h4>` DOM element by default — so `getByRole('heading', {...})`/`queryByRole('heading', {...})` reliably targets it without a test-id.

### Anti-Patterns to Avoid

- **Reaching for `navigate(path, { state })` to pass the landing page anything:** react-router's location `state` does not survive a hard refresh (`MemoryRouter`/`BrowserRouter` both lose it on remount) — this is the exact mechanism D-01's rationale rejects for `/pending`. Do not resurrect it for the new route either.
- **Adding a `?verified=true` query flag to `/pending` instead of a new route:** explicitly rejected by D-03 ("Do not add a query flag or route-state branch to `Pending.jsx`").
- **Rendering `App.jsx` in full for the composed test:** explicitly rejected by D-11 (drags in `AppLayout`/nav; no existing App-level test to copy) — mount only the four routes needed.
- **Testing `sendVerificationEmail`'s new copy by asserting on `sendVerificationEmail.mock.calls[...]` in resolver test files:** every resolver test that references `sendVerificationEmail` (`register.test.js`, `updateUser.test.js`, `resendVerificationEmail.test.js`, `publicRegistrationSwitch.test.js`, `security.boundaries.test.js`) mocks the entire `mailer.js` module and asserts only on call *arguments* (`to`, `token`), never on rendered template text — confirmed via `grep -n "sendVerificationEmail" backend/src/resolvers/*.test.js`. None of these need updating for D-09; only `mailer.test.js` (which calls the real, unmocked function and parses its rendered output) can see the template string change. Do not touch the resolver test files for this phase's mailer copy edits.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Detecting whether the login form rendered in the composed test | A custom DOM query / manual `container.querySelector` | `screen.getByRole('heading', {name: ...})` / `screen.queryByRole(...)` | RTL's role-based queries are already the project convention (`VerifyEmail.test.jsx:83,86`, `Pending.test.jsx` throughout); MUI's `Typography variant="h4"` already renders a real `<h4>`, no extra markup needed |
| Escaping user-controlled or dynamic values inside the mailer HTML templates | A new escaping helper | `backend/src/utils/escapeHtml.js`'s existing `escapeHtml()` | Already imported and used throughout `mailer.js` (`sendPasswordResetEmail`, `sendAccountRejectedEmail`, `sendPendingRegistrationEmail`, `sendInvitationEmail`, `sendRegistrationAttemptEmail`); the D-08/D-09 edits are to STATIC strings with no interpolated user input, so no new escaping call is even needed — but if the planner's chosen wording interpolates anything, reuse this helper, never inline a replace |

**Key insight:** This phase's entire footprint is static-string edits and one new zero-logic component. There is no non-trivial problem in this phase that has a "don't hand-roll" temptation — the risk is the opposite: over-engineering a stateless page with unneeded hooks/props (explicitly forbidden by D-02).

## Common Pitfalls

### Pitfall 1: Forgetting the token is single-use when writing/reasoning about the composed test

**What goes wrong:** A test (or a manual QA click) that calls `verifyEmail` twice with the same token expects the second call to also succeed, or expects a refresh of `/verify-email?token=X` to re-render the same success state.
**Why it happens:** The UI's `VerifyEmail.jsx` shows no indication that the token was just consumed; the failure only surfaces via the resolver's `The email verification token is invalid or has expired.` error, which reads identically to an actually-expired token.
**How to avoid:** In the composed test, each `it()` block should use a fresh `graphqlRequest.mockResolvedValueOnce(...)` and never assume `verifyEmail` can be called a second time against the same mocked response. When writing D-13 item 3 ("landing renders with no session on a direct hit"), assert `graphqlRequest` was **never called** (a direct hit on `/awaiting-approval` does not re-run `VerifyEmail`'s effect) — this is the property that proves the page is refresh-safe.
**Warning signs:** A test that expects two successful `verifyEmail` calls from the same setup, or a manual repro that clicks the emailed link twice and is surprised by the second error.

### Pitfall 2: Updating `Pending.jsx`'s copy but missing that `Pending.test.jsx`'s APPR-06 regression test's *purpose* (not just its string) must survive

**What goes wrong:** `Pending.test.jsx:41-55`'s test exists specifically because `AuthContext`'s `ME_QUERY` selects only `id/name/email/role/familyMemberId` — nothing in `user` distinguishes a self-registered account from an invited one, so `Pending.jsx` needs no code change to serve both. If the D-07 retitle is done carelessly (e.g., by adding a conditional that tries to distinguish self-registered vs. invited users), it would violate this documented invariant and likely break silently since the mock data in both tests is nearly identical.
**Why it happens:** The urge to "make the copy more accurate per-path" collides with the fact that `Pending.jsx` structurally cannot know which path a user came from.
**How to avoid:** Keep `Pending.jsx`'s copy a single, unconditional string (as it is today) — just reword it. Do not add a second code path.
**Warning signs:** A diff to `Pending.jsx` that adds new props, a new conditional render branch, or a new field read from `user`.

### Pitfall 3: Editing `Register.jsx`'s self-registration success copy (lines ~211-215) instead of the invited-path copy (lines 310-313)

**What goes wrong:** Both success states live in the same file and say similar things ("an administrator reviews/approves your account"). The self-registration one (line 213, REG-04) is CORRECT and must stay — only the invited-path one (lines 310-313, INVITE-03/W-2) is stale and needs to change.
**Why it happens:** Both paragraphs use near-identical phrasing ("an administrator reviews your request" vs. "an administrator will review and approve your account"), and both are inside the same 344-line component; a careless `sed`/find-replace across the whole file could catch both.
**How to avoid:** Edit only the `if (!token) { ... }` branch is UNTOUCHED (self-reg, ~line 167-289); edit only the `return (...)` block after line 291 (the invited/`token` branch, lines 305-314).
**Warning signs:** `Register.test.jsx` (which pins the tokenless `SUCCESS_MESSAGE` at line 27) going red — that test asserting on `data.register.message` (a server string, D-10 locked) would not itself detect a client-copy mistake, but any new/updated client-copy assertion in `Register.test.jsx` for the SELF-registration success paragraph should stay byte-identical.

### Pitfall 4: A killed backend Vitest run wedging the local MariaDB test database mid-phase

**What goes wrong:** Running `npm test --workspaces` (or `npm test -w backend`) and interrupting it (Ctrl-C, tool timeout, SIGKILL) mid-`resetTables`/`globalSetup` can leave a `TRUNCATE`/`sync({force:true})` DROP holding a MariaDB metadata lock that a plain `KILL <id>` cannot clear. Every subsequent test run then hangs silently right after the `RUN v4.x` banner with near-zero CPU, looking exactly like a new code-level deadlock.
**Why it happens:** `backend/vitest.config.js` sets `globalSetup: ['./test/globalSetup.js']`, which calls `sequelize.sync({ force: true, match: /_test$/ })` — a DROP TABLE — at the start of every full-suite run; a killed run's orphaned connection can be stuck inside an uninterruptible TRUNCATE.
**How to avoid:** For this phase specifically the risk is low (no backend resolver/schema changes, `mailer.test.js` needs no DB at all since `nodeEnv: 'test'` forces `jsonTransport`), but the SC-5 gate (`npm test --workspaces` green) still requires one full backend run at the end. Never background a full-suite run and start another concurrently against the same `_test` database; never Ctrl-C a run mid-flight if avoidable — let it finish or fail naturally.
**Warning signs:** `npm test -w backend` hangs with zero output after the initial banner for longer than the suite's normal ~1-7 minutes. If it happens: connect and run `SHOW FULL PROCESSLIST`, look for `State="Waiting for table metadata lock"`; the fix ladder is `brew services stop mariadb` → `pkill -f mariadbd-safe` → `kill -TERM <pid>` (then `-9` if needed) → `brew services start mariadb` — plain `KILL <id>` alone is usually insufficient. *(Project memory: `mariadb-wedged-by-killed-vitest`.)*

## Code Examples

### Current `VerifyEmail.jsx:15-31` (the exact block to change)
```jsx
// Source: frontend/src/pages/VerifyEmail.jsx:15-31 (current)
useEffect(() => {
  if (!token) {
    setError('Missing verification token.');
    setLoading(false);
    return;
  }
  verifyEmail(token)
    .then((user) => {
      // Email verified, but the account may still be awaiting admin approval
      // (two-gate flow) — route there instead of the dashboard.
      navigate(user && user.status && user.status !== 'Active' ? '/pending' : '/dashboard');
    })
    .catch((err) => {
      setError(err.message);
      setLoading(false);
    });
}, [token]);
```
**Only change needed:** `'/pending'` → `'/awaiting-approval'` (or the planner's chosen path name), plus updating the stale comment ("route there instead of the dashboard" — still true, just a different destination). The `user.status !== 'Active'` predicate is Claude's Discretion per CONTEXT.md — leave as-is unless tightening to `=== 'Pending'` with a comment explaining why (Rejected/Disabled accounts cannot reach `verifyEmail` today per the audit).

### Current `Pending.jsx` full file (10 lines of JSX to reword)
```jsx
// Source: frontend/src/pages/Pending.jsx (current, full file)
import { Navigate } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import { useAuth } from '../context/AuthContext.jsx';
import AuthShell from '../components/AuthShell.jsx';

export default function Pending() {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;
  if (user.familyMemberId || user.role === 'ADMIN') return <Navigate to="/dashboard" replace />;

  return (
    <AuthShell eyebrow="Almost there" title="Waiting for admin approval">
      <Box>
        <Typography>
          Your account is awaiting an admin to link you to your family member; you'll get access once linked.
        </Typography>
      </Box>
    </AuthShell>
  );
}
```
**D-07 requires changing only:** the `title` prop string ("Waiting for admin approval" → something like "Waiting to be linked to your family") and the body `Typography` text (the existing text is ALREADY about linking, not approval — it may need only the `title` prop changed, or minor wording to explicitly say "approved" so it's clear this state is post-approval). All three `if`/`return`/`Navigate` lines stay byte-identical — this is purely a copy edit.

### Current `Register.jsx:305-314` (the invited-path success block — the ONLY part of this file that changes)
```jsx
// Source: frontend/src/pages/Register.jsx:305-314 (current)
{result ? (
  <>
    <Alert severity="success">{result.message}</Alert>
    <Typography variant="body2" color="text.secondary">
      We&apos;ve sent a verification link to your email. After you verify, an administrator will review and
      approve your account before you can sign in.
    </Typography>
  </>
) : (
```
**D-08 requires:** replacing the second `<Typography>`'s text with something like "We've sent a verification link to your email. Verify it and you can sign in right away — no additional review needed." `result.message` (line 307) itself is the server's `TOKENLESS_REGISTER_MESSAGE`-equivalent invited-branch string at `user.resolver.js:285` — that is D-10-locked and NOT edited by this phase; only the client-authored paragraph below it changes.

### Current `mailer.js:143-179` (both templates that change)
```js
// Source: backend/src/services/mailer.js:143-164 (sendInvitationEmail, current)
export async function sendInvitationEmail({ to, url, inviterName, invitedName, relationship, note }) {
  const greeting = invitedName ? `Hi ${invitedName},` : 'Hello,';
  const from = inviterName ? `${inviterName} has invited you` : 'You have been invited';
  const rel = relationship ? ` as their ${relationship}` : '';
  const subject = 'You are invited to join the family';
  const noteLine = note ? `\n\nA note from ${inviterName || 'the inviter'}: ${note}` : '';
  const text = `${greeting}\n\n${from}${rel} to join the family platform.\n\nRegister here (this link expires soon and can be used once):\n${url}${noteLine}\n\nAfter you register, an administrator will review and approve your account before you can sign in.`;
  // ...
  const html = renderHtml({
    heading: 'You are invited to join the family',
    intro: `${fromHtml}${relHtml} to join the family platform. Use the button below to register — the link can be used once and expires soon.${note ? `<br /><br /><em>Note: ${escapeHtml(note)}</em>` : ''}`,
    ctaLabel: 'Register your account',
    ctaUrl: url,
    note: 'After registering, an administrator reviews and approves your account before you can sign in.'
  });
  return sendMail({ to, subject, text, html });
}
```
**D-08 requires:** the trailing sentence in `text` (currently `"After you register, an administrator will review and approve your account before you can sign in."`) and the `note` field of `renderHtml`'s options (currently `"After registering, an administrator reviews and approves your account before you can sign in."`) both change to the SAME "verify, then sign in" message, e.g. `"Verify your email and you'll be able to sign in right away — no additional review needed."` (exact wording is Claude's Discretion).

```js
// Source: backend/src/services/mailer.js:166-179 (sendVerificationEmail, current)
export async function sendVerificationEmail({ to, token }) {
  const link = `${env.clientUrl}/verify-email?token=${token}`;
  const subject = 'Verify your email';
  const text = `Welcome! Please verify your email address to activate your account.\n\nOpen this link to verify:\n${link}\n\nThis link expires in 24 hours. If you did not create this account, you can ignore this email.`;
  const html = renderHtml({
    heading: 'Verify your email',
    intro: 'Welcome! Please verify your email address to activate your account.',
    ctaLabel: 'Verify email',
    ctaUrl: link,
    note: 'This link expires in 24 hours. If you did not create this account, you can safely ignore this email.'
  });
  return sendMail({ to, subject, text, html });
}
```
**D-09 requires:** replacing `"Please verify your email address to activate your account."` (appears twice — once in `text`, once as `intro`) with a path-neutral line, e.g. `"Please confirm this is your email address."`. No other line in this function changes; the `heading`, `ctaLabel`, `note` (24h expiry line) all stay.

## State of the Art

Not applicable in the traditional sense (no external library/ecosystem shift). The relevant "old approach → current approach" is internal to this project:

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `/pending` served as the catch-all destination for BOTH "awaiting admin approval" and "awaiting family-member linking" | `/pending` serves ONLY "awaiting family-member linking" (D-03); a new `/awaiting-approval` route serves "awaiting admin approval" | This phase (35) | Two distinct account states now have two distinct, honestly-worded pages instead of one page whose title lied for half its audience |
| `verifyEmail`'s non-Active branch navigated to `/pending`, which then silently bounced a session-less visitor to `/login` with zero explanation (W-1) | Non-Active branch navigates to a stateless, session-free page that renders the same content regardless of auth state | This phase (35) | Closes the silent-bounce UX bug the v4.1 milestone audit flagged as W-1 |
| Invited-path copy (3 locations) still said "an administrator will review and approve" | Same 3 locations say "verify, then sign in" | This phase (35) | Closes W-2; matches INVITE-03's actual (Phase 31) auto-activation behavior |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The exact route path `/awaiting-approval` and component name `AwaitingApproval.jsx` are recommended (not just "working names") based on the existing kebab-case route / PascalCase component convention (`forgot-password`→`ForgotPassword.jsx`, `reset-password`→`ResetPassword.jsx`, `verify-email`→`VerifyEmail.jsx`, `link-accounts`→`LinkAccountsPage.jsx`). This is a naming-convention inference, not a verified CONTEXT.md instruction — CONTEXT.md explicitly leaves the exact name to Claude's Discretion. | Standard Stack / Architecture Patterns / Code Examples | Low — purely cosmetic if the planner picks a different name; every other finding in this research is written generically enough (referencing "the new route"/D-01) to survive a rename |
| A2 | The exact wording suggested for D-05 (landing page body), D-07 (Pending retitle), D-08 (invited-path sentence), and D-09 (neutral verification line) in the Code Examples section are illustrative drafts, not locked copy — CONTEXT.md explicitly delegates exact wording to Claude's Discretion at plan/execution time. | Code Examples | Low — these are example strings meant to demonstrate the shape of the edit, not to be copy-pasted verbatim without review |
| A3 | `InvitePage.jsx:107` ("An administrator approves every new account before it becomes active.") is stale copy shown to the ADMIN composing an invitation (not the invitee) — found during the exhaustive "approval"/"approve" grep sweep (research step 12) but is OUTSIDE CONTEXT.md's explicit "Touches" list (`VerifyEmail.jsx`, `Pending.jsx`, `Register.jsx`, `App.jsx`, new page, `mailer.js`). Flagged as an Open Question below rather than folded into the recommended diff, since CONTEXT.md's Phase Boundary is authoritative on scope and the planner/user should decide whether to fold it in or leave it for a future phase. | Open Questions | Medium — if left unaddressed, an admin composing an invitation still sees stale copy about a review step that INVITE-03 already removed; this is arguably a third instance of W-2's underlying problem that CONTEXT.md's audit-sourced touch list simply didn't enumerate (it's admin-facing, not invitee-facing, so it may have been deliberately excluded) |

**If this table is empty:** N/A — see rows above.

## Open Questions

1. **Is `InvitePage.jsx:107`'s stale "administrator approves every new account" copy in scope for this phase?**
   - What we know: `frontend/src/pages/InvitePage.jsx:106-109` (rendered inside `InvitationsPage.jsx` for admins composing a new invitation) states "We'll email them a single-use registration link. An administrator approves every new account before it becomes active." This is factually stale post-Phase-31 (INVITE-03: invited accounts auto-activate on verify, no approval step) — the same class of stale promise as W-2, just shown to the ADMIN sender rather than the invitee recipient.
   - What's unclear: CONTEXT.md's Phase Boundary and "Touches" list do not mention `InvitePage.jsx`, and the phase's Origin section (`.planning/v4.1-MILESTONE-AUDIT.md` W-2) is framed entirely around what the INVITEE is told, not what the ADMIN sees when creating the invitation. It's plausible this was deliberately scoped out (admin-facing, lower harm — an admin who has read Phase 31's ROADMAP already knows the real behavior) or plausible it was simply missed by the audit's grep, which likely searched invitee-facing surfaces.
   - Recommendation: Surface this to the user/planner explicitly before finalizing the plan. If out of scope, it costs nothing to leave as a noted `tech_debt` item (matching this project's established pattern of tracking such items in STATE.md/audit frontmatter) for a future phase. If in scope, it's a one-line, zero-risk addition (no test currently pins this string — confirmed via `grep -rn "administrator approves every new account" frontend/src` returning only the source line, no test file) that would fully close the "nobody is told to expect a review that doesn't exist" spirit of SC-3.

2. **Should the composed test file be new or an extension of `VerifyEmail.test.jsx`?**
   - What we know: D-11 describes the harness as "`VerifyEmail.test.jsx`'s harness minus the `useNavigate` stub" but CONTEXT.md's Claude's Discretion section explicitly leaves file placement open, noting two options: a new file (e.g., `verifyLanding.composed.test.jsx`) or extending `VerifyEmail.test.jsx` itself.
   - What's unclear: Extending `VerifyEmail.test.jsx` in place would require removing its existing `vi.mock('react-router-dom', ...)`/`navigateSpy` for the new composed tests while KEEPING it for the file's four existing unit tests (which rely on the spy) — those two test styles cannot share one `vi.mock` call within a single file (a mock is file-scoped), so extending in place would actually require restructuring the existing spy-based tests to also use real routing, OR maintaining two different render helpers in one file.
   - Recommendation: A new file (`verifyLanding.composed.test.jsx` or similar) is the lower-risk choice — it avoids touching/risking the four already-passing `VerifyEmail.test.jsx` unit tests, and the two testing styles (isolated-with-navigate-spy vs. composed-with-real-router) are different enough in setup that co-locating them in one `describe` block would be confusing. This is a recommendation, not a re-litigation of CONTEXT.md's explicit discretion grant.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 18.x | All workspace scripts | ✓ (assumed per `.nvmrc`/`engines`; not independently re-verified this session — CLAUDE.md already documents this as pinned) | 18.x | — |
| Vitest (frontend) | Composed test, `Pending.test.jsx`/`VerifyEmail.test.jsx` updates | ✓ | ^4.1.10 | — |
| Vitest (backend) | `mailer.test.js` updates | ✓ | ^4.1.10 | — |
| MariaDB/MySQL test database | Full `npm test --workspaces` gate (SC-5) — NOT required for `mailer.test.js` itself (jsonTransport, no DB) | Not independently re-verified this session (prior phases, e.g. 34-09-SUMMARY.md, confirm it was running as of 2026-09-09); assumed available per this project's established local-dev setup | — | If unavailable: backend suite cannot run; frontend suite (all of this phase's core changes) can still run standalone via `npm test -w frontend` |

**Missing dependencies with no fallback:** None identified.

**Missing dependencies with fallback:** MariaDB test DB — if down, frontend-only verification (`npm test -w frontend`) still validates the bulk of this phase's changes (all frontend files + the composed test); only the mailer.js/mailer.test.js portion and the final SC-5 full-suite gate require it.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.10 (both `frontend` and `backend` workspaces) |
| Config file | `frontend/vitest.config.js` (jsdom, `setupFiles: ['./test/setup.js']`); `backend/vitest.config.js` (`globalSetup: ['./test/globalSetup.js']`, `pool: 'forks'`, `fileParallelism: false`) |
| Quick run command (single frontend file) | `cd frontend && npx vitest run src/pages/<File>.test.jsx` (confirmed pattern from `.planning/phases/33-*/33-01-PLAN.md:129,146`) |
| Quick run command (single backend file) | `cd backend && npx vitest run src/services/mailer.test.js` |
| Full suite command | `npm test --workspaces` (root `package.json:18`) — runs `vitest run` in both workspaces |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REG-04 (post-verify half) | Verified-but-Pending self-registrant sees the honest "verified, awaiting approval" landing (D-01/D-05) | unit + composed | `cd frontend && npx vitest run src/pages/AwaitingApproval.test.jsx` (if written) + `cd frontend && npx vitest run src/pages/verifyLanding.composed.test.jsx` (new file name TBD) | ❌ Wave 0 — new files |
| REG-06 (user-facing confirmation half) | Post-verify landing accurately reflects that the account entered the approval queue (D-05's "administrator now reviews your request") | composed | Same composed test as above | ❌ Wave 0 |
| INVITE-03 (copy half) | Invited-path success paragraph + invitation email no longer promise a review (D-08) | unit | `cd frontend && npx vitest run src/pages/Register.test.jsx` (existing file, needs new/updated assertion) + `cd backend && npx vitest run src/services/mailer.test.js` (existing file, `sendInvitationEmail` describe needs new assertions) | ⚠️ Files exist, assertions need to be added |
| SC-2 (defence in depth) | No-session `/pending` hit still bounces to `/login`; verified account still gets a real session | composed | Composed test, D-13 item 2 | ❌ Wave 0 |
| SC-4 | `/pending` copy no longer says "approval"; still says "linking" for an approved-unlinked user | unit | `cd frontend && npx vitest run src/pages/Pending.test.jsx` (existing file, all 5 assertions need copy updates, behavior assertions unchanged) | ✅ exists, needs edits not new coverage |

### Sampling Rate

- **Per task commit:** the single-file `npx vitest run <path>` command for whichever file(s) that task touched.
- **Per wave merge:** `cd frontend && npx vitest run` (full frontend suite) and, if `mailer.js` was touched in that wave, `cd backend && npx vitest run` (full backend suite — requires the MariaDB test DB per Environment Availability above).
- **Phase gate:** `npm test --workspaces` from the repo root, green, before `/gsd:verify-work` — matching the project's established SC-5-style gate (see `34-09-SUMMARY.md`'s "Ran `npm test --workspaces` from the repository root exactly once, in the foreground, to completion" pattern; also record before/after file+test counts against the pre-phase baseline, as Phase 34's closing plan did).

### Wave 0 Gaps

- [ ] `frontend/src/pages/AwaitingApproval.jsx` — does not exist yet; D-01's new page.
- [ ] `frontend/src/pages/AwaitingApproval.test.jsx` — optional unit test, planner's discretion per CONTEXT.md's final Claude's Discretion bullet.
- [ ] Composed test file (name TBD, e.g. `frontend/src/pages/verifyLanding.composed.test.jsx`) — does not exist yet; D-11/D-12/D-13's required red-first coverage.
- [ ] `backend/src/services/mailer.test.js` — `sendVerificationEmail` currently has **zero** test coverage at all (confirmed: it is imported nowhere in `mailer.test.js`'s import list). D-09's edit needs new assertions added from scratch, not just modified — this is a genuine coverage gap, not a copy-update.
- [ ] No framework install needed — Vitest/RTL already fully configured in both workspaces.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | This phase makes zero changes to authentication logic (`AuthContext.jsx` is explicitly locked/untouched, CONTEXT.md D-04) |
| V3 Session Management | No | The new page (D-02) deliberately has NO session interaction — it does not read, set, or check `localStorage`/`authToken` in any way |
| V4 Access Control | No | The new route is public by design (same tier as `login`/`register`/`verify-email`/`pending`); no new protected resource is introduced |
| V5 Input Validation | N/A | This phase introduces no new user input — the new page has zero form fields, zero query-param reads (D-02 explicitly forbids adding one) |
| V6 Cryptography | No | No token/crypto logic touched (the single-use token consumption logic in `user.resolver.js` is explicitly out of scope, resolver changes forbidden) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Reflected/stored XSS via mailer template interpolation | Tampering | Already mitigated project-wide by `escapeHtml()` (`backend/src/utils/escapeHtml.js`), used throughout `mailer.js`. This phase's D-08/D-09 edits are to STATIC strings with no new interpolated values, so no new XSS surface is introduced — but if the planner's exact wording ends up interpolating any dynamic value (e.g., a name), it MUST go through `escapeHtml()` per the existing pattern, never inline template-literal interpolation of untrusted data |
| Information leakage via differing UI states for existing vs. non-existing accounts | Information Disclosure | Not applicable here — the new landing page renders identically regardless of any account state (D-02); it is reached only via a successfully-consumed verification token, and the page itself performs no lookups |
| Token replay / stale-token confusion after landing on a "success" page that can be refreshed | Tampering / Repudiation | This IS the exact bug class D-01 fixes: the OLD behavior (`navigate('/pending')` losing route state on refresh, or worse, an inline success screen keeping the consumed `?token=` in the URL) risked a confusing "invalid token" error appearing after a real success. The NEW dedicated route has no token in its URL and performs no verification call, structurally eliminating replay-confusion at this specific point |

## Sources

### Primary (HIGH confidence — direct codebase reads, this session)
- `frontend/src/pages/VerifyEmail.jsx` (full file, 54 lines) — exact navigate call, AuthShell footer pattern
- `frontend/src/pages/Pending.jsx` (full file, 21 lines) — current title/body, `!user`/`familyMemberId` guards
- `frontend/src/context/AuthContext.jsx` (full file, 132 lines) — `verifyEmail` token-withholding logic (lines 75-84), locked per D-04
- `frontend/src/App.jsx` (full file, 45 lines) — full route table, public vs. protected structure
- `frontend/src/components/AuthShell.jsx` (full file, 52 lines) — `eyebrow`/`title`/`subtitle`/`footer`/`children` props
- `frontend/src/pages/Register.jsx` (full file, 344 lines) — self-reg success copy (~211-215) vs. invited-path stale copy (307-313)
- `frontend/src/pages/Login.jsx` (full file, 75 lines) — generic error-message rendering, confirms D-06's "harmless and consistent" claim
- `frontend/src/components/ProtectedRoute.jsx` (full file, 21 lines) — line 17's `/pending` redirect for unlinked non-admins
- `frontend/src/pages/InvitePage.jsx` (partial, lines 90-115) — admin-facing stale copy found via sweep (see Open Question 1)
- `backend/src/services/mailer.js` (full file, 199 lines) — `sendInvitationEmail` (143-164), `sendVerificationEmail` (166-179), `escapeHtml` usage throughout
- `backend/src/services/mailer.test.js` (full file, 164 lines) — confirms `sendVerificationEmail` has zero existing coverage; confirms `sendInvitationEmail`'s only content-assertion test (line 133+)
- `backend/src/resolvers/user.resolver.js` (targeted reads: 100-140, 380-390, 430-475) — `TOKENLESS_REGISTER_MESSAGE` (104, 285), pending-login error (383), verifyEmail's atomic single-use token consumption (441-466)
- `frontend/src/pages/VerifyEmail.test.jsx` (full file, 97 lines) — the exact harness D-11 reuses; line 65's assertion that needs updating
- `frontend/src/pages/Pending.test.jsx` (full file, 80 lines) — all 5 cases, mocked-`useAuth` pattern (does NOT use `AuthProvider`)
- `frontend/vitest.config.js`, `frontend/test/setup.js` — jsdom, `afterEach` cleanup (`localStorage.clear()`, `cleanup()`)
- `backend/vitest.config.js`, `backend/test/globalSetup.js` — `assertTestDatabase()`, `sync({force:true})`, `pool: 'forks'`, `fileParallelism: false`
- `frontend/package.json`, `backend/package.json`, root `package.json` — confirmed `vitest ^4.1.10` (both), `react-router-dom ^6.28.2`, `@testing-library/react ^16.3.2`, `jest-axe ^11.0.0`, `test: "vitest run"` / `test: "npm test --workspaces"` scripts
- `grep` sweep across `backend/src` + `frontend/src` for `approval|approve|activate your account|administrator will review` — enumerated every stale-copy occurrence (see Open Question 1 for the one finding outside CONTEXT.md's touch list)
- `grep` sweep confirming `sendVerificationEmail`/`sendInvitationEmail` are mocked-at-module-boundary (call-args-only) in every resolver test file that references them, isolating D-08/D-09's template-string edits from those tests
- `.planning/phases/34-open-registration-switch-quality-gate/34-CONTEXT.md` (D-13, D-14) and `34-01-SUMMARY.md` — mutation-testing recording format precedent
- `.planning/phases/33-public-signup-form-approval-queue/33-01-PLAN.md`, `33-01-SUMMARY.md` — single-file `npx vitest run` command precedent
- `/Users/bisrat/.claude/projects/-Users-bisrat-Projects-portofolio/memory/mariadb-wedged-by-killed-vitest.md` — project memory, 6 days old at research time, cited with its own staleness caveat

### Secondary (MEDIUM confidence)
None — this phase required no external/web research; it is entirely an internal codebase investigation per the phase's own explicit framing ("Focus research on the CODEBASE, not the web").

### Tertiary (LOW confidence)
None.

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — no new dependencies; all versions read directly from `package.json` files this session
- Architecture: HIGH — every touched file was read in full (not excerpted) and every locked behavior traced to its exact source line
- Pitfalls: HIGH — all four pitfalls are grounded in direct code reads (token single-use logic, mock-isolation grep, Register.jsx line-range confusion risk) or documented project memory (MariaDB), not speculation

**Research date:** 2026-09-09
**Valid until:** 2026-10-09 (30 days — this is an internal-codebase-only phase with no external dependency drift risk; the only staleness vector is if a concurrent phase touches the same files before this one executes, which the planner should re-check via `git log` immediately before planning)
