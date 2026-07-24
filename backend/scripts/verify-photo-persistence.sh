#!/usr/bin/env bash
# Proves that uploaded photos live on the photo_uploads named Docker volume,
# not the backend container's ephemeral writable layer, by writing a marker
# file, tearing the stack down (without -v), rebuilding it, and confirming
# the marker survived.
#
# Usage: bash backend/scripts/verify-photo-persistence.sh
# Must be run from the repo root (or it cds there itself).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

ENV_FILE="env/local.env"
PORT="${PORT:-4000}"
MARKER_PATH="/app/backend/storage/photos/.persistence-check"
HEALTH_URL="http://localhost:${PORT}/health"
MAX_RETRIES=30
RETRY_DELAY=2

fail() {
  echo "FAIL: $1"
  exit 1
}

wait_for_health() {
  local attempt=1
  while [ "${attempt}" -le "${MAX_RETRIES}" ]; do
    if curl -fsS "${HEALTH_URL}" >/dev/null 2>&1; then
      return 0
    fi
    attempt=$((attempt + 1))
    sleep "${RETRY_DELAY}"
  done
  return 1
}

echo "Step 1/6: starting mysql + backend (first build)..."
docker compose --env-file "${ENV_FILE}" up -d --build mysql backend \
  || fail "docker compose up (first build) failed"

echo "Step 2/6: waiting for backend health check..."
wait_for_health || fail "backend did not become healthy at ${HEALTH_URL}"

echo "Step 3/6: writing marker file inside the mounted volume..."
docker compose exec -T backend node -e \
  "require('fs').writeFileSync('${MARKER_PATH}', 'ok')" \
  || fail "could not write marker file into the volume"

echo "Step 4/6: tearing down the stack (docker compose down, no -v)..."
docker compose down || fail "docker compose down failed"

echo "Step 5/6: rebuilding mysql + backend from scratch..."
docker compose --env-file "${ENV_FILE}" up -d --build mysql backend \
  || fail "docker compose up (second build) failed"

wait_for_health || fail "backend did not become healthy after rebuild"

echo "Step 6/6: verifying marker file survived the rebuild..."
docker compose exec -T backend node -e \
  "if (!require('fs').existsSync('${MARKER_PATH}')) process.exit(1)" \
  || fail "marker file did not survive the rebuild -- photo_uploads volume is NOT persisting data"

echo "PASS: photo_uploads persisted across a rebuild"
exit 0
