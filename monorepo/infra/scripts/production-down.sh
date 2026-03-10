#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_NAME="production"

# shellcheck source=_helpers.sh
source "${SCRIPT_DIR}/_helpers.sh"

# ---------------------------------------------------------------------------
# Tear down the production environment
# ---------------------------------------------------------------------------
destroy_stack "${PLATFORM_DIR}" "platform infrastructure (tdp-platform / ${STACK_NAME})" "${STACK_NAME}"

echo ""
destroy_stack "${CLUSTER_DIR}" "cluster infrastructure (tdp-cluster / ${STACK_NAME})" "${STACK_NAME}"

echo ""
echo "Production environment has been torn down."
