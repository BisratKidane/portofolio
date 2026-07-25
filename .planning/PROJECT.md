# Portfolio Auth App

## What This Is

A full-stack authentication application built as a portfolio piece: a React + MUI single-page frontend talking to an Express + Apollo GraphQL backend, with user accounts persisted in MySQL via Sequelize. It ships email-verified registration, JWT login with server-side session revocation, rate-limited auth mutations, protected routes, a dashboard, and (as of v1.0) a full-stack automated test suite enforced in CI. As of v1.1 the security posture is hardened — the account-takeover, brute-force, stale-session, and first-user-ADMIN privilege-escalation vulnerabilities that v1.0 deliberately documented are remediated.

## Core Value

Changes to the app can be made with confidence — auth and core flows are protected by an automated test suite that fails loudly (locally and in CI) before broken code ships.

## Current Milestone: v2.0 Collaborative Family Tree

**Goal:** Add a family-tree domain where app access is gated on being an admin-linked member; members collaboratively edit their immediate relatives on `/manage`, and any linked member views a deep, pan/zoom tree on `/family` — built test-first (TDD) with CI staying green.

**Target features:**
- Family member model (Sequelize/MySQL): `firstname`\*, `lastname`\*, `gender`\* (required), derived `fullname`, plus `mothersname`, `email`, `birthdate`, `deathdate`, `phone`, `address`, `profilePicture`
- Relationships: parent↔child + spouse; siblings derived from shared parents; sibling `firstname` uniqueness as the dedup guard
- Photo upload stored on a mounted Docker volume, served via a backend file route
- Membership-gated access: register → email-verify (v1.1) → account inactive until an admin links it to a member node; unlinked users hit a "pending" gate
- `/manage`: member-users add/edit/remove their **immediate** relatives (parents, spouse, children, siblings) with a visible editable-members list; admins manage the **whole** tree and link accounts to member nodes
- `/family`: deep pan/zoom tree visualization for any linked member (library selected in research)
- GraphQL schema + resolvers for member CRUD, relationships, photo upload, and account↔member linking — role- and scope-guarded
- Full test coverage: backend unit + integration, frontend component, TDD red-green, CI green

**Deferred to a later milestone:** invitation/registration links (email + WhatsApp), automated WhatsApp, full genealogy (multiple marriages / half-siblings / adoptions), inline tree-editing, GEDCOM import/export, object-storage photos, browser E2E.

## Shipped Milestone: v1.1 Security Remediation (2026-07-21)

**Goal (met):** Remediate the security bugs deferred from v1.0 — closing the account-takeover and brute-force vectors — while keeping the test suite green. All 28 requirements delivered, all 5 phases (7–11) verified.

**Delivered:**
- Reset-token exposure fixed: token delivered via a pluggable mailer (console in dev, SMTP-wired in prod), dropped from the API response, and hashed at rest
- JWT secret fail-fast: production boot refuses an unset or `'change-me'` `JWT_SECRET`
- Per-IP rate limiting on `login` / `register` / `requestPasswordReset` (AST-keyed Apollo plugin)
- Token/session revocation via `passwordChangedAt` invalidating pre-reset JWTs
- Server-side 8-char password minimum in `register` and `resetPassword`
- Email verification on registration, closing the first-user-becomes-ADMIN land-grab race with a DB-enforced atomic verify+promote
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
- ✓ Reset token no longer returned over the API; delivered via a pluggable mailer (dev-logs, prod-wired) and hashed at rest — v1.1 (Phases 8, 9)
- ✓ JWT secret fail-fast at startup in production — v1.1 (Phase 7)
- ✓ Rate limiting on auth-sensitive mutations (login, register, requestPasswordReset), AST-keyed — v1.1 (Phase 10)
- ✓ Token/session revocation via `passwordChangedAt` — v1.1 (Phase 9)
- ✓ Server-side 8-char password strength validation — v1.1 (Phase 7)
- ✓ Email verification on registration, with a DB-enforced race-safe first-user-ADMIN assignment — v1.1 (Phase 11)
- ✓ CORS rejection no longer leaks the rejected origin — v1.1 (Phase 7)

### Active

<!-- v2.0 Collaborative Family Tree scoped and confirmed. REQ-IDs defined in REQUIREMENTS.md at milestone start; see "Current Milestone: v2.0" above for target features. -->

- v2.0 Collaborative Family Tree requirements being defined in `.planning/REQUIREMENTS.md` (see Current Milestone section above).

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

