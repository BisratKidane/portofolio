---
phase: 16-photo-upload
plan: 02
subsystem: api
tags: [tdd, filesystem, crypto, photo-storage, vitest]

# Dependency graph
requires:
  - phase: 16-photo-upload
    plan: 16-01
    provides: photoStorageConfig (backend/src/config/photoStorage.js) resolving the photo storage directory
provides:
  - photoStorage.service.js (backend/src/services/photoStorage.service.js) — generatePhotoFilename, resolvePhotoPath, writePhotoFile, deletePhotoFile, finalizePhotoReplacement
  - the write-new -> commit -> delete-old-or-discard-new orphan-free replace pattern (D-11) later route plans (16-04, 16-05) import instead of re-deriving file I/O
affects: [16-04, 16-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "server-generated-only filenames: crypto.randomUUID() + caller-supplied extension, never client input at this layer"
    - "finalizePhotoReplacement's commit callback ordering: write-new file to disk BEFORE invoking commit; delete-old only after commit resolves; discard-new (not delete-old) if commit rejects"
    - "deletePhotoFile is null-safe (zero fs calls) and ENOENT-safe (swallows only that error code, rethrows everything else)"

key-files:
  created:
    - backend/src/services/photoStorage.service.js
    - backend/src/services/photoStorage.service.test.js
  modified: []

key-decisions:
  - "finalizePhotoReplacement takes a commit callback (not a Sequelize transaction) since this service has zero Sequelize/DB awareness by design, mirroring familyMember.service.js's setSpouse caller-supplied-transaction convention but decoupled from any specific ORM"
  - "All 13 tests for both tasks were written in a single RED commit (Task 1 primitives + Task 2 finalizePhotoReplacement together), then implemented in a single GREEN commit — the two tasks share one file/one behavior contract with no meaningful red/green boundary between them"

patterns-established:
  - "photoStorage.service.js is the sole file-system write/delete surface for photos; all later route handlers (16-04 upload, 16-05 replace/delete) call into these exports rather than touching fs or photoStorageConfig.photosDir directly"

requirements-completed: [PHOTO-03, QUAL-01]

# Metrics
duration: 12min
completed: 2026-07-24
---

# Phase 16 Plan 02: Photo Storage Service Summary

**TDD-built photoStorage.service.js: server-generated UUID filenames, real byte-exact file I/O, and an orphan-free write-then-commit-then-cleanup replace sequence (D-11) — the sole file-system surface later upload/replace routes depend on**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-24T18:09:00Z
- **Completed:** 2026-07-24T18:21:30Z
- **Tasks:** 2 (both executed as a single TDD RED -> GREEN cycle across one test file)
- **Files created:** 2

## Accomplishments
- `generatePhotoFilename(ext)` returns `crypto.randomUUID()` + the given extension; two consecutive calls never collide; no client input reachable in the signature
- `resolvePhotoPath(filename)` joins `photoStorageConfig.photosDir` with the filename via `path.join`
- `writePhotoFile(buffer, filename)` creates the photos directory if missing (`fs.mkdir({ recursive: true })`) and writes exact bytes; round-trip read confirmed byte-identical
- `deletePhotoFile(filename)` is ENOENT-safe (only that error code swallowed, everything else rethrown) and null/undefined-safe (zero filesystem calls, verified via `vi.spyOn(fs, 'unlink')`)
- `finalizePhotoReplacement({ buffer, ext, previousFilename, commit })` implements the exact Pitfall 3 ordering: write-new -> `commit(newFilename)` -> delete-old on success, or discard-new (leaving the old file completely untouched) on commit rejection — proven via a real filesystem test asserting exactly one file remains after a successful replace cycle, and the old file is untouched after a failed one
- 13/13 tests green; RED commit (`a4e634a`) precedes GREEN commit (`1c93e25`) in git log, confirmed
- Full backend suite re-run: 301/301 tests pass across 45 files — no regressions

## Task Commits

Each task was committed atomically:

1. **Tasks 1+2: photoStorage service tests (RED)** - `a4e634a` (test)
2. **Tasks 1+2: photoStorage service implementation (GREEN)** - `1c93e25` (feat)

_Note: Task 1's primitives and Task 2's `finalizePhotoReplacement` share one file and one behavioral contract with no meaningful red/green split between them, so both were tested and implemented together in a single RED -> GREEN cycle rather than as two separate cycles. Confirmed RED (`a4e634a`) precedes GREEN (`1c93e25`) in git log._

## Files Created/Modified
- `backend/src/services/photoStorage.service.js` - exports `generatePhotoFilename`, `resolvePhotoPath`, `writePhotoFile`, `deletePhotoFile`, `finalizePhotoReplacement`
- `backend/src/services/photoStorage.service.test.js` - 13 tests, real filesystem I/O against `photoStorageConfig.photosDir` (no mocking of `fs.readFile`/`fs.writeFile`, matching the codebase's existing "real I/O" test philosophy), with `beforeEach`/`afterEach` cleanup of every file the tests write

## Decisions Made
- `finalizePhotoReplacement` accepts a plain `commit` async callback rather than a Sequelize transaction object, since this service is intentionally zero-Sequelize/zero-DB-aware — the caller (a future route/resolver) is responsible for wrapping its own DB write in `commit`, mirroring `familyMember.service.js`'s `setSpouse` caller-supplied-transaction shape but decoupled from any specific ORM.
- Combined Task 1 and Task 2 into a single RED commit and a single GREEN commit rather than two separate red/green cycles, since both tasks modify the exact same two files with a single, indivisible behavioral contract (`finalizePhotoReplacement` composes the Task 1 primitives directly) — splitting them into artificial separate commits would not have produced any intermediate meaningfully-passing state.

## Deviations from Plan

None - plan executed exactly as written. All 4 primitive functions plus `finalizePhotoReplacement` implemented per spec; acceptance criteria greps (`randomUUID`, `ENOENT`) both confirmed present in the implementation file.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `photoStorage.service.js`'s 5 exports are the complete, tested file-I/O contract later plans need: 16-04 (upload route) and 16-05 (replace/delete route) can call `finalizePhotoReplacement`/`deletePhotoFile` directly rather than re-deriving any file-system logic.
- No blockers identified.

---
*Phase: 16-photo-upload*
*Completed: 2026-07-24*

## Self-Check: PASSED

All claimed files verified present on disk; all commits verified present in git log:
- `backend/src/services/photoStorage.service.js` — FOUND
- `backend/src/services/photoStorage.service.test.js` — FOUND
- `a4e634a` (RED) — FOUND
- `1c93e25` (GREEN) — FOUND
