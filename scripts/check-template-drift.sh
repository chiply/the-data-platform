#!/bin/bash
set -euo pipefail

DRIFT_FOUND=0

for service_dir in monorepo/services/*/; do
  if [ -f "${service_dir}/.copier-answers.yml" ]; then
    echo "Checking ${service_dir}..."
    cd "${service_dir}"
    if ! copier update --trust --vcs-ref HEAD --pretend --skip-answered 2>/dev/null | grep -q "No changes"; then
      echo "WARNING: ${service_dir} has template drift"
      DRIFT_FOUND=1
    fi
    cd - > /dev/null
  fi
done

if [ "$DRIFT_FOUND" -eq 1 ]; then
  echo ""
  echo "Some services have drifted from the template. Run 'copier update --trust --vcs-ref HEAD' in each service directory to review."
  echo "Note: drift is expected for services with custom extensions (e.g. additional routers)."
  exit 0
fi

echo "All services are up to date with the template."
