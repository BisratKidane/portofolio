---
phase: 16
slug: photo-upload
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-23
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

| Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| PHOTO-03 | path-traversal | Filename server-generated (`crypto.randomUUID()`); client filename never used on disk | integration (supertest) | `npx vitest run src/routes/photo.upload.test.js -t "path-traversal"` | ❌ W0 | ⬜ pending |
| PHOTO-03 | mislabeled content-type | Accept/reject decided purely on magic bytes (both directions) — multipart Content-Type and extension ignored | integration | `npx vitest run src/routes/photo.upload.test.js -t "content-type"` | ❌ W0 | ⬜ pending |
| PHOTO-03 | oversized file | >5 MB rejected cleanly (400, not 500) | integration | `npx vitest run src/routes/photo.upload.test.js -t "5 MB"` | ❌ W0 | ⬜ pending |
| PHOTO-01 | — | Upload succeeds for a member within editable scope; photo displays | integration + unit | `npx vitest run src/routes/photo.upload.test.js -t "happy path"` | ❌ W0 | ⬜ pending |
| PHOTO-01 | authz | Upload rejected for a member OUTSIDE editable scope | integration | `npx vitest run src/routes/photo.upload.test.js -t "outside scope"` | ❌ W0 | ⬜ pending |
| D-07 | view-auth | Serving route requires a valid JWT to load a photo | integration | `npx vitest run src/routes/photo.serve.test.js` | ❌ W0 | ⬜ pending |
| PHOTO-02 | — | `family_members.profilePicture` migration applied and round-trips (boot-verify pattern) | integration | `npx vitest run src/models/FamilyMember.test.js -t "profilePicture"` | ❌ W0 | ⬜ pending |
| D-11 | orphan cleanup | Replace/remove deletes the prior file, no orphaned blobs | unit | `npx vitest run src/services/photoStorage.service.test.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/test/fixtures/images.js` — small real JPEG/PNG/WebP buffer fixtures for upload tests
- [ ] `backend/src/routes/photo.upload.test.js` — the **adversarial-first** test file (path traversal, mislabeled content-type both directions, oversized file) — committed **red before** any happy-path upload test (Success Criterion #3)
- [ ] `backend/src/routes/photo.serve.test.js` — JWT-required-to-view (D-07) test file
- [ ] `backend/src/services/photoStorage.service.test.js` — filename generation, write/unlink ordering, orphan-cleanup unit tests
- [ ] `backend/migrations/manual/013-add-family-members-profile-picture.sql` — manual ALTER migration (mirrors `012-add-users-family-member-id.sql`)
- [ ] `.gitignore` entry for `backend/storage/` (or `backend/storage/photos/`) — new local-dev artifact directory
- [ ] Frontend: `frontend/src/components/manage/PhotoCropDialog.test.jsx` and `MemberAvatarImage.test.jsx` — crop dialog + blob-fetch avatar wrapper component tests

*Framework install: none needed — Vitest, supertest, and React Testing Library are already installed and configured in both workspaces.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Photo persists across a container rebuild (named volume, not writable layer) | PHOTO-02 | Requires a full `docker compose` up/down/rebuild lifecycle — not expressible as a Vitest unit test | `docker compose up -d --build`, upload a photo, `docker compose down`, `docker compose up -d --build`, verify the photo is still served |
| Adversarial tests failed (red) before any happy-path upload test passed | QUAL-01 / SC#3 | Ordering proof lives in git commit history, not a runtime assertion | During `/gsd:verify-work`, review the red-green commit sequence: adversarial test commits precede the happy-path pass |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
