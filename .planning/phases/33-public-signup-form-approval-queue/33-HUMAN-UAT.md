---
status: partial
phase: 33-public-signup-form-approval-queue
source: [33-VERIFICATION.md, 33-VALIDATION.md]
started: 2026-09-08T12:20:00Z
updated: 2026-09-08T12:20:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Queue card density with long relationship notes

Both of these were scoped as manual-only in `33-VALIDATION.md` from the start — they are visual-density judgements jsdom cannot make. Everything else in the phase is covered by automated tests.

**Why this one needs a human:** D-08 locks the relationship note to render *in full* — no truncation, no expander, no scroll cap — which makes queue rows variable-height by design. The trade-off was accepted deliberately (the note is the only context an admin has to judge a stranger), but nobody has yet seen what a queue full of long notes actually looks like.

**Steps:** Seed roughly 10 accounts in `status: 'Pending'` with `emailVerified: true`, several carrying 400–500 character relationship notes and at least one with no note at all. Sign in as an ADMIN and open `/invitations` (`/approvals` redirects there).

expected: The queue still reads as scannable — you can find a specific person without excessive scrolling; long notes don't visually swamp the cards around them; the no-note card shows a plain "No note provided" rather than an empty gap; approve/reject stay easy to hit on every card.
result: [pending]

### 2. Signup form with four simultaneous inline errors

**Why this one needs a human:** D-04 validates client-side first across all four fields, so an empty submit marks all four touched at once. Four red messages inside one `AuthShell` card is the densest error state in the app, and whether it reads as helpful or as a wall of red is a visual judgement.

**Steps:** Open `/register` with no `?token=` and submit the form empty. Then fix the fields one at a time and watch the errors clear.

expected: The four inline errors read as guidance rather than alarm; each sits with its own field; errors are not duplicated in a top-of-form Alert; clearing a field removes only its own error.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
