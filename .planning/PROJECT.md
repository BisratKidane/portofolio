# Portfolio Auth App

## What This Is

A full-stack authentication application built as a portfolio piece: a React + MUI single-page frontend talking to an Express + Apollo GraphQL backend, with user accounts persisted in MySQL via Sequelize. It ships working registration, JWT login, protected routes, a dashboard, and (as of v1.0) a full-stack automated test suite enforced in CI. This milestone hardens the security posture — remediating the account-takeover and brute-force vulnerabilities that v1.0 deliberately documented but left unfixed.

## Core Value

Changes to the app can be made with confidence — auth and core flows are protected by an automated test suite that fails loudly (locally and in CI) before broken code ships.

## Current Milestone: v1.1 Security Remediation

**Goal:** Remediate the security bugs deferred from v1.0 — closing the account-takeover and brute-force vectors — while keeping the test suite green.

**Target features:**
- Reset-token exposure fixed: token delivered via a pluggable mailer (logs to console in dev, wired for a real provider in prod) and dropped from the API response
- JWT secret fail-fast: refuse to boot in production when `JWT_SECRET` is unset or equals the insecure `'change-me'` default
- Rate limiting on `login` / `register` / `requestPasswordReset` to block brute-force, enumeration, and reset-token guessing
- Token/session revocation via `passwordChangedAt` so a password reset invalidates JWTs issued beforehand
- Server-side password strength validation in `register` and `resetPassword`
- Email verification on registration, closing the first-user-becomes-ADMIN land-grab race
- CORS rejection no longer echoes the rejected origin back to the client

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
- ✓ Backend auth utilities (JWT sign/verify, password hashing, role guards) are unit-tested — Validated in Phase 2: Backend Unit Tests (`backend/src/utils/auth.test.js`, `backend/src/models/User.test.js`)
- ✓ Backend GraphQL auth flows (register, login, dashboard/me, requestPasswordReset) are integration-tested against a real test database — Validated in Phase 3: Backend Integration Tests (`backend/test/helpers.js`, `backend/src/resolvers/*.test.js`)
- ✓ Known security bugs surfaced during testing are recorded as tracked known-issues, not fixed — Validated in Phase 3: Backend Integration Tests (`KNOWN-ISSUES.md` — reset-token exposure)
- ✓ Frontend has a working test runner (`npm test` → Vitest) with React Testing Library + jsdom that renders and queries React components — Validated in Phase 4: Frontend Test Tooling (`frontend/vitest.config.js`, `frontend/test/setup.js`, `frontend/src/harness.test.jsx`)
- ✓ Frontend auth surfaces (AuthContext, ProtectedRoute, Login/Register pages) are component-tested — Validated in Phase 5: Frontend Component Tests (`frontend/src/context/AuthContext.test.jsx`, `frontend/src/components/ProtectedRoute.test.jsx`, `frontend/src/pages/Login.test.jsx`, `frontend/src/pages/Register.test.jsx`)
- ✓ A single root `npm test` runs both suites, and a GitHub Actions CI pipeline runs and enforces the full suite on every push/PR (green + red runs proven live; `main` branch protection requires the `test` check) — Validated in Phase 6: Root Orchestration & CI Pipeline (`package.json`, `.github/workflows/ci.yml`, `README.md`)

### Active

<!-- This milestone (v1.1): security remediation. Hypotheses until shipped; scoped in REQUIREMENTS.md. -->

- Reset-token no longer returned over the API; delivered via a pluggable mailer (dev-logs, prod-wired)
- JWT secret fail-fast at startup in production
- Rate limiting on auth-sensitive mutations (login, register, requestPasswordReset)
- Token/session revocation via `passwordChangedAt`
- Server-side password strength validation
- Email verification on registration (fixes first-user-ADMIN race)
- CORS rejection no longer leaks the rejected origin

### Out of Scope

<!-- Explicit boundaries with reasoning to prevent re-adding. -->

