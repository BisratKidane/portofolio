#!/usr/bin/env bash
# Build backend + frontend images from a CLEAN checkout of the `main` branch and
# push them to Docker Hub, cross-built for linux/amd64 (the server's arch).
#
# Tags pushed per image:
#   :$IMAGE_TAG            (moving, e.g. latest)
#   :<main-short-sha>      (immutable — deploy.sh deploys this exact tag)
#
# Usage:
#   ./build-and-push.sh            # reads ./deploy.config
#   DOCKERHUB_USER=me ./build-and-push.sh
#
# Exports IMAGE_BACKEND / IMAGE_FRONTEND (the immutable-sha refs) when sourced.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -f "$SCRIPT_DIR/deploy.config" ]] && source "$SCRIPT_DIR/deploy.config"

: "${DOCKERHUB_USER:?Set DOCKERHUB_USER (in deploy.config or the environment)}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
PLATFORM="${PLATFORM:-linux/amd64}"

REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
if ! git -C "$REPO_ROOT" rev-parse --verify --quiet main >/dev/null; then
  echo "ERROR: no local 'main' branch to build from." >&2
  exit 1
fi
MAIN_SHA="$(git -C "$REPO_ROOT" rev-parse --short main)"

BACKEND_REPO="docker.io/${DOCKERHUB_USER}/portofolio-backend"
FRONTEND_REPO="docker.io/${DOCKERHUB_USER}/portofolio-frontend"

echo "==> Building from main @ ${MAIN_SHA} for ${PLATFORM}"
echo "    ${BACKEND_REPO}:{${IMAGE_TAG},${MAIN_SHA}}"
echo "    ${FRONTEND_REPO}:{${IMAGE_TAG},${MAIN_SHA}}"

# Clean, branch-pinned build context (works no matter which branch is checked out).
BUILD_CTX="$(mktemp -d)"
cleanup() { rm -rf "$BUILD_CTX"; }
trap cleanup EXIT
git -C "$REPO_ROOT" archive main | tar -x -C "$BUILD_CTX"

# buildx builder capable of cross-arch build + push (docker-container driver).
BUILDER="portofolio-builder"
if ! docker buildx inspect "$BUILDER" >/dev/null 2>&1; then
  echo "==> Creating buildx builder '$BUILDER'"
  docker buildx create --name "$BUILDER" --driver docker-container --bootstrap >/dev/null
fi

echo "==> Building + pushing backend"
docker buildx build \
  --builder "$BUILDER" \
  --platform "$PLATFORM" \
  -f "$BUILD_CTX/backend/Dockerfile" \
  -t "${BACKEND_REPO}:${IMAGE_TAG}" \
  -t "${BACKEND_REPO}:${MAIN_SHA}" \
  --push \
  "$BUILD_CTX"

echo "==> Building + pushing frontend"
docker buildx build \
  --builder "$BUILDER" \
  --platform "$PLATFORM" \
  -f "$SCRIPT_DIR/frontend.Dockerfile" \
  --build-arg VITE_API_URL=/graphql \
  -t "${FRONTEND_REPO}:${IMAGE_TAG}" \
  -t "${FRONTEND_REPO}:${MAIN_SHA}" \
  --push \
  "$BUILD_CTX"

# Immutable refs for the caller (deploy.sh) to deploy exactly what we built.
export IMAGE_BACKEND="${BACKEND_REPO}:${MAIN_SHA}"
export IMAGE_FRONTEND="${FRONTEND_REPO}:${MAIN_SHA}"
export DEPLOYED_MAIN_SHA="$MAIN_SHA"
echo "==> Pushed. IMAGE_BACKEND=$IMAGE_BACKEND IMAGE_FRONTEND=$IMAGE_FRONTEND"
