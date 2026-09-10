---
phase: 35-post-verify-landing-invited-path-copy
plan: 02
subsystem: auth
tags: [react, mui, mailer, nodemailer, vitest, copy]

# Dependency graph
requires:
  - phase: 31-invitations-become-admin-only
    provides: "invited-path auto-activation on verify (INVITE-03 behavior); this plan closes the user-facing copy gap left by that phase"
provides:
  - "Register.jsx invited-path success paragraph reworded to 'verify, then sign in right away' (D-08)"
  - "sendInvitationEmail text/html reworded to the same 'verify, then sign in right away' message (D-08)"
  - "sendVerificationEmail neutralised to a path-neutral 'confirm this is your email address' line (D-09), with brand-new test coverage where none existed before"
  - "D-10 boundary proven unbroken: TOKENLESS_REGISTER_MESSAGE server string and every resolver/schema/AuthContext file untouched"
affects: [35-03-quality-gate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Project-wide D-12 TDD rule applied across a source/test task split: wrote the Task 3 test assertions first against unmodified mailer.js (RED), then applied the Task 2 source edit (GREEN) -- two commits per behavior change even though the plan listed the tasks in source-then-test order"

key-files:
  created: []
  modified:
    - frontend/src/pages/Register.jsx
    - frontend/src/pages/Register.test.jsx
    - backend/src/services/mailer.js
    - backend/src/services/mailer.test.js

key-decisions:
  - "D-08/D-09/D-10 followed exactly as locked in 35-UI-SPEC.md -- no wording deviation"
  - "Task 2 (mailer.js source) and Task 3 (mailer.test.js coverage) were executed as test-first-then-source (D-12 red-first) rather than the plan's literal task order, to honor the project's blanket TDD requirement; file scope for each commit still matches the plan's per-task file boundaries"

patterns-established: []

requirements-completed: [INVITE-03]

# Metrics
duration: 10min
completed: 2026-09-09
---

# Phase 35 Plan 02: Invited-Path Copy & Shared Verification Email Summary

**Reworded the invited registration path's three stale "admin will review and approve" surfaces to an honest "verify, then sign in right away" message, and neutralised the shared verification-email template so it no longer claims "activate your account" on either registration path.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-09-09T20:04:00Z (approx, session start)
- **Completed:** 2026-09-09T20:14:14Z
- **Tasks:** 3 (Task 1 self-contained; Tasks 2+3 executed together as one RED/GREEN pair per D-12)
- **Files modified:** 4

## Accomplishments
- `Register.jsx`'s invited-branch success paragraph (lines 310-313) now reads "We've sent a verification link to your email. Verify it and you can sign in right away." -- zero review/approve wording remains
- `sendInvitationEmail`'s `text` trailing clause and `html` `note` field both now read "Once you register and verify your email, you can sign in right away." -- identical strings, zero review/approve wording
- `sendVerificationEmail`'s `text` opening sentence and `html` `intro` field are now path-neutral: "Welcome! Please confirm this is your email address." -- no signature change, no branching, no new parameter
- `sendVerificationEmail` went from **zero** test coverage to a dedicated `describe` block asserting the neutral copy and the absence of "activate your account"
- D-10 boundary proven unbroken by grep + `git diff --stat`: the server's `TOKENLESS_REGISTER_MESSAGE` (`backend/src/resolvers/user.resolver.js`) still appears exactly twice, byte-identical, and this plan's diff touches zero files under `backend/src/resolvers`, `backend/src/schemas`, or `frontend/src/context/AuthContext.jsx`
- Self-registration success paragraph (`Register.jsx` ~211-215) confirmed byte-identical (D-08 boundary)

## Task Commits

Each task was committed atomically, following the project's D-12 (red-first TDD) rule:

1. **Task 1: Reword Register.jsx's invited-path success paragraph (D-08) + regression test**
   - `57c43ce` (test) -- RED: new `it()` asserting the new copy + absence of review/approve; confirmed red (1 failed, 14 passed)
   - `f78b5e0` (feat) -- GREEN: reworded the Typography paragraph; confirmed green (15/15 passed)
2. **Tasks 2+3: Reword sendInvitationEmail (D-08) + sendVerificationEmail (D-09), with new/extended mailer.test.js coverage**
   - `600c090` (test) -- RED: extended `sendInvitationEmail` describe + brand-new `sendVerificationEmail` describe, written against the UNMODIFIED `mailer.js`; confirmed red (2 failed, 10 passed)
   - `63111d8` (feat) -- GREEN: reworded both functions' template strings; confirmed green (12/12 passed)

**Plan metadata:** (this commit, SUMMARY.md + REQUIREMENTS.md if applicable)

_Note: both behavior changes in this plan followed strict TDD (test commit before feat commit), per this project's D-12 rule and project memory ("TDD red-green-refactor, especially for anything on the auth path")._

## Files Created/Modified
- `frontend/src/pages/Register.jsx` -- invited-branch success paragraph reworded (D-08); self-registration paragraph untouched
- `frontend/src/pages/Register.test.jsx` -- new regression test pinning the D-08 copy and the absence of review/approve wording
- `backend/src/services/mailer.js` -- `sendInvitationEmail` (D-08) and `sendVerificationEmail` (D-09) template strings reworded; zero new interpolation, zero new `escapeHtml()` calls
- `backend/src/services/mailer.test.js` -- extended `sendInvitationEmail` describe with a new `it()`; added a brand-new `sendVerificationEmail` describe block (first-ever coverage for that function)

## Decisions Made
- Followed 35-UI-SPEC.md's locked copy verbatim for all three surfaces -- no wording deviation from the spec
- Executed the mailer.js source edit (Task 2) and its test coverage (Task 3) as a single red-then-green pair, writing the Task 3 assertions first against unmodified `mailer.js` to honor the project's blanket D-12 TDD requirement (assert new copy in the test first, observe RED, then change the source), even though the plan listed Task 2 (source) before Task 3 (tests). Each commit's file scope still matches the plan's declared per-task `<files>` boundaries (test commit touches only `mailer.test.js`, feat commit touches only `mailer.js`).

## Deviations from Plan

None - plan executed exactly as written. The only adjustment was execution *ordering* (test-then-source for Tasks 2+3, documented above under Decisions Made), not scope -- every file changed matches the plan's `files_modified` list exactly, and every string change matches 35-UI-SPEC.md's locked copy exactly.

## Issues Encountered

None.

## D-10 Boundary Verification (recorded per project rules)

- `grep -c "Verify it and you can sign in right away." frontend/src/pages/Register.jsx` -> `1`
- `grep -c "administrator will review and approve your account" frontend/src/pages/Register.jsx` -> `0`
- `grep -c "Once you verify your email, an administrator reviews your request. You&apos;ll be able to sign in as" frontend/src/pages/Register.jsx` -> `1` (self-registration paragraph byte-identical)
- `grep -c "Once you register and verify your email, you can sign in right away." backend/src/services/mailer.js` -> `2`
- `grep -c "review and approve\|reviews and approves" backend/src/services/mailer.js` -> `0`
- `grep -c "Please confirm this is your email address." backend/src/services/mailer.js` -> `2`
- `grep -c "activate your account" backend/src/services/mailer.js` -> `0`
- `git diff backend/src/services/mailer.js | grep -c '^+.*escapeHtml('` -> `0`
- `grep -c "Registration received. Verify your email to activate your account." backend/src/resolvers/user.resolver.js` -> `2` (D-10 locked string, unchanged)
- `git diff --stat -- backend/src/resolvers backend/src/schemas frontend/src/context/AuthContext.jsx` -> empty (no changes to any forbidden file)

## Actual RED Output (recorded per D-12)

**Task 1 RED** (`cd frontend && npx vitest run src/pages/Register.test.jsx`, before the Register.jsx edit): `1 failed | 14 passed (15)` -- the new test failed on `screen.findByText(/verify it and you can sign in right away/i)` timing out, because the DOM still rendered the old "administrator will review and approve" paragraph.

**Tasks 2+3 RED** (`cd backend && npx vitest run src/services/mailer.test.js`, before the mailer.js edit): `2 failed | 10 passed (12)` -- both new assertions failed: `sendInvitationEmail`'s text/html did not match `/sign in right away/i` (still contained "an administrator will review and approve"), and `sendVerificationEmail`'s text/html did not match `/confirm this is your email address/i` (still contained "verify your email address to activate your account").

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both test files this plan touches are fully green: `frontend/src/pages/Register.test.jsx` (15/15) and `backend/src/services/mailer.test.js` (12/12)
- D-10 boundary confirmed unbroken -- no resolver/schema/AuthContext changes, server string byte-identical
- Ready for 35-03's quality gate, which per the plan's `<verification>` section should confirm `src/resolvers/register.test.js` and `src/resolvers/publicRegistrationSwitch.test.js` remain green (they mock `mailer.js` at the module boundary and were not re-run by this plan per project rules restricting test runs to the two files this plan touches)

---
*Phase: 35-post-verify-landing-invited-path-copy*
*Completed: 2026-09-09*
