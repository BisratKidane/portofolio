---
phase: 14-relationship-resolvers-permission-scoping-query-safety
plan: 01
subsystem: backend-graphql-infrastructure
tags: [apollo-server, dataloader, graphql-validation, test-harness-parity]
dependency-graph:
  requires: []
  provides:
    - backend/src/graphql/serverConfig.js (shared { typeDefs, resolvers, validationRules })
    - backend/src/loaders/familyMember.loaders.js (createLoaders(models))
  affects:
    - backend/src/server.js
    - backend/test/helpers.js
tech-stack:
  added:
    - dataloader@^2.2.3
    - "@escape.tech/graphql-armor-max-depth@^2.4.2"
  patterns:
    - "Shared Apollo config module consumed by both production server.js and test/helpers.js (closes harness-parity gap)"
    - "Request-scoped DataLoader factory, constructed fresh per request/per graphql() call, never at module scope"
key-files:
  created:
    - backend/src/graphql/serverConfig.js
    - backend/src/graphql/queryDepth.test.js
    - backend/src/loaders/familyMember.loaders.js
    - backend/src/loaders/familyMember.loaders.test.js
  modified:
    - backend/package.json
    - backend/src/config/env.js
    - backend/src/server.js
    - backend/test/helpers.js
decisions:
  - "maxDepthRule configured with propagateOnRejection: false + onReject: [(context, error) => context.reportError(error)] instead of the library's own default (propagateOnRejection: true), which throws synchronously from inside the validation visitor and crashes the whole request as an opaque 'Internal server error' rather than the intended clean GRAPHQL_VALIDATION_FAILED response -- verified empirically against the installed graphql-armor-max-depth@2.4.2 + @apollo/server@4.13.0, not assumed from docs"
  - "DataLoader cacheKeyFn: (key) => String(key) applied to all three loaders (memberById, childrenByParentId, spousesByMemberId) as defensive normalization against GraphQL ID!-string vs Sequelize-numeric-FK cache-key mismatches"
metrics:
  duration: "~45 min (incl. investigation of Apollo Server 4 validation-error propagation and cross-worktree test contention)"
  completed: 2026-07-22
---

# Phase 14 Plan 01: Shared Server Config & Request-Scoped DataLoaders Summary

Extracted the duplicated Apollo `typeDefs`/`resolvers` construction in `server.js` and `test/helpers.js` into one shared `serverConfig.js` module carrying a query-depth validation rule, and added a request-scoped `createLoaders(models)` DataLoader factory wired identically into both production and test code paths -- closing the test/production harness-parity gap RESEARCH.md flagged as this phase's dominant risk before any Phase 14 resolver could depend on either mechanism.

## What Was Built

**Task 1 -- Shared Apollo server config + GraphQL depth-limit validation (D-08):**
- Installed `dataloader@^2.2.3` and `@escape.tech/graphql-armor-max-depth@^2.4.2` in the backend workspace (both pre-approved in RESEARCH.md's Package Legitimacy Audit, no checkpoint required).
- Added `env.maxQueryDepth` (`MAX_QUERY_DEPTH`, default `100`) to `backend/src/config/env.js`, following the existing `Number(process.env.X || default)` idiom.
- Created `backend/src/graphql/serverConfig.js` exporting `{ typeDefs, resolvers, validationRules }`, re-exporting `typeDefs`/`resolvers` from the existing barrels and building `validationRules` from `maxDepthRule`.
- Rewired `backend/src/server.js` and `backend/test/helpers.js` to construct their `ApolloServer` instances from this shared module instead of independently importing `typeDefs`/`resolvers`.
- Added `backend/src/graphql/queryDepth.test.js`: a shallow-query regression test, a hand-crafted 110-level-deep introspection query proven rejected via the shared `graphql()` helper with `errors[0].extensions.code === 'GRAPHQL_VALIDATION_FAILED'`, and a direct `graphql-js` `validate()` comparison proving the rejection depends on this plan's explicit `ignoreIntrospection: false` (not the library's own `ignoreIntrospection: true` default).

