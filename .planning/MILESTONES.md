# Milestones

## v1.0 Full-Stack Testing Safety Net (Shipped: 2026-07-12)

**Phases completed:** 6 phases, 13 plans, 29 tasks

**Key accomplishments:**

- Backend workspace now runs `npm test` via Vitest 4.1.10 against a dedicated `env/test.env`, proven end-to-end by a passing smoke spec.
- Vitest globalSetup lifecycle provisions and tears down an isolated `portofolio_test` MySQL database per run, gated by a two-signal safety guard, with row-level fixture helpers and a live connectivity proof spec — full backend suite (6 tests) passes end-to-end against the real, isolated test database.
- Unit regression suite for `backend/src/utils/auth.js` (JWT sign/verify, role guards, reset-token utilities) using plain Vitest and hand-rolled stubs — zero DB connection, zero application source changes.
- Locked in existing password-hashing and validation guarantees with 4 pure in-memory unit tests against `User.validatePassword` and the `beforeCreate` hook, using `User.runHooks` — no DB connection opened, no application code touched.
- Added a shared in-process Apollo `graphql()` test helper and the first backend integration spec, proving register's ADMIN/USER first-user role matrix, duplicate-email rejection, and Sequelize `isEmail` validation rejection.
- Added login mutation and dashboard/me query integration specs, pinning the JWT-issuance contract, the anti-enumeration login rejection message, and ADMIN/USER dashboard access-control behavior via direct role-injected context users.
- Added the requestPasswordReset integration spec (happy-path only, per D-09) and the repo-root KNOWN-ISSUES.md tracking the reset-token exposure as a documented, unfixed High-severity bug.
- Standalone Vitest+jsdom harness for the frontend workspace, with the full React Testing Library kit installed and a passing proof spec proving render/query/matcher/cleanup all wire together.
- AuthContext component tests via a probe-consumer pattern, driving useAuth() through a real AuthProvider with graphqlRequest mocked at the module boundary
- ProtectedRoute route-guard tests covering all four conditional branches (loading, unauthenticated redirect, authorized render, role-mismatch redirect) via a mocked useAuth() and MemoryRouter route tree
- Login and Register pages tested end-to-end through the real AuthProvider, with only graphqlRequest and useNavigate mocked — covering both the success-navigates and error-alert-no-navigate paths for each page.
- Root `npm test` fans out to both workspaces via `--workspaces`, and a new GitHub Actions workflow reproduces that exact command on every push/PR against a health-checked mysql:8.4 service container matching env/test.env credentials.
- Pushed `family` to GitHub and watched .github/workflows/ci.yml go green (run 29196084093, conclusion `success`, backend 39/39 + frontend 12/12 tests passing), then pushed a scratch branch with a deliberately broken assertion and watched the same workflow go red (run 29196296939, conclusion `failure`, log naming `src/smoke.test.js:5:19 AssertionError: expected 2 to be 3`), before fully reverting and deleting the scratch branch.

---
