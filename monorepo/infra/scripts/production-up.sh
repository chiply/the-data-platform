#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

CLUSTER_DIR="${INFRA_DIR}/cluster"
PLATFORM_DIR="${INFRA_DIR}/platform"
STACK_NAME="production"

# ---------------------------------------------------------------------------
# Prerequisite checks
# ---------------------------------------------------------------------------
missing=()

check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    missing+=("$1")
  fi
}

check_cmd pulumi
check_cmd node
check_cmd npm
check_cmd kubectl

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "ERROR: The following required tools are not installed or not on PATH:" >&2
  for cmd in "${missing[@]}"; do
    echo "  - ${cmd}" >&2
  done
  exit 1
fi

# ---------------------------------------------------------------------------
# Ensure required env vars are set
# ---------------------------------------------------------------------------
if [[ -z "${LINODE_TOKEN:-}" ]]; then
  echo "ERROR: LINODE_TOKEN is not set. Add it to .env and run: source .env && export LINODE_TOKEN" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Initialize stacks if needed
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

init_stack_if_missing "${CLUSTER_DIR}" "${STACK_NAME}"
init_stack_if_missing "${PLATFORM_DIR}" "${STACK_NAME}"

# ---------------------------------------------------------------------------
# Configure secrets if not already set
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

# Cluster secrets
configure_secret_if_missing "${CLUSTER_DIR}" "${STACK_NAME}" "linode:token" "LINODE_TOKEN" "false"
configure_secret_if_missing "${CLUSTER_DIR}" "${STACK_NAME}" "tdp-cluster:linodeRootPassword" "LINODE_ROOT_PASSWORD" "true"

# Cluster config (non-secret)
pushd "${CLUSTER_DIR}" >/dev/null
pulumi config get "tdp-cluster:clusterType" --stack "${STACK_NAME}" &>/dev/null || \
  pulumi config set --stack "${STACK_NAME}" "tdp-cluster:clusterType" "linode-k3s"
pulumi config get "tdp-cluster:clusterName" --stack "${STACK_NAME}" &>/dev/null || \
  pulumi config set --stack "${STACK_NAME}" "tdp-cluster:clusterName" "tdp-production"
popd >/dev/null

# Platform config
pushd "${PLATFORM_DIR}" >/dev/null
ORG_NAME=$(pulumi whoami 2>/dev/null || echo "organization")
pulumi config get "tdp-platform:clusterStackRef" --stack "${STACK_NAME}" &>/dev/null || \
  pulumi config set --stack "${STACK_NAME}" "tdp-platform:clusterStackRef" "${ORG_NAME}/tdp-cluster/${STACK_NAME}"
pulumi config get "tdp-platform:environment" --stack "${STACK_NAME}" &>/dev/null || \
  pulumi config set --stack "${STACK_NAME}" "tdp-platform:environment" "production"
popd >/dev/null

configure_secret_if_missing "${PLATFORM_DIR}" "${STACK_NAME}" "tdp-platform:grafanaAdminPassword" "GRAFANA_ADMIN_PASSWORD" "true"

# ---------------------------------------------------------------------------
# Bring up the production environment
# ---------------------------------------------------------------------------
echo "==> Deploying cluster infrastructure (tdp-cluster / ${STACK_NAME})..."
pushd "${CLUSTER_DIR}" >/dev/null
npm install --silent
pulumi up --stack "${STACK_NAME}" --yes
popd >/dev/null

echo ""
echo "==> Deploying platform infrastructure (tdp-platform / ${STACK_NAME})..."
pushd "${PLATFORM_DIR}" >/dev/null
npm install --silent
pulumi up --stack "${STACK_NAME}" --yes
popd >/dev/null

# ---------------------------------------------------------------------------
# Export kubeconfig
# ---------------------------------------------------------------------------
mkdir -p ~/.kube
echo "==> Exporting kubeconfig to ~/.kube/tdp-production.yaml..."
(cd "${CLUSTER_DIR}" && pulumi stack output kubeconfig --stack "${STACK_NAME}" --show-secrets > ~/.kube/tdp-production.yaml)

# ---------------------------------------------------------------------------
# Print cluster access info
# ---------------------------------------------------------------------------
echo ""
echo "========================================"
echo "  Production environment is ready!"
echo "========================================"
echo ""
echo "Kubeconfig:"
echo "  ~/.kube/tdp-production.yaml"
echo ""
echo "Cluster access:"
echo "  kubectl --kubeconfig ~/.kube/tdp-production.yaml get nodes"
echo "  k9s --kubeconfig ~/.kube/tdp-production.yaml"
echo ""
echo "Grafana (port-forward):"
echo "  kubectl --kubeconfig ~/.kube/tdp-production.yaml port-forward -n monitoring svc/\$(kubectl --kubeconfig ~/.kube/tdp-production.yaml get svc -n monitoring -l app.kubernetes.io/name=grafana -o name | head -1 | sed 's|service/||') 3001:80"
echo "  Then open: http://localhost:3001"
echo ""
echo "Verify connectivity:"
echo "  kubectl --kubeconfig ~/.kube/tdp-production.yaml cluster-info"
echo "  kubectl --kubeconfig ~/.kube/tdp-production.yaml get nodes"
echo ""
