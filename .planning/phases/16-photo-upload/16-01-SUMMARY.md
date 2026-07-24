---
phase: 16-photo-upload
plan: 01
subsystem: api
tags: [multer, file-type, sequelize, mysql, manual-migration, vitest, tdd, webp, jpeg, png]

# Dependency graph
requires:
  - phase: 12-family-data-model-foundation
    provides: FamilyMember Sequelize model (family_members table) that this plan adds profilePicture to
  - phase: 13-membership-gating
    provides: the manual-ALTER + boot-verify-test pattern (012 migration precedent) this plan mirrors for 013
provides:
  - photoStorageConfig (backend/src/config/photoStorage.js) resolving the upload storage directory via __dirname
  - family_members.profilePicture column (nullable STRING), via manual migration 013 + Sequelize model field
  - Real, spec-valid JPEG/PNG/WebP/non-image byte fixtures (backend/test/fixtures/images.js) for every later upload-route test in this phase
affects: [16-02, 16-03, 16-04, 16-05, 16-06, 16-07]

# Tech tracking
tech-stack:
  added: [multer@2.2.0, file-type@22.0.1]
  patterns:
    - "__dirname-relative config resolution (mirrors env.js), never process.cwd()"
    - "manual ALTER migration + integration boot-verify test for schema changes to pre-existing tables (sequelize.sync() never alters an existing table)"
    - "hand-built, spec-correct minimal image fixtures verified via file-type + independent decoder cross-check (sips/file), not magic-bytes-only fakes"

key-files:
  created:
    - backend/src/config/photoStorage.js
    - backend/migrations/manual/013-add-family-members-profile-picture.sql
    - backend/test/fixtures/images.js
    - backend/test/fixtures/images.test.js
  modified:
    - backend/src/models/FamilyMember.js
    - backend/src/models/database.test.js
    - backend/package.json
    - package-lock.json
    - .gitignore

key-decisions:
  - "multer + file-type installed scoped to backend workspace only, per RESEARCH.md's explicit process note about a prior slopcheck-install side effect polluting the root package.json"
  - "profilePicture migration (013) has no UNIQUE/FK constraints, unlike 012 -- it's a plain nullable pointer column, not a relationship"
  - "Image fixtures are hand-constructed per-format (PNG via zlib deflate+CRC32, JPEG via a minimal but fully spec-legal baseline encoder with trivial custom Huffman tables, WebP via a hand-rolled RFC 9649 VP8L bitstream) rather than pasted-from-memory base64 blobs, and cross-verified independently via macOS sips/file during authoring -- reduces risk of silently-wrong 'real' fixtures"
  - "database.test.js's null-default profilePicture assertion needed .reload() before checking, matching the existing mothersname/motherId null-assertion convention elsewhere in the suite (Sequelize instances don't populate unset nullable attributes as null pre-fetch)"

patterns-established:
  - "photoStorageConfig.photosDir is the single source of truth for where uploaded bytes live on disk; later plans (route handlers) must import it rather than re-deriving the path"

requirements-completed: [QUAL-01]

# Metrics
duration: 9min
completed: 2026-07-24
---

# Phase 16 Plan 01: Backend Photo-Upload Foundation Summary

**multer + file-type installed (backend-scoped), photoStorageConfig resolved via __dirname, family_members.profilePicture added via manual-ALTER + TDD boot-verify test, and hand-built spec-valid JPEG/PNG/WebP fixtures for every later upload test**

## Performance

- **Duration:** 9 min
- **Started:** 2026-07-24T20:00:43+02:00
- **Completed:** 2026-07-24T20:09:37+02:00
- **Tasks:** 3 (Task 2 executed as TDD RED → GREEN)
- **Files modified:** 9

