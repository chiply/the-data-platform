#!/usr/bin/env bash
# ui-access.sh — Port-forward platform service UIs and print credentials.
#
# Usage:
#   ./monorepo/infra/scripts/ui-access.sh [environment] [service]
#
# Arguments:
#   environment  local | dev | production   (default: local)
#   service      argocd | grafana | all     (default: all)
#
# Examples:
#   ./monorepo/infra/scripts/ui-access.sh                    # local, all UIs
#   ./monorepo/infra/scripts/ui-access.sh dev argocd         # dev ArgoCD only
#   ./monorepo/infra/scripts/ui-access.sh production grafana # production Grafana only

set -euo pipefail

ENV="${1:-local}"
SERVICE="${2:-all}"

# ---------------------------------------------------------------------------
# Resolve kubeconfig
# ---------------------------------------------------------------------------
case "${ENV}" in
  local)
    KUBECONFIG_PATH="${HOME}/.kube/tdp-local.yaml"
    ;;
  dev)
    KUBECONFIG_PATH="${HOME}/.kube/tdp-dev.yaml"
    ;;
  production)
    KUBECONFIG_PATH="${HOME}/.kube/tdp-production.yaml"
    ;;
  *)
    echo "ERROR: Unknown environment '${ENV}'. Use: local | dev | production" >&2
    exit 1
    ;;
esac

if [[ ! -f "${KUBECONFIG_PATH}" ]]; then
  echo "ERROR: Kubeconfig not found at ${KUBECONFIG_PATH}" >&2
  echo "Run the appropriate setup script first (e.g., ./monorepo/infra/scripts/${ENV}-up.sh)" >&2
  exit 1
fi

KC="--kubeconfig ${KUBECONFIG_PATH}"

# ---------------------------------------------------------------------------
# Helper: discover service name by label
# ---------------------------------------------------------------------------
find_svc() {
  local ns="$1" label="$2"
  kubectl ${KC} get svc -n "${ns}" -l "${label}" -o name 2>/dev/null | head -1 | sed 's|service/||'
}

# ---------------------------------------------------------------------------
# ArgoCD
# ---------------------------------------------------------------------------
argocd_access() {
  echo ""
  echo "=== ArgoCD UI (${ENV}) ==="
  echo ""

  if [[ "${ENV}" == "local" ]]; then
    echo "ArgoCD is available via ingress (no port-forward needed):"
    echo "  URL: http://argocd.localhost"
  else
    echo "Start port-forward:"
    local svc
    svc=$(find_svc argocd "app.kubernetes.io/name=argocd-server")
    if [[ -z "${svc}" ]]; then
      echo "  ERROR: ArgoCD server service not found in namespace 'argocd'" >&2
      return 1
    fi
    echo "  kubectl ${KC} port-forward -n argocd svc/${svc} 8080:80"
    echo ""
    echo "Then open: http://localhost:8080"
  fi

  echo ""
  echo "Credentials:"
  echo "  Username: admin"

  local password
  password=$(kubectl ${KC} -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' 2>/dev/null | base64 --decode 2>/dev/null || true)
  if [[ -n "${password}" ]]; then
    echo "  Password: ${password}"
  else
    echo "  Password: (run manually)"
    echo "    kubectl ${KC} -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 --decode"
  fi
  echo ""
}

# ---------------------------------------------------------------------------
# Grafana
# ---------------------------------------------------------------------------
grafana_access() {
  echo ""
  echo "=== Grafana UI (${ENV}) ==="
  echo ""

  local svc
  svc=$(find_svc monitoring "app.kubernetes.io/name=grafana")
  if [[ -z "${svc}" ]]; then
    echo "  ERROR: Grafana service not found in namespace 'monitoring'" >&2
    return 1
  fi

  echo "Start port-forward:"
  echo "  kubectl ${KC} port-forward -n monitoring svc/${svc} 3001:80"
  echo ""
  echo "Then open: http://localhost:3001"
  echo ""
  echo "Credentials:"
  echo "  Username: admin"

  local password
  password=$(kubectl ${KC} -n monitoring get secret -l app.kubernetes.io/name=grafana -o jsonpath='{.items[0].data.admin-password}' 2>/dev/null | base64 --decode 2>/dev/null || true)
  if [[ -n "${password}" ]]; then
    echo "  Password: ${password}"
  else
    echo "  Password: (run manually)"
    echo "    kubectl ${KC} -n monitoring get secret -l app.kubernetes.io/name=grafana -o jsonpath='{.items[0].data.admin-password}' | base64 --decode"
  fi
  echo ""
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
case "${SERVICE}" in
  argocd)
    argocd_access
    ;;
  grafana)
    grafana_access
    ;;
  all)
    argocd_access
    grafana_access
    ;;
  *)
    echo "ERROR: Unknown service '${SERVICE}'. Use: argocd | grafana | all" >&2
    exit 1
    ;;
esac
