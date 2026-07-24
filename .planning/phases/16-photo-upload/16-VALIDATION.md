---
phase: 16
slug: photo-upload
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-23
planned_at: 2026-07-24
validated_at: 2026-07-24
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from 16-RESEARCH.md § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.10 (backend + frontend; already installed in both workspaces) |
| **Config file** | `backend/vitest.config.js` (globalSetup runs a real `sequelize.sync({ force: true, match: /_test$/ })` against a MySQL test DB) |
| **Quick run command** | `npx vitest run <file-pattern>` (from `backend/`) |
| **Full suite command** | `npm test --workspace backend` and `npm test --workspace frontend` |
| **Estimated runtime** | ~30–60 seconds (backend suite is ~195+ tests, DB-backed) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <touched-file-pattern>` (fast, scoped)
- **After every plan wave:** Run `npm test --workspace backend` and `npm test --workspace frontend` (full suite)
- **Before `/gsd:verify-work`:** Full backend + frontend suite green, PLUS the manual Docker-rebuild persistence check (PHOTO-02) executed at least once
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

> Task IDs are assigned by the planner; the table below binds each phase requirement to its automated proof. The planner MUST attach these commands to the corresponding tasks' `<automated>` verify blocks.

| Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | Plan (produces) | Status |
|-------------|------------|-----------------|-----------|-------------------|------------------|--------|
| PHOTO-03 | path-traversal | Filename server-generated (`crypto.randomUUID()`); client filename never used on disk | integration (supertest) | `npx vitest run src/routes/photo.upload.test.js -t "path-traversal"` | ✅ 16-04 | ✅ green |
| PHOTO-03 | mislabeled content-type | Accept/reject decided purely on magic bytes (both directions) — multipart Content-Type and extension ignored | integration | `npx vitest run src/routes/photo.upload.test.js -t "content-type"` | ✅ 16-04 | ✅ green |
| PHOTO-03 | oversized file | >5 MB rejected cleanly (400, not 500) | integration | `npx vitest run src/routes/photo.upload.test.js -t "5 MB"` | ✅ 16-04 | ✅ green |
| PHOTO-01 | — | Upload succeeds for a member within editable scope; photo displays | integration + unit | `npx vitest run src/routes/photo.upload.test.js -t "happy path"` | ✅ 16-04 | ✅ green |
| PHOTO-01 | authz | Upload rejected for a member OUTSIDE editable scope | integration | `npx vitest run src/routes/photo.upload.test.js -t "outside scope"` | ✅ 16-04 | ✅ green |
| D-07 | view-auth | Serving route requires a valid JWT to load a photo | integration | `npx vitest run src/routes/photo.serve.test.js` | ✅ 16-05 | ✅ green |
| PHOTO-02 | — | `family_members.profilePicture` migration applied and round-trips (boot-verify pattern) | integration | `npx vitest run src/models/database.test.js -t "profilePicture"` | ✅ 16-01 | ✅ green |
| D-11 | orphan cleanup | Replace/remove deletes the prior file, no orphaned blobs | unit | `npx vitest run src/services/photoStorage.service.test.js` | ✅ 16-02 (primitives) / 16-05 (remove-route integration) | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

All Wave 0 gaps are now covered by a specific plan (produced before any consuming plan runs, per wave order):

- [x] `backend/test/fixtures/images.js` — small real JPEG/PNG/WebP buffer fixtures for upload tests — produced by 16-01 (wave 1), consumed by 16-04 (wave 3)
- [x] `backend/src/routes/photo.upload.test.js` — the **adversarial-first** test file (path traversal, mislabeled content-type both directions, oversized file) — committed **red before** any happy-path upload test (Success Criterion #3) — produced by 16-04 Task 1 (adversarial, RED-then-GREEN) before Task 2 (happy path)
- [x] `backend/src/routes/photo.serve.test.js` — JWT-required-to-view (D-07) test file — produced by 16-05 (wave 4)
- [x] `backend/src/services/photoStorage.service.test.js` — filename generation, write/unlink ordering, orphan-cleanup unit tests — produced by 16-02 (wave 2), consumed by 16-04/16-05
- [x] `backend/migrations/manual/013-add-family-members-profile-picture.sql` — manual ALTER migration (mirrors `012-add-users-family-member-id.sql`) — produced by 16-01 (wave 1, BLOCKING task)
- [x] `.gitignore` entry for `backend/storage/` — new local-dev artifact directory — produced by 16-01 (wave 1)
- [x] Frontend: `frontend/src/components/manage/PhotoCropDialog.test.jsx` and `MemberAvatarImage.test.jsx` — crop dialog + blob-fetch avatar wrapper component tests — produced by 16-06 (wave 5)

*Framework install: none needed — Vitest, supertest, and React Testing Library are already installed and configured in both workspaces.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Photo persists across a container rebuild (named volume, not writable layer) | PHOTO-02 | Requires a full `docker compose` up/down/rebuild lifecycle — not expressible as a Vitest unit test | `docker compose up -d --build`, upload a photo, `docker compose down`, `docker compose up -d --build`, verify the photo is still served |
| Adversarial tests failed (red) before any happy-path upload test passed | QUAL-01 / SC#3 | Ordering proof lives in git commit history, not a runtime assertion | During `/gsd:verify-work`, review the red-green commit sequence: adversarial test commits precede the happy-path pass |
| Crop-to-512×512-JPEG pixel pipeline produces a byte/visually-correct blob against real image data | PHOTO-01 / D-02 | `PhotoCropDialog.test.jsx` mocks `HTMLCanvasElement.getContext`/`toBlob` and the global `Image` constructor — jsdom has no real Canvas/image-decode; only the call sequence/props are proven, not pixel correctness | Full browser walkthrough (16-HUMAN-UAT / 16-VERIFICATION human_verification #1): pick a real JPEG/PNG/WebP, drag/zoom crop, Save photo, confirm it renders on MemberCard, relationship panel, and admin table |
| Remove-photo confirm flow reverts avatar to placeholder live against the real backend | PHOTO-01 / D-11 | Covered by RTL tests with a mocked `photoClient`; never exercised against real backend + real browser DOM in one pass | Full browser walkthrough (16-HUMAN-UAT / 16-VERIFICATION human_verification #2): click "Remove photo", confirm dialog, verify avatar reverts to person-icon placeholder without a reload |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — confirmed across all 7 plans (16-01..16-07), every task carries a scoped `<automated>` command
- [x] Sampling continuity: no 3 consecutive tasks without automated verify — confirmed, every task in every plan has its own `<verify><automated>`
- [x] Wave 0 covers all MISSING references — all 7 items above are now produced by a specific plan before being consumed
- [x] No watch-mode flags — every `<automated>` command uses `vitest run` (never `vitest`/`--watch`) or a one-shot `npm test`
- [x] Feedback latency < 60s — every automated command is scoped to a single file or a narrow `-t` filter, consistent with the ~30-60s full-suite baseline
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved (2026-07-24) — verified by gsd-plan-checker against the finalized 7-plan set (16-01-PLAN.md .. 16-07-PLAN.md). Per-row "Status" columns above remain "pending execution" until `/gsd:execute-phase 16` actually runs the suite; this sign-off certifies planning-time Nyquist compliance, not runtime test results.

---

## Validation Audit 2026-07-24

Post-execution re-audit (State A). All 8 mapped requirements re-classified against the executed codebase and live-run scoped commands:

- Backend photo suite: `npx vitest run src/routes/photo.upload.test.js src/routes/photo.serve.test.js src/routes/photo.remove.test.js src/models/database.test.js src/services/photoStorage.service.test.js` → **40/40 passed**.
- Frontend photo suite: `npx vitest run src/components/manage/PhotoCropDialog.test.jsx src/components/manage/MemberAvatarImage.test.jsx src/api/photoClient.test.js` → **13/13 passed**.
- Every `-t` filter in the Per-Task Map was confirmed to match a real test title; all 8 rows moved ⬜ pending → ✅ green.
- Two jsdom-boundary items (crop pixel pipeline, remove-flow live) added to Manual-Only, mirroring 16-VERIFICATION.md `human_verification` and 16-HUMAN-UAT.

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated (→ manual-only) | 0 |
| Rows now COVERED | 8 / 8 |

Result: **Phase 16 is Nyquist-compliant** — every automated requirement has a green test; remaining items are legitimately manual (Docker lifecycle, git-history ordering, real-Canvas pixel/visual correctness).
