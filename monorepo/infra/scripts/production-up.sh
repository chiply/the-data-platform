#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_NAME="production"
KUBECONFIG_PATH=~/.kube/tdp-production.yaml

# shellcheck source=_helpers.sh
source "${SCRIPT_DIR}/_helpers.sh"

# ---------------------------------------------------------------------------
# Prerequisite checks
# ---------------------------------------------------------------------------
check_cmd pulumi
check_cmd node
check_cmd npm
check_cmd kubectl
validate_prerequisites

# ---------------------------------------------------------------------------
# Initialize stacks if needed
# ---------------------------------------------------------------------------
init_stack_if_missing "${CLUSTER_DIR}" "${STACK_NAME}"
init_stack_if_missing "${PLATFORM_DIR}" "${STACK_NAME}"

# ---------------------------------------------------------------------------
# Configure non-secret config if not already set
# ---------------------------------------------------------------------------
configure_config_if_missing "${CLUSTER_DIR}" "${STACK_NAME}" "tdp-cluster:clusterType" "linode-k3s"
configure_config_if_missing "${CLUSTER_DIR}" "${STACK_NAME}" "tdp-cluster:clusterName" "tdp-production"

pushd "${PLATFORM_DIR}" >/dev/null
ORG_NAME=$(pulumi whoami 2>/dev/null || echo "organization")
popd >/dev/null
configure_config_if_missing "${PLATFORM_DIR}" "${STACK_NAME}" "tdp-platform:clusterStackRef" "${ORG_NAME}/tdp-cluster/${STACK_NAME}"

# ---------------------------------------------------------------------------
# Bring up the production environment
# Secrets (linode:token, linodeRootPassword, grafanaAdminPassword) are
# provided by the Pulumi ESC environment "tdp/production" imported in
# Pulumi.production.yaml.
# ---------------------------------------------------------------------------
deploy_stack "${CLUSTER_DIR}" "cluster infrastructure (tdp-cluster / ${STACK_NAME})" "${STACK_NAME}"

echo ""
deploy_stack "${PLATFORM_DIR}" "platform infrastructure (tdp-platform / ${STACK_NAME})" "${STACK_NAME}"

# ---------------------------------------------------------------------------
# Export kubeconfig
# ---------------------------------------------------------------------------
export_kubeconfig "${STACK_NAME}" "${KUBECONFIG_PATH}"

# ---------------------------------------------------------------------------
# Bootstrap ArgoCD applications
# ---------------------------------------------------------------------------
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/../../deploy" && pwd)"

echo "==> Applying ArgoCD AppProject and applications..."
kubectl --kubeconfig "${KUBECONFIG_PATH}" apply -f "${DEPLOY_DIR}/argocd/appproject.yaml"
kubectl --kubeconfig "${KUBECONFIG_PATH}" apply -f "${DEPLOY_DIR}/argocd/rbac/"
kubectl --kubeconfig "${KUBECONFIG_PATH}" apply -f "${DEPLOY_DIR}/argocd/network-policies/"
kubectl --kubeconfig "${KUBECONFIG_PATH}" apply -f "${DEPLOY_DIR}/argocd/apps/schema-registry-production.yaml"

echo "==> Waiting for ArgoCD to sync schema-registry..."
kubectl --kubeconfig "${KUBECONFIG_PATH}" wait --for=jsonpath='{.status.sync.status}'=Synced \
  application/schema-registry-production -n argocd --timeout=120s 2>/dev/null || \
  echo "  (sync not yet complete — ArgoCD will continue reconciling)"

# ---------------------------------------------------------------------------
# Print cluster access info
# ---------------------------------------------------------------------------
print_access_info "Production" "${KUBECONFIG_PATH}"
