#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}/.."

TARGET="${1:-//tools/architecture-diagram/...}"

echo "Rendering diagrams (${TARGET})..."
bazel build "${TARGET}"
