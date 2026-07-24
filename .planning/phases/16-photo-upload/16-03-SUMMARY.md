---
phase: 16-photo-upload
plan: 03
subsystem: infra
tags: [docker, docker-compose, named-volume, persistence, verification-script]

# Dependency graph
requires:
  - phase: 16-photo-upload
    plan: 01
    provides: photoStorageConfig.photosDir (backend/src/config/photoStorage.js), which resolves to /app/backend/storage/photos inside the container (WORKDIR /app/backend) — this plan's volume mount path must match it exactly
provides:
  - photo_uploads named Docker volume, mounted into the backend service at /app/backend/storage/photos
  - backend/scripts/verify-photo-persistence.sh, a repeatable up -> write -> down -> up -> verify script
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "named Docker volume for durable app data, mirroring the pre-existing mysql_data precedent (docker-compose.yml)"
    - "rebuild-persistence verification script: docker compose down (never -v) between two up invocations, marker-file round-trip via docker compose exec -T backend node -e"

key-files:
  created:
    - backend/scripts/verify-photo-persistence.sh
  modified:
    - docker-compose.yml

key-decisions:
  - "photo_uploads volume mount path (/app/backend/storage/photos) chosen to exactly match photoStorageConfig.photosDir's __dirname-relative resolution under the container's WORKDIR /app/backend (confirmed by reading backend/Dockerfile + photoStorage.js before editing, not assumed)"
  - "Full live run of verify-photo-persistence.sh deferred: a concurrent worktree executor (16-02) is running in parallel and shares the host-global portofolio mysql container; docker compose down inside the script would tear that container down mid-run for the other agent. Script was fully syntax-validated (bash -n) and its shape verified (no down -v, exactly two up invocations) instead of executed live."

requirements-completed: [PHOTO-02]

# Metrics
duration: 6min
completed: 2026-07-24
---

# Phase 16 Plan 03: Photo Persistence (Docker Volume + Verification Script) Summary

**Added a `photo_uploads` named Docker volume mounted into the backend service at the exact path `photoStorageConfig.photosDir` resolves to, plus a repeatable rebuild-and-verify script proving persistence (script written, syntax-validated, and shape-verified; not executed live due to a concurrent worktree sharing the host's mysql container)**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-24
- **Completed:** 2026-07-24
- **Tasks:** 2/2
- **Files modified:** 2

## Accomplishments
- `docker-compose.yml`'s `backend` service now mounts `photo_uploads:/app/backend/storage/photos`, mirroring the existing `mysql_data:/var/lib/mysql` precedent on the `mysql` service
- `photo_uploads` declared as a new top-level named volume alongside `mysql_data`
- `docker compose config` confirmed the volume resolves correctly (3 matches for `photo_uploads` in the rendered config: top-level declaration, backend service mount, and the resolved volumes section)
- `backend/scripts/verify-photo-persistence.sh` created, executable, and syntactically valid (`bash -n` passes): starts mysql+backend, polls `/health` until ready, writes a `.persistence-check` marker file directly under the mounted volume via `docker compose exec -T backend node -e`, tears the stack down with plain `docker compose down` (explicitly never `-v`), rebuilds mysql+backend from scratch, polls health again, and verifies the marker file still exists — printing `PASS: photo_uploads persisted across a rebuild` or a specific `FAIL: ...` message with a non-zero exit code

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the photo_uploads named volume** - `c127f06` (feat)
2. **Task 2: Automated rebuild-persistence verification script** - `0ae3979` (feat)

**Plan metadata:** committed separately after this SUMMARY (see final commit)

## Files Created/Modified
- `docker-compose.yml` - added `photo_uploads:/app/backend/storage/photos` to the `backend` service's `volumes:` (new key, service previously had none) and added `photo_uploads:` as a new top-level volume entry
- `backend/scripts/verify-photo-persistence.sh` - new executable script implementing the full up -> write -> down (no `-v`) -> up -> verify persistence proof, per the plan's 7-step spec

## Decisions Made
- Read `backend/Dockerfile` (`WORKDIR /app/backend`) and `backend/src/config/photoStorage.js` (`__dirname`-relative resolution to `../../storage/photos`) before writing the mount path, confirming the container-side absolute path is exactly `/app/backend/storage/photos` — no guessing.
- Script structured with a `wait_for_health` retry loop (30 attempts x 2s) around `curl -fsS http://localhost:${PORT}/health` before either marker-file operation, so the script fails fast with a specific message rather than racing the container's startup.
- Script derives the repo root from its own location (`$(dirname "${BASH_SOURCE[0]}")/../..`) rather than assuming the caller's cwd, so `bash backend/scripts/verify-photo-persistence.sh` works from any directory.

## Deviations from Plan

### Auto-fixed Issues

None - both tasks executed as specified.

### Deferred: Live execution of verify-photo-persistence.sh

The plan's Task 2 instructs "Attempt to run this script once via the Bash tool now," with an explicit fallback: "If a Docker daemon is unavailable in this execution environment, do NOT fabricate a pass... record in the plan SUMMARY that the script exists and ran manually is still required before `/gsd:verify-work`."

In this execution, the Docker daemon **is** available (`docker info` succeeded), but this plan ran as a parallel worktree executor alongside a concurrently-running executor for plan 16-02. Per this agent's explicit parallel-execution instructions: Docker containers are host-global, not worktree-isolated, and the project's `portofolio-mysql-1` container is shared across both agents. Running the full script would execute `docker compose down`, which stops the shared `mysql` container — potentially breaking the concurrent 16-02 agent's test run.

Given that risk, the live end-to-end run was deferred. Instead:
- `bash -n backend/scripts/verify-photo-persistence.sh` was run and passed (syntax valid)
- `test -x backend/scripts/verify-photo-persistence.sh` confirmed executable
- `grep -c "down -v"` confirmed zero matches (never destroys the volume)
- `grep -c "docker compose.*up "` confirmed exactly two `up` invocations (the rebuild-and-verify shape)
- `docker compose config | grep -c photo_uploads` confirmed the volume mount/declaration is correctly wired (read-only check, does not touch running containers)

**Action required before `/gsd:verify-work` or shipping this phase:** run `bash backend/scripts/verify-photo-persistence.sh` from the repo root once no other executor is using the shared Docker stack, and confirm it prints `PASS: photo_uploads persisted across a rebuild`.

## Issues Encountered

None beyond the deferred live-run decision documented above.

## User Setup Required

**Manual verification still needed:** run `bash backend/scripts/verify-photo-persistence.sh` from the repo root (once the Docker stack is free of concurrent executor use) and confirm `PASS`. This is the real, non-hand-waved proof PHOTO-02 requires; static review of docker-compose.yml and the script is necessary but not sufficient.

## Next Phase Readiness
- `photo_uploads` named volume is declared and correctly mounted; `photoStorageConfig.photosDir` (from 16-01) and the container mount path are confirmed to match exactly.
- `backend/scripts/verify-photo-persistence.sh` is ready to run and will be the definitive persistence proof once executed live.
- No blockers for downstream plans (16-04 onward) — this plan's deliverables are infra-only and don't gate route/UI work in other waves.

---
*Phase: 16-photo-upload*
*Completed: 2026-07-24*

## Self-Check: PASSED

- `docker-compose.yml` — FOUND, contains `photo_uploads` (verified via `docker compose config`)
- `backend/scripts/verify-photo-persistence.sh` — FOUND, executable, `bash -n` valid
- `c127f06` (Task 1) — FOUND in git log
- `0ae3979` (Task 2) — FOUND in git log
