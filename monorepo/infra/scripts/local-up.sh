#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

CLUSTER_DIR="${INFRA_DIR}/cluster"
PLATFORM_DIR="${INFRA_DIR}/platform"
STACK_NAME="local"

# ---------------------------------------------------------------------------
# Prerequisite checks
# ---------------------------------------------------------------------------
missing=()

check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    missing+=("$1")
  fi
}

check_cmd docker
check_cmd k3d
check_cmd pulumi
check_cmd node
check_cmd npm

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "ERROR: The following required tools are not installed or not on PATH:" >&2
  for cmd in "${missing[@]}"; do
    echo "  - ${cmd}" >&2
  done
  echo "" >&2
  echo "Please install the missing prerequisites and try again." >&2
  echo "Refer to monorepo/infra/README.md for installation instructions." >&2
  exit 1
fi

# Verify Docker daemon is running
if ! docker info &>/dev/null; then
  echo "ERROR: Docker daemon is not running. Please start Docker and try again." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Bring up the local environment
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
# Print cluster access info
# ---------------------------------------------------------------------------
CLUSTER_NAME=$(cd "${CLUSTER_DIR}" && pulumi stack output clusterName --stack "${STACK_NAME}" 2>/dev/null || echo "tdp-local")
REGISTRY_URL=$(cd "${CLUSTER_DIR}" && pulumi stack output registryUrl --stack "${STACK_NAME}" 2>/dev/null || echo "k3d-tdp-local-registry:5111")

echo ""
echo "========================================"
echo "  Local environment is ready!"
echo "========================================"
echo ""
echo "Cluster access (k3d sets kubeconfig automatically):"
echo "  kubectl config use-context k3d-${CLUSTER_NAME}"
echo ""
echo "Local container registry:"
echo "  ${REGISTRY_URL}"
echo ""
echo "Verify connectivity:"
echo "  kubectl cluster-info"
echo "  kubectl get nodes"
echo ""
