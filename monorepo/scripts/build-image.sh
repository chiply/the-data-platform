#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${SCRIPT_DIR}/../.."

# Defaults
VERSION=""
REGISTRY="ghcr.io"
ORG=""
PUSH=false
CACHE_FROM=""
CACHE_TO=""
SCAN=false

usage() {
  cat <<EOF
Usage: $(basename "$0") <service> [options]

Build a container image for a monorepo service.

Arguments:
  service              Service name (must match a component in release-please-config.json)

Options:
  --version VERSION    Image version tag (required)
  --registry REGISTRY  Container registry (default: ghcr.io)
  --org ORG            Registry organisation/owner (required)
  --push               Push image after building
  --cache-from SPEC    Docker buildx cache-from spec
  --cache-to SPEC      Docker buildx cache-to spec
  --scan               Run Trivy vulnerability scan and generate CycloneDX SBOM after build
  -h, --help           Show this help message
EOF
  exit 0
}

SERVICE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)   VERSION="$2"; shift 2 ;;
    --registry)  REGISTRY="$2"; shift 2 ;;
    --org)       ORG="$2"; shift 2 ;;
    --push)      PUSH=true; shift ;;
    --cache-from) CACHE_FROM="$2"; shift 2 ;;
    --cache-to)  CACHE_TO="$2"; shift 2 ;;
    --scan)      SCAN=true; shift ;;
    -h|--help)   usage ;;
    -*)          echo "ERROR: Unknown option: $1" >&2; exit 1 ;;
    *)
      if [ -z "$SERVICE" ]; then
        SERVICE="$1"; shift
      else
        echo "ERROR: Unexpected argument: $1" >&2; exit 1
      fi
      ;;
  esac
done

if [ -z "$SERVICE" ]; then
  echo "ERROR: Service name is required" >&2
  exit 1
fi

if [ -z "$VERSION" ]; then
  echo "ERROR: --version is required" >&2
  exit 1
fi

if [ -z "$ORG" ]; then
  echo "ERROR: --org is required" >&2
  exit 1
fi

# Resolve component path from release-please-config.json
CONFIG_FILE="${REPO_ROOT}/release-please-config.json"
if [ ! -f "$CONFIG_FILE" ]; then
  echo "ERROR: ${CONFIG_FILE} not found" >&2
  exit 1
fi

COMPONENT_PATH=$(jq -r --arg comp "$SERVICE" \
  '.packages | to_entries[] | select(.value.component == $comp) | .key' \
  "$CONFIG_FILE")

if [ -z "$COMPONENT_PATH" ] || [ "$COMPONENT_PATH" = "null" ]; then
  echo "ERROR: No package found with component '${SERVICE}' in release-please-config.json" >&2
  exit 1
fi

DOCKERFILE="${REPO_ROOT}/${COMPONENT_PATH}/Dockerfile"
if [ ! -f "$DOCKERFILE" ]; then
  echo "ERROR: No Dockerfile found at ${DOCKERFILE}" >&2
  exit 1
fi

IMAGE_REF="${REGISTRY}/${ORG}/${SERVICE}:${VERSION}"
echo "Building image: ${IMAGE_REF}"
echo "  Context: ${REPO_ROOT}/${COMPONENT_PATH}"

# Assemble docker buildx build command
BUILD_CMD=(docker buildx build)
BUILD_CMD+=(--tag "${IMAGE_REF}")
BUILD_CMD+=(--tag "${REGISTRY}/${ORG}/${SERVICE}:latest")

if [ -n "$CACHE_FROM" ]; then
  BUILD_CMD+=(--cache-from "$CACHE_FROM")
fi

if [ -n "$CACHE_TO" ]; then
  BUILD_CMD+=(--cache-to "$CACHE_TO")
fi

if [ "$PUSH" = true ]; then
  BUILD_CMD+=(--push)
else
  BUILD_CMD+=(--load)
fi

BUILD_CMD+=("${REPO_ROOT}/${COMPONENT_PATH}")

"${BUILD_CMD[@]}"

echo "Image built successfully: ${IMAGE_REF}"

# Optional scanning with Trivy
if [ "$SCAN" = true ]; then
  if ! command -v trivy &>/dev/null; then
    echo "WARNING: trivy is not installed — skipping scan and SBOM generation." >&2
    echo "  Install: https://aquasecurity.github.io/trivy/latest/getting-started/installation/" >&2
    exit 0
  fi

  echo ""
  echo "=== Trivy Vulnerability Scan ==="
  echo "Scanning ${IMAGE_REF} for CRITICAL and HIGH vulnerabilities..."
  trivy image --severity CRITICAL,HIGH --exit-code 1 "${IMAGE_REF}"

  SBOM_FILE="sbom-${SERVICE}-${VERSION}.cdx.json"
  echo ""
  echo "=== CycloneDX SBOM Generation ==="
  echo "Generating SBOM: ${SBOM_FILE}"
  trivy image --format cyclonedx --output "${SBOM_FILE}" "${IMAGE_REF}"
  echo "SBOM written to ${SBOM_FILE}"
fi
