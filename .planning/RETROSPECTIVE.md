# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — Full-Stack Testing Safety Net

**Shipped:** 2026-07-12
**Phases:** 6 | **Plans:** 13 | **Tasks:** 29

### What Was Built
- Vitest test runner in both the backend and frontend workspaces, plus a single root `npm test` fanning out via `--workspaces`.
- An isolated `portofolio_test` MySQL database provisioned/torn down per run, gated by a two-signal safety guard (`NODE_ENV=test` + DB name matching `/_test$/`) so tests can never touch dev data.
- Backend unit tests (JWT sign/verify, password hashing, role guards) and integration tests (register, login, dashboard/me, requestPasswordReset) against the real test DB.
- Frontend component tests for AuthContext, ProtectedRoute, and the Login/Register pages.
- A GitHub Actions CI pipeline running the exact local command against a `mysql:8.4` service container, proven live green (run 29196084093) and red (run 29196296939), with `main` branch protection requiring the `test` check.
- `KNOWN-ISSUES.md` documenting the reset-token exposure and other bugs surfaced but deliberately not fixed.

### What Worked
- **Horizontal-layer phase order** (tooling → unit → integration, per stack half, then CI last) meant every phase's dependencies already existed — no rework from missing prerequisites.
- **A hard test-DB guard** made "tests never touch dev data" a structural guarantee, not a convention.
- **Live-fire CI verification** (Phase 6 Plan 2) caught what local reasoning can't: pushing real green and deliberately-red runs proved the pipeline end-to-end before the phase was called done.
- **Reusing the exact `npm test` in CI** ("what runs locally is what runs in CI") kept the pipeline honest with zero CI-only divergence.

### What Was Inefficient
- The `main`-vs-`family` branch gap (125 commits) surfaced only at ship/complete time; deciding tag-vs-merge ordering late added a round-trip. Deciding the merge/tag strategy up front would have been smoother.
- README carried stale "Node.js 18" references while the repo moved to Node 24 (`.nvmrc`); the drift was correctly scoped out but flagged repeatedly by review — worth a dedicated cleanup pass.
- Branch protection couldn't be enabled until the repo was made public — a GitHub plan-tier constraint discovered during verification rather than planning.

### Patterns Established
- **Probe-consumer pattern** for testing React context (`useAuth()` driven through a real provider with the API mocked at the module boundary).
- **Two-signal test-DB safety guard** as the standard gate before any DB-touching test run.
- **Deliberate-failure smoke test** as the CI-03 phase-gate check (push a broken assertion on a scratch branch, confirm red, revert).
- **Document-don't-fix** for security bugs surfaced mid-milestone — tracked in `KNOWN-ISSUES.md` for a dedicated remediation milestone.

### Key Lessons
1. Verify CI against real infrastructure, not just YAML review — service containers, action pins, and health-check timing can all look correct and still fail live.
2. "Blocks merge" and "red build visible" are two different requirements — the visible-red half is code; the blocks-merge half is account/branch-protection config that can be gated by platform tier.
3. Decide branch/merge/tag strategy at milestone start, not at ship time, when the feature branch has diverged far from the default branch.

### Cost Observations
- Model mix: predominantly Opus (orchestration) + Sonnet (executor/verifier subagents).
- Notable: wave-based execution with fresh-context subagents kept the orchestrator lean across a 6-phase milestone; live CI verification was the highest-value single step.

---

## Milestone: v1.1 — Security Remediation

**Shipped:** 2026-07-21
**Phases:** 5 (7–11) | **Plans:** 19 | **Tasks:** 42

### What Was Built
- Reset-token exposure closed: pluggable `sendMail()` mailer (console in dev/test, SMTP-wired for prod), token dropped from the API schema, stored `sha256`-hashed at rest.
- JWT-secret production fail-fast (unset/`change-me` refuses boot); dev/test unaffected.
- Per-IP rate limiting on login/register/requestPasswordReset as an Apollo plugin keyed off the parsed operation AST, testable via `executeOperation()`, with 429-count parity (no enumeration oracle).
- Session revocation via `passwordChangedAt` (null-safe seconds-floor compare, same-second boundary proven).
- Server-side 8-char password minimum in register + resetPassword.
- Email-verified registration (message-only register, `verifyEmail`, unverified-login rejection, `resendVerificationEmail`, `/verify-email` route) with a DB-enforced race-safe first-verified-user-ADMIN assignment.
- CORS rejection no longer echoes the origin; verified via a new HTTP-level supertest harness.

