# Milestones

## v1.1 Security Remediation (Shipped: 2026-07-21)

**Phases completed:** 5 phases (7–11), 19 plans, 42 tasks
**Timeline:** 2026-07-12 → 2026-07-21 (9 days) · 63 files changed, +3,340/−137 (backend + frontend)
**Delivered:** Remediated all 7 security bugs v1.0 documented but left unfixed — closing account-takeover, brute-force, stale-session, and privilege-escalation vectors — TDD red-green-refactor with CI green throughout. Shipped via PR #2 (family → main).

**Key accomplishments:**

- Reset-token exposure closed: the token is now delivered only to the account owner via a pluggable `sendMail()` mailer (console driver in dev/test, SMTP-wired for prod), dropped from the API schema entirely, and stored `sha256`-hashed at rest.
- JWT-secret production fail-fast: the backend refuses to boot when `NODE_ENV=production` and `JWT_SECRET` is unset or the insecure `'change-me'` default — while dev/test keep booting on the weak shared secret (the full suite stays green).
- Per-IP rate limiting on `login` (5/15min) / `register` / `requestPasswordReset` (5/hour), implemented as an Apollo plugin keyed off the parsed GraphQL operation AST (closing an operation-rename bypass) and testable via the in-process `executeOperation()` harness; 429-count parity proven so it adds no enumeration oracle.
- Session revocation via `passwordChangedAt`: a password reset immediately invalidates any JWT issued beforehand (`getUserFromRequest` rejects tokens whose `iat` predates it, null-safe seconds-floor compare), proven by a same-second boundary test.
- Server-side 8-char password minimum enforced in `register` and `resetPassword` before hashing.
- Email verification on registration: `register` returns a message-only payload (no JWT/session/ADMIN), `verifyEmail(token)` logs the user in, `login` rejects unverified accounts, and `resendVerificationEmail` recovers lost tokens; frontend gained a `/verify-email` route and a "check your email" register state.
- First-user-becomes-ADMIN land-grab race closed with a DB-enforced guarantee: `verifyEmail` runs token-consumption + a locking `SELECT COUNT(*) … FOR UPDATE` admin-count read + conditional promotion inside one `sequelize.transaction`, with retry-once-on-`ER_LOCK_DEADLOCK` so a losing racer still gets a valid session. Independently re-verified (reverting the fix fails the concurrency test 3/3 with `Deadlock found`).
- CORS rejection no longer echoes the rejected origin to the client — it's logged server-side and the client-facing error is generic. Verified via a new HTTP-level (supertest) test harness against an importable Express `app`.

**Verification:** All 5 phases passed GSD verification (Phase 11 re-verified 8/8 after gap-closure plan 11-08). Backend suite 121/121 green; Phase 11 concurrency test stable across 5 consecutive real-MySQL runs. SC-5 manual boot-and-verify (migration + 8-step register→verify→dashboard flow) signed off 2026-07-21. Open-artifact audit clear at close; no milestone audit run (waived — all phases individually verified).

---

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
