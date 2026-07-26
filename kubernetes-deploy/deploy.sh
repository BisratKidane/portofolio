#!/usr/bin/env bash
# Deploy the app to the current kubectl cluster/context.
#
#   cp secret.example.env secret.env && $EDITOR secret.env   # real secrets
#   $EDITOR kustomization.yaml   # set images.newName (your Docker Hub user) + host in configmap/ingress
#   ./deploy.sh                  # apply to the CURRENT kube context
#   ./deploy.sh --build          # first build+push images from main, pin the sha tag, then apply
#
# Prereqs: kubectl (with a current context), an ingress controller + cert-manager
# in the cluster, and the images already on Docker Hub (or use --build).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
NAMESPACE="portofolio"
BUILD=0
[[ "${1:-}" == "--build" ]] && BUILD=1

command -v kubectl >/dev/null || { echo "ERROR: kubectl not found." >&2; exit 1; }

CTX="$(kubectl config current-context 2>/dev/null || true)"
[[ -n "$CTX" ]] || { echo "ERROR: no current kubectl context set." >&2; exit 1; }
echo "==> Target cluster context: $CTX"
read -r -p "    Deploy to this context? [y/N] " ans
[[ "$ans" == "y" || "$ans" == "Y" ]] || { echo "Aborted."; exit 1; }

# ---- secret.env ----
[[ -f secret.env ]] || { echo "ERROR: secret.env missing. Copy secret.example.env and fill it in." >&2; exit 1; }
if grep -q "CHANGE_ME" secret.env; then
  echo "ERROR: secret.env still contains CHANGE_ME placeholders." >&2
  exit 1
fi

# ---- optional: build + push from main, then pin the image tag ----
if [[ "$BUILD" -eq 1 ]]; then
  echo "==> Building + pushing images from main"
  # shellcheck disable=SC1091
  source ../docker-deploy/build-and-push.sh   # exports DEPLOYED_MAIN_SHA + DOCKERHUB_USER
  if command -v kustomize >/dev/null 2>&1; then
    kustomize edit set image \
      "portofolio-backend=docker.io/${DOCKERHUB_USER}/portofolio-backend:${DEPLOYED_MAIN_SHA}" \
      "portofolio-frontend=docker.io/${DOCKERHUB_USER}/portofolio-frontend:${DEPLOYED_MAIN_SHA}"
    echo "==> Pinned kustomize images to :${DEPLOYED_MAIN_SHA}"
  else
    echo "NOTE: 'kustomize' CLI not found — set images.newTag to '${DEPLOYED_MAIN_SHA}' in kustomization.yaml manually." >&2
  fi
fi

if grep -q "your-dockerhub-username" kustomization.yaml; then
  echo "ERROR: kustomization.yaml still has the placeholder image name. Set images.newName to your Docker Hub user." >&2
  exit 1
fi

# ---- apply ----
echo "==> Ensuring namespace + secret"
kubectl apply -f namespace.yaml
kubectl create secret generic portofolio-secret \
  --namespace "$NAMESPACE" \
  --from-env-file=secret.env \
  --dry-run=client -o yaml | kubectl apply -f -

echo "==> Applying manifests (kustomize)"
kubectl apply -k .

echo "==> Waiting for rollouts"
kubectl -n "$NAMESPACE" rollout status deploy/mysql --timeout=180s || true
kubectl -n "$NAMESPACE" rollout status deploy/backend --timeout=180s
kubectl -n "$NAMESPACE" rollout status deploy/frontend --timeout=120s

echo ""
echo "==> Done. Pods:"
kubectl -n "$NAMESPACE" get pods
echo ""
echo "Ingress (point DNS at its address, cert-manager will issue TLS):"
kubectl -n "$NAMESPACE" get ingress portofolio
