#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

CLUSTER_DIR="${INFRA_DIR}/cluster"
PLATFORM_DIR="${INFRA_DIR}/platform"
STACK_NAME="local"

# ---------------------------------------------------------------------------
# Tear down the local environment
# ---------------------------------------------------------------------------
echo "==> Destroying platform infrastructure (tdp-platform / ${STACK_NAME})..."
pushd "${PLATFORM_DIR}" >/dev/null
pulumi destroy --stack "${STACK_NAME}" --yes
popd >/dev/null

echo ""
echo "==> Destroying cluster infrastructure (tdp-cluster / ${STACK_NAME})..."
pushd "${CLUSTER_DIR}" >/dev/null
pulumi destroy --stack "${STACK_NAME}" --yes
popd >/dev/null

echo ""
echo "Local environment has been torn down."
