---
phase: 16-photo-upload
verified: 2026-07-24T20:03:41Z
status: human_needed
score: 4/4 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Full browser walkthrough: click an in-scope member's avatar on /manage, pick a real JPEG/PNG/WebP file, drag/zoom to crop, click 'Save photo', confirm it displays on MemberCard, the relationship panel, and the admin table."
    expected: "Crop dialog opens with a live react-easy-crop preview; zoom slider works; Save photo produces a real cropped 512x512 JPEG blob via a genuine browser Canvas (not jsdom); the uploaded photo renders immediately after refetch on every surface (MemberCard, RelationshipGroupedPanel rows, AdminMemberTable)."
    why_human: "PhotoCropDialog.test.jsx mocks HTMLCanvasElement.getContext/toBlob and the global Image constructor because jsdom has no real Canvas/Image-decoding implementation — the actual pixel-cropping pipeline (drawImage with real image data, toBlob producing a genuine JPEG) has never executed against real image bytes. Only the call sequence/props are proven, not the visual/byte-correctness of the crop."
  - test: "Remove-photo confirm flow end-to-end in a real browser: click 'Remove photo' on a member with a photo, confirm the 'Remove photo?' dialog, verify the avatar reverts to the person-icon placeholder without a page reload."
    expected: "Dialog text matches 16-UI-SPEC.md copy exactly, button disables during the request, avatar reverts to placeholder after refetch."
    why_human: "Covered by RTL component/page tests with mocked photoClient, but never exercised against the real backend + real browser DOM in one pass."
---

# Phase 16: Photo Upload Verification Report

**Phase Goal:** Users can upload a profile picture for a member within their scope, stored durably across container rebuilds and hardened against upload-based attacks.
**Verified:** 2026-07-24T20:03:41Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A user can upload a profilePicture for a member within their scope via a dedicated backend route, and the photo displays on that member | ✓ VERIFIED | `POST /api/family-members/:id/photo` in `backend/src/routes/photo.routes.js`; `photoUrl` computed field wired on `FamilyMember` GraphQL type (`backend/src/schemas/familyMember.schema.js:25`, `backend/src/resolvers/familyMember.resolver.js:247`); frontend wiring confirmed end-to-end: `MemberCard.jsx` avatar → `onPickPhoto` → `ManagePage.jsx` opens `PhotoCropDialog` → `uploadMemberPhoto` → refetch; `MemberAvatarImage` renders on `MemberCard`, `RelationshipGroupedPanel`, and `AdminMemberTable`. Backend integration test `photo.upload.test.js` "happy path" asserts `res.body.photoUrl`, `member.profilePicture`, and the GraphQL `photoUrl` field all reflect the upload. Test passed live (see Behavioral Spot-Checks). |
| 2 | Uploaded photos persist across a container rebuild, verified against a named Docker volume (not the writable layer) | ✓ VERIFIED | `docker-compose.yml` declares top-level `photo_uploads:` volume and mounts it at `photo_uploads:/app/backend/storage/photos` on the `backend` service — matches `photoStorageConfig.photosDir` (`backend/src/config/photoStorage.js`, resolved via `__dirname`, not `process.cwd()`). `backend/scripts/verify-photo-persistence.sh` was executed live by this verifier (not merely inspected): full `docker compose down` (no `-v`) + rebuild cycle, printed `PASS: photo_uploads persisted across a rebuild`. Script correctly avoids `down -v`. |
| 3 | Adversarial uploads (path-traversal filename, mislabeled content-type, oversized file) are rejected as the first RED tests, before any happy-path test passes; filenames are server-generated, never client-derived | ✓ VERIFIED | Git history proves ordering: commit `d3562cf` ("test(16-04): add failing adversarial photo-upload tests (RED)") contains ONLY the 4 adversarial tests (path-traversal, 2x content-type, 5 MB) — confirmed by inspecting the commit diff directly, no happy-path test present. The happy-path/outside-scope/replace tests were added later in `5012b7f`. `photo.routes.js` never reads `req.file.originalname` (`grep -c` = 0); filenames are exclusively `generatePhotoFilename(detected.ext)` using `crypto.randomUUID()`. Accept/reject decided exclusively via `fileTypeFromBuffer` (magic-byte sniffing), proven by a test that accepts a real PNG mislabeled `text/html` and rejects real-labeled non-image bytes. |
| 4 | All new backend models, resolvers, and the upload route have unit + integration test coverage, written test-first (TDD red-green), suite green in CI | ✓ VERIFIED | Backend suite run live by this verifier: 319/319 passing (48 test files). Frontend suite run live: 115/115 passing (18 test files). Git history shows consistent RED→GREEN commit pairs across all 7 plans (e.g. `d3562cf`[RED]→`5a712e6`[GREEN], `a4e634a`[RED]→`1c93e25`[GREEN], `d3c15d2`[RED]→`beeb233`[GREEN] for the post-review fixes). `.github/workflows/ci.yml` runs `npm test` on push/PR using `node-version-file: .nvmrc` (=24), matching the local runtime exactly — so the Node 22.2+-only `zlib.crc32` fixture dependency (flagged as WR-04 in code review, resolved as "not a defect" since the whole repo is actually pinned to Node 24, not 18 as stale docs claim) will not break CI. |

