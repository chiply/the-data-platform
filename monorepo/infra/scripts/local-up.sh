#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/_helpers.sh"

STACK_NAME="local"
KUBECONFIG_PATH="${HOME}/.kube/tdp-local.yaml"

# ---------------------------------------------------------------------------
# Prerequisite checks
# ---------------------------------------------------------------------------
check_cmd docker
check_cmd k3d
check_cmd pulumi
check_cmd node
check_cmd npm
validate_prerequisites

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
deploy_stack "${CLUSTER_DIR}" "tdp-cluster" "${STACK_NAME}"

# Ensure the k3d registry hostname is resolvable from the host.
# Docker needs to resolve the registry name to push images to it.
REGISTRY_HOST="k3d-tdp-local-registry"
if ! grep -q "${REGISTRY_HOST}" /etc/hosts 2>/dev/null; then
  echo "==> Adding ${REGISTRY_HOST} to /etc/hosts (requires sudo)..."
  sudo sh -c "echo '127.0.0.1 ${REGISTRY_HOST}' >> /etc/hosts"
fi

deploy_stack "${PLATFORM_DIR}" "tdp-platform" "${STACK_NAME}"

# ---------------------------------------------------------------------------
# Export kubeconfig & print access info
# ---------------------------------------------------------------------------
export_kubeconfig "${STACK_NAME}" "${KUBECONFIG_PATH}"
print_access_info "Local" "${KUBECONFIG_PATH}"