### What Worked
- **Dependency-first phase sequencing** (foundation → mailer → passwordChangedAt on the same resolver → rate limiting after resolvers stabilized → verification last) meant each shared resolver was touched once, not repeatedly re-edited with unrelated changes interleaved.
- **TDD red-green on real MySQL** caught what unit-level reasoning missed: the phase verifier reproduced VERIFY-04's ADMIN promotion as non-atomic under genuine concurrency, and the gap-closure test was proven to fail against the pre-fix resolver before the fix landed.
- **Independent re-verification that didn't trust the SUMMARY** (reverting the fix and watching the concurrency test fail 3/3) turned "tests pass" into "this test actually guards the invariant."
- **Manual boot-and-verify (SC-5) as an explicit acceptance step** covered the `sequelize.sync()`-won't-alter-existing-tables blind spot that CI's force-recreate can never surface.

### What Was Inefficient
- **The same `main`-vs-`family` branch-strategy gap from v1.0 recurred and grew** (125 → 286 commits): the single long-lived branch and stale `origin/main` meant the "Phase 11" ship was really a whole-branch/milestone PR, and tag-vs-merge timing again had to be decided late. The v1.0 lesson ("decide branch strategy at milestone start") was recorded but not acted on.
- **A plan's literal test design didn't survive contact with real InnoDB locking** (no index on `role` → full-table locks), so the RED harness had to be empirically re-derived (two symmetric transactional promoters) mid-execution — a sign the plan under-modeled the DB's actual lock behavior.
- **Requirement checkboxes in REQUIREMENTS.md drifted** — many stayed `[ ]` though their phases had passed verification; status had to be reconciled at milestone close from phase verification rather than being maintained continuously.

### Patterns Established
- **AST-keyed rate limiting** — never trust the client-supplied `operationName`; key limits off the parsed GraphQL operation to close rename bypasses.
- **Adversarial re-verification** — revert the fix and confirm the new test fails, as the standard proof that a regression guard is real.
- **Transaction + `FOR UPDATE` for read-check-write invariants** under concurrency, with retry-once-on-`ER_LOCK_DEADLOCK` so a losing racer still completes.
- **Manual boot-and-verify checkpoint** for schema changes on already-provisioned DBs (the `sync()` gap).

### Key Lessons
1. For "check a count, then conditionally write" invariants, statement-level timing is not atomic under real concurrency — a single transaction with a locking read is the structural fix, and the regression test must run against real MySQL, not a mock.
2. A concurrency test only counts if it's proven to fail against the broken code — assert that before trusting the green.
3. Act on carried-forward process lessons: the branch/merge/tag strategy should be settled at milestone *start*; deferring it a second time doubled the divergence.

### Cost Observations
- Model mix: Opus (orchestration) + Sonnet-class executor/verifier subagents; the Phase 11 gap-closure executor empirically probed 5 harness designs against the live DB (higher cost, but it produced an honest RED the plan's design couldn't).
- Notable: the highest-value step was the verifier independently reverting the fix to confirm the guard — cheap relative to shipping a silently-broken invariant.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 6 | 13 | Established GSD wave execution + live-fire CI verification for this project |
| v1.1 | 5 | 19 | Dependency-first sequencing on shared resolvers; adversarial re-verification (revert-to-confirm-RED); real-DB concurrency TDD |

### Cumulative Quality

| Milestone | Tests | Zero-Dep Additions |
|-----------|-------|--------------------|
| v1.0 | 51 (backend 39, frontend 12) | Test tooling only; no new runtime deps |
| v1.1 | 121 backend green at close | nodemailer (mailer); no framework changes |

### Top Lessons (Verified Across Milestones)

1. Verify against real infrastructure, not just static config review. *(v1.0, reinforced v1.1 — real-MySQL concurrency)*
2. A test only counts once it's proven to fail against the broken code. *(v1.1)*
3. Settle branch/merge/tag strategy at milestone start — deferring it compounded the divergence across v1.0→v1.1. *(v1.0, recurred v1.1)*