- Live email-provider account/credentials — v1.1 ships a pluggable mailer that logs the token in dev and is wired for a provider in prod; standing up an actual SES/SendGrid/Postmark account is a deployment concern, not this milestone
- Full OAuth / social login / MFA — this milestone hardens the existing email+password flow, it does not add new auth methods
- Refresh-token / short-lived-access-token rotation — revocation is handled via `passwordChangedAt` invalidation; a full refresh-token architecture is deferred
- 100% / exhaustive coverage targets — the goal is a meaningful safety net over auth + core flows, not a coverage-number chase
- Full browser end-to-end tests (Playwright/Cypress) — deferred; backend integration + frontend component tests cover the safety-net need for now
- Infra hardening (Sequelize migrations vs `sync()`, Node 18 EOL upgrade, production frontend Docker build) — real concerns, but a separate milestone from security remediation
- UI redesign — frontend changes this milestone are limited to what the security fixes require (reset flow, registration verification UX)

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
| Test the full stack (backend + frontend) in this milestone | User wants a safety net before adding new features; auth spans both layers | ✓ Good — 51 tests across both workspaces (backend 39, frontend 12) validated in v1.0 |
| Include a GitHub Actions CI pipeline | A safety net only works if enforced; unenforced tests rot, and CI is the portfolio-visible signal | ✓ Good — CI runs on every push/PR; `main` branch protection requires the `test` check (red build proven live to block merge) |
| Test-only for known bugs; document, don't fix | Keeps milestone scope clean; remediation is its own milestone with its own risk profile | ✓ Good — reset-token exposure + others tracked in `KNOWN-ISSUES.md`, none fixed |
| Propose Vitest as the shared runner | One tool works for the ESM backend and the Vite/React frontend; less config surface | ✓ Good — Vitest 4.1.10 confirmed and used across both workspaces |
| No browser E2E this milestone | Backend integration + frontend component tests meet the safety-net need at lower cost | ✓ Good — component + integration coverage met the safety-net need |
| v1.1: remediate ALL documented security issues (7), not just the flagship reset-token bug | v1.0's test suite makes wholesale auth changes safe; fixing them together avoids re-touching the same resolvers repeatedly | Pending v1.1 |
| v1.1: reset token delivered via a pluggable mailer that logs in dev, wired for a provider in prod | Portfolio app — closes the account-takeover vector without requiring a live email account; same mailer backs email verification | Pending v1.1 |
| v1.1: each fix is test-driven; v1.0 tests that document bugs get flipped to assert the fixed behavior | The safety net only stays meaningful if it tracks the new intended behavior; CI must stay green | Pending v1.1 |
| v1.1 is a minor bump (v1.1, not v2.0) | Hardening + fixes on the existing feature set; no new auth methods or rewrite | Pending v1.1 |

## Current State

**Shipped: v1.0 Full-Stack Testing Safety Net (2026-07-12).** The app now has an automated test suite across the whole stack — 51 tests (backend 39: unit + integration; frontend 12: component), a Vitest runner in each workspace, an isolated MySQL test database provisioned/torn down per run, a single root `npm test`, and a GitHub Actions CI pipeline that runs and enforces the suite on every push/PR. `main` branch protection requires the `test` check, so a red build blocks merge (proven live). No application runtime behavior was changed; known security bugs are documented in `KNOWN-ISSUES.md`, not fixed. Delivered via PR #2 (family → main).

## Next Milestone Goals

Candidate directions after v1.1 (to be refined via `/gsd:new-milestone`):
- **Coverage expansion** — extend tests to the remaining pages/flows (Dashboard, ForgotPassword/ResetPassword UI) and add browser E2E (Playwright/Cypress) if the safety net needs to cover full user journeys.
- **Infra hardening** — Sequelize migrations instead of `sync()`, upgrade off EOL Node 18 (repo already runs Node 24 via `.nvmrc`; docs still say 18), production frontend Docker build instead of the dev server.
- **Live email provider** — stand up a real SES/SendGrid/Postmark integration behind the v1.1 mailer abstraction (deployment concern deferred out of v1.1).

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
*Last updated: 2026-07-12 — v1.1 Security Remediation milestone started*
