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
# Environment variable checks
# ---------------------------------------------------------------------------
require_linode_token() {
  if [[ -z "${LINODE_TOKEN:-}" ]]; then
    echo "ERROR: LINODE_TOKEN is not set. Add it to .env and run: source .env && export LINODE_TOKEN" >&2
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

# ---------------------------------------------------------------------------
# Secret / config helpers
# ---------------------------------------------------------------------------
configure_secret_if_missing() {
  local dir="$1" stack="$2" key="$3" env_var="$4" generate="$5"
  pushd "${dir}" >/dev/null
  if ! pulumi config get "${key}" --stack "${stack}" &>/dev/null; then
    local value="${!env_var:-}"
    if [[ -z "${value}" && "${generate}" == "true" ]]; then
      value=$(openssl rand -base64 24)
      echo "==> Generated ${key} (not in env, auto-generated)"
    fi
    if [[ -z "${value}" ]]; then
      echo "ERROR: ${key} is not configured and ${env_var} is not set." >&2
      echo "  Either set ${env_var} in .env or run:" >&2
      echo "  pulumi config set --secret --stack ${stack} ${key} <value>" >&2
      popd >/dev/null
      exit 1
    fi
    echo "==> Setting ${key} from ${env_var}..."
    pulumi config set --secret --stack "${stack}" "${key}" "${value}"
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
  echo "Grafana (port-forward):"
  echo "  kubectl --kubeconfig ${kubeconfig_path} port-forward -n monitoring svc/\$(kubectl --kubeconfig ${kubeconfig_path} get svc -n monitoring -l app.kubernetes.io/name=grafana -o name | head -1 | sed 's|service/||') 3001:80"
  echo "  Then open: http://localhost:3001"
  echo ""
  echo "Verify connectivity:"
  echo "  kubectl --kubeconfig ${kubeconfig_path} cluster-info"
  echo "  kubectl --kubeconfig ${kubeconfig_path} get nodes"
  echo ""
}