**Score:** 4/4 truths verified

### Code Review Remediation (CR-01 / WR-01 / WR-02) — Verified Independently

The phase's own code review (`16-REVIEW.md`) found 1 Critical + 4 Warnings. This verifier independently re-checked the 3 claimed-fixed findings against current source, not just the SUMMARY/REVIEW narrative:

| Finding | Claimed Fix | Verified in Source | Regression Test |
|---|---|---|---|
| CR-01 (orphan-on-commit-failure) | Unmanaged transaction; delete-old only after real commit | ✓ `photo.routes.js:86-111` — `const t = await sequelize.transaction()` (unmanaged), `commit` callback does `target.update(...)` then `await t.commit()` before `finalizePhotoReplacement` deletes the old file | ✓ `photo.upload.test.js` "if the DB commit fails during a replace..." — forces `t.commit` to throw, asserts DB rolls back to original filename AND original file still exists on disk. Test passed live. |
| WR-01 (500 instead of 401/403) | `mapAuthFailure()` maps thrown auth errors to 401 (not logged in) / 403 (unlinked/role) | ✓ `photo.routes.js:23-35` `mapAuthFailure(user, res)` called at the top of both POST and DELETE handlers | ✓ "an unauthenticated upload is rejected with 401" and "an unauthenticated removal is rejected with 401" tests present in `photo.upload.test.js`/`photo.remove.test.js`. Passed live. |
| WR-02 (delete-before-null ordering) | DELETE nulls the column before unlinking the file | ✓ `photo.routes.js:142-149` — `await target.update({ profilePicture: null })` runs BEFORE `await deletePhotoFile(previousFilename)` | ✓ `photo.remove.test.js` "if nulling the DB column fails during removal, the stored file is NOT deleted" — mocks `FamilyMember.prototype.update` to reject, asserts file still exists. Passed live. |

