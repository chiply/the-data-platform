#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}/.."

TARGET="${1:-//...}"

echo "Testing ${TARGET}..."
set +e
bazel test "${TARGET}"
status=$?
set -e

if [ "$status" -eq 0 ]; then
  exit 0
elif [ "$status" -eq 4 ]; then
  echo "No Bazel test targets were found for '${TARGET}'; treating as success."
  exit 0
else
  exit "$status"
fi