**Task 2 -- Request-scoped DataLoader factory (D-07):**
- Created `backend/src/loaders/familyMember.loaders.js` exporting `createLoaders(models)`, returning a fresh `{ memberById, childrenByParentId, spousesByMemberId }` object of `DataLoader` instances on every call -- never instantiated at module scope.
- Wired `loaders: createLoaders(models)` into `server.js`'s per-request Apollo context factory and into `test/helpers.js`'s `graphql()` function body (a fresh call per invocation, not hoisted to module scope).
- Added `backend/src/loaders/familyMember.loaders.test.js` proving: batching (5 concurrent loads -> 1 SQL query), two-different-parents batched into 1 query, either-side spouse resolution, positional length/order alignment with `null` for missing ids, and that two separate `createLoaders(models)` calls never share cache state.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `maxDepthRule`'s own default (`propagateOnRejection: true`) crashes the request instead of producing a clean validation error**
- **Found during:** Task 1, GREEN step -- running the over-depth query through the real `graphql()` helper for the first time.
- **Issue:** `MaxDepthVisitor.onOperationDefinitionEnter` throws the `GraphQLError` synchronously from inside the validation visitor when `propagateOnRejection` is left at its library default (`true`). Apollo Server 4's `requestPipeline.js` calls `graphql-js`'s `validate()` with no surrounding `try/catch`, so the thrown error propagates uncaught and surfaces to the client as an opaque `Internal server error` (`extensions.code: INTERNAL_SERVER_ERROR`) instead of the intended `GRAPHQL_VALIDATION_FAILED` response the plan's acceptance criteria require.
- **Fix:** Configured `maxDepthRule({ n: env.maxQueryDepth, ignoreIntrospection: false, propagateOnRejection: false, onReject: [(context, error) => context.reportError(error)] })` in `serverConfig.js`, reporting the error through `graphql-js`'s standard `ValidationContext#reportError` collection API instead of throwing. This is exactly the code path `validate()`'s `errors` array (and, downstream, Apollo Server's `ValidationError` class carrying `GRAPHQL_VALIDATION_FAILED`) expects.
- **Files modified:** `backend/src/graphql/serverConfig.js`
- **Commit:** `c9b3120` (config authored during RED), verified GREEN in `00f14e7`
- **Verification:** Confirmed empirically by reading the installed `@escape.tech/graphql-armor-max-depth@2.4.2` source directly and by observing the actual `errors[0].extensions.code` value returned through the real `graphql()` helper, per the plan's explicit instruction not to guess this value.

**2. [Rule 3 - Blocking] Cross-file `graphql-js` module realm mismatch when constructing a schema via `@graphql-tools/schema`'s `makeExecutableSchema`**
- **Found during:** Task 1, writing `queryDepth.test.js`'s third assertion (proving rejection depends on the explicit `ignoreIntrospection: false` setting).
- **Issue:** Building a schema with `makeExecutableSchema({ typeDefs, resolvers })` and validating it with a directly-imported `graphql-js` `validate()` threw `"Cannot use GraphQLSchema ... from another module or realm"` -- a dual-package-hazard between the CJS/ESM builds of the `graphql` package that `@graphql-tools/schema` resolves internally versus the one imported directly in the test file.
- **Fix:** Replaced `makeExecutableSchema` with `graphql-js`'s own `buildSchema('type Query { ping: String }')`. `__schema`/`__type` are automatic introspection meta-fields on any schema's root Query type per the GraphQL spec, so a minimal schema is sufficient for this assertion and avoids importing a second copy of `graphql` through a different resolution path.
- **Files modified:** `backend/src/graphql/queryDepth.test.js`

### Non-blocking observation (not a deviation, no fix applied)

Two full-suite runs mid-session showed 8-12 unrelated test failures (rate-limiting timing windows, deadlock-retry races, a foreign-key error in `database.test.js`) that did not reproduce when the same files were run in isolation or when the full suite was re-run after a concurrently-running sibling worktree's own `npm test` process (against the same shared `portofolio_test` MySQL database) had finished. This is cross-worktree test-database contention from parallel plan execution sharing one physical MySQL instance, not a regression introduced by this plan's changes -- confirmed by two clean, fully-green 203/203 full-suite runs once no sibling test process was active. Out of scope for this plan (infra/parallel-execution concern); no code was changed to address it.

## Verification

- `npm test --workspace backend -- src/graphql/queryDepth.test.js` -- 3/3 passing
- `npm test --workspace backend -- src/loaders/familyMember.loaders.test.js` -- 5/5 passing
- `npm test --workspace backend` (full suite) -- 203/203 passing (195 existing baseline + 3 + 5 new), confirmed clean on two separate full runs with no sibling worktree test process active
- Grep gates (all confirmed): `serverConfig.js` exports `validationRules`/`{ typeDefs, resolvers }`; `server.js` no longer imports `typeDefs`/`resolvers` from `./schemas/index.js`/`./resolvers/index.js` directly (`grep -c` returns `0`); `test/helpers.js` imports from `../src/graphql/serverConfig.js` and passes `validationRules`; `env.js` exports `maxQueryDepth`; `createLoaders` exported and called exactly 3 `new DataLoader(` sites, all inside the factory body; `server.js` context includes `loaders: createLoaders(models)`; `test/helpers.js` calls `createLoaders(models)` inside `graphql()`'s function body, not at module scope

## TDD Gate Compliance

Both tasks followed RED -> GREEN as separate commits:
- Task 1: `c9b3120` `test(14-01): add failing query-depth-limit test (D-08 RED)` -> `00f14e7` `feat(14-01): wire shared serverConfig.js validationRules into server.js and test/helpers.js (D-08 GREEN)`
- Task 2: `87b7562` `test(14-01): add failing request-scoped DataLoader test suite (D-07 RED)` -> `fcf05d5` `feat(14-01): implement request-scoped DataLoader factory, wired per-request (D-07 GREEN)`

RED confirmed by running each new test file before its corresponding implementation/rewire existed; GREEN confirmed immediately after.

## Self-Check: PASSED

- FOUND: backend/src/graphql/serverConfig.js
- FOUND: backend/src/graphql/queryDepth.test.js
- FOUND: backend/src/loaders/familyMember.loaders.js
- FOUND: backend/src/loaders/familyMember.loaders.test.js
- FOUND: c9b3120 (test RED, Task 1)
- FOUND: 00f14e7 (feat GREEN, Task 1)
- FOUND: 87b7562 (test RED, Task 2)
- FOUND: fcf05d5 (feat GREEN, Task 2)

