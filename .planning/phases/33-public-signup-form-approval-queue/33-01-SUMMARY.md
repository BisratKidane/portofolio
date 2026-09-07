---
phase: 33-public-signup-form-approval-queue
plan: 01
subsystem: auth
tags: [react, vitest, form-validation, graphql, cross-workspace-testing]

# Dependency graph
requires:
  - phase: 32-tokenless-registration
    provides: "backend register(token, name, email, password, relationshipNote) mutation and the four backend/src/utils/{emailPolicy,namePolicy,relationshipNotePolicy,passwordPolicy}.js modules this plan's agreement test imports"
provides:
  - "Register.validation.js — pure client-side validators (validateFullName, validateEmail, validatePassword, validateRelationshipNote) + four boundary constants, safe for the production bundle"
  - "Register.validation.test.js — permanent, colocated cross-workspace agreement test proving client-accepts ⇒ server-accepts against the REAL backend policy modules (D-04), not a hand-maintained comment"
  - "AuthContext.jsx's register() widened to a named-object parameter { token, name, email, password, relationshipNote }, removing the positional-argument-order footgun"
affects: [33-04-public-signup-form]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cross-workspace test-time-only import: a frontend Vitest file imports real backend/src/utils/*.js modules for behavioral agreement testing, never for production use (npm workspaces hoist `validator` to root node_modules so this resolves without any new dependency)"
    - "Named-object wrapper parameter for GraphQL mutations with multiple optional args, replacing positional args once the argument count/optionality grows past 2-3 parameters"

key-files:
  created:
    - frontend/src/pages/Register.validation.js
    - frontend/src/pages/Register.validation.test.js
  modified:
    - frontend/src/context/AuthContext.jsx
    - frontend/src/context/AuthContext.test.jsx
    - frontend/src/pages/Register.jsx

key-decisions:
  - "validateEmail uses a practical regex, not validator's isEmail byte-for-byte — D-04 only requires agreement on the specific fixture values asserted in the agreement test, not full behavioral equivalence across all inputs"
  - "validateRelationshipNote's own-behavior requiredness check is UI-only and intentionally excluded from the agreement test — relationshipNotePolicy.js has no requiredness rule (note is server-optional per Phase 32 D-06), so a stricter client rule here is not a D-04 violation"

patterns-established:
  - "Cross-workspace agreement test pattern (Pattern 2, 33-RESEARCH.md): frontend/src/pages/Register.validation.test.js is the template any future client-validation-vs-backend-policy pairing should follow"

requirements-completed: [REG-01]

# Metrics
duration: ~10min
completed: 2026-09-07
---

# Phase 33 Plan 01: D-04 Validation Agreement + register() Widening Summary

**Cross-workspace agreement test importing the real backend policy modules (emailPolicy/namePolicy/relationshipNotePolicy/passwordPolicy), plus AuthContext.jsx's register() widened to a named-object parameter — closing the CR-01 bug class structurally rather than by convention.**

## Performance

- **Duration:** ~10 min
- **Tasks:** 2 completed (both TDD)
- **Files modified:** 5 (2 created, 3 modified — 1 of the 3 modified files was a necessary deviation, see below)

## Accomplishments
- `Register.validation.js` exports four pure validators (`validateFullName`, `validateEmail`, `validatePassword`, `validateRelationshipNote`) plus four constants (255/254/8/500), each constant citing its exact backend source file
- `Register.validation.test.js` imports the REAL `backend/src/utils/{emailPolicy,namePolicy,relationshipNotePolicy,passwordPolicy}.js` functions (test-time only, never re-implemented) and proves client-accepts ⇒ server-accepts across the boundary fixture table — 21/21 tests pass, including successful execution of `emailPolicy.js`'s transitive `validator` dependency, hoisted to root `node_modules` by npm workspaces
- `AuthContext.jsx`'s `REGISTER_MUTATION` widened: `$token` becomes optional, `$email`/`$relationshipNote` added to variables and the `register(...)` field args; the `register()` wrapper now destructures a single named-object argument and passes all five keys through to `graphqlRequest` unconditionally
- `AuthContext.test.jsx` gained two new call-argument assertions (invited-shaped and tokenless-shaped calls) — closing the real coverage gap 33-RESEARCH.md identified (the prior test asserted zero call arguments for `register`)
- Full frontend suite green: 43 files / 464 tests (baseline 42/441 + 21 new agreement tests + 2 new AuthContext tests — 1 new test file, not 2, since `AuthContext.test.jsx` was modified, not created)

## Task Commits

Each task followed TDD RED → GREEN:

1. **Task 1: Register.validation.js + cross-workspace agreement test (D-04)**
   - `b0682d5` (test) — failing agreement test, module doesn't exist yet
   - `380549f` (feat) — implementation; 21/21 passing
2. **Task 2: Widen AuthContext.jsx register() to a named-object parameter**
   - `926b58d` (test) — failing call-argument assertions against the still-positional wrapper
   - `0e1ca91` (feat) — widened mutation + wrapper, plus the Register.jsx regression fix (see Deviations); 9/9 `AuthContext.test.jsx` passing, full suite green

_Note: no plan-metadata commit yet — this SUMMARY.md is committed as the final commit for this plan, per the parallel-worktree protocol (orchestrator owns STATE.md/ROADMAP.md separately)._

## Files Created/Modified
- `frontend/src/pages/Register.validation.js` — four pure validators + four constants, zero dependencies, safe for the production bundle
- `frontend/src/pages/Register.validation.test.js` — cross-workspace agreement test (test-time-only import of real backend policy modules)
- `frontend/src/context/AuthContext.jsx` — widened `REGISTER_MUTATION` and `register()` wrapper
- `frontend/src/context/AuthContext.test.jsx` — `Probe`'s register button switched to object-shape call; two new call-argument `it()` blocks added
- `frontend/src/pages/Register.jsx` — one-line deviation fix (see below): invited-path call site updated to the new named-object shape

## Decisions Made
- Hardcoded exact message strings (not template-literal interpolation) in `Register.validation.js` to reduce drift risk against the spec's verbatim copy requirements
- `EMAIL_FORMAT` regex chosen deliberately non-byte-identical to `validator.isEmail` per the plan's explicit instruction — the acceptance bar is agreement on the fixture table, not full equivalence

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1/3 - Bug caused by this plan's own change / blocking issue] Register.jsx's invited-path call site broke after widening register()**
- **Found during:** Task 2, post-implementation full-suite verification
- **Issue:** `AuthContext.jsx`'s `register()` wrapper was widened from positional args `(token, name, password)` to a single named-object parameter. `Register.jsx`'s invited-path `handleSubmit` still called `register(token, form.name, form.password)` positionally — the object destructuring then treated `token` (a string) as the sole argument, producing `{token: undefined, name: undefined, ...}` and sending an empty mutation payload. `npm test --workspace frontend` failed 1/464 (`Register.test.jsx`'s invited-path registration test).
- **Fix:** One-line change to the call site only: `register(token, form.name, form.password)` → `register({ token, name: form.name, password: form.password })`. No other line in `Register.jsx` touched.
- **Files modified:** `frontend/src/pages/Register.jsx`
- **Verification:** `npx vitest run src/pages/Register.test.jsx` — 3/3 pass with **zero assertion changes**, confirming the invited path works byte-identically (this plan's explicit regression tripwire). Full suite re-run: 43/43 files, 464/464 tests green.
- **Committed in:** `0e1ca91` (part of the Task 2 GREEN commit — the widening and its immediate regression fix are one logical change)

This file was not in this plan's `files_modified` list, but leaving it unfixed would have (a) broken the plan's own explicit acceptance criterion ("full frontend suite green") and (b) contradicted the plan's stated risk framing verbatim ("the invited path must keep working byte-identically"). 33-RESEARCH.md's Open Question 2 explicitly pre-resolved this ambiguity in favor of a one-line edit here. No other plan in this wave claims `Register.jsx` (confirmed against the `<parallel_execution>` file-ownership list), and Plan 33-04 (wave 2, depends on this plan) will rewrite this file's public-form branch on top of this commit.

---

**Total deviations:** 1 auto-fixed (Rule 1/3 — bug directly caused by this plan's own change, fixed to satisfy this plan's own explicit acceptance criterion)
**Impact on plan:** Necessary, in-scope, single-line fix. No scope creep — `Register.jsx`'s JSX, validation, and every other line are untouched, left for Plan 33-04.

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- `Register.validation.js`'s four validators and four constants are ready for Plan 33-04 to import directly into the rewritten public-form branch of `Register.jsx`
- `AuthContext.jsx`'s `register()` now accepts the full `{ token, name, email, password, relationshipNote }` shape Plan 33-04's tokenless call site needs, with test coverage already proving both call shapes work
- No blockers for Plan 33-04

## Self-Check: PASSED

- FOUND: frontend/src/pages/Register.validation.js
- FOUND: frontend/src/pages/Register.validation.test.js
- FOUND: commit b0682d5
- FOUND: commit 380549f
- FOUND: commit 926b58d
- FOUND: commit 0e1ca91

---
*Phase: 33-public-signup-form-approval-queue*
*Completed: 2026-09-07*
