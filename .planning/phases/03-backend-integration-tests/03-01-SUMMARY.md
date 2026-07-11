---
phase: 03-backend-integration-tests
plan: 01
subsystem: testing
tags: [vitest, apollo-server, graphql, sequelize, jwt, integration-testing]

# Dependency graph
requires:
  - phase: 01-backend-test-tooling
    provides: Vitest runner, isolated test database harness (globalSetup.js, guard.js), resetTables()/createTestUser() fixtures
  - phase: 02-backend-unit-tests
    provides: signToken/jwt.verify assertion pattern (auth.test.js), describe/it nesting convention, models-driven Sequelize test convention
provides:
  - "graphql() in-process Apollo executeOperation test helper in backend/test/helpers.js, reused by every subsequent integration spec in this phase"
  - "First integration spec (register mutation, BE-04) proving the ADMIN/USER first-user role matrix, duplicate-email rejection, and invalid-email rejection"
affects: [03-02, 03-03, "any future phase adding backend GraphQL integration specs"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "In-process Apollo test server: new ApolloServer({ typeDefs, resolvers }) built once at module scope in test/helpers.js, never imports server.js (avoids its apollo.start()/initializeDatabase()/app.listen side effects)"
    - "graphql(query, variables, user) wrapper normalizing executeOperation's response.body.singleResult to { data, errors }"
    - "Context injection for auth simulation: contextValue.user is null (anon) or a createTestUser() instance (authed) — no JWT/header round-trip in integration specs"
    - "beforeEach(resetTables) per spec file for per-test table isolation, required by the first-user-ADMIN order-dependence quirk"

key-files:
  created:
    - backend/src/resolvers/register.test.js
  modified:
    - backend/test/helpers.js

key-decisions:
  - "Extended backend/test/helpers.js in place with the graphql() wrapper rather than creating a separate graphqlTestServer.js, per 03-PATTERNS.md guidance"
  - "Per-flow spec file (register.test.js) rather than one combined resolver spec, so Wave 2 plans can add login/dashboard/reset specs with zero file overlap"

patterns-established:
  - "Every future integration spec imports { graphql, resetTables, createTestUser } from '../../test/helpers.js' and asserts on singleResult.errors[0].message only (never .extensions.code, which is always INTERNAL_SERVER_ERROR for plain thrown Errors in this codebase)"

requirements-completed: [BE-04]

# Metrics
duration: 1min
completed: 2026-07-12
---

# Phase 3 Plan 1: Register Mutation Integration Tests Summary

**Added a shared in-process Apollo `graphql()` test helper and the first backend integration spec, proving register's ADMIN/USER first-user role matrix, duplicate-email rejection, and Sequelize `isEmail` validation rejection.**

## Performance

- **Duration:** ~1 min (2026-07-12T01:40:26Z - 2026-07-12T01:40:53Z)
- **Started:** 2026-07-12T01:40:26+02:00
- **Completed:** 2026-07-12T01:40:53+02:00
- **Tasks:** 2 completed
- **Files modified:** 2 (1 modified, 1 created)

## Accomplishments
- `backend/test/helpers.js` now exports a `graphql(query, variables, user)` wrapper that drives the GraphQL layer in-process via `ApolloServer#executeOperation`, without ever importing `backend/src/server.js` (avoids its top-level `apollo.start()`/`initializeDatabase()`/`app.listen` side effects) — establishes the reusable test-entry-point contract every subsequent integration spec in this phase depends on
- `backend/src/resolvers/register.test.js` delivers 4 passing tests covering the ADMIN branch (empty table), USER branch (seeded table), duplicate-email rejection with the exact API-contract error string, and malformed-email rejection via Sequelize's `isEmail` model validator
- Full backend suite remains green: 29/29 tests across 6 files (up from 25/25 across 5 files pre-plan)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add graphql() in-process Apollo test-server helper to backend/test/helpers.js** - `d6068f6` (feat)
2. **Task 2: Write register mutation integration tests (BE-04)** - `3a02b01` (test)

**Plan metadata:** committed separately after this summary is written.

## Files Created/Modified
- `backend/test/helpers.js` - extended with `graphql()` in-process Apollo executeOperation wrapper; `resetTables()`/`createTestUser()` unchanged
- `backend/src/resolvers/register.test.js` - new integration spec, 4 tests covering register's role matrix and negative-input paths

## Decisions Made
- Followed 03-PATTERNS.md guidance to extend `backend/test/helpers.js` in place rather than adding a new `backend/test/graphqlTestServer.js` file
- Used the malformed-email case (`'not-an-email'`) as the "invalid input" negative case per RESEARCH.md Pitfall 4 — this is a resolver/model-level Sequelize `isEmail` validation rejection, not a GraphQL schema-level one; documented via an inline comment in the spec per the plan's instruction

## Deviations from Plan

None - plan executed exactly as written. Both tasks' acceptance criteria (grep checks, `node --check`, and the full Vitest run) passed on the first attempt with no auto-fixes required.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The `graphql()` helper contract (`graphql(query, variables, user)` returning `{ data, errors }`) is now established and ready for Wave 2 plans (03-02 login, 03-03 dashboard/requestPasswordReset) to reuse without redefining the in-process Apollo server
- BE-04 is fully satisfied; BE-05/BE-06/BE-07/DOCS-01 remain for subsequent plans in this phase
- No blockers — full backend suite (29/29) is green and the test database harness (Phase 1) continues to work correctly under the new per-test `beforeEach(resetTables)` isolation pattern

---
*Phase: 03-backend-integration-tests*
*Completed: 2026-07-12*
