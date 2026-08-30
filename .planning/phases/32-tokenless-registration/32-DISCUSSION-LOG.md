# Phase 32: Tokenless Registration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-30
**Phase:** 32-tokenless-registration
**Areas discussed:** Mutation shape, Relationship note storage, Enumeration-safe response, Approval queue visibility

---

## Mutation shape

| Option | Description | Selected |
|--------|-------------|----------|
| One register, optional token | Branch on token presence inside one resolver. Directly satisfies REG-07 — shared code is the same lines, not two callers of a helper. Cost: conditional arg validation GraphQL can't express. | ✓ |
| Separate selfRegister mutation | Every arg honestly non-null, invited path provably unchanged. Cost: two mutations to keep in sync, plus its own RATE_LIMITS entry. | |
| One register, input object | Room to grow without signature churn. Cost: breaking change to the frontend call site and every register test, for a shape used nowhere else. | |

**User's choice:** One register, optional token
**Notes:** REG-07's "no second, weaker implementation" was the deciding argument.

| Option | Description | Selected |
|--------|-------------|----------|
| Ignore email; invitation wins | On the invited branch `email` is never read; account created at `invitation.invitedEmail` as today. One regression test to write. Cost: a mismatched email silently yields an account at an address the caller didn't type. | ✓ |
| Refuse on mismatch | Surfaces a frontend bug loudly. Cost: new error path the UI can't produce, and the message weakly confirms what address an invitation was issued to. | |
| Refuse if email sent at all | Strictest, leaks nothing. Cost: brittle once Phase 33 builds one form payload for both paths. | |

**User's choice:** Ignore email; invitation wins
**Notes:** Raised because Phase 31 D-04/D-05 auto-activate invited registrants, so an overridable email would redirect an admin's vouch to an unapproved address. This is a privilege boundary, not validation.

| Option | Description | Selected |
|--------|-------------|----------|
| Ship open; deploy is the gate | No flag. Rate limit, Pending status, verification and approval are the protection; manual docker-deploy controls timing. | ✓ |
| Env flag, default off | Deploy safely mid-milestone, flip on when Phase 33 lands, doubles as a kill switch. Cost: config plumbing, a second path in every test, a flag to remember to delete. | |
| Ship open, land 32+33 together | Same end state as option 1, coupling made explicit. Cost: larger unreviewed delta on main, and it ties Phase 33's schedule to Phase 32's. | |

**User's choice:** Ship open; deploy is the gate
**Notes:** Asked because the app is live at agne.bisrat.ch and this phase opens a public mutation before any UI calls it.

---

## Relationship note storage

| Option | Description | Selected |
|--------|-------------|----------|
| New users column | Migration 020, nullable. Exactly the Phase 30 D-04 precedent. Cost: another manual migration; null for every invited account. | ✓ |
| Synthetic Invitation row | Reuses existing fields, pendingRegistrations works unchanged. Cost: Phase 31 D-05 auto-activates on the existence of an Invitation row — a synthetic one would auto-activate a self-registrant with nobody vouching. | |
| Separate registrations table | Keeps users narrow. Cost: a third place to look, a join per queue read, no precedent in the codebase. | |

**User's choice:** New users column
**Notes:** The synthetic-row option was flagged as actively dangerous — it recreates the exact CR-01 defect Phase 31 spent two gap-closure rounds fixing.

| Option | Description | Selected |
|--------|-------------|----------|
| VARCHAR(500) + explicit check | Readable GraphQL error from the resolver assertion, column type stops anything bypassing it. 500 chars scans well in a queue. | ✓ |
| TEXT + explicit check only | Matches invitationNote's shape, cap in one place. Cost: DB accepts 65KB from any path that skips the resolver. | |
| VARCHAR(280), tweet-length | Forces brevity for admins reading many. Cost: too tight to explain a real family connection, undermining the context REG-03 exists to provide. | |

**User's choice:** VARCHAR(500) + explicit check
**Notes:** Surfaced that `invitationNote` is TEXT with no validation at all today, so this cap is new work rather than a copy of an existing rule.

| Option | Description | Selected |
|--------|-------------|----------|
| Required, non-empty | REG-03 calls the note the only context an admin has; an empty one makes approval a coin flip. | |
| Optional | Lower friction; the admin can always reject. Cost: guarantees context-free rows in the queue. | ✓ |
| Optional now, required in Phase 33 | Client-side gate where the user types. Cost: a client-only rule is not a rule for a public mutation. | |

**User's choice:** Optional
**Notes:** Chosen against the stated recommendation. Recorded as D-06 with F-01 flagging that empty-note rows are now a guaranteed state the queue and Phase 33 UI must handle.

| Option | Description | Selected |
|--------|-------------|----------|
| escapeHtml helper, all of mailer.js | One helper, one rule, no per-field trust judgement. Also closes Phase 30's open WR-07. Cost: touches every template and its tests. | ✓ |
| Only the pending-registration email | Minimal, precisely scoped to SEC-03's wording. Cost: leaves WR-07 open and a half-escaped mailer. | |
| Strip HTML from the note on input | No mailer change needed. Cost: weaker half of the escape/validate pair, does nothing for `name`, mangles legitimate text. | |