All three fixes committed as proper TDD RED→GREEN pairs: `d3c15d2` [RED] → `beeb233` [GREEN], timestamps 21:56→21:58 same session, confirming tests were genuinely red before the fix landed.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `backend/migrations/manual/013-add-family-members-profile-picture.sql` | Manual ALTER adding `profilePicture` | ✓ VERIFIED | Contains exact `ALTER TABLE family_members ADD COLUMN profilePicture VARCHAR(255) NULL DEFAULT NULL;`, mirrors 012's header-comment convention |
| `backend/src/models/FamilyMember.js` | `profilePicture` nullable STRING field | ✓ VERIFIED | `profilePicture: { type: DataTypes.STRING, allowNull: true }` present; boot-verify test in `database.test.js` round-trips and defaults-to-null, both passing |
| `backend/src/config/photoStorage.js` | `photoStorageConfig.photosDir` via `__dirname` | ✓ VERIFIED | Uses `fileURLToPath(import.meta.url)` + `path.dirname`, never `process.cwd()`; resolves to `backend/storage/photos` |
| `backend/test/fixtures/images.js` | Real (spec-valid) JPEG/PNG/WebP/non-image fixtures | ✓ VERIFIED | Byte-for-byte spec-compliant PNG/JPEG/WebP builders (not magic-byte-only fakes), self-verified via `file-type` in `images.test.js`, which passed in the live suite run |
| `backend/src/services/photoStorage.service.js` | `generatePhotoFilename`/`resolvePhotoPath`/`writePhotoFile`/`deletePhotoFile`/`finalizePhotoReplacement` | ✓ VERIFIED | All 5 functions present and exported; UUID-based filenames; ENOENT-safe delete; correct write-new→commit→delete-old ordering |
| `docker-compose.yml` | `photo_uploads` named volume mounted into backend | ✓ VERIFIED | Top-level `photo_uploads:` volume, mounted at `/app/backend/storage/photos` on the backend service |
| `backend/scripts/verify-photo-persistence.sh` | Repeatable rebuild-persistence proof script | ✓ VERIFIED | Executable, uses `docker compose down` (no `-v`), 2 `up` invocations; executed live by this verifier, printed `PASS` |
| `backend/src/routes/photo.routes.js` | POST/DELETE/GET `/family-members/:id/photo` | ✓ VERIFIED | All 3 verbs present; magic-byte sniffing via `fileTypeFromBuffer`; `mapAuthFailure` for 401/403; `multerErrorHandler` for clean 400s |
| `backend/src/schemas/familyMember.schema.js` / resolver | `photoUrl: String` computed field | ✓ VERIFIED | Schema declares `photoUrl: String`; resolver never exposes raw `profilePicture` column |
| `frontend/src/api/photoClient.js` | `uploadMemberPhoto`/`removeMemberPhoto`/`fetchMemberPhotoBlob`/`attachAuthHeader` | ✓ VERIFIED | All 4 exported; reuses Bearer-token pattern from `graphqlClient.js` |
| `frontend/src/components/manage/MemberAvatarImage.jsx` | Authenticated blob-fetch avatar (D-09/D-10) | ✓ VERIFIED | Icon-only placeholder (no initials), skeleton only when `photoUrl` present, silent fallback on fetch failure, `URL.revokeObjectURL` cleanup |
| `frontend/src/components/manage/PhotoCropDialog.jsx` | Crop/preview dialog (D-02) | ✓ VERIFIED | `Cropper` `aspect={1}` `cropShape="round"`; 512×512 canvas crop → JPEG 0.9 quality; matches UI-SPEC copy exactly |
| `frontend/src/components/manage/MemberCard.jsx` | Avatar click trigger, camera overlay, remove-photo action | ✓ VERIFIED | `getInitials` fully removed (`grep -c` = 0); avatar wrapped in `ButtonBase` only when `!locked`; "Remove photo" button gated on `!locked && photoUrl` |
| `frontend/src/components/manage/RelationshipGroupedPanel.jsx` | `onPickPhoto`/`onRemovePhoto` explicitly threaded | ✓ VERIFIED | Present in top-level signature, `rowProps`, `MemberRows` signature, and every `<MemberCard>` invocation (self row + mapped rows) |
| `frontend/src/pages/ManagePage.jsx` | `PhotoCropDialog` + "Remove photo?" dialog in both branches | ✓ VERIFIED | `PhotoCropDialog`, `removeMemberPhoto`, `onPickPhoto=`/`onRemovePhoto=` (×2, one per branch), `DialogTitle` "Remove photo?" (×2) all present; `photoUrl` requested in all 3 member-fetching queries |
| `frontend/src/components/manage/AdminMemberTable.jsx` | Photo thumbnail column | ✓ VERIFIED | `MemberAvatarImage` imported and rendered per row |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `photo.routes.js` | `familyMember.service.js` | `computeEditableScope` (non-admin authz) | ✓ WIRED | Called in both POST and DELETE handlers before mutation |
| `photo.routes.js` | `photoStorage.service.js` | `finalizePhotoReplacement` | ✓ WIRED | Used inside the unmanaged-transaction commit path |
| `server.js` | `photo.routes.js` | `app.use('/api', photoRouter)` | ✓ WIRED | Confirmed by `grep`, and live: all photo route integration tests hit real Express routes and pass |
| `photo.routes.js` (GET) | `photoStorage.service.js` | `resolvePhotoPath` | ✓ WIRED | Used to `res.sendFile` the stored image |
| `MemberCard.jsx` | `MemberAvatarImage.jsx` | avatar rendering | ✓ WIRED | Imported and rendered in both locked and unlocked branches |
| `ManagePage.jsx` | `RelationshipGroupedPanel.jsx` | `onPickPhoto=`/`onRemovePhoto=` explicit props | ✓ WIRED | Confirmed in both `MemberBranch` and `AdminBranch` call sites (2 occurrences each) |
| `RelationshipGroupedPanel.jsx` | `MemberCard.jsx` | explicit prop forwarding (self row + `MemberRows`) | ✓ WIRED | No spread/rest shortcut used; every prop list edited explicitly as required |
| `ManagePage.jsx` | `PhotoCropDialog.jsx` | avatar-click bubbles to dialog open | ✓ WIRED | `onPickPhoto={(member, file) => setCropDialog({ open: true, file, member })}` present in both branches |
| `ManagePage.jsx` GraphQL queries | `familyMember.schema.js` | `photoUrl` requested | ✓ WIRED | All 3 query constants (`MY_EDITABLE_MEMBERS_QUERY`, `FAMILY_MEMBERS_QUERY`, `FAMILY_MEMBER_FOCUS_QUERY`) contain `photoUrl` |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Full backend suite (all photo routes, services, models) | `cd backend && npx vitest run` | 48 test files / 319 tests passed | ✓ PASS |
| Full frontend suite (all photo components/pages) | `cd frontend && npx vitest run` | 18 test files / 115 tests passed | ✓ PASS |
| Adversarial-first commit ordering (SC #3) | `git show d3562cf` (first RED commit for `photo.upload.test.js`) | Contains exactly the 4 adversarial tests, zero happy-path tests | ✓ PASS |
| Docker rebuild persistence (SC #2) | `bash backend/scripts/verify-photo-persistence.sh` (executed live, full stack rebuild via `docker compose down` + rebuild) | `PASS: photo_uploads persisted across a rebuild` | ✓ PASS |
| No debt markers in any phase-modified file | `grep -n -E "TBD\|FIXME\|XXX\|TODO\|HACK"` across all 15 phase-touched files | Zero matches | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| PHOTO-01 | 16-04, 16-05, 16-06, 16-07 | User can upload a `profilePicture` for a member within their scope | ✓ SATISFIED | Full-stack upload route + frontend wiring verified above; REQUIREMENTS.md checkbox already marked `[x]` |
| PHOTO-02 | 16-01, 16-03, 16-05 | Photos stored on a mounted Docker volume, served via backend route, persist across rebuilds | ✓ SATISFIED | `photo_uploads` volume + live-executed persistence script passing + GET route serving from `resolvePhotoPath`. REQUIREMENTS.md checkbox is still `[ ]` — **documentation lag, not a code gap** (see note below) |
| PHOTO-03 | 16-01, 16-04 | Uploads validated for content-type/size, safely generated filenames (no path traversal) | ✓ SATISFIED | `fileTypeFromBuffer` magic-byte sniffing, 5 MB `multer` limit, `crypto.randomUUID()` filenames, adversarial tests all passing. REQUIREMENTS.md checkbox still `[ ]` — documentation lag |
| QUAL-01 | 16-01 through 16-07 (all plans) | New models/resolvers/route covered by unit+integration tests, TDD red-green | ✓ SATISFIED | Every plan followed RED→GREEN commit discipline (verified via git log); backend 319/319 and frontend 115/115 green. REQUIREMENTS.md checkbox still `[ ]` — documentation lag |

**Note on REQUIREMENTS.md staleness:** `.planning/REQUIREMENTS.md` lines 141-142/151 still show PHOTO-02, PHOTO-03, and QUAL-01 as `[ ]` Pending and the traceability table as "Pending", even though the underlying implementation is complete and verified. This is a documentation-sync gap in the planning artifacts, not a code defect — flagged for the orchestrator to update REQUIREMENTS.md's checkboxes, but does not affect the phase's functional status.

### Anti-Patterns Found

None. Zero `TBD`/`FIXME`/`XXX`/`TODO`/`HACK` markers, zero placeholder/stub returns, zero hardcoded-empty data flows found across all 15 phase-modified backend/frontend files.

### Open Advisory Items (Non-Blocking)

These were flagged by the phase's own code review as OPEN (not fixed) and independently confirmed still present by this verifier. Neither blocks any of the 4 roadmap success criteria for this phase (single-origin / Docker Compose / dev-proxy deployment, which is this app's current and only deployment model per `docker-compose.yml` and `README.md`), but are worth a human decision:

- **WR-03 (open, tracked follow-up):** `frontend/src/api/photoClient.js:9` — `photoClient` is `axios.create()` with no `baseURL`, unlike `graphqlClient.js` which derives its base from `VITE_API_URL`. Confirmed still true in current source. In a future cross-origin deployment (frontend and backend on different origins, no reverse-proxy unification), photo upload/remove/view would silently break while GraphQL kept working. Not exercised by any currently-configured deployment topology, so it does not fail this phase's success criteria today.
- **IN-01 (open, advisory):** `photo.routes.js`'s GET handler has no defense-in-depth path-containment assertion on `resolvePhotoPath(target.profilePicture)` — currently safe because `profilePicture` is only ever written by `generatePhotoFilename`, but there's no runtime guard if that invariant were ever violated.
- **IN-02 (open, advisory):** Dead `originalGenerate` capture left in `photoStorage.service.test.js` — cosmetic test-code noise only.

### Human Verification Required

1. **Full browser walkthrough of the upload flow** — click an in-scope member's avatar, pick a real image file, crop via drag/zoom, save, confirm it renders on every surface (MemberCard, relationship panel rows, admin table).
   - **Why human:** `PhotoCropDialog.test.jsx` mocks `HTMLCanvasElement.getContext`/`toBlob` and the global `Image` constructor because jsdom has no real Canvas/image-decode implementation. The actual crop-to-512×512-JPEG pixel pipeline has never run against real image bytes in a real browser.

2. **Remove-photo confirm flow end-to-end** — click "Remove photo", confirm the dialog, verify the avatar reverts to the placeholder icon live (no reload).
   - **Why human:** Covered by RTL tests with a mocked `photoClient`, never exercised against the real backend + real browser in one pass.

### Gaps Summary

No gaps that block the phase goal. All 4 roadmap success criteria are independently verified against source code, git history, and live command execution (not SUMMARY.md narrative alone) — including a full live re-run of the Docker rebuild-persistence script and both test suites. The 3 code-review findings claimed fixed (CR-01/WR-01/WR-02) were independently re-verified against current source and each has a passing regression test proven to have been RED before GREEN via git history. Two items require a human browser pass because they depend on real Canvas/Image APIs that jsdom cannot faithfully emulate — this is a completeness gap in automated coverage, not evidence of broken functionality. One documentation-sync gap (REQUIREMENTS.md checkboxes) and one already-tracked, explicitly-deferred production-hardening item (WR-03) are noted but do not block phase completion.

---

_Verified: 2026-07-24T20:03:41Z_
_Verifier: Claude (gsd-verifier)_
