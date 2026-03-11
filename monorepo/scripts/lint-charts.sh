#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}/.."

CHARTS_DIR="deploy/charts"
FAILED=0

if [ ! -d "$CHARTS_DIR" ]; then
  echo "No charts directory found at ${CHARTS_DIR}"
  exit 0
fi

for chart_yaml in "${CHARTS_DIR}"/*/Chart.yaml; do
  chart_dir="$(dirname "$chart_yaml")"
  chart_name="$(basename "$chart_dir")"

  # Skip library charts
  chart_type="$(grep -E '^type:' "$chart_yaml" | awk '{print $2}' || true)"
  if [ "$chart_type" = "library" ]; then
    echo "SKIP: ${chart_name} (library chart)"
    continue
  fi

  echo "=== Linting chart: ${chart_name} ==="

  # Update dependencies (needed for charts with file:// deps)
  echo "  Updating dependencies..."
  if ! helm dependency update "$chart_dir" 2>&1; then
    echo "FAIL: ${chart_name} - helm dependency update failed"
    FAILED=1
    continue
  fi

  # Helm lint with default values
  echo "  Running helm lint..."
  if ! helm lint "$chart_dir" 2>&1; then
    echo "FAIL: ${chart_name} - helm lint failed"
    FAILED=1
  fi

  # Helm template with default values
  echo "  Running helm template (default values)..."
  if ! helm template "$chart_name" "$chart_dir" > /dev/null 2>&1; then
    echo "FAIL: ${chart_name} - helm template failed with default values"
    FAILED=1
  fi

  # Helm template for each environment values file
  for values_file in "${chart_dir}"/values-*.yaml; do
    [ -f "$values_file" ] || continue
    env_name="$(basename "$values_file" .yaml | sed 's/^values-//')"
    echo "  Running helm template (env: ${env_name})..."
    if ! helm template "$chart_name" "$chart_dir" \
      -f "$chart_dir/values.yaml" \
      -f "$values_file" > /dev/null 2>&1; then
      echo "FAIL: ${chart_name} - helm template failed for env ${env_name}"
      FAILED=1
    else
      echo "  OK: helm template (env: ${env_name})"
    fi
  done

  # Validate values.schema.json if present
  if [ -f "${chart_dir}/values.schema.json" ]; then
    echo "  Validating values.schema.json..."
    # helm lint already validates against schema, but we verify the JSON is well-formed
    if ! python3 -c "import json, sys; json.load(open(sys.argv[1]))" "${chart_dir}/values.schema.json" 2>&1; then
      echo "FAIL: ${chart_name} - values.schema.json is not valid JSON"
      FAILED=1
    else
      echo "  OK: values.schema.json is valid JSON"
    fi

    # Lint with schema validation for each environment values file
    for values_file in "${chart_dir}"/values-*.yaml; do
      [ -f "$values_file" ] || continue
      env_name="$(basename "$values_file" .yaml | sed 's/^values-//')"
      echo "  Validating schema for env: ${env_name}..."
      if ! helm lint "$chart_dir" \
        -f "$chart_dir/values.yaml" \
        -f "$values_file" 2>&1; then
        echo "FAIL: ${chart_name} - schema validation failed for env ${env_name}"
        FAILED=1
      else
        echo "  OK: schema validation (env: ${env_name})"
      fi
    done
  fi

  echo "  Done: ${chart_name}"
  echo ""
done

if [ "$FAILED" -ne 0 ]; then
  echo "FAIL: One or more charts failed linting"
  exit 1
fi

echo "All charts passed linting"
