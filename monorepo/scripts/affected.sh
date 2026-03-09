#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONOREPO_ROOT="${SCRIPT_DIR}/.."
cd "${MONOREPO_ROOT}"

# Base branch: CLI arg > CI_BASE_BRANCH env var > "main"
BASE_BRANCH="${1:-${CI_BASE_BRANCH:-main}}"

# Find the monorepo prefix relative to the git repo root
GIT_ROOT="$(git rev-parse --show-toplevel)"
# Compute relative path from git root to monorepo root (portable, no GNU realpath)
MONOREPO_ABS="$(cd "${MONOREPO_ROOT}" && pwd -P)"
GIT_ROOT_ABS="$(cd "${GIT_ROOT}" && pwd -P)"
MONOREPO_PREFIX="${MONOREPO_ABS#"${GIT_ROOT_ABS}/"}"
if [[ "${MONOREPO_PREFIX}" == "${MONOREPO_ABS}" ]]; then
  # Monorepo root IS the git root
  MONOREPO_PREFIX=""
fi

# Get changed files relative to git root, filtered to monorepo tree
MERGE_BASE="$(git merge-base "${BASE_BRANCH}" HEAD 2>/dev/null || echo "${BASE_BRANCH}")"
if [[ -n "${MONOREPO_PREFIX}" ]]; then
  CHANGED_FILES="$(git -C "${GIT_ROOT}" diff --name-only "${MERGE_BASE}" -- "${MONOREPO_PREFIX}/" 2>/dev/null || true)"
else
  CHANGED_FILES="$(git diff --name-only "${MERGE_BASE}" 2>/dev/null || true)"
fi

if [[ -z "${CHANGED_FILES}" ]]; then
  echo "No changed files detected." >&2
  exit 0
fi

# Strip monorepo prefix to get paths relative to monorepo root
if [[ -n "${MONOREPO_PREFIX}" ]]; then
  RELATIVE_FILES="$(echo "${CHANGED_FILES}" | sed "s|^${MONOREPO_PREFIX}/||")"
else
  RELATIVE_FILES="${CHANGED_FILES}"
fi

# Scoping rules: check for full-CI triggers
if echo "${RELATIVE_FILES}" | grep -q '^scripts/'; then
  echo "scripts/ changed — triggering full CI run" >&2
  echo "//..."
  exit 0
fi

# Collect Bazel packages from changed files
declare -A SEEN_PACKAGES
PACKAGES=()

_add_package() {
  local pkg="$1"
  if [[ -z "${SEEN_PACKAGES[$pkg]+x}" ]]; then
    SEEN_PACKAGES[$pkg]=1
    PACKAGES+=("${pkg}")
  fi
}

while IFS= read -r file; do
  # Find the Bazel package directory (nearest parent with a BUILD or BUILD.bazel)
  dir="$(dirname "${file}")"
  while [[ "${dir}" != "." ]]; do
    if [[ -f "${dir}/BUILD.bazel" ]] || [[ -f "${dir}/BUILD" ]]; then
      _add_package "//${dir}"
      break
    fi
    dir="$(dirname "${dir}")"
  done
  # Check root BUILD
  if [[ "${dir}" == "." ]]; then
    if [[ -f "BUILD.bazel" ]] || [[ -f "BUILD" ]]; then
      _add_package "//."
    fi
  fi
done <<< "${RELATIVE_FILES}"

if [[ ${#PACKAGES[@]} -eq 0 ]]; then
  echo "No Bazel packages affected." >&2
  exit 0
fi

# Build the set() argument for bazel query
SET_ARGS=""
for pkg in "${PACKAGES[@]}"; do
  # Convert //dir to //dir:all for the set
  if [[ "${pkg}" == "//." ]]; then
    SET_ARGS="${SET_ARGS} //:all"
  else
    SET_ARGS="${SET_ARGS} ${pkg}:all"
  fi
done
SET_ARGS="${SET_ARGS# }"  # trim leading space

echo "Querying affected targets for packages: ${SET_ARGS}" >&2

# Use bazel query to find reverse dependencies
AFFECTED="$(bazel query "rdeps(//..., set(${SET_ARGS}))" 2>/dev/null || true)"

if [[ -z "${AFFECTED}" ]]; then
  echo "No affected targets found via bazel query." >&2
  exit 0
fi

# Output one target per line
echo "${AFFECTED}"
