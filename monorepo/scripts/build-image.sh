#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS] <service-name>

Build a container image for a service.

Arguments:
  service-name    Name of the service (must match a component in release-please-config.json)

Options:
  -v, --version VERSION   Image version tag (default: dev)
  -r, --registry REGISTRY Container registry (default: ghcr.io)
  -o, --org ORG           Registry org/repo (default: derived from git remote)
  -p, --push              Push image to registry after build
  --cache-from CACHE      Docker cache-from spec (can be repeated)
  --cache-to CACHE        Docker cache-to spec (can be repeated)
  -s, --scan              Run Trivy vulnerability scan and generate CycloneDX SBOM (requires trivy)
  -h, --help              Show this help message

Examples:
  $(basename "$0") schema-registry
  $(basename "$0") -v 1.2.3 --push schema-registry
  $(basename "$0") -v 1.2.3 --scan schema-registry
  $(basename "$0") -v 1.2.3 --cache-from type=gha --cache-to type=gha,mode=max schema-registry
EOF
  exit "${1:-0}"
}

# Prerequisite check
for cmd in docker jq; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: Required tool '$cmd' is not installed." >&2
    exit 1
  fi
done

# Defaults
VERSION="dev"
REGISTRY="ghcr.io"
ORG=""
PUSH=false
SCAN=false
CACHE_FROM_ARGS=()
CACHE_TO_ARGS=()

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    -v|--version)
      VERSION="$2"
      shift 2
      ;;
    -r|--registry)
      REGISTRY="$2"
      shift 2
      ;;
    -o|--org)
      ORG="$2"
      shift 2
      ;;
    -p|--push)
      PUSH=true
      shift
      ;;
    -s|--scan)
      SCAN=true
      shift
      ;;
    --cache-from)
      CACHE_FROM_ARGS+=("--cache-from" "$2")
      shift 2
      ;;
    --cache-to)
      CACHE_TO_ARGS+=("--cache-to" "$2")
      shift 2
      ;;
    -h|--help)
      usage
      ;;
    -*)
      echo "ERROR: Unknown option: $1" >&2
      exit 1
      ;;
    *)
      SERVICE_NAME="$1"
      shift
      ;;
  esac
done

if [ -z "${SERVICE_NAME:-}" ]; then
  echo "ERROR: Service name is required" >&2
  usage 1
fi

# Derive org from git remote if not provided
if [ -z "$ORG" ]; then
  ORG=$(git -C "$REPO_ROOT" remote get-url origin 2>/dev/null \
    | sed -E 's#.+github\.com[:/]##; s#\.git$##' || true)
  if [ -z "$ORG" ]; then
    echo "ERROR: Could not derive org from git remote. Use --org to specify." >&2
    exit 1
  fi
fi

# Resolve component path from release-please-config.json
CONFIG_FILE="${REPO_ROOT}/release-please-config.json"
if [ ! -f "$CONFIG_FILE" ]; then
  echo "ERROR: ${CONFIG_FILE} not found" >&2
  exit 1
fi

COMPONENT_PATH=$(jq -r --arg comp "$SERVICE_NAME" \
  '.packages | to_entries[] | select(.value.component == $comp) | .key' \
  "$CONFIG_FILE")

if [ -z "$COMPONENT_PATH" ] || [ "$COMPONENT_PATH" = "null" ]; then
  echo "ERROR: No package found with component '${SERVICE_NAME}' in release-please-config.json" >&2
  exit 1
fi

DOCKERFILE_PATH="${REPO_ROOT}/${COMPONENT_PATH}/Dockerfile"
MONOREPO_DIR="${REPO_ROOT}/monorepo"

# Detect build context from Dockerfile comment (e.g. "# Build context: monorepo/")
# Falls back to the component directory if no marker is found
CONTEXT_HINT=$(grep -m1 '# Build context:' "$DOCKERFILE_PATH" 2>/dev/null | sed 's/.*# Build context: *//' | tr -d '[:space:]' || true)
if [ "$CONTEXT_HINT" = "monorepo/" ]; then
  CONTEXT_DIR="${MONOREPO_DIR}"
else
  CONTEXT_DIR="${REPO_ROOT}/${COMPONENT_PATH}"
fi

if [ ! -f "$DOCKERFILE_PATH" ]; then
  echo "ERROR: No Dockerfile found at ${DOCKERFILE_PATH}" >&2
  exit 1
