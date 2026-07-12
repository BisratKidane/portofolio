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

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 6 | 13 | Established GSD wave execution + live-fire CI verification for this project |

### Cumulative Quality

| Milestone | Tests | Zero-Dep Additions |
|-----------|-------|--------------------|
| v1.0 | 51 (backend 39, frontend 12) | Test tooling only; no new runtime deps |

### Top Lessons (Verified Across Milestones)

1. Verify against real infrastructure, not just static config review. *(v1.0)*
