#!/usr/bin/env bash
# Deploy HFAIO with Helm, smoke-test it, and roll back automatically on failure.
# Used by the CD workflow and by kind-up.sh. Extra args go to `helm upgrade`.
#
#   infra/scripts/deploy.sh -f infra/helm/hfaio/values-kind.yaml --set backend.image.tag=abc123
#
# Rollback demo (deliberately broken deploy):
#   infra/scripts/deploy.sh -f infra/helm/hfaio/values-kind.yaml --set backend.image.tag=does-not-exist
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RELEASE="${RELEASE:-hfaio}"
NAMESPACE="${NAMESPACE:-hfaio}"
TIMEOUT="${TIMEOUT:-8m}"

log() { printf '\n[deploy] %s\n' "$*"; }

previous_revision() {
  helm history "$RELEASE" -n "$NAMESPACE" -o json 2>/dev/null \
    | python3 -c 'import json,sys; h=[r for r in json.load(sys.stdin) if r["status"]=="deployed"]; print(h[-1]["revision"] if h else "")' \
    || true
}

rollback() {
  local reason="$1" prev="$2"
  log "FAILED: $reason"
  kubectl -n "$NAMESPACE" get pods -o wide || true
  kubectl -n "$NAMESPACE" get events --sort-by=.lastTimestamp | tail -n 20 || true
  if [[ -n "$prev" ]]; then
    log "Rolling back $RELEASE to revision $prev"
    helm rollback "$RELEASE" "$prev" -n "$NAMESPACE" --wait --timeout "$TIMEOUT"
    log "Rollback complete; release is back on revision $prev"
  else
    log "No previous healthy revision to roll back to"
  fi
  exit 1
}

PREV="$(previous_revision)"
log "Current healthy revision: ${PREV:-none}"

log "helm upgrade --install $RELEASE"
START=$(date +%s)
if ! helm upgrade --install "$RELEASE" "$ROOT/infra/helm/hfaio" \
      --namespace "$NAMESPACE" --create-namespace \
      --wait --timeout "$TIMEOUT" "$@"; then
  rollback "rollout did not become ready within $TIMEOUT" "$PREV"
fi

log "Running smoke test (helm test)"
if ! helm test "$RELEASE" -n "$NAMESPACE" --timeout 3m --logs; then
  rollback "smoke test failed" "$PREV"
fi

log "Deployed revision $(previous_revision) in $(( $(date +%s) - START ))s"
helm status "$RELEASE" -n "$NAMESPACE" | sed -n '1,8p'
