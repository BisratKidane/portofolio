# Phase 35: Post-Verify Landing & Invited-Path Copy - Context

**Gathered:** 2026-09-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Close the two integration warnings the v4.1 milestone audit left open, without touching any resolver, schema, or `AuthContext` behaviour:

- **W-1** — a self-registrant who clicks their verification link lands on an honest, session-free page that says their email is verified and an administrator now has to approve them, instead of being bounced silently through `/pending` to `/login`.
- **W-2** — nobody on the invited path (`/register?token=…` success state, the invitation email) is told to expect an admin review that Phase 31 removed; they are told they can sign in as soon as they verify.
- `/pending` is reworded so "waiting to be linked" no longer reads as "waiting for approval" (SC-4).
- One composed test covers verify → landing through real routing, which `VerifyEmail.test.jsx` and `Pending.test.jsx` each miss in isolation (SC-5). `npm test --workspaces` stays green.

Touches: `frontend/src/pages/VerifyEmail.jsx`, `frontend/src/pages/Pending.jsx`, `frontend/src/pages/Register.jsx`, `frontend/src/App.jsx`, one new page component + test, `backend/src/services/mailer.js` (two template strings) and its test. **No** changes to `backend/src/resolvers/*`, `backend/src/schemas/*`, or `frontend/src/context/AuthContext.jsx`.

Out of scope (from ROADMAP): CR-02 account pre-hijacking (v4.2), W-3 production migrations (operator step), W-4 status-blind link list.

</domain>

<decisions>
## Implementation Decisions

### Where the landing lives (SC-1, SC-2)

- **D-01:** The verified-but-Pending self-registrant lands on a **new, dedicated, stateless public route with its own page component** (working name `/awaiting-approval`; the planner may pick the exact path). `VerifyEmail.jsx:25` navigates non-Active users there instead of `/pending`; Active users still go to `/dashboard` exactly as today. Registered in `App.jsx` as a public `<Route>` alongside `verify-email` and `pending` — not under `ProtectedRoute`.

  **Why this shape:** it is the only option that survives a browser refresh. Inline-in-`VerifyEmail` was rejected because the URL would keep the consumed `?token=…`; a refresh re-fires `verifyEmail`, which throws `The email verification token is invalid or has expired.` (`user.resolver.js:445,466`) over a success the person just saw. `/pending` via `navigate(…, { state })` was rejected because route state dies on refresh and the person is back to the silent `/login` bounce — the exact W-1 symptom.

- **D-02:** The new page **has no `useAuth` dependency and never redirects**. It renders the same thing with or without a session, on a direct URL hit, and after refresh. It therefore cannot name the registrant's address (Phase 33 D-06's "name the address" pattern does not apply — there is no session and no query param carrying it; do not add one).

- **D-03:** `Pending.jsx` keeps **one job**: the signed-in, approved, still-unlinked user that `ProtectedRoute.jsx:17` sends there. Its `!user → /login` bounce at `Pending.jsx:9` stays **exactly as it is** — that bounce is correct for a no-session hit on `/pending` and is part of the defence in depth SC-2 asks for. Do not add a query flag or route-state branch to `Pending.jsx`.

- **D-04:** `AuthContext.jsx:75-84` (`verifyEmail` withholds the token for non-Active users) is **locked and untouched** (ROADMAP SC-2). The only routing change is the destination string in `VerifyEmail.jsx`.

### Landing + `/pending` copy (SC-1, SC-4)

- **D-05:** The awaiting-approval page states the **full remaining sequence**: your email is verified → an administrator now reviews your request → you'll get an email as soon as you're approved → then you can sign in. Promising the email is honest: APPR-03 already sends it on approval (`mailer.js` approval template), and `Register.jsx:213` promised the same sequence one step earlier. Same `AuthShell` chrome as the other auth pages.

- **D-06:** The page offers **exactly one action**: a "Return to sign in" link in the `AuthShell` footer, matching `VerifyEmail.jsx:37-43`. No buttons, no "contact us" line (no contact surface exists in the app). Signing in early just shows the existing server error `Your account is awaiting administrator approval.` (`user.resolver.js:383`) — harmless and consistent.

