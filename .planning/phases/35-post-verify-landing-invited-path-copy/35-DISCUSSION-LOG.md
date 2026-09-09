# Phase 35: Post-Verify Landing & Invited-Path Copy - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-09
**Phase:** 35-post-verify-landing-invited-path-copy
**Areas discussed:** Where the landing lives, Landing + /pending copy, Invited copy + shared email, Composed test shape

---

## Where the landing lives

**Q1 — Where should the verified-but-Pending self-registrant land?**

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated stateless route | e.g. `/verified` or `/pending?verified=1`; refresh-safe, bookmarkable, `Pending.jsx:9` bounce untouched; cost: one new route | ✓ |
| Inline in VerifyEmail | Swap the "Verifying…" text in place; smallest change, but URL keeps the consumed `?token` — refresh re-fires `verifyEmail` and shows "token is invalid or has expired" | |
| /pending via route state | `navigate('/pending', { state: { justVerified: true } })`; no new route, but state dies on refresh → the W-1 symptom returns | |

**Q2 — Which stateless shape?**

| Option | Description | Selected |
|--------|-------------|----------|
| New route, own page | e.g. `/awaiting-approval` with a component that has no `useAuth` dependency; `Pending.jsx` keeps one job | ✓ |
| /pending?verified=1 | `Pending.jsx` reads a query flag and renders the awaiting-approval state before the `!user` check; one page, two states, guessable flag | |
| You decide | Planner picks under stateless / refresh-safe / no-session / bounce-preserved constraints | |

**User's choice:** Dedicated stateless route → new route with its own page.
**Notes:** Moved on after two questions — area resolved; edge cases (direct hits, non-Pending statuses, naming) left to Claude's discretion.

---

## Landing + /pending copy

**Q1 — What should the awaiting-approval page promise?**

| Option | Description | Selected |
|--------|-------------|----------|
| Verified → admin approves → you get an email | Names both the gate and the signal; APPR-03 already sends the approval email; matches `Register.jsx:213` | ✓ |
| Verified → admin approves, no email promise | Safer decoupling from the mailer, but leaves the person polling the login form | |
| You decide | Planner writes it within SC-1 | |

**Q2 — What action does the page offer?**

| Option | Description | Selected |
|--------|-------------|----------|
| Single "Return to sign in" link | Matches `VerifyEmail`'s `AuthShell` footer; early sign-in shows the existing pending error, harmless | ✓ |
| No action at all | Pure dead-end; people hit Back and re-click the consumed link | |
| Sign-in link + "didn't get an email?" note | No contact surface exists to point at | |

**Q3 — How should `Pending.jsx` read now that it serves only signed-in, approved, unlinked users?**

| Option | Description | Selected |
|--------|-------------|----------|
| Retitle to linking, drop "approval" | Title → "Waiting to be linked to your family"; body says approved, admin still has to link you | ✓ |
| Keep title, fix body only | Smaller diff but the title is the line that conflates the gates | |
| You decide | Planner rewrites within SC-4 | |

**User's choice:** Full sequence promised incl. approval email; one sign-in link; `Pending.jsx` retitled with "approval" removed.
**Notes:** Moved on after three questions.

---

## Invited copy + shared email

**Q1 — What should the invited path say after registering and in the invitation email?**

| Option | Description | Selected |
|--------|-------------|----------|
| "Verify, then sign in" — same message in all three places | `Register.jsx:310-313`, `mailer.js:149` text, `:160` html; one sentence of truth | ✓ |
| Mention the inviter's vouch explicitly | Explains INVITE-03's why, but the post-submit UI doesn't know the inviter | |
| You decide | Planner writes it under SC-3 | |

**Q2 — Touch the shared verification email ("to activate your account", `mailer.js:165-170`)?**

| Option | Description | Selected |
|--------|-------------|----------|
| Neutralise the shared wording | Path-neutral confirmation line; no signature change, no branching | ✓ |
| Make it path-aware | Flag into `sendVerificationEmail`; most honest but changes signature and both `register` branches (resolver touch) | |
| Leave it as scoped | Literal ROADMAP reading; landing corrects it a click later; note as tech debt | |

**Q3 — Server `register` success string (`user.resolver.js:104,285`)?**

| Option | Description | Selected |
|--------|-------------|----------|
| Next area — agree, leave the server string | Out of scope: no resolver changes, pinned by SEC-01/rate-limit tests, rendered verbatim only on the invited path where it is true | ✓ |
| More questions | | |

**User's choice:** "Verify, then sign in" everywhere on the invited path; neutralise the shared verification email; do not touch the server string.
**Notes:** Discovery during discussion — a third "activate your account" string lives in the resolver and is pinned by four tests; recorded as DO NOT TOUCH (D-10).

---

## Composed test shape

**Q1 — How should the verify → landing test be composed?**

| Option | Description | Selected |
|--------|-------------|----------|
| Real routes + real AuthProvider, mock only `graphqlRequest` | `VerifyEmail.test.jsx`'s harness minus the `useNavigate` stub, real routes mounted; red-first on today's bounce | ✓ |
| Render the full `App.jsx` | Real route table under test; heavier, no App-level test exists | |
| You decide | Planner picks under real-navigation / real-provider / network-mocked / red-first constraints | |

**Q2 — Which regressions should the composed file also pin? (multi-select)**

| Option | Description | Selected |
|--------|-------------|----------|
| Active user still lands on `/dashboard` with a session | Invited path through the same harness; `authToken` IS stored | (Claude) ✓ |
| No-signal `/pending` still bounces to `/login` | Pins `Pending.jsx:9` unchanged (SC-2) | (Claude) ✓ |
| Landing renders with no session on a direct hit | The refresh-safety property behind D-01 | (Claude) ✓ |
| Mutation-test each new assertion (Phase 34 D-13) | Revert `VerifyEmail.jsx:25` → red → restore, recorded with result | (Claude) ✓ |

**User's choice:** Real routes + real AuthProvider harness. Regression set: "No preference" — left to Claude, who included all four (cheap, matches D-13).

---

## Claude's Discretion

- Exact route path and component/file names (working names `/awaiting-approval`, `AwaitingApproval.jsx`).
- Exact wording of every string within the decisions' constraints.
- Whether `VerifyEmail.jsx:25`'s predicate stays `!== 'Active'` or tightens to `=== 'Pending'`.
- Composed test file placement; how `VerifyEmail.test.jsx:65` is updated; `mailer.test.js` assertions.
- Whether the landing page gets its own small unit test in addition to the composed coverage.
- Which regressions the composed file pins (user: no preference → all four).

## Deferred Ideas

- Path-aware verification email (variant flag into `sendVerificationEmail`) — rejected for this phase; revisit if the neutral line proves too vague.
- Login pending-error linking to the landing page — APPR-05 locks the login gate and its messages.
- Inviter-vouch sentence on the invited success state — inviter name not plumbed to the post-submit screen.
- CR-02 account pre-hijacking todo — matched at 0.6, ROADMAP scopes it to v4.2; reviewed, not folded.
