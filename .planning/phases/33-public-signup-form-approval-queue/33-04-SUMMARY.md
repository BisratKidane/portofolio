---
phase: 33-public-signup-form-approval-queue
plan: 04
subsystem: ui
tags: [react, mui, form-validation, graphql, vitest]

# Dependency graph
requires:
  - phase: 33-public-signup-form-approval-queue (Plan 01, Wave 1)
    provides: "Register.validation.js's four validators + four constants (agreement-tested against backend policy modules); AuthContext.jsx's register() widened to a named-object parameter"
provides:
  - "Register.jsx's tokenless (!token) branch rewritten from the 'invitation required' dead-end into the real 4-field public signup form (REG-01) with D-05 in-place success swap and D-06 enumeration-silent success copy (REG-04)"
  - "Register.test.jsx rewritten with public-form/validation/success-copy coverage; invited-path tests (2/2) preserved with zero assertion changes, proving the regression tripwire held"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Derived (not stored) field-error state: nameError/emailError/passwordError/noteError are recomputed every render from `form` + the imported validators + `touched`, so a touched field's error clears the instant it's fixed without any extra effect or manual clear call"
    - "Two submit handlers sharing one component's result/error/loading state (handleInvitedSubmit unchanged, handlePublicSubmit new) so both branches reuse the same success/error rendering shape without duplicating state"

key-files:
  created: []
  modified:
    - frontend/src/pages/Register.jsx
    - frontend/src/pages/Register.test.jsx

key-decisions:
  - "Two-task execution order was implementation-first (Task 1: Register.jsx) then tests (Task 2: Register.test.jsx), per this plan's explicit file-scoped task boundaries. Task 1's interim verification run against the not-yet-rewritten test file showed 1 expected failure (the old dead-end assertion, slated for Task 2's rewrite) and 2 passes (the invited-path regression tripwire) -- confirmed before committing Task 1, so the invited-path guarantee was verified independently of Task 2's rewrite."
  - "Relationship note's two-part helperText (hint/error + live 'N/500' counter) uses a Box component=\"span\" wrapper instead of a block-level Stack, avoiding a div-inside-<p> nesting issue since MUI's FormHelperText renders as a <p> by default."

patterns-established:
  - "Blur-then-live validation without a `wasSubmitted` flag: touched state alone drives whether an error renders; validators run unconditionally every render so the error text is always in sync with the current field value."

requirements-completed: [REG-01, REG-04]

# Metrics
duration: ~25min
completed: 2026-09-07
---

# Phase 33 Plan 04: Public Signup Form Summary

**Register.jsx's tokenless branch is now the real 4-field public signup form (name/email/password/relationship note) with blur-then-live client validation and a D-05/D-06 in-place success panel that never branches on the server response — the invited path stayed byte-identical throughout.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 2 completed (both `tdd="true"`)
- **Files modified:** 2

## Accomplishments
- `Register.jsx`'s `!token` branch no longer renders "You need an invitation" — it renders the full public signup form per `33-UI-SPEC.md`: Full name, Email address, Password, "How are you related to the family?" (multiline, live character counter), and a "Create account" submit button
- Validation is imported directly from `Register.validation.js` (Wave 1) — zero inline/re-implemented rules. Blur-then-live timing: a field only shows an error once touched (blur, or all-touched-on-submit); once touched, the error recomputes and clears on every keystroke
- D-05: the success state swaps the form in place inside the same `AuthShell` instance — no new route, no redirect
- D-06: the success copy (`Check {form.email} for a verification link.` + the two-step body text) is generated entirely from the form's own `form.email` state and never reads `result.message` — a code comment marks this as the SEC-01 enumeration-silence invariant so a future edit doesn't accidentally reopen Phase 32's closed gap
- The tokenless AuthShell chrome ("Request access" / "Create your account" / "Tell us how you're related to the family — an administrator reviews every request.") and the D-06 success-panel copy are now test-asserted, not just visually reviewable
- Invited (`token` present) branch is unchanged: same AuthShell props, same two fields, same `register({ token, name: form.name, password: form.password })` call shape, same success/error rendering — `Register.test.jsx`'s two pre-existing invited-path tests pass with **zero assertion changes**
- Full frontend suite: 43 files / 471 tests green (baseline 43/468 + 3 net new `Register.test.jsx` tests)

## Task Commits

1. **Task 1: Rewrite Register.jsx's !token branch into the public signup form** - `d73b3d1` (feat)
2. **Task 2: Rewrite Register.test.jsx — new no-token coverage, invited-path tests unchanged** - `3328e0e` (test)

_Note: no separate plan-metadata commit — this SUMMARY.md is committed as the final commit for this plan, per the parallel-worktree protocol (orchestrator owns STATE.md/ROADMAP.md separately)._

## Files Created/Modified
- `frontend/src/pages/Register.jsx` — tokenless branch rewritten into the public signup form (D-01..D-06); invited branch unchanged
- `frontend/src/pages/Register.test.jsx` — first `it()` rewritten (public form renders), 3 new `it()`s added (blur-then-live, all-touched-on-submit, D-06 success copy), 2 existing invited-path `it()`s untouched

## Decisions Made
- Kept both submit paths (invited/tokenless) inside one component sharing `result`/`error`/`loading` state, since only one branch is ever active per mount (token presence is fixed for the component's lifetime via `useSearchParams`)
- Widened the shared `form` state to all four keys (`name`, `email`, `password`, `relationshipNote`) as directed by the plan, so the tokenless branch has somewhere to write without touching the invited branch's two fields
- Field-level errors are derived every render from `form` + the validators + `touched` — never stored as separate state — so they can never go stale relative to the current input value

## Deviations from Plan

None - plan executed exactly as written. Task 1's interim verification against the not-yet-rewritten test file showed 1 failure (the old dead-end assertion) and 2 passes (invited-path tests) — this is the plan's own explicitly anticipated transitional state (Task 2 owns the test-file rewrite), not a deviation.

## Issues Encountered
None.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Both user-facing surfaces described in `33-CONTEXT.md`'s Phase Boundary are now complete on the frontend side (public signup form here; approval queue in Plan 33-02)
- No blockers for closing Phase 33 — full frontend suite green (43 files / 471 tests); backend suite untouched by this plan per the environment constraint (frontend-only plan)

## Self-Check: PASSED

- FOUND: frontend/src/pages/Register.jsx
- FOUND: frontend/src/pages/Register.test.jsx
- FOUND: commit d73b3d1
- FOUND: commit 3328e0e

---
*Phase: 33-public-signup-form-approval-queue*
*Completed: 2026-09-07*
