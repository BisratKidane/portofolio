#!/usr/bin/env bash
# One-shot deploy: build images from `main`, push to Docker Hub, then have the
# server pull and (re)start the stack. Run from your laptop:
#
#   cd docker-deploy
#   cp deploy.config.example deploy.config && $EDITOR deploy.config
#   cp remote.env.example    remote.env    && $EDITOR remote.env
#   docker login                # once, so the build can push
#   ./deploy.sh
#
# Flags:
#   --skip-build   deploy the already-pushed :<sha> images without rebuilding
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

SKIP_BUILD=0
[[ "${1:-}" == "--skip-build" ]] && SKIP_BUILD=1

# ---- config ----
[[ -f deploy.config ]] || { echo "ERROR: deploy.config missing. Copy deploy.config.example and fill it in." >&2; exit 1; }
source deploy.config
: "${DOCKERHUB_USER:?Set DOCKERHUB_USER in deploy.config}"
: "${SERVER_SSH:?Set SERVER_SSH in deploy.config}"
: "${DOMAIN:?Set DOMAIN in deploy.config}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
REMOTE_DIR="${REMOTE_DIR:-/opt/portofolio}"

# ---- preflight ----
command -v docker >/dev/null || { echo "ERROR: docker not found locally." >&2; exit 1; }
docker buildx version >/dev/null 2>&1 || { echo "ERROR: docker buildx not available." >&2; exit 1; }
[[ -f remote.env ]] || { echo "ERROR: remote.env missing. Copy remote.env.example and fill it in." >&2; exit 1; }

if grep -q "CHANGE_ME" remote.env; then
  echo "ERROR: remote.env still contains CHANGE_ME placeholders. Fill in real values first." >&2
  exit 1
fi
if [[ "$DOMAIN" == "app.example.com" ]]; then
  echo "ERROR: DOMAIN is still the example value. Set a real domain (DNS -> server) for TLS." >&2
  exit 1
fi

echo "==> Checking SSH connectivity to $SERVER_SSH"
ssh -o BatchMode=yes -o ConnectTimeout=10 "$SERVER_SSH" 'echo ok >/dev/null' \
  || { echo "ERROR: cannot SSH to $SERVER_SSH" >&2; exit 1; }

# ---- build + push (exports IMAGE_BACKEND / IMAGE_FRONTEND / DEPLOYED_MAIN_SHA) ----
if [[ "$SKIP_BUILD" -eq 0 ]]; then
  source ./build-and-push.sh
else
  MAIN_SHA="$(git -C "$SCRIPT_DIR" rev-parse --short main)"
  export IMAGE_BACKEND="docker.io/${DOCKERHUB_USER}/portofolio-backend:${MAIN_SHA}"
  export IMAGE_FRONTEND="docker.io/${DOCKERHUB_USER}/portofolio-frontend:${MAIN_SHA}"
  export DEPLOYED_MAIN_SHA="$MAIN_SHA"
  echo "==> --skip-build: deploying existing images @ ${MAIN_SHA}"
fi

# ---- ship compose assets to the server ----
echo "==> Syncing compose files to $SERVER_SSH:$REMOTE_DIR"
ssh -o BatchMode=yes "$SERVER_SSH" "mkdir -p '$REMOTE_DIR' && rm -f '$REMOTE_DIR/docker-compose.override.yml'"
scp -o BatchMode=yes docker-compose.yml Caddyfile remote.env "$SERVER_SSH:$REMOTE_DIR/"

# ---- pull + (re)start on the server ----
echo "==> Pulling images + starting stack on the server"
ssh -o BatchMode=yes "$SERVER_SSH" bash -s <<REMOTE
set -euo pipefail
cd "$REMOTE_DIR"
# Open the web ports (idempotent; harmless if ufw is inactive).
if command -v ufw >/dev/null 2>&1; then ufw allow 80/tcp >/dev/null 2>&1 || true; ufw allow 443/tcp >/dev/null 2>&1 || true; fi
export IMAGE_BACKEND='$IMAGE_BACKEND'
export IMAGE_FRONTEND='$IMAGE_FRONTEND'
export DOMAIN='$DOMAIN'
docker compose --env-file remote.env pull
docker compose --env-file remote.env up -d --remove-orphans
echo "--- waiting for backend health ---"
for i in \$(seq 1 20); do
  if docker compose --env-file remote.env exec -T backend wget -qO- http://127.0.0.1:4000/health 2>/dev/null | grep -q '"ok"'; then
    echo "backend healthy"; break
  fi
  sleep 3
  [ "\$i" = "20" ] && { echo "WARN: backend health not confirmed; check 'docker compose logs backend'"; }
done
docker compose --env-file remote.env ps
REMOTE

echo ""
echo "==> Deployed main @ ${DEPLOYED_MAIN_SHA}"
echo "    App:  https://${DOMAIN}"
echo "    API:  https://${DOMAIN}/graphql"
echo "    (Caddy needs DNS for ${DOMAIN} -> server and ports 80/443 reachable for TLS.)"
