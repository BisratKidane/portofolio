# Roadmap: Portfolio Auth App — Testing Foundation

## Overview

This milestone stands up a testing safety net from zero — no test framework, test files, or CI exist today. The roadmap runs backend-first (tooling and database isolation, then unit tests, then integration tests), then frontend (tooling, then component tests), then ties both suites together with a single root command and a GitHub Actions CI pipeline that enforces them on every push and PR. No application runtime behavior changes — this is tests, tooling, and CI configuration only. Known security bugs surfaced along the way are documented as tracked known-issues, not fixed.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Backend Test Tooling & Test Database** - Backend runs `npm test` via a configured test runner, with an isolated test database set up and torn down per run. (completed 2026-07-11)
- [x] **Phase 2: Backend Unit Tests** - Auth token utilities, password hashing, and role guards are unit-tested in isolation. (completed 2026-07-11)
- [x] **Phase 3: Backend Integration Tests** - Register, login, dashboard, and password-reset GraphQL flows are integration-tested against the test database; known bugs surfaced are documented. (completed 2026-07-11)
- [ ] **Phase 4: Frontend Test Tooling** - Frontend runs `npm test` via a configured runner with jsdom + React Testing Library.
- [ ] **Phase 5: Frontend Component Tests** - AuthContext, ProtectedRoute, Login, and Register are component-tested.
- [ ] **Phase 6: Root Orchestration & CI Pipeline** - A single root command runs both suites; GitHub Actions runs and enforces the full suite on every push/PR.

## Phase Details

### Phase 1: Backend Test Tooling & Test Database

**Goal**: The backend workspace has a working test runner and a safe, isolated test database that unit and integration tests can rely on.
**Depends on**: Nothing (first phase)
**Requirements**: SETUP-01, SETUP-04
**Success Criteria** (what must be TRUE):

  1. Running `npm test` in the backend workspace executes the configured test runner and reports pass/fail (including at least one passing smoke test).
  2. Backend integration tests run against a dedicated test database that is provisioned before the run and torn down after — dev data is never touched.
  3. Test configuration (env vars, database name/connection) is clearly separated from local-dev configuration so a developer cannot accidentally point tests at their dev database.

**Plans:** 2/2 plans complete

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Vitest runner setup: install vitest, wire test script, vitest.config.js, env/test.env, smoke test (SETUP-01)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — DB harness: safety guard, globalSetup (provision/teardown), helpers, Docker init script, live DB-connectivity spec (SETUP-04)

### Phase 2: Backend Unit Tests

**Goal**: The security-critical backend utility functions (tokens, passwords, role checks) are protected by fast, isolated unit tests.
**Depends on**: Phase 1
**Requirements**: BE-01, BE-02, BE-03
**Success Criteria** (what must be TRUE):

  1. JWT sign/verify unit tests pass: a signed token verifies successfully, and tampered or expired tokens are rejected.
  2. Password-handling unit tests pass: a new user's password is stored hashed (never plaintext), and `validatePassword` accepts the correct password and rejects an incorrect one.
  3. Role-guard unit tests pass: permitted roles are allowed through and disallowed roles are blocked.

**Plans:** 2/2 plans complete

Plans:
**Wave 1**

- [x] 02-01-PLAN.md — JWT sign/verify + role guard + reset-token unit tests (BE-01, BE-03)
- [x] 02-02-PLAN.md — validatePassword + beforeCreate hashing hook unit tests (BE-02)

### Phase 3: Backend Integration Tests

**Goal**: The core GraphQL auth flows (register, login, dashboard, password reset) work correctly end-to-end against a real test database, and any bugs found along the way are documented rather than silently ignored.
**Depends on**: Phase 1, Phase 2
**Requirements**: BE-04, BE-05, BE-06, BE-07, DOCS-01
**Success Criteria** (what must be TRUE):

  1. `register` mutation integration test passes: creates a user, rejects a duplicate email, and rejects invalid input.
  2. `login` mutation integration test passes: returns a JWT for valid credentials and rejects invalid credentials.
  3. The protected dashboard/`me` query integration test passes: returns data for an authenticated request and rejects an unauthenticated one.
  4. `requestPasswordReset` integration test passes and documents its current behavior (including the known reset-token exposure).
  5. Security bugs surfaced while writing these tests are recorded in a tracked known-issues doc (location + expected vs. actual behavior), not fixed.

**Plans:** 3/3 plans complete

Plans:
**Wave 1**

- [x] 03-01-PLAN.md — graphql() test helper + register mutation integration tests (BE-04)

**Wave 2** *(depends on Wave 1 completion)*

- [x] 03-02-PLAN.md — login mutation + dashboard/me query integration tests (BE-05, BE-06)
- [x] 03-03-PLAN.md — requestPasswordReset integration tests + KNOWN-ISSUES.md (BE-07, DOCS-01)

### Phase 4: Frontend Test Tooling

**Goal**: The frontend workspace has a working test runner capable of rendering and querying React components in a simulated DOM.
**Depends on**: Nothing (can run in parallel with Phases 1-3)
**Requirements**: SETUP-02
**Success Criteria** (what must be TRUE):

  1. Running `npm test` in the frontend workspace executes the configured test runner (jsdom environment) and reports pass/fail.
  2. React Testing Library is installed and configured; a sample component test can render a component and query it by role/text.
  3. Test setup handles the browser globals MUI/React Router need in jsdom (e.g. matchMedia) without runtime errors.

**Plans**: TBD

### Phase 5: Frontend Component Tests

**Goal**: The frontend's auth-critical surfaces behave correctly for authenticated and unauthenticated users, and that behavior is protected by component tests.
**Depends on**: Phase 4
**Requirements**: FE-01, FE-02, FE-03, FE-04
**Success Criteria** (what must be TRUE):

  1. AuthContext test passes: stores and exposes the token and user after login, and clears both on logout.
  2. ProtectedRoute test passes: redirects unauthenticated users away and renders children for authenticated users.
  3. Login page test passes: submits credentials and handles both the success and error response states.
  4. Register page test passes: submits registration input and handles both the success and error response states.

**Plans**: TBD

### Phase 6: Root Orchestration & CI Pipeline

**Goal**: A single local command runs the entire test suite, and GitHub Actions runs and enforces it automatically on every push and pull request.
**Depends on**: Phase 3, Phase 5
**Requirements**: SETUP-03, CI-01, CI-02, CI-03
**Success Criteria** (what must be TRUE):

  1. A single root-level npm command runs both the backend and frontend test suites in one invocation.
  2. A GitHub Actions workflow triggers on every push and pull request and runs the full test suite.
  3. The CI workflow provisions the test-database dependency (e.g. a service container) so backend integration tests pass in the pipeline exactly as they do locally.
  4. When any test fails, the CI run fails and the workflow blocks/flags the merge — a red build is visible on the PR.

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 (Phase 4 may be executed in parallel with Phases 1-3 since they are independent workspaces)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Backend Test Tooling & Test Database | 2/2 | Complete   | 2026-07-11 |
| 2. Backend Unit Tests | 2/2 | Complete   | 2026-07-11 |
| 3. Backend Integration Tests | 3/3 | Complete   | 2026-07-11 |
| 4. Frontend Test Tooling | 0/TBD | Not started | - |
| 5. Frontend Component Tests | 0/TBD | Not started | - |
| 6. Root Orchestration & CI Pipeline | 0/TBD | Not started | - |