## Accomplishments
- `multer`/`file-type` installed scoped to the `backend` npm workspace only (root `package.json` untouched, verified)
- `backend/src/config/photoStorage.js` exports `photoStorageConfig.photosDir`, resolved via `fileURLToPath(import.meta.url)` + `path.dirname` (mirrors `env.js`), so it resolves identically under `npm start`, `nodemon`, and the Docker `CMD` (`WORKDIR /app/backend`)
- `family_members.profilePicture` (nullable `VARCHAR(255)`) added via `backend/migrations/manual/013-add-family-members-profile-picture.sql`, mirroring the `012`/ACC-05 precedent, plus the Sequelize model field and a TDD-driven integration boot-verify test proving round-trip + null-default behavior
- `backend/test/fixtures/images.js` provides real, format-spec-valid `validJpegBuffer`/`validPngBuffer`/`validWebpBuffer` (hand-built per PNG/JPEG/WebP-lossless specs, not synthetic magic-byte fakes), plus `nonImageBuffer` and `oversizedImageBuffer()` for the adversarial vectors later plans need — self-verified via `file-type`'s `fileTypeFromBuffer`

## Task Commits

Each task was committed atomically:

1. **Task 1: Install multer + file-type, add photoStorage config module** - `cf23842` (feat)
2. **Task 2: Manual ALTER migration + profilePicture model column + boot-verify test** - `bedf556` (test, RED) → `412bf45` (feat, GREEN)
3. **Task 3: Real image byte fixtures for upload tests** - `58cd88d` (feat)

**Plan metadata:** committed separately after this SUMMARY (see final commit)

_Note: Task 2 is TDD — RED (`bedf556`) precedes GREEN (`412bf45`) in git log, confirmed._

## Files Created/Modified
- `backend/src/config/photoStorage.js` - exports `photoStorageConfig.photosDir`, `__dirname`-resolved
- `backend/migrations/manual/013-add-family-members-profile-picture.sql` - manual ALTER adding `profilePicture` to `family_members`
- `backend/src/models/FamilyMember.js` - added `profilePicture: { type: DataTypes.STRING, allowNull: true }`
- `backend/src/models/database.test.js` - added `describe('profilePicture column (PHOTO-02)')` with round-trip + null-default tests
- `backend/test/fixtures/images.js` - real `validJpegBuffer`/`validPngBuffer`/`validWebpBuffer`/`nonImageBuffer`/`oversizedImageBuffer()`
- `backend/test/fixtures/images.test.js` - self-verifies every fixture's magic-byte-detected mime via `file-type`
- `backend/package.json`, `package-lock.json` - `multer@^2.2.0`, `file-type@^22.0.1` added, scoped to `backend`
- `.gitignore` - excludes `backend/storage/photos/` (runtime-written upload bytes)

## Decisions Made
- Installed `multer`/`file-type` with `--workspace backend` explicitly, per RESEARCH.md's process warning that a prior `slopcheck install` run had accidentally polluted the repo root; verified root `package.json` has zero matches for either package name after install.
- `013` migration deliberately omits UNIQUE/FK constraints present in `012` — `profilePicture` is a plain nullable pointer to a storage filename, not a relationship, so no constraint is needed.
- Chose to hand-construct the three image fixtures byte-for-byte per their actual format specifications (PNG: chunk+CRC32+zlib deflate; JPEG: baseline DCT with a minimal but fully legal custom Huffman-table pair; WebP: RFC 9649 VP8L lossless bitstream, LSB-first bit-packing) rather than pasting remembered base64 strings, specifically to avoid the exact risk this task exists to prevent (T-16-02: fixtures that look like images but aren't). Cross-verified during authoring with two independent decoders outside the test suite (macOS `sips` — full pixel decode confirmed 1x1 for all three — and `file`/libmagic), in addition to the codebase's own `file-type` self-check.
- Fixed `database.test.js`'s null-default test to call `.reload()` before asserting `profilePicture` is `null` (Rule 1: newly-created Sequelize instances don't backfill unset nullable attributes to `null` until fetched from the DB) — matches the existing `mothersname`/`motherId` null-assertion pattern in `FamilyMember.associations.test.js`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed worktree isolation violation during Task 1's npm install**
- **Found during:** Task 1 (install multer + file-type)
- **Issue:** The first `npm install` attempt used `cd /Users/bisrat/Projects/portofolio && npm install ...`, which executed in the shared main checkout instead of this agent's isolated worktree — violating worktree isolation and leaving `multer`/`file-type` installed in the main checkout's `backend/package.json`/`package-lock.json`.
- **Fix:** Ran `npm uninstall multer file-type --workspace backend` in the main checkout to revert (confirmed via byte-identical `package-lock.json` diff against a clean worktree copy afterward), then redid the install correctly with no `cd`, scoped to this worktree's own `backend` workspace.
- **Files modified:** none in this plan's tracked output (main-checkout revert was out-of-band cleanup, not a plan file)
- **Verification:** `diff` of main-checkout vs. clean-worktree `package-lock.json` after revert showed zero differences; subsequent worktree-scoped install confirmed via `grep` that `multer`/`file-type` landed only in `backend/package.json`
- **Committed in:** n/a (no commit — main checkout was reverted to its pre-install state, not committed to)