fi

# Build tdp-python-base if not already available
BASE_IMAGE_TAG="tdp-python-base"
BASE_DOCKERFILE="${MONOREPO_DIR}/services/Dockerfile.base"
BASE_CONTEXT_ARGS=()

if [ "$PUSH" = true ]; then
  # CI mode: the docker-container buildx driver cannot access local daemon images.
  # Push the base image to the registry and use --build-context to redirect the
  # unqualified FROM name so buildkit resolves it from the registry.
  BASE_REGISTRY_TAG="${REGISTRY}/${ORG}/tdp-python-base:latest"
  if [ -f "$BASE_DOCKERFILE" ]; then
    echo "Building and pushing base image: ${BASE_REGISTRY_TAG}"
    docker buildx build \
      --tag "${BASE_REGISTRY_TAG}" \
      --file "${BASE_DOCKERFILE}" \
      --push \
      "${MONOREPO_DIR}/services/"
  fi
  BASE_CONTEXT_ARGS+=("--build-context" "tdp-python-base=docker-image://${BASE_REGISTRY_TAG}")
else
  # Local mode: build into the local daemon so FROM tdp-python-base resolves directly.
  if ! docker image inspect "${BASE_IMAGE_TAG}" &>/dev/null; then
    if [ -f "$BASE_DOCKERFILE" ]; then
      echo "Building base image: ${BASE_IMAGE_TAG}"
      docker buildx build --tag "${BASE_IMAGE_TAG}" --file "${BASE_DOCKERFILE}" --load "${MONOREPO_DIR}/services/"
    else
      echo "WARNING: ${BASE_DOCKERFILE} not found, skipping base image build" >&2
    fi
  fi
fi

IMAGE_NAME="${REGISTRY}/${ORG}/${SERVICE_NAME}"
IMAGE_TAG="${IMAGE_NAME}:${VERSION}"

echo "Building image: ${IMAGE_TAG}"
echo "  Context: ${CONTEXT_DIR}"
echo "  Dockerfile: ${DOCKERFILE_PATH}"

BUILD_ARGS=(
  "docker" "buildx" "build"
  "--tag" "${IMAGE_TAG}"
  "--file" "${DOCKERFILE_PATH}"
)

# Redirect tdp-python-base to registry image when in CI/push mode
if [ ${#BASE_CONTEXT_ARGS[@]} -gt 0 ]; then
  BUILD_ARGS+=("${BASE_CONTEXT_ARGS[@]}")
fi

# Add cache args if provided
if [ ${#CACHE_FROM_ARGS[@]} -gt 0 ]; then
  BUILD_ARGS+=("${CACHE_FROM_ARGS[@]}")
fi
if [ ${#CACHE_TO_ARGS[@]} -gt 0 ]; then
  BUILD_ARGS+=("${CACHE_TO_ARGS[@]}")
fi

if [ "$PUSH" = true ]; then
  BUILD_ARGS+=("--push")
else
  BUILD_ARGS+=("--load")
fi

BUILD_ARGS+=("${CONTEXT_DIR}")

"${BUILD_ARGS[@]}"

echo "Successfully built: ${IMAGE_TAG}"

# ---------------------------------------------------------------------------
# Optional: Trivy vulnerability scan and CycloneDX SBOM generation
# ---------------------------------------------------------------------------

if [ "$SCAN" = true ]; then
  if ! command -v trivy &>/dev/null; then
    echo "WARNING: trivy not found — skipping vulnerability scan and SBOM generation." >&2
    echo "Install: https://aquasecurity.github.io/trivy/latest/getting-started/installation/"
  else
    echo ""
    echo "Running Trivy vulnerability scan (CRITICAL/HIGH)..."
    trivy image --severity CRITICAL,HIGH --exit-code 1 "${IMAGE_TAG}" || {
      echo "ERROR: Trivy found CRITICAL/HIGH vulnerabilities in ${IMAGE_TAG}" >&2
      exit 1
    }

    SBOM_FILE="sbom-${SERVICE_NAME}-${VERSION}.cdx.json"
    echo "Generating CycloneDX SBOM: ${SBOM_FILE}"
    trivy image --format cyclonedx --output "${SBOM_FILE}" "${IMAGE_TAG}"
    echo "SBOM written to: ${SBOM_FILE}"
  fi
fi
