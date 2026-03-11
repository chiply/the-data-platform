#!/usr/bin/env bash
# _helpers.sh — shared functions for lifecycle scripts (dev-up, production-up, etc.)
# Source this file; do not execute directly.

# ---------------------------------------------------------------------------
# Directory resolution (caller must set SCRIPT_DIR before sourcing)
# ---------------------------------------------------------------------------
INFRA_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
CLUSTER_DIR="${INFRA_DIR}/cluster"
PLATFORM_DIR="${INFRA_DIR}/platform"

# ---------------------------------------------------------------------------
# Prerequisite checks
# ---------------------------------------------------------------------------
missing=()

check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    missing+=("$1")
  fi
}

# Validate that all prerequisite commands are present.
# Call check_cmd() for each required tool first, then call this.
validate_prerequisites() {
  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "ERROR: The following required tools are not installed or not on PATH:" >&2
    for cmd in "${missing[@]}"; do
      echo "  - ${cmd}" >&2
    done
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# Stack initialization
# ---------------------------------------------------------------------------
init_stack_if_missing() {
  local dir="$1" stack="$2"
  pushd "${dir}" >/dev/null
  if ! pulumi stack ls --json 2>/dev/null | grep -q "\"name\": \"${stack}\""; then
    echo "==> Initializing stack ${stack}..."
    pulumi stack init "${stack}"
  fi
  popd >/dev/null
}

configure_config_if_missing() {
  local dir="$1" stack="$2" key="$3" value="$4"
  pushd "${dir}" >/dev/null
  pulumi config get "${key}" --stack "${stack}" &>/dev/null || \
    pulumi config set --stack "${stack}" "${key}" "${value}"
  popd >/dev/null
}

# ---------------------------------------------------------------------------
# Kubeconfig export
# ---------------------------------------------------------------------------
export_kubeconfig() {
  local stack="$1" output_path="$2"
  mkdir -p ~/.kube
  echo "==> Exporting kubeconfig to ${output_path}..."
  (cd "${CLUSTER_DIR}" && pulumi stack output kubeconfig --stack "${stack}" --show-secrets > "${output_path}")
}

# ---------------------------------------------------------------------------
# Pulumi up / destroy wrappers
# ---------------------------------------------------------------------------
deploy_stack() {
  local dir="$1" component="$2" stack="$3"
  echo "==> Deploying ${component} (${stack})..."
  pushd "${dir}" >/dev/null
  npm install --silent
  pulumi up --stack "${stack}" --yes
  popd >/dev/null
}

destroy_stack() {
  local dir="$1" component="$2" stack="$3"
  echo "==> Destroying ${component} (${stack})..."
  pushd "${dir}" >/dev/null
  npm install --silent
  pulumi destroy --stack "${stack}" --yes
  popd >/dev/null
}

# ---------------------------------------------------------------------------
# Access info printing
# ---------------------------------------------------------------------------
print_access_info() {
  local env_name="$1" kubeconfig_path="$2"
  echo ""
  echo "========================================"
  echo "  ${env_name} environment is ready!"
  echo "========================================"
  echo ""
  echo "Kubeconfig:"
  echo "  ${kubeconfig_path}"
  echo ""
  echo "Cluster access:"
  echo "  kubectl --kubeconfig ${kubeconfig_path} get nodes"
  echo "  k9s --kubeconfig ${kubeconfig_path}"
  echo ""
  echo "Platform UIs (port-forward + credentials):"
  echo "  ./monorepo/infra/scripts/ui-access.sh ${env_name,,}"
  echo ""
  if [[ "${env_name,,}" == "local" ]]; then
    echo "ArgoCD UI: http://argocd.localhost"
    echo "Grafana:   kubectl --kubeconfig ${kubeconfig_path} port-forward -n monitoring svc/\$(kubectl --kubeconfig ${kubeconfig_path} get svc -n monitoring -l app.kubernetes.io/name=grafana -o name | head -1 | sed 's|service/||') 3001:80"
  else
    echo "ArgoCD UI: kubectl --kubeconfig ${kubeconfig_path} port-forward -n argocd svc/argocd-server 8080:80"
    echo "Grafana:   kubectl --kubeconfig ${kubeconfig_path} port-forward -n monitoring svc/\$(kubectl --kubeconfig ${kubeconfig_path} get svc -n monitoring -l app.kubernetes.io/name=grafana -o name | head -1 | sed 's|service/||') 3001:80"
  fi
  echo ""
  echo "Verify connectivity:"
  echo "  kubectl --kubeconfig ${kubeconfig_path} cluster-info"
  echo "  kubectl --kubeconfig ${kubeconfig_path} get nodes"
  echo ""
}
