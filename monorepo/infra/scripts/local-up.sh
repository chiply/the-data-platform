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

# Check Docker memory allocation (minimum 6 GB recommended for ArgoCD + monitoring)
docker_mem_bytes=$(docker info --format '{{.MemTotal}}' 2>/dev/null || echo "0")
docker_mem_gb=$(( docker_mem_bytes / 1073741824 ))
if [[ ${docker_mem_gb} -lt 6 ]]; then
  echo "WARNING: Docker has ${docker_mem_gb} GB memory allocated. At least 6 GB is" >&2
  echo "  recommended to run ArgoCD + monitoring. Increase Docker Desktop memory" >&2
  echo "  in Settings > Resources > Memory." >&2
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
# Export kubeconfig
# ---------------------------------------------------------------------------
mkdir -p ~/.kube
echo "==> Exporting kubeconfig to ~/.kube/tdp-local.yaml..."
(cd "${CLUSTER_DIR}" && pulumi stack output kubeconfig --stack "${STACK_NAME}" --show-secrets > ~/.kube/tdp-local.yaml)

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
echo "Kubeconfig:"
echo "  ~/.kube/tdp-local.yaml"
echo ""
echo "Cluster access:"
echo "  kubectl --kubeconfig ~/.kube/tdp-local.yaml get nodes"
echo "  k9s --kubeconfig ~/.kube/tdp-local.yaml"
echo ""
echo "Local container registry:"
echo "  ${REGISTRY_URL}"
echo ""
echo "ArgoCD UI:"
echo "  http://argocd.localhost"
echo "  Username: admin"
echo "  Password: kubectl --kubeconfig ~/.kube/tdp-local.yaml -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d"
echo ""
echo "Note: Cluster teardown destroys all ArgoCD state (expected for ephemeral local clusters)."
echo ""
echo "Verify connectivity:"
echo "  kubectl cluster-info"
echo "  kubectl get nodes"
echo ""