- **D-07:** `Pending.jsx` is **retitled to the linking state and the word "approval" is removed from it**. Title along the lines of "Waiting to be linked to your family"; body says the account is approved and an administrator still has to link them to their family member in the tree, with access as soon as that happens. The APPR-06 regression in `Pending.test.jsx:41` (approved, unlinked self-registrant sees the linking message) must keep passing; the other four `Pending.test.jsx` cases (dashboard redirects, `/login` bounce) are unchanged in behaviour and only their copy assertions move.

### Invited-path copy + the shared verification email (SC-3)

- **D-08:** The invited path says **"verify, then sign in" — the same message in all three places**: `Register.jsx:310-313` (invited success paragraph), `sendInvitationEmail` plain-text (`mailer.js:149`) and HTML `note` (`mailer.js:160`). No admin-review promise remains anywhere on the invited path. The explicit "your inviter already vouched for you" sentence was considered and dropped — the post-submit UI does not know the inviter without new plumbing. The `subtitle` at `Register.jsx:294` ("You've been invited — set up your Agne profile.") is already true and stays.

- **D-09:** The **shared `sendVerificationEmail` (`mailer.js:165-170`) is neutralised**, not made path-aware: drop "to activate your account" for a path-neutral confirmation line (e.g. "Please confirm this is your email address"). One string edit in each of the `text` and `intro` branches; **no signature change, no per-path flag, no branching**. This is the ROADMAP's "one mailer template" plus one honest sentence — it stays inside the phase goal (nobody is promised something that does not happen) without widening the mailer API or touching either `register` branch.

- **D-10:** The server's `register` success string `Registration received. Verify your email to activate your account.` (`user.resolver.js:104` `TOKENLESS_REGISTER_MESSAGE`, `:285` invited branch) is **DO NOT TOUCH**. Reasons: this phase makes no resolver changes; the string is pinned by the SEC-01 identical-message and rate-limit tests (`register.test.js:24`, `rateLimit.test.js:226`, `publicRegistrationSwitch.test.js:476`, `Register.test.jsx:27`); and it is only ever rendered verbatim on the invited path (`Register.jsx:307`), where it is true — Phase 33 D-06 already keeps it off the public path.

