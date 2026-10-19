#!/usr/bin/env bash
# Create the local kind cluster (idempotent), build the images, load them into
# the cluster and deploy the chart.
#   infra/scripts/kind-up.sh            # build + deploy
#   SKIP_BUILD=1 infra/scripts/kind-up.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CLUSTER="${CLUSTER:-hfaio}"
TAG="${TAG:-local-$(git -C "$ROOT" rev-parse --short HEAD)}"

command -v kind >/dev/null || { echo "kind is not installed: https://kind.sigs.k8s.io/docs/user/quick-start/#installation"; exit 1; }

if ! kind get clusters | grep -qx "$CLUSTER"; then
  kind create cluster --config "$ROOT/infra/kind/kind-config.yaml" --name "$CLUSTER" --wait 120s
fi
kubectl config use-context "kind-$CLUSTER" >/dev/null

if [[ -z "${SKIP_BUILD:-}" ]]; then
  docker build -t "hfaio-backend:$TAG" "$ROOT/backend"
  docker build -t "hfaio-frontend:$TAG" "$ROOT/frontend"
fi
kind load docker-image --name "$CLUSTER" "hfaio-backend:$TAG" "hfaio-frontend:$TAG"

"$ROOT/infra/scripts/deploy.sh" \
  -f "$ROOT/infra/helm/hfaio/values-kind.yaml" \
  --set backend.image.repository=hfaio-backend \
  --set frontend.image.repository=hfaio-frontend \
  --set backend.image.tag="$TAG" \
  --set frontend.image.tag="$TAG"
