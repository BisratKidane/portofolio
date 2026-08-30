---
phase: 32-tokenless-registration
plan: 02
subsystem: api
tags: [email, xss, html-escaping, mailer, nodemailer]

# Dependency graph
requires:
  - phase: 31-approval-workflow
    provides: mailer.js's existing sendXEmail template shape (renderHtml wrapper, sendMail transport)
provides:
  - escapeHtml(value) pure HTML-entity-escaping utility (backend/src/utils/escapeHtml.js)
  - Every raw interpolation in mailer.js's 6 sendXEmail templates escaped before entering an HTML string
  - sendPendingRegistrationEmail's self-registration vs invited-registration copy branch (no false "via an invitation from ..." claim)
  - sendRegistrationAttemptEmail(D-10 owner-notification template, escaped, CTA to /forgot-password)
affects: [32-03-tokenless-register-mutation, 32-04-notifier-refactor]

# Tech tracking
tech-stack:
  added: []
  patterns: [pure-function HTML-entity escaping applied at point-of-interpolation, never in a shared renderer]

key-files:
  created:
    - backend/src/utils/escapeHtml.js
    - backend/src/utils/escapeHtml.test.js
  modified:
    - backend/src/services/mailer.js
    - backend/src/services/mailer.test.js

key-decisions:
  - "escapeHtml is naive/single-pass (not idempotent-aware) — matches D-07's literal requirement that every function escape its own raw values exactly once at the point of interpolation, never relying on renderHtml to escape centrally."
  - "Plain-text (`text`) email bodies are never escaped — only the `html` branch's interpolation sites are wrapped, since entity-escaping plain text would corrupt it. sendInvitationEmail and sendPendingRegistrationEmail now compute separate raw (text) and escaped (html) versions of the same value (e.g. `from`/`fromHtml`) to keep the two bodies independently correct."
  - "sendPendingRegistrationEmail's self-registration branch is triggered purely by inviterName's truthiness, trusting the caller (Plan 32-04) to only ever pass a real admin name or null — T-32-05 accepted this as the caller's authenticity responsibility, not mailer.js's."

requirements-completed: [SEC-03]

# Metrics
duration: 15min
completed: 2026-08-30
---

# Phase 32 Plan 02: Mailer HTML-Escaping & Self-Registration Copy Summary

**New dependency-free `escapeHtml()` utility applied across all 6 `mailer.js` templates, closing the admin-notification-email HTML-injection surface opened by self-registration, plus a new `sendRegistrationAttemptEmail` template for D-10.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-08-30T19:37:00+02:00 (approx, first RED commit 19:38:00+02:00)
- **Completed:** 2026-08-30T19:46:53+02:00
- **Tasks:** 2
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- `escapeHtml(value)` — pure, dependency-free HTML-entity escaping, tested against `<`, `>`, `&`, `"`, `'`, `null`/`undefined`, non-string coercion, and its own naive non-idempotent behavior.
- Every raw, potentially attacker-controlled value that reaches an HTML string in `mailer.js` (`reason`, `newUserName`, `newUserEmail`, `inviterName`, `relationship`, `note`, plus `env.resetTokenExpiresMinutes` for consistency) is now `escapeHtml()`-wrapped at its exact point of interpolation — proven by tests reading nodemailer's real `jsonTransport` output, not mocked return values.
- `sendPendingRegistrationEmail` branches its copy on `inviterName`'s presence: an invited registration still reads "registered via an invitation from `<strong>Name</strong>`"; a self-registration (no inviter) now reads "registered directly" and never claims an invitation that never happened — closing the copy half of D-12's template support and Phase 30's still-open WR-07 (unescaped rejection reason).
- New `sendRegistrationAttemptEmail({ to, name })` for D-10's owner-notification email (fired when someone attempts to self-register with an email that already belongs to an existing account) — escaped `name`, subject referencing "a registration attempt", CTA linking to `${env.clientUrl}/forgot-password`.

## Task Commits

Each task was committed atomically via TDD red/green:

1. **Task 1: escapeHtml utility (D-07)**
   - `bc20420` (test) — failing test for `escapeHtml`
   - `1b5c734` (feat) — `escapeHtml` implementation, all 7 tests green