- **TDD, red-green-refactor (v1.1)**: Every security fix is driven test-first — write a failing test that asserts the secure behavior (red), implement the minimum to pass (green), then refactor. v1.0 tests that currently document a bug get flipped to assert the fixed behavior as the red step. No fix lands without a test that fails before it and passes after; CI stays green on `main`.
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
| v1.1: remediate ALL documented security issues (7), not just the flagship reset-token bug | v1.0's test suite makes wholesale auth changes safe; fixing them together avoids re-touching the same resolvers repeatedly | ✓ Good — all 7 remediated across Phases 7–11, CI green throughout |
| v1.1: reset token delivered via a pluggable mailer that logs in dev, wired for a provider in prod | Portfolio app — closes the account-takeover vector without requiring a live email account; same mailer backs email verification | ✓ Good — one `sendMail()` abstraction backs both reset and verification |
| v1.1: each fix is test-driven; v1.0 tests that document bugs get flipped to assert the fixed behavior | The safety net only stays meaningful if it tracks the new intended behavior; CI must stay green | ✓ Good — every fix TDD'd red-green; backend suite 121/121 at close |
| v1.1 is a minor bump (v1.1, not v2.0) | Hardening + fixes on the existing feature set; no new auth methods or rewrite | ✓ Good — shipped as v1.1 |
| v1.1: verify+promote made atomic via one transaction + `FOR UPDATE` + retry-once-on-deadlock (Phase 11 CR-01 Option B) | Statement-level timing was non-atomic under real MySQL concurrency (burned the losing racer's token); a locking read structurally serializes verifiers | ✓ Good — re-verified 8/8; reverting the fix fails the concurrency test 3/3 |
| v1.1: rate limiting keyed off the parsed GraphQL operation AST, not the client `operationName` string | The client-supplied name is spoofable — an attacker could rename an operation to dodge the limit | ✓ Good — closed the rename bypass; 0-match grep proof on `operationName` |
| v2.0 (post-Phase 17): replace the `/family` union-node "spouses-paired" edge model with a pure parent→child hierarchy | The union-only model draws an edge solely for a two-parent child whose parents are a registered spouse pair; the real data has 0 spouse rows and 0 two-parent children, so the tree rendered with zero edges. User chose a plain hierarchical tree (direct edge from each parent to each child). | ✓ Good — supersedes TREE-01 paired-spouse rendering + D-11/D-12; real data now 9 members → 7 edges; `UnionNode` and union machinery removed; suite green (backend 321/321, frontend 169/169). Commits 305dfa6/c23f8b8/5c897e2 |

## Current State

**Shipped: v1.0 Full-Stack Testing Safety Net (2026-07-12).** The app now has an automated test suite across the whole stack — 51 tests (backend 39: unit + integration; frontend 12: component), a Vitest runner in each workspace, an isolated MySQL test database provisioned/torn down per run, a single root `npm test`, and a GitHub Actions CI pipeline that runs and enforces the suite on every push/PR. `main` branch protection requires the `test` check, so a red build blocks merge (proven live). No application runtime behavior was changed; known security bugs are documented in `KNOWN-ISSUES.md`, not fixed. Delivered via PR #2 (family → main).

**Shipped: v1.1 Security Remediation (2026-07-21).** All 7 documented security bugs remediated across Phases 7–11 (19 plans, 42 tasks), TDD red-green-refactor with CI green throughout: reset-token exposure closed (mailer-delivered, dropped from the API, hashed at rest), JWT production fail-fast, per-IP AST-keyed rate limiting, `passwordChangedAt` session revocation, 8-char password minimum, email-verified registration, and a DB-enforced race-safe first-verified-user-ADMIN assignment (atomic transaction + `FOR UPDATE` + deadlock retry). All 5 phases verified (Phase 11 re-verified 8/8 after gap-closure plan 11-08); backend suite 121/121 green; SC-5 manual boot-and-verify signed off. Shipped via PR #2 (family → main).

**In progress: v2.0 Collaborative Family Tree.** Phase 12 (Family Data Model Foundation) complete — the family-tree data model exists and is provably correct before any resolver/permission/UI logic is built on it: `FamilyMember` model (required firstname/lastname/gender, derived `fullname`, optional fields), self-referencing `motherId`/`fatherId` FKs with `ON DELETE SET NULL`, a symmetric `Spouse` join model with canonical ordered-pair hashing, a hand-rolled cycle-prevention ancestor-walk, and transactional `deleteMember` with married-in one-hop delete semantics (D-03/D-04). Verified 5/5; backend suite 171/171 green; TDD red-green throughout. Requirements MEM-01/02/03/05 and REL-01/02/03/05 validated. Advisory code review (12-REVIEW.md) flagged latent ID string/number coercion (WR-01) and a founding-couple delete edge case (WR-02) to revisit when resolvers land in Phase 14.

**Phase 15 (Sibling Dedup Guard & /manage Self-Service UI) complete (2026-07-23).** Members now have a working `/manage` page — grouped relationship panels, real add/edit forms via a single relationType-parameterized `AddRelativeDialog` and an `EditMemberDialog` — and admins manage the whole tree (searchable paginated table, delete-with-confirm, account linking re-homed into `/manage`). The REL-06 duplicate-child guard is enforced for every `addChild` caller. Executed as 6 plans across 3 waves (parallel worktree agents), TDD throughout. Code review found one Critical TOCTOU race (CR-01): the guard's plain duplicate-check `SELECT` read a stale REPEATABLE-READ snapshot because the resolvers `findByPk` the target before the guard; fixed test-first with a deterministic resolver-path race repro and a `LOCK.UPDATE` locking read. Verified 9/9 must-haves; backend 281/281, frontend 90/90 green. Requirements REL-06 and MNG-01..04 validated. 4 Warnings + 4 Info remain advisory (self-not-found crash path, proactive D-05 message, pagination clamp, admin self-delete UX).

**Phase 16 (Photo Upload) complete (2026-07-24).** Members now have profile pictures: a dedicated non-GraphQL `POST/DELETE/GET /api/family-members/:id/photo` route (the app's first non-Apollo route), stored on a durable named Docker volume (`photo_uploads`, live-verified to survive a full rebuild). Uploads are hardened — magic-byte type sniffing via `file-type` (multipart Content-Type and client filename never trusted), server-generated UUID filenames (no path traversal), 5 MB cap, and write paths scope-gated with the existing `requireFamilyAccess`/`computeEditableScope` primitives while the serve route is any-valid-JWT (D-07). Frontend: authenticated blob-fetch avatars, a react-easy-crop 512×512 dialog, and wiring across MemberCard/RelationshipGroupedPanel/ManagePage/AdminMemberTable. Executed as 7 plans across 6 waves (parallel worktree agents), TDD throughout (adversarial-first per SC-3). Code review found 1 Critical + 4 Warnings; CR-01 (photo-replace orphaned blobs on commit failure — the delete-old ran inside a managed transaction, pre-commit) plus WR-01 (auth errors → 500 not 401/403) and WR-02 (delete unlinked before nulling the column) were fixed test-first with 4 new regression tests; the unmanaged-transaction rewrite makes delete-old provably post-commit. WR-04 was a false positive (Node 24, not the doc's stale 18). Verified 4/4 must-haves; backend 319/319, frontend 115/115 green. Requirements PHOTO-01/02/03 and QUAL-01 validated. Two browser-dependent items (real Canvas crop pipeline, remove-photo flow) tracked in 16-HUMAN-UAT.md; WR-03 (photoClient cross-origin baseURL) is a tracked non-blocking follow-up.

**Phase 17 (/family Deep Tree Visualization) complete (2026-07-25) — closes v2.0.** Any linked member can now explore the whole family at `/family` as a pannable, zoomable tree: spouses shown paired via synthetic union nodes, collapse/expand in both descendant and ancestor directions, and the four D-05 nav aids (find-me, search, zoom/fit/reset, minimap). Built on `@xyflow/react` + `@dagrejs/dagre`, with a pure client-side forest-assembly module and a dagre layout wrapper proven at ~18-generation synthetic depth. The `familyMembers` GraphQL guard was relaxed from admin-only to linked-member-or-admin (D-13) so the page reuses the same flat query the admin branch already uses, with an adversarial suite proving unlinked non-admins are still rejected and the Phase 14 `linkedUser` field-gate is untouched (D-14). The SC-1 render pattern passed a human visual gate (D-11) before any production UI was built; RESEARCH.md's `minlen:0` dagre marriage-edge technique was found to crash at runtime (upstream dagrejs/dagre#280) and replaced with a working union-midpoint mechanism (D-12). Executed as 4 plans across 3 waves, TDD throughout. Code review found 1 Critical (CR-01: interactive expand left two-parent union nodes/edges hidden, rendering revealed relatives disconnected) — fixed test-first (`buildUnionConnections`/`revealConnectingUnions` applied in both toggle paths). Verified 10/10 must-haves; backend 321/321, frontend 167/167 green with zero new CI config (QUAL-03). Requirements TREE-01/02/03/04 and QUAL-02/03 validated. 3 Warnings + 3 Info remain advisory; no SECURITY.md yet for this authz-relaxing phase.

**Post-Phase 17 amendment (2026-07-25): `/family` edge model switched to a pure parent→child hierarchy.** The union-node "spouses-paired" rendering (TREE-01, D-11/D-12) drew an edge only for a two-parent child whose parents were a registered spouse pair — and the real data has 0 spouse rows and 0 two-parent children, so the tree rendered with no edges at all. At the user's request the model was replaced with a plain hierarchical tree: a direct edge from each present parent to each child, no synthetic union nodes. `UnionNode.jsx`, the `buildUnions`/marriage/descent assembly machinery, the dagre union-midpoint layout workaround, and the CR-01 `buildUnionConnections`/`revealConnectingUnions` reveal logic were all removed (CR-01 no longer applies — member→child edges reveal directly). TDD across 3 atomic refactor commits (305dfa6/c23f8b8/5c897e2); full suite green (backend 321/321, frontend 169/169); verified against real data (9 members → 7 direct parent→child edges). REQUIREMENTS.md TREE-01 and 17-VERIFICATION.md carry matching superseded notes.

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
*Last updated: 2026-07-25 — Phase 17 complete; v2.0 milestone execution complete; /family edge model amended to pure parent→child hierarchy*