**User's choice:** escapeHtml helper, all of mailer.js
**Notes:** Raised after finding mailer.js has no escaping anywhere and no escape helper exists. This phase makes both the note and the registrant's own name attacker-controlled and mails them to every admin.

---

## Enumeration-safe response

| Option | Description | Selected |
|--------|-------------|----------|
| Tokenless only | Tokenless branch always returns the same message; invited branch unchanged. Reaching the invited branch already requires a valid token, so it is not an equivalent oracle. | ✓ |
| Both paths silent | One rule for the whole mutation. Cost: real UX regression for an invitee who already has an account, and changes behaviour the phase didn't ask to change. | |
| Tokenless silent + generic invited error | Middle ground. Cost: an error that tells the user nothing actionable, and still changes tested invited-path behaviour. | |

**User's choice:** Tokenless only
**Notes:** SEC-01 scopes itself to "the public signup path".

| Option | Description | Selected |
|--------|-------------|----------|
| Always hash before branching | Both branches pay the same dominant bcrypt cost; a reordering, not new machinery. Cost: must not let beforeCreate double-hash. | ✓ |
| Accept the timing difference | Treat timing as out of scope; rate limit slows statistical attacks. Cost: ships a control defeated by measuring. | |
| Fixed-duration response | Covers timing from every source. Cost: a latency floor, a rotting constant, and a sleep in a resolver. | |

**User's choice:** Always hash before branching
**Notes:** Raised because the model's beforeCreate hook does the hashing, so the taken-email path runs no bcrypt at all — a ~100ms+ oracle that would defeat the identical message.

| Option | Description | Selected |
|--------|-------------|----------|
| Notify + password-reset pointer | Covers the common case of an owner who forgot they signed up. Fires only for addresses that have an account. | ✓ |
| Bare notice, no links | Smallest surface; attacker-triggered mail carries no clickable action. Cost: dead-end email for the common case. | |
| Notify only after verification | Minimises attacker-triggered mail. Cost: does not satisfy SEC-01, which says the owner is told someone tried. | |

**User's choice:** Notify + password-reset pointer

---

## Approval queue visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Add account-shaped query, leave old one | New pendingApprovals over users; pendingRegistrations untouched, still serving ApprovalsPage. Phase 33 swaps and deletes. Cost: two queue queries coexist for one phase. | ✓ |
| Rewrite pendingRegistrations account-shaped | One queue, no duplication. Cost: breaking schema change plus frontend cutover inside a mutation-focused phase; Phase 31 D-09/D-10 left ApprovalsPage for Phase 33 deliberately. | |
| Data only, no query this phase | Tightest scope. Cost: SC-3 would have no API-level surface to verify against. | |

**User's choice:** Add account-shaped query, leave old one

| Option | Description | Selected |
|--------|-------------|----------|
| After commit, fire-and-forget | Matches existing sendVerificationEmail/writeAuditLog shape. No email for a rolled-back verification; mail outage can't block verification. | ✓ |
| Inside the transaction, awaited | No possibility of a verified account no admin heard about. Cost: holds a transaction open across SMTP; a Resend outage blocks verification entirely. | |
| After commit, awaited | Deterministic ordering, no polling in tests. Cost: user waits on N sends; a mail failure surfaces as a verification error. | |

**User's choice:** After commit, fire-and-forget
**Notes:** Flagged as F-02 — this is the exact shape that caused Phase 30 WR-05 and the 31-05 post-merge failure. Tests must use vi.waitFor.

| Option | Description | Selected |
|--------|-------------|----------|
| Add emailVerified to this query | One-line where-clause fix aligning the notifier with the other admin checks. Cost: if every admin is unverified, nobody is notified. | ✓ |
| Leave it; note for a follow-up | Keeps the diff honest. Cost: leaves a known divergence in the helper this phase is extending. | |
| Unify all four admin definitions now | Closes WR-03 properly. Cost: 31-05 explicitly ruled this out — different query and locking shapes, risk of altering the last-administrator floor. | |

**User's choice:** Add emailVerified to this query
**Notes:** Surfaced during scouting; the notifier is the fourth divergent "admin" definition (Phase 31 WR-03).

---

## Claude's Discretion

- Exact column name for the note and the migration file slug.
- Wording of the tokenless success message, the owner-notification email, and the note-too-long error.
- Name and return shape of the new account-shaped query field.
- How `notifyAdminsOfPendingRegistration` is refactored to serve an invitation-less caller.
- Whether the silent taken-email path writes its own audit-log action; test-file placement.
- Whether `Register.jsx` / `REGISTER_MUTATION` change this phase or wait for Phase 33.

## Deferred Ideas

- Public signup form and rebuilt approval UI — Phase 33.
- Unifying all four "admin" definitions — Phase 31 WR-03 debt.
- CR-01, the pre-existing admin-bootstrap privilege escalation — wants its own phase.
- Pruning or expiring dead-end `Pending` registrations — Phase 31 F-04 / Phase 30 F-02.
- Requiring the relationship note — revisitable in Phase 33 if context-free rows prove unworkable.