### Composed test (SC-5)

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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Origin of this phase
- `.planning/v4.1-MILESTONE-AUDIT.md` — §Integration Warnings W-1 and W-2 (the two findings this phase closes), §E2E Flows a and c, and the `tech_debt:` frontmatter listing which items are explicitly *not* absorbed here (CR-02, W-3, W-4).
- `.planning/ROADMAP.md` §Phase 35 — goal, five success criteria, out-of-scope list, "UI hint: yes".
- `.planning/REQUIREMENTS.md` — REG-04, REG-06, INVITE-03 (the requirements this phase completes the user-facing half of); §The two paths table (what each path is promised); §Out of Scope ("Changing the login gate, `/pending`, or `/link-accounts`" — this phase changes `/pending`'s *copy only*, not its behaviour).

### Locked decisions from earlier phases that constrain this one
- `.planning/phases/33-public-signup-form-approval-queue/33-CONTEXT.md` — D-05/D-06 (post-submit feedback pattern and the SEC-01 note that copy must never branch on whether an account exists); D-10 (there is one approval queue; invitees never reach it).
- `.planning/phases/34-open-registration-switch-quality-gate/34-CONTEXT.md` — D-13 (every new test mutation-tested, recorded with its result).
- `.planning/phases/31-invitations-become-admin-only/31-REVIEW.md` — CR-02 (the pre-existing two-gate routing finding that W-1 re-surfaced).
- `.planning/phases/32-tokenless-registration/32-CONTEXT.md` — D-08 (SEC-01 identical tokenless message — why D-10 leaves the server string alone), D-12 (admin notification fires after `verifyEmail` commits — unchanged by this phase).

### Reviewed, out of scope
- `.planning/todos/pending/20260903-cr02-account-pre-hijacking.md` — matched this phase at 0.6; ROADMAP places it in v4.2. Not folded.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/components/AuthShell.jsx` — `eyebrow`/`title`/`subtitle`/`footer`/`children` card used by every auth page; the new landing page and the reworded `Pending.jsx` both use it unchanged.
- `frontend/src/pages/VerifyEmail.jsx:37-43` — the "Return to sign in" `AuthShell` footer to copy verbatim for D-06.
- `frontend/src/pages/VerifyEmail.test.jsx:1-36` — `AuthProvider` + `MemoryRouter` + `vi.mock('../api/graphqlClient.js')` harness; the composed test is this file's harness with the `useNavigate` mock removed and more routes mounted (D-11).
- `frontend/src/pages/Pending.test.jsx` — five cases including the APPR-06 regression at `:41`; copy assertions move, behaviour assertions stay.
- `backend/src/services/mailer.test.js:133` — existing `sendInvitationEmail` describe block to extend for D-08.

### Established Patterns
- Auth pages are `export default function` components in `frontend/src/pages/`, PascalCase file names, one route each in `frontend/src/App.jsx:20-27` (public) — the new page follows this exactly.
- `Register.jsx` success states swap the form in place inside `AuthShell` (Phase 33 D-05); the invited-path paragraph at `:310-313` is the one being reworded.
- `mailer.js` templates keep a raw plain-text branch and an `escapeHtml`-ed HTML branch (Phase 32 D-07); both branches of `sendInvitationEmail` carry the stale promise (`:149`, `:160`) and both must change together.
- Frontend tests mock the network at `graphqlRequest` and never at component level; there is no App-level render test and no Playwright.
- TDD red-green with a recorded mutation step is the project norm for anything on the auth path (34-CONTEXT D-13; project memory).

### Integration Points
- `frontend/src/pages/VerifyEmail.jsx:25` — the single navigation target that changes (`'/pending'` → new route).
- `frontend/src/App.jsx:26-27` — where the new public `<Route>` is added next to `verify-email` / `pending`.
- `frontend/src/components/ProtectedRoute.jsx:17` — still routes approved-but-unlinked users to `/pending`; untouched, and the reason `Pending.jsx` keeps its one job.
- `frontend/src/context/AuthContext.jsx:75-84` — `verifyEmail` withholding the session for non-Active users; **locked, not modified** (SC-2).
- `backend/src/services/mailer.js:149,160` (`sendInvitationEmail`) and `:165-170` (`sendVerificationEmail`) — the only backend lines that change.

</code_context>

<specifics>
## Specific Ideas

- The landing must survive a refresh — that property, not minimal diff, decided D-01. The consumed-token error (`user.resolver.js:445,466`) is the failure it guards against.
- Two clear pages for two clear states: the new page = "verified, waiting for approval, no session"; `Pending.jsx` = "signed in, approved, waiting to be linked". Neither page branches on the other's state.
- The composed test's first run is the bug report: on today's code it must fail by rendering the login form.

</specifics>

<deferred>
## Deferred Ideas

- **Path-aware verification email** — passing a variant into `sendVerificationEmail` so invitees read "activate" and self-registrants read "then an administrator approves". Rejected for this phase in favour of D-09's neutral wording because it changes the mailer signature and both `register` branches (resolver touch). Revisit if the neutral line proves too vague in practice.
- **Login pending-error linking to the landing page** — when a Pending user attempts sign-in, the server error could point them at the new page. Left alone: APPR-05 locks the login gate and its messages, and the message is server-side.
- **Inviter-vouch sentence on the invited success state** — "X has already vouched for you" needs the inviter's name on the post-submit screen; not plumbed today.

### Reviewed Todos (not folded)
- **CR-02 — tokenless register enables account pre-hijacking** (`.planning/todos/pending/20260903-cr02-account-pre-hijacking.md`) — matched at 0.6 on keywords; ROADMAP explicitly scopes it to v4.2 as its own design decision (re-bind or invalidate the credential when ownership is proven at verify). Not folded; the todo stays open.

</deferred>

---

*Phase: 35-post-verify-landing-invited-path-copy*
*Context gathered: 2026-09-09*