**2. [Rule 1 - Bug] Fixed a broken test assertion in the RED/GREEN cycle**
- **Found during:** Task 2 GREEN step
- **Issue:** `expect(type?.mime).not.toMatch(...)`-style pattern was not used here, but the null-default `profilePicture` test initially asserted directly on a freshly-`create()`d (not reloaded) instance, which Vitest reported as `undefined` rather than `null` — Sequelize doesn't backfill unset nullable attributes until a DB round-trip.
- **Fix:** Added `await member.reload()` before the assertion, matching the codebase's existing convention (`FamilyMember.associations.test.js`'s `mothersname`/`motherId` null tests).
- **Files modified:** `backend/src/models/database.test.js`
- **Verification:** `npx vitest run src/models/database.test.js -t "profilePicture"` — 2/2 pass
- **Committed in:** `412bf45` (Task 2 GREEN commit)

**3. [Rule 1 - Bug] Fixed a broken test assertion in images.test.js's nonImageBuffer check**
- **Found during:** Task 3
- **Issue:** `expect(type?.mime).not.toMatch(/^image\//)` throws when `type` is `undefined` (Vitest's `toMatch` requires a string, not `undefined`) — and `file-type` correctly returns `undefined` for the plain-text `nonImageBuffer`, which is the expected/desired outcome per the acceptance criteria.
- **Fix:** Rewrote the assertion to explicitly accept either `undefined` or a non-image mime: `expect(type === undefined || !type.mime.startsWith('image/')).toBe(true)`.
- **Files modified:** `backend/test/fixtures/images.test.js`
- **Verification:** `npx vitest run test/fixtures/images.test.js` — 5/5 pass
- **Committed in:** `58cd88d` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (2 bug/test-assertion fixes, 1 worktree-isolation self-correction)
**Impact on plan:** All fixes necessary for correctness; no scope creep. The worktree-isolation issue was caught and fully reverted before any incorrect state was committed anywhere.

## Issues Encountered
- Hand-encoding a fully spec-valid WebP (VP8L lossless) bitstream by hand, with no image library available in this workspace and no internet access to re-verify the spec, was the highest-risk part of this plan. Resolved by implementing the RFC 9649 "simple code length code" trivial single-symbol case (a legitimate, spec-documented degenerate case for minimal images) and independently cross-verifying the resulting bytes decode correctly via macOS's `sips`/`file` tools before committing — both confirmed genuine 1x1-pixel decodability, not just container-level magic-byte matching.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `photoStorageConfig`, the `013` migration + model column, and the real image fixtures are all in place and green — later plans in this phase (upload route, serving route, frontend crop/upload UI) can build directly on top of these without re-deriving storage paths, schema, or fixture validity.
- No blockers identified for 16-02 onward.

---
*Phase: 16-photo-upload*
*Completed: 2026-07-24*

## Self-Check: PASSED

All claimed files verified present on disk; all 4 task commits verified present in git log:
- `backend/src/config/photoStorage.js` — FOUND
- `backend/migrations/manual/013-add-family-members-profile-picture.sql` — FOUND
- `backend/test/fixtures/images.js` — FOUND
- `backend/test/fixtures/images.test.js` — FOUND
- `cf23842` (Task 1) — FOUND
- `bedf556` (Task 2 RED) — FOUND
- `412bf45` (Task 2 GREEN) — FOUND
- `58cd88d` (Task 3) — FOUND
