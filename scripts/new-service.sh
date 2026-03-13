#!/bin/bash
# scripts/new-service.sh — wraps copier copy with correct defaults
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
TEMPLATE_PATH="${REPO_ROOT}/enterprise-patterns/python/enterprise-pattern-fastapi"

# Verify working tree is clean (required for copier update to work correctly later)
if ! git diff --quiet HEAD -- enterprise-patterns/; then
  echo "ERROR: Uncommitted changes in enterprise-patterns/. Commit first." >&2
  exit 1
fi

SERVICE_NAME="${1:?Usage: scripts/new-service.sh <service-name>}"
DEST="${REPO_ROOT}/monorepo/services/${SERVICE_NAME}"

if [ -e "${DEST}" ]; then
  echo "ERROR: ${DEST} already exists. Remove it first or use 'copier update' to update." >&2
  exit 1
fi

copier copy --trust --vcs-ref HEAD \
  "${TEMPLATE_PATH}" "${DEST}" \
  --data service_name="${SERVICE_NAME}"

# Generate lockfile and create virtual environment
echo ""
echo "Setting up development environment..."
cd "${DEST}"
uv lock
uv sync --extra dev
echo "Done — virtual environment created at ${DEST}/.venv"

echo ""
echo "=== Post-generation checklist ==="
echo ""
echo "  [ ] Set up Helm chart at deploy/charts/${SERVICE_NAME}/"
echo "  [ ] Register in release-please-config.json and .release-please-manifest.json"
echo "  [ ] Run 'bazel run //:gazelle' to generate BUILD files"
echo "  [ ] Review and customize generated files"
echo ""
echo "Quick start:"
echo "  cd monorepo/services/${SERVICE_NAME}"
echo "  uv run pytest              # run tests"
echo "  uv run uvicorn ${SERVICE_NAME//-/_}.main:app --reload  # start dev server"
echo ""
