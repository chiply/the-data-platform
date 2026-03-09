#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}/.."

TARGET="${1:-//tools/architecture-diagram/...}"

echo "Rendering D2 diagrams (${TARGET})..."
bazel build "${TARGET}"

echo ""
echo "SVG outputs:"
bazel cquery "${TARGET}" --output=files 2>/dev/null || true
