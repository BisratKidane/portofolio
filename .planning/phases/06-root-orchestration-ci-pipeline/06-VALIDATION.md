---
phase: 6
slug: root-orchestration-ci-pipeline
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-12
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.10 (both workspaces, already configured — Phases 1-5; unchanged by this phase) |
| **Config file** | `backend/vitest.config.js`, `frontend/vitest.config.js` (existing, unchanged) |
| **Quick run command** | `npm test` (repo root — this phase has no partial/quick vs. full distinction, it's already the whole suite) |
| **Full suite command** | `npm test` (repo root) — same command CI uses (D-02) |
| **Estimated runtime** | ~7 seconds combined locally (backend + frontend Vitest runs); GitHub Actions run additionally includes MySQL service-container health-check startup + `npm ci` + `npm test`, typically completing within a few minutes |

---

## Sampling Rate

- **After every task commit:** Run `npm test` (repo root)
- **After every plan wave:** Run `npm test` (repo root) locally to confirm the local contract; Wave 2 (06-02) additionally requires pushing to GitHub and observing the triggered Actions run via `gh run watch`/`gh run view --json conclusion` or the Actions UI
- **Before `/gsd:verify-work`:** Full suite must be green locally AND the most recent GitHub Actions run for the pushed commit must show a `success` conclusion
- **Max feedback latency:** ~7 seconds locally; a live GitHub Actions run is the slower path (service-container health check + install + test), used only for the live-fire proof in 06-02

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | SETUP-03 | — | Root `npm test` fans out to both workspaces sequentially, propagates non-zero exit on failure | integration | `npm test 2>&1 \| tail -60; echo "EXIT:$?"` | ✅ | ⬜ pending |
| 06-01-02 | 01 | 1 | CI-01 / CI-02 / CI-03 | T-06-01 / T-06-02 / T-06-03 / T-06-04 | `.github/workflows/ci.yml` triggers on push/PR, provisions a health-checked `mysql:8.4` service container matching `env/test.env`, pins action versions, no env-rewriting | structural (grep) | `test -f .github/workflows/ci.yml && grep -Ec "image: mysql:8.4\|actions/checkout@v7\|actions/setup-node@v6\|node-version-file: '.nvmrc'\|npm ci\|npm test" .github/workflows/ci.yml` | ❌ W0 (new file, created by this task) | ⬜ pending |
| 06-01-03 | 01 | 1 | CI-03 (D-07 enforcement half) | — | README documents the one-time branch-protection step needed to make the CI check merge-blocking | structural (grep) | `grep -c "^## " README.md; grep -q "Require status checks to pass before merging" README.md && echo FOUND` | ✅ | ⬜ pending |
| 06-02-01 | 02 | 2 | CI-01 / CI-02 | — | A real push triggers `.github/workflows/ci.yml` on GitHub; the run reaches a `success` conclusion against a live GitHub-hosted MySQL service container | live/manual (automated commit capture + human-check of Actions UI) | `git log -1 --format=%H` | N/A (git/CI operation, no files modified) | ⬜ pending |
| 06-02-02 | 02 | 2 | CI-03 | T-06-05 / T-06-06 | A deliberately failing test on a scratch branch produces a `failure` Actions conclusion naming the correct failing assertion; the break is fully reverted and the scratch branch deleted afterward | live/manual (automated git diff/branch checks + human-check of Actions UI) | `git diff -- backend/src/smoke.test.js; git branch --list ci-smoke-check; git ls-remote origin ci-smoke-check` | ✅ (pre-existing file, temporarily modified then reverted) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Root `package.json` `test` script — closed by 06-01 Task 1 (`06-01-01`); addresses the SETUP-03 Wave 0 gap identified in `06-RESEARCH.md` ("Wave 0 Gaps: Root `package.json` `test` script — does not exist yet").
- [x] `.github/workflows/ci.yml` — closed by 06-01 Task 2 (`06-01-02`); addresses the CI-01/CI-02/CI-03 Wave 0 gap identified in `06-RESEARCH.md` ("Wave 0 Gaps: `.github/workflows/ci.yml` — does not exist yet (CI is greenfield)").

*No test framework/fixture gaps — Vitest is already fully configured in both workspaces from Phases 1-5 and is unchanged by this phase. This phase's own Wave 0 gaps are the orchestration artifacts themselves (the root script and the workflow file), and both are closed within Wave 1 (06-01) before Wave 2 (06-02) depends on them — no gap carries forward unaddressed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| A real push triggers a green GitHub Actions run | CI-01, CI-02 | Confirming a live GitHub-hosted Actions run's status requires the Actions UI (or an authenticated `gh` session, not guaranteed available in this environment); grep/local commands cannot observe GitHub's own infrastructure | 06-02 Task 1: push the branch, open `https://github.com/BisratKidane/portofolio/actions`, find the run for the reported commit SHA, confirm the `test` job shows a green checkmark with passing backend and frontend Vitest summaries (0 failed) |
| A deliberately failing test produces a red Actions run naming the correct failure | CI-03 | Confirming the failure reason inside a live Actions log requires the Actions UI, and distinguishing "intended test failure" from an unrelated infrastructure failure needs human judgment | 06-02 Task 2: on scratch branch `ci-smoke-check`, change `backend/src/smoke.test.js`'s assertion from `1 + 1 === 2` to `1 + 1 === 3`, push, open the Actions tab, confirm the run for that push shows a red/failed status with the log naming `backend/src/smoke.test.js`'s wrong assertion specifically, then revert the file and delete the scratch branch (local + remote) |
| Branch-protection enablement (D-07) | CI-03 (enforcement half) | Enabling "Require status checks to pass before merging" is a one-time GitHub repo Settings action; no CLI/API automation of this step is mandated by D-07 (documented, not automated) | Per README.md's new `## Continuous Integration` section: push at least once so the `test` job has run and appears as a selectable check, then in GitHub go to Settings -> Branches -> add/edit a branch protection rule -> enable "Require status checks to pass before merging" -> select the `test` job |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s (local); live GitHub Actions confirmation is explicitly manual/observational per the Manual-Only Verifications table
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-12
