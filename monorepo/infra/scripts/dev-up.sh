#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_NAME="dev"
KUBECONFIG_PATH=~/.kube/tdp-dev.yaml

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
configure_config_if_missing "${CLUSTER_DIR}" "${STACK_NAME}" "tdp-cluster:clusterName" "tdp-dev"

pushd "${PLATFORM_DIR}" >/dev/null
ORG_NAME=$(pulumi whoami 2>/dev/null || echo "organization")
popd >/dev/null
configure_config_if_missing "${PLATFORM_DIR}" "${STACK_NAME}" "tdp-platform:clusterStackRef" "${ORG_NAME}/tdp-cluster/${STACK_NAME}"

# ---------------------------------------------------------------------------
# Bring up the dev environment
# Secrets (linode:token, linodeRootPassword, grafanaAdminPassword) are
# provided by the Pulumi ESC environment "tdp/dev" imported in Pulumi.dev.yaml.
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

echo "==> Applying ArgoCD AppProjects, RBAC, and network policies..."
kubectl --kubeconfig "${KUBECONFIG_PATH}" apply -f "${DEPLOY_DIR}/argocd/appproject.yaml"
kubectl --kubeconfig "${KUBECONFIG_PATH}" apply -f "${DEPLOY_DIR}/argocd/appproject-bootstrap.yaml"
kubectl --kubeconfig "${KUBECONFIG_PATH}" apply -f "${DEPLOY_DIR}/argocd/rbac/"
kubectl --kubeconfig "${KUBECONFIG_PATH}" apply -f "${DEPLOY_DIR}/argocd/network-policies/"

echo "==> Applying ArgoCD root App-of-Apps for dev..."
kubectl --kubeconfig "${KUBECONFIG_PATH}" apply -f "${DEPLOY_DIR}/argocd/root-app-dev.yaml"

echo "==> Waiting for ArgoCD to sync dev apps..."
kubectl --kubeconfig "${KUBECONFIG_PATH}" wait --for=jsonpath='{.status.sync.status}'=Synced \
  application/tdp-dev-apps -n argocd --timeout=120s 2>/dev/null || \
  echo "  (sync not yet complete — ArgoCD will continue reconciling)"

# ---------------------------------------------------------------------------
# Print cluster access info
# ---------------------------------------------------------------------------
print_access_info "Dev" "${KUBECONFIG_PATH}"

# Dev-specific: print nip.io URL hints
CLUSTER_IP=$(kubectl --kubeconfig "${KUBECONFIG_PATH}" get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="ExternalIP")].address}' 2>/dev/null || echo "<cluster-ip>")
echo "Dev nip.io URLs (once services are deployed):"
echo "  http://<service>.${CLUSTER_IP}.nip.io"
echo ""
