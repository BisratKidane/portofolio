# Portfolio Auth App

## What This Is

A full-stack authentication application built as a portfolio piece: a React + MUI single-page frontend talking to an Express + Apollo GraphQL backend, with user accounts persisted in MySQL via Sequelize. It currently ships working registration, JWT login, protected routes, and a dashboard. This milestone adds an automated testing foundation across the whole stack so the app can keep growing without silently breaking authentication.

## Core Value

Changes to the app can be made with confidence — auth and core flows are protected by an automated test suite that fails loudly (locally and in CI) before broken code ships.

## Requirements

### Validated

<!-- Existing, working capabilities inferred from the codebase map (.planning/codebase/). -->

- ✓ User can register with email/password (bcrypt-hashed) — existing (`backend/src/resolvers/user.resolver.js`, `backend/src/models/User.js`)
- ✓ User can log in and receive a JWT — existing (`backend/src/utils/auth.js`)
- ✓ Authenticated user can access protected routes / dashboard — existing (`frontend/src/components/ProtectedRoute.jsx`, `backend/src/resolvers/user.resolver.js`)
- ✓ GraphQL API served over Express + Apollo Server — existing (`backend/src/server.js`)
- ✓ Data persisted in MySQL via Sequelize ORM — existing (`backend/src/models/`, `backend/src/config/database.js`)
- ✓ React + MUI frontend with AuthContext + centralized GraphQL client — existing (`frontend/src/context/AuthContext.jsx`, `frontend/src/api/graphqlClient.js`)
- ✓ Dockerized dev environment (backend, frontend, MySQL) — existing (`docker-compose.yml`)
- ✓ Backend has a working test runner (`npm test` → Vitest) with a safe, isolated test database — Validated in Phase 1: Backend Test Tooling & Test Database (`backend/vitest.config.js`, `backend/test/globalSetup.js`, `backend/test/guard.js`)

### Active

<!-- This milestone: a full-stack testing safety net. Hypotheses until shipped. -->

- [ ] Backend auth utilities (JWT sign/verify, password hashing, role guards) are unit-tested
- [ ] Backend GraphQL resolvers (register, login, dashboard, password reset) are integration-tested against a test database
- [ ] Frontend has a working test runner with React Testing Library + jsdom
- [ ] Frontend auth surfaces (AuthContext, ProtectedRoute, Login/Register pages) are component-tested
- [ ] A CI pipeline runs the full test suite on every push and pull request
- [ ] Known security bugs surfaced during testing are documented as tracked known-issues (not fixed here)

### Out of Scope

<!-- Explicit boundaries with reasoning to prevent re-adding. -->

- Fixing the known security bugs (reset-token leak, insecure JWT-secret fallback, missing rate limiting) — deliberately deferred to a dedicated follow-up milestone; this milestone characterizes current behavior and documents the bugs, it does not remediate them
- 100% / exhaustive coverage targets — the goal is a meaningful safety net over auth + core flows, not a coverage-number chase
- Full browser end-to-end tests (Playwright/Cypress) — deferred; backend integration + frontend component tests cover the safety-net need for now
- New product features or UI redesign — this milestone is testing infrastructure only

## Context

- **Brownfield project.** A full codebase map exists in `.planning/codebase/` (STACK, ARCHITECTURE, STRUCTURE, CONVENTIONS, TESTING, INTEGRATIONS, CONCERNS). Planning agents should read these rather than re-deriving the architecture.
- **No tests exist today.** There is no test framework, no test files, no linter/formatter config, and no CI in either the `backend` or `frontend` npm workspace. This milestone stands that up from zero.
- **npm workspaces monorepo.** Root `package.json` declares `workspaces: ["backend", "frontend"]`; a single `package-lock.json` at the root. ES Modules throughout (backend `"type": "module"`, frontend is Vite/JSX).
- **Known issues to keep in mind (from CONCERNS.md):** `requestPasswordReset` returns the raw reset token to any caller (account-takeover risk), insecure default JWT secret fallback, no auth-mutation rate limiting, no token/session revocation, `sequelize.sync()` instead of migrations, EOL Node 18 pinned, and the frontend Docker image runs the Vite dev server rather than a production build. Tests written this milestone should document — not fix — these.

## Constraints

- **Tech stack**: JavaScript ES Modules, Node 18.x, npm workspaces — tests must run under the existing ESM + workspace setup without a bundler rewrite.
- **Test tooling (proposed)**: Vitest as the single runner across backend and frontend; React Testing Library + jsdom for the frontend; resolver integration via Apollo `executeOperation`. To be confirmed/version-pinned in the research phase.
- **Database**: backend integration tests need an isolated test database (or in-memory/containerized MySQL) so they don't touch dev data.
- **CI**: GitHub Actions, running the workspace test suite on push/PR.
- **Non-destructive**: this milestone must not change application runtime behavior — it only adds tests, tooling, and CI config.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Test the full stack (backend + frontend) in this milestone | User wants a safety net before adding new features; auth spans both layers | — Pending |
| Include a GitHub Actions CI pipeline | A safety net only works if enforced; unenforced tests rot, and CI is the portfolio-visible signal | — Pending |
| Test-only for known bugs; document, don't fix | Keeps milestone scope clean; remediation is its own milestone with its own risk profile | — Pending |
| Propose Vitest as the shared runner | One tool works for the ESM backend and the Vite/React frontend; less config surface | — Pending (confirm in research) |
| No browser E2E this milestone | Backend integration + frontend component tests meet the safety-net need at lower cost | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-11 after initialization*