2. **Task 2: Apply escapeHtml across mailer.js + self-registration copy branch + sendRegistrationAttemptEmail**
   - `3994cc1` (test) — failing tests for mailer.js escaping, copy branch, and the new template
   - `fbdd3ed` (feat) — mailer.js changes, all 10 tests green (17 total in the two suites)

_No refactor commits were needed — both GREEN implementations were minimal and clean on the first pass, except a same-task readability refactor (spreading 4 `escapeHtml()` calls in `sendPendingRegistrationEmail`'s intro across separate `const` lines) folded into the `fbdd3ed` feat commit rather than split out, since it was required to satisfy the plan's own `grep -c` acceptance criterion (line-count, not occurrence-count) and involved no behavior change._

## Files Created/Modified
- `backend/src/utils/escapeHtml.js` - New pure HTML-entity-escaping utility, single named export
- `backend/src/utils/escapeHtml.test.js` - 7 tests covering escaping, non-idempotence, null/undefined/number coercion
- `backend/src/services/mailer.js` - `escapeHtml` applied across `sendPasswordResetEmail`, `sendAccountRejectedEmail`, `sendPendingRegistrationEmail` (+ self-registration copy branch), `sendInvitationEmail`; new `sendRegistrationAttemptEmail` added
- `backend/src/services/mailer.test.js` - 4 new `describe` blocks (10 new tests) reading real rendered `html`/`subject` via nodemailer's `jsonTransport` result, not mocks

## Decisions Made
- Kept `text` (plain-text) and `html` interpolations independently computed wherever the same source value feeds both bodies (`sendInvitationEmail`'s `from`/`fromHtml`, `rel`/`relHtml`; `sendPendingRegistrationEmail`'s text branch vs `originHtml`) — escaping the shared value once and reusing it in both would have corrupted the plain-text body with literal `&amp;`/`&lt;` entities.
- `sendAccountApprovedEmail` was left untouched — confirmed via 32-PATTERNS.md's interpolation table that its `html` branch has no raw interpolation (`name` only appears in the plain-text body there), so there was nothing to wrap.
- `sendPendingRegistrationEmail`'s plain-text `noteLine` label was changed from `"Invitation note:"` to `"Note:"` since the same template now serves both invited and self-registered copy paths, and the old label was invitation-specific.

## Deviations from Plan

None — plan executed as written. One clarification worth noting: the plan's acceptance criterion `grep -c "escapeHtml(" backend/src/services/mailer.js` is at least 10` counts matching *lines*, not total occurrences (`grep -c`, not `grep -o | wc -l`). The first implementation pass had 11 total `escapeHtml(` calls but only 8 matching lines (4 calls landed on one template-literal line in `sendPendingRegistrationEmail`). Extracted those 4 calls into separate `const` assignments (`escapedNewUserName`, `escapedNewUserEmail`, `relationshipHtml`, `noteHtml`) — a pure formatting change, no behavior difference — bringing the line count to 11, satisfying the literal criterion. This was folded into the same `fbdd3ed` GREEN commit rather than treated as a separate deviation, since it was necessary to meet the plan's own stated acceptance bar before the task could be considered done (Rule 3 — blocking issue preventing task completion per its own written verification command).

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 32-03 (tokenless `register` mutation) can now call `sendRegistrationAttemptEmail` on the taken-email path.
- Plan 32-04 (refactor `notifyAdminsOfPendingRegistration`) can now call `sendPendingRegistrationEmail` with `inviterName: null` for a self-registrant and get accurate, escaped copy — no further mailer.js changes anticipated for that plan.
- No blockers identified.

---
*Phase: 32-tokenless-registration*
*Completed: 2026-08-30*

## Self-Check: PASSED

All claimed files verified present on disk:
- FOUND: backend/src/utils/escapeHtml.js
- FOUND: backend/src/utils/escapeHtml.test.js
- FOUND: backend/src/services/mailer.js
- FOUND: backend/src/services/mailer.test.js
- FOUND: .planning/phases/32-tokenless-registration/32-02-SUMMARY.md

All claimed commit hashes verified present in git log:
- FOUND: bc20420 (test: escapeHtml RED)
- FOUND: 1b5c734 (feat: escapeHtml GREEN)
- FOUND: 3994cc1 (test: mailer.js RED)
- FOUND: fbdd3ed (feat: mailer.js GREEN)
- FOUND: 8df9b21 (docs: SUMMARY commit)
